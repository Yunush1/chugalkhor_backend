const logger = require('../../utils/logger');
const { isUserInRoom } = require('../../utils/roomUtils');

/**
 * handleCallEvents
 *
 * Key design: clients only ever use userId — never socketId.
 * Server resolves userId → socketId internally via socketManager.userSockets.
 *
 * Owns:
 *   wc:get_token       — token generation + room membership check
 *   wc:offer           — WebRTC offer relay   (targetUserId → resolved to socketId)
 *   wc:answer          — WebRTC answer relay
 *   wc:ice_candidate   — ICE candidate relay
 *
 * signaling.handle() in SocketManager owns:
 *   wc:initiate_call, wc:join_call, wc:leave_call,
 *   wc:end_call, wc:mute_participant, wc:raise_hand
 */
function handleCallEvents(socketManager, socket) {
    const { userId, name } = socket.user;

    // ── wc:get_token ──────────────────────────────────────────────────────────
    // Client emits this FIRST, before wc:initiate_call or wc:join_call.
    //
    // Payload:  { roomId, callType, callId? }
    //   callId  omit when initiating — server generates one
    //   callId  required when joining — from the wc:incoming_call event
    //
    // Response: { success: true, token }
    //         | { success: false, error }
    socket.on('wc:get_token', async ({ roomId, callType = 'video', callId }, callback) => {
        try {
            logger.info(`[handleCallEvents] wc:get_token userId=${userId} roomId=${roomId} callType=${callType}`);

            if (!roomId) {
                logger.warn(`[handleCallEvents] wc:get_token roomId is required`)
                return callback?.({ success: false, error: 'roomId is required' });
            }
            if (!['audio', 'video'].includes(callType)) {
                logger.warn(`[handleCallEvents] wc:get_token call type must be audio or video`)
                return callback?.({ success: false, error: 'callType must be audio or video' });
            }

            const isMember = await isUserInRoom(roomId, userId);
            if (!isMember) {
                logger.warn(`[handleCallEvents] wc:get_token you are not a member of this room`)
                return callback?.({ success: false, error: 'You are not a member of this room' });
            }

            const token = socketManager.signaling.generateToken({
                userId: userId.toString(),
                roomId: roomId.toString(),
                callId: callId || `call_${roomId}_${Date.now()}`,
                callType,
                role: 'publisher',
            });

            logger.info(`[handleCallEvents] Token generated userId=${userId} roomId=${roomId}`);
            callback?.({ success: true, token });

        } catch (err) {
            logger.error(`[handleCallEvents] wc:get_token error userId=${userId}:`, err);
            callback?.({ success: false, error: 'Failed to generate call token' });
        }
    });

    // ── WebRTC signaling relay ────────────────────────────────────────────────
    // Client sends targetUserId — server resolves it to the actual socketId.
    // This means clients NEVER need to know or track socket IDs.
    //
    // How the client gets targetUserId:
    //   • Initiator:  from wc:participant_joined  → { participant: { userId, name } }
    //   • Joiner:     from wc:join_call callback  → { existingParticipants: [{ userId, name }] }

    // Helper — get the first active socketId for a userId
    function getSocketId(targetUserId) {
        const sockets = socketManager.userSockets.get(targetUserId.toString());
        if (!sockets || sockets.size === 0) return null;
        return [...sockets][0];     // use first active socket for that user
    }

    // ── wc:offer ──────────────────────────────────────────────────────────────
    // Payload: { callId, targetUserId, sdp }
    socket.on('wc:offer', ({ callId, targetUserId, sdp }) => {
        if (!targetUserId || !sdp) return;

        const targetSocketId = getSocketId(targetUserId);
        if (!targetSocketId) {
            logger.warn(`[handleCallEvents] wc:offer — no socket found for userId=${targetUserId}`);
            return;
        }

        logger.info(`[handleCallEvents] wc:offer from=${userId} to=${targetUserId}`);
        socketManager.io.to(targetSocketId).emit('wc:offer', {
            callId,
            sdp,
            fromUserId: userId,
            fromName: name,
        });
    });

    // ── wc:answer ─────────────────────────────────────────────────────────────
    // Payload: { callId, targetUserId, sdp }
    socket.on('wc:answer', ({ callId, targetUserId, sdp }) => {
        if (!targetUserId || !sdp) return;

        const targetSocketId = getSocketId(targetUserId);
        if (!targetSocketId) {
            logger.warn(`[handleCallEvents] wc:answer — no socket found for userId=${targetUserId}`);
            return;
        }

        logger.info(`[handleCallEvents] wc:answer from=${userId} to=${targetUserId}`);
        socketManager.io.to(targetSocketId).emit('wc:answer', {
            callId,
            sdp,
            fromUserId: userId,
        });
    });

    // ── wc:ice_candidate ──────────────────────────────────────────────────────
    // Payload: { callId, targetUserId, candidate }
    socket.on('wc:ice_candidate', ({ callId, targetUserId, candidate }) => {
        if (!targetUserId || !candidate) return;

        const targetSocketId = getSocketId(targetUserId);
        if (!targetSocketId) return;    // silent — ICE trickle can tolerate drops

        socketManager.io.to(targetSocketId).emit('wc:ice_candidate', {
            callId,
            candidate,
            fromUserId: userId,
        });
    });
}

module.exports = handleCallEvents;
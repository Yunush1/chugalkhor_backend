const logger = require("../../utils/logger");
const emitSocketError = require("../../utils/socketError");
const MessageService = require("../../services/messageService/MessageService");
const BotReplyService = require("../../services/botService/BotReplyService");
const ConversationOrchestrator = require("../../services/botService/ConversationOrchestrator");
const MessageEmitter = require("../emitters/MessageEmitter");
const { getOnlineUsersInRoom, isUserInRoom } = require("../../utils/roomUtils");
const Enums = require("../../utils/constants");

function handleChatMessageEvents(socketManager, socket) {
    const { userId, name } = socket.user;
    const emitter = new MessageEmitter(socketManager.io);

    // ─── send_message ────────────────────────────────────────────────────────
    socket.on("send_message", async (payload, callback) => {
        try {
            const {
                roomId,
                type = Enums.MESSAGE.TYPE.TEXT,
                content,
                media,
                replyTo,
            } = payload;

            logger.info(`[handleChatMessageEvents] send_message ${JSON.stringify(payload)}`);

            // 1. Validate
            const validationError = MessageService.validate({ roomId, type, content, media });
            if (validationError) {
                return callback?.({ success: false, error: validationError });
            }

            // 2. Cancel any running bot chain — user sent a new message
            ConversationOrchestrator.cancelChain(roomId);

            // 3. Save message to DB
            const { message, messageObj } = await MessageService.sendMessage({
                userId, name, roomId, type, content, media, replyTo
            });

            // 4. Emit to room + ack sender
            emitter.newMessage(roomId, messageObj, userId.toString(), socket.id);
            emitter.messageDelivered(socket, message._id, userId);

            callback?.({ success: true, messageId: message._id, createdAt: message.createdAt });

            // 5. Start bot conversation chain (non-blocking)
            setImmediate(async () => {
                try {
                    await ConversationOrchestrator.orchestrate({
                        roomId,
                        senderId: userId,
                        senderName: name,
                        triggerMessage: content || "",
                        emitter,
                    });
                } catch (err) {
                    logger.error("[Orchestrator] chain failed:", err);
                }
            });

        } catch (err) {
            if (err.message === "NOT_MEMBER") {
                return callback?.({ success: false, error: "You are not a member of this room" });
            }
            logger.error(`send_message error - user ${userId}:`, err);
            callback?.({ success: false, error: "Failed to send message" });
            emitSocketError(socket, "message_error", "Server error while sending message");
        }
    });

    // ─── mark_delivered ──────────────────────────────────────────────────────
    socket.on("mark_delivered", async ({ messageIds, roomId }, callback) => {
        try {
            await MessageService.markDelivered({ messageIds, roomId, userId });

            const roomSockets = await getOnlineUsersInRoom(roomId);
            if (roomSockets.length > 0) {
                emitter.messagesDelivered(roomId, messageIds, userId);
            }

            callback?.({ success: true });
        } catch (err) {
            logger.error("mark_delivered error:", err);
            callback?.({ success: false });
        }
    });

    // ─── mark_seen ───────────────────────────────────────────────────────────
    socket.on("mark_seen", async ({ messageIds, roomId }, callback) => {
        try {
            await MessageService.markSeen({ messageIds, roomId, userId });
            emitter.messagesSeen(roomId, messageIds, userId);
            callback?.({ success: true });
        } catch (err) {
            logger.error("mark_seen error:", err);
            callback?.({ success: false });
        }
    });

    // ─── edit_message ────────────────────────────────────────────────────────
    socket.on("edit_message", async ({ messageId, newContent }, callback) => {
        try {
            const msg = await MessageService.editMessage({ messageId, newContent, userId });
            emitter.messageEdited(msg.roomId, messageId, msg.content, msg.editedAt);
            callback?.({ success: true });
        } catch (err) {
            if (err.message === "NOT_FOUND") {
                return callback?.({ success: false, error: "Message not found or not yours" });
            }
            if (err.message === "INVALID_PAYLOAD") {
                return callback?.({ success: false, error: "Invalid payload" });
            }
            logger.error("edit_message error:", err);
            callback?.({ success: false });
        }
    });

    // ─── rejoin_room ─────────────────────────────────────────────────────────
    socket.on("rejoin_room", async ({ roomId }, callback) => {
        try {
            if (!roomId) return;
            const isMember = await isUserInRoom(roomId, userId);
            if (!isMember) return callback?.({ success: false, error: "Not a member" });

            socket.join(`room_${roomId}`);
            socketManager.addUserToRoomOnline(userId.toString(), roomId.toString());
            logger.info(`[Chat] User ${userId} rejoined room ${roomId}`);
            callback?.({ success: true, message: "Rejoin successfully" });
        } catch (err) {
            logger.error("rejoin_room error:", err);
            callback?.({ success: false });
        }
    });
}

module.exports = handleChatMessageEvents;
const socketManager = require('../config/socket')

// ─── Channel name helper (single source of truth) ─────────────────────────
// Both files must use this — never hardcode "room_" + id inline elsewhere
const roomChannel = (roomId) => `room_${roomId}`;

// ─────────────────────────────────────────────────────────────────────────────

const joinUserSocketsToRoom = (userId, roomId) => {
    const userSockets = socketManager.userSockets.get(userId.toString());

    if (!userSockets || userSockets.size === 0) return;

    const channel = roomChannel(roomId);
    let joinedCount = 0;

    for (const socketId of userSockets) {
        const socket = socketManager.io.sockets.sockets.get(socketId);

        if (socket && !socket.rooms.has(channel)) {
            socket.join(channel);
            joinedCount++;
        }
    }

    if (joinedCount > 0) {
        socketManager.addUserToRoomOnline(userId, roomId);

        // ✅ "user_joined" — same event name as trickle service + frontend hook
        socketManager.io.to(channel).emit("user_joined", {
            roomId: roomId.toString(),
            userId: userId.toString(),
            username: null,   // frontend resolves name from its own cache
            joinedAt: new Date().toISOString(),
        });
    }
};

const removeUserSocketsFromRoom = (targetId, roomId, removedBy) => {
    const targetUserSockets = socketManager.userSockets.get(targetId.toString());

    if (!targetUserSockets) return;

    const channel = roomChannel(roomId);

    for (const socketId of targetUserSockets) {
        const socket = socketManager.io.sockets.sockets.get(socketId);

        if (socket && socket.rooms.has(channel)) {
            socket.leave(channel);

            socket.emit("user_removed_from_room", {
                roomId: roomId.toString(),
                reason: "removed_by_creator",
                removedAt: new Date().toISOString()
            });
        }
    }

    socketManager.removeUserFromRoomOnline(targetId, roomId);

    socketManager.io.to(channel).emit("user_removed", {
        userId: targetId.toString(),
        removedBy: removedBy.toString(),
        removedAt: new Date().toISOString()
    });
};

module.exports = { removeUserSocketsFromRoom, joinUserSocketsToRoom, roomChannel };
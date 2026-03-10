const logger = require("../../utils/logger");

class MessageEmitter {

    constructor(io) {
        this.io = io;
    }

    toRoom(roomId, event, payload, excludeSocketId = null) {
        const target = this.io.to(`room_${roomId}`);
        logger.info(`[Message Emitter] to Room event: ${event}, roomId: ${roomId}`)
        if (excludeSocketId) {
            target.except(excludeSocketId).emit(event, payload);
        } else {
            target.emit(event, payload);
        }
    }

    toSocket(socket, event, payload) {
        socket.emit(event, payload);
    }

    newMessage(roomId, messageObj, senderId, excludeSocketId) {
        logger.info(`[Message Emitter] new_message to Room roomId: ${roomId}`)
        this.toRoom(roomId, "new_message", { message: messageObj, senderId }, excludeSocketId);
    }

    messageDelivered(socket, messageId, userId) {
        this.toSocket(socket, "message_delivered", {
            messageId,
            deliveredTo: [userId],
            deliveredAt: new Date(),
        });
    }

    messagesDelivered(roomId, messageIds, userId) {
        this.toRoom(roomId, "messages_delivered", {
            messageIds, userId, deliveredAt: new Date()
        });
    }

    messagesSeen(roomId, messageIds, userId) {
        this.toRoom(roomId, "messages_seen", {
            messageIds, userId, seenAt: new Date()
        });
    }

    messageEdited(roomId, messageId, newContent, editedAt) {
        this.toRoom(roomId, "message_edited", { messageId, newContent, editedAt });
    }
}

module.exports = MessageEmitter;
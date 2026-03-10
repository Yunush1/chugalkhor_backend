const MessageRepository = require("../../repositories/MessageRepository");
const { isUserInRoom } = require("../../utils/roomUtils");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");

class MessageService {

    static validate({ roomId, type, content, media }) {
        if (!roomId) return "roomId is required";
        if (!Object.values(Enums.MESSAGE.TYPE).includes(type))
            return "Invalid message type";
        if (type !== Enums.MESSAGE.TYPE.TEXT && !media?.url)
            return "Media URL is required for non-text messages";
        return null;
    }

    static async sendMessage({ userId, name, roomId, type, content, media, replyTo }) {
        const isMember = await isUserInRoom(roomId, userId);
        if (!isMember) throw new Error("NOT_MEMBER");

        const message = await MessageRepository.create({
            roomId,
            sender: userId,
            type,
            content: content?.trim() || undefined,
            media: media ? {
                url: media.url,
                thumbnail: media.thumbnail,
                duration: media.duration,
                size: media.size,
            } : undefined,
            replyTo: replyTo || undefined,
        });

        return {
            message,
            messageObj: {
                _id: message._id,
                roomId: message.roomId,
                sender: { userId, name },
                type: message.type,
                content: message.content,
                media: message.media,
                replyTo: message.replyTo,
                isEdited: false,
                createdAt: message.createdAt,
                timestamp: Date.now(),
                seenBy: [],
                deliveredTo: [],
            }
        };
    }

    static async markDelivered({ messageIds, roomId, userId }) {
        if (!Array.isArray(messageIds) || !roomId)
            throw new Error("INVALID_PAYLOAD");
        await MessageRepository.markDelivered(messageIds, roomId, userId);
    }

    static async markSeen({ messageIds, roomId, userId }) {
        if (!Array.isArray(messageIds) || !roomId)
            throw new Error("INVALID_PAYLOAD");
        await MessageRepository.markSeen(messageIds, roomId, userId);
    }

    static async editMessage({ messageId, newContent, userId }) {
        if (!messageId || !newContent?.trim())
            throw new Error("INVALID_PAYLOAD");
        const msg = await MessageRepository.editMessage(messageId, userId, newContent);
        if (!msg) throw new Error("NOT_FOUND");
        return msg;
    }
}

module.exports = MessageService;
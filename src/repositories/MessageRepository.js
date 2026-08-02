const Message = require("../models/message");

class MessageRepository {

    static async create(data) {
        const msg = new Message(data);
        await msg.save();
        return msg;
    }

    static async markDelivered(messageIds, roomId, userId) {
        return Message.updateMany(
            {
                _id: { $in: messageIds },
                roomId,
                "deliveredTo.user": { $ne: userId },
            },
            {
                $push: { deliveredTo: { user: userId, deliveredAt: new Date() } }
            }
        );
    }

    static async markSeen(messageIds, roomId, userId) {
        return Message.updateMany(
            {
                _id: { $in: messageIds },
                roomId,
                "seenBy.user": { $ne: userId },
                sender: { $ne: userId },
            },
            {
                $push: { seenBy: { user: userId, seenAt: new Date() } }
            }
        );
    }

    static async editMessage(messageId, userId, newContent) {
        return Message.findOneAndUpdate(
            { _id: messageId, sender: userId, isDeleted: false },
            { content: newContent.trim(), isEdited: true, editedAt: new Date() },
            { new: true }
        );
    }

    static async getRecentMessages(roomId, limit = 10) {
        return Message.find({ roomId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate("sender", "name username isBot")
            .lean();
    }
}

module.exports = MessageRepository;
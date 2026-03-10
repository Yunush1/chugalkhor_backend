const mongoose = require("mongoose");
const Enums = require("../utils/constants");

const messageSchema = new mongoose.Schema(
    {
        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Room",
            required: true,
            index: true,
        },

        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        type: {
            type: String,
            enum: Object.values(Enums.MESSAGE.TYPE),
            default: Enums.MESSAGE.TYPE.TEXT,
        },

        content: {
            type: String, // message text OR media URL
            trim: true,
        },

        media: {
            url: { type: String },
            thumbnail: { type: String },
            duration: { type: Number }, // for audio/video
            size: { type: Number }, // file size in bytes
        },

        replyTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Message",
            default: null,
        },

        isEdited: {
            type: Boolean,
            default: false,
        },

        editedAt: {
            type: Date,
            default: null,
        },

        isDeleted: {
            type: Boolean,
            default: false,
        },

        deletedFor: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],

        seenBy: [
            {
                user: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                seenAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],

        deliveredTo: [
            {
                user: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                deliveredAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],

        metadata: {
            deviceId: String,
            ipAddress: String,
        },
    },
    { timestamps: true }
);

messageSchema.index({ roomId: 1, createdAt: -1 });

module.exports = mongoose.model("Messages", messageSchema);
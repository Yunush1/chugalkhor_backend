const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
    {
        name: String,
        description: String,
        radius: {
            type: Number,
            default: 5
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        members: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            index: true
        }],
        memberCount: {
            type: Number,
            default: 0
        },
        location: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
            },
            coordinates: {
                type: [Number],
                required: true,
                validate: {
                    validator: (val) =>
                        val.length === 2 &&
                        val[0] >= -180 && val[0] <= 180 &&
                        val[1] >= -90 && val[1] <= 90,
                    message: "Coordinates must be [longitude, latitude]",
                },
            },
        },
        maxMembers: {
            type: Number,
            default: 100
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        expiresAt: {
            type: Date,
            default: () => Date.now() + 2 * 60 * 60 * 1000,
        }
    },
    { timestamps: true }
);

roomSchema.index({ location: "2dsphere" });
roomSchema.index({ createdBy: 1 })
roomSchema.index({ isActive: 1, expiredAt: 1 });

module.exports = mongoose.model("Room", roomSchema);
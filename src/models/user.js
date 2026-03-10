const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Enums = require("../utils/constants");
const { hashPassword } = require("../utils/hashedPassword");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        password: {
            type: String,
            required: true,
            select: false,
            minlength: 6,
        },

        mobileNumber: {
            type: String,
            unique: true,
            sparse: true,
        },

        role: {
            type: Number,
            enum: Object.values(Enums.USER.ROLE),
            default: Enums.USER.ROLE.USER,
        },



        // BOT SUPPORT
        isBot: {
            type: Boolean,
            default: false,
            index: true
        },

        botProfile: {
            personality: {
                type: Number,
                enum: Object.values(Enums.USER.PERSONALITY),
                default: Enums.USER.PERSONALITY.FRIENDLY
            },
            persona: {
                type: String,    // ✅ human-readable prompt injected into Claude
                default: null,
                trim: true
            },
            responseDelay: {
                type: Number,
                default: 1500    // ms
            },
            aiEnabled: {
                type: Boolean,
                default: true
            }
        },

        gender: {
            type: Number,
            enum: Object.values(Enums.USER.GENDER),
            default: Enums.USER.GENDER.FEMALE
        },

        sessionId: {
            type: String,
            default: null,
        },
        isBlock: {
            type: Boolean,
            default: false,
        },
        isDeleted: {
            type: Boolean,
            default: false
        },
        isActive: {
            type: Boolean,
            default: true
        },
        status: {
            type: Number,
            enum: Object.values(Enums.USER.VERIFICATION_STATUS),
            default: Enums.USER.VERIFICATION_STATUS.PENDING,
        },

        location: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
            },

            coordinates: {
                type: [Number],
                required: function () {
                    return !this.isBot;
                },
                validate: {
                    validator: function (val) {
                        if (this.isBot) return true; // skip validation for bots
                        return val.length === 2 &&
                            val[0] >= -180 && val[0] <= 180 &&
                            val[1] >= -90 && val[1] <= 90;
                    },
                    message: "Invalid coordinates format [lng, lat]"
                }
            },
            city: {
                type: String,
                trim: true,
            },
            state: {
                type: String,
                trim: true,
            },
            country: {
                type: String,
                trim: true,
            },
        },
    },
    { timestamps: true }
);

// Geo index
userSchema.index({ location: "2dsphere" }, { sparse: true });

module.exports = mongoose.model("User", userSchema);
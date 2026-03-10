const mongoose = require("mongoose");
const Room = require("../../models/room");
const logger = require("../../utils/logger");
const socketManager = require('../../config/socket');
const { BadRequestError } = require("../../errors");
const { removeUserSocketsFromRoom, joinUserSocketsToRoom } = require("../../socketService/room.socket");
const { removeMemberFromRoom, findRoomById, addMemberToRoom } = require("./room.repository");
const { validateObjectIds } = require("../../utils/idValidator");
const BotService = require("../botService/bot.service");
const RoomTrickleService = require("./room.trickle.service"); // 👈 NEW

class RoomService {

    // ================= CREATE ROOM =================
    static async createRoom({
        name,
        description,
        radius,
        maxMembers = 100,
        userId,
        longitude,
        latitude,
        expiresAt,
    }) {

        try {
            if (!userId) {
                throw new Error("Creator userId is required");
            }
            if (!longitude || !latitude) {
                throw new Error("Location coordinates required");
            }
            const TWO_HOURS = 2 * 60 * 60 * 1000;
            const room = await Room.create({
                name,
                description,
                radius,
                maxMembers: maxMembers || 100,
                createdBy: userId,
                members: [userId],
                location: {
                    type: "Point",
                    coordinates: [longitude, latitude],
                },
                expiresAt: expiresAt || Date.now() + TWO_HOURS
            });

            logger.info(`[RoomService] Room created ${JSON.stringify({ roomId: room._id })}`);

            // ── 🌊 Start trickle: users will join naturally over time ──────────
            RoomTrickleService.startTrickle(
                room._id,
                { longitude, latitude },
                { targetCount: Math.min(8, room.maxMembers) }  // fill up to 8 or maxMembers
            );
            // ──────────────────────────────────────────────────────────────────

            return {
                statusCode: 201,
                room,
            };
        } catch (error) {
            logger.error("[RoomService] createRoom failed", { error: error.message });
            throw error;
        }
    }

    // ================= GET ROOM BY ID =================
    static async getRoomById(roomId) {
        try {
            if (!roomId) {
                logger.error(`[Room service] room id is required: roomID ${roomId}`)
                throw new BadRequestError('Room id is required');
            }
            const room = await Room.findById(roomId)
                .populate("createdBy", "username")
                .populate("members", "username");

            if (!room) {
                throw new Error("Room not found");
            }

            return {
                statusCode: 200,
                room,
            };
        } catch (error) {
            logger.error(`[RoomService] getRoomById failed ${JSON.stringify({ error: error.message })}`);
            throw error;
        }
    }

    static async getNearbyRooms({
        longitude,
        latitude,
        maxDistance = 5000,
        limit = 10,
        lastDistance = 0
    }) {

        const now = new Date();

        const roomsWithDistance = await Room.aggregate([
            {
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [longitude, latitude]
                    },
                    distanceField: "distance",
                    maxDistance,
                    spherical: true,
                    query: {
                        isActive: true,
                        expiresAt: { $gt: now }
                    }
                }
            },

            {
                $match: {
                    distance: { $gte: lastDistance }
                }
            },

            {
                $addFields: {
                    memberCount: {
                        $size: { $ifNull: ["$members", []] }
                    }
                }
            },

            {
                $match: {
                    $expr: {
                        $lt: ["$memberCount", "$maxMembers"]
                    }
                }
            },

            {
                $limit: limit
            },

            {
                $project: {
                    name: 1,
                    description: 1,
                    radius: 1,
                    location: 1,
                    createdBy: 1,
                    members: 1,
                    memberCount: 1,
                    maxMembers: 1,
                    distance: 1,
                    createdAt: 1
                }
            }
        ]);

        let rooms = roomsWithDistance.map(room => {
            const { distance, ...rest } = room;
            return rest;
        });

        // cursor pagination
        const nextCursor =
            roomsWithDistance.length === limit
                ? roomsWithDistance[roomsWithDistance.length - 1].distance
                : null;

        // 🚀 if no rooms exist → create bot seeded room + start trickle
        if (roomsWithDistance.length === 0) {

            const newRoom = await BotService.createRooms({ longitude, latitude });
            const updatedRoom = await BotService.seedBots(newRoom._id);
            rooms = [updatedRoom];

            // ── 🌊 Trickle real users into this auto-created room too ──────────
            RoomTrickleService.startTrickle(
                newRoom._id,
                { longitude, latitude },
                { targetCount: 6 }
            );
            // ──────────────────────────────────────────────────────────────────
        }

        return {
            statusCode: 200,
            rooms,
            nextCursor,
            hasMore: nextCursor !== null
        };
    }

    static async getRoomsByCreatedBy({ createdBy, page = 1, limit = 10 }) {
        logger.info(`[RoomService] getRoomsByCreatedBy ${createdBy, page, limit}`)
        try {
            const skip = (page - 1) * limit;

            const [rooms, total] = await Promise.all([
                Room.find({ createdBy, isActive: true })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Room.countDocuments({ createdBy, isActive: true }),
            ]);
            return {
                success: true,
                rooms,
                pagination: {
                    total,
                    page,
                    pages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            logger.error("[RoomService] getRoomsByCreatedBy failed", {
                error: error.message,
            });
            throw error;
        }
    }

    static async leaveRoom({ roomId, userId }) {
        try {
            await Room.updateOne(
                { _id: roomId },
                { $pull: { members: userId } }
            );
            
            return {
                statusCode: 200,
                message: "Left room successfully",
            };
        } catch (error) {
            logger.error("[RoomService] leaveRoom failed", { error: error.message });
            throw error;
        }
    }

    static async deleteRoom({ roomId, userId }) {
        try {
            const room = await Room.findById(roomId);

            if (!room) throw new Error("Room not found");

            if (!room.createdBy.equals(userId)) {
                throw new Error("Unauthorized to delete room");
            }

            room.isActive = false;
            await room.save();

            // ── 🛑 Stop trickle when room is deleted ──────────────────────────
            RoomTrickleService.stopTrickle(roomId);
            // ──────────────────────────────────────────────────────────────────

            return {
                statusCode: 200,
                message: "Room deleted successfully",
            };
        } catch (error) {
            logger.error("[RoomService] deleteRoom failed", { error: error.message });
            throw error;
        }
    }

    static async getAllUserByRoom({ roomId }) {
        try {
            if (!mongoose.Types.ObjectId.isValid(roomId)) {
                logger.error('[Room service] room id is required')
                throw new Error("Invalid room ID format");
            }

            const room = await Room.aggregate([
                { $match: { _id: new mongoose.Types.ObjectId(roomId), isActive: true } },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'members',
                        foreignField: '_id',
                        as: 'populatedMembers',
                        pipeline: [
                            { $match: { isActive: true } },
                            { $project: { username: 1, name: 1 } }
                        ]
                    }
                },
                { $project: { members: '$populatedMembers', memberCount: { $size: "$populatedMembers" } } }
            ]);
            if (!room) {
                logger.error('[Room service] Room not found or has been deactivated')
                throw new BadRequestError("Room not found or has been deactivated");
            }
            const users = room?.[0].members.filter(user => user != null);

            return {
                statusCode: 200,
                users: users.map(user => {
                    const id = user._id;
                    const cleanId =
                        typeof id === 'string' ? id :
                            id instanceof mongoose.Types.ObjectId ? id.toString() :
                                id?.toHexString?.() || String(id || '');

                    return {
                        _id: cleanId,
                        name: user.name,
                        username: user.username || user.name || null,
                    };
                }),
                count: room?.[0]?.memberCount,
                roomId: roomId.toString()
            };

        } catch (error) {
            logger.error("[RoomService] getAllUsersByRoom failed", {
                roomId,
                error: error.message,
                stack: error.stack?.substring(0, 300)
            });

            if (error.message.includes("Invalid") || error.message.includes("not found")) {
                return {
                    statusCode: 404,
                    message: error.message
                };
            }

            return {
                statusCode: 500,
                message: "Failed to fetch room members"
            };
        }
    }

    static async cleanupExpiredRooms() {
        try {
            const now = new Date();
            const result = await Room.updateMany(
                {
                    expiresAt: { $lte: now },
                    isActive: true
                },
                {
                    $set: { isActive: false }
                }
            );
            logger.info(`[RoomService] Expired rooms cleaned: ${JSON.stringify({
                cleanedRooms: result.modifiedCount
            })}`);

        } catch (error) {

            logger.error(`[RoomService] cleanupExpiredRooms failed ${JSON.stringify({
                error: error.message,
            })}`);

        }
    }

    static async joinRoom({ roomId, userId }) {

        validateObjectIds(roomId, userId);

        const room = await findRoomById(roomId);

        if (!room) throw new Error("Room not found");

        if (room.maxMembers && room.members.length >= room.maxMembers) {
            throw new Error("Room is full");
        }

        const alreadyMember = room.members.some(id => id.toString() === userId);

        if (!alreadyMember) {
            await addMemberToRoom(room, userId);
        }

        joinUserSocketsToRoom(userId, roomId);

        return {
            statusCode: 200,
            message: "Joined room successfully"
        };
    }

    static async removeUserFromRoom({ roomId, userId, targetId }) {

        validateObjectIds(roomId, userId, targetId);

        const room = await findRoomById(roomId);

        if (!room) throw new Error("Room not found");

        if (!room.createdBy.equals(userId)) {
            throw new Error("Only creator can remove members");
        }

        await removeMemberFromRoom(roomId, targetId);

        removeUserSocketsFromRoom(targetId, roomId, userId);

        return {
            statusCode: 200,
            message: "User removed successfully"
        };
    }
}

module.exports = RoomService;
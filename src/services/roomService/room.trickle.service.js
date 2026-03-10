const logger = require("../../utils/logger");
const socketManager = require("../../config/socket");
const { addMemberToRoom, findRoomById } = require("./room.repository");
const BotService = require("../botService/bot.service");
const User = require("../../models/user");
const Room = require("../../models/room");
const { roomChannel } = require("../../socketService/room.socket"); // ✅ shared channel helper

// ─── Config ────────────────────────────────────────────────────────────────
const TRICKLE_CONFIG = {
    MIN_DELAY_MS: 8_000,       // minimum 8 seconds between joins
    MAX_DELAY_MS: 45_000,      // maximum 45 seconds between joins
    MIN_REAL_RATIO: 0.4,       // try to keep at least 40% real users
    NEARBY_RADIUS_M: 8_000,    // radius to search for real nearby users
    SPARSE_THRESHOLD: 3,       // refill if room has fewer than this many members
    MAX_TRICKLE_MEMBERS: 8,    // stop trickle once room has this many members
};

// Active trickle jobs: roomId → timeout handle
const _activeJobs = new Map();

class RoomTrickleService {

   
    static startTrickle(roomId, location, opts = {}) {
        const roomIdStr = roomId.toString();

        if (_activeJobs.has(roomIdStr)) {
            logger.info(`[TrickleService] Trickle already running for room ${roomIdStr}`);
            return;
        }

        const targetCount = opts.targetCount ?? TRICKLE_CONFIG.MAX_TRICKLE_MEMBERS;
        logger.info(`[TrickleService] Starting trickle for room ${roomIdStr}, target=${targetCount}`);

        this._scheduleNext(roomIdStr, location, targetCount);
    }

    /**
     * Stop any active trickle for a room (e.g. when room is deleted).
     * @param {string} roomId
     */
    static stopTrickle(roomId) {
        const roomIdStr = roomId.toString();
        const handle = _activeJobs.get(roomIdStr);
        if (handle) {
            clearTimeout(handle);
            _activeJobs.delete(roomIdStr);
            logger.info(`[TrickleService] Trickle stopped for room ${roomIdStr}`);
        }
    }

    /**
     * Check all active rooms and refill sparse ones.
     * Call this on a cron (e.g. every 2 minutes).
     */
    static async refillSparseRooms() {
        try {
            const sparseRooms = await Room.find({
                isActive: true,
                expiresAt: { $gt: new Date() },
            }).lean();

            logger.info(`[TrickleService] Found ${sparseRooms.length} sparse rooms to refill`);

            for (const room of sparseRooms) {
                if (!_activeJobs.has(room._id.toString())) {
                    const [longitude, latitude] = room.location.coordinates;
                    this.startTrickle(room._id, { longitude, latitude });
                }
            }
        } catch (error) {
            logger.error("[TrickleService] refillSparseRooms failed", { error: error.message });
        }
    }

    /**
     * Schedule the next trickle tick after a random delay.
     */
    static _scheduleNext(roomId, location, targetCount) {
        const delay = this._randomDelay();

        const handle = setTimeout(async () => {
            _activeJobs.delete(roomId);  // clear before async work

            try {
                const done = await this._trickleOnce(roomId, location, targetCount);

                if (!done) {
                    // Room still needs more members — schedule another tick
                    this._scheduleNext(roomId, location, targetCount);
                } else {
                    logger.info(`[TrickleService] Trickle complete for room ${roomId}`);
                }
            } catch (err) {
                logger.error(`[TrickleService] Tick failed for room ${roomId}`, { error: err.message });
                // Retry after a longer delay so transient errors don't halt everything
                this._scheduleNext(roomId, location, targetCount);
            }
        }, delay);

        _activeJobs.set(roomId, handle);
        logger.info(`[TrickleService] Next join for room ${roomId} in ${(delay / 1000).toFixed(1)}s`);
    }

    /**
     * Perform one trickle join attempt.
     * Returns true when trickle should stop (room full / target reached).
     */
    static async _trickleOnce(roomId, location, targetCount) {
        const room = await findRoomById(roomId);

        // Room gone or inactive — stop
        if (!room || !room.isActive) return true;

        const currentCount = room.members.length;

        // Already at or beyond target — stop
        if (currentCount >= targetCount || currentCount >= room.maxMembers) return true;

        // Decide: real user or bot?
        const useRealUser = await this._shouldUseRealUser(room);
        let newMemberId = null;
        let displayName = null;

        if (useRealUser) {
            const realUser = await this._findNearbyNonMember(room, location);
            if (realUser) {
                newMemberId = realUser._id;
                displayName = realUser.username || realUser.name;
            }
        }

        // Fall back to bot if no real user found
        if (!newMemberId) {
            const bot = await BotService.createSingleBot?.() ?? await this._fallbackBot(room._id);
            if (!bot) {
                logger.warn(`[TrickleService] No bot available for room ${roomId}`);
                return false; // Try again next tick
            }
            newMemberId = bot._id;
            displayName = bot.username || bot.name || "Anonymous";
        }

        // Add member to room
        await addMemberToRoom(room, newMemberId);

        // Emit socket event so connected clients see the join live
        this._emitUserJoined(roomId, newMemberId, displayName);

        logger.info(`[TrickleService] Member joined room ${roomId}: ${displayName} (${newMemberId})`);

        return false; // Continue trickle
    }

    // =========================================================================
    // INTERNAL — user selection
    // =========================================================================

    /**
     * Decide whether to try a real user based on current real/bot ratio.
     */
    static async _shouldUseRealUser(room) {
        try {
            const memberIds = room.members.map(id => id.toString());
            const realCount = await User.countDocuments({
                _id: { $in: memberIds },
                isBot: { $ne: true },
                isActive: true,
            });

            const ratio = memberIds.length > 0 ? realCount / memberIds.length : 0;

            // If we're below the minimum real ratio, strongly prefer real users
            if (ratio < TRICKLE_CONFIG.MIN_REAL_RATIO) return true;

            // Otherwise 50/50 coin flip
            return Math.random() < 0.5;
        } catch {
            return Math.random() < 0.5;
        }
    }

    /**
     * Find a real, active, nearby user who is not already in the room.
     */
    static async _findNearbyNonMember(room, location) {
        try {
            const existingMemberIds = room.members.map(id => id.toString());

            const nearbyUsers = await User.aggregate([
                {
                    $geoNear: {
                        near: {
                            type: "Point",
                            coordinates: [location.longitude, location.latitude],
                        },
                        distanceField: "distance",
                        maxDistance: TRICKLE_CONFIG.NEARBY_RADIUS_M,
                        spherical: true,
                        query: {
                            isActive: true,
                            isBot: { $ne: true },
                        },
                    },
                },
                {
                    $match: {
                        _id: { $nin: existingMemberIds.map(id => {
                            const mongoose = require("mongoose");
                            return new mongoose.Types.ObjectId(id);
                        })},
                    },
                },
                { $limit: 10 },
                { $project: { _id: 1, username: 1, name: 1 } },
            ]);

            if (nearbyUsers.length === 0) return null;

            // Pick a random one from the candidates so it doesn't always be the closest
            return nearbyUsers[Math.floor(Math.random() * nearbyUsers.length)];
        } catch (err) {
            logger.error("[TrickleService] _findNearbyNonMember failed", { error: err.message });
            return null;
        }
    }

    /**
     * Fallback: create a single bot inline if BotService.createSingleBot isn't available.
     * Adjust to match your actual BotService API.
     */
    static async _fallbackBot(roomId) {
        try {
            // If your BotService.seedBots adds bots to the room and returns them,
            // we call it and grab the first new member
            const updatedRoom = await BotService.seedBots(roomId);
            if (!updatedRoom) return null;

            const room = await findRoomById(roomId);
            const lastMemberId = room?.members[room.members.length - 1];
            if (!lastMemberId) return null;

            const User = require("../../models/user");
            return await User.findById(lastMemberId).lean();
        } catch (err) {
            logger.error("[TrickleService] _fallbackBot failed", { error: err.message });
            return null;
        }
    }

    // ✅ Uses "room_<roomId>" channel — matches joinUserSocketsToRoom exactly
    static _emitUserJoined(roomId, userId, displayName) {
        try {
            const io = socketManager.getIO?.() ?? socketManager.io;
            if (!io) {
                logger.warn("[TrickleService] io not available, skipping emit");
                return;
            }

            const channel = `room_${roomId.toString()}`;  // ✅ must match room.socket.js

            io.to(channel).emit("user_joined", {           // ✅ snake_case matches frontend hook
                roomId: roomId.toString(),
                userId: userId.toString(),
                username: displayName,
                joinedAt: new Date().toISOString(),
            });

            logger.info(`[TrickleService] Emitted user_joined on ${channel} — user: ${displayName}`);
        } catch (err) {
            logger.warn("[TrickleService] Socket emit failed", { error: err.message });
        }
    }

    /** Random delay in ms between MIN and MAX. */
    static _randomDelay() {
        return (
            Math.floor(
                Math.random() * (TRICKLE_CONFIG.MAX_DELAY_MS - TRICKLE_CONFIG.MIN_DELAY_MS)
            ) + TRICKLE_CONFIG.MIN_DELAY_MS
        );
    }
}

module.exports = RoomTrickleService;
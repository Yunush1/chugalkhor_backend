const cron = require("node-cron");
const RoomService = require("../services/roomService/room.service");
const logger = require("../utils/logger");

/**
 * Runs every 10 minutes
 */
const startRoomCleanupJob = () => {
    cron.schedule("*/10 * * * *", async () => {
        logger.info("[Seeder] Running expired room cleanup...");

        try {
            await RoomService.cleanupExpiredRooms();
        } catch (error) {
            logger.error("[Seeder] Room cleanup failed:", error.message);
        }
    });
};

module.exports = startRoomCleanupJob;
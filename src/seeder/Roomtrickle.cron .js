const cron = require("node-cron");
const RoomTrickleService = require("../services/roomService/room.trickle.service");
const logger = require("../utils/logger");

// Every 2 minutes — find rooms that have gone sparse and refill them
const roomTrichke = () => {
    cron.schedule("*/1 * * * *", async () => {
        logger.info("[Cron] Running sparse room refill check...");
        await RoomTrickleService.refillSparseRooms();
    });
}
module.exports = roomTrichke;
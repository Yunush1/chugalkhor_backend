const startRoomCleanupJob = require("./roomCleanup");
const logger = require('../utils/logger');
const { startCreateBotsSeeder } = require("./createBots");
const roomTrichke = require("./Roomtrickle.cron ");
const startSeeders = () => {

    logger.info("[Seeder] Starting background jobs...");

    startRoomCleanupJob();
    // startCreateBotsSeeder();
    roomTrichke();

};

module.exports = startSeeders;
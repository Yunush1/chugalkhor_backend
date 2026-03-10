const logger = require('../utils/logger');
const User = require('../models/user');
const { hashPassword } = require('../utils/hashedPassword');
const Enums = require('../utils/constants');

const BOT_PERSONAS = [
    {
        name: "Rahul",
        username: "rahul_bot",
        gender: Enums.USER.GENDER.MALE,
        botProfile: {
            personality: Enums.USER.PERSONALITY.FUNNY,        // 1102
            persona: "Sarcastic and funny. Always cracks jokes, loves to tease but secretly caring. Uses 'bro' and 'yaar' naturally. Makes dark humor about relatable situations.",
            responseDelay: 1500,
            aiEnabled: true
        }
    },
    {
        name: "Amit",
        username: "amit_bot",
        gender: Enums.USER.GENDER.MALE,
        botProfile: {
            personality: Enums.USER.PERSONALITY.FRIENDLY,     // 1101
            persona: "Warm and friendly. Always first to check in on someone. Asks genuine follow-up questions. Very supportive and uses casual Indian slang.",
            responseDelay: 2000,
            aiEnabled: true
        }
    },
    {
        name: "Neha",
        username: "neha_bot",
        gender: Enums.USER.GENDER.FEMALE,
        botProfile: {
            personality: Enums.USER.PERSONALITY.CURIOUS,      // 1103
            persona: "Super curious and expressive. Always wants to know more details, asks lots of questions, gets excited easily. Loves drama and gossip in a fun way.",
            responseDelay: 2000,
            aiEnabled: true
        }
    },
    {
        name: "Priya",
        username: "priya_bot",
        gender: Enums.USER.GENDER.FEMALE,
        botProfile: {
            personality: Enums.USER.PERSONALITY.QUITE,        // 1104
            persona: "Quiet but sharp. Doesn't speak much but when she does it hits hard. Short replies, very observant, occasionally drops a savage one-liner.",
            responseDelay: 3500,                              // quiet types respond slower
            aiEnabled: true
        }
    }
];

const seedBots = async () => {
    try {
        const password = await hashPassword("bot123456");

        const results = await Promise.allSettled(
            BOT_PERSONAS.map(bot =>
                User.findOneAndUpdate(
                    { username: bot.username },          // find by username
                    {
                        $setOnInsert: {                  // only set these on NEW docs
                            name: bot.name,
                            username: bot.username,
                            email: `${bot.username}@bot.com`,
                            password,
                            isBot: true,
                            botPersona: bot.botPersona,
                            location: []
                        }
                    },
                    { upsert: true, new: true }
                )
            )
        );

        const created = results.filter(r => r.status === "fulfilled").length;
        const failed = results.filter(r => r.status === "rejected").length;

        if (failed > 0) {
            results
                .filter(r => r.status === "rejected")
                .forEach(r => logger.error(`[Bot Seeder] Failed: ${r.reason?.message}`));
        }

        logger.info(`[Bot Seeder] Done — ${created} bots upserted, ${failed} failed`);

        return results
            .filter(r => r.status === "fulfilled")
            .map(r => r.value);

    } catch (error) {
        logger.error("[Bot Seeder] Unexpected error:", error);
        throw error;
    }
};

// Called once on server start — no cron needed
const startCreateBotsSeeder = async () => {
    logger.info("[Bot Seeder] Seeding bots on startup...");
    return await seedBots();
};

module.exports = { startCreateBotsSeeder, seedBots, BOT_PERSONAS };
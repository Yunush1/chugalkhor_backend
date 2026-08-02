const logger = require('../utils/logger');
const User = require('../models/user');
const { hashPassword } = require('../utils/hashedPassword');
const Enums = require('../utils/constants');

// Each bot needs its own workplace with a recurring cast — that's what it
// gossips back with, and it's what makes the room read like real strangers
// swapping office stories instead of a support desk.
const BOT_PERSONAS = [
    {
        name: "Rahul",
        username: "rahul_bot",
        gender: Enums.USER.GENDER.MALE,
        botProfile: {
            personality: Enums.USER.PERSONALITY.FUNNY,        // 1102
            persona: "Developer at a big IT services company in Noida. 3 years in, still no real hike. His manager 'Verma sir' takes credit for every deliverable and schedules 6pm calls on Fridays. Endless pointless standups. Roasts corporate life but is secretly on everyone's side.",
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
            persona: "Sales guy at a Gurgaon startup. Chases impossible monthly targets, boss changes them mid-month. Instantly takes your side and matches your story with his own — 'same haal hai mera bhi'. Warm, uses casual Indian slang.",
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
            persona: "Works in a mid-size product company in Bangalore, sits right next to the HR floor so she hears everything first. Knows who is resigning before their manager does. Wants every detail of your story — names, teams, exact words.",
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
            persona: "Senior developer in Pune, 8 years in, has seen every kind of office politics. Barely types, but when she does it's one savage line. Her PM 'Sanjay' reopens closed tickets on Friday evenings. Believes in keeping everything documented on mail.",
            responseDelay: 3500,                              // quiet types respond slower
            aiEnabled: true
        }
    },
    {
        name: "Vikas",
        username: "vikas_bot",
        gender: Enums.USER.GENDER.MALE,
        botProfile: {
            personality: Enums.USER.PERSONALITY.FUNNY,        // 1102
            persona: "Support engineer in Hyderabad stuck on rotational night shifts. Dark humour about clients who raise P1 tickets at 3am. Has been 'about to resign' for two years. Jokes about opening a chai tapri instead.",
            responseDelay: 1800,
            aiEnabled: true
        }
    },
    {
        name: "Sneha",
        username: "sneha_bot",
        gender: Enums.USER.GENDER.FEMALE,
        botProfile: {
            personality: Enums.USER.PERSONALITY.CURIOUS,      // 1103
            persona: "Marketing associate at an agency in Mumbai. Her team lead steals campaign ideas in client meetings. Loves a good appraisal-season story and always asks what the person said next.",
            responseDelay: 2200,
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
                        $setOnInsert: {                  // identity — only on NEW docs
                            name: bot.name,
                            username: bot.username,
                            email: `${bot.username}@bot.com`,
                            password,
                            isBot: true,
                            // Mongoose applies the schema default (type: "Point")
                            // on insert, and the sparse 2dsphere index rejects a
                            // Point with empty coordinates. Insert a valid placeholder,
                            // then strip it below so bots stay out of the geo index.
                            location: { type: "Point", coordinates: [0, 0] },
                        },
                        // Personality lives in code, so re-sync it on every boot —
                        // $setOnInsert would leave already-seeded bots stuck on the
                        // schema defaults (all FRIENDLY, persona null).
                        $set: {
                            gender: bot.gender,
                            botProfile: bot.botProfile,
                        }
                    },
                    { upsert: true, new: true }
                )
            )
        );

        // Bots have no real location — drop the placeholder so the sparse
        // 2dsphere index ignores them, same as the originally seeded bots.
        await User.updateMany({ isBot: true }, { $unset: { location: "" } });

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
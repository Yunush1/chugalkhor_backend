const logger = require('../../utils/logger');
const Message = require('../../models/message');
const Room = require('../../models/room');
const MessageRepository = require('../../repositories/MessageRepository');
const Enums = require('../../utils/constants');
const axios = require('axios');
const { default: axiosRetry } = require('axios-retry');
// Tracks whether a room has an active bot chain running
// roomId (string) → true | false

axiosRetry(axios, {
    retries: 3, // Retry 3 times
    retryDelay: (retryCount) => retryCount * 1000, // 1s, 2s, 3s
    retryCondition: (error) => {
        // Retry on 500 errors or network errors
        return error.response?.status >= 500 || error.code === 'ECONNABORTED';
    }
});
const activeRooms = new Map();

class ConversationOrchestrator {

    // ─── Public Entry Point ──────────────────────────────────────────────────

    static async orchestrate({ roomId, senderId, senderName, triggerMessage, emitter }) {
        try {
            ConversationOrchestrator.cancelChain(roomId);
            await new Promise(r => setTimeout(r, 50));

            const room = await Room.findById(roomId).populate(
                'members',
                '_id name username isBot botProfile'
            );
            if (!room) return;

            const bots = room.members.filter(m => m.isBot && m.botProfile?.aiEnabled !== false);
            if (bots.length === 0) return;

            activeRooms.set(roomId, true);
            logger.info(`[Orchestrator] Chain started in room ${roomId} — "${triggerMessage}"`);

            await ConversationOrchestrator._runChain({
                roomId, room, bots, senderName, triggerMessage, emitter, round: 0,
            });

        } catch (err) {
            logger.error('[Orchestrator] orchestrate error:', err);
        } finally {
            activeRooms.set(roomId, false);
        }
    }

    static cancelChain(roomId) {
        if (activeRooms.get(roomId)) {
            logger.info(`[Orchestrator] Chain cancelled for room ${roomId}`);
        }
        activeRooms.set(roomId, false);
    }

    // ─── Chain Runner ────────────────────────────────────────────────────────

    static async _runChain({ roomId, room, bots, senderName, triggerMessage, emitter, round }) {
        const MAX_ROUNDS = 6;

        if (!activeRooms.get(roomId) || round >= MAX_ROUNDS) return;

        const recentMessages = await MessageRepository.getRecentMessages(roomId, 20);

        const { respondingBots } = ConversationOrchestrator._decideBotCount(
            round === 0 ? triggerMessage : null,
            recentMessages,
            bots,
            round
        );

        if (respondingBots.length === 0) return;

        // Collect ALL recent bot replies to enforce no-repeat rule
        const recentBotReplies = recentMessages
            .filter(m => m.sender?.isBot)
            .slice(-6)
            .map(m => `${m.sender?.name}: ${m.content}`);

        const chainMessages = [];

        for (let i = 0; i < respondingBots.length; i++) {
            if (!activeRooms.get(roomId)) return;

            const bot = respondingBots[i];
            const baseDelay = bot.botProfile?.responseDelay ?? 2000;
            const delay = i === 0 ? baseDelay : baseDelay + Math.random() * 1200;

            await new Promise(r => setTimeout(r, delay));
            if (!activeRooms.get(roomId)) return;

            const freshMessages = await MessageRepository.getRecentMessages(roomId, 20);

            const result = await ConversationOrchestrator._generateBotReply({
                bot, room,
                recentMessages: freshMessages,
                chainMessages,
                recentBotReplies,
                senderName, triggerMessage,
                respondingBots,
                isFirst: i === 0 && round === 0,
                round,
            });

            if (!result) continue;

            chainMessages.push({ botName: bot.name, content: result.messageObj.content });
            recentBotReplies.push(`${bot.name}: ${result.messageObj.content}`);

            emitter.newMessage(roomId, result.messageObj, bot._id.toString());
        }

        const roundGap = 3000 + round * 1500 + Math.random() * 2000;
        await new Promise(r => setTimeout(r, roundGap));
        if (!activeRooms.get(roomId)) return;

        await ConversationOrchestrator._runChain({
            roomId, room, bots, senderName, triggerMessage, emitter, round: round + 1,
        });
    }

    // ─── Decision Logic ──────────────────────────────────────────────────────

    static _decideBotCount(triggerMessage, recentMessages, bots, round) {
        const content = triggerMessage?.toLowerCase() ?? '';

        const activeBots = bots.filter(b =>
            b.botProfile?.personality !== Enums.USER.PERSONALITY.QUITE ||
            Math.random() < 0.3
        );

        if (activeBots.length === 0) return { respondingBots: [] };
        if (round >= 4) return { respondingBots: ConversationOrchestrator._pickBots(activeBots, 1) };
        if (round >= 2) return { respondingBots: ConversationOrchestrator._pickBots(activeBots, Math.min(2, activeBots.length)) };

        const recentBotCount = recentMessages.filter(m => m.sender?.isBot).length;
        if (recentBotCount >= 5) return { respondingBots: ConversationOrchestrator._pickBots(activeBots, 1) };

        const crowdTriggers = [
            /not well|sick|sad|depressed|upset|breakup|broke up|she left|he left|alone|lonely|miss|bored|boring|pain|dard|headache|sir dard/i,
            /help|please|anyone|somebody|advice|suggest|kya kru|kya karun|batao/i,
            /😢|😭|💔|😔|🥺|😞|😑|🤕|😩/,
        ];
        const duoTriggers = [
            /\?/,
            /what do you|anyone know|thoughts|opinion|what should|kya lagta|sochte ho/i,
            /hey|yo |sup |hii|hello|anyone|koi hai/i,
        ];

        const isCrowd = crowdTriggers.some(r => r.test(content));
        const isDuo = duoTriggers.some(r => r.test(content));

        let count;
        if (isCrowd) count = Math.min(3, activeBots.length);
        else if (isDuo) count = Math.min(2, activeBots.length);
        else count = Math.min(2, activeBots.length);

        return { respondingBots: ConversationOrchestrator._pickBots(activeBots, count) };
    }

    static _pickBots(bots, count) {
        return [...bots].sort(() => Math.random() - 0.5).slice(0, count);
    }

    // ─── Reply Generation ────────────────────────────────────────────────────

    static async _generateBotReply({
        bot, room, recentMessages, chainMessages, recentBotReplies,
        triggerMessage, senderName, respondingBots, isFirst, round,
    }) {
        try {
            // Build clean conversation history — label each person by name
            const history = [...recentMessages]
                .reverse()
                .map(m => `${m.sender?.name || m.sender?.username || 'someone'}: ${m.content}`)
                .filter(Boolean)
                .join('\n');

            // What other bots just said this round
            const chainContext = chainMessages.length > 0
                ? chainMessages.map(c => `${c.botName}: ${c.content}`).join('\n')
                : '';

            // All recent bot replies for anti-repeat injection
            const recentBotContext = recentBotReplies.length > 0
                ? recentBotReplies.join('\n')
                : '';

            const otherBotNames = respondingBots
                .filter(b => b._id.toString() !== bot._id.toString())
                .map(b => b.name);

            const prompt = ConversationOrchestrator._buildPrompt({
                bot, room, senderName, otherBotNames,
                history, chainContext, recentBotContext,
                triggerMessage, isFirst, round,
            });

            const rawText = await ConversationOrchestrator._callGemini(prompt);
            if (!rawText) return null;

            // Aggressively clean the output
            let cleanText = rawText.trim()
                .replace(/^["']|["']$/g, '')           // remove wrapping quotes
                .replace(/^[A-Za-z\s]{1,20}:\s/, '')   // remove "Name: " prefix
                .replace(/\*+/g, '')                    // remove markdown bold
                .replace(/\n+/g, ' ')                   // flatten newlines
                .trim();

            if (!cleanText || cleanText.length < 3) return null;

            const msg = await Message.create({
                roomId: room._id,
                sender: bot._id,
                type: Enums.MESSAGE.TYPE.TEXT,
                content: cleanText,
            });

            return {
                message: msg,
                messageObj: {
                    _id: msg._id,
                    roomId: msg.roomId,
                    sender: { userId: bot._id, name: bot.name, username: bot.username, isBot: true },
                    type: Enums.MESSAGE.TYPE.TEXT,
                    content: cleanText,
                    isEdited: false,
                    createdAt: msg.createdAt,
                    timestamp: Date.now(),
                    seenBy: [],
                    deliveredTo: [],
                },
            };

        } catch (err) {
            logger.error(`[Orchestrator] _generateBotReply failed for ${bot.name}:`, err);
            return null;
        }
    }

    // ─── Gemini API ──────────────────────────────────────────────────────────

    static async _callGemini(prompt, botName = 'Rahul') {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                throw new Error('GEMINI_API_KEY not set in environment');
            }

            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                {
                    contents: [
                        {
                            role: "user",  // Gemini mein role "user" ya "model" hota hai (system prompt ko contents mein daal sakte ho)
                            parts: [{ text: prompt }]
                        }
                    ],
                    generationConfig: {
                        maxOutputTokens: 500,
                        temperature: 0.9,
                        topP: 0.95,
                    },
                    // Optional: system instruction add karne ke liye (Gemini mein system prompt alag field nahi, contents mein daalo)
                    // systemInstruction: { parts: [{ text: "You are a fun casual friend..." }] }  // agar Gemini 1.5+ version support kare
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 60000  // 60 sec – Gemini fast hai, isse zyada ki zaroorat nahi
                }
            );

            // Gemini response safely extract
            const candidates = response?.data?.candidates;
            if (!candidates || candidates.length === 0) {
                throw new Error('No candidates in Gemini response');
            }

            const parts = candidates[0]?.content?.parts;
            if (!parts || parts.length === 0 || !parts[0]?.text) {
                throw new Error('No text content in Gemini response');
            }

            const botReply = parts[0].text.trim();

            console.log(`[${botName}] Gemini Reply:`, botReply);
            // Optional debug
            // console.log('Full Gemini response:', JSON.stringify(response.data, null, 2));

            return botReply;

        } catch (error) {
            console.error(`Gemini API failed for ${botName}:`, {
                message: error.message,
                code: error.code,
                status: error.response?.status,
                data: error.response?.data || null
            });

            // Fallback reply taaki room mein dead vibe na aaye
            return `Arre yaar sorry, thoda connection glitch 😅 Ab bata, kya bol raha tha?`;
        }
    }
    // ─── Prompt Building ─────────────────────────────────────────────────────

    static _getPersonalityStyle(personalityEnum) {
        const { PERSONALITY } = Enums.USER;
        const styles = {
            [PERSONALITY.FRIENDLY]: {
                style: 'warm desi friend who genuinely cares',
                examples: [
                    'arre yaar kya hua bata na',
                    'chal thoda paani pi aur le',
                    'tu theek ho jayega, hum hai na',
                    'aww sach mein? kab se hai?',
                    'bhai rest kar thoda, kaam baad mein hoga',
                ],
            },
            [PERSONALITY.FUNNY]: {
                style: 'sarcastic desi guy who jokes about everything but secretly cares',
                examples: [
                    'bhai tera toh life hi ek tragedy hai 😂',
                    'chal ab rona band kar, chai pi',
                    'headache hai ya bas excuse dhundh raha hai? 😏',
                    'yaar teri problem sun ke meri bhi headache aa gayi',
                    'sympathy toh dunga lekin pehle bata kya kiya tune',
                ],
            },
            [PERSONALITY.CURIOUS]: {
                style: 'nosy desi girl who wants all the details and reacts dramatically',
                examples: [
                    'arre wait headache kyun?? kya hua??',
                    'bhai poori story bata, se shuru kar',
                    'ohhh seriously?? aur aur??',
                    'yaar kab se ho raha hai ye sab',
                    'nahi nahi poora bata mujhe',
                ],
            },
            [PERSONALITY.QUITE]: {
                style: 'quiet observer who says very little but hits hard when they do',
                examples: [
                    'rest kar.',
                    'paracetamol liya?',
                    'hm.',
                    'kal theek hoga.',
                    'chal so ja.',
                ],
            },
        };
        return styles[personalityEnum] ?? styles[Enums.USER.PERSONALITY.FRIENDLY];
    }

    static _buildPrompt({ bot, room, senderName, otherBotNames, history, chainContext, recentBotContext, triggerMessage, isFirst, round }) {
        const { style, examples } = ConversationOrchestrator._getPersonalityStyle(bot.botProfile?.personality);
        const isQuiet = bot.botProfile?.personality === Enums.USER.PERSONALITY.QUITE;
        const exampleList = examples.map(e => `- "${e}"`).join('\n');

        const othersLine = otherBotNames.length > 0
            ? `Other people in chat: ${otherBotNames.join(', ')}.`
            : '';

        let taskLine;
        if (round === 0 && isFirst) {
            taskLine = `${senderName} just said: "${triggerMessage}"\nYou are the first to reply. React to ${senderName} directly.`;
        } else if (round === 0) {
            taskLine = `${senderName} said: "${triggerMessage}"\nSomeone already replied. React differently — add your own take, don't echo what was said.`;
        } else {
            taskLine = `The group chat is flowing. React to the latest messages. Keep the convo alive — joke, ask something, share a take, or bring ${senderName} back in.`;
        }

        return `You are ${bot.name}, a ${style} in a WhatsApp-style group chat called "${room.name}".
${room.description ? `Group vibe: ${room.description}` : ''}

${othersLine}

--- RECENT CHAT ---
${history || `${senderName}: ${triggerMessage}`}
${chainContext ? `\n[Just now]\n${chainContext}` : ''}

--- YOUR TASK ---
${taskLine}

--- YOUR STYLE (examples of how YOU talk) ---
${exampleList}

--- STRICT RULES ---
1. Write ONLY your message — no name prefix, no quotes around it
2. ${isQuiet ? 'Maximum 8 words. Be blunt.' : 'Maximum 15 words. Keep it punchy.'}
3. Sound like a real Indian person texting — casual, imperfect, genuine
4. Mix Hindi/English naturally (Hinglish) if it feels natural — "yaar", "bhai", "arre", "na", "toh", "kya" etc.
5. NEVER start with "Oh no" — that's generic AI talk
6. NEVER repeat what anyone else already said
7. NEVER use formal English — no "I understand", "that sounds difficult", "I hope you feel better"
8. React differently from others — if someone asked a question, you comment; if someone commented, you ask or joke
9. Use emojis sparingly — max 1, only if it fits naturally
10. Each bot must sound different from each other

--- THINGS THAT WERE ALREADY SAID (DO NOT REPEAT THESE) ---
${recentBotContext || 'nothing yet'}

Now write ${bot.name}'s single reply message:`;
    }
}

module.exports = ConversationOrchestrator;
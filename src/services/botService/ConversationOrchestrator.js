const logger = require('../../utils/logger');
const Message = require('../../models/message');
const Room = require('../../models/room');
const MessageRepository = require('../../repositories/MessageRepository');
const Enums = require('../../utils/constants');
const AIService = require('../aiService');
const OfflineReplyService = require('./OfflineReplyService');

// Tracks whether a room has an active bot chain running
// roomId (string) → true | false
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
        const OFFLINE_MAX_ROUNDS = 2;

        // Offline replies come from a fixed bank, so a long chain would start
        // repeating itself. Keep the room alive, but keep it short.
        const maxRounds = AIService.isAvailable() ? MAX_ROUNDS : OFFLINE_MAX_ROUNDS;

        if (!activeRooms.get(roomId) || round >= maxRounds) return;

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
            .map(m => `${m.sender?.name || m.sender?.username || 'someone'}: ${m.content}`);

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
                replyIndex: i,
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

        // Office chugli that the whole room piles onto.
        const crowdTriggers = [
            /boss|manager|senior|team lead|\btl\b|\bhr\b|appraisal|hike|increment|promotion|salary|package|bonus/i,
            /resign|notice period|fired|layoff|laid off|nikaal|nikal diya|quit|switch|offer letter|interview/i,
            /overtime|late night|weekend|deadline|onsite|client call|standup|meeting|politics|credit liya|blame/i,
            /not well|sad|upset|frustrated|pareshan|tang aa|thak gaya|fed up|bore|bored|dard/i,
            /😤|😡|🤬|😩|😭|💀|🙄|😔/,
        ];
        const duoTriggers = [
            /\?/,
            /what do you|anyone know|thoughts|opinion|what should|kya lagta|sochte ho|batao/i,
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
        triggerMessage, senderName, respondingBots, isFirst, replyIndex = 0, round,
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
                triggerMessage, isFirst, replyIndex, round,
            });

            // The prompt carries persona, rules and the transcript, so it goes in as
            // the system instruction; the chat turn is what the bot is replying to.
            const rawText = await AIService.chat({
                system: prompt,
                messages: [{
                    role: 'user',
                    content: round === 0 && triggerMessage
                        ? `${senderName}: ${triggerMessage}`
                        : (recentMessages[0]
                            ? `${recentMessages[0].sender?.name || recentMessages[0].sender?.username || 'someone'}: ${recentMessages[0].content}`
                            : `${senderName}: ${triggerMessage || 'Hey!'}`),
                }],
                // A chugli line is ~25 tokens; the headroom is only there so a
                // reply never gets cut off mid-word.
                maxTokens: 80,
                temperature: 0.9,
                topP: 0.95,
                label: bot.name,
            });
            // Provider down (no credits, bad key, outage) — answer from the local
            // bank instead of leaving the room dead.
            const replyText = rawText ?? OfflineReplyService.generate({
                bot,
                roomId: room._id,
                message: round === 0 ? triggerMessage : (recentMessages[0]?.content ?? triggerMessage),
                replyIndex,
                round,
                alreadySaid: recentBotReplies,
            });

            if (!replyText) return null;
            if (!rawText) logger.info(`[Orchestrator] ${bot.name} replied from the offline bank`);

            // Aggressively clean the output
            let cleanText = replyText.trim()
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

    // ─── Prompt Building ─────────────────────────────────────────────────────

    static _getPersonalityStyle(personalityEnum) {
        const { PERSONALITY } = Enums.USER;
        const styles = {
            [PERSONALITY.FRIENDLY]: {
                style: 'warm colleague who takes your side instantly and shares the same struggles',
                examples: [
                    'arre yaar aisa boss kaha se milta hai tujhe',
                    'same haal hai mera bhi, mera TL bhi aisa hi karta hai',
                    'tu bol na, exactly kya bola usne',
                    'chhod yaar, weekend pe bhool jaana',
                    'itna kaam karwate hai aur hike ke naam pe zero',
                ],
            },
            [PERSONALITY.FUNNY]: {
                style: 'sarcastic corporate guy who roasts office life but is secretly on your side',
                examples: [
                    'bhai teri company NGO hai kya, salary hi nahi deti 😂',
                    'standup meeting hai ya standup comedy',
                    'hike mila ya sirf "great work" mila',
                    'manager ne credit le liya na? classic move',
                    'resign kar de, chai ki tapri khol lete hai saath mein',
                ],
            },
            [PERSONALITY.CURIOUS]: {
                style: 'nosy colleague who wants every single detail of the story',
                examples: [
                    'ruk ruk, kisne bola ye? naam bata',
                    'aur phir?? HR ne kya kaha??',
                    'kis team mein hai tu, poora scene bata',
                    'seriously?? sabke saamne bola??',
                    'aur uska reaction kya tha uske baad',
                ],
            },
            [PERSONALITY.QUITE]: {
                style: 'quiet senior who says almost nothing but lands one savage line',
                examples: [
                    'resign kar.',
                    'classic manager move.',
                    'sab mail pe documented rakh.',
                    'hm. politics.',
                    'notice period kitna hai?',
                ],
            },
        };
        return styles[personalityEnum] ?? styles[Enums.USER.PERSONALITY.FRIENDLY];
    }

    // Left to themselves every bot picks the same move — three "same haal hai
    // mera bhi" in a row. Assigning one move per slot in the chain makes the
    // room sound like a conversation instead of an echo.
    static _getMove(replyIndex, round) {
        const moves = [
            'React to what they just said — tease them, agree hard, or roast the boss. Do NOT ask a question.',
            'Ask ONE nosy follow-up question to pull more details out of them. Do NOT add commentary.',
            'Top it with ONE line about YOUR own office. Do NOT ask a question.',
        ];
        return moves[(replyIndex + round) % moves.length];
    }

    static _buildPrompt({ bot, room, senderName, otherBotNames, history, chainContext, recentBotContext, triggerMessage, isFirst, replyIndex = 0, round }) {
        const { style, examples } = ConversationOrchestrator._getPersonalityStyle(bot.botProfile?.personality);
        const isQuiet = bot.botProfile?.personality === Enums.USER.PERSONALITY.QUITE;
        const exampleList = examples.map(e => `- "${e}"`).join('\n');

        const othersLine = otherBotNames.length > 0
            ? `Others in the chat right now: ${otherBotNames.join(', ')}.`
            : '';

        // The bot's own workplace — this is the material it gossips *back* with,
        // so the room feels like strangers swapping office stories, not a helpdesk.
        const officeLine = bot.botProfile?.persona
            ? `--- YOUR OWN OFFICE (your material for chugli) ---\n${bot.botProfile.persona}`
            : '';

        let taskLine;
        if (round === 0 && isFirst) {
            taskLine = `${senderName} just said: "${triggerMessage}"\nYou are first to react. Respond to ${senderName} directly.`;
        } else if (round === 0) {
            taskLine = `${senderName} said: "${triggerMessage}"\nSomeone already reacted. Say something the others have not.`;
        } else {
            taskLine = `The chugli is flowing. React to the latest message in the chat.`;
        }

        return `You are ${bot.name}, a real working professional in "${room.name}" — an anonymous group chat where people come to do CHUGLI about their offices: bosses, managers, HR, colleagues, appraisals, office politics, all of it.
${room.description ? `Room vibe: ${room.description}` : ''}
Nobody here knows each other in real life, so everyone talks freely about their workplace.

${officeLine}

You are a ${style}.

${othersLine}

--- RECENT CHAT ---
${history || `${senderName}: ${triggerMessage}`}
${chainContext ? `\n[Just now]\n${chainContext}` : ''}

--- YOUR TASK ---
${taskLine}

YOUR MOVE THIS TURN (do exactly this, nothing else):
${ConversationOrchestrator._getMove(replyIndex, round)}

--- HOW YOU TALK (tone reference only) ---
${exampleList}

--- STRICT RULES ---
1. ONE short line. ${isQuiet ? 'Maximum 8 words.' : 'Maximum 14 words.'} Never stack a comment AND a question
2. The lines above show your TONE only — never copy them or reuse their wording
3. Write ONLY your message — no name prefix, no quotes around it
4. Sound like a real Indian working person texting — casual, imperfect, genuine
5. Hinglish only if it comes out clean and natural — correct English is better than broken Hindi
6. This is gossip, not therapy — never give HR-style advice
7. NEVER repeat what anyone already said below, and never ask a question someone already asked
8. NEVER start with "Oh no", and never use formal English ("I understand", "that sounds difficult")
9. React differently from the others — if they asked a question, you comment instead
10. At most 1 emoji, only if it fits naturally
11. Never reveal you are an AI — you are just another employee venting after work

--- THINGS THAT WERE ALREADY SAID (DO NOT REPEAT THESE) ---
${recentBotContext || 'nothing yet'}

Now write ${bot.name}'s single reply message:`;
    }
}

module.exports = ConversationOrchestrator;
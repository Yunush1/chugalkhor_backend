const MessageRepository = require('../../repositories/MessageRepository');
const Room = require('../../models/room');
const Message = require('../../models/message');
const logger = require('../../utils/logger');
const AIService = require('../aiService');
const OfflineReplyService = require('./OfflineReplyService');
const Enums = require('../../utils/constants');

class BotReplyService {

    /**
     * Check if a bot should reply — only when NO real users are in the room.
     * Used as a fallback before ConversationOrchestrator takes over.
     */
    static async shouldReply(roomId, senderId) {
        const room = await Room.findById(roomId).populate(
            'members',
            'isBot _id name username botProfile'
        );
        if (!room) return { reply: false };

        const bots = room.members.filter(m => m.isBot && m.botProfile?.aiEnabled !== false);
        if (bots.length === 0) return { reply: false };

        const realUsers = room.members.filter(
            m => !m.isBot && m._id.toString() !== senderId.toString()
        );

        // If real users exist, ConversationOrchestrator handles it instead
        if (realUsers.length > 0) return { reply: false };

        const bot = bots[Math.floor(Math.random() * bots.length)];
        return { reply: false, bot, room };
    }

    /**
     * Generate a reply text for a bot using recent message history.
     */
    static async generateReply(bot, room) {
        const recentMessages = await MessageRepository.getRecentMessages(room._id, 10);

        const history = [...recentMessages]
            .reverse()
            .map(m => ({
                role: m.sender?.isBot ? 'assistant' : 'user',
                content: m.content || '',
            }))
            .filter(m => m.content.trim());

        return await BotReplyService._callAI(bot, room, history);
    }

    /**
     * Generate reply + save to DB + return messageObj for emitting.
     */
    static async createBotMessage(bot, room) {
        const text = await BotReplyService.generateReply(bot, room);
        if (!text) return null;

        const msg = await Message.create({
            roomId: room._id,
            sender: bot._id,
            type: Enums.MESSAGE.TYPE.TEXT,
            content: text,
        });

        return {
            message: msg,
            messageObj: {
                _id: msg._id,
                roomId: msg.roomId,
                sender: {
                    userId: bot._id,
                    name: bot.name,
                    username: bot.username,
                    isBot: true,
                },
                type: msg.type,
                content: msg.content,
                isEdited: false,
                createdAt: msg.createdAt,
                timestamp: Date.now(),
                seenBy: [],
                deliveredTo: [],
            },
        };
    }

    // ─── AI Call ─────────────────────────────────────────────────────────────

    static async _callAI(bot, room, history) {
        try {
            const system = `You are ${bot.name}, a real working professional in "${room.name}" — an anonymous chat where people do CHUGLI about their offices: bosses, HR, appraisals, colleagues, office politics.
${room.description ? `Room vibe: ${room.description}` : ''}
${bot.botProfile?.persona ? `Your own office: ${bot.botProfile.persona}` : ''}
Keep replies short and casual — 1 to 2 sentences max. Hinglish is natural here.
This is gossip, not advice — react, tease, drop your own office story, ask nosy follow-ups.
Never reveal you are an AI. Reply with your message only — no name prefix, no quotes.`;

            const rawText = await AIService.chat({
                system,
                messages: history,
                maxTokens: 120,
                temperature: 0.9,
                topP: 0.95,
                label: bot.name,
            });

            const cleaned = rawText?.replace(/^[A-Za-z\s]+:\s/, '').trim();
            if (cleaned) return cleaned;

            // Provider down — fall back to the local bank so the bot still speaks.
            logger.info(`[BotReplyService] ${bot.name} replying from the offline bank`);
            return OfflineReplyService.generate({
                bot,
                roomId: room._id,
                message: history[history.length - 1]?.content ?? '',
                alreadySaid: history.map(m => m.content),
            });

        } catch (error) {
            logger.error('[BotReplyService] AI reply generation failed:', error);
            return null;
        }
    }
}

module.exports = BotReplyService;
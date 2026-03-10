const MessageRepository = require('../../repositories/MessageRepository');
const Room = require('../../models/room');
const Message = require('../../models/message');
const logger = require('../../utils/logger');
const axios = require('axios');
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

        return await BotReplyService._callGemini(bot, room, history);
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

    // ─── Gemini API Call ─────────────────────────────────────────────────────

    static async _callGemini(bot, room, history) {
        try {
            const conversationText = history.length > 0
                ? history.map(m => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`).join('\n')
                : 'User: Hey!';

            const prompt = `You are ${bot.name}, a friendly local in a nearby chat room called "${room.name}".
${room.description ? `Room topic: ${room.description}` : ''}
${bot.botProfile?.persona ? `Your personality: ${bot.botProfile.persona}` : ''}
Keep replies short, casual, and conversational — 1 to 2 sentences max.
Never reveal you are an AI. Act like a real nearby person.

Conversation:
${conversationText}

Your reply (do NOT include your name or a prefix):`;

            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
                {
                    contents: [
                        {
                            parts: [{ text: prompt }]
                        }
                    ],
                    generationConfig: {
                        maxOutputTokens: 120,
                        temperature: 0.9,
                        topP: 0.95,
                    }
                },
                {
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
            return rawText?.trim().replace(/^[A-Za-z\s]+:\s/, '') ?? null;

        } catch (error) {
            logger.error('[BotReplyService] Gemini API error:', error);
            return null;
        }
    }
}

module.exports = BotReplyService;
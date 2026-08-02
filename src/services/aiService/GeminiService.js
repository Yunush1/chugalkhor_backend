const aiHttpClient = require('./httpClient');
const { AIProviderError, HARD_COOLDOWN_MS } = require('./AIProviderError');
const { schedule } = require('./rateLimiter');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 30000;

class GeminiService {

    static get providerName() {
        return 'gemini';
    }

    static get isConfigured() {
        return Boolean(process.env.GEMINI_API_KEY);
    }

    /**
     * Same contract as HuggingFaceService.chat — kept so providers stay swappable.
     * @returns {Promise<string>} Assistant text.
     * @throws {AIProviderError} On any failure; `.cooldownMs` says how long to park it.
     */
    static async chat({ system, messages = [], maxTokens = 120, temperature = 0.9, topP = 0.95 }) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new AIProviderError('GEMINI_API_KEY is not set in environment', {
                provider: 'gemini', cooldownMs: HARD_COOLDOWN_MS,
            });
        }

        const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

        const contents = messages
            .filter(m => (m?.content ?? '').trim())
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content.trim() }],
            }));

        if (contents.length === 0) {
            contents.push({ role: 'user', parts: [{ text: 'Hey!' }] });
        }

        const response = await schedule(() => aiHttpClient.post(
            `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`,
            {
                contents,
                ...(system && system.trim()
                    ? { systemInstruction: { parts: [{ text: system.trim() }] } }
                    : {}),
                generationConfig: {
                    maxOutputTokens: maxTokens,
                    temperature,
                    topP,
                },
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: Number(process.env.GEMINI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
            }
        )).catch((error) => {
            // Gemini reports a bad key as 400 INVALID_ARGUMENT, not 401.
            const providerError = AIProviderError.fromAxios(error, `gemini:${model}`);
            if (error.response?.data?.error?.status === 'INVALID_ARGUMENT'
                && /api key/i.test(error.response?.data?.error?.message ?? '')) {
                providerError.cooldownMs = HARD_COOLDOWN_MS;
            }
            throw providerError;
        });

        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text || !text.trim()) {
            throw new AIProviderError(`${model} returned an empty completion`, {
                provider: 'gemini',
            });
        }

        return text.trim();
    }
}

module.exports = GeminiService;

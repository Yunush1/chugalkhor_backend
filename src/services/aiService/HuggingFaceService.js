const aiHttpClient = require('./httpClient');
const { AIProviderError, HARD_COOLDOWN_MS } = require('./AIProviderError');
const { schedule } = require('./rateLimiter');

// Hugging Face Inference Providers — OpenAI-compatible chat completions router.
// Docs: https://huggingface.co/docs/inference-providers
const HF_ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';
const DEFAULT_MODEL = 'meta-llama/Llama-3.3-70B-Instruct';
const DEFAULT_TIMEOUT_MS = 30000;

class HuggingFaceService {

    static get providerName() {
        return 'huggingface';
    }

    static get isConfigured() {
        return Boolean(process.env.HUGGINGFACE_API_KEY);
    }

    /**
     * Run a chat completion on Hugging Face.
     * @param {object}   params
     * @param {string}  [params.system]      System instruction (persona + rules)
     * @param {Array}   [params.messages]    [{ role: 'user'|'assistant', content }]
     * @param {number}  [params.maxTokens]
     * @param {number}  [params.temperature]
     * @param {number}  [params.topP]
     * @returns {Promise<string>} Assistant text.
     * @throws {AIProviderError} On any failure; `.cooldownMs` says how long to park it.
     */
    static async chat({ system, messages = [], maxTokens = 120, temperature = 0.9, topP = 0.95 }) {
        const apiKey = process.env.HUGGINGFACE_API_KEY;
        if (!apiKey) {
            throw new AIProviderError('HUGGINGFACE_API_KEY is not set in environment', {
                provider: 'huggingface', cooldownMs: HARD_COOLDOWN_MS,
            });
        }

        const model = process.env.HUGGINGFACE_MODEL || DEFAULT_MODEL;

        const response = await schedule(() => aiHttpClient.post(
            HF_ROUTER_URL,
            {
                model,
                messages: HuggingFaceService._normalizeMessages(system, messages),
                max_tokens: maxTokens,
                temperature,
                top_p: topP,
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: Number(process.env.HUGGINGFACE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
            }
        )).catch((error) => {
            throw AIProviderError.fromAxios(error, `huggingface:${model}`);
        });

        const text = response.data?.choices?.[0]?.message?.content;
        if (!text || !text.trim()) {
            throw new AIProviderError(`${model} returned an empty completion`, {
                provider: 'huggingface',
            });
        }

        return text.trim();
    }

    /**
     * Chat models reject blank turns, and several providers behind the router
     * reject two consecutive turns with the same role — merge and trim first.
     */
    static _normalizeMessages(system, messages) {
        const normalized = [];

        if (system && system.trim()) {
            normalized.push({ role: 'system', content: system.trim() });
        }

        for (const message of messages) {
            const content = (message?.content ?? '').trim();
            if (!content) continue;

            const role = message.role === 'assistant' ? 'assistant' : 'user';
            const previous = normalized[normalized.length - 1];

            if (previous && previous.role === role) {
                previous.content += `\n${content}`;
            } else {
                normalized.push({ role, content });
            }
        }

        // The API needs at least one non-system turn to complete from.
        if (!normalized.some(m => m.role !== 'system')) {
            normalized.push({ role: 'user', content: 'Hey!' });
        }

        return normalized;
    }
}

module.exports = HuggingFaceService;

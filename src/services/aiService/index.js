const logger = require('../../utils/logger');
const HuggingFaceService = require('./HuggingFaceService');
const GeminiService = require('./GeminiService');
const { AIProviderError, HARD_COOLDOWN_MS } = require('./AIProviderError');
const { stats } = require('./rateLimiter');

const PROVIDERS = {
    huggingface: HuggingFaceService,
    gemini: GeminiService,
};

const DEFAULT_PROVIDER = 'huggingface';
const DEFAULT_FALLBACK = 'gemini';

// provider name → epoch ms until which we skip it
const cooldowns = new Map();

class AIService {

    /**
     * Generate a chat reply from the configured provider.
     * Falls back to the secondary provider when the primary is unconfigured,
     * cooling down, errors out, or returns nothing.
     *
     * @param {object}   params
     * @param {string}  [params.system]      System instruction (persona + rules)
     * @param {Array}   [params.messages]    [{ role: 'user'|'assistant', content }]
     * @param {number}  [params.maxTokens]
     * @param {number}  [params.temperature]
     * @param {number}  [params.topP]
     * @param {string}  [params.label]       Tag used in logs (e.g. the bot name)
     * @returns {Promise<string|null>} Reply text, or null when every provider failed.
     */
    static async chat({ system, messages = [], maxTokens = 120, temperature = 0.9, topP = 0.95, label = 'bot' }) {
        for (const providerName of AIService._providerOrder()) {
            if (AIService._isCoolingDown(providerName)) continue;

            if (!PROVIDERS[providerName].isConfigured) {
                logger.warn(`[AIService] ${providerName} skipped — API key not configured`);
                continue;
            }

            try {
                const text = await PROVIDERS[providerName].chat({
                    system, messages, maxTokens, temperature, topP,
                });

                if (text) {
                    AIService._clearCooldown(providerName);
                    logger.debug(`[AIService] ${label} reply via ${providerName}`);
                    return text;
                }

            } catch (error) {
                AIService._handleFailure(providerName, error, label);
            }
        }

        const { active, queued } = stats();
        logger.error(
            `[AIService] no provider could answer for ${label} — staying silent ` +
            `(in flight: ${active}, queued: ${queued})`
        );
        return null;
    }

    // ─── Circuit Breaker ─────────────────────────────────────────────────────

    /**
     * A key/quota failure will keep failing for every bot in every room. Park the
     * provider so the chain falls straight through to the fallback instead of
     * re-hitting a dead endpoint on every single message.
     */
    static _handleFailure(providerName, error, label) {
        if (error instanceof AIProviderError && error.shouldCooldown) {
            // Env override applies to hard failures only — a quota blip should
            // stay short regardless of how it's tuned.
            const cooldownMs = error.cooldownMs >= HARD_COOLDOWN_MS
                ? (Number(process.env.AI_PROVIDER_COOLDOWN_MS) || error.cooldownMs)
                : error.cooldownMs;

            cooldowns.set(providerName, Date.now() + cooldownMs);

            logger.error(
                `[AIService] ${providerName} parked for ${Math.round(cooldownMs / 1000)}s — ` +
                `${error.message} (status ${error.status ?? 'n/a'})`
            );
            return;
        }

        logger.warn(`[AIService] ${providerName} failed for ${label} — ${error.message}`);
    }

    static _isCoolingDown(providerName) {
        const until = cooldowns.get(providerName);
        if (!until) return false;

        if (Date.now() >= until) {
            cooldowns.delete(providerName);
            logger.info(`[AIService] ${providerName} cooldown expired — trying it again`);
            return false;
        }

        return true;
    }

    static _clearCooldown(providerName) {
        if (cooldowns.delete(providerName)) {
            logger.info(`[AIService] ${providerName} recovered`);
        }
    }

    /** Primary provider first, then the fallback (AI_FALLBACK_PROVIDER=none disables it). */
    static _providerOrder() {
        const primary = (process.env.AI_PROVIDER || DEFAULT_PROVIDER).toLowerCase();
        const fallback = (process.env.AI_FALLBACK_PROVIDER ?? DEFAULT_FALLBACK).toLowerCase();

        const order = [];

        if (PROVIDERS[primary]) {
            order.push(primary);
        } else {
            logger.warn(`[AIService] unknown AI_PROVIDER "${primary}" — using ${DEFAULT_PROVIDER}`);
            order.push(DEFAULT_PROVIDER);
        }

        if (PROVIDERS[fallback] && !order.includes(fallback)) {
            order.push(fallback);
        }

        return order;
    }

    /**
     * False when every provider is parked or unconfigured — i.e. nothing can
     * answer right now. Callers use this to abandon a bot chain instead of
     * grinding through its remaining rounds producing silence.
     */
    static isAvailable() {
        return AIService._providerOrder().some(
            name => !AIService._isCoolingDown(name) && PROVIDERS[name].isConfigured
        );
    }

    /** Exposed for health checks / debugging. */
    static status() {
        return {
            order: AIService._providerOrder(),
            cooldowns: Object.fromEntries(
                [...cooldowns].map(([name, until]) => [name, new Date(until).toISOString()])
            ),
            ...stats(),
        };
    }
}

module.exports = AIService;

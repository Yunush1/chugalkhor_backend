// How long to park a provider after a given failure, in ms.
//
// 401/403/404 need a human (bad key, revoked token, model gone) so we back off
// hard. 402 on a free tier is a metered window that refills on its own — parking
// it for 15 minutes would take the bots offline far longer than the actual
// outage, so it gets a short breather instead.
const HARD_COOLDOWN_MS = 15 * 60 * 1000;
const QUOTA_COOLDOWN_MS = 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 30 * 1000;

const COOLDOWN_BY_STATUS = {
    401: HARD_COOLDOWN_MS,
    402: QUOTA_COOLDOWN_MS,
    403: HARD_COOLDOWN_MS,
    404: HARD_COOLDOWN_MS,
    429: RATE_LIMIT_COOLDOWN_MS, // only reached once retries are exhausted
};

class AIProviderError extends Error {
    constructor(message, { provider, status = null, cooldownMs = 0 } = {}) {
        super(message);
        this.name = 'AIProviderError';
        this.provider = provider;
        this.status = status;
        this.cooldownMs = cooldownMs;
    }

    /** True when retrying immediately is pointless — the caller should park this provider. */
    get shouldCooldown() {
        return this.cooldownMs > 0;
    }

    /** Build from an axios failure. */
    static fromAxios(error, provider) {
        const status = error.response?.status ?? null;
        const body = error.response?.data;
        const detail = typeof body === 'string'
            ? body
            : (body?.error?.message ?? body?.error ?? error.message);

        return new AIProviderError(
            `${error.message}${detail && detail !== error.message ? ` — ${detail}` : ''}`,
            { provider, status, cooldownMs: COOLDOWN_BY_STATUS[status] ?? 0 }
        );
    }
}

module.exports = {
    AIProviderError,
    HARD_COOLDOWN_MS,
    QUOTA_COOLDOWN_MS,
};

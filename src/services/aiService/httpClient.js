const axios = require('axios');
const { default: axiosRetry } = require('axios-retry');
const logger = require('../../utils/logger');

// Dedicated client so retry behaviour applies to AI calls only, instead of
// mutating the global axios instance the rest of the app shares.
const aiHttpClient = axios.create();

axiosRetry(aiHttpClient, {
    retries: 2,
    // Exponential with jitter — a flat 1s/2s makes every queued bot retry in
    // lockstep, which is what turns one rate limit into a burst of them.
    retryDelay: (retryCount, error) => {
        const retryAfter = Number(error.response?.headers?.['retry-after']);
        if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
        return (2 ** retryCount) * 500 + Math.random() * 400;
    },
    retryCondition: (error) => {
        // No response at all → network blip, worth another go.
        if (!error.response) return true;

        const status = error.response.status;
        // 401/402/403/404 are credential, billing or model problems: retrying
        // cannot fix them, it only burns quota. Everything else 4xx is our bug.
        return status === 408 || status === 429 || status >= 500;
    },
    onRetry: (retryCount, error) => {
        logger.warn(
            `[AIService] retry ${retryCount} after ` +
            `${error.response?.status ?? error.code ?? error.message}`
        );
    },
});

module.exports = aiHttpClient;

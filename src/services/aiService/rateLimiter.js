const logger = require('../../utils/logger');

// A room can fire several bot replies back to back, and several rooms can be
// active at once — that burst is what trips provider rate limits. Every AI call
// goes through this gate: at most N in flight, and at least MIN_GAP_MS between
// the start of one call and the next.
const MAX_CONCURRENT = Number(process.env.AI_MAX_CONCURRENT) || 2;
const MIN_GAP_MS = Number(process.env.AI_MIN_CALL_GAP_MS) || 300;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let active = 0;
let lastStartedAt = 0;
const waiters = [];

function startNext() {
    if (active >= MAX_CONCURRENT) return;

    const waiter = waiters.shift();
    if (!waiter) return;

    active++;
    waiter();
}

/**
 * Queue an AI call. Resolves/rejects with whatever `task` does.
 * @param {() => Promise<any>} task
 */
function schedule(task) {
    return new Promise((resolve, reject) => {
        waiters.push(async () => {
            try {
                // Reserve the slot synchronously. Computing the wait against a
                // shared `lastStartedAt` *after* sleeping lets several waiters
                // wake onto the same instant, which is the burst we're avoiding.
                const now = Date.now();
                const startAt = Math.max(now, lastStartedAt + MIN_GAP_MS);
                lastStartedAt = startAt;

                if (startAt > now) await sleep(startAt - now);

                resolve(await task());
            } catch (error) {
                reject(error);
            } finally {
                active--;
                startNext();
            }
        });

        if (waiters.length > MAX_CONCURRENT * 4) {
            logger.warn(`[AIService] ${waiters.length} AI calls queued — provider is the bottleneck`);
        }

        startNext();
    });
}

module.exports = { schedule, stats: () => ({ active, queued: waiters.length }) };

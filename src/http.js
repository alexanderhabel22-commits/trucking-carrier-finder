// fetch() with a browser-like User-Agent, a timeout, and retries with backoff.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/**
 * GETs a page and returns { status, text }. 404 and 410 come back as a
 * result (they mean "no such page" on these sites), other errors retry.
 */
export async function fetchText(url, { timeoutMs = 30_000, retries = 3, log, headers = {} } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', ...headers },
                signal: AbortSignal.timeout(timeoutMs),
                redirect: 'follow',
            });
            if (res.status === 404 || res.status === 410) return { status: res.status, text: '' };
            if (!res.ok) {
                const err = new Error(`HTTP ${res.status} from ${new URL(url).host}`);
                err.status = res.status;
                // 403 means we are blocked; retrying soon rarely helps, but one retry is cheap.
                if (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 403) err.fatal = true;
                throw err;
            }
            return { status: res.status, text: await res.text() };
        } catch (err) {
            lastError = err;
            if (err.fatal || attempt === retries) break;
            const wait = 1500 * 2 ** attempt;
            log?.debug?.(`Request to ${url} failed (${err.message}); retrying in ${wait / 1000}s`);
            await sleep(wait);
        }
    }
    throw lastError;
}

/** Runs fn over items with at most `limit` running at once. */
export async function mapPool(items, limit, fn) {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            await fn(items[i], i);
        }
    });
    await Promise.all(workers);
}

/** POSTs or GETs JSON with retries. Throws on HTTP errors. */
export async function fetchJson(url, { method = 'GET', body, headers = {}, timeoutMs = 60_000, retries = 3, log } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, {
                method,
                body,
                headers: { Accept: 'application/json', 'User-Agent': 'trucking-carrier-finder (Apify Actor)', ...headers },
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (!res.ok) {
                const err = new Error(`HTTP ${res.status} from ${new URL(url).host}`);
                if (res.status >= 400 && res.status < 500 && res.status !== 429) err.fatal = true;
                throw err;
            }
            return await res.json();
        } catch (err) {
            lastError = err;
            if (err.fatal || attempt === retries) break;
            const wait = 2000 * 2 ** attempt;
            log?.warning?.(`Request to ${new URL(url).host} failed (${err.message}); retrying in ${wait / 1000}s`);
            await sleep(wait);
        }
    }
    throw lastError;
}

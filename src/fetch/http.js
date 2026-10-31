// Polite HTTP client for the refresh job: browser-like headers, timeout, retries
// with backoff, a global concurrency limit, a hard request budget (so we can
// never hammer a site), and a small on-disk cache.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export function createClient({ cacheDir = '.cache/http', concurrency = 5, budget = 5000, minGapMs = 120, deadline = Infinity, log = () => {} } = {}) {
  let used = 0;
  const hosts = new Map(); // host -> { active, lastStart, queue }
  const stats = new Map(); // host -> { ok, fail, cached, lastError }

  const stat = (host) => {
    if (!stats.has(host)) stats.set(host, { ok: 0, fail: 0, cached: 0, lastError: null });
    return stats.get(host);
  };
  const hs = (host) => {
    if (!hosts.has(host)) hosts.set(host, { active: 0, lastStart: 0, queue: [] });
    return hosts.get(host);
  };

  // each website gets its own limit, so slow sites don't hold up the others
  async function slot(host) {
    const h = hs(host);
    if (h.active >= concurrency) await new Promise((r) => h.queue.push(r));
    h.active++;
    const wait = h.lastStart + minGapMs - Date.now();
    h.lastStart = Math.max(Date.now(), h.lastStart + minGapMs);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  function release(host) {
    const h = hs(host);
    h.active--;
    const next = h.queue.shift();
    if (next) next();
  }

  /**
   * @param {string} url
   * @param {{ method?: string, body?: any, headers?: Record<string,string>, ttlMin?: number, json?: boolean, retries?: number }} [opt]
   */
  async function get(url, opt = {}) {
    const { method = 'GET', body, headers = {}, ttlMin = 60, json = true, retries = 2 } = opt;
    const host = new URL(url).host;
    const key = createHash('sha1').update(`${method} ${url} ${body ? JSON.stringify(body) : ''}`).digest('hex');
    const file = join(cacheDir, `${key}.json`);
    if (ttlMin > 0) {
      try {
        const c = JSON.parse(await readFile(file, 'utf8'));
        if (Date.now() - c.at < ttlMin * 60000) { stat(host).cached++; return c.data; }
      } catch { /* no cache */ }
    }
    if (used >= budget) throw new Error(`request budget (${budget}) exhausted`);
    if (Date.now() > deadline) throw new Error('time limit reached');
    used++;
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      await slot(host);
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 25000);
        const res = await fetch(url, {
          method,
          headers: {
            'user-agent': UA,
            accept: json ? 'application/json, text/plain, */*' : '*/*',
            'accept-language': 'de-AT,de;q=0.9,en;q=0.8',
            ...(body ? { 'content-type': 'application/json' } : {}),
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status}`), { retry: true });
        if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { retry: false });
        const data = json ? await res.json() : await res.text();
        stat(host).ok++;
        if (ttlMin > 0) {
          await mkdir(cacheDir, { recursive: true });
          await writeFile(file, JSON.stringify({ at: Date.now(), url, data }));
        }
        return data;
      } catch (e) {
        lastErr = e;
        const retry = e.retry !== false && attempt < retries;
        log(`  ! ${host} ${e.cause?.code || e.message}${retry ? ' (retrying)' : ''}`);
        if (!retry) break;
        await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt + Math.random() * 500));
      } finally {
        release(host);
      }
    }
    const s = stat(host);
    s.fail++;
    s.lastError = lastErr?.cause?.code || lastErr?.message || String(lastErr);
    throw lastErr;
  }

  return { get, stats, used: () => used };
}

/** Run `fn` over items with Promise.allSettled semantics, returning [ok values]. */
export async function settle(items, fn) {
  const res = await Promise.allSettled(items.map(fn));
  return res.filter((r) => r.status === 'fulfilled').map((r) => r.value);
}

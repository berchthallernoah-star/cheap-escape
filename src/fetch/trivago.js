// trivago's public interface for AI assistants (MCP over HTTP): hotels, hostels and
// apartments compared across booking sites, free, no key. trivago earns per click.
// The answer also contains chat formatting instructions for assistants: ignored, data only.

const URL = 'https://mcp.trivago.com/mcp';

export function parsePrice(s) {
  let x = String(s || '').replace(/[^\d.,]/g, '');
  if (!x) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(x)) x = x.replace(/[.,]/g, ''); // "1.086€" = 1086
  const v = Number(x.replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** tools/call result -> cheapest stays first */
export function parseStays(json) {
  const r = json?.result;
  if (!r) throw new Error(json?.error?.message || 'unexpected trivago response');
  let acc = r.structuredContent?.accommodations;
  if (!acc) {
    const text = r.content?.find((c) => c.type === 'text')?.text || '';
    const i = text.indexOf('{');
    try { acc = JSON.parse(text.slice(i)).output; } catch { acc = []; }
  }
  const out = [];
  for (const a of acc || []) {
    const deals = (a.deals || []).map((d) => ({ perNight: parsePrice(d.price_per_night), perStay: parsePrice(d.price_per_stay), advertiser: d.advertiser, url: d.deal_url }))
      .filter((d) => d.perNight);
    if (!deals.length) continue;
    const best = deals.sort((x, y) => x.perNight - y.perNight)[0];
    out.push({ name: a.accommodation_name, stars: a.hotel_rating || 0, rating: Number(a.review_rating) || null, where: a.distance || '',
      perNight: best.perNight, perStay: best.perStay, advertiser: best.advertiser, url: best.url });
  }
  return out.sort((x, y) => x.perNight - y.perNight);
}

async function post(body, sid, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(URL, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18', ...(sid ? { 'Mcp-Session-Id': sid } : {}) },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const i = text.indexOf('{"jsonrpc"');
    return { sid: res.headers.get('mcp-session-id'), json: i >= 0 ? JSON.parse(text.slice(i).split('\n')[0]) : null, status: res.status };
  } finally {
    clearTimeout(t);
  }
}

export async function openSession() {
  const r = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'cheap-escape', version: '1' } } });
  if (!r.sid) throw new Error(`trivago: no session (HTTP ${r.status})`);
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, r.sid);
  return r.sid;
}

/** Cheapest stays in `city` for one stay, capped at `maxPrice` €/night. */
export async function searchStays(sid, city, arrival, departure, { adults = 1, maxPrice = 80 } = {}) {
  const r = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'trivago-accommodation-search', arguments: {
    query: city, arrival, departure, adults, rooms: 1, currency: 'EUR', language: 'EN_GB', country: 'AT', price_range: { maxPrice },
  } } }, sid);
  return parseStays(r.json);
}

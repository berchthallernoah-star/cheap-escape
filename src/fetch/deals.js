// Deal-hunter feeds (RSS): human-curated deals incl. price mistakes for flights AND hotels.
// Travel-Dealz, Mydealz (travel), Urlaubspiraten AT, Fly4free. Public RSS feeds, meant to be read.

export const FEEDS = [
  { id: 'travel-dealz', name: 'Travel-Dealz', url: 'https://travel-dealz.de/feed/' },
  { id: 'mydealz', name: 'Mydealz Reisen', url: 'https://www.mydealz.de/rss/gruppe/reisen' },
  { id: 'urlaubspiraten', name: 'Urlaubspiraten', url: 'https://www.urlaubspiraten.at/feed' },
  { id: 'fly4free', name: 'Fly4free', url: 'https://www.fly4free.com/feed/' },
];

const MISTAKE = /error\s*fare|preisfehler|fehlerpreis|mistake\s*fare|price\s*error|pricing\s*error|glitch|fehler\s*bei|bug\s*fare|fat\s*finger|zu\s*billig|irrt[uü]m/i;
const HOTEL = /hotel|hostel|apartment|unterkunft|übernachtung|uebernachtung|nacht|nächte|naechte|night|airbnb|resort|ferienwohnung|zimmer|suite|b&b/i;
const FLIGHT = /flug|flüge|fluege|flight|fares?\b|oneway|airline|ryanair|wizz|easyjet|lufthansa|austrian|eurowings/i;
const NEAR = /salzburg|münchen|muenchen|munich|wien|vienna|linz|innsbruck|memmingen|bratislava|nürnberg|nuernberg|nuremberg|österreich|oesterreich|austria|graz|klagenfurt/i;

function text(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lowest € amount mentioned in a title ("ab 49€", "€65/double", "298,50€ p.P."). */
export function priceIn(title) {
  const nums = [];
  const re = /(?:€\s*(\d{1,5}(?:[.,]\d{1,2})?))|(?:(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euro))/gi;
  let m;
  while ((m = re.exec(title))) nums.push(Number(String(m[1] || m[2]).replace(/\.(?=\d{3}\b)/, '').replace(',', '.')));
  const ok = nums.filter((x) => Number.isFinite(x) && x > 0);
  return ok.length ? Math.min(...ok) : null;
}

/** RSS xml -> [{ title, link, date, categories, price, mistake, hotel, flight, nearHome }] */
export function parseFeed(xml, feed) {
  const items = [];
  for (const block of String(xml).match(/<item[\s>][\s\S]*?<\/item>/g) || []) {
    const get = (tag) => text((block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1]);
    const title = get('title');
    const link = get('link') || (block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/) || [])[1] || '';
    if (!title || !/^https?:\/\//.test(link.trim())) continue;
    const categories = [...block.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/g)].map((m) => text(m[1])).filter(Boolean);
    const all = `${title} ${categories.join(' ')} ${get('description').slice(0, 400)}`;
    const date = Date.parse(get('pubDate'));
    items.push({
      source: feed.name,
      title,
      link: link.trim(),
      date: Number.isFinite(date) ? new Date(date).toISOString() : null,
      categories: categories.slice(0, 6),
      price: priceIn(title),
      mistake: MISTAKE.test(all),
      hotel: HOTEL.test(title) || categories.some((c) => /hotel/i.test(c)),
      flight: FLIGHT.test(all),
      nearHome: NEAR.test(all),
    });
  }
  return items;
}

export async function fetchDeals(http, maxAgeDays = 14, now = Date.now()) {
  const out = [];
  let failed = 0;
  await Promise.all(FEEDS.map(async (f) => {
    try {
      out.push(...parseFeed(await http.get(f.url, { json: false, ttlMin: 30 }), f));
    } catch { failed++; }
  }));
  const fresh = out.filter((d) => !d.date || now - Date.parse(d.date) <= maxAgeDays * 86400000);
  const seen = new Set();
  return {
    failed,
    items: fresh
      .filter((d) => (seen.has(d.link) ? false : seen.add(d.link)))
      .sort((a, b) => (b.mistake - a.mistake) || (b.nearHome - a.nearHome) || String(b.date).localeCompare(String(a.date))),
  };
}

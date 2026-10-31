// Phone notifications via ntfy.sh (free app "ntfy"). Sends only NEW deals / possible
// price mistakes, never the same line twice. Does nothing without the NTFY_TOPIC secret.
//   NTFY_TOPIC=... node src/site/notify.js out/alerts.md .state/notified.json https://<site>
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export function newLines(alertsMd, seen) {
  const lines = alertsMd.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- '));
  return lines.filter((l) => !seen.includes(l));
}

if (process.argv[1]?.endsWith('src/site/notify.js')) {
  const [alertsPath, statePath, siteUrl] = process.argv.slice(2);
  const topic = process.env.NTFY_TOPIC;
  let seen = [];
  try { seen = JSON.parse(await readFile(statePath, 'utf8')); } catch { /* first run */ }
  let md = '';
  try { md = await readFile(alertsPath, 'utf8'); } catch { console.log('no alerts file'); process.exit(0); }
  const fresh = newLines(md, seen);
  if (!fresh.length) { console.log('nothing new'); process.exit(0); }
  const mistakes = fresh.filter((l) => md.indexOf(l) > md.indexOf('POSSIBLE PRICE MISTAKES') && md.includes('POSSIBLE PRICE MISTAKES'));
  if (topic) {
    const body = fresh.slice(0, 6).map((l) => l.slice(2).replace(/\s+/g, ' ')).join('\n');
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: { Title: mistakes.length ? 'Cheap Escape: possible price mistake' : 'Cheap Escape: new deals', Priority: mistakes.length ? 'high' : 'default', Click: siteUrl || '', Tags: mistakes.length ? 'rotating_light' : 'airplane' },
      body,
    });
    console.log(`ntfy: HTTP ${res.status}, ${fresh.length} new line(s)`);
  } else {
    console.log(`${fresh.length} new line(s); set the NTFY_TOPIC secret to get them on your phone`);
  }
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify([...seen, ...fresh].slice(-500)));
}

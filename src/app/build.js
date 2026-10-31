// Builds the phone app: one self-contained HTML file with the planner and the
// fare snapshot embedded.
//   node src/app/build.js [--snapshot dist/snapshot.json] [--out dist/cheap-escape.html]
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };

export async function buildApp({ snapshotPath = 'dist/snapshot.json', out = 'dist/cheap-escape.html' } = {}) {
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  } catch {
    snapshot = { version: 1, live: true, generatedAt: null, sources: [], airports: {}, flights: [], timed: [] };
  }
  const bundle = await build({ entryPoints: [join(here, 'main.js')], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none' });
  const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const json = JSON.stringify(snapshot).replace(/</g, '\\u003c');
  const tpl = await readFile(join(here, 'template.html'), 'utf8');
  const html = tpl.replace('/*SNAPSHOT*/', () => json).replace('/*APP*/', () => js);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html);
  return { out, bytes: Buffer.byteLength(html), flights: snapshot.flights.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await buildApp({ snapshotPath: arg('snapshot', 'dist/snapshot.json'), out: arg('out', 'dist/cheap-escape.html') });
  console.log(`built ${r.out} (${Math.round(r.bytes / 1024)} KB, ${r.flights} flights)`);
}

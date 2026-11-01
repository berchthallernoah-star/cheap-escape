// LOCKS THE APP WITH YOUR PASSWORD before it goes online.
// AES-256-GCM; the key comes from your password via PBKDF2-SHA256 (600,000 rounds).
// The published index.html contains only the encrypted app plus a small unlock screen;
// without the password nobody (GitHub included) can read it.
//
//   PAGE_PASSWORD=... node src/site/encrypt.js out/cheap-escape.html _site/index.html

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pbkdf2Sync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ITERATIONS = 600000;
const here = dirname(fileURLToPath(import.meta.url));

export function wrapDocument(fragment) {
  return '<!doctype html><html lang="de"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<meta name="theme-color" content="#fbf6f1" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#121012" media="(prefers-color-scheme: dark)">'
    + '<style>:root{color-scheme:light dark}body{margin:0}[hidden]{display:none!important}</style>'
    + `</head><body>${fragment}</body></html>`;
}

export function encrypt(text, password, saltB64, iterations = ITERATIONS) {
  const key = pbkdf2Sync(password, Buffer.from(saltB64, 'base64'), iterations, 32, 'sha256');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final(), c.getAuthTag()]);
  return { v: 1, iterations, salt: saltB64, iv: iv.toString('base64'), data: data.toString('base64') };
}

/** Node-side check (tests): same algorithm the browser uses. */
export function decrypt(payload, password) {
  const key = pbkdf2Sync(password, Buffer.from(payload.salt, 'base64'), payload.iterations, 32, 'sha256');
  const buf = Buffer.from(payload.data, 'base64');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString('utf8');
}

export async function lockPage(appHtml, password) {
  const salt = (await readFile(join(here, 'salt.txt'), 'utf8')).trim();
  const payload = encrypt(wrapDocument(appHtml), password, salt);
  const shell = await readFile(join(here, 'unlock.html'), 'utf8');
  return shell.replace('/*PAYLOAD*/null', () => JSON.stringify(payload));
}

if (process.argv[1]?.endsWith('src/site/encrypt.js')) {
  const [input, output] = process.argv.slice(2);
  const password = process.env.PAGE_PASSWORD || '';
  if (password.length < 8) {
    console.error('PAGE_PASSWORD is missing or shorter than 8 characters. Refusing to publish an unlocked page.');
    process.exit(1);
  }
  const html = await lockPage(await readFile(input, 'utf8'), password);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html);
  await writeFile(join(dirname(output), '.nojekyll'), '');
  console.log(`locked ${input} -> ${output} (${Math.round(html.length / 1024)} KB)`);
}

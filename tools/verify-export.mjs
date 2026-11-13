/* End-to-end export check.
 *
 * Builds nothing and assumes nothing: it serves the committed `studio/` build,
 * drives the real export dialog, and inspects the bytes that come out. Run it
 * after `npm run build`:
 *
 *   node tools/verify-export.mjs
 *   node tools/verify-export.mjs --container=webm
 *
 * Needs a Chromium with WebCodecs. Set CHROME_PATH to use a local one.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studioDir = path.join(root, 'studio');
const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kinemorph-export-'));
const container = (process.argv.find((a) => a.startsWith('--container=')) ?? '--container=mp4').split('=')[1];
const port = 4319;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let file = path.join(studioDir, decodeURIComponent(req.url.split('?')[0]));
  if (file.endsWith('/')) file += 'index.html';
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((resolve) => server.listen(port, resolve));

const puppeteer = await import('puppeteer-core').catch(() => null);
if (!puppeteer) {
  console.error('puppeteer-core is not installed. Run: npm i -D puppeteer-core');
  process.exit(1);
}

const executablePath = process.env.CHROME_PATH
  || ['/usr/local/bin/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));

if (!executablePath) {
  console.error('No Chromium found. Set CHROME_PATH.');
  process.exit(1);
}

const browser = await puppeteer.default.launch({
  executablePath,
  headless: 'shell',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });

const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });

/* a two-second show keeps the software renderer's job short */
await page.evaluate(() => {
  localStorage.setItem('kinemorph.project.v1', JSON.stringify({
    schema: 1, id: 'p_verify', title: 'Export verification', style: 'neon', mood: 'calm',
    pace: 1, transition: 'none',
    scenes: [{
      id: 's1', title: 'Verification frame', body: '', motif: 'sun', dur: 2,
      layout: 'split', transition: 'none', enter: 'none', ease: 'linear', cam: 'none', accent: '#ff2d95'
    }]
  }));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));

const capabilities = await page.evaluate(async () => {
  const out = { videoEncoder: typeof VideoEncoder !== 'undefined', codecs: [] };
  if (!out.videoEncoder) return out;
  for (const codec of ['avc1.4d0028', 'vp09.00.10.08']) {
    try {
      const support = await VideoEncoder.isConfigSupported({ codec, width: 1280, height: 720, bitrate: 6e6, framerate: 30 });
      if (support.supported) out.codecs.push(codec);
    } catch { /* ignore */ }
  }
  return out;
});
console.log('capabilities:', JSON.stringify(capabilities));

await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Export video'))?.click());
await new Promise((r) => setTimeout(r, 400));
await page.select('.modal-card.export select', container);
await page.evaluate((ext) => {
  [...document.querySelectorAll('.modal-card.export button')].find((b) => b.textContent.includes(`Export ${ext.toUpperCase()}`))?.click();
}, container);

const startedAt = Date.now();
let files = [];
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 1500));
  files = fs.readdirSync(downloadDir).filter((f) => !f.endsWith('.crdownload'));
  if (files.length) break;
}

const result = await page.evaluate(() => document.querySelector('.result')?.textContent ?? '');
console.log('dialog:', result);
console.log('wall:', ((Date.now() - startedAt) / 1000).toFixed(1) + 's');

/* the WAV stem, independent of the video */
await page.evaluate(() => [...document.querySelectorAll('.modal-card.export button')].find((b) => b.textContent.includes('Download WAV'))?.click());
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (fs.readdirSync(downloadDir).some((f) => f.endsWith('.wav'))) break;
}

files = fs.readdirSync(downloadDir).filter((f) => !f.endsWith('.crdownload'));
await browser.close();
server.close();

const checks = [];
for (const file of files) {
  const bytes = fs.readFileSync(path.join(downloadDir, file));
  const head = bytes.subarray(0, 12);
  const hex = head.toString('hex');
  if (file.endsWith('.mp4')) checks.push([file, bytes.length, hex.startsWith('0000001c66747970') ? 'ftyp/isom OK' : 'BAD HEADER', hex]);
  else if (file.endsWith('.webm')) checks.push([file, bytes.length, hex.startsWith('1a45dfa3') ? 'EBML/Matroska OK' : 'BAD HEADER', hex]);
  else if (file.endsWith('.wav')) checks.push([file, bytes.length, bytes.subarray(8, 12).toString() === 'WAVE' ? 'RIFF/WAVE OK' : 'BAD HEADER', hex]);
}

console.log('\noutputs:');
for (const [name, size, verdict, hex] of checks) {
  console.log(`  ${name.padEnd(34)} ${String(size).padStart(9)} bytes  ${verdict}  ${hex}`);
}
if (errors.length) console.log('page errors:', JSON.stringify(errors.slice(0, 3)));

const expected = container === 'webm' ? ['.webm', '.wav'] : ['.mp4', '.wav'];
const missing = expected.filter((ext) => !files.some((f) => f.endsWith(ext)));
if (missing.length) {
  console.error('\nFAILED — missing:', missing.join(', '));
  process.exit(1);
}
if (checks.some(([, , verdict]) => String(verdict).startsWith('BAD'))) {
  console.error('\nFAILED — a container header is wrong');
  process.exit(1);
}
console.log('\nOK — every expected output exists and has a valid header.');

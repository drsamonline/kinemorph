/* Keeps MANIFEST.json in step with the tree — same convention as the rest of the fleet.
 *   node tools/manifest.mjs          rewrite it
 *   node tools/manifest.mjs --check  fail if a file is missing or unlisted
 *                                    (content drift is reported, not fatal)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/* keep this in step with .gitignore — the manifest must only list tracked files */
const SKIP = new Set(['.git', 'node_modules', '.DS_Store', 'test-results', 'playwright-report', 'dist']);
const SKIP_FILES = new Set(['MANIFEST.json']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

function classify(path) {
  if (path.startsWith('studio/')) return 'generated';
  if (path.startsWith('packages/') || path.startsWith('apps/')) return 'source';
  if (path.startsWith('assets/') || /\.(png|svg|ico)$/.test(path)) return 'asset';
  if (path.startsWith('tools/') || path.startsWith('.github/')) return 'tooling';
  return 'hand';
}

const files = walk(root).filter((f) => !SKIP_FILES.has(f)).sort();
const next = { schema: 1, generator: 'tools/manifest.mjs', files: {} };
for (const path of files) {
  next.files[path] = {
    sha256: createHash('sha256').update(readFileSync(join(root, path))).digest('hex'),
    class: classify(path)
  };
}

const manifestPath = join(root, 'MANIFEST.json');
const check = process.argv.includes('--check');

if (!check) {
  writeFileSync(manifestPath, JSON.stringify(next, null, 2) + '\n');
  console.log(`MANIFEST.json written — ${files.length} files.`);
  process.exit(0);
}

const prev = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { files: {} };
const missing = files.filter((f) => !prev.files[f]);
const extra = Object.keys(prev.files).filter((f) => !files.includes(f));
const drifted = files.filter((f) => prev.files[f] && prev.files[f].sha256 !== next.files[f].sha256);

if (missing.length) console.error('Unlisted files: ' + missing.slice(0, 8).join(', '));
if (extra.length) console.error('Listed but absent: ' + extra.slice(0, 8).join(', '));
if (drifted.length) console.warn(`Changed since the manifest (${drifted.length}): ${drifted.slice(0, 5).join(', ')}${drifted.length > 5 ? '…' : ''}`);

if (missing.length || extra.length) {
  console.error('Run: node tools/manifest.mjs');
  process.exit(1);
}
console.log(`MANIFEST.json covers all ${files.length} files.`);

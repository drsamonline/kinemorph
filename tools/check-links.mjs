/* Verifies that every local href/src in the published pages resolves.
 * Runs after `npm run build` in CI. No browser needed.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['index.html', '404.html', 'studio/index.html', 'studio/selftest.html', 'studio/harness.html'];
const problems = [];

const strip = (v) => v.split('?')[0].split('#')[0];

for (const page of pages) {
  const file = join(root, page);
  if (!existsSync(file)) { problems.push(`${page} is missing — did the build run?`); continue; }
  const html = readFileSync(file, 'utf8');
  for (const [, raw] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:|data:|#|\/)/.test(raw)) continue;
    const target = strip(raw);
    if (!target) continue;
    if (!existsSync(resolve(dirname(file), target))) problems.push(`${page} → ${raw}`);
  }
}

const pagesJson = JSON.parse(readFileSync(join(root, 'PAGES.json'), 'utf8'));
for (const entry of pagesJson.pages) {
  if (!existsSync(join(root, entry.file))) problems.push(`PAGES.json → ${entry.file} does not exist`);
}

/* the built studio must not depend on a dev server */
const studioIndex = readFileSync(join(root, 'studio/index.html'), 'utf8');
if (!/src="\.\/assets\//.test(studioIndex)) {
  problems.push('studio/index.html does not reference ./assets — base is probably wrong');
}

if (problems.length) {
  console.error(`Problems (${problems.length}):`);
  problems.forEach((p) => console.error('  ' + p));
  process.exit(1);
}
console.log(`OK — ${pages.length} pages, ${pagesJson.pages.length} declared, studio build present.`);

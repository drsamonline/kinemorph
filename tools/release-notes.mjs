/* Prints the CHANGELOG section for one version, for a GitHub release body.
 *
 *   node tools/release-notes.mjs 0.10.0
 *   node tools/release-notes.mjs v0.10.0      (the tag form)
 *
 * Exits non-zero if the section is missing, so a release cannot be published
 * from a changelog that never recorded it.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wanted = (process.argv[2] ?? '').replace(/^v/, '');

if (!wanted) {
  console.error('usage: node tools/release-notes.mjs <version>');
  process.exit(2);
}

const text = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
const lines = text.split('\n');

const start = lines.findIndex((line) => line.startsWith(`## [${wanted}]`));
if (start === -1) {
  console.error(`No section for ${wanted} in CHANGELOG.md — record the release before tagging it.`);
  process.exit(1);
}

let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i].startsWith('## [')) { end = i; break; }
}

const body = lines.slice(start, end).join('\n').trim();
process.stdout.write(body + '\n');

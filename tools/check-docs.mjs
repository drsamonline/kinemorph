/* Verifies that the numbers in the prose match the numbers in the code.
 *
 * A capability count in a README is a claim about `packages/core/src/model.ts`.
 * Nothing read those claims, and the handover that withdrew a parity claim
 * ("four motifs, one transition and three moods short") was itself short one
 * transition: Kinemorph has no `zoom` and no `blinds`, so it is two short, and
 * the 8-versus-7 in the capability table compared a count that excluded `none`
 * with one that included it.
 *
 * No browser needed. Runs after typecheck in CI, beside check-links.mjs.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/* ---- the source of truth: the id unions in model.ts ---- */
const model = read('packages/core/src/model.ts');
const ids = (name) => {
  const m = model.match(new RegExp(`export const ${name} = \\[([^\\]]+)\\] as const`));
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};

const REAL = {
  styles: ids('STYLE_IDS'),
  motifs: ids('MOTIF_IDS'),
  transitions: ids('TRANSITION_IDS'),
  entrances: ids('ENTER_IDS'),
  easings: ids('EASE_IDS'),
  textfx: ids('TEXTFX_IDS'),
  visuals: ids('VISUAL_IDS'),
  aspects: ids('ASPECT_IDS')
};

for (const [k, v] of Object.entries(REAL)) {
  if (!v || !v.length) problems.push(`model.ts: ${k} could not be read`);
}

/* `none` and `silent` are real options, so they are counted, and counted out loud. */
const real = (list) => list.filter((x) => x !== 'none');
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve'];

const moods = [...read('packages/core/src/moods.ts').matchAll(/^  ([a-z]+): \{ label:/gm)]
  .map((m) => m[1]);

const CLAIMS = [
  // [file, regex, actual, what it claims]
  ['README.md', /\*\*(\d+) art styles\*\*/, REAL.styles.length, 'art styles'],
  ['README.md', /\*\*(\d+) text effects\*\*/, REAL.textfx.length, 'text effects'],
  ['README.md', /\*\*(\d+) diagrams\*\*/, REAL.visuals.length - 1, 'diagrams (visuals minus motif)'],
  ['README.md', /\*\*(\d+) formats\*\*/, REAL.aspects.length, 'formats'],
  ['README.md', /or (\d+) motifs/, REAL.motifs.length, 'motifs'],
  ['docs/testing.md', /All \*\*(\d+)\*\* style/, REAL.styles.length * REAL.motifs.length,
    'signature frames'],
  ['docs/testing.md', /\((\d+) styles × (\d+) motifs\)/, [REAL.styles.length, REAL.motifs.length],
    'the frame arithmetic']
];

for (const [file, rx, want, what] of CLAIMS) {
  const text = read(file);
  const m = text.match(rx);
  if (!m) {
    problems.push(`${file}: no claim found for ${what} — did the wording change?`);
    continue;
  }
  const got = Array.isArray(want) ? m.slice(1).map(Number) : [Number(m[1])];
  const expect = Array.isArray(want) ? want : [want];
  got.forEach((n, i) => {
    if (n !== expect[i]) {
      problems.push(`${file}: says ${n} ${what}, model.ts has ${expect[i]}`);
    }
  });
}

/* "Seven moods" is true only if the reader knows Silent is one of them. */
const moodClaim = read('README.md').match(/Seeded score\*\* \| (\w+) moods/);
if (!moodClaim) {
  problems.push('README.md: no mood claim found — did the wording change?');
} else {
  const claimed = words.indexOf(moodClaim[1].toLowerCase());
  if (claimed !== moods.length) {
    problems.push(`README.md: says ${moodClaim[1]} moods, moods.ts defines ${moods.length}`);
  }
  if (!/including Silent/i.test(read('README.md'))) {
    problems.push('README.md: the mood count must say that Silent is one of them');
  }
}

/* The transitions row is the one that was wrong, so it must state its convention. */
const transitions = read('README.md').match(/\*\*(\d+) transitions\*\*/);
if (!transitions) {
  problems.push('README.md: no transitions row — the count that was wrong is not stated');
} else {
  const n = Number(transitions[1]);
  if (n !== real(REAL.transitions).length) {
    problems.push(`README.md: says ${n} transitions, model.ts has ` +
      `${real(REAL.transitions).length} plus none`);
  }
}

if (problems.length) {
  console.error(`Problems (${problems.length}):`);
  problems.forEach((p) => console.error('  ' + p));
  process.exit(1);
}
console.log(`OK — ${CLAIMS.length + 2} claims read against model.ts: ` +
  `${REAL.motifs.length} motifs, ${real(REAL.transitions).length} transitions plus none, ` +
  `${moods.length} moods including Silent, ${REAL.styles.length} styles.`);

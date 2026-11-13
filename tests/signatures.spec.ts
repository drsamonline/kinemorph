import { expect, test } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Golden-frame coverage: every style × motif renders, and its colour signature
 * stays close to the committed reference.
 *
 * The signature is an 8×5 grid of mean RGB plus a non-blank ratio, so it is
 * tolerant of anti-aliasing and driver differences while still catching a style
 * that renders blank, a motif that throws, or a palette that drifts.
 *
 * Regenerate after an intentional visual change:
 *   UPDATE_SIGNATURES=1 npx playwright test signatures
 */

const FILE = join(process.cwd(), 'tests', 'signatures.json');
const CHANNEL_TOLERANCE = 16;
const COVERAGE_TOLERANCE = 0.14;

type Matrix = Record<string, Record<string, number[]>>;

test('every style × motif renders a stable frame', async ({ page }) => {
  test.setTimeout(300_000);

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/harness.html');
  await page.waitForFunction(() => '__HARNESS__' in window || '__HARNESS_ERROR__' in window, undefined, {
    timeout: 240_000
  });

  const failure = await page.evaluate(() => (window as unknown as { __HARNESS_ERROR__?: string }).__HARNESS_ERROR__);
  expect(failure ?? null).toBeNull();

  const actual = (await page.evaluate(() => (window as unknown as { __HARNESS__: Matrix }).__HARNESS__)) as Matrix;

  const styles = Object.keys(actual);
  expect(styles.length).toBe(6);
  for (const style of styles) {
    expect(Object.keys(actual[style]).length).toBe(14);
  }

  /* a frame that is entirely background is a failed render */
  for (const style of styles) {
    for (const motif of Object.keys(actual[style])) {
      const coverage = actual[style][motif][actual[style][motif].length - 1];
      expect(coverage, `${style}/${motif} rendered an empty frame`).toBeGreaterThan(0.25);
    }
  }

  if (process.env.UPDATE_SIGNATURES === '1' || !existsSync(FILE)) {
    writeFileSync(FILE, JSON.stringify(actual, null, 2) + '\n');
    test.info().annotations.push({ type: 'signatures', description: 'written to tests/signatures.json' });
    return;
  }

  const expected = JSON.parse(readFileSync(FILE, 'utf8')) as Matrix;
  const drift: string[] = [];

  for (const style of styles) {
    for (const motif of Object.keys(actual[style])) {
      const a = actual[style][motif];
      const b = expected[style]?.[motif];
      if (!b) { drift.push(`${style}/${motif}: no reference`); continue; }
      if (a.length !== b.length) { drift.push(`${style}/${motif}: signature length changed`); continue; }

      let worst = 0;
      for (let i = 0; i < a.length - 1; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
      const coverage = Math.abs(a[a.length - 1] - b[b.length - 1]);

      if (worst > CHANNEL_TOLERANCE) drift.push(`${style}/${motif}: colour drifted by ${worst}`);
      else if (coverage > COVERAGE_TOLERANCE) drift.push(`${style}/${motif}: coverage moved by ${coverage.toFixed(2)}`);
    }
  }

  expect(drift.slice(0, 12)).toEqual([]);
  expect(errors).toEqual([]);
});

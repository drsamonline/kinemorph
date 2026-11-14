import { expect, test } from '@playwright/test';

/**
 * Two scenes in different styles must each be drawn in their own palette during
 * a transition. Kinemotif has the same check; this is the port, because a
 * capability with no test is a capability that can quietly stop working.
 */
test('a transition between two styles draws both palettes', async ({ page }) => {
  test.setTimeout(300_000);

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/harness.html');
  await page.waitForFunction(
    () => '__CROSSSTYLE__' in window || '__HARNESS_ERROR__' in window,
    undefined,
    { timeout: 240_000 }
  );

  const failure = await page.evaluate(
    () => (window as unknown as { __HARNESS_ERROR__?: string }).__HARNESS_ERROR__
  );
  expect(failure ?? null).toBeNull();

  const sample = await page.evaluate(
    () => (window as unknown as { __CROSSSTYLE__: { left: number; right: number; gap: number } }).__CROSSSTYLE__
  );

  expect(sample).not.toBeNull();
  /* a wipe across two palettes leaves the halves far apart; one palette leaves
     them almost identical */
  expect(sample.gap, `left ${sample.left.toFixed(0)} vs right ${sample.right.toFixed(0)}`).toBeGreaterThan(25);
  expect(errors).toEqual([]);
});

import { expect, test } from '@playwright/test';

interface SelfTestResult {
  total: number;
  passed: number;
  failed: number;
  results: { name: string; ok: boolean; detail: string }[];
}

test('the engine self-test passes in the built studio', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/selftest.html');
  await page.waitForFunction(() => '__SELFTEST__' in window, undefined, { timeout: 90_000 });
  const result = (await page.evaluate(() => (window as unknown as { __SELFTEST__: SelfTestResult }).__SELFTEST__)) as SelfTestResult;

  const failures = result.results.filter((r) => !r.ok);
  expect(failures.map((f) => `${f.name}: ${f.detail}`)).toEqual([]);
  expect(result.failed).toBe(0);
  expect(result.passed).toBe(result.total);
  expect(result.total).toBeGreaterThanOrEqual(19);
  expect(errors).toEqual([]);
});

import { expect, test } from '@playwright/test';

test('the studio boots, renders, and edits', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  const canvas = page.locator('.stage canvas');
  await expect(canvas).toBeVisible({ timeout: 60_000 });

  /* the wizard appears on a first visit */
  await expect(page.locator('.modal-card.wizard')).toBeVisible();
  await page.locator('.style-card').nth(3).click();
  await page.locator('.chip').first().click();
  await page.locator('footer .primary').click();
  await expect(page.locator('.modal-card.wizard')).toBeHidden();

  const scenes = page.locator('.scene-item');
  await expect(scenes.first()).toBeVisible();
  const count = await scenes.count();
  expect(count).toBeGreaterThanOrEqual(3);

  /* the renderer resizes to the style's native resolution */
  const sizes = new Set<string>();
  for (const index of [0, 2, 4]) {
    await page.locator('.swatch').nth(index).click();
    await page.waitForTimeout(500);
    sizes.add(await canvas.evaluate((el: HTMLCanvasElement) => `${el.width}x${el.height}`));
  }
  expect(sizes.size).toBeGreaterThan(1);
  expect([...sizes].every((s) => /^\d+x\d+$/.test(s))).toBe(true);

  /* editing the title updates the model and the scene list */
  const firstScene = page.locator('.scene-item').first();
  await firstScene.click();
  await page.locator('.inspector input').first().fill('A renamed scene');
  await expect(firstScene.locator('.t')).toHaveText('A renamed scene');

  /* undo restores it */
  await page.keyboard.press('Control+z');
  await expect(firstScene.locator('.t')).not.toHaveText('A renamed scene');

  expect(errors).toEqual([]);
});

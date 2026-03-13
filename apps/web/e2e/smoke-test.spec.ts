import { test, expect } from '@playwright/test';

const FAMILIES = [
  'point',
  'cluster',
  'choropleth',
  'heatmap',
  'proportional-symbol',
  'flow',
  'isochrone',
] as const;

test.describe('Smoke Test Page', () => {
  test('page loads', async ({ page }) => {
    await page.goto('/smoke-test');
    await expect(page.getByText('Smoke Test')).toBeVisible();
    await expect(page.locator('#family-select')).toBeVisible();
  });

  for (const family of FAMILIES) {
    test(`renders ${family} family`, async ({ page }) => {
      await page.goto('/smoke-test');
      await page.selectOption('#family-select', family);
      // Wait for MapLibre canvas to appear
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
      // Verify no error overlay
      await expect(page.locator('[data-nextjs-error]')).not.toBeVisible();
    });
  }
});

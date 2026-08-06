import { test, expect } from '@playwright/test';

test('app loads and renders landing page', async ({ page }) => {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Should see the app title somewhere
  await expect(page).toHaveTitle(/CodeMap|Natively|Code/);

  // Should render a heading or main content area
  const bodyText = await page.locator('body').innerText();
  expect(bodyText.length).toBeGreaterThan(0);

  // Take a screenshot for visual reference
  await page.screenshot({ path: 'smoke-test-screenshot.png', fullPage: true });
});

test('navigation links are present', async ({ page }) => {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Check for common navigation elements
  const links = page.locator('a, button');
  const linkCount = await links.count();
  expect(linkCount).toBeGreaterThan(0);
});

test('page renders without console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Filter out 404 fetch errors from analytics/beacon etc.
  const criticalErrors = consoleErrors.filter(
    (e) =>
      !e.includes('404') &&
      !e.includes('favicon') &&
      !e.includes('net::ERR_ABORTED')
  );

  expect(criticalErrors).toEqual([]);
});
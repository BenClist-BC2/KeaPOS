import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('root redirects to dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('dashboard page renders', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('dashboard shows stat cards', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText("Today's Sales")).toBeVisible();
    await expect(page.getByText('Active Locations')).toBeVisible();
    await expect(page.getByText('Menu Items')).toBeVisible();
    await expect(page.getByText('Staff Members')).toBeVisible();
  });

  test('dashboard shows getting started checklist', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Getting Started')).toBeVisible();
    await expect(page.getByText('Set up your first location')).toBeVisible();
    await expect(page.getByText('Add menu items')).toBeVisible();
  });
});

test.describe('POS Terminal', () => {
  test('terminal page renders', async ({ page }) => {
    await page.goto('/terminal');
    await expect(page.getByRole('heading', { name: /POS Terminal/i })).toBeVisible();
  });

  test('terminal page has correct placeholder text', async ({ page }) => {
    await page.goto('/terminal');
    await expect(page.getByText('Point of Sale interface will go here')).toBeVisible();
  });
});

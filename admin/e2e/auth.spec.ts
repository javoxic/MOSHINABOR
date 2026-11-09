import { expect, test } from '@playwright/test';
import { ADMINS } from './fixtures';
import { loginAs } from './helpers';

test.describe('Admin authentication', () => {
  test('rejects wrong credentials with a generic message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMINS.analyst.email);
    await page.getByLabel('Password').fill('definitely-wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signs in, restores the session after reload via the httpOnly cookie, and signs out', async ({ page, context }) => {
    await loginAs(page, 'super');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    const cookies = await context.cookies();
    const rt = cookies.find((c) => c.name === 'mb_admin_rt');
    expect(rt?.httpOnly).toBe(true);
    expect(rt?.sameSite).toBe('Strict');
    // Access token is kept in memory only.
    expect(await page.evaluate(() => JSON.stringify(window.localStorage))).not.toContain('eyJ');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.goto('/users');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});

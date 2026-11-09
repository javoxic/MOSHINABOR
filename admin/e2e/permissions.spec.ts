import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Role-based access', () => {
  test('analyst sees only permitted sections and masked phone numbers', async ({ page }) => {
    await loginAs(page, 'analyst');
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: 'Users' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Administrators' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Audit log' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0);

    await nav.getByRole('link', { name: 'Users' }).click();
    await expect(page.getByText('Aziz Karimov')).toBeVisible();
    await expect(page.getByText('+998901112233')).toHaveCount(0);
    await expect(page.getByText('+99890*****33')).toBeVisible();

    await page.goto('/admins');
    await expect(page.getByText('Access denied')).toBeVisible();
    await page.goto('/settings');
    await expect(page.getByText('Access denied')).toBeVisible();
  });

  test('analyst cannot restrict users (no management actions shown)', async ({ page }) => {
    await loginAs(page, 'analyst');
    await page.goto('/users');
    await page.getByText('Aziz Karimov').click();
    await expect(page.getByRole('heading', { name: 'Aziz Karimov' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restrict account' })).toHaveCount(0);
  });

  test('super admin manages administrators', async ({ page }) => {
    await loginAs(page, 'super');
    await page.getByRole('link', { name: 'Administrators' }).click();
    await page.getByRole('button', { name: 'New administrator' }).click();
    const dialog = page.getByRole('dialog', { name: 'New administrator' });
    await dialog.getByLabel('Full name').fill('New Support Agent');
    await dialog.getByLabel('Email').fill('agent@e2e.moshinabor.test');
    await dialog.getByLabel('Role').selectOption({ label: 'Support' });
    await dialog.getByLabel('Initial password').fill('short');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog.getByText('At least 12 characters')).toBeVisible();
    await dialog.getByLabel('Initial password').fill('Another-Strong-Passw0rd');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('cell', { name: 'agent@e2e.moshinabor.test' })).toBeVisible();

    await page.getByRole('row', { name: /agent@e2e\.moshinabor\.test/ }).getByRole('button', { name: 'Disable' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Disable' }).click();
    await expect(page.getByRole('row', { name: /agent@e2e\.moshinabor\.test/ })).toContainText('Disabled');

    await page.getByRole('link', { name: 'Audit log' }).click();
    await expect(page.getByRole('cell', { name: 'admins.create' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'admins.disable' }).first()).toBeVisible();
  });
});

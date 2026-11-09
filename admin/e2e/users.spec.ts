import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('User management', () => {
  test('support searches by phone, filters, and restricts a user with an audited reason', async ({ page }) => {
    await loginAs(page, 'support');
    await page.getByRole('link', { name: 'Users' }).click();
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await expect(page.getByText('Full phone numbers are visible to your role; views are audited.')).toBeVisible();

    await page.getByLabel('Search name or phone').fill('935554433');
    await expect(page.getByRole('row', { name: /Dilnoza Rahimova/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Aziz Karimov/ })).toHaveCount(0);
    await expect(page.getByText('+998935554433')).toBeVisible();

    await page.getByRole('row', { name: /Dilnoza Rahimova/ }).click();
    await expect(page.getByRole('heading', { name: 'Dilnoza Rahimova' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Vehicles' })).toContainText('2');

    await page.getByRole('button', { name: 'Restrict account' }).click();
    const dialog = page.getByRole('dialog', { name: 'Restrict account' });
    await dialog.getByLabel('Reason (visible to staff only)').fill('Chargeback fraud report #4411');
    await dialog.getByRole('button', { name: 'Restrict' }).click();
    await expect(page.getByText('Restricted: Chargeback fraud report #4411')).toBeVisible();

    await page.goto('/users?status=RESTRICTED');
    await expect(page.getByRole('row', { name: /Dilnoza Rahimova/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Aziz Karimov/ })).toHaveCount(0);

    await page.getByRole('row', { name: /Dilnoza Rahimova/ }).click();
    await page.getByRole('button', { name: 'Lift restriction' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Lift restriction' }).click();
    await expect(page.getByText(/Restricted:/)).toHaveCount(0);
  });

  test('language filter narrows the list', async ({ page }) => {
    await loginAs(page, 'super');
    await page.goto('/users');
    await page.getByLabel('Language').selectOption('en');
    await expect(page.getByRole('row', { name: /Jamshid Tursunov/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Aziz Karimov/ })).toHaveCount(0);
  });
});

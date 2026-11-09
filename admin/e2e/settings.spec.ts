import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('settings: health reports SMS provider status honestly and settings are editable', async ({ page }) => {
  await loginAs(page, 'super');
  await page.getByRole('link', { name: 'Settings' }).click();
  const field = page.getByLabel('Upcoming reminder (days before due)');
  await field.fill('21');
  await field.locator('xpath=..').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Setting saved')).toBeVisible();

  await page.getByRole('tab', { name: 'System health' }).click();
  // No Eskiz credentials are configured in the e2e environment: the UI must say so.
  await expect(page.getByText('The SMS provider is not configured.')).toBeVisible();
  await expect(page.getByText('System is degraded')).toBeVisible();
});

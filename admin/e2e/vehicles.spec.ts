import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('vehicles: search by plate, filter by fuel and view ownership', async ({ page }) => {
  await loginAs(page, 'analyst');
  await page.getByRole('link', { name: 'Vehicles' }).click();
  await expect(page.getByRole('row', { name: /Chevrolet Cobalt/ })).toBeVisible();

  await page.getByLabel('Search').fill('555');
  await expect(page.getByRole('row', { name: /Kia K5/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Cobalt/ })).toHaveCount(0);
  await page.getByLabel('Search').fill('');

  await page.getByLabel('Fuel type').selectOption('GAS_METHANE');
  await expect(page.getByRole('row', { name: /Chevrolet Damas/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Kia K5/ })).toHaveCount(0);

  await page.getByRole('row', { name: /Chevrolet Damas/ }).click();
  await expect(page.getByRole('heading', { name: 'Chevrolet Damas' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Current mileage' })).toContainText('210,000 km');
  await expect(page.getByText('+99893*****33')).toBeVisible();
});

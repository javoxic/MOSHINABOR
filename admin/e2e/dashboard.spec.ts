import { expect, test } from '@playwright/test';
import { USERS } from './fixtures';
import { loginAs } from './helpers';

test('dashboard shows statistics computed from the database', async ({ page }) => {
  await loginAs(page, 'super');
  const vehicles = USERS.reduce((n, u) => n + u.vehicles.length, 0);
  await expect(page.getByRole('group', { name: 'Total users' })).toContainText(String(USERS.length));
  await expect(page.getByRole('group', { name: 'Vehicles' })).toContainText(String(vehicles));
  await expect(page.getByRole('group', { name: 'Maintenance records' })).toContainText(String(vehicles));
  await expect(page.getByText('Registrations · last 30 days')).toBeVisible();
  await expect(page.getByText('Vehicles by fuel type')).toBeVisible();
});

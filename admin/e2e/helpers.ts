import { expect, type Page } from '@playwright/test';
import { ADMINS, PASSWORD } from './fixtures';

export async function loginAs(page: Page, who: keyof typeof ADMINS): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMINS[who].email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('complementary', { name: 'Main navigation' })).toBeVisible();
}

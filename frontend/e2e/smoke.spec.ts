import { test, expect } from '@playwright/test';

test('프로젝트 관리 화면 진입 확인', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await expect(page.locator('text=프로젝트 관리')).toBeVisible();
});
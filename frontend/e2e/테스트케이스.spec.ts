import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByRole('button', { name: '✎' }).first().click();
  await page.getByRole('textbox', { name: '프로젝트명 *' }).click();
  await page.getByRole('textbox', { name: '프로젝트명 *' }).fill('LG 디스플레이');
  await page.getByRole('button', { name: '수정 완료' }).click();
  await page.getByRole('button', { name: '✎' }).first().click();
  await page.getByRole('textbox', { name: '설명', exact: true }).click();
  await page.getByRole('textbox', { name: '설명', exact: true }).fill('테스트 입니다.');
  await page.getByRole('textbox', { name: '종료일' }).fill('2026-08-28');
  await page.getByRole('button', { name: '수정 완료' }).click();
  await page.getByRole('button', { name: '✎' }).first().click();
  await page.getByRole('button', { name: '취소' }).click();
  await page.getByRole('button', { name: '✎' }).first().click();
  await page.getByRole('textbox', { name: '설명', exact: true }).click();
  await page.getByRole('textbox', { name: '설명', exact: true }).fill('테스트 입니다.1234');
  await page.getByRole('button', { name: '수정 완료' }).click();
});
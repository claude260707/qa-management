import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByRole('button', { name: '✎' }).first().click();
  await page.getByRole('textbox', { name: '프로젝트명 *' }).fill('LG 디스플레이');
  await page.getByRole('button', { name: '수정 완료' }).click();
  await page.getByRole('button', { name: '✎' }).first().click();
  await page.getByRole('textbox', { name: '설명', exact: true }).click();
  await page.getByRole('textbox', { name: '설명', exact: true }).fill('테스트 입니다.');
  await page.getByLabel('상태QA 미진행QA진행중테스트완료완료보류').selectOption('qa_in_progress');
  await page.getByRole('textbox', { name: '담당자' }).click();
  await page.getByRole('textbox', { name: '담당자' }).fill('홍길동');
  await page.getByText('프로젝트명 *설명테스트 입니다.상태QA 미진행QA').click();
  await page.getByRole('textbox', { name: '시작일' }).fill('2026-08-25');
  await page.getByRole('textbox', { name: '종료일' }).fill('2026-08-26');
  await page.getByRole('button', { name: '수정 완료' }).click();
  await page.getByRole('button', { name: '✎' }).first().click();
  await page.getByRole('textbox', { name: '프로젝트명 *' }).click();
  await page.getByRole('textbox', { name: '프로젝트명 *' }).fill('LG 디스플레이1231');
  await page.getByRole('textbox', { name: '설명', exact: true }).click();
  await page.getByRole('textbox', { name: '설명', exact: true }).fill('테스트 입니다.23123');
  await page.getByRole('button', { name: '수정 완료' }).click();
});
import { test, expect } from '@playwright/test';

test('프로젝트 관리 화면 진입 확인', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // 사이드바 메뉴("span")와 화면 제목("h1") 둘 다 같은 텍스트를 갖고 있어서
  // text= 방식만 쓰면 2개가 매칭되어 strict mode violation이 발생합니다.
  // getByRole('heading', ...)로 화면 "제목"만 명확히 지정합니다.
  await expect(
    page.getByRole('heading', { name: '프로젝트 관리' })
  ).toBeVisible();
});

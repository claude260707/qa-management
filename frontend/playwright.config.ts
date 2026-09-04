import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // 테스트 파일이 있는 폴더
  testDir: './e2e',

  // 테스트 하나당 최대 대기 시간
  timeout: 30 * 1000,

  // CI에서는 실패해도 재시도, 로컬에서는 재시도 없이 바로 결과 확인
  retries: process.env.CI ? 2 : 0,

  // CI에서는 병렬 실행 워커 수를 1개로 제한 (안정성을 위해)
  workers: process.env.CI ? 1 : undefined,

  // 실행 결과 리포트 형식
  reporter: 'html',

  use: {
    // smoke.spec.ts에서 이 baseURL을 기준으로 상대경로도 쓸 수 있게 됨
    baseURL: 'http://localhost:5173',

    // 실패한 테스트만 스크린샷/트레이스 저장 (디버깅에 유용)
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',

    // 동작 하나하나 사이에 텀을 줘서 눈으로 천천히 확인하고 싶을 때 사용.
    // 숫자는 ms 단위 (1000 = 1초). 평소엔 0으로 두고, 눈으로 볼 때만 값을 올리세요.
    launchOptions: {
      slowMo: 1000,
    },
  },

  // 우선 Chromium 브라우저로만 테스트 (필요하면 나중에 Firefox/WebKit 추가 가능)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 테스트 실행 전, Vite 개발 서버를 자동으로 켜줍니다.
  // 이미 5173 포트에 서버가 떠 있다면 재사용합니다 (로컬 개발 중에도 편리).
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000,
  },
});

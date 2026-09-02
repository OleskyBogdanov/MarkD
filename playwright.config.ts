import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'line',
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 40173 --strictPort',
    url: 'http://127.0.0.1:40173',
    reuseExistingServer: true,
    timeout: 30_000
  },
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
});

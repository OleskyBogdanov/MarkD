import { defineConfig } from '@playwright/test';
import process from 'node:process';

// Playwright forces colored child-process output; inheriting NO_COLOR makes Node warn.
delete process.env.NO_COLOR;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'line',
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
});

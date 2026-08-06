import { defineConfig } from '@playwright/test';

export default defineConfig({
  testMatch: ['**/scripts/**/*.spec.ts'],
  timeout: 30000,
  use: {
    headless: true,
    browserName: 'chromium',
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
  },
});
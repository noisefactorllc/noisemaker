import { defineConfig, devices } from '@playwright/test';

const isMac = process.platform === 'darwin';
const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = process.env.PORT ? Number(process.env.PORT) : 4173;
const shaderBaseURL = `http://${HOST}:${PORT}`;
const webgpuArgs = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--enable-webgpu-developer-features',
  '--disable-gpu-sandbox',
  isMac ? '--use-angle=metal' : '--use-angle=vulkan',
];

export default defineConfig({
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testDir: './test',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8888',
      },
    },
    {
      name: 'chromium-webgpu',
      testDir: './test',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8888',
        launchOptions: {
          args: webgpuArgs,
        },
      },
    },
    {
      name: 'shaders-chromium',
      testDir: './shaders/tests/playwright',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: shaderBaseURL,
        headless: false,
        viewport: {
          width: 1280,
          height: 720,
        },
        ignoreHTTPSErrors: true,
      },
    },
    {
      name: 'shaders-chromium-webgpu',
      testDir: './shaders/tests/playwright',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: shaderBaseURL,
        headless: false,
        viewport: {
          width: 1280,
          height: 720,
        },
        ignoreHTTPSErrors: true,
        launchOptions: {
          args: webgpuArgs,
        },
      },
    },
  ],
  webServer: [
    {
      command: 'python3 -m http.server 8888 --directory .',
      url: 'http://localhost:8888',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node ./shaders/scripts/serve.js',
      url: `${shaderBaseURL}/demo/shaders/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});

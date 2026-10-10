import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    use: { baseURL: 'http://127.0.0.1:5189', headless: true },
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 5189',
        url: 'http://127.0.0.1:5189',
        reuseExistingServer: false,
        env: { VITE_SUPABASE_URL: 'https://portal-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-test-key', VITE_API_BASE_URL: 'http://127.0.0.1:5189' },
    },
});
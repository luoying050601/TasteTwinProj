import { test, expect, type Page } from '@playwright/test';

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'twin@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z', email_confirmed_at: '2026-01-01T00:00:00Z' };
const session = { user, access_token: 'test-access-token', refresh_token: 'test-refresh-token', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer' };

async function mockServices(page: Page) {
    let profile: { nickname: string | null; gender: string | null; birthYear: number | null; birthMonth: number | null } = { nickname: null, gender: null, birthYear: null, birthMonth: null };
    const saves: unknown[] = [];
    await page.route('https://portal-test.supabase.co/**', async route => {
        const path = new URL(route.request().url()).pathname;
        const headers = { 'access-control-allow-origin': '*' };
        if (path.endsWith('/logout')) { await route.fulfill({ status: 204, headers }); return; }
        if (path.endsWith('/otp')) {
            expect(route.request().postDataJSON().email).toBe(user.email);
            await route.fulfill({ json: {}, headers }); return;
        }
        if (path.endsWith('/verify')) {
            const correct = route.request().postDataJSON().token === '123456';
            await route.fulfill({ status: correct ? 200 : 403, json: correct ? session : { msg: 'Token expired', error_code: 'otp_expired' }, headers }); return;
        }
        if (path.endsWith('/token')) {
            expect(route.request().postDataJSON().auth_code).toBe('test-code');
            expect(route.request().postDataJSON().code_verifier).toBeTruthy();
            await route.fulfill({ json: session, headers }); return;
        }
        if (path.endsWith('/authorize')) { await route.fulfill({ body: 'Google OAuth test', contentType: 'text/html' }); return; }
        throw new Error('Unexpected auth request: ' + path);
    });
    await page.route('**/api/me', async route => {
        expect(route.request().headers().authorization).toBe('Bearer test-access-token');
        if (route.request().method() === 'PATCH') {
            const body = route.request().postDataJSON();
            expect(Object.keys(body).sort()).toEqual(['birthMonth', 'birthYear', 'gender', 'nickname']);
            saves.push(body); profile = body;
        }
        await route.fulfill({ json: { ok: true, data: { id: user.id, email: user.email, profile, profileComplete: !!profile.nickname && !!profile.gender && !!profile.birthYear && !!profile.birthMonth } } });
    });
    return saves;
}

async function emailLogin(page: Page) {
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByRole('button', { name: 'Send code', exact: true }).click();
    await expect(page.getByRole('button', { name: /Resend in/ })).toBeDisabled();
    await page.getByLabel('Verification code', { exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }, { width: 320, height: 740 }]) {
    test(`portal and profile at ${viewport.width}px`, async ({ page }, info) => {
        await page.setViewportSize(viewport);
        const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
        const saves = await mockServices(page);
        await page.goto('/');
        await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
        await expect.poll(() => page.locator('.auth-scene > img').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
        await page.screenshot({ path: info.outputPath('portal.png'), fullPage: true });
        await emailLogin(page);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        expect(saves).toHaveLength(0);
        await page.getByLabel('Nickname', { exact: true }).fill('Pixel Twin');
        await page.getByLabel('Gender', { exact: true }).selectOption('male');
        await page.getByLabel('Birth year and month', { exact: true }).fill('9999-01');
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        expect(saves).toHaveLength(0);
        await page.getByLabel('Birth year and month', { exact: true }).fill('2000-02');
        expect((await page.locator('.account-heading .pixel-scene').boundingBox())!.width).toBe(40);
        expect((await page.locator('.account-heading h2').boundingBox())!.height).toBeLessThan(70);
        await page.screenshot({ path: info.outputPath('onboarding.png'), fullPage: true });
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        const avatar = page.getByRole('button', { name: 'Personal information', exact: true });
        await expect(page.locator('.personal-avatar')).toHaveCount(0);
        await expect(avatar.getByRole('img')).toHaveAccessibleName(/Male/);
        await page.screenshot({ path: info.outputPath('room-avatar.png'), fullPage: true });
        await avatar.click();
        await page.getByLabel('Nickname', { exact: true }).fill('Updated Twin');
        await page.getByLabel('Gender', { exact: true }).selectOption('undisclosed');
        await page.getByLabel('Birth year and month', { exact: true }).fill('2001-03');
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(avatar.getByRole('img')).toHaveAccessibleName(/Prefer not to say/);
        await page.reload();
        await expect(avatar).toBeVisible();
        await avatar.click();
        await expect(page.getByLabel('Nickname', { exact: true })).toHaveValue('Updated Twin');
        await expect(page.getByLabel('Birth year and month', { exact: true })).toHaveValue('2001-03');
        await page.screenshot({ path: info.outputPath('profile.png'), fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
        await page.getByRole('button', { name: 'Close panel', exact: true }).click();
        await expect(avatar).toBeFocused();
        await avatar.click();
        await page.getByRole('button', { name: 'Sign out', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
        expect(saves).toHaveLength(2);
        expect(errors).toEqual([]);
    });
}

test('gender and age variants follow profile edits and preserve room movement', async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.clock.install({ time: new Date('2026-10-10T12:00:00Z') });
    await mockServices(page);
    await emailLogin(page);
    const avatar = page.getByRole('button', { name: 'Personal information', exact: true });
    const artwork = new Set<string>();
    for (const gender of ['male', 'female', 'other']) {
        for (const [birth, group] of [['2020-01', 'child'], ['2011-01', 'teen'], ['1990-01', 'adult'], ['1950-01', 'senior']]) {
            if (await avatar.count()) await avatar.click();
            await page.getByLabel('Nickname', { exact: true }).fill('Twin');
            await page.getByLabel('Gender', { exact: true }).selectOption(gender);
            await page.getByLabel('Birth year and month', { exact: true }).fill(birth);
            await expect(page.locator('.account-heading .pixel-scene')).toHaveAttribute('data-age-group', group);
            await page.getByRole('button', { name: 'Save', exact: true }).click();
            await expect(avatar.locator('.pixel-scene')).toHaveAttribute('data-gender', gender);
            await expect(avatar.locator('.pixel-scene')).toHaveAttribute('data-age-group', group);
            artwork.add(await avatar.locator('svg').innerHTML());
            await avatar.screenshot({ path: info.outputPath(`${gender}-${group}.png`) });
        }
    }
    expect(artwork.size).toBe(12);
    for (const [birth, group] of [['2013-11', 'child'], ['2013-10', 'teen'], ['2008-11', 'teen'], ['2008-10', 'adult'], ['1966-11', 'adult'], ['1966-10', 'senior']]) {
        await avatar.click();
        await page.getByLabel('Birth year and month', { exact: true }).fill(birth);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(avatar.locator('.pixel-scene')).toHaveAttribute('data-age-group', group);
    }
    const camera = page.locator('.room-camera');
    await page.getByRole('region').focus();
    const before = await avatar.evaluate(element => (element as HTMLElement).style.left);
    await page.keyboard.press('ArrowRight');
    await expect(avatar).not.toHaveJSProperty('disabled', true);
    expect(await avatar.evaluate(element => (element as HTMLElement).style.left)).not.toBe(before);
    await page.clock.runFor(1000);
    await avatar.focus();
    const stopped = await avatar.evaluate(element => (element as HTMLElement).style.left);
    await page.keyboard.press('ArrowRight');
    expect(await avatar.evaluate(element => (element as HTMLElement).style.left)).toBe(stopped);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(avatar).toBeFocused();
    await expect(camera).not.toHaveClass(/room-camera--locked/);
});

test('expired code and localized portal', async ({ page }) => {
    await mockServices(page);
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByRole('button', { name: 'Send code', exact: true }).click();
    await page.getByLabel('Verification code', { exact: true }).fill('000000');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('incorrect or expired');
    await page.getByRole('button', { name: 'Change email', exact: true }).click();
    await page.getByLabel('Language', { exact: true }).selectOption('zh-CN');
    await expect(page.getByRole('button', { name: '使用 Google 登录' })).toBeVisible();
    await page.getByLabel('语言', { exact: true }).selectOption('ja-JP');
    await expect(page.getByRole('button', { name: 'Google でログイン' })).toBeVisible();
});

test('OAuth launch and callback failure are recoverable', async ({ page }) => {
    await mockServices(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page).toHaveURL(/portal-test.supabase.co\/auth\/v1\/authorize/);
    const url = new URL(page.url());
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('redirect_to')).toBe('http://127.0.0.1:5189/auth/callback');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    await page.goto('/auth/callback?error=access_denied&error_description=test');
    await expect(page.getByRole('alert')).toContainText('Sign-in could not be completed');
    await expect(page).toHaveURL('http://127.0.0.1:5189/auth/callback');
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page).toHaveURL(/portal-test.supabase.co\/auth\/v1\/authorize/);
    await page.goto('/auth/callback?code=test-code');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page).toHaveURL('http://127.0.0.1:5189/auth/callback');
});
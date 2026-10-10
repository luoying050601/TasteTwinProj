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
            const body = route.request().postDataJSON();
            if (body.auth_code) { expect(body.auth_code).toBe('test-code'); expect(body.code_verifier).toBeTruthy(); }
            else expect(body.refresh_token).toBe(session.refresh_token);
            const now = await page.evaluate(() => Date.now());
            await route.fulfill({ json: { ...session, expires_at: Math.floor(now / 1000) + 3600 }, headers }); return;
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

async function openNotebook(page: Page) {
    if (!await page.locator('.room-notebook').count()) await page.locator('.room-avatar').click();
    await page.locator('.room-notebook').click();
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
        await openNotebook(page);
        await page.getByLabel('Nickname', { exact: true }).fill('Updated Twin');
        await page.getByLabel('Gender', { exact: true }).selectOption('undisclosed');
        await page.getByLabel('Birth year and month', { exact: true }).fill('2001-03');
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.getByRole('button', { name: 'Close panel', exact: true }).click();
        await expect(avatar.getByRole('img')).toHaveAccessibleName(/Prefer not to say/);
        await page.reload();
        await expect(avatar).toBeVisible();
        await openNotebook(page);
        await expect(page.getByLabel('Nickname', { exact: true })).toHaveValue('Updated Twin');
        await expect(page.getByLabel('Birth year and month', { exact: true })).toHaveValue('2001-03');
        await page.screenshot({ path: info.outputPath('profile.png'), fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
        await page.getByRole('button', { name: 'Close panel', exact: true }).click();
        await expect(page.locator('.room-notebook')).toBeFocused();
        await openNotebook(page);
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
            if (await avatar.count()) await openNotebook(page);
            await page.getByLabel('Nickname', { exact: true }).fill('Twin');
            await page.getByLabel('Gender', { exact: true }).selectOption(gender);
            await page.getByLabel('Birth year and month', { exact: true }).fill(birth);
            await expect(page.locator('.account-heading .pixel-scene')).toHaveAttribute('data-age-group', group);
            await page.getByRole('button', { name: 'Save', exact: true }).click();
            if (await page.locator('.notebook-dialog').count()) await page.getByRole('button', { name: 'Close panel', exact: true }).click();
            await expect(avatar.locator('.pixel-scene')).toHaveAttribute('data-gender', gender);
            await expect(avatar.locator('.pixel-scene')).toHaveAttribute('data-age-group', group);
            artwork.add(await avatar.locator('svg').innerHTML());
            await avatar.screenshot({ path: info.outputPath(`${gender}-${group}.png`) });
        }
    }
    expect(artwork.size).toBe(12);
    for (const [birth, group] of [['2013-11', 'child'], ['2013-10', 'teen'], ['2008-11', 'teen'], ['2008-10', 'adult'], ['1966-11', 'adult'], ['1966-10', 'senior']]) {
        await openNotebook(page);
        await page.getByLabel('Birth year and month', { exact: true }).fill(birth);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        await page.getByRole('button', { name: 'Close panel', exact: true }).click();
        await expect(avatar.locator('.pixel-scene')).toHaveAttribute('data-age-group', group);
    }
    const camera = page.locator('.room-camera');
    await page.clock.runFor(100);
    await page.getByRole('region').focus();
    const before = await avatar.evaluate(element => (element as HTMLElement).style.left);
    await page.keyboard.press('ArrowRight');
    await expect(avatar).not.toHaveJSProperty('disabled', true);
    await expect.poll(() => avatar.evaluate(element => (element as HTMLElement).style.left)).not.toBe(before);
    await page.clock.runFor(1000);
    await avatar.focus();
    await page.keyboard.press('Escape');
    const stopped = await avatar.evaluate(element => (element as HTMLElement).style.left);
    await page.keyboard.press('ArrowRight');
    expect(await avatar.evaluate(element => (element as HTMLElement).style.left)).toBe(stopped);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.room-notebook')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.room-notebook')).toHaveCount(0);
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

async function mockNotebook(page: Page) {
    let dietary = { city: '', allergyStatus: 'unknown', allergens: [] as string[], allergyOther: '', avoidanceStatus: 'unknown', avoidedFoods: [] as string[], avoidanceOther: '' };
    await page.route('https://photon.komoot.io/**', route => route.fulfill({ json: { features: [] }, headers: { 'access-control-allow-origin': '*' } }));
    const records: Record<string, any>[] = [];
    const saves: Record<string, any>[] = [];
    await page.route('**/api/me/dietary-preferences', async route => {
        if (route.request().method() === 'PATCH') dietary = route.request().postDataJSON();
        await route.fulfill({ json: { ok: true, data: dietary } });
    });
    await page.route('**/api/me/health-records*', async route => {
        if (route.request().method() === 'POST') {
            const body = route.request().postDataJSON();
            expect(body.userId).toBeUndefined(); expect(body.recordedAt).toBeUndefined(); expect(body.bmi).toBeUndefined();
            saves.push(body);
            const saved = { ...body, recordedAt: new Date(Date.UTC(2026, 9, 10, 12, records.length)).toISOString(), bmi: Math.round(body.weightKg / (body.heightCm / 100) ** 2 * 10) / 10 };
            records.unshift(saved);
            await route.fulfill({ json: { ok: true, data: saved } });
        } else await route.fulfill({ json: { ok: true, data: { records, nextOffset: null } } });
    });
    return { records, saves, getDiet: () => dietary };
}

async function enterNotebookRoom(page: Page) {
    await mockServices(page);
    await emailLogin(page);
    await page.getByLabel('Nickname', { exact: true }).fill('Notebook Twin');
    await page.getByLabel('Gender', { exact: true }).selectOption('female');
    await page.getByLabel('Birth year and month', { exact: true }).fill('2000-01');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('clicking the character reveals its notebook before opening the book', async ({ page }) => {
    await mockNotebook(page); await enterNotebookRoom(page);
    await expect(page.locator('.topbar .data-status')).toBeHidden();
    await expect(page.locator('.topbar button.text-button')).toBeHidden();
    await expect(page.locator('.topbar .language-control select')).toBeVisible();
    const avatar = page.getByRole('button', { name: 'Personal information', exact: true });
    const notebook = page.getByRole('button', { name: 'My notebook', exact: true });
    await expect(notebook).toHaveCount(0);
    await avatar.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(notebook).toBeVisible();
    await expect(avatar).toHaveAttribute('aria-expanded', 'true');
    await avatar.click();
    await expect(notebook).toHaveCount(0);
    await avatar.click();
    await page.getByRole('region').focus();
    await page.keyboard.press('ArrowRight');
    await expect(notebook).toBeVisible();
    await expect.poll(() => notebook.evaluate(element => (element as HTMLElement).style.left)).toBe(await avatar.evaluate(element => (element as HTMLElement).style.left));
    await notebook.click();
    await expect(page.getByRole('dialog', { name: 'My notebook' })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(3);
});

for (const width of [1280, 375, 320]) {
    test(`notebook collection and immutable history at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 850 });
        const data = await mockNotebook(page);
        await enterNotebookRoom(page);
        const notebook = page.getByRole('button', { name: 'My notebook', exact: true });
        await openNotebook(page);
        await expect(page.getByRole('tab', { name: 'Personal profile' })).toBeVisible();
        for (const leaf of await page.getByRole('tab').all()) {
            const bounds = (await leaf.boundingBox())!;
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
            const label = (await leaf.locator('span').boundingBox())!;
            expect(label.y + label.height).toBeLessThanOrEqual(bounds.y + bounds.height + 2);
        }
        await page.screenshot({ path: info.outputPath('notebook-book.png'), fullPage: true });
        await page.getByRole('tab', { name: 'Your tastes' }).click();
        await expect(page.locator('#notebook-panel-tastes').getByLabel('Quiet', { exact: true })).toHaveCount(0);
        await page.locator('#notebook-city').fill('Osaka');
        await page.locator('#notebook-panel-tastes').getByLabel('Chinese', { exact: true }).check();
        await page.getByLabel('Food allergies', { exact: true }).selectOption('selected');
        await page.locator('#notebook-panel-tastes').getByLabel('Tree nuts', { exact: true }).check();
        await page.locator('#notebook-panel-tastes').getByLabel('Mango', { exact: true }).check();
        await page.getByLabel('Foods you avoid', { exact: true }).selectOption('selected');
        await page.getByLabel('Cilantro', { exact: true }).check();
        await page.getByRole('button', { name: 'Save dietary preferences' }).click();
        await expect(page.locator('.notebook-notice')).toContainText('Dietary preferences saved');
        expect(data.getDiet().allergens).toEqual(['tree_nut', 'mango']);
        expect(data.getDiet().city).toBe('Osaka');
        await expect(page.getByRole('group', { name: 'Cuisine', exact: true }).getByRole('checkbox')).toHaveCount(24);
        await page.screenshot({ path: info.outputPath('notebook-tastes.png'), fullPage: true });
        await page.getByRole('tab', { name: 'Health data' }).click();
        await page.getByLabel('Weight (kg)', { exact: true }).fill('60');
        await page.getByLabel('Height (cm)', { exact: true }).fill('165');
        await expect(page.getByLabel('BMI', { exact: true })).toHaveText('22.0');
        await page.locator('#notebook-bodyFatStatus').selectOption('unknown');
        await page.getByLabel('Current goal', { exact: true }).selectOption('wellness');
        await page.getByLabel('Chronotype', { exact: true }).selectOption('morning');
        await page.getByLabel('Breakfast habit', { exact: true }).selectOption('often');
        await page.getByLabel('Lunch habit', { exact: true }).selectOption('often');
        await page.getByLabel('Dinner habit', { exact: true }).selectOption('sometimes');
        await page.getByRole('button', { name: 'Save new record' }).click();
        await expect(page.locator('.notebook-history li')).toHaveCount(1);
        const original = JSON.stringify(data.records[0]);
        await page.getByLabel('Weight (kg)', { exact: true }).fill('65');
        await page.getByLabel('Body fat measurement', { exact: true }).selectOption('measured');
        await page.getByLabel('Body fat (%)', { exact: true }).fill('20.5');
        await page.getByRole('button', { name: 'Save new record' }).click();
        await expect(page.locator('.notebook-history li')).toHaveCount(2);
        expect(data.records[0].bodyFatPct).toBe(20.5);
        expect(JSON.stringify(data.records[1])).toBe(original);
        await page.locator('.notebook-history li').nth(1).locator('summary').click();
        await page.locator('.notebook-history li').nth(1).getByRole('button', { name: 'Copy to new record' }).click();
        await expect(page.getByLabel('Weight (kg)', { exact: true })).toHaveValue('60');
        await expect(page.getByLabel('Body fat measurement', { exact: true })).toHaveValue('unknown');
        await expect(page.locator('#notebook-bodyFatPct')).toHaveCount(0);
        await page.getByLabel('Weight (kg)', { exact: true }).fill('61');
        await page.getByRole('button', { name: 'Save new record' }).click();
        await expect(page.locator('.notebook-history li')).toHaveCount(3);
        expect(JSON.stringify(data.records[2])).toBe(original);
        expect(new Set(data.saves.map(record => record.id)).size).toBe(3);
        expect(data.records[0].bodyFatPct).toBeNull();
        await page.screenshot({ path: info.outputPath('notebook-health.png'), fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
        await page.getByLabel('Weight (kg)', { exact: true }).fill('70');
        await page.locator('.notebook-history li').first().locator('summary').click();
        await page.locator('.notebook-history li').first().getByRole('button', { name: 'Copy to new record' }).click();
        await expect(page.getByRole('alert')).toContainText('unsaved');
        await page.getByRole('button', { name: 'Keep editing' }).click();
        await expect(page.getByLabel('Weight (kg)', { exact: true })).toHaveValue('70');
        await page.locator('.notebook-history li').first().getByRole('button', { name: 'Copy to new record' }).click();
        await page.getByRole('button', { name: 'Discard changes' }).click();
        await expect(page.getByLabel('Weight (kg)', { exact: true })).toHaveValue('61');
        await page.getByRole('button', { name: 'Close panel', exact: true }).click();
        await expect(notebook).toBeFocused();
        await page.reload(); await openNotebook(page);
        await page.getByRole('tab', { name: 'Your tastes' }).click();
        await expect(page.locator('#notebook-city')).toHaveValue('Osaka');
        await expect(page.getByLabel('Tree nuts', { exact: true })).toBeChecked();
        await page.getByRole('tab', { name: 'Health data' }).click();
        await expect(page.getByLabel('Weight (kg)', { exact: true })).toHaveValue('61');
        await page.getByLabel('Weight (kg)', { exact: true }).fill('70');
        await page.getByRole('button', { name: 'Close panel', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText('unsaved');
        await page.getByRole('button', { name: 'Keep editing' }).click();
        await expect(page.getByLabel('Weight (kg)', { exact: true })).toHaveValue('70');
        await page.getByRole('button', { name: 'Close panel', exact: true }).click();
        await page.getByRole('button', { name: 'Discard changes' }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        expect(data.records).toHaveLength(3);
    });
}

test('notebook three languages and failed saves keep the draft', async ({ page }) => {
    await mockNotebook(page); await enterNotebookRoom(page);
    await openNotebook(page);
    await expect(page.getByRole('dialog').getByLabel('Language', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    await page.getByLabel('Language', { exact: true }).selectOption('zh-CN');
    await openNotebook(page);
    await page.getByRole('tab', { name: '健康数据' }).click();
    await expect(page.getByLabel('体重 (kg)', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '关闭面板', exact: true }).click();
    await page.getByLabel('语言', { exact: true }).selectOption('ja-JP');
    await openNotebook(page);
    await page.getByRole('tab', { name: '健康データ' }).click();
    await expect(page.getByLabel('体重 (kg)', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    await page.getByLabel('言語', { exact: true }).selectOption('en-US');
    await openNotebook(page);
    await page.getByRole('tab', { name: 'Your tastes' }).click();
    await page.getByLabel('Food allergies', { exact: true }).selectOption('selected');
    await page.getByLabel('Milk', { exact: true }).check();
    await page.route('**/api/me/dietary-preferences', route => route.fulfill({ status: 503, json: { ok: false, error: { code: 'NOTEBOOK_UNAVAILABLE' } } }));
    await page.getByRole('button', { name: 'Save dietary preferences' }).click();
    await expect(page.getByRole('alert')).toContainText('Notebook data is unavailable');
    await expect(page.getByLabel('Milk', { exact: true })).toBeChecked();
});

test('region keywords and current location can be saved and restored', async ({ page }, info) => {
    const data = await mockNotebook(page);
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 35.6895, longitude: 139.6917 });
    const feature = (name: string, id: number) => ({ properties: { name, city: name, country: 'Japan', countrycode: 'JP', osm_type: 'R', osm_id: id } });
    await page.route('https://photon.komoot.io/**', route => {
        const url = new URL(route.request().url());
        const name = url.pathname.startsWith('/reverse') ? 'Shinjuku' : 'Osaka';
        return route.fulfill({ json: { features: [feature(name, 1)] }, headers: { 'access-control-allow-origin': '*' } });
    });
    await enterNotebookRoom(page); await openNotebook(page);
    await page.getByRole('tab', { name: 'Your tastes' }).click();
    await page.getByRole('button', { name: 'Use current location', exact: true }).click();
    await expect(page.locator('#notebook-city')).toHaveValue('Shinjuku');
    await page.getByRole('button', { name: 'Save dietary preferences' }).click();
    await expect(page.locator('.notebook-notice')).toContainText('saved');
    expect(data.getDiet().city).toBe('Shinjuku');
    await page.locator('#notebook-city').fill('Osa');
    await expect(page.getByRole('option', { name: /Osaka/ })).toBeVisible();
    await page.screenshot({ path: info.outputPath('region-suggestions.png'), fullPage: true });
    await page.locator('#notebook-city').press('ArrowDown');
    await page.locator('#notebook-city').press('Enter');
    await expect(page.locator('#notebook-city')).toHaveValue('Osaka');
    await page.getByRole('button', { name: 'Save dietary preferences' }).click();
    await expect(page.locator('.notebook-notice')).toContainText('saved');
    await page.reload(); await openNotebook(page);
    await page.getByRole('tab', { name: 'Your tastes' }).click();
    await expect(page.locator('#notebook-city')).toHaveValue('Osaka');
});

test('denied location and lookup errors still allow manual region save', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_success: unknown, failure: (error: { code: number }) => void) => failure({ code: 1 }) } });
    });
    const data = await mockNotebook(page);
    await enterNotebookRoom(page); await openNotebook(page);
    await page.getByRole('tab', { name: 'Your tastes' }).click();
    await page.getByRole('button', { name: 'Use current location', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('permission was denied');
    await page.route('https://photon.komoot.io/**', route => route.fulfill({ status: 503, json: {}, headers: { 'access-control-allow-origin': '*' } }));
    await page.locator('#notebook-city').fill('Manual area');
    await page.getByRole('button', { name: 'Search area', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('lookup is unavailable');
    await page.getByRole('button', { name: 'Save dietary preferences' }).click();
    await expect(page.locator('.notebook-notice')).toContainText('saved');
    expect(data.getDiet().city).toBe('Manual area');
});

test('late region results cannot replace a newer selection', async ({ page }) => {
    await mockNotebook(page);
    let release = () => { };
    const delayed = new Promise<void>(resolve => { release = resolve; });
    await page.route('https://photon.komoot.io/**', async route => {
        const old = new URL(route.request().url()).searchParams.get('q') === 'Old';
        if (old) await delayed;
        try { await route.fulfill({ json: { features: [{ properties: { name: old ? 'Old area' : 'New area', osm_id: old ? 1 : 2 } }] }, headers: { 'access-control-allow-origin': '*' } }); } catch { }
    });
    await enterNotebookRoom(page); await openNotebook(page);
    await page.getByRole('tab', { name: 'Your tastes' }).click();
    await page.locator('#notebook-city').fill('Old');
    await expect(page.locator('.region-status')).toContainText('Searching');
    await page.locator('#notebook-city').fill('New');
    await page.getByRole('option', { name: 'New area', exact: true }).click();
    release();
    await expect(page.locator('#notebook-city')).toHaveValue('New area');
    await expect(page.locator('.region-results')).toHaveCount(0);
});

test('Chinese names retry with traditional text for Japanese areas', async ({ page }) => {
    await mockNotebook(page); await enterNotebookRoom(page);
    await page.getByLabel('Language', { exact: true }).selectOption('zh-CN');
    const queries: string[] = [];
    await page.route('https://photon.komoot.io/**', route => {
        const query = new URL(route.request().url()).searchParams.get('q') || '';
        queries.push(query);
        return route.fulfill({ json: { features: query === '東京 日本' ? [{ properties: { name: '東京', city: '東京', countrycode: 'JP', osm_id: 1 } }] : [] }, headers: { 'access-control-allow-origin': '*' } });
    });
    await openNotebook(page);
    await page.getByRole('tab', { name: '你的口味' }).click();
    await page.locator('#notebook-city').fill('东京 日本');
    await expect(page.getByRole('option', { name: /東京/ })).toBeVisible();
    expect(queries).toEqual(['东京 日本', '東京 日本']);
    await page.getByRole('option', { name: /東京/ }).click();
    await expect(page.locator('#notebook-city')).toHaveValue('東京');
});

for (const width of [1280, 375, 320]) {
    test(`fridge opens only personal tastes without the notebook at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 850 });
        const data = await mockNotebook(page); await enterNotebookRoom(page);
        let healthReads = 0;
        page.on('request', request => { if (new URL(request.url()).pathname === '/api/me/health-records') healthReads++; });
        const fridge = page.locator('.furniture-fridge');
        await fridge.click();
        await expect(page.getByRole('dialog', { name: 'Personal tastes' })).toBeVisible();
        await expect(page.locator('.taste-dialog')).toHaveCSS('background-color', 'rgb(255, 244, 220)');
        await expect(page.locator('.taste-dialog')).toHaveCSS('border-top-color', 'rgb(146, 112, 73)');
        await expect(page.locator('.taste-dialog .notebook-tools button')).toHaveCSS('border-radius', '0px');
        await expect(page.getByRole('tab')).toHaveCount(0);
        await expect(page.locator('.notebook-flyleaf')).toHaveCount(0);
        await expect(page.locator('#notebook-panel-profile')).toHaveCount(0);
        await expect(page.locator('#notebook-panel-health')).toHaveCount(0);
        await expect(page.locator('#notebook-city')).toBeFocused();
        await expect(page.locator('.scene-overlay')).toHaveCount(0);
        await expect(page.locator('#notebook-city')).toBeVisible();
        await expect(page.getByRole('group', { name: 'Cuisine', exact: true }).getByRole('checkbox')).toHaveCount(24);
        await page.locator('#notebook-city').fill('Tokyo');
        await page.getByRole('button', { name: 'Save dietary preferences' }).click();
        await expect(page.locator('.notebook-notice')).toContainText('saved');
        expect(data.getDiet().city).toBe('Tokyo');
        expect(healthReads).toBe(0);
        await page.locator('.notebook-content').evaluate(element => element.scrollTo({ top: 0 }));
        await page.screenshot({ path: info.outputPath('fridge-tastes.png'), fullPage: true });
        await page.getByRole('button', { name: 'Close panel', exact: true }).click();
        await expect(fridge).toBeFocused();
        await openNotebook(page);
        await expect(page.getByRole('tab', { name: 'Personal profile', exact: true })).toHaveAttribute('aria-selected', 'true');
        await page.getByRole('tab', { name: 'Your tastes', exact: true }).click();
        await expect(page.locator('#notebook-city')).toHaveValue('Tokyo');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    });
}
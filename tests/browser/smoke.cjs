const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const runCharacterChecks = require('./character.cjs');
const runSchoolImportChecks = require('./school-import.cjs');
const runGameChecks = require('./games.cjs');
const runPersistenceChecks = require('./persistence.cjs');
const runCommunityChecks = require('./community-sets.cjs');
const runHomeChecks = require('./home.cjs');

const root = path.resolve(__dirname, '../..');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };

async function serve(request, response) {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        let file = path.resolve(root, `.${pathname}`);
        if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
            response.writeHead(403).end();
            return;
        }
        if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
        const contents = await fs.readFile(file);
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        response.end(contents);
    } catch (error) {
        if (error.code !== 'ENOENT') console.error('Browser test server failed:', error);
        response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
    }
}

(async () => {
    const server = http.createServer(serve);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    let browser;
    try {
        browser = await chromium.launch();
        for (const [name, width, height] of [
            ['desktop', 1366, 768], ['tablet', 820, 1180], ['phone', 390, 844],
            ['small-phone', 320, 568], ['landscape', 844, 390]
        ]) {
            const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
            try {
                let chartRequests = 0, accountLibraryRequests = 0, chartsReachable = false;
                await context.addInitScript(() => {
                    localStorage.setItem('STUDBUD_LOCAL_MODE', 'true');
                    Object.defineProperty(navigator, 'onLine', { get: () => false });
                });
                await context.route('**/*', route => {
                    const url = new URL(route.request().url());
                    if (url.origin === origin) return route.continue();
                    if (url.href === 'https://cdn.jsdelivr.net/npm/chart.js') {
                        chartRequests++;
                        if (!chartsReachable) return route.abort();
                        return route.fulfill({ contentType: 'application/javascript',
                            body: 'window.Chart = class { constructor(canvas, config) { this.config = config; } destroy() {} };' });
                    }
                    if (url.href === 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js') accountLibraryRequests++;
                    return route.abort();
                });
                const page = await context.newPage(), errors = [];
                page.on('pageerror', error => errors.push(error.message));
                await page.goto(origin);
                await page.waitForFunction(() => window.StudBudCloud?.appStarted);
                assert.equal(chartRequests, 0, 'studying does not load the chart library at startup');
                assert.equal(accountLibraryRequests, 0, 'offline guest startup does not download the account SDK');
                await runHomeChecks(page);
                if (name === 'desktop') await runPersistenceChecks(page);
                await runSchoolImportChecks(page);
                await runGameChecks.runLayoutChecks(page);
                await runCharacterChecks(page);
                await runCommunityChecks(page);
                await runCommunityChecks.runClassroomChecks(page);
                await page.evaluate(() => {
                    window.NexusApp.closeModal();
                    document.querySelector('[data-target="analytics-view"]').click();
                });
                const retry = page.getByRole('button', { name: 'Retry charts', exact: true });
                await retry.waitFor({ state: 'visible' });
                // Late background refreshes may re-request the library while offline; stay offline until Retry is visible.
                chartsReachable = true;
                await retry.click({ timeout: 2000 }).catch(() => {});
                await page.waitForFunction(() => !!window.Chart);
                assert.ok(chartRequests >= 2, 'on-demand chart loading can recover without a page reload');
                if (name === 'desktop') await runGameChecks(page);
                assert.deepEqual(errors, [], `${name}: no uncaught browser errors`);
                console.log(`${name}: Home actions/layout, import review/undo, character camera/layout, community discovery/sharing, and chart lazy-load/retry passed.`);
            } finally { await context.close(); }
        }
    } finally {
        if (browser) await browser.close();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });

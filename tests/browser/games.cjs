const assert = require('node:assert/strict');

async function runGameLayoutChecks(page) {
    const { width, height } = page.viewportSize(), diagnostic = `${width}x${height}`;
    await page.locator('#sidebar [data-target="multiplayer-view"]').click();
    await page.locator('#multiplayer-view.active').waitFor();
    for (const screen of ['host', 'join', 'solo']) {
        await page.locator(`[data-multiplayer-tab="${screen}"]`).click();
        const layout = await page.evaluate(() => {
            const title = document.getElementById('active-view-title');
            const titleBox = title.getBoundingClientRect();
            const visible = element => element.getClientRects().length > 0;
            const measure = element => {
                const box = element.getBoundingClientRect(), style = getComputedStyle(element);
                return { text: element.textContent.trim(), width: box.width, height: box.height,
                    contentWidth: box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2,
                    font: style.font };
            };
            const workspace = document.getElementById('workspace-tabs');
            const tabs = [...workspace.querySelectorAll('button')].filter(visible);
            const context = document.createElement('canvas').getContext('2d');
            const cramped = [...tabs, ...document.querySelectorAll('.multiplayer-tab')].filter(visible)
                .map(measure).filter(item => {
                    context.font = item.font;
                    return item.text.split(/\s+/).some(word => context.measureText(word).width > item.contentWidth + 1);
                }).map(item => item.text);
            const lastTab = tabs.at(-1).getBoundingClientRect(), workspaceBox = workspace.getBoundingClientRect();
            return { titleWidth: titleBox.width, cramped,
                unusedTabSpace: workspaceBox.right - lastTab.right,
                cards: [...document.querySelectorAll('.multiplayer-mode')].filter(visible).map(measure),
                overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
        });
        assert.equal(layout.overflow, false, `${diagnostic}/${screen}: Games never scrolls horizontally`);
        assert.deepEqual(layout.cramped, [], `${diagnostic}/${screen}: navigation labels never split inside a word`);
        if (width <= 600) {
            assert.ok(layout.titleWidth >= 180, `${diagnostic}/${screen}: heading has room beside or above the wallet`);
            assert.ok(layout.unusedTabSpace < 16, `${diagnostic}/${screen}: hidden guest tabs do not leave empty columns`);
        }
        for (const card of layout.cards) {
            assert.ok(card.width >= 160, `${diagnostic}/${screen}: ${card.text} has readable card width`);
        }
    }
    await page.locator('[data-multiplayer-tab="host"]').click();
}

async function setGameDeck(page) {
    await page.evaluate(() => window.NexusApp.AppState.set('flashcards', [{
        id: 'browser-game-deck', title: 'Browser checks',
        cards: [
            { id: 'one', front: 'One plus one?', back: 'Two' },
            { id: 'two', front: 'Two plus one?', back: 'Three' },
            { id: 'three', front: 'Two plus two?', back: 'Four' },
            { id: 'four', front: 'Three plus two?', back: 'Five' }
        ]
    }]));
}

async function startPractice(page, mode, botCount = 3) {
    await page.evaluate(({ mode, botCount }) => window.NexusApp.startPractice(mode, { deckId: 'browser-game-deck', seed: 42, botCount }), { mode, botCount });
    await page.locator('.mpg-objective').filter({ hasText: /^Goal: / }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.NexusApp.practiceSession?.countdown <= 0);
}

async function runTouchChecks(page) {
    await setGameDeck(page);
    await startPractice(page, 'defense', 0);
    const shop = page.locator('[data-defense="toggle"]');
    const panel = page.locator('#mpg-defense-panel');
    const tray = page.locator('.mpg-defense-tray');
    assert.match(await page.locator('.mpg-objective').textContent(), /Protect your base/);
    assert.equal(await panel.isVisible(), false, 'shop starts minimized');
    const { width, height } = page.viewportSize();
    const collapsed = await tray.boundingBox();
    assert.ok(collapsed.width * collapsed.height < width * height * .16, 'minimized controls leave the map visible');
    await shop.tap();
    assert.equal(await panel.isVisible(), true);
    await page.getByRole('button', { name: 'Send enemies', exact: true }).tap();
    assert.match(await panel.locator('.mpg-defense-instruction').textContent(), /every rival wave/);
    await shop.tap();
    assert.equal(await panel.isVisible(), false, 'the shop can be hidden again');
    await shop.tap();
    await page.getByRole('button', { name: 'Build towers', exact: true }).tap();
    const tower = page.locator('[data-defense="build:0"]');
    assert.ok((await tower.boundingBox()).height >= 44);
    await tower.tap();
    assert.equal(await panel.isVisible(), false, 'choosing a tower makes room for placement');
    assert.match(await tray.locator('.mpg-defense-status').textContent(), /Tap an empty cell/);
    await page.getByRole('button', { name: 'Cancel', exact: true }).tap();
    assert.equal(await page.evaluate(() => window.NexusApp.practiceSession.game.buildType), null);
    await shop.tap();
    await tower.tap();
    const cell = await page.evaluate(() => {
        const session = window.NexusApp.practiceSession, game = session.game;
        const { x, y } = game.gridPoint(game.me.x, game.me.y);
        for (const dy of [0, -70, 70, -140, 140]) for (const dx of [0, -70, 70, -140, 140]) {
            if (!game.validPlacement(x + dx, y + dy, game.myTeam)) continue;
            const px = ((x + dx - game.camX) * game.zoom + session.vw / 2) * session.scale;
            const py = ((y + dy - game.camY) * game.zoom + session.vh / 2) * session.scale;
            if (document.elementFromPoint(px, py) === session.canvas) return { x: px, y: py };
        }
        return null;
    });
    assert.ok(cell, 'a legal tower cell is reachable without an overlay blocking the map');
    await page.touchscreen.tap(cell.x, cell.y);
    await page.waitForFunction(() => window.NexusApp.practiceSession.game.troops.length === 1);
    await page.touchscreen.tap(cell.x, cell.y);
    await panel.locator('.mpg-defense-tower').waitFor({ state: 'visible' });
    await shop.tap();
    assert.equal(await panel.isVisible(), false, 'tower management can also be minimized');
    await page.getByRole('button', { name: 'Earn cash', exact: true }).tap();
    await page.locator('.mpg-question').waitFor({ state: 'visible' });
    await page.locator('.mpg-q-skip').tap();
    await page.evaluate(() => window.NexusApp.closePractice());

    await startPractice(page, 'duel');
    const attack = page.getByRole('button', { name: 'Attack', exact: true });
    const jump = page.getByRole('button', { name: 'Jump', exact: true });
    const stick = page.locator('.mpg-stick');
    const [attackBox, jumpBox, stickBox] = await Promise.all([attack.boundingBox(), jump.boundingBox(), stick.boundingBox()]);
    assert.ok(stickBox.x + stickBox.width <= jumpBox.x && jumpBox.x + jumpBox.width <= attackBox.x,
        'movement stays on the left and Jump and Attack sit side by side');
    assert.ok(Math.min(attackBox.height, jumpBox.height, attackBox.width, jumpBox.width) >= 44);
    await attack.tap();
    await page.waitForFunction(() => window.NexusApp.practiceSession.game.swingCd > 0);
    await jump.tap();
    await page.waitForFunction(() => {
        const game = window.NexusApp.practiceSession.game;
        return game.jumpPulse > 0 || game.airJumpPulse > 0;
    });
    await page.evaluate(() => window.NexusApp.closePractice());
    assert.equal(await page.locator('.mpg-overlay').count(), 0, 'touch sessions clean up on exit');
}

module.exports = async function runGameChecks(page) {
    await setGameDeck(page);
    const modes = await page.evaluate(() => Object.keys(window.StudBudArcade.games));
    assert.ok(modes.length > 0);
    for (const mode of modes) {
        await startPractice(page, mode);
        const samples = await page.evaluate(() => new Promise(resolve => {
            const times = [];
            let previous;
            const sample = now => {
                if (previous !== undefined) times.push(now - previous);
                previous = now;
                if (times.length < 60) requestAnimationFrame(sample);
                else resolve(times);
            };
            requestAnimationFrame(sample);
        }));
        const state = await page.evaluate(() => {
            const session = window.NexusApp.practiceSession;
            return { time: session.t, width: session.canvas.width, height: session.canvas.height,
                invalidActors: session.remoteList().some(actor =>
                    'x' in actor && !Number.isFinite(actor.x) || 'y' in actor && !Number.isFinite(actor.y)) };
        });
        assert.ok(state.time > 0 && state.width > 0 && state.height > 0, `${mode}: simulation renders and advances`);
        assert.equal(state.invalidActors, false, `${mode}: actor positions remain finite`);
        const sorted = samples.slice().sort((a, b) => a - b);
        const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)];
        console.log(`${mode}: browser frame-time p95=${p95.toFixed(1)} ms, max=${sorted.at(-1).toFixed(1)} ms, frames >50 ms=${samples.filter(ms => ms > 50).length}/${samples.length}`);
        await page.locator('.mpg-leave').click();
        await page.locator('.mpg-results').waitFor({ state: 'visible' });
        await page.locator('.mpg-exit').click();
        await page.waitForFunction(() => !window.NexusApp.practiceSession);
        assert.equal(await page.locator('.mpg-overlay').count(), 0, `${mode}: game overlays are released`);
        assert.equal(await page.evaluate(() => window.StudBudSfx.mus === null), true, `${mode}: music is released on exit`);
    }
};

module.exports.runLayoutChecks = runGameLayoutChecks;
module.exports.runTouchChecks = runTouchChecks;

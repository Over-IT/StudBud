const assert = require('node:assert/strict');

module.exports = async function runGameChecks(page) {
    await page.evaluate(() => window.NexusApp.AppState.set('flashcards', [{
        id: 'browser-game-deck', title: 'Browser checks',
        cards: [
            { id: 'one', front: 'One plus one?', back: 'Two' },
            { id: 'two', front: 'Two plus one?', back: 'Three' },
            { id: 'three', front: 'Two plus two?', back: 'Four' },
            { id: 'four', front: 'Three plus two?', back: 'Five' }
        ]
    }]));
    const modes = await page.evaluate(() => Object.keys(window.StudBudArcade.games));
    assert.ok(modes.length > 0);
    for (const mode of modes) {
        await page.evaluate(mode => window.NexusApp.startPractice(mode, { deckId: 'browser-game-deck', seed: 42, botCount: 3 }), mode);
        await page.waitForFunction(() => window.NexusApp.practiceSession?.countdown <= 0);
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

const assert = require('node:assert/strict');

module.exports = async function runHomeChecks(page) {
    const saved = await page.evaluate(() => structuredClone(window.NexusApp.AppState.state));
    try {
        await page.locator('#sidebar [data-target="dashboard-view"]').click();
        const logo = page.locator('#dashboard-view .home-welcome-mark');
        await logo.waitFor({ state: 'visible' });
        assert.ok(await logo.evaluate(image => image.complete && image.naturalWidth > 0),
            'Home displays the StudBud logo on every screen size');
        await page.evaluate(() => {
            const app = window.NexusApp;
            app.AppState.saveStateChanges({ courses: [], assignments: [], flashcards: [] });
            app.renderUI();
        });
        await page.locator('#home-primary-action').click();
        await page.waitForFunction(() => window.NexusApp.AppState.get('currentView') === 'gpa');
        await page.locator('#sidebar [data-target="dashboard-view"]').click();
        await page.evaluate(() => {
            const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const today = new Date();
            const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
            const app = window.NexusApp;
            app.AppState.saveStateChanges({
                courses: [{ code: 'home-math', title: 'Math & problem solving', term: 'FY', credits: 1 }],
                assignments: [
                    { id: 'home-due', courseCode: 'home-math', title: 'Practice a little algebra', kind: 'assignment',
                        dueDate: dateKey(today), status: 'pending', graded: false, estimatedMinutes: 30 },
                    { id: 'home-overdue', courseCode: 'home-math', title: 'Finish the geometry reflection and check your reasoning',
                        kind: 'assignment', dueDate: dateKey(yesterday), status: 'pending', graded: false, estimatedMinutes: 30 },
                    { id: 'home-done', courseCode: 'home-math', title: 'Finished task', kind: 'assignment',
                        dueDate: dateKey(today), status: 'completed', graded: false }
                ],
                flashcards: [{ id: 'home-set', title: 'Algebra practice', cards: [{ id: 'one', front: '2 + 2', back: '4' }] }]
            });
            app.renderUI();
        });
        assert.equal(await page.locator('#home-due-today').innerText(), '1');
        assert.equal(await page.locator('#home-overdue').innerText(), '1');
        assert.equal(await page.locator('#home-set-count').innerText(), '1');
        await page.locator('#priority-task-list [data-action="toggle-assignment"][data-id="home-due"]').click();
        await page.waitForFunction(() => document.getElementById('home-due-today').textContent === '0');
        assert.match(await page.locator('#home-grade-inbox').innerText(), /Ready to add grades \(2\)/);
        await page.locator('#quick-add-task-btn').click();
        await page.locator('#assignment-name').waitFor({ state: 'visible' });
        await page.evaluate(() => window.NexusApp.closeModal());
        const layout = await page.locator('#dashboard-view').evaluate(root => {
            const visible = element => element.getClientRects().length > 0;
            const width = document.documentElement.clientWidth;
            return {
                overflow: document.documentElement.scrollWidth > width + 1,
                clipped: [...root.querySelectorAll('.home-destinations button, .home-at-a-glance button, .home-task, .widget')]
                    .filter(visible).filter(element => {
                        const rect = element.getBoundingClientRect();
                        return rect.left < -1 || rect.right > width + 1;
                    }).map(element => element.className)
            };
        });
        assert.equal(layout.overflow, false, 'Home never requires horizontal scrolling');
        assert.deepEqual(layout.clipped, [], 'Home cards and task actions stay inside the viewport');
        for (const [target, route] of [['gpa-view', 'gpa'], ['planner-view', 'planner'],
            ['flashcard-view', 'flashcard'], ['multiplayer-view', 'multiplayer']]) {
            await page.locator(`.home-destinations [data-target="${target}"]`).click();
            await page.waitForFunction(route => window.NexusApp.AppState.get('currentView') === route, route);
            await page.locator('#sidebar [data-target="dashboard-view"]').click();
        }
        for (const [target, route] of [['tasks-view', 'tasks'], ['study-manage-view', 'study-manage']]) {
            await page.locator(`.home-at-a-glance [data-target="${target}"]`).first().click();
            await page.waitForFunction(route => window.NexusApp.AppState.get('currentView') === route, route);
            await page.locator('#sidebar [data-target="dashboard-view"]').click();
        }
        await page.locator('.header-settings-button').click();
        await page.locator('#settings-view.active').waitFor();
        const flashcards = page.locator('#settings-view details').filter({ has: page.locator('#settings-study-mode') });
        const availability = page.locator('#planner-availability');
        for (const panel of [flashcards, availability]) {
            assert.equal(await panel.getAttribute('open'), null, 'Secondary settings start collapsed');
            const collapsedHeight = (await panel.boundingBox()).height;
            await panel.locator('summary').focus();
            await page.keyboard.press('Enter');
            assert.ok(await panel.evaluate(element => element.open), 'Settings sections expand with the keyboard');
            assert.ok((await panel.boundingBox()).height > collapsedHeight + 60, 'Collapsed settings save meaningful vertical space');
            await panel.locator('summary').click();
        }
        await flashcards.locator('summary').click();
        const answerStyle = page.locator('#settings-study-mode');
        const originalStyle = await answerStyle.inputValue();
        const nextStyle = originalStyle === 'type' ? 'reveal' : 'type';
        await answerStyle.selectOption(nextStyle);
        await flashcards.locator('summary').click();
        await flashcards.locator('summary').click();
        assert.equal(await answerStyle.inputValue(), nextStyle, 'Collapsing preferences preserves saved selections');
        assert.equal(await page.evaluate(() => localStorage.getItem('studbud-type-answer')), nextStyle === 'type' ? '1' : '0',
            'Expanded preference controls still save normally');
        await answerStyle.selectOption(originalStyle);
        await flashcards.locator('summary').click();
        assert.equal(await page.locator('#settings-start-page').isVisible(), true, 'Common app preferences stay visible');
        assert.equal(await page.locator('#sign-out-btn').isVisible(), true, 'Account controls stay visible');
    } finally {
        await page.evaluate(saved => {
            const app = window.NexusApp;
            app.closeModal();
            app.AppState.state = saved;
            app.AppState.saveToLocalStorage();
            app.renderUI();
        }, saved);
    }
};

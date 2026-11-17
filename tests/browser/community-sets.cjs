const assert = require('node:assert/strict');

module.exports = async function runCommunitySetChecks(page) {
    await page.evaluate(() => {
        const api = window.StudBudCommunityGames;
        const names = ['searchDecks', 'importDeck', 'hasAccount', 'getUserId', 'friendCall',
            'listBudSets', 'shareDeckWithBud', 'removeBudSet', 'publishDeck'];
        const originals = Object.fromEntries(names.map(name => [name, api[name]]));
        const cards = [{ front: 'Cell <script>not executable</script>', back: 'Basic unit of life' },
            { front: 'DNA', back: 'Genetic information' }, { front: 'ATP', back: 'Energy carrier' }];
        const rows = [
            { id: 'browser-public-bio', owner_id: 'browser-author', title: 'Biology sample', course: 'Biology',
                card_count: 3, study_count: 20, updated_at: '2026-01-01', author_name: 'SampleAuthor', cards },
            { id: 'browser-public-art', owner_id: 'browser-author', title: 'Art sample', course: 'Art',
                card_count: 2, study_count: 2, updated_at: '2026-11-01', author_name: 'SampleAuthor', cards: cards.slice(0, 2) }
        ];
        window.__communityBrowser = { originals, rows, calls: [], fail: false, budFail: false,
            baselineIds: window.NexusApp.AppState.get('flashcards').map(deck => deck.id),
            draftState: Object.fromEntries(['deckEditorDraft', 'deckEditorDrafts', 'deckEditorSaved', 'deckEditorOwner',
                'deckEditorExisting', 'deckEditorOriginalCards', 'deckEditorUndo'].map(key => [key, window.NexusApp[key]])) };
        api.searchDecks = async query => {
            if (window.__communityBrowser.fail) throw new Error('Deterministic library outage');
            return rows.filter(row => `${row.title} ${row.course}`.toLowerCase().includes(query.toLowerCase()));
        };
        api.importDeck = async id => rows.find(row => row.id === id);
        api.hasAccount = () => true;
        api.getUserId = () => 'browser-self';
        api.friendCall = async () => ({ friends: [{ user_id: 'browser-recipient', username: 'TestBud' }] });
        api.listBudSets = async id => {
            if (window.__communityBrowser.budFail) throw new Error('Bud set sharing needs a server update: supabase-setup.sql');
            const share = { id: 'browser-bud-share', title: 'Bud biology', owner_id: 'browser-author',
                author_name: 'TestBud', recipient_name: 'You', outgoing: false, card_count: cards.length, cards };
            return id && id !== share.id ? [] : [share];
        };
        api.shareDeckWithBud = async (deck, id) => { window.__communityBrowser.calls.push({ action: 'bud', id, deckId: deck.id }); return 'sent'; };
        api.removeBudSet = async id => { window.__communityBrowser.calls.push({ action: 'remove', id }); };
        api.publishDeck = async () => { window.__communityBrowser.calls.push({ action: 'public' }); return { id: 'public' }; };
        window.NexusApp.closeModal();
        document.querySelector('[data-target="study-discover-view"]').click();
    });
    const close = async () => page.evaluate(() => window.NexusApp.closeModal());
    const confirm = async () => {
        const button = page.locator('dialog.app-confirmation button[value="confirm"]');
        await button.waitFor({ state: 'visible' });
        await button.click();
    };
    try {
        await page.locator('[data-action="preview-community-set"]').first().waitFor();
        assert.equal(await page.locator('#community-deck-results .community-deck-card').count(), 2);
        await page.selectOption('#community-deck-sort', 'recent');
        assert.match(await page.locator('#community-deck-results .community-deck-card').first().textContent(), /Art sample/);
        await page.selectOption('#community-deck-course', 'Biology');
        assert.equal(await page.locator('#community-deck-results .community-deck-card').count(), 1);
        await page.locator('[data-action="preview-community-set"]').click();
        await page.getByText('Basic unit of life', { exact: true }).waitFor();
        assert.equal(await page.locator('#community-preview-cards script').count(), 0, 'preview escapes card HTML');
        assert.equal(await page.locator('#community-preview-cards article').count(), 3);
        await close();
        await page.locator('#community-deck-results [data-action="import-community-deck"]').click();
        await page.waitForFunction(() => window.NexusApp.AppState.get('flashcards').some(deck => deck.communitySourceId === 'browser-public-bio'));
        await page.selectOption('#community-deck-library', 'new');
        assert.equal(await page.locator('#community-deck-results .community-deck-card').count(), 0);
        await page.fill('#community-deck-query', 'nothing-matches');
        await page.locator('#community-deck-search-form button').click();
        await page.getByText('No matching sets.', { exact: false }).waitFor();
        await page.evaluate(() => { window.__communityBrowser.fail = true; });
        await page.locator('#community-deck-search-form button').click();
        await page.getByText('No results are shown because this search failed.').waitFor();
        await page.evaluate(() => { window.__communityBrowser.fail = false; });
        await page.fill('#community-deck-query', '');
        await page.locator('[data-action="retry-community-search"]').click();
        await page.waitForFunction(() => document.getElementById('community-deck-results').dataset.loaded === 'true');
        await page.selectOption('#community-deck-course', '');
        await page.selectOption('#community-deck-library', 'all');
        await page.waitForFunction(() => document.getElementById('community-deck-status').textContent.includes('2 of 2'));

        await page.evaluate(() => {
            const app = window.NexusApp;
            app.deckEditorSaved = true;
            app.deckEditorDrafts = new Map();
            app.openDeckEditor();
        });
        await page.fill('#deck-editor-title', 'Browser personal draft');
        await page.fill('#deck-quick-front', 'My term');
        await page.fill('#deck-quick-back', 'My answer');
        await close();
        await page.evaluate(() => window.NexusApp.openDeckEditor());
        assert.equal(await page.inputValue('#deck-editor-title'), 'Browser personal draft');
        assert.equal(await page.inputValue('#deck-quick-front'), 'My term');
        await page.locator('#deck-quick-back').press('Enter');
        await page.fill('#deck-quick-front', 'Second term');
        await page.fill('#deck-quick-back', 'Second answer');
        await page.locator('#deck-quick-back').press('Enter');
        await page.locator('#deck-editor-modal button[type="submit"][form="deck-editor-form"]').click();
        await page.waitForFunction(() => window.NexusApp.AppState.get('flashcards').some(deck => deck.title === 'Browser personal draft'));
        await page.evaluate(() => {
            window.__communityBrowser.createdDeckId = window.NexusApp.AppState.get('flashcards').find(deck => deck.title === 'Browser personal draft').id;
        });
        assert.equal(await page.evaluate(() => window.__communityBrowser.calls.length), 0, 'personal Save never shares');
        await page.evaluate(() => window.NexusApp.openSetSharing(window.NexusApp.AppState.get('flashcards').find(deck => deck.title === 'Browser personal draft').id));
        await page.selectOption('#set-sharing-bud', 'browser-recipient');
        await page.locator('#set-sharing-send').click();
        await confirm();
        await page.waitForFunction(() => window.__communityBrowser.calls.some(call => call.action === 'bud'));
        assert.equal(await page.evaluate(() => window.__communityBrowser.calls.filter(call => call.action === 'public').length), 0, 'Bud send does not publish');
        await close();
        await page.evaluate(() => window.NexusApp.loadBudSets());
        await page.locator('#bud-set-results [data-action="preview-bud-set"]').click();
        await page.getByText('Basic unit of life', { exact: true }).waitFor();
        await close();
        await page.locator('#bud-set-results [data-action="import-bud-set"]').click();
        await page.waitForFunction(() => window.NexusApp.AppState.get('flashcards').some(deck => deck.budShareId === 'browser-bud-share'));
        assert.equal(await page.evaluate(() => {
            try { window.StudBudCommunityGames.sharedDeckRow(window.NexusApp.AppState.get('flashcards').find(deck => deck.budShareId)); return false; }
            catch (error) { return /cannot be reposted/.test(error.message); }
        }), true);
        await page.evaluate(async () => { window.__communityBrowser.budFail = true; await window.NexusApp.loadBudSets(); });
        assert.match(await page.locator('#bud-set-status').innerText(), /supabase-setup\.sql/);
        const overflow = await page.locator('.community-deck-browser').evaluate(element => element.scrollWidth > element.clientWidth + 2);
        assert.equal(overflow, false, `community layout fits ${page.viewportSize().width}px`);
    } finally {
        await page.evaluate(async () => {
            const data = window.__communityBrowser;
            if (!data) return;
            window.NexusApp.closeModal();
            for (const deck of [...window.NexusApp.AppState.get('flashcards')]) {
                if (!data.baselineIds.includes(deck.id) && (deck.id === data.createdDeckId ||
                    deck.communitySourceId === 'browser-public-bio' || deck.budShareId === 'browser-bud-share')) {
                    await window.NexusApp.AppState.deleteFlashcardDeck(deck.id);
                }
            }
            Object.assign(window.StudBudCommunityGames, data.originals);
            Object.assign(window.NexusApp, data.draftState);
            window.NexusApp.communityDeckSearchResults = [];
            document.getElementById('community-deck-results').dataset.loaded = '';
            document.getElementById('community-deck-results').innerHTML = '';
            document.getElementById('bud-set-results').innerHTML = '';
            delete window.__communityBrowser;
        });
    }
};

module.exports.runClassroomChecks = async function runClassroomChecks(page) {
    await page.evaluate(() => {
        const app = window.NexusApp, classes = app.classrooms, community = app.schoolCommunity;
        const names = ['available', 'isTeacher', 'contextKey', 'call'];
        const originals = Object.fromEntries(names.map(name => [name, classes[name]]));
        const api = window.StudBudCommunityGames;
        const data = window.__classroomBrowser = { originals, schoolCall: api.schoolCall, calls: [], joined: false };
        classes.available = () => true;
        classes.isTeacher = () => false;
        classes.contextKey = () => 'browser-classroom';
        classes.call = async (fn, args) => {
            data.calls.push({ fn, args });
            if (fn === 'studbud_join_class') {
                data.joined = true;
                return { id: 'browser-classroom', title: 'Biology classroom' };
            }
            if (fn === 'studbud_leave_class') data.joined = false;
            return { classes: data.joined ? [{ id: 'browser-classroom', title: 'Biology classroom', course_code: 'BIO', decks: [] }] : [] };
        };
        api.schoolCall = async () => ({ can_post: true, people: [], decks: [], posts: [], live: [], class_sets: [] });
        community.resetContext();
        app.Router.navigate('classes');
    });
    try {
        const join = page.locator('[data-classroom-join]');
        await join.waitFor({ state: 'visible' });
        assert.match(await join.textContent(), /Joining shares your username and membership/);
        assert.equal(await page.locator('#public-share-courses, #public-show-classmates, [data-action="load-classmates"]').count(), 0);
        await join.getByLabel("Teacher's classroom code").fill('abc234');
        await join.getByRole('button', { name: 'Join classroom', exact: true }).click();
        await page.locator('[data-school-action="leave-class"]').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.community-tabs [data-tab="people"]').count(), 0);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        assert.equal(overflow, false, 'explicit classroom controls fit the viewport');
        await page.locator('[data-school-action="leave-class"]').click();
        await page.locator('dialog.app-confirmation button[value="confirm"]').click();
        await join.waitFor({ state: 'visible' });
        const calls = await page.evaluate(() => window.__classroomBrowser.calls);
        assert.deepEqual(calls.find(call => call.fn === 'studbud_join_class').args, { p_code: 'ABC234' });
        assert.ok(calls.filter(call => call.fn === 'studbud_my_classes').every(call => call.args === undefined));
        assert.deepEqual(calls.find(call => call.fn === 'studbud_leave_class').args, { p_class_id: 'browser-classroom' });
    } finally {
        await page.evaluate(() => {
            const app = window.NexusApp, data = window.__classroomBrowser;
            app.closeModal();
            Object.assign(app.classrooms, data.originals);
            window.StudBudCommunityGames.schoolCall = data.schoolCall;
            app.schoolCommunity.resetContext();
            app.Router.navigate('home');
            delete window.__classroomBrowser;
        });
    }
};

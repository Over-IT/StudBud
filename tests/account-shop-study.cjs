const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const storage = new Map();
const stores = new Map();
const events = [];
const elements = new Map();
const math = Object.create(Math);
math.random = () => 0;
const window = { addEventListener() {}, crypto: require('node:crypto').webcrypto };
window.StudBudSfx = { settings: {}, update(patch) { Object.assign(this.settings, patch); } };
const sandbox = {
    window, console, Math: math, Date, setTimeout, clearTimeout,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    document: { documentElement: { dataset: {} }, getElementById: id => elements.get(id) || null, querySelector: () => null },
    EventBus: { emit: (name, data) => events.push({ name, data }) },
    NexusDB: {
        getAll: async table => clone([...(stores.get(table)?.values() || [])]),
        put: async (table, row) => { if (!stores.has(table)) stores.set(table, new Map()); stores.get(table).set(row.id, clone(row)); },
        replaceStores: async records => { for (const [table, rows] of Object.entries(records)) stores.set(table, new Map(rows.map(row => [row.id, clone(row)]))); },
        clear: async table => stores.set(table, new Map())
    },
    StudBudSfx: { settings: {}, save() {} }
};
const context = vm.createContext(sandbox);
for (const file of ['communityGames.js', 'cloudSync.js', 'flashcardEngine.js']) vm.runInContext(source(file), context, { filename: file });
const appSource = source('app.js');
vm.runInContext(appSource.slice(appSource.indexOf('    class AppStateEngine'), appSource.indexOf('    const AppState =')), context);
vm.runInContext('globalThis.AppState = new AppStateEngine();', context);
vm.runInContext(appSource.slice(appSource.indexOf('    class AppOrchestrator'), appSource.indexOf('    window.NexusApp =')), context);
const app = vm.runInContext('Object.create(AppOrchestrator.prototype)', context);
app.animateShopAuras = () => {};
const state = sandbox.AppState;
const community = window.StudBudCommunityGames;
app.communityGames = community;
const Cloud = window.StudBudCloud.constructor;
const normal = value => clone(value);

async function run() {
    for (const box of community.constructor.boxes) {
        const pool = community.boxPool(box);
        assert.ok(pool.length > 0, `${box.id} has rewards`);
        for (const item of pool) {
            assert.ok(box.chances[item.rarity] > 0, `${box.id} cannot award ${item.rarity}`);
            if (box.id === 'accessory') assert.ok(['accessory', 'effect'].includes(item.type));
            else if (['hat', 'effect', 'palette', 'skin'].includes(box.id)) assert.equal(item.type, box.id);
        }
        assert.ok(Math.abs(Object.values(community.boxChances(box)).reduce((sum, percent) => sum + percent, 0) - 100) < .21);
        assert.equal(community.boxPool(box, pool.map(item => item.id)).length, 0);
        assert.equal(Object.keys(community.boxChances(box, pool.map(item => item.id))).length, 0);
    }
    const basic = community.constructor.boxes.find(box => box.id === 'basic');
    const nonPremium = community.catalog.filter(item => !['legendary', 'mythic'].includes(item.rarity)).map(item => item.id);
    assert.equal(community.boxPool(basic, nonPremium).length, 0, 'Study Box never falls back to premium rewards');
    const rare = community.boxPool(basic).find(item => item.rarity === 'rare');
    const remainingOwned = community.boxPool(basic).filter(item => item.id !== rare.id).map(item => item.id);
    assert.deepEqual(normal(community.boxChances(basic, remainingOwned)), { rare: 100 });
    elements.set('multiplayer-shop-coins', {});
    elements.set('multiplayer-shop-items', {});
    app.escapeHTML = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
    app.multiplayerAvatarMarkup = () => '';
    app.shopTab = 'boxes';
    app.multiplayerProfile = { coins: 99999, owned_items: community.catalog.map(item => item.id), equipped: {} };
    app.renderMultiplayerShop(app.multiplayerProfile);
    assert.ok(elements.get('multiplayer-shop-items').innerHTML.includes('Collection complete'));
    assert.ok(!elements.get('multiplayer-shop-items').innerHTML.includes('data-action="multiplayer-buy"'));
    const sql = source('supabase-setup.sql');
    assert.ok(sql.includes("s.rarity = v_rarity") && sql.includes("jsonb_each_text(v_chances)"));
    assert.ok(!sql.includes('abs(rank - target)'));
    assert.doesNotMatch(sql, /v_today_seconds\s*<\s*900|v_today_seconds\s*>=\s*900/, 'daily SQL goal is not fifteen minutes');
    assert.match(sql, /'daily_goal_seconds', 300/, 'daily SQL goal is five minutes');

    const originalClient = community.getClient;
    const completeProfile = { user_id: 'complete', coins: 0, owned_items: [] };
    community.getClient = () => ({ rpc: async () => ({ data: { ...completeProfile, collection_complete: true, completed_box: 'basic' } }) });
    assert.equal((await community.buyMysteryItem()).collection_complete, true);
    community.getClient = () => ({ rpc: async name => name === 'studbud_get_multiplayer_profile'
        ? { data: completeProfile } : { error: { message: 'You already own every item that box can contain!' } } });
    assert.equal((await community.buyMysteryItem()).coins, 0, 'old servers refresh the authoritative profile on completion');
    community.getClient = () => ({ rpc: async () => ({ error: { message: 'Insufficient funds' } }) });
    await assert.rejects(community.buyMysteryItem(), /Insufficient funds/);
    community.getClient = () => ({ rpc: async name => ({ error: { message: name === 'studbud_get_multiplayer_profile' ? 'Profile unavailable' : 'You already own every item that box can contain!' } }) });
    await assert.rejects(community.buyMysteryItem(), /Profile unavailable/);
    community.getClient = originalClient;

    for (const value of [1, 20, 500]) assert.equal(app.questionRewardValue(value), value);
    for (const value of [0, 501, 1.5, '', 'invalid']) assert.throws(() => app.questionRewardValue(value), /1.*500/);
    assert.match(sql, /v_reward not between 1 and 500/);

    const setupIds = ['multiplayer-preview-title', 'multiplayer-preview-description', 'host-game-resource-label', 'solo-game-resource-label'];
    for (const id of setupIds) elements.set(id, {});
    for (const [mode, resource, multiplier] of [
        ['sports', 'Energy', 1], ['miner', 'Fuel', 1], ['shooter', 'Ammo', 1],
        ['river', 'Bait', 1], ['frenzy', 'Bait', 1], ['fishing', 'Bait', 1],
        ['crypto', 'Research cash', 8], ['hack', 'Crypto', 3]
    ]) {
        assert.deepEqual(normal(app.questionRewardInfo(mode)), { resource, multiplier });
        app.updateMultiplayerModeSetup(mode);
        const label = elements.get('host-game-resource-label').textContent;
        assert.ok(label.startsWith(`${resource} per correct answer`));
        if (multiplier > 1) assert.ok(label.includes(`${multiplier}x setting`), 'cash/crypto bonuses explain their setting multiplier');
        assert.equal(elements.get('solo-game-resource-label').textContent, label, 'host and solo setup agree on question rewards');
    }
    for (const id of setupIds) elements.delete(id);

    const now = Date.now();
    const cards = Array.from({ length: 4 }, (_, i) => ({ id: `card${i}`, question: `Q${i}`, answer: `A${i}` }));
    const newSession = new window.AnkiStudySession(cards, { now });
    assert.deepEqual(normal(newSession.newCards.map(entry => entry.card.id)), ['card1', 'card2', 'card3', 'card0']);
    const reviews = cards.map(card => ({ ...card, state: 'review', nextReviewDate: new Date(now - 86400000).toISOString(), interval: 4 }));
    reviews.push({ id: 'future', state: 'review', nextReviewDate: new Date(now + 86400000).toISOString(), interval: 4 });
    const reviewSession = new window.AnkiStudySession(reviews, { now });
    assert.deepEqual(normal(reviewSession.reviews.map(entry => entry.card.id)), ['card1', 'card2', 'card3', 'card0']);
    assert.ok(!reviewSession.includeAll);
    const good = window.SM2Engine.schedule(reviews[0], 'Good', { now });
    const easy = window.SM2Engine.schedule(reviews[1], 'Easy', { now });
    const again = window.SM2Engine.schedule(reviews[2], 'Again', { now });
    assert.ok(good.dueAt > now && easy.fields.interval > good.fields.interval);
    assert.equal(again.fields.state, 'relearning');
    assert.ok(again.dueAt < good.dueAt);
    assert.equal(app.deckStudyCount({ cards: [reviews.at(-1)] }), 0, 'future reviews are visibly unavailable in the deck UI');
    assert.equal(app.deckStudyCount({ cards: [{ ...cards[0], suspended: true }] }), 0);
    assert.equal(app.deckStudyCount({ cards: cards.slice(0, 2) }), 2);
    const limitDeck = { cards: cards.slice(0, 2), ankiToday: { day: window.SM2Engine.dayNumber(now), newDone: 20, reviewsDone: 200 } };
    assert.equal(app.deckStudyCount(limitDeck), 0, 'deck status respects the same daily limits as the study session');

    const base = { version: 1, state: { courses: [{ id: 'math', grade: 80 }], assignments: [], gameMetrics: { xp: 400, level: 1, streakDays: 1 }, settings: { theme: 'dark' } }, flashcards: [], studyHistory: [] };
    const local = clone(base);
    local.state.courses[0].grade = 90;
    local.state.assignments.push({ id: 'homework', status: 'pending' });
    local.state.gameMetrics.xp += 50;
    const remote = clone(base);
    remote.flashcards.push({ id: 'deck', cards: [{ id: 'one', answer: 'yes' }] });
    remote.state.gameMetrics.xp += 75;
    const merged = Cloud.mergeData(base, local, remote);
    assert.equal(merged.state.courses[0].grade, 90);
    assert.equal(merged.flashcards[0].id, 'deck');
    assert.equal(merged.state.gameMetrics.xp, 525);
    assert.equal(merged.state.gameMetrics.level, 2);
    const equalXpLocal = clone(local);
    const equalXpRemote = clone(remote);
    equalXpLocal.studyHistory = [{ id: 'localStudy', durationSec: 300 }];
    equalXpRemote.studyHistory = [{ id: 'remoteStudy', durationSec: 300 }];
    equalXpRemote.state.gameMetrics.xp = equalXpLocal.state.gameMetrics.xp;
    assert.equal(Cloud.mergeData(base, equalXpLocal, equalXpRemote).state.gameMetrics.xp, 500, 'equal XP increments from distinct sessions both count');
    equalXpRemote.studyHistory = clone(equalXpLocal.studyHistory);
    assert.equal(Cloud.mergeData(base, equalXpLocal, equalXpRemote).state.gameMetrics.xp, 450, 'a shared session never awards XP twice');
    const conflict = clone(remote);
    conflict.state.courses[0].grade = 95;
    assert.throws(() => Cloud.mergeData(base, local, conflict), /both devices/i);
    const removed = clone(base);
    removed.state.courses = [];
    assert.equal(Cloud.mergeData(base, removed, remote).state.courses.length, 0);
    assert.throws(() => Cloud.mergeData(base, removed, conflict), /both devices/i);

    const cloud = window.StudBudCloud;
    cloud.accountReady = true;
    cloud.user = { id: 'owner' };
    cloud.lastSnapshot = clone(base);
    cloud.statusEl = null;
    let row = { data: remote, updated_at: new Date(now).toISOString() };
    let race = true;
    let updates = 0;
    let restored;
    window.NexusApp = { AppState: { exportAppState: async () => JSON.stringify(local), setSaveStatus() {} }, restoreCloudSnapshot: async data => { restored = clone(data); } };
    cloud.client = { from: () => {
        const query = {
            select() { return this; }, eq() { return this; }, update(data) { this.payload = data; return this; },
            maybeSingle: async () => ({ data: clone(row), error: null }),
            then(resolve, reject) {
                try {
                    updates++;
                    if (race) {
                        race = false;
                        row.data.state.courses.push({ id: 'science', grade: 88 });
                        row.updated_at = new Date(Date.parse(row.updated_at) + 1).toISOString();
                        resolve({ data: [], error: null });
                    } else {
                        assert.ok(Date.parse(this.payload.updated_at) > Date.parse(row.updated_at), 'CAS version advances even within one millisecond');
                        row = clone(this.payload);
                        resolve({ data: [{ updated_at: row.updated_at }], error: null });
                    }
                } catch (error) { reject(error); }
            }
        };
        return query;
    } };
    await cloud.syncNow();
    assert.equal(updates, 2, 'concurrent cloud write triggers a re-read and merge');
    assert.equal(row.data.state.courses.find(course => course.id === 'science').grade, 88);
    assert.equal(row.data.state.courses[0].grade, 90);
    assert.equal(restored.flashcards[0].id, 'deck');
    assert.equal(cloud.lastSnapshot.state.gameMetrics.xp, 525);
    assert.deepEqual(JSON.parse(storage.get('STUDBUD_CLOUD_SYNC_BASE')), row.data);

    const offline = clone(row.data);
    offline.state.assignments[0].status = 'complete';
    const anotherDevice = clone(row.data);
    anotherDevice.state.courses.find(course => course.id === 'science').grade = 94;
    storage.set('STUDBUD_CLOUD_ACCOUNT_ID', 'owner');
    let queued = 0;
    let recovered = 0;
    cloud.appStarted = true;
    cloud.setAuthStatus = () => {};
    cloud.bindStateEvents = () => {};
    cloud.queueSync = () => { queued++; };
    cloud.client = { from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { data: anotherDevice }, error: null }) }) };
    window.NexusApp.AppState.exportAppState = async () => JSON.stringify(offline);
    window.NexusApp.recoverOwnedCommunityDecks = async () => { recovered++; };
    await cloud.loadAccount({ id: 'owner', email: 'fixture' }, cloud.accountVersion);
    assert.equal(restored.state.assignments[0].status, 'complete', 'reload preserves unsynced offline assignment edits');
    assert.equal(restored.state.courses.find(course => course.id === 'science').grade, 94);
    assert.equal(queued, 1);
    assert.equal(recovered, 1);
    anotherDevice.state.courses[0].grade = 1;
    assert.equal(cloud.lastSnapshot.state.courses[0].grade, 90, 'cloud baseline is not aliased to an imported snapshot');
    const signOutSteps = [];
    window.confirm = () => true;
    cloud.client.auth = { signOut: async () => { signOutSteps.push('signout'); return {}; } };
    cloud.handleSignedOut = async () => { signOutSteps.push('clear'); };
    cloud.syncNow = async () => { signOutSteps.push('save'); };
    await cloud.signOut();
    assert.deepEqual(signOutSteps, ['save', 'signout', 'clear']);
    cloud.syncNow = async () => { throw new Error('offline'); };
    cloud.friendlyAuthError = error => error.message;
    const originalConsole = sandbox.console;
    sandbox.console = { ...console, error() {} };
    try { await cloud.signOut(); } finally { sandbox.console = originalConsole; }
    assert.deepEqual(signOutSteps, ['save', 'signout', 'clear'], 'failed save never signs out or clears local data');

    state.state.courses = [{ id: 'course', grade: 91 }];
    state.state.assignments = [{ id: 'assignment', courseId: 'course', status: 'pending' }];
    state.state.gradeScenarios = [{ id: 'scenario', name: 'Final', courses: [] }];
    state.state.selectedGradeScenarioId = 'scenario';
    state.state.schedule = { all: { Monday: [{ courseId: 'course', time: '09:00' }] }, odd: {}, even: {} };
    state.state.settings.gameAudio = { volume: .25, musicVolume: .1, enabled: false, musicEnabled: false };
    await state.saveFlashcardDeck({ id: 'owned', title: 'Owned deck', cards: [{ id: 'progress', review: { interval: 10 } }] });
    await state.recordStudySession({ id: 'study', durationSec: 30, accuracy: .75, gameSummary: { questions: [{ prompt: 'Q', correct: false }] } });
    const backup = await state.exportAppState();
    state.state.courses = [];
    assert.equal(await state.importAppState(backup), true);
    assert.equal(state.state.courses[0].grade, 91);
    assert.equal(state.state.assignments[0].id, 'assignment');
    assert.equal(state.state.selectedGradeScenarioId, 'scenario');
    assert.equal(state.state.schedule.all.Monday[0].time, '09:00');
    assert.equal(state.state.settings.gameAudio.volume, .25);
    assert.equal(state.state.flashcards[0].cards[0].review.interval, 10);
    assert.equal(state.state.studyHistory[0].gameSummary.questions[0].correct, false);
    const match = { testing: false, mode: 'sports', t: 45, score: 5, answered: 2, correct: 1, game: { title: 'Soccer' },
        questionHistory: [{ prompt: 'Q', answer: 'A', chosen: 'wrong', correct: false }], standingsCache: [{ id: 'owner', n: 'Demo', s: 5, g: 1 }] };
    await app.saveGameSummary(match);
    const savedMatch = state.state.studyHistory.find(session => session.source === 'multiplayer');
    assert.equal(savedMatch.gameSummary.questions[0].chosen, 'wrong');
    assert.equal(savedMatch.gameSummary.standings[0].goal, 1);
    await app.saveGameSummary({ ...match, testing: true });
    assert.equal(state.state.studyHistory.length, 2, 'admin tests never save study/game summaries');

    const storedHistory = state.state.studyHistory;
    state.state.studyHistory = Array.from({ length: 4 }, (_, i) => ({
        id: `short-session-${i}`, timestamp: new Date().toISOString(), durationSec: 20,
        title: 'Short match', method: 'game', gameSummary: savedMatch.gameSummary
    }));
    for (const id of ['study-progress-summary', 'study-week-summary', 'study-history-list']) elements.set(id, {});
    app.getStudyRecommendations = () => [];
    let renderedQuestions;
    window.StudBudArcade = { util: { questionHistoryMarkup(questions) { renderedQuestions = questions; return '<ol>Question history</ol>'; } } };
    app.renderStudyProgress();
    assert.match(elements.get('study-week-summary').textContent, /1 min logged/, 'short sessions are summed before rounding minutes');
    const historyMarkup = elements.get('study-history-list').innerHTML;
    assert.match(historyMarkup, /Not rated/, 'unrated sessions are not presented as zero effectiveness');
    assert.match(historyMarkup, /50% correct · 2 answered/, 'saved match counts describe answered questions, not the correct-answer fraction');
    assert.match(historyMarkup, /saved-game-summary/);
    assert.equal(renderedQuestions, savedMatch.gameSummary.questions, 'saved summaries reuse the shared question history renderer');
    state.state.studyHistory = storedHistory;
    delete app.getStudyRecommendations;
    delete window.StudBudArcade;
    for (const id of ['study-progress-summary', 'study-week-summary', 'study-history-list']) elements.delete(id);

    community.ownedDecks = async () => [{ id: 'published', source_deck_id: 'source', title: 'From another device', course: null, cards: [{ question: 'Q', answer: 'A' }] }];
    app.renderDecks = () => {};
    await app.recoverOwnedCommunityDecks();
    await app.recoverOwnedCommunityDecks();
    assert.equal(state.state.flashcards.filter(deck => deck.id === 'source').length, 1);
    assert.equal(state.state.flashcards.find(deck => deck.id === 'owned').cards[0].review.interval, 10);
    app.updateGameAudio({ volume: .6, enabled: true });
    assert.equal(state.state.settings.gameAudio.volume, .6);
    assert.equal(JSON.parse(storage.get(state.STORAGE_KEY)).assignments[0].id, 'assignment');
    console.log('Box eligibility/exhaustion, shuffled due-only Anki scheduling, conflict-safe cloud retries, owned decks, grades/assignments/schedules and audio persistence passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });

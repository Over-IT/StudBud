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
const window = { addEventListener() {}, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto };
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
for (const file of ['communityGames.js', 'cloudSync.js', 'flashcardEngine.js', 'parkwayData.js', 'data/schools/central.js', 'data/schools/north.js', 'data/schools/south.js', 'data/schools/west.js']) vm.runInContext(source(file), context, { filename: file });
const appSource = source('app.js');
vm.runInContext(appSource.slice(appSource.indexOf('    const ACTIVITY_RESET_ID'), appSource.indexOf('    const AppState =')), context);
vm.runInContext('globalThis.AppState = new AppStateEngine();', context);
vm.runInContext(appSource.slice(appSource.indexOf('    class AppOrchestrator'), appSource.indexOf('    window.NexusApp =')), context);
const app = vm.runInContext('Object.create(AppOrchestrator.prototype)', context);
app.animateShopAuras = () => {};
const state = sandbox.AppState;
window.NexusApp = { AppState: state };
const community = window.StudBudCommunityGames;
app.communityGames = community;
const Cloud = window.StudBudCloud.constructor;
const normal = value => clone(value);

async function run() {
    assert.equal(state.state.settings.colorScheme, 'studbud', 'new accounts start with the StudBud palette');
    window.StudBudCloud.user = { user_metadata: { username: 'student' } };
    state.state.profile.firstName = 'Ada';
    state.state.profile.lastName = 'Lovelace';
    assert.equal(app.multiplayerDisplayName(), 'Ada Lovelace', 'in-app multiplayer names use the saved real name');
    state.state.profile.lastName = '';
    assert.equal(app.multiplayerDisplayName(), 'Ada', 'either saved name can be used without falling back to the username');
    const accountTagMarkup = app.accountTagMarkup;
    const applyAppearance = app.applyAppearance;
    app.accountTagMarkup = username => `<span data-account="${app.escapeHTML(username)}"></span>`;
    app.applyAppearance = () => {};
    elements.set('account-name', {});
    elements.set('multiplayer-header-name', {});
    app.renderProfile();
    assert.equal(elements.get('multiplayer-header-name').textContent, 'Ada');
    assert.equal(elements.get('account-name').innerHTML, 'Ada <span data-account="student"></span>',
        'account display uses the real name but tags still identify the username');
    state.state.profile.firstName = '<Ada>';
    app.renderProfile();
    assert.ok(elements.get('account-name').innerHTML.startsWith('&lt;Ada&gt; '), 'account real names are escaped');
    state.state.profile.firstName = '';
    app.renderProfile();
    assert.ok(elements.get('account-name').innerHTML.startsWith('student '), 'missing real names fall back to the username');
    state.state.profile.firstName = 'Ada';
    app.accountTagMarkup = accountTagMarkup;
    app.applyAppearance = applyAppearance;
    elements.delete('account-name');
    elements.delete('multiplayer-header-name');
    delete window.StudBudCloud.user;

    for (const [id, value] of [
        ['public-bio', { value: '' }], ['public-subject', { value: '' }], ['public-grade', { value: '' }],
        ['public-goal', { value: '' }], ['settings-first-name', { value: 'Ada' }], ['settings-last-name', { value: 'Lovelace' }],
        ['public-show-real-name', { checked: true }], ['public-show-school', { checked: false }], ['public-show-stats', { checked: false }],
        ['public-profile-status', { textContent: '' }]
    ]) elements.set(id, value);
    let publicProfileArgs;
    const friendCall = community.friendCall;
    community.friendCall = async (name, args) => { publicProfileArgs = { name, args }; };
    await app.savePublicProfile();
    assert.equal(publicProfileArgs.name, 'studbud_set_public_profile');
    assert.equal(publicProfileArgs.args.p_first_name, 'Ada');
    assert.equal(publicProfileArgs.args.p_last_name, 'Lovelace');
    assert.equal(publicProfileArgs.args.p_show_real_name, true);
    assert.equal(publicProfileArgs.args.p_show_school, false);
    community.friendCall = friendCall;
    for (const id of ['public-bio', 'public-subject', 'public-grade', 'public-goal', 'settings-first-name', 'settings-last-name', 'public-show-real-name', 'public-show-school', 'public-show-stats', 'public-profile-status']) elements.delete(id);

    state.state.profile.school = 'other';
    state.state.profile.gradeScale = clone(window.STUDBUD_OTHER_GRADE_SCALE);
    state.state.profile.gradeScale.find(grade => grade.letter === 'A').minPct = 95;
    state.state.profile.gradeScale.find(grade => grade.letter === 'A-').minPct = 92;
    assert.equal(app.gradeForPercentage(94), 'A-', 'Other-school grade calculations use the account-specific grading scale');
    const courseFields = {
        'settings-school': { value: 'other' }, 'course-id': { value: '' }, 'course-name': { value: '' },
        'course-term': { value: 'S1' }, 'course-manual-title': { value: 'Biology II' }, 'course-manual-code': { value: 'BIO-202' },
        'course-credits': { value: '1' }, 'course-manual-weighted': { checked: true },
        'course-subject-category': { value: 'Science' }, 'course-target-grade': { value: '' }
    };
    for (const [id, element] of Object.entries(courseFields)) elements.set(id, element);
    await app.saveCourse();
    assert.deepEqual(normal(state.state.courses.at(-1)), {
        code: 'BIO-202', school: 'other', catalogCode: '', title: 'Biology II', term: 'S1', credits: 1,
        category: 'Science', isWeighted: true, targetPct: null
    }, 'Other-school classes save entered name, code, credits, subject and weighted status');
    for (const id of Object.keys(courseFields)) elements.delete(id);
    const gradeFields = state.state.profile.gradeScale.flatMap((grade, index) =>
        ['minPct', 'unweighted', 'weighted'].map(field => ({
            dataset: { gradeScale: String(index), gradeField: field },
            value: String(grade[field])
        }))
    );
    sandbox.document.querySelectorAll = () => gradeFields;
    elements.set('school-profile-status', { textContent: '' });
    const renderScale = app.renderOtherGradeScaleEditor;
    const renderUI = app.renderUI;
    app.renderOtherGradeScaleEditor = () => {};
    app.renderUI = () => {};
    await app.saveOtherGradeScale();
    assert.equal(state.state.profile.gradeScale.find(grade => grade.letter === 'A').minPct, 95,
        'custom grade cutoffs can be saved');
    gradeFields[0].value = '';
    await assert.rejects(app.saveOtherGradeScale(), /Check the percentage/,
        'blank grading-scale values are rejected rather than treated as zero');
    app.renderOtherGradeScaleEditor = renderScale;
    app.renderUI = renderUI;
    elements.delete('school-profile-status');
    sandbox.document.querySelectorAll = undefined;
    for (const [id, element] of Object.entries({
        'settings-school': { value: 'other' }, 'settings-target-gpa': { value: '3.8' },
        'settings-grad-year': { value: '2028' }, 'settings-first-name': { value: 'Ada' },
        'settings-last-name': { value: 'Lovelace' }, 'settings-current-term': { value: 'S1' },
        'school-profile-status': { textContent: '' }
    })) elements.set(id, element);
    const appMethods = ['updateCourseSchoolFields', 'renderOtherGradeScaleEditor', 'updatePublicSchoolOption', 'renderUI'];
    const originalMethods = Object.fromEntries(appMethods.map(method => [method, app[method]]));
    appMethods.forEach(method => { app[method] = () => {}; });
    window.alert = () => {};
    let schoolArgs;
    community.friendCall = async (name, args) => { schoolArgs = { name, args }; };
    const hasAccount = community.hasAccount;
    community.hasAccount = () => true;
    await app.saveProfile();
    community.hasAccount = hasAccount;
    assert.deepEqual(normal(schoolArgs), { name: 'studbud_set_school', args: { p_school: 'other' } },
        'saving account settings persists the selected school to the account');
    assert.equal(state.state.profile.school, 'other');
    community.friendCall = friendCall;
    appMethods.forEach(method => { app[method] = originalMethods[method]; });
    for (const id of ['settings-school', 'settings-target-gpa', 'settings-grad-year', 'settings-first-name', 'settings-last-name', 'settings-current-term', 'school-profile-status']) elements.delete(id);

    elements.set('practice-multiplayer-mode', { value: 'river' });
    elements.set('practice-multiplayer-deck', { value: 'deck-1' });
    elements.set('practice-multiplayer-time', { value: '600' });
    let practiceLaunch;
    const originalStartPractice = app.startPractice;
    app.startPractice = (mode, config) => { practiceLaunch = { mode, config }; };
    app.startMultiplayerPractice();
    assert.deepEqual(normal(practiceLaunch), { mode: 'river', config: { deckId: 'deck-1', timeLimitSeconds: 600 } },
        'practice setup launches the selected multiplayer mode locally with its chosen deck and duration');
    app.startPractice = originalStartPractice;
    elements.set('grade-scenario-assignment-form', { elements: { pointsEarned: { value: '45' }, maxPoints: { value: '60' } } });
    elements.set('grade-scenario-score-preview', { textContent: '' });
    app.updateScenarioScorePreview();
    assert.equal(elements.get('grade-scenario-score-preview').textContent, '75.0% score',
        'hypothetical assignment entry shows the resulting percentage');
    for (const id of ['practice-multiplayer-mode', 'practice-multiplayer-deck', 'practice-multiplayer-time', 'grade-scenario-assignment-form', 'grade-scenario-score-preview']) elements.delete(id);

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
    assert.match(sql, /show_real_name boolean not null default false/);
    assert.match(sql, /'display_name', case when coalesce\(v_pub\.show_real_name, false\)/,
        'public profile APIs disclose real names only after explicit opt-in');
    assert.match(sql, /studbud_set_public_profile\([\s\S]*?p_first_name text,[\s\S]*?p_last_name text,[\s\S]*?p_show_real_name boolean/);
    assert.match(sql, /grant execute on function public\.studbud_set_public_profile\(text, text, text, text, text, text, boolean, boolean, boolean\) to authenticated;/);
    assert.match(sql, /tag text not null check \(tag in \('teacher', 'tester', 'moderator'\)\)/);
    assert.match(sql, /revoke all on function public\.studbud_has_user_tag\(uuid, text\) from public, anon, authenticated/);
    assert.match(sql, /profile\.user_id = p_user_id and profile\.school in \('pchs', 'pnhs', 'pshs', 'pwhs'\) and profile\.show_school/);
    assert.match(sql, /'school', case when coalesce\(v_pub\.show_school, false\) and v_pub\.school in \('pchs', 'pnhs', 'pshs', 'pwhs'\) then v_pub\.school end/,
        'public profile payloads include a Parkway school tag only when opted in and never expose Other schools');
    assert.match(sql, /add constraint studbud_public_profiles_school_check check \(school in \('pchs', 'pnhs', 'pshs', 'pwhs', 'other'\)\)/);
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

    for (const value of [5, 20, 100]) assert.equal(app.questionRewardValue(value), value);
    for (const value of [0, 1, 7, 101, 500, 1.5, '', 'invalid']) assert.throws(() => app.questionRewardValue(value), /5 to 100.*increments of 5/);
    assert.match(sql, /v_reward not between 5 and 100 or v_reward % 5 <> 0/);

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
    for (const prefix of ['host', 'solo']) {
        elements.set(`${prefix}-game-reward`, { value: '20', dataset: { custom: '1' } });
        elements.set(`${prefix}-game-reward-guidance`, {});
    }
    for (const [mode, min, max] of [
        ['skyline', 30, 50], ['duel', 25, 45], ['miner', 30, 45], ['river', 20, 40],
        ['frenzy', 15, 30], ['fishing', 15, 30], ['market', 40, 60], ['sports', 50, 70],
        ['shooter', 30, 50], ['crypto', 15, 30], ['hack', 10, 25]
    ]) {
        const recommendation = app.questionRewardRecommendation(mode);
        assert.equal(recommendation.min, min);
        assert.equal(recommendation.max, max);
        assert.ok(recommendation.suggested >= min && recommendation.suggested <= max);
        assert.equal(recommendation.suggested % 5, 0);
        assert.ok(recommendation.explanation.length);
        for (const [amount, expected] of [[Math.max(5, min - 5), 'Below recommended'], [min, 'Within'], [max, 'Within'], [Math.min(100, max + 5), 'Above recommended'], ['', 'increments of 5']]) {
            for (const prefix of ['host', 'solo']) elements.get(`${prefix}-game-reward`).value = String(amount);
            app.updateQuestionRewardGuidance(mode);
            const host = elements.get('host-game-reward-guidance').textContent;
            assert.ok(host.includes(`Recommended setting: ${min}-${max}`));
            assert.ok(host.includes(expected), `${mode} guidance at ${amount}`);
            assert.equal(host, elements.get('solo-game-reward-guidance').textContent, 'host and solo recommendations agree');
            assert.equal(elements.get('host-game-reward').value, String(amount), 'advice never overrides a player-chosen setting');
        }
        for (const prefix of ['host', 'solo']) elements.get(`${prefix}-game-reward`).dataset = {};
        app.updateQuestionRewardGuidance(mode);
        assert.equal(Number(elements.get('host-game-reward').value), recommendation.suggested, 'untouched amount defaults to the recommendation');
        for (const prefix of ['host', 'solo']) elements.get(`${prefix}-game-reward`).dataset = { custom: '1' };
    }
    for (const prefix of ['host', 'solo']) {
        elements.delete(`${prefix}-game-reward`);
        elements.delete(`${prefix}-game-reward-guidance`);
    }

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
    const matchBase = clone(base);
    matchBase.studyHistory = [{ id: 'match_1', durationSec: 60, leaderboardSyncPending: true }];
    const matchLocal = clone(matchBase);
    matchLocal.studyHistory[0].leaderboardSyncPending = false;
    matchLocal.studyHistory[0].leaderboardSyncedAt = new Date().toISOString();
    const matchRemote = clone(matchBase);
    matchRemote.studyHistory = [];
    const mergedStudy = Cloud.mergeData(matchBase, matchLocal, matchRemote);
    assert.equal(mergedStudy.studyHistory.length, 1, 'study history preserves sessions missing on other device');
    assert.equal(mergedStudy.studyHistory[0].leaderboardSyncPending, false, 'study history preserves synced state');
    const conflict = clone(remote);
    conflict.state.courses[0].grade = 95;
    assert.throws(() => Cloud.mergeData(base, local, conflict), /both devices/i);
    const removed = clone(base);
    removed.state.courses = [];
    assert.equal(Cloud.mergeData(base, removed, remote).state.courses.length, 0);
    assert.throws(() => Cloud.mergeData(base, removed, conflict), /both devices/i);
    const staleDevice = clone(local);
    const resetCloud = clone(remote);
    resetCloud.state.gameMetrics = { level: 1, xp: 0, streakDays: 0, lastStudyDate: null, resetId: 'beta-end-2026-10-15' };
    const afterReset = Cloud.mergeData(base, staleDevice, resetCloud);
    assert.equal(afterReset.state.gameMetrics.xp, 0, 'beta XP from an old device never merges back after the reset');
    assert.equal(afterReset.state.gameMetrics.resetId, 'beta-end-2026-10-15');
    const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    assert.match(appSource, /ACTIVITY_RESET_AT = Date\.parse\('2026-10-15T05:00:00Z'\)/);
    assert.match(appSource, /this\.state\.studyHistory = studyHistory\.filter\(isCurrentStudySession\)/, 'old study sessions are dropped on load');
    const resetSql = fs.readFileSync(path.join(root, 'beta-reset.sql'), 'utf8');
    for (const part of ['delete from public.studbud_study_time_entries', 'coins = 100', "owned_items = array['avatar_default', 'palette_default']", 'on conflict do nothing']) {
        assert.ok(resetSql.includes(part), `beta reset covers: ${part}`);
    }
    assert.match(fs.readFileSync(path.join(root, 'supabase-setup.sql'), 'utf8'), /p_study_date < date '2026-10-15'/, 'beta-dated study time is ignored by the server');

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

    const targetCloud = new Cloud();
    const previousSyncBase = storage.get('STUDBUD_CLOUD_SYNC_BASE');
    const targetBase = JSON.parse(await state.exportAppState());
    targetBase.state.profile.targetGpa = 4;
    targetBase.state.courses = [{ code: 'math', title: 'Math', credits: 1, targetPct: null }];
    let targetRow = { data: clone(targetBase), updated_at: new Date(now).toISOString() };
    targetRow.data.state.settings.theme = 'light';
    targetCloud.accountReady = true;
    targetCloud.user = { id: 'target-owner' };
    targetCloud.lastSnapshot = clone(targetBase);
    const previousNexusApp = window.NexusApp;
    window.NexusApp = {
        AppState: state,
        restoreCloudSnapshot: snapshot => state.importAppState(snapshot)
    };
    targetCloud.client = { from: () => ({
        select() { return this; }, eq() { return this; },
        update(payload) { this.payload = payload; return this; },
        maybeSingle: async () => ({ data: clone(targetRow), error: null }),
        then(resolve) {
            targetRow = clone(this.payload);
            resolve({ data: [{ user_id: 'target-owner' }], error: null });
        }
    }) };
    await state.importAppState(clone(targetBase));
    await targetCloud.syncNow();
    assert.equal(state.state.settings.theme, 'light', 'cloud changes trigger a snapshot restore');
    sandbox.Router = { selectedClassCode: 'math' };
    const renderClassDetail = app.renderClassDetail;
    app.renderClassDetail = () => {};
    elements.set('class-target-percent', { value: '90' });
    await app.handleDataAction('save-class-target');
    assert.equal(state.state.courses[0].targetPct, 90, 'Save target initially stores the entered percentage');
    assert.equal(targetCloud.lastSnapshot.state.courses[0].targetPct, null,
        'editing an imported course must not mutate the cloud merge baseline');
    await targetCloud.syncNow();
    assert.equal(state.state.courses[0].targetPct, 90, 'cloud sync does not erase the saved class target');
    assert.equal(targetRow.data.state.courses[0].targetPct, 90, 'the exact target is saved in the cloud');
    assert.equal(JSON.parse(storage.get(state.STORAGE_KEY)).courses[0].targetPct, 90,
        'the exact target remains saved on the device');
    await state.importAppState(clone(targetRow.data));
    assert.equal(state.state.courses[0].targetPct, 90, 'restoring the saved cloud data preserves the target');
    elements.get('class-target-percent').value = '';
    await app.handleDataAction('save-class-target');
    await targetCloud.syncNow();
    assert.equal(targetRow.data.state.courses[0].targetPct, null, 'explicitly clearing the target still syncs');
    app.renderClassDetail = renderClassDetail;
    elements.delete('class-target-percent');
    delete sandbox.Router;
    window.NexusApp = previousNexusApp;
    storage.set('STUDBUD_CLOUD_SYNC_BASE', previousSyncBase);

    for (const phase of ['export', 'read', 'write', 'account-change']) {
        const syncing = new Cloud();
        syncing.accountReady = true;
        syncing.user = { id: 'race-owner' };
        syncing.lastSnapshot = clone(targetBase);
        let live = clone(targetBase);
        live.state.courses[0].targetPct = 90;
        let raceRow = { data: clone(targetBase), updated_at: new Date(now).toISOString() };
        raceRow.data.state.settings.theme = 'light';
        let changed = false;
        const writes = [];
        const change = when => {
            if (changed || phase !== when) return;
            changed = true;
            if (phase === 'account-change') {
                syncing.accountVersion++;
                syncing.user = { id: 'new-owner' };
                storage.set('STUDBUD_CLOUD_SYNC_BASE', 'new-account-baseline');
            } else {
                live.state.courses[0].targetPct = 92;
                live.state.assignments.push({ id: 'new-assignment', title: 'New work' });
                syncing.syncRevision++;
            }
        };
        window.NexusApp = {
            AppState: {
                exportAppState: async () => {
                    const result = JSON.stringify(live);
                    change('export');
                    return result;
                },
                setSaveStatus() {}
            },
            restoreCloudSnapshot: async snapshot => { live = clone(snapshot); }
        };
        syncing.client = { from: () => ({
            select() { return this; }, eq() { return this; },
            update(payload) { this.payload = payload; return this; },
            maybeSingle: async () => {
                change('read');
                return { data: clone(raceRow), error: null };
            },
            then(resolve) {
                writes.push(clone(this.payload));
                raceRow = clone(this.payload);
                change('write');
                change('account-change');
                resolve({ data: [{ user_id: 'race-owner' }], error: null });
            }
        }) };
        await syncing.syncNow();
        if (phase === 'account-change') {
            assert.equal(storage.get('STUDBUD_CLOUD_SYNC_BASE'), 'new-account-baseline',
                'a late response from the previous account cannot replace the new account baseline');
            assert.equal(live.state.settings.theme, targetBase.state.settings.theme,
                'a late previous-account response cannot restore its cloud data');
        } else {
            assert.equal(live.state.courses[0].targetPct, 92, `${phase}: the newest local target survives`);
            assert.equal(raceRow.data.state.courses[0].targetPct, 92, `${phase}: the newest target reaches the cloud`);
            assert.equal(live.state.assignments[0].id, 'new-assignment', `${phase}: concurrent additions survive`);
            assert.equal(live.state.settings.theme, 'light', `${phase}: unrelated remote changes survive`);
            if (phase !== 'write') assert.equal(writes[0].data.state.courses[0].targetPct, 92,
                `${phase}: a stale export is discarded before writing`);
        }
    }
    window.NexusApp = previousNexusApp;
    storage.set('STUDBUD_CLOUD_SYNC_BASE', previousSyncBase);

    const conflictCloud = new Cloud();
    const conflictLocal = clone(targetBase);
    conflictLocal.state.courses[0].targetPct = 90;
    const conflictRemote = clone(targetBase);
    conflictRemote.state.courses[0].targetPct = 80;
    let conflictLive = clone(conflictLocal);
    let conflictRow = { data: clone(conflictRemote), updated_at: new Date(now).toISOString() };
    const conflictHandlers = new Map();
    const conflictElements = new Map();
    for (const id of ['auth-status', 'auth-conflict-cloud-btn', 'auth-conflict-local-btn', 'auth-conflict-backup-btn']) {
        conflictElements.set(id, elements.get(id));
        elements.set(id, {
            classList: { add() {} },
            addEventListener: (event, handler) => conflictHandlers.set(id, handler)
        });
    }
    window.NexusApp = {
        AppState: { exportAppState: async () => JSON.stringify(conflictLive), setSaveStatus() {} },
        restoreCloudSnapshot: async snapshot => { conflictLive = clone(snapshot); },
        recoverOwnedCommunityDecks: async () => {}
    };
    conflictCloud.appStarted = true;
    conflictCloud.setAuthStatus = conflictCloud.bindStateEvents = conflictCloud.queueSync = () => {};
    conflictCloud.reportAccountError = error => { throw error; };
    conflictCloud.client = { from: () => ({
        select() { return this; }, eq() { return this; },
        update(payload) { this.payload = payload; return this; },
        maybeSingle: async () => ({ data: clone(conflictRow), error: null }),
        then(resolve) {
            conflictRow = clone(this.payload);
            resolve({ data: [{ user_id: 'conflict-owner' }], error: null });
        }
    }) };
    conflictCloud.renderConflictResolution({
        user: { id: 'conflict-owner', email: 'fixture' },
        local: conflictLocal,
        remoteSnapshot: conflictRemote
    }, 'Both devices changed a target.');
    await conflictHandlers.get('auth-conflict-local-btn')();
    assert.equal(conflictLive.state.courses[0].targetPct, 90,
        'Keep Device Data does not immediately restore the rejected cloud value');
    assert.equal(conflictRow.data.state.courses[0].targetPct, 90,
        'Keep Device Data uploads the explicitly selected local value');
    for (const [id, previous] of conflictElements) {
        if (previous) elements.set(id, previous);
        else elements.delete(id);
    }
    window.NexusApp = previousNexusApp;
    storage.set('STUDBUD_CLOUD_SYNC_BASE', previousSyncBase);

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

    state.state.courses = [{ id: 'course', code: 'course', grade: 91 }];
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
    const importedSnapshot = JSON.parse(backup);
    const snapshotBeforeEdits = clone(importedSnapshot);
    await state.importAppState(importedSnapshot);
    state.state.profile.targetGpa = 2;
    state.updateCourse('course', { targetPct: 90 });
    state.state.courses[0].grade = 95;
    state.updateAssignment('assignment', { status: 'completed' });
    state.state.gradeScenarios[0].name = 'Edited scenario';
    state.state.schedule.all.Monday[0].time = '10:00';
    state.state.settings.gameAudio.volume = .9;
    state.state.gameMetrics.xp += 100;
    state.state.flashcards[0].cards[0].review.interval = 99;
    state.state.studyHistory[0].gameSummary.questions[0].correct = true;
    assert.deepEqual(importedSnapshot, snapshotBeforeEdits,
        'edits to every restored data collection and nested field leave the input snapshot unchanged');
    await state.importAppState(importedSnapshot);
    importedSnapshot.state.profile.targetGpa = 1;
    importedSnapshot.state.courses.length = 0;
    importedSnapshot.flashcards[0].cards.length = 0;
    importedSnapshot.studyHistory[0].gameSummary.questions[0].correct = true;
    for (const key of Object.keys(snapshotBeforeEdits.state)) {
        assert.deepEqual(normal(state.state[key]), snapshotBeforeEdits.state[key],
            `mutating the source snapshot cannot change restored ${key}`);
    }
    assert.deepEqual(normal(state.state.flashcards), snapshotBeforeEdits.flashcards);
    assert.deepEqual(normal(state.state.studyHistory), snapshotBeforeEdits.studyHistory);
    const getAll = sandbox.NexusDB.getAll;
    let exportChanged = false;
    sandbox.NexusDB.getAll = async table => {
        if (!exportChanged) {
            exportChanged = true;
            state.state.courses[0].grade = 92;
            state.state.settings.gameAudio.volume = .7;
        }
        return getAll(table);
    };
    const inFlightExport = JSON.parse(await state.exportAppState());
    assert.equal(inFlightExport.state.courses[0].grade, 91, 'export captures state before asynchronous storage reads');
    assert.equal(inFlightExport.state.settings.gameAudio.volume, .25, 'export does not mix later nested edits into an older snapshot');
    sandbox.NexusDB.getAll = getAll;
    await state.importAppState(backup);

    const originalRecordStudyTime = community.recordStudyTime;
    const sessionBeforeSync = clone(state.state.studyHistory[0]);
    sessionBeforeSync.leaderboardSyncPending = true;
    community.recordStudyTime = async () => {
        const latest = clone(state.state.studyHistory[0]);
        latest.title = 'Newer study title';
        latest.gameSummary.questions[0].chosen = 'Newer answer';
        state.state.studyHistory[0] = latest;
    };
    window.NexusApp = { AppState: state };
    window.StudBudCloud.user = { id: 'owner' };
    await app.syncStudyTimeEntry(sessionBeforeSync, false);
    assert.equal(state.state.studyHistory[0].title, 'Newer study title', 'late leaderboard acknowledgement preserves newer session fields');
    assert.equal(state.state.studyHistory[0].gameSummary.questions[0].chosen, 'Newer answer');
    assert.equal(state.state.studyHistory[0].leaderboardSyncPending, false);
    assert.equal((await sandbox.NexusDB.getAll('studyHistory'))[0].title, 'Newer study title');
    community.recordStudyTime = originalRecordStudyTime;
    delete window.StudBudCloud.user;
    await state.importAppState(backup);
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
    console.log('Snapshot isolation across all data, stable exports, edits during export/read/write, account-switch guards, Keep Device Data and late study acknowledgements passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });

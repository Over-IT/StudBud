const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const stores = new Map(), storage = new Map();
let failWrite = false, releaseWrite;
const sandbox = {
    console, Date, Math, setTimeout, clearTimeout,
    window: { addEventListener() {}, setTimeout, clearTimeout, setInterval() {}, navigator: { onLine: true } },
    document: { addEventListener() {}, getElementById: () => null },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    EventBus: { emit() {} },
    NexusDB: {
        async put(table, row) {
            if (failWrite) throw new Error('Storage full');
            if (releaseWrite) await new Promise(resolve => { releaseWrite = resolve; });
            if (!stores.has(table)) stores.set(table, new Map());
            stores.get(table).set(row.id, clone(row));
        },
        async delete(table, id) { stores.get(table)?.delete(id); },
        async getAll(table) { return clone([...(stores.get(table)?.values() || [])]); },
        async replaceStores(records) {
            for (const [name, rows] of Object.entries(records)) stores.set(name, new Map(rows.map(row => [row.id, clone(row)])));
        }
    }
};
vm.createContext(sandbox);
for (const name of ['flashcardEngine.js', 'communityGames.js', 'cloudSync.js']) vm.runInContext(read(name), sandbox);
const source = read('app.js');
vm.runInContext(source.slice(source.indexOf('    const ACTIVITY_RESET_ID'), source.indexOf('    const AppState =')), sandbox);
vm.runInContext('globalThis.AppState = new AppStateEngine();', sandbox);
vm.runInContext(source.slice(source.indexOf('    class AppOrchestrator'), source.indexOf('    window.NexusApp =')), sandbox);
const app = vm.runInContext('Object.create(AppOrchestrator.prototype)', sandbox), state = sandbox.AppState;
const { SM2Engine: SM2, FlashcardTools: tools } = sandbox.window;
app.renderStudyCard = () => {};
app.renderUI = app.setCloudChartControls = app.renderGradeProgress = () => {};
app.closeStudy = () => { app.closedStudy = true; app.activeDeckId = null; };
sandbox.window.NexusApp = app;
sandbox.window.StudBudCloud.user = { id: 'owner' };

async function run() {
    const now = new Date(2026, 9, 19, 12).getTime();
    let card = { id: 'one', front: 'hola', back: 'hello' };
    const good = SM2.schedule(card, 4, { now, fuzz: false });
    assert.equal(good.fields.state, 'learning');
    assert.equal(good.fields.step, 1);
    assert.equal(good.dueAt, now + 10 * 60000);
    const hard = SM2.schedule(card, 3, { now, fuzz: false });
    assert.equal(hard.delayMs, 330000);
    const again = SM2.schedule(card, 1, { now, fuzz: false });
    assert.equal(again.dueAt, now + 60000);
    const easy = SM2.schedule(card, 5, { now, fuzz: false });
    assert.equal(easy.fields.state, 'review');
    assert.equal(easy.fields.interval, 4);
    card = { ...card, ...good.fields };
    const graduated = SM2.schedule(card, 4, { now: good.dueAt, fuzz: false });
    assert.equal(graduated.fields.state, 'review');
    assert.equal(graduated.fields.interval, 1);
    card = { ...card, ...graduated.fields };
    assert.equal(SM2.isDue(card, now), false);
    assert.equal(SM2.isDue(card, graduated.dueAt), true);
    const lapse = SM2.schedule(card, 1, { now: graduated.dueAt, fuzz: false });
    assert.equal(lapse.fields.state, 'relearning');
    assert.equal(lapse.fields.lapses, 1);
    assert.equal(lapse.fields.easeFactor, 2.3);
    assert.equal(lapse.delayMs, 600000);
    const relearned = SM2.schedule({ ...card, ...lapse.fields }, 4, { now: lapse.dueAt, fuzz: false });
    assert.equal(relearned.fields.state, 'review');
    assert.equal(relearned.fields.interval, 1);

    const practiced = { id: 'practiced', practiceStats: { attempts: 10, correct: 10 } };
    const session = SM2.createSession([{ id: 'unseen' }, practiced, card], { now, includeAll: true });
    assert.deepEqual(clone(session.counts()), { new: 1, learning: 1, review: 1 });
    assert.equal(SM2.normalize(practiced).state, 'new', 'recognition does not fabricate scheduled reviews');
    assert.equal(tools.cardProgress(practiced).mastery, .5);
    const Priority = sandbox.window.AnkiStudySession;
    assert.ok(Math.abs(Priority.priority({ id: 'unseen' }, now) - .575) < 1e-12, 'unseen priority follows the documented numeric formula');
    const strong = { id: 'strong', state: 'review', interval: 10, lastReviewed: new Date(now).toISOString(),
        nextReviewDate: new Date(now + 10 * 86400000).toISOString() };
    for (let i = 0; i < 4; i++) tools.recordAnswer(strong, true, 'recall');
    const weak = { ...clone(strong), id: 'weak', practiceStats: { attempts: 4, correct: 0, missStreak: 3,
        recentAnswers: [false, false, false, false] } };
    assert.ok(Priority.priority(weak, now) > Priority.priority(strong, now), 'weak evidence outranks strong recall even within the same review state');
    assert.ok(Priority.priority(strong, now + 20 * 86400000) > Priority.priority(strong, now), 'elapsed time raises forgetting pressure');
    const ranked = SM2.createSession([strong, weak], { now, includeAll: true });
    assert.equal(ranked.next(now).id, 'weak', 'numeric evidence, not category or source order, chooses the next card');
    assert.equal(ranked.snapshot(now)[0].id, ranked.next(now).id);
    assert.equal(ranked.next(now).id, ranked.next(now).id, 'selection is deterministic at a fixed time');
    const fresh = Array.from({ length: 12 }, (_, i) => ({ id: `fresh-${i}` }));
    const openers = new Set(Array.from({ length: 40 }, () => SM2.createSession(fresh, { now, includeAll: true }).next(now).id));
    assert.ok(openers.size > 1, 'a fresh deck does not always open on the same card');
    const missed = { id: 'missed', practiceStats: { attempts: 4, correct: 0, missStreak: 3, recentAnswers: [false, false, false, false] } };
    for (let i = 0; i < 20; i++) assert.equal(SM2.createSession([...fresh, missed], { now, includeAll: true }).next(now).id, 'missed',
        'the light shuffle never outranks clearly weaker cards');
    const readyLearning = { id: 'ready', state: 'learning', step: 1, nextReviewDate: new Date(now - 1).toISOString() };
    assert.equal(SM2.createSession([weak, readyLearning], { now, includeAll: true }).next(now).id, 'ready',
        'learning-step timing still takes precedence');
    {
        const options = { now, includeAll: true, learnAheadAll: false, learnAheadMinutes: 0, fuzz: false };
        const spaced = SM2.createSession([{ id: 'first' }, { id: 'second' }], options);
        const first = spaced.next(now);
        spaced.answer(first, 'good', now);
        const second = spaced.next(now);
        assert.notEqual(second.id, first.id, 'Good introduces another card instead of immediately repeating the first');
        spaced.answer(second, 'hard', now);
        assert.equal(spaced.next(now + 1000), null, 'learning delays are honored when only resting cards remain');
        assert.equal(spaced.remaining, 2, 'resting cards remain saved and are not falsely marked graduated');
        assert.equal(spaced.next(now + 330000).id, second.id, 'Hard returns at its actual learning step');
        assert.equal(first.state, 'learning');
        assert.equal(first.step, 1, 'Good advances learning without needing Easy');
        const reloaded = SM2.createSession(clone([first, second]), options);
        assert.equal(reloaded.next(now + 1000), null, 'reopening a set cannot bypass the learning delay');
        const learning = Array.from({ length: 5 }, (_, i) => ({ id: `learning-${i}`, state: 'learning',
            step: 1, nextReviewDate: new Date(now - 1).toISOString() }));
        const balanced = SM2.createSession([...learning, { id: 'brand-new' }], options);
        for (let i = 0; i < 2; i++) {
            const repeat = balanced.next(now);
            assert.match(repeat.id, /^learning-/);
            balanced.answer(repeat, 'again', now);
        }
        assert.equal(balanced.next(now).id, 'brand-new', 'at most two due learning answers can precede an unseen card');
        assert.equal(balanced.snapshot(now)[0].id, balanced.next(now).id, 'queue snapshot matches interleaved selection');
        const freshBeforeEarly = SM2.createSession([weak, { id: 'new-before-early' }], options);
        assert.equal(freshBeforeEarly.next(now).id, 'new-before-early', 'a weak future review never crowds out a new card');
        freshBeforeEarly.answer(freshBeforeEarly.next(now), 'easy', now);
        assert.equal(freshBeforeEarly.next(now).id, 'weak', 'optional early review remains available after fresh material');
        assert.equal(spaced.next(now + 600000).id, second.id, 'earlier learning deadline wins when multiple cards become ready');
        const restingDeck = { id: 'resting-deck', cards: [{ id: 'resting-card',
            ...SM2.schedule({ id: 'resting-card' }, 'good', { now: Date.now(), fuzz: false }).fields }] };
        state.state.flashcards = [restingDeck];
        let notice = '';
        const dialogs = sandbox.window.StudBudDialogs;
        sandbox.window.StudBudDialogs = { notify: message => { notice = message; } };
        const waitingApp = vm.runInContext('Object.create(AppOrchestrator.prototype)', sandbox);
        waitingApp.activeDeckId = 'previous-deck';
        waitingApp.studySession = 'previous-session';
        waitingApp.startStudy(restingDeck.id);
        assert.match(notice, /resting until.*Cram/);
        assert.equal(waitingApp.activeDeckId, 'previous-deck', 'opening resting cards does not leave a half-started study overlay');
        assert.equal(waitingApp.studySession, 'previous-session');
        sandbox.window.StudBudDialogs = dialogs;
        state.state.flashcards = [];
    }
    {
        const previousDecks = state.get('flashcards');
        const getElement = sandbox.document.getElementById;
        const nodes = new Map();
        sandbox.document.getElementById = id => {
            if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', style: {}, value: '',
                classList: { contains: () => false, add() {}, remove() {}, toggle() {} } });
            return nodes.get(id);
        };
        sandbox.document.querySelectorAll = () => [];
        const view = vm.runInContext('Object.create(AppOrchestrator.prototype)', sandbox);
        const deck = { id: 'labels', cards: [{ id: 'unseen' }, practiced, card] };
        state.state.flashcards = [deck];
        view.activeDeckId = deck.id;
        view.studySession = SM2.createSession(deck.cards, { now, includeAll: true });
        view.renderStudyFaces = view.syncStudyStar = () => {};
        view.pickStudyReversed = () => false;
        view.renderStudyCard();
        const header = nodes.get('study-progress').innerHTML;
        assert.match(header, /1 new/);
        assert.match(header, /1 learning/);
        assert.match(header, /1 review/);
        assert.doesNotMatch(header, /\bdue\b|\boverdue\b|\bearly\b|\bpracticed\b|deadline/i,
            'study counters and tooltips never present flashcards as deadlines');
        assert.equal(view.studySession.remaining, 3, 'future review cards remain available without a date gate');
        state.state.flashcards = previousDecks;
        sandbox.document.getElementById = getElement;
    }

    const deck = { id: 'deck', cards: [{ id: 'one', front: 'hola', back: 'hello' }] };
    state.state.flashcards = [deck];
    app.activeDeckId = deck.id;
    app.studySession = SM2.createSession(deck.cards, { deck, includeAll: true, fuzz: false });
    app.currentStudyCard = app.studySession.next();
    state.state.flashcards = clone([deck]); // Cloud restore detaches the session's card objects.
    await app.rateCurrentCard(4);
    let loaded = (await sandbox.NexusDB.getAll('flashcards'))[0];
    assert.equal(loaded.cards[0].state, 'learning', 'schedule is written onto the latest deck, not just the detached session');
    assert.equal(loaded.cards[0].step, 1);
    assert.equal(loaded.cards[0].practiceStats.attempts, 1);
    const reopened = SM2.createSession(loaded.cards, { deck: loaded, includeAll: true });
    assert.equal(reopened.counts().new, 0);
    assert.equal(reopened.counts().learning, 1);
    app.currentStudyCard = app.studySession.next();
    const before = clone(state.get('flashcards')[0]);
    failWrite = true;
    await assert.rejects(app.rateCurrentCard(4), /Storage full/);
    assert.deepEqual(clone(state.get('flashcards')[0]), before, 'failed writes do not advance card progress');
    assert.equal(app.studySession.remaining, 1, 'failed writes leave the current step available for retry');
    failWrite = false;
    releaseWrite = true;
    const pending = app.rateCurrentCard(4);
    await app.rateCurrentCard(4);
    releaseWrite(); releaseWrite = null;
    await pending;
    loaded = (await sandbox.NexusDB.getAll('flashcards'))[0];
    assert.equal(loaded.cards[0].state, 'review');
    assert.equal(loaded.cards[0].reps, 2, 'retry and rapid taps only record one successful rating');
    assert.equal(loaded.cards[0].practiceStats.attempts, 2);
    assert.equal(loaded.ankiToday.newDone, 1);

    const Cloud = sandbox.window.StudBudCloud.constructor;
    const base = { flashcards: [before] };
    const left = clone(base), right = clone(base);
    for (const [snapshot, quality, time] of [[left, 4, now + 1000], [right, 1, now + 2000]]) {
        const card = snapshot.flashcards[0].cards[0];
        Object.assign(card, SM2.evaluate(card, quality, { now: time, fuzz: false }));
        tools.recordAnswer(card, quality >= 3, 'recall');
        card.practiceStats.lastAnswered = new Date(time).toISOString();
        snapshot.flashcards[0].studiedCount++;
    }
    const merged = Cloud.mergeData(base, left, right);
    assert.equal(merged.flashcards[0].cards[0].state, right.flashcards[0].cards[0].state);
    assert.equal(merged.flashcards[0].cards[0].nextReviewDate, right.flashcards[0].cards[0].nextReviewDate);
    assert.equal(merged.flashcards[0].cards[0].practiceStats.attempts, 3, 'concurrent attempts merge instead of causing a sync conflict');
    assert.equal(merged.flashcards[0].studiedCount, 2, 'identical aggregate counts do not inflate on merging');

    const remoteCard = { ...loaded.cards[0], state: 'review', interval: 6, reps: 10,
        lastReviewed: new Date(now - 86400000 * 6).toISOString(), nextReviewDate: new Date(now).toISOString() };
    state.state.flashcards = [{ id: 'deck', cards: [remoteCard] }];
    const detached = { ...remoteCard, state: 'learning', interval: 0, step: 0, reps: 1 };
    app.studySession = SM2.createSession([detached], { includeAll: true, fuzz: false });
    app.currentStudyCard = app.studySession.next();
    await app.rateCurrentCard(4);
    loaded = (await sandbox.NexusDB.getAll('flashcards'))[0];
    assert.equal(loaded.cards[0].reps, 11, 'rating uses the latest remote schedule, not the stale session version');
    assert.equal(loaded.cards[0].state, 'review');
    assert.ok(loaded.cards[0].interval > 6);
    const scheduledFields = SM2.migrate(loaded.cards[0]);
    app.arcadeCardDeck = new Map([[loaded.cards[0], loaded]]);
    await app.updateCardSchedules([{ card: loaded.cards[0], correct: true, kind: 'recognition' }]);
    assert.deepEqual(SM2.migrate(state.get('flashcards')[0].cards[0]), scheduledFields,
        'recognition answers persist without altering any scheduling fields');
    app.currentStudyCard = state.get('flashcards')[0].cards[0];
    releaseWrite = true;
    const leaving = app.rateCurrentCard(4);
    app.activeDeckId = 'other-deck';
    const otherSession = SM2.createSession([{ id: 'other-card' }], { includeAll: true });
    app.studySession = otherSession;
    releaseWrite(); releaseWrite = null;
    await leaving;
    assert.equal(otherSession.counts().new, 1, 'a late save cannot advance a different study session');

    const removedId = '00000000-0000-0000-0000-000000000001';
    const removed = [{ id: removedId, owner_id: 'owner', source_deck_id: 'original' }];
    const decks = [
        { id: 'original', cards: [] }, { id: 'copy', communitySourceId: removedId, cards: [] },
        { id: 'co-owned', communityDeckId: removedId, cards: [] },
        { id: 'personal', title: 'same title', cards: [] }, { id: 'unpublished', communitySourceId: 'ordinary-unpublish', cards: [] }
    ];
    state.state.flashcards = clone(decks);
    for (const deck of decks) await sandbox.NexusDB.put('flashcards', deck);
    sandbox.window.StudBudCommunityGames.removedDecks = async () => removed;
    app.activeDeckId = 'copy';
    await app.reconcileRemovedDecks();
    assert.deepEqual(Array.from(state.get('flashcards'), deck => deck.id), ['personal', 'unpublished']);
    assert.ok(app.closedStudy);
    await app.restoreCloudSnapshot({ version: '1.0.0', state: {}, flashcards: decks });
    assert.deepEqual(Array.from(state.get('flashcards'), deck => deck.id), ['personal', 'unpublished'], 'old snapshots cannot restore known moderated copies');
    await state.importAppState({ version: '1.0.0', state: {}, flashcards: decks });
    assert.deepEqual(Array.from(state.get('flashcards'), deck => deck.id), ['personal', 'unpublished'], 'manual backup imports also reject removed copies');
    await assert.rejects(state.saveFlashcardDeck(decks[1]), /removed by moderation/, 'stale editors and game saves cannot restore removed copies');
    sandbox.window.StudBudCloud.user = { id: 'someone-else' };
    assert.equal(app.isRemovedCommunityDeck({ id: 'original' }), false, 'matching local IDs on another account are not removed');
    sandbox.window.StudBudCloud.user = { id: 'owner' };
    state.state.flashcards = [{ id: 'original', cards: [] }, { id: 'personal', cards: [] }];
    await app.reconcileRemovedDecks();
    assert.deepEqual(Array.from(state.get('flashcards'), deck => deck.id), ['personal'],
        'an owner original without sharing metadata still checks the removal ledger');
    sandbox.window.StudBudCommunityGames.removedDecks = async () => { throw new Error('Moderation unavailable'); };
    await assert.rejects(app.reconcileRemovedDecks(), /Moderation unavailable/);
    sandbox.window.StudBudCommunityGames.removedDecks = async () => {
        const error = new Error('Function is not in the schema cache');
        error.code = 'PGRST202';
        throw error;
    };
    await app.reconcileRemovedDecks();
    assert.equal(app.removedDeckCheckUnavailable, true, 'missing moderation SQL is explicit but does not block private study saves or sign-in');
    app.removedCommunityDecks = [{ id: removedId, owner_id: 'owner', source_deck_id: null }];
    assert.equal(app.isRemovedCommunityDeck({ id: 'historical-copy', communitySourceId: removedId }), true,
        'historical deletions can block imported copies without an original local ID');
    assert.equal(app.isRemovedCommunityDeck({ id: null }), false, 'unknown source identity never matches an unrelated deck');

    const sql = read('supabase-setup.sql');
    assert.match(sql, /alter table public\.studbud_removed_decks alter column source_deck_id drop not null/);
    const repair = read('supabase-repair-random-spanish-100.sql');
    assert.match(repair, /begin;[\s\S]*insert into public\.studbud_removed_decks[\s\S]*studbud_prune_removed_decks[\s\S]*commit;/);
    assert.match(repair, /on conflict \(id\) do update/);
    assert.match(repair, /e905f9a1-1f2a-411f-90b8-e7cce02b0c3c/);
    assert.doesNotMatch(repair, /title\s*=/i, 'repair targets the confirmed public identity rather than a matching title');
    assert.match(sql, /create table if not exists public\.studbud_removed_decks/);
    assert.match(sql, /create trigger studbud_prune_removed_decks before insert or update of data/);
    assert.match(sql, /create trigger studbud_block_removed_decks before insert or update/);
    assert.equal((sql.match(/perform public\.studbud_remove_deck_copies\(/g) || []).length, 3, 'delete, user deck removal and user ban all purge copies');
    assert.match(sql, /r\.owner_id = p_user_id and r\.source_deck_id = d\.value ->> 'id'/);
    assert.match(sql, /r\.id::text in \(d\.value ->> 'communitySourceId', d\.value ->> 'communityDeckId'\)/);
    assert.match(sql, /set data = public\.studbud_prune_removed_decks\(d\.data, d\.user_id\)/);
    console.log('Study persistence passed: Anki steps/graduation/lapses, honest practice counts, detached sessions, reload, failed-write retry, rapid taps, concurrent cloud reviews, moderated-copy removal and restore guards.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

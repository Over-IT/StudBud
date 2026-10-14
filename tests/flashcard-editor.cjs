const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const state = { flashcards: [], courses: [{ code: 'math', title: 'Math' }, { code: 'spanish', title: 'Spanish' }], assignments: [
    { id: 'math-test', courseCode: 'math', title: 'Unit test', kind: 'test', dueDate: '2099-10-22', status: 'pending' },
    { id: 'spanish-quiz', courseCode: 'spanish', title: 'Quiz', kind: 'quiz', dueDate: '2099-10-24', status: 'pending' },
    { id: 'past', courseCode: 'math', title: 'Old test', kind: 'test', dueDate: '2000-01-01', status: 'completed' }
] };
const elements = new Map();
for (const id of ['card-form', 'card-deck-id', 'card-id', 'card-front', 'card-back', 'card-tags', 'card-answer-image', 'card-remove-image', 'card-distractors',
    'deck-editor-title', 'deck-editor-course', 'deck-editor-assessment', 'deck-editor-search',
    'deck-editor-count', 'deck-editor-cards', 'deck-editor-filter', 'deck-editor-bulk', 'deck-editor-undo', 'modal-container']) {
    const element = { value: '', textContent: '', reset() {}, classList: { add() {}, toggle() {}, contains: () => false } };
    Object.defineProperty(element, 'innerHTML', {
        get() { return this.html || ''; },
        set(html) {
            this.html = html;
            if (id === 'deck-editor-course' || id === 'deck-editor-assessment') {
                this.value = /<option value="([^"]*)" selected>/.exec(html)?.[1] || '';
            }
        }
    });
    elements.set(id, element);
}
let failStorage = false;
const sandbox = {
    console, Date, Math, Map, Set,
    window: { crypto: require('node:crypto').webcrypto, confirm: () => true },
    document: {
        getElementById: id => elements.get(id) || null,
        querySelector: () => ({ textContent: '' }),
        querySelectorAll: () => []
    },
    AppState: {
        get: key => state[key],
        setSaveStatus() {},
        saveFlashcardDeck: async deck => {
            if (failStorage) throw new Error('Storage failed');
            const index = state.flashcards.findIndex(item => item.id === deck.id);
            if (index < 0) state.flashcards.push(clone(deck));
            else state.flashcards[index] = clone(deck);
        }
    }
};
vm.createContext(sandbox);
vm.runInContext(source('communityGames.js'), sandbox);
vm.runInContext(source('flashcardEngine.js'), sandbox);
const appSource = source('app.js');
vm.runInContext(appSource.slice(appSource.indexOf('    function localDateKey'), appSource.indexOf('    window.NexusApp ='))
    + '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
const app = sandbox.app;
app.openModal = id => { app.modal = id; };
const value = (id, text) => { elements.get(id).value = text; };
const deck = () => state.flashcards[0];
const progress = {
    id: 'original', front: 'Before', back: 'Answer', tags: ['unit'], state: 'review',
    repetitions: 7, interval: 20, easeFactor: 2.3, nextReviewDate: '2099-12-01',
    lastReviewed: '2026-10-10', lapses: 2, suspended: false, mastery: .8
};

async function run() {
    state.flashcards = [{ id: 'set', title: 'Original set', courseCode: 'math', assessmentId: 'math-test', cards: [clone(progress)] }];
    app.openDeckEditor('set');
    assert.equal(app.modal, 'deck-editor-modal');
    assert.equal(elements.get('deck-editor-assessment').value, 'math-test');
    assert.notEqual(app.deckEditorDraft.cards[0], deck().cards[0]);
    app.openCardForm('set', 'original', true);
    value('card-front', '  Edited <term>  ');
    value('card-back', '  Updated answer  ');
    value('card-tags', ' unit, edited, ');
    value('card-distractors', 'Wrong answer\nAnother option');
    app.deckEditorDraft.cards[0].answerImage = 'data:image/png;base64,aGVsbG8=';
    await app.saveCard();
    assert.equal(deck().cards[0].front, 'Before', 'draft changes stay private until saved');
    app.closeModal();
    assert.equal(app.modal, 'deck-editor-modal');
    assert.match(elements.get('deck-editor-cards').innerHTML, /Edited &lt;term&gt;/);
    assert.equal(elements.get('deck-editor-title').value, 'Original set', 'nested editor preserves metadata fields');
    app.openCardForm('set', '', true);
    value('card-front', 'New term');
    value('card-back', 'New answer');
    await app.saveCard();
    const newId = app.deckEditorDraft.cards[1].id;
    assert.notEqual(newId, 'original');
    app.closeModal();
    value('deck-editor-search', 'edited');
    app.renderDeckEditorCards();
    assert.equal(elements.get('deck-editor-count').textContent, '1 of 2 cards');
    deck().cards[0].interval = 40;
    deck().cards.push({ id: 'other-device', front: 'Concurrent', back: 'Added elsewhere' });
    value('deck-editor-title', 'Renamed set');
    await app.saveDeckEditor();
    assert.equal(deck().title, 'Renamed set');
    assert.equal(deck().cards.length, 3, 'concurrent additions survive saving');
    assert.equal(deck().cards[0].interval, 40, 'latest review progress survives editing');
    for (const key of ['id', 'state', 'repetitions', 'easeFactor', 'nextReviewDate', 'lastReviewed', 'lapses', 'suspended', 'mastery']) {
        assert.equal(deck().cards[0][key], progress[key], `${key} preserved`);
    }
    assert.equal(deck().cards[0].front, 'Edited <term>');
    assert.deepEqual(deck().cards[0].tags, ['unit', 'edited']);
    assert.deepEqual(deck().cards[0].distractors, ['Wrong answer', 'Another option']);
    assert.equal(deck().cards[0].answerImage, 'data:image/png;base64,aGVsbG8=');

    app.openDeckEditor('set');
    await app.handleDataAction('editor-delete-card', newId);
    assert.equal(deck().cards.length, 3, 'deletion is staged');
    await app.saveDeckEditor();
    assert.equal(deck().cards.length, 2);
    const snapshot = clone(deck());
    app.openDeckEditor('set');
    app.deckEditorDraft.cards[0].front = 'Discard this';
    app.closeModal();
    assert.equal(app.deckEditorDraft, null);
    assert.deepEqual(deck(), snapshot, 'Cancel discards changes');

    app.openCardForm('set', 'original');
    value('card-front', ' ');
    await assert.rejects(app.saveCard(), /front and back/);
    assert.deepEqual(deck(), snapshot);
    value('card-front', 'Storage failure edit');
    failStorage = true;
    await assert.rejects(app.saveCard(), /Storage failed/);
    assert.deepEqual(deck(), snapshot, 'failed writes do not mutate saved cards');
    failStorage = false;
    await app.saveCard();
    assert.equal(deck().cards.length, 2, 'editing replaces rather than duplicates');
    app.openCardForm('set', 'original');
    value('card-distractors', 'Updated answer');
    await assert.rejects(app.saveCard(), /correct answer/);
    value('card-distractors', '');
    elements.get('card-remove-image').checked = true;
    await app.saveCard();
    assert.equal(deck().cards[0].answerImage, '');
    assert.throws(() => app.openCardForm('set', 'missing'), /selected card no longer exists/);
    app.openDeckEditor('set');
    deck().cards[0].back = 'Updated elsewhere';
    await app.saveDeckEditor();
    assert.equal(deck().cards[0].back, 'Updated elsewhere', 'unedited text retains concurrent changes');
    app.openDeckEditor('set');
    app.deckEditorDraft.cards[0].front = 'My conflicting edit';
    deck().cards[0].front = 'Other conflicting edit';
    await assert.rejects(app.saveDeckEditor(), /edited elsewhere/);
    assert.equal(deck().cards[0].front, 'Other conflicting edit');
    app.openDeckEditor('set');
    state.flashcards = [];
    await assert.rejects(app.saveDeckEditor(), /set was removed/);
    app.openDeckEditor();
    await assert.rejects(app.saveDeckEditor(), /Set names/);
    value('deck-editor-title', 'New empty set');
    await app.saveDeckEditor();
    assert.equal(state.flashcards.length, 1);
    assert.equal(deck().title, 'New empty set');
    assert.equal(deck().courseCode, '');
    assert.equal(deck().cards.length, 0);
}

async function linksAndSharing() {
    state.flashcards = [{ id: 'set', title: 'Editor tools', cards: [{ ...clone(progress), answerImage: 'data:image/png;base64,aGVsbG8=', distractors: ['Other'] }] }];
    app.openDeckEditor('set');
    value('deck-editor-bulk', 'First :: Definition :: unit\nSecond\tOther definition\nFirst :: Definition');
    app.addBulkEditorCards();
    assert.equal(app.deckEditorDraft.cards.length, 3, 'bulk paste skips duplicate pairs without replacing existing cards');
    assert.equal(deck().cards.length, 1, 'bulk changes remain staged');
    value('deck-editor-bulk', 'Valid :: Answer\nMalformed row');
    assert.throws(() => app.addBulkEditorCards(), /Row 2/);
    assert.equal(app.deckEditorDraft.cards.length, 3, 'invalid bulk paste is atomic');
    app.copyEditorCard('original');
    const copied = app.deckEditorDraft.cards[1];
    assert.notEqual(copied.id, 'original');
    assert.equal(copied.answerImage, 'data:image/png;base64,aGVsbG8=');
    assert.equal(copied.repetitions, 0);
    assert.equal(copied.practiceStats, undefined);
    app.copyEditorCard('original', true);
    const reversed = app.deckEditorDraft.cards[1];
    assert.equal(reversed.front, 'Answer');
    assert.equal(reversed.back, 'Before');
    assert.equal(reversed.answerImage, undefined, 'reverse copies cannot illustrate the wrong side');
    assert.equal(reversed.distractors, undefined);
    await app.handleDataAction('editor-pause-card', 'original');
    await app.handleDataAction('editor-delete-card', copied.id);
    await app.handleDataAction('editor-undo-delete');
    assert.ok(app.deckEditorDraft.cards.some(card => card.id === copied.id));
    await app.saveDeckEditor();
    assert.equal(deck().cards.find(card => card.id === 'original').suspended, true);
    assert.equal(deck().cards.find(card => card.id === 'original').interval, 20);

    state.flashcards = [{ id: 'set', title: 'Shared set', cards: [clone(progress), { id: 'two', front: 'Two', back: 'Second' }],
        courseCode: 'math', courseTitle: 'Math', assessmentId: 'math-test', communityPublished: true, communityDeckId: 'published' }];
    const published = [];
    sandbox.window.StudBudCommunityGames.publishDeck = async deck => { published.push(clone(deck)); return { id: 'published' }; };
    sandbox.window.StudBudCloud = { offlineMode: true };
    await app.refreshEditedSharedDeck(deck());
    assert.equal(published.length, 0, 'offline edits never attempt public publication');
    assert.equal(deck().communityUpdatePending, true);
    sandbox.window.StudBudCloud.offlineMode = false;
    await app.refreshPendingSharedDecks();
    assert.equal(published.length, 1);
    assert.equal(deck().communityUpdatePending, false);
    const queuedOriginal = clone(deck());
    await app.updateSavedDeck('set', { communityUpdatePending: true });
    sandbox.window.StudBudCommunityGames.publishDeck = async () => {
        await app.updateSavedDeck('set', { title: 'Edited during queued publication' });
        return { id: 'published' };
    };
    await app.refreshPendingSharedDecks();
    assert.equal(deck().title, 'Edited during queued publication');
    assert.equal(deck().communityUpdatePending, true, 'acknowledging an older publication keeps newer edits queued');
    sandbox.window.StudBudCommunityGames.publishDeck = async () => { throw new Error('Connection failed'); };
    await app.refreshPendingSharedDecks();
    assert.equal(deck().communityUpdatePending, true, 'publication failures retain the pending local copy');
    sandbox.window.StudBudCommunityGames.publishDeck = async () => { state.flashcards = []; return { id: 'published' }; };
    await app.refreshPendingSharedDecks();
    assert.equal(state.flashcards.length, 0, 'queued publication acknowledgements cannot resurrect deleted sets');
    state.flashcards = [queuedOriginal];
    sandbox.window.StudBudCommunityGames.publishDeck = async deck => { published.push(clone(deck)); return { id: 'published' }; };
    published.length = 0;
    await app.updateDeckLink('set', 'course', 'spanish');
    assert.equal(deck().assessmentId, '');
    await app.updateDeckLink('set', 'course', 'math');
    assert.equal(deck().courseTitle, 'Math');
    assert.equal(published.length, 2, 'switching away and back updates the same shared set');
    await app.updateDeckLink('set', 'assessment', 'math-test');
    assert.equal(published.length, 2, 'private test changes do not republish');
    await app.updateDeckLink('set', 'assessment', 'spanish-quiz');
    assert.equal(deck().courseCode, 'spanish', 'picking a test selects its class');
    await app.updateDeckLink('set', 'course', '');
    assert.equal(deck().courseTitle, '');
    assert.equal(app.deckLinkInfo(deck()).course, null, 'clearing class removes stale public class');
    assert.equal(deck().assessmentId, '');
    await assert.rejects(app.updateDeckLink('set', 'assessment', 'missing'), /no longer available/);
    assert.throws(() => app.validatedDeckLink('math', 'spanish-quiz'), /selected class/);
    assert.match(app.deckAssessmentOptions('math', 'past'), /selected.*\(completed\)/);
    assert.doesNotMatch(app.deckAssessmentOptions('spanish', 'math-test'), /math-test/);
    assert.equal(app.deckLinkInfo({ courseCode: 'math', assessmentId: 'spanish-quiz' }).assessment, null);
    const courseSelect = { value: '', innerHTML: '' };
    const testSelect = { value: 'math-test', innerHTML: '' };
    app.syncDeckLinkSelects(courseSelect, testSelect, false);
    assert.doesNotMatch(testSelect.innerHTML, / selected/, 'clearing class clears the incompatible test');
    const localEvening = new Date(2026, 9, 12, 23, 30);
    sandbox.Date = class extends Date {
        constructor(...args) { super(...(args.length ? args : [localEvening.getTime()])); }
    };
    state.assignments.push({ id: 'today', courseCode: 'math', title: 'Today test', kind: 'test', status: 'pending', dueDate: '2026-10-12' });
    assert.match(app.deckAssessmentOptions('math'), /value="today"/, 'today stays available late in the local evening');
    assert.ok(app.deckAssessmentOptionsIds().includes('today'));
    sandbox.Date = Date;
    state.assignments.pop();

    app.openCardForm('set');
    value('card-front', 'Third');
    value('card-back', 'Third answer');
    sandbox.window.StudBudCommunityGames.publishDeck = async () => { throw new Error('Connection failed'); };
    await assert.rejects(app.saveCard(), /saved locally.*shared copy/);
    const retryId = elements.get('card-id').value;
    assert.ok(retryId);
    assert.equal(deck().cards.length, 3);
    sandbox.window.StudBudCommunityGames.publishDeck = async deck => { published.push(clone(deck)); return { id: 'published' }; };
    await app.saveCard();
    assert.equal(deck().cards.length, 3, 'retrying shared publication never duplicates a locally saved card');
    assert.equal(deck().cards[2].id, retryId);
    app.openDeckEditor('set');
    app.openCardForm('set', '', true);
    value('card-front', 'Staged fourth');
    value('card-back', 'Fourth answer');
    await app.saveCard();
    const fourthId = app.deckEditorDraft.cards[3].id;
    app.closeModal();
    sandbox.window.StudBudCommunityGames.publishDeck = async () => { throw new Error('Connection failed'); };
    await assert.rejects(app.saveDeckEditor(), /saved locally/);
    await app.handleDataAction('editor-delete-card', fourthId);
    sandbox.window.StudBudCommunityGames.publishDeck = async () => ({ id: 'published' });
    await app.saveDeckEditor();
    assert.equal(deck().cards.length, 3, 'deleting an added card after a failed publication does not resurrect it');

    sandbox.window.alert = () => {};
    sandbox.window.StudBudCommunityGames.publishDeck = async () => {
        const latest = clone(deck());
        latest.title = 'Renamed while sharing';
        latest.cards[0].interval = 60;
        latest.cards.push({ id: 'during-share', front: 'New term', back: 'New answer' });
        state.flashcards[0] = latest;
        return { id: 'published' };
    };
    await app.publishCommunityDeck('set');
    assert.equal(deck().title, 'Renamed while sharing', 'publication acknowledgement cannot restore the old set title');
    assert.equal(deck().cards[0].interval, 60, 'publication preserves newer review progress');
    assert.equal(deck().cards.at(-1).id, 'during-share', 'publication preserves concurrently added cards');
    assert.equal(deck().communityPublished, true);
    sandbox.window.StudBudCommunityGames.unpublishDeck = async () => {
        const latest = clone(deck());
        latest.title = 'Renamed while unsharing';
        latest.cards[0].back = 'Newer definition';
        state.flashcards[0] = latest;
    };
    await app.unpublishCommunityDeck('set');
    assert.equal(deck().title, 'Renamed while unsharing', 'unsharing does not restore an older title');
    assert.equal(deck().cards[0].back, 'Newer definition', 'unsharing does not overwrite card edits');
    assert.equal(deck().communityPublished, false);
    await app.updateSavedDeck('set', { communitySourceAuthor: 'Author', communityStudyRecorded: true });
    assert.equal(deck().title, 'Renamed while unsharing', 'background author and study-count updates preserve newer set data');
    assert.equal(deck().cards[0].interval, 60);
    sandbox.window.StudBudCommunityGames.unpublishDeck = async () => { state.flashcards = []; };
    const preservedDeck = clone(deck());
    await assert.rejects(app.unpublishCommunityDeck('set'), /removed before the update finished/);
    assert.equal(state.flashcards.length, 0, 'a late acknowledgement cannot resurrect a deleted set');
    state.flashcards = [preservedDeck];

    const community = new sandbox.window.StudBudCommunityGames.constructor();
    const rows = new Map();
    let lookupError = false;
    const sent = [];
    community.getUserId = () => 'owner';
    community.getClient = () => ({
        from: () => {
            let payload, owner, sourceId;
            return {
                select() { return this; },
                eq(key, val) { if (key === 'owner_id') owner = val; if (key === 'source_deck_id') sourceId = val; return this; },
                maybeSingle: async () => lookupError ? { error: { message: 'Lookup failed' } } : { data: rows.get(`${owner}:${sourceId}`) || null },
                upsert(row) { payload = clone(row); return this; },
                single: async () => {
                    const key = `${payload.owner_id}:${payload.source_deck_id}`;
                    const existing = rows.get(key);
                    if (existing && payload.id !== existing.id) return { error: { message: 'A shared set with that name already exists.' } };
                    if ([...rows.entries()].some(([otherKey, row]) => otherKey !== key && row.title === payload.title)) return { error: { message: 'A shared set with that name already exists.' } };
                    payload.id ||= `public-${rows.size + 1}`;
                    rows.set(key, payload);
                    sent.push(payload);
                    return { data: { id: payload.id } };
                }
            };
        }
    });
    const shared = clone(deck());
    const first = await community.publishDeck({ ...shared, courseTitle: 'Math' });
    await community.publishDeck({ ...shared, courseTitle: 'Spanish' });
    const last = await community.publishDeck({ ...shared, courseTitle: 'Math' });
    assert.equal(first.id, last.id);
    assert.equal(rows.size, 1);
    assert.equal(sent[2].course, 'Math');
    assert.equal(sent[2].assessmentId, undefined);
    assert.deepEqual(Object.keys(sent[2].cards[0]).sort(), ['back', 'distractors', 'front'], 'public copies include choices but exclude private images and review progress');
    await assert.rejects(community.publishDeck({ ...shared, id: 'different-set' }), /already exists/, 'real duplicates remain blocked');
    await assert.rejects(community.publishDeck({ ...shared, communitySourceId: 'borrowed', communitySourceOwnerId: 'another' }), /reposted/);
    lookupError = true;
    await assert.rejects(community.publishDeck(shared), /Lookup failed/);
    const sql = source('supabase-setup.sql');
    assert.equal((sql.match(/and not \(d\.owner_id = new\.owner_id and d\.source_deck_id = new\.source_deck_id\)/g) || []).length, 2);
    assert.match(sql, /d\.owner_id <> new\.owner_id/);
}

run().then(linksAndSharing).then(() => {
    console.log('Flashcard drafts, editing/deletion, progress preservation, write failures, class/test switching and shared-set identity checks passed.');
}).catch(error => { console.error(error); process.exitCode = 1; });

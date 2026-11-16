const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const elements = new Map(), writes = [];
const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '', dataset: {},
        setAttribute() {}, removeAttribute() {}, classList: { toggle() {} }, focus() {} });
    return elements.get(id);
};
const cloud = { user: { id: 'account-a' }, accountVersion: 1 };
const state = { flashcards: [], courses: [], assignments: [], settings: {} };
const api = { hasAccount: () => true, sharedDeckRow: () => ({}) };
const sandbox = { console, Map, Set, Date, Math,
    window: { StudBudCloud: cloud, StudBudCommunityGames: api, crypto: require('node:crypto').webcrypto,
        StudBudDialogs: { confirm: async () => true } },
    document: { getElementById: element, querySelector: () => null },
    AppState: { get: key => state[key], saveFlashcardDeck: async deck => { writes.push(deck); } }
};
vm.createContext(sandbox);
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
vm.runInContext(source.slice(source.indexOf('    class AppOrchestrator'), source.indexOf('    window.NexusApp =')) +
    '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
const app = sandbox.app;
app.openModal = () => {};
app.closeModal = () => {};
app.renderDeckEditorCards = () => {};
app.deckLinkInfo = () => ({ courseCode: '' });
app.deckCourseOptions = app.deckAssessmentOptions = () => '';
app.validatedDeckLink = () => ({ courseCode: '', courseTitle: '', assessmentId: '' });
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const startDraft = () => {
    app.openDeckEditor();
    element('deck-editor-title').value = 'PRIVATE account A draft';
    app.deckEditorDraft.cards.push({ id: 'private-card', front: 'PRIVATE term', back: 'PRIVATE answer' });
};
const closeDraft = () => { app.retainDeckEditorDraft(); app.deckEditorDraft = null; };

(async () => {
    startDraft(); closeDraft(); app.openDeckEditor();
    assert.equal(element('deck-editor-title').value, 'PRIVATE account A draft', 'same account/context resumes drafts');
    assert.equal(app.deckEditorDraft.cards[0].front, 'PRIVATE term');
    cloud.user = { id: 'account-b' };
    app.openDeckEditor();
    assert.equal(element('deck-editor-title').value, '');
    assert.equal(app.deckEditorDraft.cards.length, 0, 'another account cannot resume unsaved cards');
    cloud.user = { id: 'account-a' };
    startDraft();
    cloud.accountVersion++;
    await assert.rejects(app.saveDeckEditor(), /context changed/);
    assert.equal(writes.length, 0, 'an already-open editor cannot save across logout/relogin');
    assert.equal(app.deckEditorDraft, null);
    assert.equal(element('deck-editor-title').value, '');

    startDraft();
    const saved = deferred(), originalSave = sandbox.AppState.saveFlashcardDeck;
    sandbox.AppState.saveFlashcardDeck = () => saved.promise;
    const pendingSave = app.saveDeckEditor();
    cloud.accountVersion++;
    app.clearCommunitySetContext();
    saved.resolve();
    await assert.rejects(pendingSave, /context changed while saving/);
    assert.equal(app.deckEditorDraft, null, 'a completed old-context write cannot repopulate cleared draft memory');
    sandbox.AppState.saveFlashcardDeck = originalSave;

    cloud.user = null; cloud.guestUser = { id: 'guest-one' };
    startDraft(); closeDraft();
    cloud.guestUser = { id: 'guest-two' };
    app.openDeckEditor();
    assert.equal(app.deckEditorDraft.cards.length, 0, 'anonymous guest identities are separate contexts');
    cloud.guestUser = null;
    startDraft(); closeDraft();
    app.clearCommunitySetContext();
    app.openDeckEditor();
    assert.equal(app.deckEditorDraft.cards.length, 0, 'reset invalidates local guests without an auth identity');

    cloud.user = { id: 'account-a' };
    for (const change of [() => { cloud.user = { id: 'account-b' }; }, () => { cloud.accountVersion++; }]) {
        cloud.user = { id: 'account-a' };
        const inbox = deferred();
        api.listBudSets = () => inbox.promise;
        const pending = app.loadBudSets();
        change();
        inbox.resolve([{ id: 'private-share', title: 'PRIVATE inbox set', author_name: 'PRIVATE sender' }]);
        await pending;
        assert.doesNotMatch(element('bud-set-results').innerHTML, /PRIVATE/, 'late inbox response never renders into another context');
        assert.doesNotMatch(element('bud-set-status').textContent, /PRIVATE/);
    }

    const preview = deferred();
    api.listBudSets = () => preview.promise;
    const pendingPreview = app.previewCommunitySet('private-share', true);
    cloud.accountVersion++;
    preview.resolve([{ title: 'PRIVATE preview', cards: [{ front: 'PRIVATE card', back: 'PRIVATE definition' }] }]);
    await pendingPreview;
    assert.equal(element('community-preview-cards').innerHTML, '');
    assert.doesNotMatch(element('community-preview-title').textContent, /PRIVATE/);

    const failedPreview = deferred();
    api.listBudSets = () => failedPreview.promise;
    const pendingFailure = app.previewCommunitySet('private-share', true);
    cloud.accountVersion++;
    failedPreview.reject(new Error('PRIVATE old-account error'));
    await pendingFailure;
    assert.doesNotMatch(element('community-preview-status').textContent, /PRIVATE/);

    const imported = deferred();
    api.listBudSets = () => imported.promise;
    const pendingImport = app.importCommunityDeck('private-share', true);
    cloud.accountVersion++;
    imported.resolve([{ id: 'private-share', title: 'PRIVATE', cards: [{ front: 'A', back: 'B' }, { front: 'C', back: 'D' }] }]);
    await assert.rejects(pendingImport, /account changed/);
    assert.equal(writes.length, 0, 'late Bud import cannot persist content into a replacement context');

    state.flashcards = [{ id: 'own', title: 'Personal set', cards: [] }];
    const friends = deferred();
    api.friendCall = () => friends.promise;
    const pendingFriends = app.openSetSharing('own');
    cloud.accountVersion++;
    friends.resolve({ friends: [{ user_id: 'old-bud', username: 'PRIVATE old Bud' }] });
    await pendingFriends;
    assert.doesNotMatch(element('set-sharing-bud').innerHTML, /PRIVATE/);
    assert.equal(element('set-sharing-send').disabled, true);

    element('bud-set-results').innerHTML = 'PRIVATE';
    element('community-preview-cards').innerHTML = 'PRIVATE';
    app.clearCommunitySetContext();
    assert.equal(element('bud-set-results').innerHTML, '');
    assert.equal(element('community-preview-cards').innerHTML, '');
    assert.equal(app.setSharingDeckId, null);
    console.log('Account/guest-bound draft resume, stale-save rejection, reset clearing and delayed Bud inbox/preview/import/recipient isolation passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

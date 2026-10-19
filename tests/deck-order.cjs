const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

const state = {
    flashcards: [],
    courses: [{ code: 'math', title: 'Math' }],
    assignments: [
        { id: 'soon', courseCode: 'math', title: 'Unit test', kind: 'test', dueDate: '2099-01-02', status: 'pending' },
        { id: 'later', courseCode: 'math', title: 'Final', kind: 'test', dueDate: '2099-06-01', status: 'pending' },
        { id: 'done', courseCode: 'math', title: 'Old', kind: 'test', dueDate: '2000-01-01', status: 'completed' }
    ]
};
let saves = 0;
const storage = new Map();
const sandbox = {
    console, Date, Math, Map, Set,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    window: { StudBudDialogs: { confirm: async () => true, notify() {} } },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    CSS: { escape: value => value },
    AppState: {
        get: key => state[key],
        setSaveStatus() {},
        async patchFlashcardDecks(patches) {
            saves += 1;
            state.flashcards = state.flashcards.map(deck => patches.has(deck.id) ? { ...deck, ...patches.get(deck.id) } : deck);
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
const ids = list => list.map(deck => deck.id).join(',');

(async () => {
    const card = (extra = {}) => ({ id: Math.random().toString(36), front: 'a', back: 'b', ...extra });
    state.flashcards = [
        { id: 'alpha', title: 'Alpha', cards: [card({ practiceStats: { lastAnswered: '2098-01-01T00:00:00Z' } })] },
        { id: 'beta', title: 'beta 10', courseCode: 'math', assessmentId: 'later', cards: [card()] },
        { id: 'gamma', title: 'Beta 2', courseCode: 'math', assessmentId: 'soon', cards: [card({ lastReviewed: '2098-05-01T00:00:00Z' })] },
        { id: 'delta', title: 'Delta', courseCode: 'math', assessmentId: 'done', cards: [] }
    ];

    assert.equal(ids(app.orderedDecks(state.flashcards, 'custom')), 'alpha,beta,gamma,delta', 'custom order starts in creation order');
    assert.equal(ids(app.orderedDecks(state.flashcards, 'recent')), 'gamma,alpha,beta,delta', 'recently studied uses card activity');
    assert.equal(ids(app.orderedDecks(state.flashcards, 'test')), 'gamma,beta,alpha,delta', 'nearest upcoming test first; completed tests do not count');
    assert.equal(ids(app.orderedDecks(state.flashcards, 'name')), 'alpha,gamma,beta,delta', 'names sort naturally (Beta 2 before beta 10)');

    state.flashcards[3].pinned = true;
    for (const mode of ['custom', 'recent', 'test', 'name', 'weakest']) {
        assert.equal(app.orderedDecks(state.flashcards, mode)[0].id, 'delta', `pinned decks stay on top in ${mode} order`);
    }

    await app.moveDeck('gamma', 'alpha', 'before');
    assert.equal(ids(app.orderedDecks(state.flashcards, 'custom')), 'delta,gamma,alpha,beta');
    assert.equal(saves, 1, 'a move saves every changed deck in one batch');
    assert.deepEqual(state.flashcards.map(deck => deck.sortIndex), [2, 3, 1, 0]);

    await app.moveDeck('beta', 'delta', 'after');
    assert.equal(state.flashcards.find(deck => deck.id === 'beta').pinned, true, 'dragging into the pinned group pins the deck');
    assert.equal(ids(app.orderedDecks(state.flashcards, 'custom')), 'delta,beta,gamma,alpha');

    // Up/down never jump across the pinned divider.
    await app.stepDeck('gamma', -1);
    assert.equal(ids(app.orderedDecks(state.flashcards, 'custom')), 'delta,beta,gamma,alpha');
    await app.stepDeck('gamma', 1);
    assert.equal(ids(app.orderedDecks(state.flashcards, 'custom')), 'delta,beta,alpha,gamma');

    storage.set('studbud-deck-sort', 'bogus');
    assert.equal(app.deckSortMode(), 'custom');
    storage.set('studbud-deck-sort', 'test');
    assert.equal(app.deckSortMode(), 'test');

    state.flashcards.push({ id: 'new', title: 'New', cards: [] });
    assert.equal(app.orderedDecks(state.flashcards, 'custom').at(-1).id, 'new', 'new decks land at the end of a saved order');

    const html = source('index.html');
    assert.match(html, /id="my-deck-sort"/);
    assert.match(html, /data-action="toggle-deck-reorder"/);
    console.log('deck-order tests passed');
})().catch(error => { console.error(error); process.exit(1); });

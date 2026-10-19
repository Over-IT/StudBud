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
    window: { addEventListener() {}, StudBudDialogs: { confirm: async () => true, notify() {} } },
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

    state.flashcards = [
        { id: 'z', title: 'Zulu', cards: [] },
        { id: 'a', title: 'Alpha', cards: [] },
        { id: 'm', title: 'Mike', cards: [] }
    ];
    storage.set('studbud-deck-sort', 'name');
    await app.moveDeck('z', 'a', 'after');
    assert.equal(ids(app.visibleDecks()), 'a,z,m', 'dropping from another sort preserves the displayed order around the move');
    assert.equal(app.deckSortMode(), 'custom', 'a drag switches to saved custom order');

    const classes = () => {
        const values = new Set();
        return { add: (...names) => names.forEach(name => values.add(name)), remove: (...names) => names.forEach(name => values.delete(name)),
            contains: name => values.has(name) };
    };
    const handlers = {}, documentHandlers = {};
    let ghost = null, capture = null, frame, hit, scrollTop = 0;
    const scroller = { get scrollTop() { return scrollTop; }, set scrollTop(value) { scrollTop = value; } };
    const cards = ['z', 'a', 'm'].map((id, index) => ({
        dataset: { deckId: id }, classList: classes(),
        getBoundingClientRect: () => ({ left: index * 220, right: index * 220 + 200, top: 100, bottom: 300, width: 200, height: 200 }),
        closest(selector) { return selector === '.deck-card' ? this : null; },
        cloneNode: () => ({ classList: classes(), style: {}, setAttribute() {}, remove() { ghost = null; } })
    }));
    const handle = card => ({ closest: selector => selector === '.deck-drag-handle' ? handle(card) : selector === '.deck-card' ? card : null });
    const grid = {
        parentElement: null,
        getBoundingClientRect: () => ({ left: 0, right: 640, top: 100, bottom: 300 }),
        addEventListener: (name, fn) => { handlers[name] = fn; },
        querySelectorAll: () => cards,
        querySelector: () => null,
        contains: card => cards.includes(card),
        setPointerCapture: id => { capture = id; },
        hasPointerCapture: id => capture === id,
        releasePointerCapture: () => { capture = null; }
    };
    sandbox.document = {
        getElementById: id => id === 'deck-grid' ? grid : null,
        addEventListener: (name, fn) => { documentHandlers[name] = fn; },
        elementFromPoint: () => hit,
        scrollingElement: scroller,
        body: { append: node => { ghost = node; } }
    };
    sandbox.window.innerHeight = 800;
    sandbox.getComputedStyle = () => ({ gridTemplateColumns: '200px 200px 200px' });
    sandbox.requestAnimationFrame = fn => { frame = fn; return 1; };
    sandbox.cancelAnimationFrame = () => { frame = null; };
    const renderDecks = app.renderDecks;
    let renders = 0;
    app.renderDecks = () => { renders++; };
    app.bindDeckReorderDrag();
    const event = (target, x = 20, y = 120, pointerType = 'touch') =>
        ({ target, button: 0, isPrimary: true, pointerId: 7, pointerType, clientX: x, clientY: y, preventDefault() {} });

    handlers.pointerdown(event(cards[0]));
    assert.equal(capture, null, 'touch on the card body stays available for normal scrolling');
    handlers.pointerdown(event(handle(cards[0])));
    handlers.pointermove(event(handle(cards[0]), 23, 122));
    assert.equal(ghost, null, 'a tap does not pick up a deck');
    hit = cards[1];
    handlers.pointermove(event(handle(cards[0]), 250, 140));
    assert.ok(ghost, 'touch dragging the grip lifts a visual copy');
    assert.ok(cards[0].classList.contains('is-dragging'));
    assert.ok(cards[1].classList.contains('drop-before'), 'the target marks its insertion edge');
    renderDecks.call(app);
    renderDecks.call(app);
    assert.ok(ghost, 'background refreshes leave the lifted card intact');
    assert.equal(capture, 7, 'background refreshes retain the active pointer capture');
    assert.equal(app.deckRenderPending, true, 'background refreshes are deferred until the gesture ends');
    assert.equal(renders, 0);
    handlers.pointermove(event(handle(cards[0]), 250, 790));
    frame();
    assert.ok(scrollTop > 0, 'holding near the viewport edge scrolls');
    const beforeCancel = saves;
    documentHandlers.keydown({ key: 'Escape' });
    assert.equal(ghost, null);
    assert.equal(capture, null);
    assert.equal(saves, beforeCancel, 'Escape cancels without saving');
    assert.equal(renders, 1, 'queued refreshes render once after cancellation');
    assert.equal(app.deckDragActive, false);
    assert.equal(app.deckRenderPending, false);

    handlers.pointerdown(event(handle(cards[0])));
    handlers.pointermove(event(handle(cards[0]), 250, 140));
    handlers.pointerup(event(handle(cards[0]), 250, 140));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ids(app.orderedDecks()), 'z,a,m', 'touch drop applies the target order');
    assert.equal(ghost, null);
    assert.equal(capture, null);

    handlers.pointerdown(event(handle(cards[0])));
    hit = cards[1];
    handlers.pointermove(event(handle(cards[0]), 250, 140));
    renderDecks.call(app);
    hit = cards[2];
    handlers.pointerup(event(handle(cards[0]), 620, 140));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ids(app.orderedDecks()), 'a,m,z', 'drop resolves the release position even before the next animation frame');
    assert.equal(app.deckRenderPending, false, 'dropping flushes a deferred refresh');

    handlers.pointerdown(event(handle(cards[2])));
    handlers.pointermove(event(handle(cards[2]), 210, 140));
    assert.ok(cards[0].classList.contains('drop-after'), 'a drop in the horizontal gap uses the neighboring insertion edge');
    handlers.pointerup(event(handle(cards[2]), 210, 140));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ids(app.orderedDecks()), 'a,z,m', 'dropping in a gap saves the relative placement');

    sandbox.getComputedStyle = () => ({ gridTemplateColumns: '200px' });
    cards.forEach((card, index) => {
        card.getBoundingClientRect = () => ({ left: 0, right: 200, top: 100 + index * 220,
            bottom: 300 + index * 220, width: 200, height: 200 });
    });
    grid.getBoundingClientRect = () => ({ left: 0, right: 200, top: 100, bottom: 740 });
    handlers.pointerdown(event(handle(cards[2])));
    handlers.pointermove(event(handle(cards[2]), 100, 310));
    assert.ok(cards[0].classList.contains('drop-after'), 'vertical row gaps also resolve to a relative insertion');
    handlers.pointercancel({ pointerId: 7 });
    handlers.pointerdown(event(handle(cards[2])));
    handlers.pointermove(event(handle(cards[2]), 100, 70));
    assert.ok(cards[0].classList.contains('drop-before'), 'near the grid edge permits placing before the first set');
    handlers.pointercancel({ pointerId: 7 });
    handlers.pointerdown(event(handle(cards[0])));
    handlers.pointermove(event(handle(cards[0]), 500, 500));
    assert.equal(cards.some(card => card.classList.contains('drop-before') || card.classList.contains('drop-after')), false,
        'dragging far outside the collection does not select an accidental destination');
    handlers.pointercancel({ pointerId: 7 });

    handlers.pointerdown(event(handle(cards[0])));
    handlers.pointermove(event(handle(cards[0]), 250, 140));
    const beforePointerCancel = saves;
    handlers.pointercancel({ pointerId: 8 });
    assert.ok(ghost, 'another finger cancelling does not interrupt the active drag');
    handlers.pointercancel({ pointerId: 7 });
    assert.equal(ghost, null);
    assert.equal(saves, beforePointerCancel, 'interrupted gestures do not save');
    assert.match(source('styles.css'), /\.deck-drag-handle\s*\{[^}]*touch-action:\s*none/);
    const animations = [];
    cards.forEach(card => { card.animate = (keyframes, options) => animations.push({ keyframes, options }); });
    sandbox.window.matchMedia = () => ({ matches: false });
    app.animateDeckPositions(grid, new Map([
        ['z', { left: 0, top: 220 }],
        ['a', { left: 0, top: 0 }],
        ['m', { left: 0, top: 440 }]
    ]));
    assert.equal(animations.length, 2, 'only displaced sets animate; unchanged sets stay steady');
    assert.equal(animations[0].keyframes[0].transform, 'translate(0px, 220px)');
    assert.equal(animations[0].keyframes[1].transform, 'translate(0, 0)');
    assert.equal(animations[0].options.duration, 180, 'placement settles with a subtle short transition');
    sandbox.window.matchMedia = () => ({ matches: true });
    app.animateDeckPositions(grid, new Map([['z', { left: 0, top: 220 }]]));
    assert.equal(animations.length, 2, 'reduced motion skips reorder animations');
    console.log('deck-order tests passed');
})().catch(error => { console.error(error); process.exit(1); });

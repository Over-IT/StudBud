const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { FlashcardTools: tools, SM2Engine } = require('../flashcardEngine.js');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

assert.equal(tools.gradeAnswer('  Photosynthesis! ', 'photosynthesis', true), true);
assert.equal(tools.gradeAnswer('photosyntheis', 'photosynthesis', true), false);
assert.equal(tools.gradeAnswer('photosyntheis', 'photosynthesis', false), true);
assert.equal(tools.gradeAnswer('cafe', 'café', false), true);
for (const [given, expected] of [['-12', '12'], ['3.5', '35'], ['not soluble', 'soluble'],
    ['ab', 'ac'], ['mitosis', 'meiosis'], ['x + 1', 'x - 1'], ['positive', 'negative'], ['1,000', '1.000'], ['−12', '12']]) {
    assert.equal(tools.gradeAnswer(given, expected, false), false, `lenient grading protects ${expected}`);
}
const card = { id: 'one', front: 'Plant energy process', back: 'Photosynthesis', tags: ['biology'],
    distractors: ['Respiration', 'respiration!', 'Photosynthesis', ''] };
const pool = [card, { back: 'Cell division', front: 'Cell growth', tags: ['biology'] },
    { back: 'Capital city', front: 'Geography' }, { back: 'Respiration', front: 'Energy process' }];
assert.deepEqual(tools.distractors(card, pool, 3).map(item => item.back), ['Respiration', 'Cell division', 'Capital city']);
assert.equal(new Set(tools.distractors(card, pool, 3).map(item => tools.answerKey(item.back))).size, 3);
const weak = { id: 'weak', practiceStats: { attempts: 20, correct: 2, missStreak: 3 } };
const strong = { id: 'strong', practiceStats: { attempts: 20, correct: 20, missStreak: 0 } };
assert.ok(tools.weight(weak) > tools.weight(strong) * 3);
let seed = 5, weakFirst = 0;
const random = Math.random;
Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
try {
    for (let i = 0; i < 4000; i++) {
        const order = tools.adaptiveOrder([strong, weak]);
        assert.equal(new Set(order).size, 2, 'adaptive rounds retain full coverage');
        if (order[0] === weak) weakFirst++;
    }
} finally { Math.random = random; }
assert.ok(weakFirst > 2800 && weakFirst < 3900, `weaker cards prioritized without starving others: ${weakFirst}/4000`);
assert.equal(tools.imageSource('javascript:alert(1)'), '');
assert.equal(tools.imageSource('data:image/svg+xml;base64,PHN2Zz4='), '');
const image = 'data:image/png;base64,aGVsbG8=';
assert.equal(tools.imageSource(image), image);
const definition = { back: 'Plants convert light energy into chemical energy using chlorophyll.', answerMode: 'keywords',
    keywords: tools.keywordGroups('light energy | sunlight\nchemical energy\nchlorophyll') };
assert.equal(tools.gradeCard('Using chlorophyll, sunlight becomes chemical energy.', definition), true);
assert.equal(tools.gradeCard('Chlorophyll converts sunlight.', definition), false, 'every concept is required');
assert.equal(tools.gradeCard('Not sunlight converted to chemical energy with chlorophyll.', definition), false);
assert.equal(tools.gradeCard('chlorophyllish converts sunlight into chemical energy', definition), false, 'keywords are whole words');
const negative = { back: 'It is not soluble in water.', keywords: [['soluble'], ['water']], answerMode: 'keywords' };
assert.equal(tools.matchesKeywords(negative.back, negative), true, 'negative definitions can be saved');
assert.equal(tools.gradeCard('soluble in water', negative), false, 'cannot omit negation');
assert.equal(tools.gradeCard('never soluble in water', negative), true);
const quantity = { back: 'Water boils at 100 degrees.', keywords: [['degrees']], answerMode: 'keywords' };
assert.equal(tools.gradeCard('At 100 degrees water boils.', quantity), true);
assert.equal(tools.gradeCard('Water boils at 50 degrees.', quantity), false);
assert.equal(tools.gradeCard('Water boils at degrees.', quantity), false);
assert.equal(tools.gradeCard('Temperature is -100 degrees.', quantity), false);
assert.equal(tools.gradeCard('x - 2', { back: 'x + 2', keywords: [['x']], answerMode: 'keywords' }), false);
assert.equal(tools.gradeCard('gato', { back: 'cat', answerMode: 'exact', acceptedAnswers: ['gato'] }), true);
assert.equal(tools.gradeCard('photosyntheis', { back: 'photosynthesis', answerMode: 'exact' }, false), false, 'card rules override global defaults');
assert.equal(tools.gradeCard('photosyntheis', { back: 'photosynthesis', answerMode: 'vocabulary' }, true), true);
assert.throws(() => tools.keywordGroups('light||sunlight'));
const attachment = { name: 'notes.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,aGVsbG8=' };
assert.equal(tools.attachmentSource(attachment), attachment.data);
for (const bad of [{ ...attachment, type: 'text/html' }, { ...attachment, data: 'javascript:alert(1)' },
    { ...attachment, data: 'data:audio/wav;base64,aGVsbG8=' }, { ...attachment, name: '' }]) assert.equal(tools.attachmentSource(bad), '');
tools.recordAnswer(weak, false);
assert.equal(weak.practiceStats.attempts, 21);
assert.equal(weak.practiceStats.missStreak, 4);
tools.recordAnswer(weak, true);
assert.equal(weak.practiceStats.correct, 3);
assert.equal(weak.practiceStats.missStreak, 0);
{
    const practiced = {};
    for (const expected of [.25, .5, .75, 1]) {
        tools.recordAnswer(practiced, true, 'recall');
        assert.equal(tools.cardProgress(practiced).mastery, expected, 'every correct practice answer builds mastery');
    }
    tools.recordAnswer(practiced, false);
    assert.equal(tools.cardProgress(practiced).mastery, .75);
    assert.equal(tools.cardProgress(practiced).weak, false, 'exactly 75% is not weak');
    tools.recordAnswer(practiced, false);
    assert.equal(tools.cardProgress(practiced).weak, true);
    const oldWeak = { practiceStats: { attempts: 100, correct: 2, missStreak: 20 } };
    assert.equal(tools.cardProgress(oldWeak).weak, true);
    for (let i = 0; i < 4; i++) tools.recordAnswer(oldWeak, true, 'recall');
    assert.equal(tools.cardProgress(oldWeak).mastery, 1, 'old misses do not permanently lock a recovered card at low mastery');
    assert.equal(tools.cardProgress(oldWeak).weak, false);
    assert.equal(oldWeak.practiceStats.attempts, 104, 'lifetime attempt counts remain intact');
    assert.equal(oldWeak.practiceStats.recentAnswers.length, 4, 'recent-answer storage is bounded');
    assert.ok(tools.weight(oldWeak) < tools.weight(weak), 'adaptive drills recognize recovered cards');
    const recovered = { practiceStats: { attempts: 1000, correct: 0 } };
    const declining = { practiceStats: { attempts: 1000, correct: 1000 } };
    tools.recordAnswer(recovered, true, 'recall');
    tools.recordAnswer(declining, false, 'recall');
    assert.equal(tools.cardProgress(recovered).accuracy, 1, 'recent progress matters immediately, before four new answers');
    assert.equal(tools.cardProgress(declining).accuracy, 0, 'a recent miss is not hidden by a long successful history');
    assert.ok(tools.weight(declining) > tools.weight(recovered), 'question selection responds immediately to recent performance');
    tools.recordAnswer(declining, false, 'recall');
    assert.equal(tools.cardProgress(declining).weak, true, 'two recent misses flag a previously strong term');
    for (let i = 0; i < 4; i++) tools.recordAnswer(declining, true, 'recall');
    assert.equal(tools.cardProgress(declining).weak, false, 'recovery removes the weak flag while retaining lifetime totals');
    assert.equal(declining.practiceStats.attempts, 1006);
    assert.equal(tools.cardProgress({ practiceStats: { attempts: 100, correct: 90, recentAnswers: ['bad', false] } }).accuracy, 0);
    assert.equal(tools.cardProgress({ practiceStats: { attempts: 2, correct: 2 } }).mastery, .25, 'unknown legacy practice counts conservatively as recognition');
    const recognition = {};
    for (let i = 0; i < 8; i++) tools.recordAnswer(recognition, true, 'recognition');
    assert.equal(tools.cardProgress(recognition).mastery, .5, 'recognition alone cannot imply full recall');
    for (let i = 0; i < 4; i++) tools.recordAnswer(recognition, true, 'recall');
    assert.equal(tools.cardProgress(recognition).mastery, 1, 'recent successful recall replaces recognition evidence');
    assert.equal(recognition.practiceStats.recentEvidence.length, 4);
    assert.equal(tools.cardProgress({ interval: 21 }).mastery, 1, 'legacy scheduled mastery remains available without answer stats');
    assert.equal(tools.cardProgress({ repetitions: 1 }).mastery, .5);
    assert.equal(tools.cardProgress({}).mastery, 0);
}

const nodes = new Map();
const state = { flashcards: [{ id: 'deck', title: 'Biology', cards: [
    { id: 'a', front: 'Plant process', back: 'Photosynthesis', answerImage: image, distractors: ['Respiration'] },
    { id: 'b', front: 'Cell process', back: 'Respiration' }
] }], courses: [], assignments: [] };
class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.classList = { add() {}, remove() {} }; this.innerHTML = ''; }
    append(...items) { this.children.push(...items); }
    addEventListener(event, handler) { this[event] = handler; }
    focus() {}
    querySelector(selector) { return selector === '.practice-test-review' ? this.review ||= new Element('div') : null; }
}
nodes.set('arcade-game-title', new Element('h3'));
nodes.set('arcade-game-content', new Element('div'));
const sandbox = {
    console, Math, Date, Map, Set, setTimeout: callback => callback(), window: { FlashcardTools: tools, crypto: require('node:crypto').webcrypto },
    FormData: class { constructor(form) { this.data = form.values; } get(key) { return this.data[key] ?? null; } },
    document: { getElementById: id => nodes.get(id), createElement: tag => new Element(tag), addEventListener() {} },
    AppState: { get: key => state[key], saveFlashcardDeck: async deck => { state.flashcards[0] = deck; } }
};
vm.createContext(sandbox);
const appSource = source('app.js');
vm.runInContext(appSource.slice(appSource.indexOf('    class AppOrchestrator'), appSource.indexOf('    window.NexusApp ='))
    + '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
const app = sandbox.app;
vm.runInContext(source('multiplayerEngine.js'), sandbox);
app.renderPracticeTestQuestion = () => {};
app.finishArcadeStudySession = () => {};
app.beginPracticeTest({ values: { deckId: 'deck', mcCount: '1', typeCount: '1', matchCount: '0', feedback: 'exam', grading: 'lenient', adaptive: 'on' } });
assert.equal(app.practiceTestOptions.exam, true);
assert.equal(app.practiceTestOptions.strict, false);
assert.equal(app.practiceTestCards.length, 2);

async function run() {
    {
        const original = state.flashcards;
        const deck = { id: 'shared-progress', communitySourceId: 'public-set', title: 'Shared Spanish', cards: [{ id: 'hola', front: 'hola', back: 'hello' }] };
        state.flashcards = [deck];
        sandbox.window.SM2Engine = SM2Engine;
        app.activeDeckId = deck.id;
        const renderStudyCard = app.renderStudyCard;
        app.renderStudyCard = () => {};
        app.studySession = SM2Engine.createSession(deck.cards, { deck, includeAll: true });
        app.currentStudyCard = app.studySession.next();
        await app.rateCurrentCard(4);
        assert.equal(app.deckMastery(state.flashcards[0]).pct, 25, 'scheduled Study immediately updates shared-deck mastery');
        const schedule = SM2Engine.migrate(deck.cards[0]);
        app.studySession = null; app.studyCards = [deck.cards[0]]; app.activeCardIndex = 0;
        app.currentStudyCard = deck.cards[0];
        await app.rateCurrentCard(4);
        assert.equal(app.deckMastery(state.flashcards[0]).pct, 50, 'Cram adds to the same mastery');
        assert.deepEqual(SM2Engine.migrate(deck.cards[0]), schedule, 'Cram still leaves the review schedule unchanged');
        app.renderStudyCard = renderStudyCard;
        state.flashcards = original;
    }
    app.practiceTestCards = [state.flashcards[0].cards[0]];
    app.practiceTestQuestionTypes = ['written'];
    app.arcadeQuestionIndex = 0;
    const form = { dataset: { questionType: 'written' }, values: { answer: 'wrong' }, replaceWith(...items) { this.result = items; } };
    await app.submitPracticeTestAnswer(form);
    assert.equal(app.practiceTestAnswers.length, 1);
    assert.equal(form.result[0].textContent, 'Answer recorded.');
    assert.equal(form.result[0].innerHTML, '', 'exam feedback does not disclose answers or images');
    await app.submitPracticeTestAnswer(form);
    assert.equal(app.practiceTestAnswers.length, 1, 'duplicate submissions do not record twice');
    assert.equal(state.flashcards[0].cards[0].practiceStats.attempts, 1);
    app.renderPracticeTestResults();
    assert.ok(nodes.get('arcade-game-content').innerHTML.includes('practice-retry-missed'));
    const review = nodes.get('arcade-game-content').review;
    assert.ok(review.children[0].children[3].innerHTML.includes('flashcard-answer-image'), 'answer images appear in end-of-exam review');
    app.retryMissedPracticeCards();
    assert.equal(app.practiceTestCards.length, 1);
    assert.equal(app.practiceTestCards[0].id, 'a');
    assert.equal(app.practiceTestQuestionTypes[0], 'written');
    app.practiceTestOptions.exam = false;
    const studyForm = { dataset: { questionType: 'written' }, values: { answer: 'photosyntheis' }, replaceWith(...items) { this.result = items; } };
    await app.submitPracticeTestAnswer(studyForm);
    assert.equal(app.practiceTestAnswers[0].correct, true);
    assert.ok(studyForm.result[0].innerHTML.includes('flashcard-answer-image'));
    assert.equal(state.flashcards[0].cards[0].practiceStats.attempts, 2);
    assert.equal(state.flashcards[0].cards[0].practiceStats.correct, 1);
    assert.ok(app.assessmentStudyButton({ id: 'test', kind: 'test' }).includes('Create study set'));
    state.flashcards[0].assessmentId = 'test';
    assert.ok(app.assessmentStudyButton({ id: 'test', kind: 'test' }).includes('Open study set'));
    assert.equal(app.assessmentStudyButton({ id: 'work', kind: 'assignment' }), '');
    assert.ok(app.studySetMarkup({ deckId: 'deck' }).includes('open-study-set'));
    app.communityDeckActionMarkup = id => `<button data-public="${id}">Add to your sets</button>`;
    assert.ok(app.studySetMarkup({ title: 'Shared set', publicId: 'public-deck' }).includes('Add to your sets'));
    assert.ok(!app.studySetMarkup({ title: 'Private set' }).includes('Add to your sets'));
    state.flashcards[0].communitySourceId = 'public-deck';
    const reviewElement = { dataset: { reviewPublicId: 'public-deck', reviewTitle: 'Shared set' }, outerHTML: '' };
    sandbox.document.querySelectorAll = selector => selector.startsWith('.review-study-set') ? [reviewElement] : [];
    app.refreshCommunityDeckActions();
    assert.ok(reviewElement.outerHTML.includes('open-study-set'), 'imported review set switches to an open action');
    sandbox.window.StudBudCloud = { user: { id: 'owner' } };
    assert.equal(app.roomStudyDeck({ host_id: 'other', deck_title: 'Biology', state: {} }), null, 'matching titles cannot link an unrelated guest deck');
    assert.equal(app.roomStudyDeck({ host_id: 'owner', state: { source_deck_id: 'deck' } }).id, 'deck');
    assert.equal(app.roomStudyDeck({ host_id: 'other', state: { public_deck_id: 'public-deck' } }).id, 'deck');
    const progress = { attempts: 20, correct: 2, missStreak: 3 };
    const session = { practice: false, cards: [], api: { getCards: async () => [{ front: 'Plant process', back: 'Photosynthesis' }] } };
    const Session = sandbox.window.StudBudArcade.Session.prototype;
    await Session.loadCards.call(session, [{ ...state.flashcards[0].cards[0], practiceStats: progress }]);
    assert.equal(session.cards[0].practiceStats.attempts, 20, 'hosted questions inherit private historical accuracy');
    assert.equal(session.cards[0].answerImage, undefined, 'historical accuracy merge does not copy private media');
    Object.assign(session, {
        question: { card: session.cards[0], options: ['Photosynthesis'] }, lastCardIndex: 0,
        questionStats: new Map(), questionHistory: [], answered: 0, correct: 0,
        overlay: { querySelector: () => ({ querySelectorAll: () => [], querySelector: () => ({}) }) },
        sfx() {}, closeQuestion() { this.question = null; }
    });
    let progressSession;
    sandbox.window.NexusApp = { saveGameProgress: async current => { progressSession = current; } };
    Session.answerQuestion.call(session, 0);
    assert.equal(progressSession, session, 'game answers request immediate persistence without waiting for match results');
    assert.equal(progressSession.questionHistory.length, 1, 'the answer is recorded before requesting persistence');
    assert.equal(session.questionStats.get(0).attempts, 21, 'first game answer retains historical attempts');
    assert.equal(session.questionStats.get(0).correct, 3);
    assert.equal(progress.attempts, 20, 'session tracking leaves saved progress untouched until answer persistence');
    console.log('Custom and related choices, private image guards, strict/lenient grading, adaptive accuracy, study/exam feedback, missed retries and assessment/review links passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

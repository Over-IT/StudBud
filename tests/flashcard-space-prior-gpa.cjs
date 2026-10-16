const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// Run the real priorGPA/withPriorGPA methods from app.js against a stubbed profile.
{
    const start = app.indexOf('        priorGPA(profile');
    const end = app.indexOf('        usesCategoryWeights(course)');
    assert.ok(start > 0 && end > start, 'prior GPA helpers exist in app.js');
    const sandbox = { profile: {} };
    vm.createContext(sandbox);
    const Gpa = vm.runInContext(`const AppState = { get: () => profile }; (class { ${app.slice(start, end)} })`, sandbox);
    const gpa = new Gpa();
    const tracked = { totalCredits: 6, weighted: '4.5', unweighted: '4' };

    sandbox.profile = {};
    assert.equal(JSON.stringify(gpa.withPriorGPA(tracked)), JSON.stringify({ ...tracked, trackedCredits: 6, priorCredits: 0 }), 'no past credits leaves the GPA unchanged');
    sandbox.profile = { priorCredits: 0, priorWeightedGpa: 3, priorUnweightedGpa: 3 };
    assert.equal(gpa.withPriorGPA(tracked).weighted, '4.5', 'zero past credits are ignored');
    sandbox.profile = { priorCredits: 6, priorWeightedGpa: '' , priorUnweightedGpa: 3 };
    assert.equal(gpa.priorGPA(), null, 'an incomplete past GPA is ignored');

    sandbox.profile = { priorCredits: 14, priorWeightedGpa: 3.5, priorUnweightedGpa: 3.2 };
    const blended = gpa.withPriorGPA(tracked);
    assert.equal(blended.totalCredits, 20);
    assert.equal(blended.trackedCredits, 6);
    assert.equal(blended.priorCredits, 14);
    assert.ok(Math.abs(Number(blended.weighted) - (4.5 * 6 + 3.5 * 14) / 20) < 1e-9, 'weighted GPA is credit-weighted');
    assert.ok(Math.abs(Number(blended.unweighted) - (4 * 6 + 3.2 * 14) / 20) < 1e-9, 'unweighted GPA is credit-weighted');

    const empty = gpa.withPriorGPA({ totalCredits: 0, weighted: '0', unweighted: '0' });
    assert.equal(Number(empty.weighted), 3.5, 'with no tracked classes the past GPA is the cumulative GPA');
    assert.equal(Number(empty.unweighted), 3.2);
}

// Settings inputs and profile persistence for past credits.
{
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    for (const id of ['settings-prior-credits', 'settings-prior-weighted', 'settings-prior-unweighted']) {
        assert.ok(html.includes(`id="${id}"`), `${id} input exists`);
        assert.ok(app.includes(`'${id}'`), `${id} is read and saved by app.js`);
    }
    for (const key of ['priorCredits', 'priorWeightedGpa', 'priorUnweightedGpa']) assert.ok(app.includes(key), `${key} is stored on the profile`);
}

// Space while studying only ever flips the card, never activates a focused rating/star button.
{
    const handler = app.slice(app.indexOf("const studying = Router.activeRoute === 'flashcard'"));
    const space = handler.slice(0, handler.indexOf('if (studying && !this.studyKeyBusy)'));
    assert.ok(space.includes("event.key === ' ' || event.code === 'Space'"), 'Space is matched by key and code');
    assert.ok(space.includes('event.preventDefault()'), 'Space default (button click / page scroll) is always suppressed');
    assert.ok(/if \(!event\.repeat && !this\.studyKeyBusy\) this\.revealCard\(\)/.test(space), 'held or mid-rating Space never double-flips or rates');
    assert.ok(!space.includes('rateCurrentCard') && !space.includes('nextCard'), 'Space cannot advance to the next card');
    assert.ok(!/studying = [^;]*closest\('button/.test(space), 'Space flips even when a study button has focus');
    const keyup = app.slice(app.indexOf("document.addEventListener('keyup'"), app.indexOf("document.addEventListener('submit'"));
    assert.ok(keyup.includes("#active-study-area button") && keyup.includes('preventDefault'), 'Space keyup cannot click a focused study button');
}

// The optional study direction asks with the definition and grades/reveals the term instead.
{
    const start = app.indexOf('        studyDirection() {');
    const end = app.indexOf('        renderStudyFaces(card, delayBack)');
    assert.ok(start > 0 && end > start, 'study direction helpers exist in app.js');
    const store = new Map();
    const sandbox = vm.createContext({
        localStorage: { getItem: key => store.get(key) ?? null },
        Math,
        window: { FlashcardTools: { imageSource: value => value || '' } }
    });
    const Study = vm.runInContext(`(class { escapeHTML(v) { return String(v); } cardAnswerMarkup(c) { return 'A:' + c.back; } cardAttachmentMarkup() { return ''; } ${app.slice(start, end)} })`, sandbox);
    const study = new Study();
    const card = { front: 'Term', back: 'Definition' };
    assert.equal(study.studyDirection(), 'front', 'term-first remains the default');
    assert.deepEqual(JSON.parse(JSON.stringify(study.studyFaces(card, false))), { question: 'Term', answer: 'A:Definition' });
    store.set('studbud-study-direction', 'back');
    assert.equal(study.pickStudyReversed(), true, 'Definition mode always reverses');
    assert.deepEqual(JSON.parse(JSON.stringify(study.studyFaces(card, true))), { question: 'Definition', answer: 'Term' });
    store.set('studbud-study-direction', 'nonsense');
    assert.equal(study.pickStudyReversed(), false, 'invalid saved values fall back to term-first');
    store.set('studbud-study-direction', 'mixed');
    const picks = new Set(Array.from({ length: 60 }, () => study.pickStudyReversed()));
    assert.equal(picks.size, 2, 'Mixed mode asks with both sides');
    assert.ok(/gradeAnswer\(given, card\.front \|\| '', false\)/.test(app), 'reversed typed answers are graded against the term');
    assert.ok(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').includes('id="study-direction"'), 'Ask with selector is in the study toolbar');
}

// Stray clicks, drags and long-presses cannot highlight app text, while typing fields stay selectable.
{
    const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
    assert.match(css, /html, body \{[^}]*user-select: none[^}]*-webkit-tap-highlight-color: transparent[^}]*-webkit-touch-callout: none/);
    assert.match(css, /input, textarea, select, \[contenteditable\][^{]*\{[^}]*user-select: text/);
    assert.ok(app.includes("document.addEventListener('selectstart'") && app.includes("document.addEventListener('dragstart'"), 'selection/drag guards are installed');
}

console.log('Prior-credit GPA blending, settings persistence, consistent flashcard Space flipping, Ask-with direction and no-accidental-selection passed.');

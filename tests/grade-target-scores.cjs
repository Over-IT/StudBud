const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const state = { courses: [], assignments: [], settings: {}, profile: {} };
const nodes = new Map();
const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
        value: '', innerHTML: '', textContent: '', disabled: false,
        classList: { remove() {} }, setAttribute() {}
    });
    return nodes.get(id);
};
const sandbox = {
    console, Date, Math, Map, Set, window: {},
    document: { addEventListener() {}, querySelectorAll: () => [], getElementById: node },
    AppState: {
        get: key => state[key],
        saveGradeGoals(courses, settings) { state.courses = courses; state.settings = settings; }
    }
};
vm.createContext(sandbox);
for (const file of ['parkwayData.js', 'gpaCalculator.js']) vm.runInContext(read(file), sandbox);
const source = read('app.js');
vm.runInContext(source.slice(source.indexOf('    function localDateKey'), source.indexOf('    window.NexusApp ='))
    + '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
const app = sandbox.app;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const course = { code: 'math', title: '<Math>', credits: 1, categories: [] };
const scored = (id, earned, maxPoints, extra = {}) => ({
    id, courseCode: 'math', title: id, graded: true, pointsEarned: earned, maxPoints, ...extra
});
const future = (id, maxPoints, extra = {}) => ({
    id, courseCode: 'math', title: id, kind: 'test', graded: false, status: 'pending', maxPoints, ...extra
});
const required = (items, target, assignments, c = course) => app.requiredCourseScore(c, items, target, assignments);

const exam = future('exam', 100);
let assignments = [scored('past', 80, 100), exam];
let result = required([exam], 90, assignments);
assert.equal(result.status, 'attainable');
close(result.requiredPct, 100);
close(result.maximum, 90);
assert.equal(required([exam], 91, assignments).status, 'impossible');
assert.equal(required([exam], 40, assignments).status, 'already-secured');
assert.equal(required([exam], NaN, assignments).status, 'no-target');
assert.equal(required([], 90, assignments).status, 'no-work');
assert.equal(required([future('unknown', '')], 90, assignments).status, 'unknown-points');
for (const points of [0, -10, null, undefined, Infinity, 'invalid']) {
    assert.equal(required([future('invalid', points)], 90, assignments).status, 'unknown-points');
}
assert.equal(required([exam], 90, assignments).maxPoints, 100, 'the same saved item is not counted twice');
assert.equal(required([exam], 75, [exam]).requiredPct, 75, 'no scored work uses the real first assessment');
assert.equal(required([future('other', 100, { courseCode: 'other' })], 90, assignments).status, 'no-work');
assert.equal(required([{ ...exam, dismissed: true }], 90, assignments).status, 'no-work');
assert.equal(required([scored('graded', 0, 100)], 90, assignments).status, 'no-work', 'a graded zero is not future points');
const waiting = future('waiting', 100, { status: 'completed' });
assert.equal(required([waiting], 90, [scored('past', 80, 100), waiting]).status, 'attainable', 'awaiting grades are included without a new work action');
const multi = [future('short', 10), future('long', 90)];
result = required(multi, 85, [scored('past', 80, 100), ...multi]);
close(result.requiredPct, 90);
close(result.maxPoints, 100);
const malformed = [scored('bad', 'invalid', 100), scored('negative', 999, -1), scored('valid', 8, 10)];
close(app.calculateCourseGrade(course, malformed), 80);
close(app.calculateCourseGrade(course, [scored('past', 80, 100), scored('bonus', 10, 0)]), 90);
close(required([exam], 90, [scored('past', 80, 100), scored('bonus', 10, 0), exam]).requiredPct, 90);

const weighted = {
    ...course,
    categories: [{ id: 'tests', weight: 80 }, { id: 'hw', weight: 20 }, { id: 'ignored', weight: 0, excluded: true }]
};
const test = future('test', 100, { categoryId: 'tests' });
assignments = [
    scored('old-test', 70, 100, { categoryId: 'tests' }),
    scored('homework', 100, 100, { categoryId: 'hw' }), test
];
close(app.calculateCourseGrade(weighted, assignments), 76);
result = required([test], 84, assignments, weighted);
assert.equal(result.status, 'attainable');
close(result.requiredPct, 90);
close(result.maximum, 88);
assert.equal(required([test], 89, assignments, weighted).status, 'impossible');
// Activating a previously ungraded category changes the normalization denominator.
result = required([test], 80, [scored('homework', 100, 100, { categoryId: 'hw' }), test], weighted);
close(result.requiredPct, 75);
const hw = future('next-hw', 20, { categoryId: 'hw' });
result = required([test, hw], 84, [...assignments, hw], weighted);
const pct = result.requiredPct;
const simulated = assignments.filter(item => item.id !== test.id).concat(
    { ...test, graded: true, pointsEarned: pct },
    { ...hw, graded: true, pointsEarned: pct / 100 * 20 }
);
close(app.calculateCourseGrade(weighted, simulated), 84);
for (const item of [
    future('excluded', 100, { categoryId: 'ignored' }),
    future('uncategorized', 100),
    future('stale-category', 100, { categoryId: 'deleted' })
]) assert.equal(required([item], 90, assignments, weighted).status, 'no-work');
assert.equal(app.calculateCourseGrade(weighted, [scored('uncategorized', 100, 100)]), null,
    'a fully weighted course must not fall back to a points grade for zero-weight work');
const partial = { ...course, categories: [{ id: 'tests', weight: 60 }] };
result = required([exam], 90, [scored('old-test', 80, 100, { categoryId: 'tests' }), exam], partial);
assert.equal(result.status, 'impossible');
close(result.requiredPct, 105);
close(result.maximum, 88);
const excluded = { ...course, categories: [{ id: 'ignore', weight: 0, excluded: true }] };
close(app.calculateCourseGrade(excluded, [scored('valid', 9, 10), scored('excluded', 0, 100, { categoryId: 'ignore' })]), 90);

// Render only real saved work and make each assumption explicit.
assignments = [
    scored('past', 80, 100),
    future('<exam>', 100, { title: '<Exam>', dueDate: '2026-10-22' }),
    future('unknown', null),
    future('dismissed', 9999, { dismissed: true }),
    waiting
];
const before = JSON.stringify(assignments);
let markup = app.courseTargetGuidance({ ...course, targetPct: 90 }, assignments);
assert.match(markup, /2 saved ungraded items/);
assert.match(markup, /completed item awaiting a grade/);
assert.match(markup, /no valid possible points/);
assert.match(markup, /&lt;Exam&gt;/);
assert.match(markup, /data-id="&lt;exam&gt;"/);
assert.match(markup, /only this item is added/);
assert.match(markup, /not a final-semester prediction/);
assert.doesNotMatch(markup, /data-id="waiting"|data-id="dismissed"/);
assert.equal(JSON.stringify(assignments), before, 'projections never mutate real scores');
markup = app.courseTargetGuidance({ ...course, targetPct: 75 }, [scored('past', 80, 100), exam]);
assert.match(markup, /Currently meeting/);
assert.match(markup, /Need at least 70.00%/);
markup = app.courseTargetGuidance({ ...course, targetPct: 91 }, [scored('past', 80, 100), exam]);
assert.match(markup, /Not reachable with this work alone/);
markup = app.courseTargetGuidance({ ...course, targetPct: 40 }, [scored('past', 80, 100), exam]);
assert.match(markup, /Even 0%/);
assert.match(app.courseTargetGuidance(course, assignments), /Choose a target/);

// GPA preview, locks, cancellation and atomic apply retain their original contract.
state.courses = [
    { ...course, targetPct: 87.5, targetLocked: true },
    { ...course, code: 'science', title: 'Science', isWeighted: true, targetPct: 90 }
];
state.assignments = [scored('past', 80, 100), exam];
state.settings = { gradeGoalSource: 'gpa', gradeGoalWeight: 'weighted', gradeGoalGpa: 3.5 };
const saved = JSON.stringify(state);
app.openGradeGoals();
assert.equal(JSON.stringify(state), saved, 'opening and previewing do not save targets');
assert.equal(app.gpaGoalPreview.courses[0].targetPct, 87.5, 'preview preserves exact locked targets');
assert.equal(app.gpaGoalPreview.reachable, true);
assert.match(node('solver-output-percentage').textContent, /Targets are a plan, not earned grades/);
assert.match(node('solver-course-breakdown').innerHTML, /How to reach this class target/);
app.closeModal = () => {};
app.renderUI = () => {};
app.closeModal(); // Cancel without Apply: only the draft exists.
assert.equal(JSON.stringify(state), saved);
const desired = node('desired-gpa');
desired.value = '5';
app.solveTargetGPA();
assert.equal(node('apply-grade-goals-btn').disabled, true);
assert.equal(app.gpaGoalPreview.courses[0].targetPct, 87.5);
assert.throws(() => app.applyGradeGoals(), /reachable GPA/);
assert.equal(JSON.stringify(state), saved);
desired.value = '3.5';
app.solveTargetGPA();
app.applyGradeGoals();
assert.equal(state.courses[0].targetPct, 87.5);
assert.equal(state.courses[0].targetLocked, true);
assert.equal(state.settings.gradeGoalGpa, 3.5);
assert.equal(app.gpaGoalDraft, null);
// Grade-first mode calculates GPA without overwriting manually set percentages.
state.settings = { gradeGoalSource: 'grades', gradeGoalWeight: 'unweighted' };
app.openGradeGoals();
app.gpaGoalDraft.get('science').targetPct = 91.25;
app.solveTargetGPA();
assert.equal(node('desired-gpa').readOnly, true);
assert.equal(app.gpaGoalPreview.courses[1].targetPct, 91.25);
app.applyGradeGoals();
assert.equal(state.courses[1].targetPct, 91.25);
assert.equal(state.settings.gradeGoalSource, 'grades');
assert.equal(state.settings.gradeGoalGpa, null);
state.settings = { gradeGoalSource: 'gpa', gradeGoalWeight: 'weighted', gradeGoalGpa: 3 };
app.openGradeGoals();
const edit = (dataset, value, checked = false) => app.handleChange({
    target: { dataset, value, checked, matches: () => true, checkValidity: () => true }
});
edit({ goalGrade: 'science' }, '92.25');
assert.equal(app.gpaGoalDraft.get('science').targetLocked, true, 'editing a GPA suggestion locks the exact target');
assert.equal(app.gpaGoalPreview.courses[1].targetPct, 92.25);
edit({ goalGrade: 'science' }, '');
assert.equal(app.gpaGoalDraft.get('science').targetLocked, false, 'clearing a GPA target returns it to automatic balancing');
assert.equal(app.gpaGoalPreview.reachable, true);
edit({ goalLock: 'math' }, '', false);
assert.equal(app.gpaGoalPreview.courses[0].targetLocked, false, 'unlocking rebalances instead of preserving a stale fixed target');
assert.equal(state.courses[0].targetLocked, true, 'lock toggles remain preview-only until Apply');
// A class-card goal shortcut edits only the goal, independently of class metadata.
sandbox.AppState.updateCourse = (code, changes) => {
    state.courses = state.courses.map(course => course.code === code ? { ...course, ...changes } : course);
};
state.settings = { gradeGoalSource: 'grades' };
state.courses = [{
    code: 'goal', title: '<Goal class>', credits: 1, term: 'FY', isWeighted: true,
    categories: [{ id: 'tests', weight: 100 }], targetPct: null, icSectionIDs: ['123']
}];
const metadata = () => JSON.stringify(state.courses.map(({ targetPct, targetGrade, targetLocked, ...rest }) => rest));
const originalMetadata = metadata();
let opened;
app.openModal = id => { opened = id; };
const beforeGoal = JSON.stringify(state);
app.openCourseGoal('goal');
assert.equal(opened, 'course-goal-modal');
assert.equal(node('course-goal-name').textContent, '<Goal class>', 'class names are rendered as text');
assert.equal(node('course-goal-percent').value, '');
node('course-goal-percent').value = '92.25';
app.closeModal();
assert.equal(JSON.stringify(state), beforeGoal, 'canceling a goal dialog never saves');
app.saveCourseTarget('goal', '92.25');
assert.equal(state.courses[0].targetPct, 92.25);
assert.equal(metadata(), originalMetadata, 'saving a goal preserves all class metadata and Campus identity');
app.openCourseGoal('goal');
assert.equal(node('course-goal-percent').value, '92.25');
for (const invalid of ['NaN', '-1', '101', 'Infinity']) {
    const beforeInvalid = JSON.stringify(state);
    assert.throws(() => app.saveCourseTarget('goal', invalid), /target between/);
    assert.equal(JSON.stringify(state), beforeInvalid);
}
assert.throws(() => app.openCourseGoal('missing'), /no longer exists/);
assert.throws(() => app.saveCourseTarget('missing', '90'), /no longer exists/);
app.saveCourseTarget('goal', '0');
assert.equal(state.courses[0].targetPct, 0, 'zero is a valid goal, not an empty target');
app.saveCourseTarget('goal', ' ');
assert.equal(state.courses[0].targetPct, null);
assert.equal(state.courses[0].targetGrade, null);
assert.equal(state.courses[0].targetLocked, false);
state.settings = { gradeGoalSource: 'gpa', gradeGoalWeight: 'weighted', gradeGoalGpa: 3 };
app.saveCourseTarget('goal', '93.25');
assert.equal(state.courses[0].targetPct, 93.25, 'GPA balancing preserves the explicitly entered percentage');
assert.equal(state.courses[0].targetLocked, true);
assert.equal(metadata(), originalMetadata);
const html = read('index.html');
const goalDialog = html.slice(html.indexOf('<div id="course-goal-modal"'), html.indexOf('<div id="target-gpa-modal"'));
assert.match(goalDialog, /form="course-goal-form"/);
assert.match(goalDialog, /id="course-goal-percent"/);
assert.doesNotMatch(goalDialog, /id="course-(?:name|credits|term|manual-weighted)"/);
assert.match(source, /data-action="edit-course-goal"[^>]*aria-label="Edit grade target/);
assert.match(source, /action === 'edit-course-goal'\) this\.openCourseGoal\(id\)/);
assert.match(source, /form\.id === 'course-goal-form'\) this\.saveCourseTarget/);
console.log('Grade target scores: points, weights, partial categories, impossible/unknown work, guidance and GPA locks/preview/apply passed.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const state = { courses: [], assignments: [], flashcards: [], studyHistory: [], profile: {} };
const elements = new Map();
const sandbox = {
    console, Date, Math, Map, Set, window: {},
    document: { addEventListener() {}, getElementById: id => elements.get(id) || null },
    AppState: { get: key => state[key] }
};
vm.createContext(sandbox);
for (const file of ['pchsData.js', 'gpaCalculator.js', 'plannerEngine.js', 'flashcardEngine.js']) {
    vm.runInContext(source(file), sandbox, { filename: file });
}
const appSource = source('app.js');
vm.runInContext(appSource.slice(appSource.indexOf('    class AppOrchestrator'), appSource.indexOf('    window.NexusApp ='))
    + '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
const app = sandbox.app;
const close = (actual, expected) => assert.ok(Math.abs(Number(actual) - expected) < 1e-9, `${actual} should equal ${expected}`);
const course = { code: 'math', credits: 1, isWeighted: false };
const assignment = (earned, possible, categoryId) => ({ courseCode: 'math', pointsEarned: earned, maxPoints: possible, categoryId, graded: true, status: 'completed' });
close(app.calculateCourseGrade(course, [assignment(9, 10), assignment(50, 100)]), 59 / 110 * 100);
close(app.calculateCourseGrade(course, [assignment(0, 100), { ...assignment(100, 100), graded: false, status: 'pending' }]), 0);
assert.equal(app.calculateCourseGrade(course, []), null);
const categorized = { ...course, categories: [{ id: 'tests', weight: 70 }, { id: 'work', weight: 30 }] };
close(app.calculateCourseGrade(categorized, [assignment(80, 100, 'tests'), assignment(100, 100, 'work')]), 86);
close(app.calculateCourseGrade(categorized, [assignment(80, 100, 'tests')]), 80);
close(app.calculateCourseGrade({ ...course, categories: [{ id: 'tests', weight: 70 }] },
    [assignment(80, 100, 'tests'), assignment(100, 100)]), 86);
const gpa = sandbox.window.GPACalculator;
const mixed = gpa.calculateCurrentGPA([{ credits: .5, targetGrade: 'A+', isWeighted: true }, { credits: 1, targetGrade: 'B', isWeighted: false }]);
close(mixed.weighted, 5.5 / 1.5);
close(mixed.unweighted, 5 / 1.5);
assert.equal(mixed.totalCredits, 1.5);
assert.equal(app.gradeForPercentage(89.999), 'B+');
assert.equal(app.gradeForPercentage(96.999), 'A');
assert.equal(app.gradeForPercentage(100.5), 'A+');
assert.equal(app.formatNumber(87.123456), '87.12');
assert.equal(app.formatGpaChange(3.0001, 3.0002), '0.00 GPA points');

// Compare the optimized planner with exhaustive enumeration, including unequal credits.
function exhaustive(courses, target, mode) {
    let best = Infinity, maxGpa = 0;
    const totalCredits = courses.reduce((sum, row) => sum + row.credits, 0);
    function visit(index, earned, cost) {
        if (index === courses.length) {
            maxGpa = Math.max(maxGpa, earned / totalCredits);
            if (earned >= target * totalCredits - 1e-9) best = Math.min(best, cost);
            return;
        }
        for (const grade of sandbox.window.PCHS_GRADE_SCALE) {
            const row = courses[index];
            visit(index + 1, earned + Number(mode === 'weighted' && row.isWeighted ? grade.weighted : grade.unweighted) * row.credits, cost + grade.minPct);
        }
    }
    visit(0, 0, 0);
    return { best, maxGpa };
}
for (const courses of [
    [{ ...course, code: 'a' }, { ...course, code: 'b' }],
    [{ ...course, code: 'a', isWeighted: true, credits: .5 }, { ...course, code: 'b', credits: 1.5 }, { ...course, code: 'c', isWeighted: true, credits: .75 }]
]) for (const mode of ['weighted', 'unweighted']) for (const target of [0, 1.5, 2.75, 3.5, 4, 4.75, 5.5]) {
    const expected = exhaustive(courses, target, mode);
    const actual = app.gpaTargetPlan(target, mode, courses);
    assert.equal(actual.reachable, Number.isFinite(expected.best));
    if (actual.reachable) {
        const cost = [...actual.byCode.values()].reduce((sum, grade) => sum + grade.minPct, 0);
        assert.equal(cost, expected.best, `optimal target plan for ${mode}/${target}`);
        assert.ok(actual.gpa >= target - 1e-9);
    } else close(actual.gpa, expected.maxGpa);
}
assert.equal(app.gpaTargetPlan(3.5, 'unweighted', [course, { ...course, code: 'other' }]).gpa, 3.5);
assert.equal(app.gpaTargetPlan(3.5, 'weighted', []).reachable, false);
assert.equal(app.gpaTargetPlan(3.5, 'weighted', [{ ...course, credits: 0 }]).reachable, false);

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const dateKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
const planner = sandbox.window.PlannerEngine;
assert.equal(planner.calculatePriorityScore({ dueDate: dateKey }).daysRemaining, 1, 'local dates stay in the correct day');
assert.equal(planner.calculatePriorityScore({}).daysRemaining, 7, 'missing due dates are not due today');
assert.ok(planner.calculatePriorityScore({ dueDate: dateKey, priority: 'high' }).score
    > planner.calculatePriorityScore({ dueDate: dateKey, priority: 'none' }).score);

state.assignments = [{ id: 'quiz', title: 'Quiz', kind: 'quiz', dueDate: dateKey, estimatedMinutes: 30, importance: 3 }];
state.studyHistory = Array.from({ length: 4 }, () => ({ assignmentId: 'quiz', timestamp: new Date().toISOString(), durationSec: 20, effectiveness: 0, source: 'flashcards' }));
const recommendation = app.getStudyRecommendations()[0];
assert.equal(recommendation.minutesStudied, 1);
assert.equal(recommendation.flashcardMinutes, 1);
assert.equal(recommendation.averageEffectiveness, null);
assert.equal(recommendation.totalStudyMinutes, 45, 'unrated sessions must not inflate workload');
state.assignments[0].status = 'graded';
state.assignments[0].pointsEarned = 8;
state.assignments[0].maxPoints = 10;
assert.equal(app.getStudyRecommendations().length, 0, 'already graded tests are not recommended as future work');

for (const [a, b] of [['-2', '2'], ['1.5', '15'], ['2^3', '23'], ['x/y', 'xy']]) {
    assert.notEqual(app.answerKey(a), app.answerKey(b), 'math punctuation must not disappear');
}
assert.equal(app.answerKey(' NEW   York '), app.answerKey('new york'));
const cards = [{ front: 'Q', back: '-2' }, { front: 'Other', back: '-2' }, { front: 'Third', back: '2' }];
assert.equal(app.pickDistractorCards(cards[0], cards, 3).length, 1, 'duplicate normalized answers are not distractors');
assert.deepEqual([...app.shuffleCards([1, 2, 3, 4])].sort(), [1, 2, 3, 4]);

elements.set('study-analytics-summary', {});
elements.set('study-analytics-decks', {});
state.studyHistory = [{ durationSec: 20, gameSummary: { answered: 3, correct: 2 } }, { durationSec: 20 }];
state.flashcards = [{ title: '<Deck>', cards: [{ reps: 1, state: 'review', lapses: 2, lastReviewed: new Date().toISOString(), nextReviewDate: tomorrow.toISOString() }] }];
app.renderStudyAnalytics();
assert.match(elements.get('study-analytics-summary').innerHTML, /66\.67%/);
assert.match(elements.get('study-analytics-decks').innerHTML, /&lt;Deck&gt;/);
assert.match(elements.get('study-analytics-decks').innerHTML, /1 reviewed · 2 lapses/);
console.log('Grade categories, precision-preserving GPA, exhaustive optimal target plans, priorities, study totals, answer normalization and real analytics passed.');

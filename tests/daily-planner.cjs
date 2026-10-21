const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const nodes = new Map();
const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
        id, value: '', innerHTML: '', textContent: '', dataset: {}, disabled: false,
        classList: { toggle() {} }, setAttribute() {}, focus() {}, querySelectorAll: () => []
    });
    return nodes.get(id);
};
const state = { courses: [{ code: 'math', title: '<Math>' }], assignments: [], settings: {}, studyHistory: [] };
const sandbox = {
    console, Date, Math, Set, Map, window: {}, document: {
        addEventListener() {}, querySelectorAll: () => [], activeElement: null,
        getElementById: id => nodes.get(id) || null, querySelector: () => node('previous-day')
    }, AppState: {
        get: key => state[key], set: (key, value) => { state[key] = value; },
        updateAssignment(id, updates) { Object.assign(state.assignments.find(item => item.id === id), updates); }
    }, Router: { activeRoute: 'planner', navigate(route) { this.activeRoute = route; } }
};
vm.createContext(sandbox);
vm.runInContext(read('plannerEngine.js'), sandbox);
const engine = sandbox.window.PlannerEngine;
const day = '2026-10-20';
const task = (id, extra = {}) => ({ id, title: id, open: true, remainingMinutes: 30, ...extra });
const plan = (tasks, extra = {}) => engine.dailyPlan(tasks, { date: day, today: day, budget: 90, ...extra });
const ids = result => Array.from(result.queue, task => task.id);

assert.equal(engine.dateNumber('2026-02-30'), NaN);
assert.equal(engine.dateNumber('2026-11-02') - engine.dateNumber('2026-11-01'), 1, 'DST days are calendar days');
assert.deepEqual(Array.from(engine.period('2026-11-01', 'week').days), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
assert.equal(engine.period('2028-02-20', 'month').days.length, 29, 'leap months retain every date');
assert.equal(engine.shiftPeriod('2026-01-31', 'month', 1), '2026-02-28', 'month navigation clamps instead of skipping February');
assert.equal(engine.shiftPeriod('2026-11-01', 'week', 1), '2026-11-08', 'week navigation is DST-safe');
assert.equal(engine.shiftPeriod('2026-01-01', 'day', -1), '2025-12-31');
assert.throws(() => engine.period('bad', 'week'), /valid planner/);
assert.throws(() => engine.period(day, 'year'), /valid planner/);
{
    const agenda = engine.agenda([
        task('due', { dueDate: '2026-10-21', plannedDate: '2026-10-20' }),
        task('same-day', { dueDate: day, plannedDate: day }),
        task('old', { dueDate: '2026-10-01' }),
        task('done', { dueDate: day, open: false }),
        task('other-month', { dueDate: '2026-11-01' })
    ], [{ id: 'afternoon', date: day, time: '15:00' }, { id: 'all-day', date: day, time: '' }], { date: day, today: day, scope: 'week' });
    const selected = agenda.days.find(entry => entry.date === day);
    assert.deepEqual(Array.from(selected.due, task => task.id), ['same-day', 'done'], 'the agenda includes completion without treating it as open work');
    assert.deepEqual(Array.from(selected.planned, task => task.id), ['due'], 'work dates appear separately, without duplicating a same-day deadline');
    assert.deepEqual(Array.from(selected.events, event => event.id), ['all-day', 'afternoon']);
    assert.equal(agenda.focus[0].id, 'old', 'overdue work stays visible outside the selected week');
    assert.ok(!agenda.focus.some(task => ['done', 'other-month'].includes(task.id)));
    const past = engine.agenda([task('old', { dueDate: '2026-10-01' })], [], { date: '2026-10-01', today: day });
    assert.equal(past.focus.length, 0, 'past agenda dates do not invent historical work suggestions');
}
assert.throws(() => plan([], { date: 'bad' }), /valid day/);
for (const budget of [0, 14, 481, 20.5, NaN]) assert.throws(() => plan([], { budget }), /15 to 480/);
assert.deepEqual(ids(plan([])), []);
assert.deepEqual(ids(plan([
    task('future', { dueDate: '2026-11-20' }),
    task('done', { open: false, dueDate: day }),
    task('zero', { remainingMinutes: 0 }),
    task('waiting', { open: false, icMissing: true })
])), [], 'completed work, zero-remaining optional work and far deadlines are not invented as today tasks');

let result = plan([
    task('tomorrow', { dueDate: '2026-10-21', score: 999 }),
    task('today', { dueDate: day, remainingMinutes: 120, plannedDate: '2026-10-25' }),
    task('late', { dueDate: '2026-10-19', remainingMinutes: 90 }),
    task('missing', { dueDate: '2099-01-01', icMissing: true, remainingMinutes: 0 }),
    task('planned', { plannedDate: day, remainingMinutes: 20 })
], { budget: 15 });
assert.deepEqual(ids(result), ['late', 'today', 'missing', 'planned'], 'all deadlines and chosen tasks remain even when the budget is full');
assert.equal(result.overBudget, 215);
assert.equal(result.urgentCount, 3);
assert.match(result.queue.find(task => task.id === 'today').reason, /does not move the deadline/);
assert.ok(result.later.some(task => task.id === 'tomorrow'), 'overflow remains discoverable');
assert.equal(new Set(ids(result)).size, result.queue.length);

result = plan([
    task('later-plan', { plannedDate: '2026-10-21', dueDate: '2026-10-25' }),
    task('carry', { plannedDate: '2026-10-19', dueDate: '2026-10-25' }),
    task('quiz', { kind: 'quiz', dueDate: '2026-10-23', remainingMinutes: 90 }),
    task('project', { dueDate: '2026-10-24', remainingMinutes: 240 })
], { budget: 65 });
assert.deepEqual(ids(result), ['carry', 'quiz', 'project']);
assert.equal(result.queue.at(-1).minutes, 5, 'suggestions use only the remaining available time');
assert.equal(result.remainingMinutes, 65);
assert.equal(result.later[0].id, 'later-plan', 'a chosen future work date is respected');
assert.match(result.queue[0].reason, /earlier day/);

const quizBefore = plan([task('quiz', { kind: 'test', dueDate: '2026-10-23', remainingMinutes: 90 })]);
const quizAfter = plan([task('quiz', { kind: 'test', dueDate: '2026-10-23', remainingMinutes: 75, dayMinutes: 15 })], { studiedMinutes: 15 });
assert.equal(quizBefore.queue[0].minutes, 30);
assert.equal(quizAfter.queue[0].minutes, 15, 'a study checkpoint reduces the same block instead of creating another');
assert.equal(plan([task('quiz', { kind: 'test', dueDate: '2026-10-23', remainingMinutes: 60, dayMinutes: 30 })]).queue.length, 0);
assert.equal(plan([task('quiz', { kind: 'test', dueDate: day, remainingMinutes: 0 })]).queue.length, 1, 'finishing estimated prep never completes the actual assessment');
assert.equal(plan([task('small')], { budget: 30, studiedMinutes: 25 }).queue[0].minutes, 5);
assert.equal(plan([task('small')], { budget: 30, studiedMinutes: 30 }).queue.length, 0);
assert.equal(plan(Array.from({ length: 12 }, (_, i) => task(String(i), { remainingMinutes: 1 }))).queue.length, 5, 'automatic plans stay small');
assert.equal(plan(Array.from({ length: 12 }, (_, i) => task(String(i), { dueDate: day }))).queue.length, 12, 'the small-plan cap never hides deadlines');

const source = read('app.js');
vm.runInContext(source.slice(source.indexOf('    function localDateKey'), source.indexOf('    window.NexusApp ='))
    + '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
const app = sandbox.app;
app.calculateCourseGrade = () => null;
const today = new Date();
const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
state.assignments = [
    { id: 'homework', title: '<Homework>', courseCode: 'math', status: 'pending', graded: false, dueDate: todayKey, estimatedMinutes: 45 },
    { id: 'done', title: 'Finished', courseCode: 'math', status: 'completed', graded: false, completedAt: todayKey }
];
state.studyHistory = [
    { id: 'today', assignmentId: 'homework', timestamp: new Date().toISOString(), durationSec: 900 },
    { id: 'old', assignmentId: 'homework', timestamp: '2000-01-01T12:00:00', durationSec: 300 },
    { id: 'invalid', timestamp: 'not a date', durationSec: 9999 }
];
for (const id of ['planner-day-queue', 'planner-date', 'planner-daily-minutes', 'planner-day-heading', 'planner-day-description',
    'planner-day-summary', 'planner-upcoming-list', 'planner-day-completed', 'planner-active-work', 'planner-library-count', 'planner-plan-status']) node(id);
app.renderDailyPlanner();
assert.match(node('planner-day-queue').innerHTML, /&lt;Homework&gt;/);
assert.match(node('planner-day-queue').innerHTML, /&lt;Math&gt;/);
assert.doesNotMatch(node('planner-day-queue').innerHTML, /<Homework>|<Math>|Finished/);
assert.match(node('planner-day-queue').innerHTML, /planner-start-work/);
assert.match(node('planner-day-completed').innerHTML, /Finished this day \(1\)/);
assert.equal(app.dailyPlannerModel().studiedMinutes, 15);
assert.equal(app.dailyPlannerModel().queue[0].remaining, 25, 'remaining estimates use lifetime work while the daily budget uses only this day');
assert.match(node('planner-day-queue').innerHTML, /<details class="planner-card-details"[^>]*><summary[^>]*>Details &amp; options/);
assert.ok(node('planner-day-queue').innerHTML.indexOf('edit-assignment') > node('planner-day-queue').innerHTML.indexOf('planner-card-details'),
    'editing and time management are progressively disclosed instead of crowding the primary actions');
const savedAssignments = state.assignments;
state.assignments = Array.from({ length: 6 }, (_, i) => ({
    id: `deadline-${i}`, title: `Deadline ${i}`, courseCode: 'math', status: 'pending', graded: false, dueDate: todayKey, estimatedMinutes: 5
}));
app.renderDailyPlanner();
assert.doesNotMatch(node('planner-day-queue').innerHTML, /planner-remaining/, 'urgent deadlines are never hidden in the more-tasks disclosure');
assert.equal((node('planner-day-queue').innerHTML.match(/class="planner-day-card/g) || []).length, 6);
state.assignments = Array.from({ length: 6 }, (_, i) => ({
    id: `planned-${i}`, title: `Planned ${i}`, courseCode: 'math', status: 'pending', graded: false, plannedDate: todayKey, estimatedMinutes: 5
}));
app.renderDailyPlanner();
assert.match(node('planner-day-queue').innerHTML, /3 more planned tasks/);
assert.equal((node('planner-day-queue').innerHTML.split('planner-remaining')[0].match(/class="planner-day-card/g) || []).length, 3);
state.assignments = savedAssignments;
app.renderDailyPlanner();
assert.throws(() => app.handleChange({ target: { id: 'planner-date', value: 'bad' } }), /valid planner date/);
app.handleChange({ target: { id: 'planner-date', value: '2026-01-01' } });
assert.equal(app.selectedPlannerDate(), '2026-01-01', 'digital planner can browse past dates');
app.plannerDate = '';
assert.throws(() => app.handleChange({ target: { id: 'planner-daily-minutes', value: '5' } }), /15 to 480/);
app.handleChange({ target: { id: 'planner-daily-minutes', value: '45' } });
assert.equal(state.settings.plannerDailyMinutes, 45);
assert.equal(app.selectedPlannerDate(), todayKey);

async function run() {
    let renders = 0, flushed = false;
    app.renderAssignments = () => { renders++; };
    await app.handleDataAction('planner-add-to-day', 'homework');
    assert.equal(state.assignments[0].plannedDate, todayKey);
    assert.equal(state.assignments[0].dueDate, todayKey, 'work dates never mutate due dates');
    await app.handleDataAction('planner-clear-date', 'homework');
    assert.equal(state.assignments[0].plannedDate, '');
    await app.handleDataAction('toggle-assignment', 'homework');
    assert.equal(state.assignments[0].completedAt, todayKey);
    await app.handleDataAction('toggle-assignment', 'homework');
    assert.equal(state.assignments[0].completedAt, null);
    await assert.rejects(app.handleDataAction('planner-add-to-day', 'gone'), /no longer open/);
    assert.equal(renders, 2);
    app.renderFocusSprint = app.refreshAutomaticStudy = () => {};
    await app.handleDataAction('planner-start-work', 'homework');
    assert.equal(sandbox.Router.activeRoute, 'planner', 'working from the plan stays in Planner');
    assert.equal(app.dashboardSprintAssignmentId, 'homework');
    app.flushAutomaticStudy = async () => { throw new Error('Storage full'); };
    await assert.rejects(app.handleDataAction('planner-stop-work'), /Storage full/);
    assert.equal(app.dashboardSprintAssignmentId, 'homework', 'failed saves cannot silently discard the active task');
    app.flushAutomaticStudy = async () => { flushed = true; };
    await app.handleDataAction('planner-stop-work');
    assert.equal(flushed, true);
    assert.equal(app.dashboardSprintAssignmentId, '');
    let confirmed = true, notices = [];
    sandbox.window.StudBudDialogs = { confirm: async () => confirmed, notify: text => notices.push(text) };
    const overdue = { id: 'too-late', title: 'Old homework', courseCode: 'math', dueDate: '2000-01-01',
        status: 'pending', graded: false, pointsEarned: 0, maxPoints: 20, estimatedMinutes: 60 };
    state.assignments.push(overdue);
    assert.match(app.assignmentStatusControl(overdue), /dismiss-assignment/);
    confirmed = false;
    await app.handleDataAction('dismiss-assignment', overdue.id);
    assert.equal(overdue.dismissed, undefined, 'cancel does not change saved work');
    confirmed = true;
    app.dashboardSprintAssignmentId = overdue.id;
    app.flushAutomaticStudy = async () => { throw new Error('Save failed'); };
    await assert.rejects(app.handleDataAction('dismiss-assignment', overdue.id), /Save failed/);
    assert.equal(overdue.dismissed, undefined, 'unsaved study time prevents dismissing active work');
    app.flushAutomaticStudy = async () => {};
    await app.handleDataAction('dismiss-assignment', overdue.id);
    assert.equal(overdue.dismissed, true);
    assert.equal(app.dashboardSprintAssignmentId, '');
    assert.equal(app.assignmentState(overdue), 'dismissed');
    assert.equal(app.isOpenAssignment(overdue), false);
    assert.equal(overdue.status, 'pending');
    assert.equal(overdue.graded, false);
    assert.equal(overdue.pointsEarned, 0);
    assert.equal(overdue.completedAt, undefined);
    assert.equal(app.assignmentTimeProgress(overdue).pct, 0, 'dismissal is not fake study completion');
    assert.ok(!app.plannerTasks().some(item => item.id === overdue.id), 'dismissed work stays out of every planner span');
    assert.match(app.assignmentStatusControl(overdue), /restore-assignment/);
    const dismissedTest = { ...overdue, kind: 'test', dueDate: '2999-01-01' };
    assert.equal(app.assessmentStudyButton(dismissedTest), '', 'dismissed assessments do not prompt new study sets');
    state.assignments.push({ ...dismissedTest, id: 'dismissed-test' });
    assert.ok(!app.deckAssessmentOptionsIds().includes('dismissed-test'));
    assert.doesNotMatch(app.deckAssessmentOptions(), /value="dismissed-test"/);
    assert.match(app.deckAssessmentOptions('', 'dismissed-test'), /\(dismissed\)/, 'existing study-set links are retained and clearly labeled');
    await app.handleDataAction('restore-assignment', overdue.id);
    assert.equal(overdue.dismissed, false);
    assert.equal(app.isOpenAssignment(overdue), true);
    await app.handleDataAction('dismiss-assignment', 'homework');
    assert.match(notices.at(-1), /Only overdue/);
    console.log('Daily Planner: deadline visibility, realistic budgets, work dates, carried work, study blocks, date boundaries, saved progress, escaping and in-place tracking passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

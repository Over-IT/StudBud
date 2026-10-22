const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const nodes = new Map();
const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
        id, value: '', innerHTML: '', textContent: '', dataset: {}, disabled: false,
        classList: { toggle() {} }, setAttribute() {}, focus() {}, querySelectorAll: () => [],
        addEventListener(type, handler) { (this.listeners ||= {})[type] = handler; }
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
for (const budget of [-1, 481, 20.5, NaN]) assert.throws(() => plan([], { budget }), /0 to 480/);
{
    const availability = { plannerDailyMinutes: 90, plannerWorkdays: [1, 2, 3, 4, 5],
        plannerWeekdayMinutes: { 2: 30, 3: 60 } };
    assert.equal(engine.availableMinutes({}, day), 90, 'existing users keep the daily 90-minute default');
    assert.equal(engine.availableMinutes(availability, day), 30, 'weekday-specific minutes override the default');
    assert.equal(engine.availableMinutes(availability, '2026-10-22'), 90);
    assert.equal(engine.availableMinutes(availability, '2026-10-24'), 0, 'weekends can be days off');
    assert.equal(engine.availableMinutes({ ...availability, plannerWorkdays: [] }, day), 0, 'no selected workdays is valid');
    assert.equal(engine.availableMinutes({ ...availability, plannerDayMinutes: { '2026-10-24': 20 } }, '2026-10-24'), 20,
        'a date-specific override can enable an otherwise excluded workday');
    assert.equal(engine.availableMinutes({ ...availability, plannerDayMinutes: { '2026-10-19': 0 } }, day), 30,
        'yesterday overrides do not carry into today');
    const weekly = { ...availability, plannerWeekMinutes: { '2026-10-19': 40 } };
    assert.equal(engine.availableMinutes(weekly, day), 40, 'a week override replaces weekday preferences');
    assert.equal(engine.availableMinutes(weekly, '2026-10-24'), 0, 'a week override respects days off');
    assert.equal(engine.availableMinutes(weekly, '2026-10-27'), 30, 'week overrides never leak into another week');
    assert.equal(engine.availableMinutes({ ...weekly, plannerDayMinutes: { [day]: 15 } }, day), 15, 'day overrides take priority over week overrides');
    assert.throws(() => engine.availableMinutes({ plannerDailyMinutes: -1 }, day), /0 to 480/);
    assert.throws(() => engine.availableMinutes({ plannerWorkdays: [7] }, day), /valid study days/);
    const study = task('weighted-time', { kind: 'test', dueDate: '2026-10-22', remainingMinutes: 90 });
    const distributed = plan([study], { budget: 30, availability });
    assert.equal(distributed.queue[0].minutes, 30, '30 of 90 available minutes gets a third of the remaining study');
    const weighted = plan([study], { budget: 60,
        availability: { ...availability, plannerWeekdayMinutes: { 2: 60, 3: 30 } } });
    assert.equal(weighted.queue[0].minutes, 60,
        'the larger-availability day gets two thirds of the 90-minute preparation, not equal calendar-day shares');
    const checkpoint = plan([{ ...study, remainingMinutes: 75, dayMinutes: 15 }], { budget: 60, studiedMinutes: 15,
        availability: { ...availability, plannerWeekdayMinutes: { 2: 60, 3: 30 } } });
    assert.equal(checkpoint.queue[0].minutes, 45, 'logging work reduces the same availability-weighted block');
    const fridayOnly = { plannerDailyMinutes: 90, plannerWorkdays: [5] };
    assert.equal(plan([study], { budget: 0, availability: fridayOnly }).queue.length, 0, 'days off produce no flexible suggestions');
    assert.equal(plan([task('deadline', { dueDate: day })], { budget: 0 }).queue.length, 1, 'days off never hide deadlines');
    assert.equal(plan([task('chosen', { plannedDate: day })], { budget: 0 }).queue.length, 1, 'explicit work dates remain visible');
}
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
    'planner-day-summary', 'planner-upcoming-list', 'planner-day-completed', 'planner-active-work', 'planner-library-count', 'planner-plan-status',
    'planner-availability', 'planner-weekday-controls', 'planner-current-minutes', 'planner-availability-status',
    'planner-time-label', 'planner-time-hint', 'today-study-total', 'today-study-by-class']) node(id);
app.renderDailyPlanner();
assert.match(node('planner-day-queue').innerHTML, /&lt;Homework&gt;/);
assert.match(node('planner-day-queue').innerHTML, /&lt;Math&gt;/);
assert.doesNotMatch(node('planner-day-queue').innerHTML, /<Homework>|<Math>|Finished/);
assert.match(node('planner-day-queue').innerHTML, /planner-start-work/);
assert.match(node('planner-day-completed').innerHTML, /Finished this day \(1\)/);
assert.equal(app.dailyPlannerModel().studiedMinutes, 15);
assert.equal(app.dailyPlannerModel().queue[0].remaining, 45, 'ordinary assignments keep their work estimate instead of subtracting old study sessions');
assert.doesNotMatch(node('planner-day-queue').innerHTML, /min studied/,
    'ordinary assignment cards never show study minutes');
assert.match(node('planner-day-queue').innerHTML, /Log offline work/);
state.studyHistory.push({ id: 'actual-work', assignmentId: 'homework', activityType: 'work', timestamp: new Date().toISOString(), durationSec: 600 });
app.renderDailyPlanner();
assert.equal(app.dailyPlannerModel().workMinutes, 10);
assert.equal(app.dailyPlannerModel().studiedMinutes, 25, 'both work and study consume the daily time budget');
assert.equal(app.dailyPlannerModel().queue[0].remaining, 35, 'only actual work reduces ordinary assignment estimates');
assert.match(node('planner-day-summary').innerHTML, /15m<\/strong><span>studied/);
assert.match(node('planner-day-summary').innerHTML, /10m<\/strong><span>worked/);
assert.match(node('planner-day-queue').innerHTML, /10 min worked/);
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
const automatic = Array.from(app.dailyPlannerModel().queue, task => task.id);
const estimates = Object.fromEntries(app.dailyPlannerModel().queue.map(task => [task.id, task.minutes]));
assert.equal(app.dailyPlannerModel().manualOrder, false);
assert.match(node('planner-day-queue').innerHTML, /draggable="true" data-planner-drag=/);
app.reorderPlannerTasks(automatic[4], automatic[0]);
assert.deepEqual(Array.from(app.dailyPlannerModel().queue, task => task.id), [automatic[4], ...automatic.filter(id => id !== automatic[4])]);
assert.deepEqual(Object.fromEntries(app.dailyPlannerModel().queue.map(task => [task.id, task.minutes])), estimates, 'reordering never reallocates minutes');
assert.equal(app.dailyPlannerModel().manualOrder, true);
assert.match(node('planner-day-queue').innerHTML, /Use automatic order/);
assert.doesNotMatch(node('planner-day-queue').innerHTML, /planner-remaining/, 'all manually ordered tasks remain reachable');
assert.deepEqual(Array.from(state.settings.plannerTaskOrder[todayKey]), Array.from(app.dailyPlannerModel().queue, task => task.id), 'the order is persisted in settings, not just DOM');
const reloaded = Object.create(Object.getPrototypeOf(app));
reloaded.calculateCourseGrade = app.calculateCourseGrade;
assert.deepEqual(Array.from(reloaded.dailyPlannerModel().queue, task => task.id), Array.from(app.dailyPlannerModel().queue, task => task.id), 'a new app instance restores saved order');
assert.equal(app.dailyPlannerModel('2999-01-01').manualOrder, false, 'custom priorities are scoped to a single date');
const keyHandle = { dataset: { plannerDrag: automatic[4] } };
node('planner-day-queue').listeners.keydown({ target: { closest: () => keyHandle }, key: 'ArrowDown', preventDefault() {} });
assert.equal(app.dailyPlannerModel().queue[1].id, automatic[4], 'keyboard movement uses the same persisted ordering');
state.assignments.find(task => task.id === automatic[4]).status = 'completed';
assert.ok(!app.dailyPlannerModel().queue.some(task => task.id === automatic[4]), 'completed tasks disappear without breaking saved order');
state.assignments.push({ id: 'new-task', title: 'New', courseCode: 'math', status: 'pending', plannedDate: todayKey, estimatedMinutes: 5 });
assert.equal(app.dailyPlannerModel().queue.at(-1).id, 'new-task', 'new tasks follow existing custom priorities');
assert.throws(() => app.reorderPlannerTasks('gone', automatic[0]), /plan changed/);
assert.throws(() => app.reorderPlannerTasks(automatic[0], automatic[1], false, '2000-01-01'), /day changed/);
const saveSettings = sandbox.AppState.set;
sandbox.AppState.set = () => { throw Error('Storage full'); };
assert.throws(() => app.reorderPlannerTasks(automatic[0], automatic[1]), /Storage full/, 'save errors are not reported as success');
sandbox.AppState.set = saveSettings;
app.resetPlannerOrder();
assert.equal(state.settings.plannerTaskOrder[todayKey], undefined);
assert.equal(app.dailyPlannerModel().manualOrder, false);
assert.doesNotMatch(node('planner-day-queue').innerHTML, /Use automatic order/);
const queueNode = node('planner-day-queue'), listeners = queueNode.listeners;
const dragIds = Array.from(app.dailyPlannerModel().queue, task => task.id);
const targetCard = { dataset: { plannerTask: dragIds[1] }, getBoundingClientRect: () => ({ top: 0, height: 100 }),
    classList: { add() {} }, closest() { return this; } };
const dragHandle = { dataset: { plannerDrag: dragIds[0] }, setPointerCapture() {}, closest() { return this; } };
queueNode.contains = () => true;
sandbox.document.elementFromPoint = () => targetCard;
listeners.pointerdown({ target: dragHandle, pointerType: 'touch', pointerId: 7, button: 0 });
listeners.pointerup({ pointerId: 7, clientX: 10, clientY: 80 });
assert.equal(app.dailyPlannerModel().queue[1].id, dragIds[0], 'touch dragging persists placement after the target');
app.resetPlannerOrder();
listeners.pointerdown({ target: dragHandle, pointerType: 'touch', pointerId: 8, button: 0 });
listeners.pointercancel({ pointerId: 8 });
listeners.pointerup({ pointerId: 8, clientX: 10, clientY: 80 });
assert.equal(app.dailyPlannerModel().manualOrder, false, 'canceled touch drags never change priorities');
const transfer = { setData(type, value) { this[type] = value; } };
listeners.dragstart({ target: dragHandle, dataTransfer: transfer });
listeners.pointercancel({ pointerId: 9 });
listeners.drop({ preventDefault() {}, clientX: 10, clientY: 80 });
assert.equal(transfer['text/plain'], dragIds[0]);
assert.equal(app.dailyPlannerModel().queue[1].id, dragIds[0], 'native dragging survives the browser pointer cancellation when drag begins');
app.resetPlannerOrder();
state.assignments = savedAssignments;
app.renderDailyPlanner();
assert.throws(() => app.handleChange({ target: { id: 'planner-date', value: 'bad' } }), /valid planner date/);
app.handleChange({ target: { id: 'planner-date', value: '2026-01-01' } });
assert.equal(app.selectedPlannerDate(), '2026-01-01', 'digital planner can browse past dates');
app.plannerDate = '';
assert.throws(() => app.handleChange({ target: { id: 'planner-daily-minutes', value: '-1' } }), /0 to 480/);
assert.throws(() => app.handleChange({ target: { id: 'planner-daily-minutes', value: '' } }), /0 to 480/);
app.handleChange({ target: { id: 'planner-daily-minutes', value: '45' } });
assert.equal(state.settings.plannerDailyMinutes, 45);
app.handleChange({ target: { id: 'planner-current-minutes', value: '20' } });
assert.equal(state.settings.plannerDayMinutes[todayKey], 20);
assert.equal(app.dailyPlannerModel().budget, 20);
app.handleChange({ target: { id: 'planner-current-minutes', value: '' } });
assert.equal(app.dailyPlannerModel().budget, 45, 'clearing the today override restores the default');
const todayWeekday = new Date(`${todayKey}T12:00:00`).getDay();
app.handleChange({ target: { id: `planner-weekday-${todayWeekday}`, value: '60' } });
assert.equal(app.dailyPlannerModel().budget, 60);
app.handleChange({ target: { id: `planner-workday-${todayWeekday}`, value: '', checked: false } });
assert.equal(app.dailyPlannerModel().budget, 0);
app.handleChange({ target: { id: 'planner-current-minutes', value: '30' } });
assert.equal(app.dailyPlannerModel().budget, 30, 'a manual override takes precedence over a day off');
app.handleChange({ target: { id: 'planner-current-minutes', value: '' } });
app.handleChange({ target: { id: `planner-workday-${todayWeekday}`, value: '', checked: true } });
app.handleChange({ target: { id: `planner-weekday-${todayWeekday}`, value: '' } });
assert.equal(app.dailyPlannerModel().budget, 45);
assert.equal(state.settings.plannerAvailabilityConfigured, true);
assert.equal(app.selectedPlannerDate(), todayKey);
app.plannerScope = 'week';
app.plannerDate = '2026-01-01';
app.openPlannerTime();
assert.equal(app.plannerScope, 'day');
assert.equal(app.selectedPlannerDate(), todayKey);
assert.equal(sandbox.Router.activeRoute, 'planner', 'Try it brings you to the actual time input');
app.plannerScope = 'week';
app.renderDailyPlanner();
assert.match(node('planner-time-label').textContent, /per workday this week/);
app.handleChange({ target: { id: 'planner-current-minutes', value: '80' } });
assert.equal(app.dailyPlannerModel().budget, 80);
app.plannerScope = 'day';
app.handleChange({ target: { id: 'planner-current-minutes', value: '25' } });
assert.equal(app.dailyPlannerModel().budget, 25);
app.handleChange({ target: { id: 'planner-current-minutes', value: '' } });
assert.equal(app.dailyPlannerModel().budget, 80, 'clearing a day override restores the week override');
app.plannerScope = 'week';
app.handleChange({ target: { id: 'planner-current-minutes', value: '' } });
assert.equal(app.dailyPlannerModel().budget, 45, 'clearing a week override restores saved preferences');
app.plannerScope = 'day';
app.renderTodayStudyPlan();
assert.doesNotMatch(node('today-study-total').textContent, /NaN|undefined/);
state.settings.plannerDayMinutes[todayKey] = 0;
app.plannerDate = '2026-10-01';
app.renderTodayStudyPlan();
assert.match(node('today-study-total').textContent, /0 available minutes/,
    'Home uses today availability even when Planner is browsing a different date');
delete state.settings.plannerDayMinutes[todayKey];
app.plannerDate = '';
app.openPlannerAvailability();
assert.equal(sandbox.Router.activeRoute, 'settings', 'detailed workday controls live in preferences');

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

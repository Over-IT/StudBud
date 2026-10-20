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
for (const file of ['parkwayData.js', 'data/schools/central.js', 'data/schools/north.js', 'data/schools/south.js', 'data/schools/west.js', 'gpaCalculator.js', 'plannerEngine.js', 'flashcardEngine.js']) {
    vm.runInContext(source(file), sandbox, { filename: file });
}
const appSource = source('app.js');
vm.runInContext(appSource.slice(appSource.indexOf('    function localDateKey'), appSource.indexOf('    window.NexusApp ='))
    + '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
const app = sandbox.app;
{
    const ids = ['calendar-days', 'calendar-month-label', 'calendar-selected-label', 'calendar-agenda-list',
        'calendar-event-form', 'calendar-event-id', 'calendar-event-title', 'calendar-event-date', 'calendar-event-time',
        'calendar-event-notes', 'delete-calendar-event-btn'];
    for (const id of ids) elements.set(id, { innerHTML: '', textContent: '', value: '', reset() {}, classList: { toggle() {} } });
    const oldSchedule = app.getScheduleEntries, oldModal = app.openModal;
    const oldSet = sandbox.AppState.set;
    sandbox.AppState.state = state;
    sandbox.AppState.set = (key, value) => { state[key] = value; };
    sandbox.window.crypto = { randomUUID: () => 'calendar-fixture' };
    app.openModal = id => assert.equal(id, 'calendar-event-modal');
    app.getScheduleEntries = () => ({ pattern: null, entries: [], note: '' });
    app.calendarDate = new Date(2026, 9, 18);
    app.selectedCalendarDate = '2026-10-18';
    state.assignments = [
        { id: 'work', title: 'Homework only', dueDate: '2026-10-18' },
        { id: 'quiz', title: 'Quiz only', kind: 'quiz', dueDate: '2026-10-18' },
        { id: 'test', title: 'Test only', kind: 'TEST', dueDate: '2026-10-18', status: 'completed' }
    ];
    state.calendarEvents = [];
    app.openCalendarEvent();
    assert.equal(elements.get('calendar-event-date').value, '2026-10-18');
    elements.get('calendar-event-title').value = '<Club meeting>';
    elements.get('calendar-event-time').value = '15:30';
    elements.get('calendar-event-notes').value = '<Bring notes>';
    app.saveCalendarEvent();
    assert.equal(state.calendarEvents.length, 1);
    assert.equal(state.assignments.length, 3, 'personal events never become assignments');
    const markup = elements.get('calendar-agenda-list').innerHTML;
    const sections = markup.split('<section class="calendar-agenda-group">');
    assert.match(sections[1], /Homework only/);
    assert.doesNotMatch(sections[1], /Quiz only|Test only/);
    assert.match(sections[2], /Quiz only/);
    assert.match(sections[2], /Log study/);
    assert.match(sections[3], /&lt;Club meeting&gt;/);
    assert.match(sections[3], /15:30/);
    assert.match(sections[3], /&lt;Bring notes&gt;/);
    assert.match(elements.get('calendar-days').innerHTML, /1 assignments, 2 quizzes\/tests, 1 events/);
    app.openCalendarEvent(state.calendarEvents[0].id);
    elements.get('calendar-event-title').value = 'Updated meeting';
    elements.get('calendar-event-time').value = '';
    app.saveCalendarEvent();
    assert.equal(state.calendarEvents.length, 1, 'editing updates instead of duplicating an event');
    assert.match(elements.get('calendar-agenda-list').innerHTML, /All day/);
    elements.get('calendar-event-date').value = '2026-02-30';
    assert.throws(() => app.saveCalendarEvent(), /valid date/);
    elements.get('calendar-event-date').value = '2026-10-18';
    const previous = state.calendarEvents;
    sandbox.AppState.set = (key, value) => { state[key] = value; throw new Error('Storage full'); };
    assert.throws(() => app.saveCalendarEvent(), /Storage full/);
    assert.equal(state.calendarEvents, previous, 'failed saves restore the prior event list');
    sandbox.AppState.set = (key, value) => { state[key] = value; };
    app.saveCalendarEvents([]);
    app.renderCalendar();
    assert.match(elements.get('calendar-agenda-list').innerHTML, /No events/);
    assert.throws(() => app.openCalendarEvent('missing'), /no longer exists/);
    state.assignments = []; state.calendarEvents = [];
    app.getScheduleEntries = oldSchedule; app.openModal = oldModal; sandbox.AppState.set = oldSet;
    for (const id of ids) elements.delete(id);
    console.log('Calendar assignment/assessment separation, event create/edit/delete, escaping, date validation and save-failure retention passed.');
}
{
    const next = { innerHTML: '' };
    elements.set('planner-next-task', next);
    state.assignments = [
        { id: 'task', title: '<Read chapter>', estimatedMinutes: 25, priority: 'high', dueDate: '2000-01-01' },
        { id: 'later', title: 'Practice', estimatedMinutes: 15, dueDate: '2099-01-01' },
        { id: 'done', title: 'Finished', status: 'completed', estimatedMinutes: 500 }
    ];
    app.renderAssignments();
    assert.match(next.innerHTML, /2 to do/);
    assert.match(next.innerHTML, /40 min estimated total/);
    assert.match(next.innerHTML, /1 due today or overdue/);
    assert.match(next.innerHTML, /&lt;Read chapter&gt;/, 'task titles are escaped');
    assert.doesNotMatch(next.innerHTML, /Finished/);
    assert.equal(app.plannerTaskMinutes({ estimatedMinutes: -4 }), 30);
    assert.match(app.plannerTaskReason(state.assignments[0]), /Overdue/);
    assert.match(app.plannerTaskReason({ dueDate: '2099-01-01', priority: 'high' }), /Marked high priority/);
    assert.match(app.plannerTaskReason({ estimatedMinutes: 10 }), /short task/);
    assert.match(app.plannerTaskReason({}), /No due date/);
    assert.match(next.innerHTML, /Why this task:/);
    for (const id of ['assignment-body', 'planner-assessment-body', 'planner-study-list', 'quad-1-list']) elements.set(id, { innerHTML: '' });
    state.assignments.push(
        { id: 'quiz', title: '<Quiz prep>', kind: 'quiz', estimatedMinutes: 45, dueDate: '2099-01-01' },
        { id: 'test', title: 'Test prep', kind: 'TEST', estimatedMinutes: 90, dueDate: '2099-01-02' },
        { id: 'graded-test', title: 'Graded test', kind: 'test', graded: true, status: 'completed', pointsEarned: 8, maxPoints: 10 }
    );
    app.renderAssignments();
    assert.match(next.innerHTML, /2 to do/);
    assert.match(next.innerHTML, /40 min estimated total/, 'assignment workload excludes study preparation');
    assert.doesNotMatch(elements.get('assignment-body').innerHTML, /Quiz prep|Test prep|Graded test/);
    assert.match(elements.get('assignment-body').innerHTML, /Read chapter/);
    assert.match(elements.get('planner-assessment-body').innerHTML, /&lt;Quiz prep&gt;/);
    assert.match(elements.get('planner-assessment-body').innerHTML, /Graded test/, 'completed assessments remain manageable');
    assert.match(elements.get('planner-assessment-body').innerHTML, /delete-assignment/);
    assert.match(elements.get('planner-study-list').innerHTML, /&lt;Quiz prep&gt;/);
    assert.match(elements.get('planner-study-list').innerHTML, /Log offline study/);
    assert.match(elements.get('planner-study-list').innerHTML, /min today/);
    assert.doesNotMatch(elements.get('planner-study-list').innerHTML, /Read chapter|Graded test/);
    assert.doesNotMatch(elements.get('quad-1-list').innerHTML, /Quiz prep|Test prep/);
    state.assignments.push({ id: 'extra-quiz', title: '<Extra quiz>', kind: 'quiz', dueDate: '2099-01-03' });
    app.renderAssignments();
    const studyMarkup = elements.get('planner-study-list').innerHTML;
    assert.match(studyMarkup, /<details class="planner-more-study"><summary>More study suggestions \(1\)<\/summary>/);
    assert.equal((studyMarkup.slice(0, studyMarkup.indexOf('<details')).match(/class="study-priority-item"/g) || []).length, 2, 'only two suggestions expand by default');
    assert.match(studyMarkup, /&lt;Extra quiz&gt;/, 'additional suggestions are retained and escaped');
    state.assignments.pop();
    elements.set('assignment-search', { value: 'test prep' });
    app.renderAssignments();
    assert.doesNotMatch(elements.get('assignment-body').innerHTML, /Read chapter/);
    assert.match(elements.get('planner-assessment-body').innerHTML, /Test prep/);
    assert.doesNotMatch(elements.get('planner-assessment-body').innerHTML, /Quiz prep|Graded test/);
    elements.delete('assignment-search');
    state.assignments = [];
    app.renderAssignments();
    assert.match(next.innerHTML, /No open tasks/);
    assert.match(elements.get('planner-study-list').innerHTML, /Add an upcoming quiz or test/);
    assert.doesNotMatch(elements.get('planner-study-list').innerHTML, /data-action="add-quiz"/, 'planner uses its page-header add button instead of a duplicate empty-state action');
    elements.set('study-priority-list', { innerHTML: '' });
    app.renderStudyRecommendations('study-priority-list');
    assert.match(elements.get('study-priority-list').innerHTML, /data-action="add-quiz"/, 'other study surfaces retain their empty-state action');
    elements.delete('study-priority-list');
    for (const id of ['assignment-body', 'planner-assessment-body', 'planner-study-list', 'quad-1-list']) elements.delete(id);
    elements.delete('planner-next-task');
    const html = source('index.html');
    const tabs = [...html.matchAll(/data-multiplayer-tab="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(tabs, ['host', 'join', 'solo'], 'Singleplayer stays at the end of the game tabs');
    assert.doesNotMatch(html, /Practice settings|Start practice<\/|Practice awards no multiplayer coins/);
    const plannerMarkup = html.slice(html.indexOf('<section id="planner-view"'), html.indexOf('<section id="calendar-view"'));
    assert.match(plannerMarkup, /Quizzes &amp; tests/);
    assert.match(plannerMarkup, /aria-label="Filter assignments, quizzes and tests"/);
    assert.ok(plannerMarkup.indexOf('id="assignment-status-summary"') < plannerMarkup.indexOf('id="planner-assignment-heading"'), 'shared filters precede both work sections');
    assert.ok(plannerMarkup.indexOf('id="planner-next-task"') < plannerMarkup.indexOf('id="assignment-status-summary"'), 'next task is a suggestion above the filterable lists');
    assert.ok(plannerMarkup.indexOf('id="assignment-body"') < plannerMarkup.indexOf('id="planner-study-heading"'), 'the assessment list directly follows assignments');
    assert.ok(plannerMarkup.indexOf('id="planner-study-list"') < plannerMarkup.indexOf('id="assignment-status-summary"'), 'study suggestions stay above the filterable lists');
    assert.ok(plannerMarkup.indexOf('id="planner-assessment-body"') < plannerMarkup.indexOf('id="planner-grades-heading"'), 'the grade inbox has a separate place after work management');
    assert.match(plannerMarkup, /<details class="glass-card full-width planner-attention"/, 'optional urgency grouping is collapsed by default');
    assert.match(plannerMarkup, /data-action="planner-add-assignment"/);
    assert.match(plannerMarkup, /data-action="add-quiz"/);
    assert.ok(plannerMarkup.indexOf('id="planner-assessment-body"') < plannerMarkup.indexOf('id="planner-attention-heading"'), 'urgency groups follow both work sections');
    for (const id of ['planner-next-task', 'assignment-status-summary', 'assignment-search', 'assignment-course-filter', 'assignment-status-filter', 'assignment-result-count', 'assignment-body', 'planner-study-list', 'planner-assessment-body', 'quad-1-list', 'quad-2-list', 'quad-3-list', 'quad-4-list']) {
        assert.equal(plannerMarkup.split(`id="${id}"`).length - 1, 1, `${id} remains unique`);
    }
    assert.match(html, /id="assignment-status-filter" type="hidden" value="todo"/);
    assert.match(html, /id="delete-assignment-editor-btn"[^>]*data-action="delete-assignment"/);
    assert.match(appSource, /deleteButton\.classList\.toggle\('hidden', !assignment\)/, 'delete is available only when editing saved work');
}
const close = (actual, expected) => assert.ok(Math.abs(Number(actual) - expected) < 1e-9, `${actual} should equal ${expected}`);
const course = { code: 'math', credits: 1, isWeighted: false };
const assignment = (earned, possible, categoryId) => ({ courseCode: 'math', pointsEarned: earned, maxPoints: possible, categoryId, graded: true, status: 'completed' });
close(app.calculateCourseGrade(course, [assignment(9, 10), assignment(50, 100)]), 59 / 110 * 100);
close(app.calculateCourseGrade(course, [assignment(0, 100), { ...assignment(100, 100), graded: false, status: 'pending' }]), 0);
assert.equal(app.calculateCourseGrade(course, []), null);
for (const weight of [null, 0, undefined]) {
    const named = { ...course, categories: [{ id: 'classwork', weight }, { id: 'engagement', weight }] };
    close(app.calculateCourseGrade(named, [assignment(10, 10, 'classwork'), assignment(10, 10, 'engagement'), assignment(60, 100)]), 80 / 120 * 100);
    assert.equal(app.categoryWeightLabel(named, named.categories[0]), 'Unweighted');
}
const excluded = { ...course, categories: [{ id: 'practice', weight: 0, excluded: true }] };
close(app.calculateCourseGrade(excluded, [assignment(0, 100, 'practice'), assignment(9, 10)]), 90);
assert.equal(app.categoryWeightLabel(excluded, excluded.categories[0]), 'Excluded');
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
// Parkway: A+ is only possible in weighted classes; unweighted classes cap at A.
{
    const regular = { code: 'REG', credits: 1, isWeighted: false };
    const honors = { code: 'HON', credits: 1, isWeighted: true };
    assert.equal(app.gradeForPercentage(100.5, regular), 'A');
    assert.equal(app.gradeForPercentage(97, regular), 'A');
    assert.equal(app.gradeForPercentage(93, regular), 'A');
    assert.equal(app.gradeForPercentage(92.99, regular), 'A-');
    assert.equal(app.gradeForPercentage(97, honors), 'A+');
    assert.equal(app.gradeForPercentage(96.99, honors), 'A');
    assert.ok(!sandbox.window.studbudGradeScaleFor(regular).some(item => item.letter === 'A+'));
    assert.equal(sandbox.window.studbudGradeScaleFor(regular).find(item => item.letter === 'A').maxPct, 120);
    assert.equal(sandbox.window.PARKWAY_GRADE_SCALE.length, 13, 'the shared Parkway scale is not mutated');
    assert.equal(sandbox.window.studbudGradeLetterFor('A+', regular), 'A', 'a stale saved A+ on a regular class is read as A');
    assert.equal(sandbox.window.studbudGradeLetterFor('A+', honors), 'A+');
    const stale = gpa.calculateCurrentGPA([{ ...regular, targetGrade: 'A+' }, { ...honors, targetGrade: 'A+' }]);
    close(stale.weighted, 4.5);
    close(stale.unweighted, 4);
    const plan = app.gpaTargetPlan(4.5, 'weighted', [regular, honors]);
    assert.equal(plan.byCode.get('REG').letter, 'A-', 'the GPA solver never asks a regular class for an A+ (A- already earns 4.0)');
    assert.equal(plan.byCode.get('HON').letter, 'A+');
    const nexus = sandbox.window.NexusApp;
    sandbox.window.NexusApp = { AppState: sandbox.AppState };
    state.profile = { school: 'other' };
    assert.equal(app.gradeForPercentage(98, regular), 'A+', 'non-Parkway scales are unchanged');
    state.profile = {};
    sandbox.window.NexusApp = nexus;
}
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
        for (const grade of sandbox.window.PARKWAY_GRADE_SCALE) {
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
const assignmentIds = ['assignment-form', 'assignment-id', 'assignment-modal-title', 'assignment-name',
    'assignment-course', 'assignment-due-date', 'assignment-date-hint', 'assignment-points',
    'assignment-max-points', 'assignment-kind', 'assignment-size', 'assignment-importance',
    'assignment-course-group', 'save-add-another-assignment-btn'];
for (const id of assignmentIds) elements.set(id, {
    value: '', classList: { toggle() {} }, reset() {}, querySelector: () => ({}), focus() {}
});
const originalOpenModal = app.openModal;
const originalSync = app.syncAssignmentForm;
const originalCategories = app.updateAssignmentCategories;
app.openModal = app.syncAssignmentForm = app.updateAssignmentCategories = () => {};
sandbox.setTimeout = fn => fn();
const localEvening = new Date(2026, 9, 12, 23, 30);
sandbox.Date = class extends Date {
    constructor(...args) { super(...(args.length ? args : [localEvening.getTime()])); }
};
app.openAssignmentForm();
assert.equal(elements.get('assignment-due-date').value, '2026-10-12', 'new assignments default to local today, not UTC tomorrow');
app.openAssignmentForm(null, 'math', '2026-11-03');
assert.equal(elements.get('assignment-due-date').value, '2026-11-03', 'calendar day takes priority over today');
app.openAssignmentForm({ id: 'edit', dueDate: '2026-09-15', graded: false });
assert.equal(elements.get('assignment-due-date').value, '2026-09-15', 'editing preserves an existing past date');
app.openAssignmentForm({ id: 'timestamp', dueDate: '2026-10-20T00:00:00Z', graded: false });
assert.equal(elements.get('assignment-due-date').value, '2026-10-20', 'stored timestamps remain editable dates');
app.openAssignmentForm({ id: 'graded', dueDate: '', graded: true });
assert.equal(elements.get('assignment-due-date').value, '', 'editing does not invent a date for undated graded work');
const assignmentHtml = source('index.html');
assert.equal((assignmentHtml.match(/id="assignment-due-date"/g) || []).length, 1);
assert.match(assignmentHtml, /<input type="date" id="assignment-due-date" aria-describedby="assignment-date-hint">/);
assert.doesNotMatch(assignmentHtml, /assignment-calendar-btn/);
assert.match(assignmentHtml, /Type a date or use the calendar icon in the date field\./);
sandbox.Event = Event;
for (const [id, min, initial] of [['assignment-points', '0', 0.46], ['assignment-max-points', '0.01', 100.25]]) {
    assert.match(assignmentHtml, new RegExp(`id="${id}" step="any"`));
    const events = [];
    const input = {
        value: String(initial), valueAsNumber: initial, min,
        dispatchEvent: event => events.push(event.type)
    };
    app.adjustAssignmentScore(input, 1);
    close(input.value, initial + 1);
    input.valueAsNumber = Number(input.value);
    app.adjustAssignmentScore(input, -1);
    close(input.value, initial);
    input.valueAsNumber = 0.01;
    app.adjustAssignmentScore(input, -1);
    close(input.value, Number(min));
    assert.deepEqual(events, ['input', 'change', 'input', 'change', 'input', 'change']);
}
console.log('Score arrows change by whole points, preserve typed hundredths and respect minimums.');
app.openModal = originalOpenModal;
app.syncAssignmentForm = originalSync;
app.updateAssignmentCategories = originalCategories;
sandbox.Date = Date;
for (const id of assignmentIds) elements.delete(id);
console.log('Assignment local-today defaults, selected calendar days, saved dates and single native date control passed.');
const chartClasses = () => ({ toggle(name, value) { this[name] = value; } });
const plot = { classList: chartClasses() };
const canvas = { parentElement: plot, setAttribute(name, value) { this[name] = value; } };
elements.set('grade-progress-chart', canvas);
for (const id of ['analytics-summary', 'grade-progress-caption', 'grade-progress-title', 'grade-progress-range']) elements.set(id, {});
elements.set('grade-progress-empty', { classList: chartClasses() });
elements.set('analytics-course-control', { classList: chartClasses() });
elements.set('analytics-metric-select', { value: 'class' });
elements.set('analytics-course-select', { value: 'all' });
elements.set('analytics-chart-type', { value: 'line' });
let dark = true, reduced = false, destroyed = 0;
sandbox.document.body = { classList: { contains: () => dark } };
sandbox.window.getComputedStyle = () => ({ getPropertyValue: key => ({
    '--text-secondary': dark ? '#afc3b7' : '#334155',
    '--bg-base': dark ? '#101a17' : '#ffffff',
    '--accent-primary': '#55c995',
    '--text-primary': dark ? '#f0f7f2' : '#0f172a'
})[key] });
sandbox.window.matchMedia = () => ({ matches: reduced });
sandbox.window.Chart = class {
    constructor(canvas, config) { this.config = config; }
    destroy() { destroyed++; }
};
state.courses = [{ ...course, title: 'Math' }, { ...course, code: 'science', title: 'Science' }];
state.assignments = [
    { ...assignment(80, 100), gradedAt: '2026-10-01' },
    { ...assignment(90, 100), gradedAt: '2026-10-10' },
    { ...assignment(100, 100), courseCode: 'science', gradedAt: '2026-10-10' }
];
app.renderGradeProgress();
let config = app.gradeProgressChart.config;
assert.deepEqual([...config.data.datasets[0].data], [80, 85], 'chart styling preserves cumulative grades');
assert.deepEqual([...config.data.datasets[1].data], [null, 100], 'missing history stays absent');
assert.equal(config.options.color, '#afc3b7');
assert.equal(config.options.scales.y.min, 77, 'line chart zooms to the grade range');
assert.equal(config.options.scales.y.max, 100, 'zoomed axis never shows past 100% when grades stay under it');
assert.equal(config.options.plugins.legend.labels.usePointStyle, true);
assert.equal(config.options.plugins.tooltip.callbacks.label({ dataset: { label: 'Math' }, parsed: { y: 85 } }), 'Math: 85.00%');
const stableColor = config.data.datasets[1].borderColor;
elements.get('analytics-course-select').value = 'science';
elements.get('analytics-chart-type').value = 'area';
app.renderGradeProgress();
config = app.gradeProgressChart.config;
assert.equal(config.type, 'line');
assert.equal(config.data.datasets[0].borderColor, stableColor, 'class colors remain stable when filtering');
const stops = [];
config.data.datasets[0].backgroundColor({ chart: { chartArea: { top: 0, bottom: 200 }, ctx: { createLinearGradient: () => ({ addColorStop: (...args) => stops.push(args) }) } } });
assert.equal(stops.length, 2, 'area fill is a subtle gradient');
assert.equal(config.data.datasets[0].fill, true);
dark = false; reduced = true;
elements.get('analytics-chart-type').value = 'bar';
app.renderGradeProgress();
config = app.gradeProgressChart.config;
assert.equal(config.options.color, '#334155');
assert.equal(config.options.animation.duration, 0);
assert.equal(config.data.datasets[0].borderRadius, 6);
assert.equal(config.data.datasets[0].maxBarThickness, 28);
elements.get('analytics-metric-select').value = 'weighted';
app.renderGradeProgress();
config = app.gradeProgressChart.config;
assert.ok(config.options.scales.y.min >= 0 && config.options.scales.y.max > config.options.scales.y.min);
assert.ok(config.data.datasets[0].data.every(Number.isFinite));
state.assignments = [];
app.renderGradeProgress();
assert.equal(app.gradeProgressChart, null, 'no empty axes are rendered without history');
assert.equal(plot.classList.hidden, true);
assert.equal(elements.get('grade-progress-empty').classList.hidden, false);
assert.ok(destroyed >= 4, 'old chart instances are cleaned up');
console.log('Grade categories, precision-preserving GPA, exhaustive optimal target plans, priorities, study totals, answer normalization and real analytics passed.');
console.log('Theme-aware line/area/bar charts, stable class colors, grade/GPA data, reduced motion and empty chart states passed.');

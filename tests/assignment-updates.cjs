const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const state = {
    courses: [{ code: 'math', title: 'Math' }], flashcards: [],
    assignments: [
        { id: 'todo', title: '<Homework>', courseCode: 'math', status: 'pending', graded: false },
        { id: 'waiting', title: 'Completed quiz', courseCode: 'math', kind: 'quiz', status: 'completed', graded: false },
        { id: 'graded', title: 'Returned test', courseCode: 'math', status: 'completed', graded: true, pointsEarned: 0, maxPoints: 10 }
    ],
    settings: {}
};
const nodes = new Map();
const node = id => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', value: '', classList: { toggle() {} } });
    return nodes.get(id);
};
for (const id of ['home-grade-inbox', 'assignment-body', 'planner-assessment-body', 'planner-awaiting-grades', 'priority-task-list', 'quad-1-list']) node(id);
node('assignment-status-filter').value = 'todo';
const sandbox = {
    console, Date, Math, window: {},
    document: { addEventListener() {}, getElementById: id => nodes.get(id) || null, querySelectorAll: () => [] },
    AppState: {
        get: key => state[key],
        updateAssignment(id, updates) {
            state.assignments = state.assignments.map(item => item.id === id ? { ...item, ...updates } : item);
        }
    }
};
vm.createContext(sandbox);
vm.runInContext(read('plannerEngine.js'), sandbox);
const source = read('app.js');
vm.runInContext(source.slice(source.indexOf('    function localDateKey'), source.indexOf('    window.NexusApp ='))
    + '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
const app = sandbox.app;
app.renderStudyRecommendations = () => {};
app.calculateCourseGrade = () => null;
const render = () => { app.renderAssignments(); app.renderHomeGradeInbox(); };

async function run() {
    render();
    const home = node('home-grade-inbox').innerHTML;
    const tasks = node('priority-task-list').innerHTML;
    assert.match(tasks, /&lt;Homework&gt;/);
    assert.doesNotMatch(tasks, /<Homework>/, 'titles cannot inject markup');
    assert.match(tasks, /data-action="toggle-assignment" data-id="todo"/);
    assert.match(tasks, /data-action="edit-assignment" data-id="todo"/);
    assert.match(home, /Ready to add grades \(1\)/);
    assert.match(home, /data-action="grade-assignment" data-id="waiting"/);
    assert.doesNotMatch(home, /Returned test/);
    assert.match(node('priority-task-list').innerHTML, /toggle-assignment/);
    assert.match(node('planner-awaiting-grades').innerHTML, /Completed quiz/);
    assert.doesNotMatch(node('planner-assessment-body').innerHTML, /Completed quiz/,
        'waiting-grade access works even while the main tables filter to open work');
    assert.match(app.assignmentStatusControl(state.assignments[2]), /Update grade/);
    assert.equal(app.assignmentState(state.assignments[2]), 'graded', 'a zero grade is still a grade');

    await app.handleDataAction('toggle-assignment', 'todo');
    assert.equal(state.assignments[0].status, 'completed');
    assert.equal(state.assignments[0].graded, false, 'marking done does not invent a zero grade');
    render();
    assert.match(node('home-grade-inbox').innerHTML, /Ready to add grades \(2\)/);
    assert.doesNotMatch(node('assignment-body').innerHTML, /&lt;Homework&gt;/);
    assert.match(node('planner-awaiting-grades').innerHTML, /data-action="grade-assignment" data-id="todo"/);

    await app.handleDataAction('toggle-assignment', 'todo');
    assert.equal(state.assignments[0].status, 'pending');
    render();
    assert.match(node('assignment-body').innerHTML, /&lt;Homework&gt;/);
    assert.match(node('home-grade-inbox').innerHTML, /Ready to add grades \(1\)/);

    const inputs = {
        'assignment-id': 'waiting', 'assignment-name': 'Completed quiz', 'assignment-course': 'math',
        'assignment-due-date': '', 'assignment-points': '0', 'assignment-max-points': '20',
        'assignment-category': '', 'assignment-kind': 'quiz', 'assignment-size': '30', 'assignment-importance': '3'
    };
    for (const [id, value] of Object.entries(inputs)) node(id).value = value;
    sandbox.document.querySelector = () => ({ value: 'graded' });
    app.saveAssignment();
    assert.equal(app.assignmentState(state.assignments[1]), 'graded');
    assert.equal(state.assignments[1].pointsEarned, 0);
    assert.equal(state.assignments[1].maxPoints, 20);
    assert.ok(state.assignments[1].gradedAt, 'grading records the date');
    render();
    assert.match(node('planner-awaiting-grades').innerHTML, /No grades to add right now/);
    assert.equal(node('home-grade-inbox').innerHTML, '', 'empty inbox takes no space on Home');
    state.assignments.push({ id: 'missing', title: 'Missing Campus work', courseCode: 'math',
        status: 'pending', graded: true, icMissing: true, pointsEarned: 0, maxPoints: 20, dueDate: '2099-01-01' });
    render();
    assert.equal(app.assignmentState(state.assignments.at(-1)), 'overdue', 'a missing tag overrides a future due date and a scored zero');
    assert.equal(app.assignmentPriority(state.assignments.at(-1)).daysRemaining, 0, 'missing work gets urgent planner priority without changing its actual due date');
    assert.match(node('priority-task-list').innerHTML, /Missing Campus work/);
    assert.match(node('assignment-body').innerHTML, /Missing Campus work/);
    assert.match(app.assignmentStatusControl(state.assignments.at(-1)), /Update grade/);
    node('assignment-id').value = 'missing';
    node('assignment-name').value = 'Missing Campus work';
    node('assignment-due-date').value = '2099-01-01';
    sandbox.document.querySelector = () => ({ value: 'todo' });
    app.saveAssignment();
    assert.equal(state.assignments.at(-1).graded, true, 'editing missing work retains the scored grade independently of completion');
    assert.equal(state.assignments.at(-1).pointsEarned, 0);
    assert.equal(app.assignmentState(state.assignments.at(-1)), 'overdue');
    await app.handleDataAction('toggle-assignment', 'missing');
    const completedMissing = state.assignments.at(-1);
    assert.equal(completedMissing.pointsEarned, 0, 'completion retains the actual Campus score');
    assert.equal(completedMissing.graded, true, 'the current score continues counting toward the class grade');
    assert.equal(app.assignmentState(completedMissing), 'awaiting', 'completed missing work stays accessible for entering its new grade');
    render();
    assert.match(node('planner-awaiting-grades').innerHTML, /Missing Campus work/);
    assert.match(node('home-grade-inbox').innerHTML, /Ready to add grades \(1\)/);
    node('assignment-id').value = 'missing';
    node('assignment-name').value = 'Missing Campus work';
    node('assignment-points').value = '18';
    sandbox.document.querySelector = () => ({ value: 'graded' });
    app.saveAssignment();
    assert.equal(state.assignments.at(-1).pointsEarned, 18);
    assert.equal(state.assignments.at(-1).icMissing, false);
    assert.equal(app.assignmentState(state.assignments.at(-1)), 'graded');
    assert.match(read('index.html'), /id="planner-awaiting-grades"/);
    console.log('Assignment updates passed: Home/Planner actions, escaped titles, waiting-grade access independent of filters, undo and saved zero grades.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

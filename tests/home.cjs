const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const state = { courses: [], assignments: [], flashcards: [] };
const nodes = new Map([
    'home-greeting', 'home-date', 'home-summary', 'home-due-today',
    'home-overdue', 'home-set-count', 'home-primary-action', 'study-priority-list'
].map(id => [id, { textContent: '', innerHTML: '', dataset: {} }]));
const sandbox = { console, Date, Math, window: {},
    document: { addEventListener() {}, getElementById: id => nodes.get(id) || null },
    AppState: { get: key => state[key] } };
vm.createContext(sandbox);
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
vm.runInContext(source.slice(source.indexOf('    function localDateKey'), source.indexOf('    window.NexusApp ='))
    + '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
const app = sandbox.app;
const today = new Date();
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
app.renderHomeWelcome();
assert.equal(nodes.get('home-primary-action').dataset.target, 'gpa-view', 'new students get a class-setup starting point');
state.courses = [{ code: 'math', title: 'Math' }];
state.flashcards = [{ id: 'one' }, { id: 'two' }];
state.assignments = [
    { id: 'today', title: 'Homework', dueDate: dateKey(today) },
    { id: 'late', title: 'Late work', dueDate: dateKey(yesterday) },
    { id: 'done', dueDate: dateKey(today), status: 'completed' },
    { id: 'graded', dueDate: dateKey(today), graded: true, pointsEarned: 10, maxPoints: 10 },
    { id: 'dismissed', dueDate: dateKey(yesterday), dismissed: true },
    { id: 'undated', title: 'Someday' }
];
app.renderHomeWelcome();
assert.equal(nodes.get('home-due-today').textContent, 1, 'counts exclude finished and graded work');
assert.equal(nodes.get('home-overdue').textContent, 1, 'counts exclude dismissed work');
assert.equal(nodes.get('home-set-count').textContent, 2);
assert.match(nodes.get('home-summary').textContent, /1 task due today/);
assert.equal(nodes.get('home-primary-action').dataset.target, 'planner-view');
state.assignments = [state.assignments[1]];
app.renderHomeWelcome();
assert.match(nodes.get('home-summary').textContent, /past-due work/, 'a day without deadlines does not claim overdue work is finished');
state.assignments = [{ title: 'Undated work' }];
app.renderHomeWelcome();
assert.doesNotMatch(nodes.get('home-summary').textContent, /No unfinished tasks/);
app.getStudyRecommendations = () => [{ id: '"unsafe', title: '<script>title</script>', courseTitle: '<Math>',
    kind: 'test', dueDate: dateKey(today), sessionMinutes: 15 }];
app.renderStudyRecommendations('study-priority-list', 2);
assert.match(nodes.get('study-priority-list').innerHTML, /&lt;script&gt;/);
assert.doesNotMatch(nodes.get('study-priority-list').innerHTML, /<script>/);
assert.match(nodes.get('study-priority-list').innerHTML, /data-action="assessment-study-set"/);
assert.match(nodes.get('study-priority-list').innerHTML, /data-action="edit-assignment"/);
console.log('Home setup, actionable deadline counts, honest empty states and compact assessment actions passed.');

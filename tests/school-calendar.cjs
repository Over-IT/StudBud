const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
let today = '2026-10-21T12:00:00';
class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [today])); }
}
const state = { profile: {}, courses: [], assignments: [], academicYears: [], schedule: {} };
const nodes = new Map();
const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
        value: '', checked: false, disabled: false, textContent: '',
        classList: { toggle(name, value) { this[name] = value; } }
    });
    return nodes.get(id);
};
const sandbox = {
    console, Date: FixedDate, Math, Map, Set,
    document: { getElementById: node, addEventListener() {} },
    AppState: { get: key => state[key], set: (key, value) => { state[key] = value; } }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['parkwayData.js', 'gpaCalculator.js']) vm.runInContext(read(file), sandbox);
const source = read('app.js');
vm.runInContext(source.slice(source.indexOf('    class AppOrchestrator'), source.indexOf('    window.NexusApp ='))
    + '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
const app = sandbox.app;
const plain = value => JSON.parse(JSON.stringify(value));
vm.runInContext(source.slice(source.indexOf('    class AppStateEngine'), source.indexOf('    const AppState ='))
    + '\nglobalThis.creditState = Object.create(AppStateEngine.prototype);', sandbox);
vm.runInContext(read('data\\schools\\central.js'), sandbox);
sandbox.creditState.state = { profile: { school: 'pchs' } };
const oldCredits = [
    { code: '057011/057012', term: 'S1', credits: 1 },
    { code: '057011/057012', term: 'S2', credits: 0.5 },
    { code: '057011/057012', term: 'FY', credits: 1 },
    { code: '057011/057012', school: 'other', term: 'S1', credits: 1 }
];
const normalized = sandbox.creditState.normalizeCourseCredits(oldCredits);
assert.deepEqual(plain(normalized.map(course => course.credits)), [0.5, 0.5, 1, 1], 'old catalog semester credits are corrected without halving them again or changing custom schools');
assert.equal(oldCredits[0].credits, 1, 'normalization does not mutate the original courses');
assert.deepEqual(plain(sandbox.creditState.normalizeCourseCredits(normalized)), plain(normalized), 'credit normalization is idempotent');

assert.equal(app.schoolCalendar().hasSchoolCalendar, false, 'no selected school uses editable defaults, not an assumed Parkway calendar');
assert.equal(app.schoolCalendar().end, '2027-05-31');
app.renderSchoolCalendarSettings();
assert.equal(node('settings-calendar-custom').checked, true);
assert.equal(node('settings-year-end').disabled, false, 'unsupported schools can set their own dates');
assert.match(node('settings-calendar-source').textContent, /Editable default/);
for (const school of ['pchs', 'pnhs', 'pshs', 'pwhs']) {
    state.profile = { school, academicYearStart: 2026 };
    assert.equal(app.schoolCalendar().start, '2026-08-25');
    assert.equal(app.schoolCalendar().end, '2027-05-28');
}
state.profile.academicYearStart = 2025;
assert.equal(app.schoolCalendar().semester2Start, '2026-01-05');
state.profile.academicYearStart = 2028;
assert.equal(app.schoolCalendar().hasSchoolCalendar, false, 'unpublished future years never invent official school dates');

state.profile = { school: 'pchs', academicYearStart: 2026, currentTerm: 'auto' };
today = '2027-01-04T23:59:59';
assert.equal(app.configuredSemester(), 'S1', 'winter break does not switch semesters early');
today = '2027-01-05T00:00:00';
assert.equal(app.configuredSemester(), 'S2', 'semester switches on the real first day');
state.profile.currentTerm = 'S1';
assert.equal(app.configuredSemester(), 'S1', 'explicit user semester override wins');
state.profile.currentTerm = 'auto';
state.schedule.ic = { school: 'pchs', terms: [
    { name: 'S1', start: '2026-08-24', end: '2026-12-18' },
    { name: 'S2', start: '2027-01-07', end: '2027-06-03' }
] };
assert.equal(app.schoolCalendar().source, 'Imported Infinite Campus calendar');
assert.equal(app.configuredSemester(), 'S1');
today = '2027-01-07T00:00:00';
assert.equal(app.configuredSemester(), 'S2');
state.profile.school = 'pnhs';
assert.equal(app.schoolCalendar().end, '2027-05-28', 'another school cannot reuse an imported calendar');
delete state.schedule.ic.school;
state.profile.school = 'pchs';
assert.equal(app.schoolCalendar(new FixedDate(), { school: 'other', academicYearStart: 2026 }).hasSchoolCalendar, false,
    'switching to Other cannot reuse a legacy import from the previously selected school');
state.schedule.ic.school = 'pchs';
state.profile = { school: 'pchs' };
state.schedule.ic.terms = [{ name: 'S1', start: '2026-08-24', end: '2026-12-18' }];
assert.equal(app.schoolCalendar().startYear, 2026, 'a first-semester-only import identifies the correct academic year');
state.schedule = {};

state.profile = {
    school: 'other', academicYearStart: 2026, currentTerm: 'auto',
    schoolCalendar: { school: 'other', start: '09-01', semester2Start: '02-02', end: '06-20' }
};
app.renderSchoolCalendarSettings();
assert.equal(node('settings-year-end').value, '2027-06-20');
assert.equal(node('settings-year-start').value, '2026-09-01');
assert.deepEqual(plain(app.readSchoolCalendarSettings('other')), {
    academicYearStart: 2026, schoolCalendar: state.profile.schoolCalendar
});
for (const invalid of ['', '2027-02-30', '2027-06-21', '2028-02-02']) {
    node('settings-semester2-start').value = invalid;
    assert.throws(() => app.readSchoolCalendarSettings('other'), /dates|Calendar/);
}
app.renderSchoolCalendarSettings();
node('settings-academic-year').value = '2026.5';
assert.throws(() => app.readSchoolCalendarSettings('other'), /school year/);
app.renderSchoolCalendarSettings();
state.profile.academicYearStart = 2027;
assert.equal(app.schoolCalendar().semester2Start, '2028-02-02', 'custom dates repeat after rollover');
state.profile.schoolCalendar.semester2Start = '02-29';
assert.equal(app.schoolCalendar().semester2Start, '2028-02-29');
state.profile.academicYearStart = 2028;
assert.equal(app.schoolCalendar().semester2Start, '2029-02-28', 'recurring leap-day dates remain valid');

state.profile = { school: 'other', academicYearStart: 2026, currentTerm: 'auto',
    schoolCalendar: { school: 'other', start: '08-15', semester2Start: '02-01', end: '06-15' } };
state.courses = [{ code: 'year', title: 'Full year', term: 'FY', credits: 1 }];
today = '2027-01-31T12:00:00';
app.syncSchoolCalendar();
app.semesterView = 'S1';
today = '2027-02-01T00:00:00';
app.syncSchoolCalendar();
assert.equal(app.semesterView, null, 'a date-triggered semester transition clears an old browsing override');
assert.equal(app.schoolSemester(), 'S2');
assert.equal(node('school-year-notice').classList.hidden, true);
assert.deepEqual(plain(app.semesterAssignments([
    { courseCode: 'year', dueDate: '2027-01-31' }, { courseCode: 'year', dueDate: '2027-02-01' }
], state.courses)).map(item => item.dueDate), ['2027-02-01'], 'assignment filtering follows custom semester boundaries');
today = '2027-06-15T23:59:59';
app.syncSchoolCalendar();
assert.equal(node('school-year-notice').classList.hidden, true, 'the final school day is not archived early');
today = '2027-06-16T00:00:00';
app.syncSchoolCalendar();
assert.equal(node('school-year-notice').classList.hidden, false);
assert.equal(state.academicYears.length, 0, 'date checks only prompt: no grades or data are archived without review');
today = '2027-09-01T12:00:00';
app.syncSchoolCalendar();
assert.equal(app.schoolCalendar().startYear, 2026, 'an overdue year stays available rather than being skipped');
state.academicYears = [{ startYear: 2026 }];
app.syncSchoolCalendar();
assert.equal(node('school-year-notice').classList.hidden, true, 'an archived year is never prompted twice');
state.academicYears = [];
state.profile = {};
today = '2026-10-21T12:00:00';
app.syncSchoolCalendar();
assert.equal(state.profile.academicYearStart, 2026, 'current coursework pins the school year persistently');

state.profile = { currentTerm: 'S1', academicYearStart: 2026 };
state.assignments = [{ courseCode: 'year', graded: true, pointsEarned: 95, maxPoints: 100, dueDate: '2026-10-01' }];
assert.equal(app.calculateSemesterGPA(state.courses).totalCredits, 0.5);
assert.equal(app.calculateTrackedGPA().totalCredits, 0.5, 'cumulative credits do not count the ungraded second half of a year');
state.assignments.push({ courseCode: 'year', graded: true, pointsEarned: 85, maxPoints: 100, dueDate: '2027-03-01' });
const yearly = app.calculateTrackedGPA();
assert.equal(yearly.totalCredits, 1, 'two graded semesters total exactly one annual credit');
assert.equal(Number(yearly.unweighted), 3.5, 'semester letter grades contribute their own half-credit GPA weights');
state.assignments = [{ courseCode: 'year', graded: true, pointsEarned: 95, maxPoints: 100 }];
assert.equal(app.calculateTrackedGPA().totalCredits, 0.5, 'undated work cannot count in both semesters');
assert.equal(sandbox.studbudCatalogCreditsForTerm({ credits: 1 }, 'S1'), 0.5);
assert.equal(sandbox.studbudCatalogCreditsForTerm({ credits: 1 }, 'FY'), 1);
assert.equal(sandbox.studbudCatalogCreditsForTerm({ credits: 0.5 }, 'S2'), 0.5);
assert.equal(sandbox.studbudCatalogCreditsForTerm({ credits: 0 }, 'S1'), 0);
const sevenYearCourses = Array.from({ length: 7 }, (_, index) => ({ code: `year${index}`, term: 'FY', credits: 1 }));
state.assignments = sevenYearCourses.map(course => ({ courseCode: course.code, graded: true, pointsEarned: 95, maxPoints: 100 }));
const semesterClass = { code: 'half', term: 'S1', credits: 0.5 };
state.assignments.push({ courseCode: 'half', graded: true, pointsEarned: 95, maxPoints: 100 });
assert.equal(app.calculateSemesterGPA([...sevenYearCourses, semesterClass]).totalCredits, 4,
    '7.5 annual course credits are exactly 4 tracked credits in S1, not 7.5');
const html = read('index.html');
assert.equal((html.match(/data-action="open-school-year"/g) || []).length, 1, 'the only finish entry point is the date-triggered review prompt');
assert.match(source, /visibilitychange', refreshCalendar/);
assert.match(source, /setInterval\(refreshCalendar, 60000\)/);
console.log('School calendars, editable defaults, imported dates, semester boundaries, year-end review and semester credit weights passed.');

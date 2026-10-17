const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const methods = source.slice(
    source.indexOf('        configuredSemester() {'),
    source.indexOf('        calculateTrackedGPA(')
);
let month = 0;
class FixedDate extends Date {
    getMonth() { return month; }
}
const state = {
    profile: { currentTerm: 'S1' },
    assignments: [
        { courseCode: 'fall', points: 90 },
        { courseCode: 'spring', points: 20 },
        { courseCode: 'year', dueDate: '2026-10-12', points: 80 },
        { courseCode: 'year', dueDate: '2027-02-12', points: 40 },
        { courseCode: 'year', points: 60 }
    ]
};
const sandbox = {
    AppState: { get: key => state[key] },
    Date: FixedDate,
    window: {
        GPACalculator: {
            calculateCurrentGPA(courses) {
                const credits = courses.reduce((sum, course) => sum + course.credits, 0);
                const points = courses.reduce((sum, course) => sum + course.targetGrade * course.credits, 0);
                const gpa = credits ? points / credits : 0;
                return { weighted: gpa.toFixed(3), unweighted: gpa.toFixed(3), totalCredits: credits };
            }
        }
    }
};
vm.createContext(sandbox);
const app = vm.runInContext(`new (class { ${methods} })()`, sandbox);
app.calculateCourseGrade = (course, assignments = []) => {
    const scores = assignments.filter(item => item.courseCode === course.code).map(item => item.points);
    return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : course.points;
};
app.gradeForPercentage = grade => grade;
const courses = [
    { code: 'fall', term: 'S1', credits: 1, points: 4 },
    { code: 'spring', term: 'S2', credits: 1, points: 2 },
    { code: 'year', term: 'FY', credits: 1, points: 3 },
    { code: 'legacy', credits: 1, points: 3 }
];
assert.equal(app.schoolSemester(), 'S1', 'uses the configured semester');
assert.deepEqual(app.schoolSemesterCourses(courses).map(course => course.code), ['fall', 'year', 'legacy']);
assert.deepEqual(app.schoolSemesterCourses(courses).map(course => course.code), ['fall', 'year', 'legacy']);
assert.deepEqual(
    app.semesterAssignments([
        { courseCode: 'fall' },
        { courseCode: 'spring' },
        { courseCode: 'year', dueDate: '2026-10-12' },
        { courseCode: 'year', dueDate: '2027-02-12' },
        { courseCode: 'year' },
        { courseCode: 'unassigned' }
    ], app.schoolSemesterCourses(courses)).map(item => item.courseCode),
    ['fall', 'year', 'year'],
    'hides other-semester courses and dated full-year assignments while retaining undated work'
);
assert.equal(app.calculateSemesterGPA(app.schoolSemesterCourses(courses)).weighted, '54.333');

app.semesterView = 'S2';
assert.equal(app.schoolSemester(), 'S2', 'the session view can switch from the configured semester');
assert.deepEqual(app.schoolSemesterCourses(courses).map(course => course.code), ['spring', 'year', 'legacy']);
assert.deepEqual(
    app.semesterAssignments([
        { courseCode: 'year', dueDate: '2026-10-12' },
        { courseCode: 'year', dueDate: '2027-02-12' },
        { courseCode: 'year' }
    ], app.schoolSemesterCourses(courses)).map(item => item.dueDate || 'undated'),
    ['2027-02-12', 'undated'],
    'full-year classes show only assignments dated in the selected semester'
);
assert.equal(app.calculateSemesterGPA(app.schoolSemesterCourses(courses)).weighted, '24.333');

app.semesterView = null;
state.profile.currentTerm = 'auto';
month = 7;
assert.equal(app.schoolSemester(), 'S1', 'automatic semester is Semester 1 from August through December');
month = 0;
assert.equal(app.schoolSemester(), 'S2', 'automatic semester is Semester 2 from January through July');

console.log('Semester filter: configured and automatic defaults, session switching, full-year courses, linked assignments and term GPA passed.');

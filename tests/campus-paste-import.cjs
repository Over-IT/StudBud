const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const paste = require('../campusPasteImport.js');

const catalog = [
    { code: 'BIO101', title: 'Biology I' },
    { code: 'ENG202', title: 'English Literature' }
];
assert.deepEqual(paste.parseCourses('Course\tTeacher\tRoom\nBiology I\tMs. Example\t101\nENG202\tMr. Example\t202\nBiology I\tOther\t1', catalog),
    [{ name: 'Biology I', match: catalog[0] }, { name: 'ENG202', match: catalog[1] }],
    'copied class tables match by title or catalog code, ignore unrelated columns and deduplicate');
assert.deepEqual(paste.parseCourses('Course,Teacher,Room\n"Biology I, Honors",Ms. Example,101\nEnglish Literature,Mr. Example,202', [
    { code: 'BIO101', title: 'Biology I, Honors' }, catalog[1]
]), [
    { name: 'Biology I, Honors', match: { code: 'BIO101', title: 'Biology I, Honors' } },
    { name: 'English Literature', match: catalog[1] }
], 'quoted CSV class copy preserves commas inside names');
assert.deepEqual(paste.parseCourses('Biology I\nUnknown elective', catalog), [
    { name: 'Biology I', match: catalog[0] }, { name: 'Unknown elective', match: null }
], 'pasted plain course lists keep unmatched names visible for review');
assert.equal(paste.parseCourses('Biology I - Semester 1', catalog)[0].match, catalog[0],
    'unique course titles still match when Campus adds a section label');
assert.deepEqual(paste.parseCourses('Schedule\nStudent details\nCourse\tTeacher\nBiology I\tExample\nPage footer', catalog),
    [{ name: 'Biology I', match: catalog[0] }], 'page text outside a recognized table is ignored');

const today = new Date(2026, 10, 12);
assert.equal(paste.tableTextFromHtml('<table>ignored</table>', class {
    parseFromString() {
        const rows = [
            [{ textContent: ' Assignment ' }, { textContent: ' Due date ' }, { textContent: 'Score' }],
            [{ textContent: 'Geometry, practice' }, { textContent: ' 11/20/2026 ' }, { textContent: ' 8/10 ' }]
        ].map(cells => ({ querySelectorAll: () => cells }));
        return { querySelectorAll: () => rows };
    }
}), 'Assignment\tDue date\tScore\nGeometry, practice\t11/20/2026\t8/10',
'rich clipboard tables normalize into rows without splitting commas in cells');
assert.deepEqual(paste.parseAssignments('Assignment\tDue Date\tScore\tPoints Possible\tCategory\tTeacher\n' +
    'Chapter 1 quiz\t11/14/2026\t18\t20\tQuizzes\tIgnore Me\n' +
    'Lab report\tNov 18\t--\t--\tLabs\tIgnore Me\n' +
    'Category Total\t\t90\t100\t\tIgnore Me', today), [
    { title: 'Chapter 1 quiz', dueDate: '2026-11-14', pointsEarned: 18, maxPoints: 20, category: 'Quizzes' },
    { title: 'Lab report', dueDate: '2026-11-18', pointsEarned: null, maxPoints: null, category: 'Labs' }
], 'assignment paste extracts supported fields and ignores extra columns and summary rows');
assert.deepEqual(paste.parseAssignments('Practice\t11/20/2026\t8/10\t\tHomework', today), [
    { title: 'Practice', dueDate: '2026-11-20', pointsEarned: 8, maxPoints: 10, category: 'Homework' }
], 'headerless tab-delimited assignment rows accept score/out-of shorthand');
assert.deepEqual(paste.parseAssignments('Grades\nStudent details\nAssignment\tScore\tPoints Possible\nQuiz\t8\t10\nPage footer', today), [
    { title: 'Quiz', dueDate: '', pointsEarned: 8, maxPoints: 10, category: '' }
], 'page text surrounding a recognized assignment table is ignored');
assert.deepEqual(paste.parseAssignments(
    'Grades\nStudent details\nAssignment\nAlgebra Review Quiz\nMultiplier: 0.5\nDue: 09/13/2026\n' +
    'Commentsgot a 100 on retake! was a 36 before\nScore\n18/20\n' +
    'Practice 2\nDue: 11/20/2026\nCategory\nHomework\nScore: 80%\nPage footer', today), [
    { title: 'Algebra Review Quiz', dueDate: '2026-09-13', pointsEarned: 18, maxPoints: 20, category: '', multiplier: '0.5' },
    { title: 'Practice 2', dueDate: '2026-11-20', pointsEarned: 80, maxPoints: 100, category: 'Homework' }
], 'multi-line assignment details, comments and column labels are grouped with their assignment');
assert.deepEqual(paste.parseAssignments(
    'Assignment\nPractice\nDue\n11/20/2026\nPoints Possible\n15\nScore\n--\n' +
    'Quiz\nDue: 11/21/2026\nPoints Earned: 7\nPossible Points: 10\nComments: no extra grade\nFooter', today), [
    { title: 'Practice', dueDate: '2026-11-20', pointsEarned: null, maxPoints: 15, category: '' },
    { title: 'Quiz', dueDate: '2026-11-21', pointsEarned: 7, maxPoints: 10, category: '' }
], 'separate labels and values preserve possible points even without a score');
assert.deepEqual(paste.parseAssignments('Assignment\tScore\nQuiz\t7', today), [
    { title: 'Quiz', dueDate: '', pointsEarned: null, maxPoints: null, category: '', incompleteScore: true }
], 'a bare score is not assumed to be out of 100');
assert.deepEqual(paste.parseAssignments('Assignment\tScore\nQuiz\t75%', today), [
    { title: 'Quiz', dueDate: '', pointsEarned: 75, maxPoints: 100, category: '' }
], 'an explicit percentage has a known denominator');
assert.deepEqual(paste.parseAssignments('Assignment,Due Date,Score,Points Possible,Category,Status\n' +
    '"Angles, Lines, and Proofs",11/20/2026,8,10,Homework,Missing', today), [
    { title: 'Angles, Lines, and Proofs', dueDate: '2026-11-20', pointsEarned: 8, maxPoints: 10, category: 'Homework', missing: true }
], 'quoted CSV assignment copy preserves comma titles, score, category and status');
assert.deepEqual(paste.parseAssignments('Assignment\t10/12 Memorization Google Doc\nDue:\t10/15/2026\n' +
    'Assignment\t10/13-14 ws1.7Ch\nDue:\t10/15/2026\nScore:\t92/100(92%)', today), [
    { title: '10/12 Memorization Google Doc', dueDate: '2026-10-15', pointsEarned: null, maxPoints: null, category: '' },
    { title: '10/13-14 ws1.7Ch', dueDate: '2026-10-15', pointsEarned: 92, maxPoints: 100, category: '' }
], 'key/value rows from copied page layouts are not misread as a column-header table');
assert.deepEqual(paste.parseAssignments('Assignment\nHomework\nDue: 11/12/2026\nMissing\nScore0/10(0%)', today), [
    { title: 'Homework', dueDate: '2026-11-12', pointsEarned: 0, maxPoints: 10, category: '', missing: true }
], 'joined score labels and missing status also work when copying line by line');
assert.deepEqual(paste.parseAssignments('Assignment\nQuiz\nDue 11/22/2026\nScore 8/10\nStatus Missing', today), [
    { title: 'Quiz', dueDate: '2026-11-22', pointsEarned: 8, maxPoints: 10, category: '', missing: true }
], 'unpunctuated labeled details stay attached to the assignment');
const campusPage = 'Example classGradesTerm 2In-progressTestsWeight: 70120/150(80%)' +
    'AssignmentUnit TestDue: 10/23/2026Score84/100(84%)' +
    'AssignmentReview QuizMultiplier: 0.5Due: 09/13/2026CommentsretakeScore80/100(80%)' +
    'HomeworkWeight: 10185/237(78.05%)' +
    'AssignmentPractice &amp; ReviewDue: 11/12/2026MissingScore0/10(0%)' +
    'AssignmentStudy GuideDue: 11/10/2026' +
    'AssignmentAssignment 2Due: 11/09/2026Score7/10(70%)(2) Citizenship';
assert.deepEqual(paste.parseAssignments(campusPage, today), [
    { title: 'Unit Test', dueDate: '2026-10-23', pointsEarned: 84, maxPoints: 100, category: 'Tests' },
    { title: 'Review Quiz', dueDate: '2026-09-13', pointsEarned: 80, maxPoints: 100, category: 'Tests', multiplier: '0.5' },
    { title: 'Practice & Review', dueDate: '2026-11-12', pointsEarned: 0, maxPoints: 10, category: 'Homework', missing: true },
    { title: 'Study Guide', dueDate: '2026-11-10', pointsEarned: null, maxPoints: null, category: 'Homework' },
    { title: 'Assignment 2', dueDate: '2026-11-09', pointsEarned: 7, maxPoints: 10, category: 'Homework' }
], 'concatenated Campus pages preserve assignment boundaries, category sections, scores and missing status');
assert.ok(paste.parseAssignments(campusPage, today).every(item => !['Assignment', 'Score', '92/100(92%)'].includes(item.title)),
    'copied labels and score text never become separate assignment titles');
assert.equal(paste.parseDate('2/30/2026', today), '', 'invalid calendar dates are not imported');
assert.equal(paste.parseDate('2026-02-31', today), '', 'invalid ISO dates are not imported');
assert.equal(paste.parseDate('11/19', today), '2026-11-19', 'dates without a year use the current year');

{
    const nodes = new Map();
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '',
            classList: { toggle() {}, add() {} }, replaceChildren() {} });
        return nodes.get(id);
    };
    const data = { courses: [{ code: 'math', title: 'Math', categories: [{ id: 'hw', name: 'Homework' }] }], assignments: [] };
    const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    let app;
    const sandbox = {
        window: { StudBudCampusPaste: paste },
        document: { getElementById: node, querySelectorAll: () =>
            app.campusAssignmentDraft.rows.map((row, index) => row.include ? { dataset: { campusAssignmentIndex: String(index) } } : null).filter(Boolean) },
        AppState: { get: key => data[key], set: (key, value) => { data[key] = value; } },
        localDateKey: () => '2026-11-12', Date, console
    };
    vm.createContext(sandbox);
    vm.runInContext(appSource.slice(appSource.indexOf('    class AppOrchestrator'), appSource.indexOf('    window.NexusApp =')), sandbox);
    app = vm.runInContext('Object.create(AppOrchestrator.prototype)', sandbox);
    node('campus-paste-assignment-course').value = 'math';
    node('campus-paste-assignments').value = 'Assignment\nPractice\nDue: 11/20/2026\nPoints Possible: 15\nCategory: Homework\n' +
        'Weighted Quiz\nMultiplier: 0.5\nDue: 11/21/2026\nScore: 8/10\n' +
        'Incomplete Quiz\nDue: 11/22/2026\nScore: 7\n';
    app.previewCampusAssignments();
    assert.equal(app.campusAssignmentDraft.rows.length, 3);
    assert.equal(app.campusAssignmentDraft.rows[1].include, true);
    assert.match(node('campus-paste-assignments-preview').innerHTML, /8\/10 × 0\.5 = 4\/5/, 'preview shows the multiplier adjustment');
    assert.match(node('campus-paste-assignments-preview').innerHTML, /Score needs points possible/);
    app.importCampusAssignments();
    assert.equal(data.assignments.length, 3);
    assert.equal(data.assignments[0].dueDate, '2026-11-20');
    assert.equal(data.assignments[0].maxPoints, 15, 'known possible points survive an ungraded import');
    assert.equal(data.assignments[0].categoryId, 'hw');
    assert.equal(data.assignments[1].pointsEarned, 4);
    assert.equal(data.assignments[1].maxPoints, 5, 'the saved score contributes the correct multiplied weight');
    assert.equal(data.assignments[2].graded, false, 'an incomplete score is not recorded as a grade');

    data.assignments = [];
    node('campus-paste-assignments').value = campusPage;
    app.previewCampusAssignments();
    assert.match(node('campus-paste-assignments-preview').innerHTML, /Homework · Missing/);
    app.importCampusAssignments();
    const missing = data.assignments.find(item => item.title === 'Practice & Review');
    assert.equal(missing.categoryId, 'hw');
    assert.equal(missing.graded, true);
    assert.equal(missing.pointsEarned, 0);
    assert.equal(missing.icMissing, true);
    assert.equal(missing.status, 'pending', 'missing work stays actionable even when a zero score was copied');
    const quiz = data.assignments.find(item => item.title === 'Review Quiz');
    assert.equal(quiz.pointsEarned, 40);
    assert.equal(quiz.maxPoints, 50);
    const tests = data.assignments.filter(item => ['Unit Test', 'Review Quiz'].includes(item.title));
    assert.ok(Math.abs(app.calculateCourseGrade(data.courses[0], tests) - 124 / 150 * 100) < 1e-9,
        'multiplied points contribute the correct weight to grade calculations');

    data.assignments = [];
    node('campus-paste-assignments').value = 'Assignment\nQuiz\nMultiplier: 0\nDue: 11/20/2026\nScore: 8/10';
    app.previewCampusAssignments();
    assert.equal(app.campusAssignmentDraft.rows[0].include, false, 'a zero multiplier cannot create a misleading zero-point grade');
    assert.match(node('campus-paste-assignments-preview').innerHTML, /Invalid score multiplier/);
}

console.log('Campus paste parsing: class matching, assignment scores/dates/categories, deduplication and ignored fields passed.');

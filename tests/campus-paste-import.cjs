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
assert.deepEqual(paste.parseAssignments('Assignment\tDue\tScore\tCategory\nTests\tWeight: 70\nUnit test\t11/20/2026\t8/10\t\n' +
    'HomeworkWeight: 10\nPractice\t11/21/2026\t5/5\t', today), [
    { title: 'Unit test', dueDate: '2026-11-20', pointsEarned: 8, maxPoints: 10, category: 'Tests' },
    { title: 'Practice', dueDate: '2026-11-21', pointsEarned: 5, maxPoints: 5, category: 'Homework' }
], 'category group headings in copied tables carry through when category cells are empty');
assert.equal(paste.parseAssignments('Assignment\tDue\tScore\nTestsWeight: 70\nUnit test\t11/20/2026\t8/10', today)[0].category,
    'Tests', 'section categories also work without a category column');
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
assert.deepEqual(paste.parseAssignments('Grades\nTests\nWeight: 70\n216/250(86.4%)\n' +
    'Assignment\nUnit test\nDue: 11/20/2026\nScore\n8/10(80%)\n' +
    'Homework\nWeight: 10\nAssignment\nPractice\nDue: 11/21/2026\nScore\n5/5(100%)', today), [
    { title: 'Unit test', dueDate: '2026-11-20', pointsEarned: 8, maxPoints: 10, category: 'Tests' },
    { title: 'Practice', dueDate: '2026-11-21', pointsEarned: 5, maxPoints: 5, category: 'Homework' }
], 'line-separated category sections apply to the following assignments, not the previous one');
const geometry = { code: 'geo', title: 'Honors Geometry' };
assert.equal(paste.inferCourse('Honors GeometryClassroomCurriculumGradesAssignmentQuizDue: 11/20/2026', [geometry, ...catalog]), geometry);
assert.equal(paste.inferCourse('Class: Honors Geometry\nAssignment\nQuiz\nDue: 11/20/2026', [geometry]), geometry);
assert.equal(paste.inferCourse('Grades\nHonors Geometry\nClassroom\nAssignment\nQuiz', [geometry]), geometry,
    'navigation text before the class name does not prevent matching');
assert.equal(paste.inferCourse('Honors Geometry\nGrades\nAssignment\nQuiz', [geometry, { ...geometry, code: 'geo2' }]), null,
    'ambiguous semester/section matches require the user to choose');
assert.equal(paste.inferCourse('Assignment\nHonors Geometry quiz\nDue: 11/20/2026', [geometry]), null,
    'assignment titles do not determine the class');
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
for (const value of ['Mon 11/20/2026 11:59 PM', 'Nov 20 at 11:59pm', 'November 20th, 2026', 'Due: 11-20-2026']) {
    assert.equal(paste.parseDate(value, today), '2026-11-20', `weekday, time and ordinal noise is ignored: ${value}`);
}
assert.deepEqual(paste.parseCourses('Period 1\n1(8:00 AM-8:50 AM)\nBiology I\nSmith, John\nRoom: 204\nA (94.2%)\nCourse Design 88%\nMr. Jones\nTerm 1\nIn Progress\nStudio Art - Ms. Lee', catalog)
    .map(item => item.name), ['Biology I', 'Course Design', 'Studio Art'], 'select-all schedule noise is filtered from class names');
assert.deepEqual(paste.parseAssignments('Assignment Title,Due On,Grade,Worth,Assignment Type,Flags\n' +
    'Quiz 1,Mon 11/16/2026,8 of 10 pts,,Quizzes,Late\nLab,11/17,Excused,20,Labs,Excused\nEssay,11/18,-- / 50,,Writing,Missing\nTest,11/19,A (93%),,Tests,', today), [
    { title: 'Quiz 1', dueDate: '2026-11-16', pointsEarned: 8, maxPoints: 10, category: 'Quizzes' },
    { title: 'Lab', dueDate: '2026-11-17', pointsEarned: null, maxPoints: 20, category: 'Labs', excused: true },
    { title: 'Essay', dueDate: '2026-11-18', pointsEarned: null, maxPoints: 50, category: 'Writing', missing: true },
    { title: 'Test', dueDate: '2026-11-19', pointsEarned: 93, maxPoints: 100, category: 'Tests' }
], 'alternate CSV headings, score formats and excused work are understood');
assert.equal(paste.parseAssignments('Assignment\nVocab\u00a0Quiz\nDue: Fri 11/13/2026\nScore 9 / 10 (90%)\nLate', today)[0].title, 'Vocab Quiz',
    'non-breaking spaces from copied pages are normalised');
assert.equal(paste.inferCourse('Period 2 Honors Geometry (Smith)\nGrades\nAssignment\nQuiz', [geometry]), geometry,
    'a heading that contains the class name with extra words still matches');
assert.deepEqual(paste.parseAssignments('Assignment\tDue Date\tScore\tCategory\nQuiz\t11/20/2026\t8/10\tTests\n' +
    'Assignment\tScore\tCategory\tDue Date\nLab\t18/20\tLabs\t11/21/2026\nStudent\tStudent ID\t123456\nContact\tEmail\tstudent@example.invalid', today), [
    { title: 'Quiz', dueDate: '2026-11-20', pointsEarned: 8, maxPoints: 10, category: 'Tests' },
    { title: 'Lab', dueDate: '2026-11-21', pointsEarned: 18, maxPoints: 20, category: 'Labs' }
], 'repeated/reordered headers keep their own column mapping and personal/navigation rows are ignored');
assert.equal(paste.parseAssignments('Assignment\tScore\tStatus\nLab\t18/20\tExcused', today)[0].pointsEarned, null,
    'an excused status takes precedence over a copied score');
assert.equal(paste.parseAssignments('Assignment\nLab\nScore: 18/20\nExcused', today)[0].excused, true);
assert.equal(paste.parseAssignments('AssignmentLabDue: 11/20/2026Comments: not excusedScore18/20', today)[0].pointsEarned, 18,
    'excused mentioned in copied comments does not erase a real score');
assert.equal(paste.parseAssignments('AssignmentLabDue: 11/20/2026ExcusedScore18/20', today)[0].pointsEarned, null,
    'an explicit concatenated status before the score overrides earned points');
assert.equal(paste.parseAssignments('AssignmentLabDue: 11/20/2026Score18/20(90%)Excused', today)[0].pointsEarned, null,
    'an explicit status after the displayed score percentage also overrides earned points');
assert.deepEqual(paste.parseAssignments('Task,Due,Grade\nEssay,11/20/2026,Missing / 10', today), [
    { title: 'Essay', dueDate: '2026-11-20', pointsEarned: null, maxPoints: 10, category: '', missing: true }
], 'alternate CSV headers and missing score markers preserve known points without inventing a zero grade');
assert.equal(paste.inferCourse('honors geometryclassroomgradesassignmentquiz', [geometry]), geometry);
assert.equal(paste.parseDate('February 30, 2026', today), '', 'named dates cannot roll into another month');
assert.equal(paste.parseDate('31 April 2026', today), '');
assert.equal(paste.parseDate('20 November 2026', today), '2026-11-20');
assert.deepEqual(paste.parseCategoryWeights('Homework\nWeight: 25%\nTestsWeight: 75%\n'), [
    { name: 'Homework', weight: 25 }, { name: 'Tests', weight: 75 }
]);
assert.deepEqual(paste.parseCategoryWeights('Category\tWeight\tScore\nHomework\t25%\t8/10\nTests\t75%\t18/20'), [
    { name: 'Homework', weight: 25 }, { name: 'Tests', weight: 75 }
]);
assert.deepEqual(paste.parseCategoryWeights('TestsWeight: 70120/150(80%)HomeworkWeight: 10185/237(78%)'), [],
    'concatenated category totals are not guessed as weights');
assert.deepEqual(paste.parseCategoryWeights('Tests\nWeight: 70%\nTests\nWeight: 75%'), [],
    'conflicting copied weights require manual review');
assert.deepEqual(paste.parseAssignments('Tests\nWeight: 75%\nAssignment\tDue Date\tScore\nQuiz\t11/20/2026\t18/20\n' +
    'Homework\nWeight: 25%\nAssignment\tScore\tDue Date\nPractice\t8/10\t11/21/2026', today).map(item => item.category),
    ['Tests', 'Homework'], 'category context before the first table header and between tables is retained');
assert.deepEqual(paste.parseCourses('Name\tStudent ID\nExample Person\t123456\nCourse\tTeacher\nBiology I\tMs. Example', catalog),
    [{ name: 'Biology I', match: catalog[0] }], 'personal-information tables cannot become the course-name header');

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
        document: { getElementById: node, querySelectorAll: selector => selector.includes('campus-course-index')
            ? app.campusCourseDraft.rows.flatMap((row, index) => row.include ? [{ dataset: { campusCourseIndex: String(index) } }] : [])
            : app.campusAssignmentDraft.rows.flatMap((row, index) => row.include ? [{ dataset: { campusAssignmentIndex: String(index) } }] : []) },
        AppState: { get: key => data[key], set: (key, value) => { data[key] = value; },
            saveStateChanges: changes => Object.assign(data, changes),
            findDuplicateCourse: () => null,
            updateCourse(code, patch) { Object.assign(data.courses.find(course => course.code === code), patch); } },
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
    assert.equal(data.courses[0].categories.find(category => category.id === quiz.categoryId).name, 'Tests',
        'a copied category not already configured is created when confirmed');
    const tests = data.assignments.filter(item => ['Unit Test', 'Review Quiz'].includes(item.title));
    assert.ok(Math.abs(app.calculateCourseGrade(data.courses[0], tests) - 124 / 150 * 100) < 1e-9,
        'multiplied points contribute the correct weight to grade calculations');

    data.assignments = [];
    node('campus-paste-assignments').value = 'Assignment\nQuiz\nMultiplier: 0\nDue: 11/20/2026\nScore: 8/10';
    app.previewCampusAssignments();
    assert.equal(app.campusAssignmentDraft.rows[0].include, false, 'a zero multiplier cannot create a misleading zero-point grade');
    assert.match(node('campus-paste-assignments-preview').innerHTML, /Invalid score multiplier/);

    data.courses = [geometry];
    node('campus-paste-assignment-course').value = '';
    node('campus-paste-assignments').value = 'Honors GeometryClassroomGradesIn-progressTestsWeight: 708/10(80%)AssignmentQuizDue: 11/20/2026Score8/10(80%)';
    app.previewCampusAssignments();
    assert.equal(node('campus-paste-assignment-course').value, 'geo');
    assert.match(node('campus-paste-assignments-status').textContent, /Matched class: Honors Geometry/);
    assert.equal(data.courses[0].categories, undefined, 'preview does not change class categories');
    app.importCampusAssignments();
    assert.equal(data.courses[0].categories[0].name, 'Tests');
    assert.equal(data.courses[0].categories[0].weight, null, 'ambiguous concatenated weights are not guessed');
    const imported = data.assignments.find(item => item.courseCode === 'geo');
    imported.categoryId = null;
    imported.pointsEarned = 9;
    const countBeforeRepair = data.assignments.length;
    node('campus-paste-assignments').value = 'Honors GeometryClassroomGradesIn-progressTestsWeight: 708/10(80%)AssignmentQuizDue: 11/20/2026Score8/10(80%)';
    app.previewCampusAssignments();
    assert.match(node('campus-paste-assignments-preview').innerHTML, /Update category: Tests/);
    app.importCampusAssignments();
    assert.equal(data.assignments.length, countBeforeRepair, 'repairing a category does not duplicate the assignment');
    const repaired = data.assignments.find(item => item.id === imported.id);
    assert.equal(repaired.pointsEarned, 9, 'repairing a category preserves the saved grade');
    assert.equal(repaired.categoryId, data.courses[0].categories[0].id);
    node('campus-paste-assignments').value = 'Honors GeometryClassroomGradesIn-progressHomeworkWeight: 108/10(80%)AssignmentQuizDue: 11/20/2026Score8/10(80%)';
    app.previewCampusAssignments();
    assert.equal(app.campusAssignmentDraft.rows[0].include, false, 'reimport does not overwrite an existing explicit category');
    assert.equal(repaired.categoryId, data.courses[0].categories[0].id);

    data.courses.push({ code: 'other', title: 'Another class' });
    node('campus-paste-assignment-course').value = 'other';
    app.previewCampusAssignments();
    assert.equal(app.campusAssignmentDraft.courseCode, 'other', 'a manual class selection is not overridden by copied headings');

    data.courses = [{ code: 'math', title: 'Math', categories: [{ id: 'hw', name: 'Homework', weight: null }] }];
    data.assignments = [];
    node('campus-paste-assignment-course').value = 'math';
    node('campus-paste-assignments').value = 'Homework\nWeight: 25%\nAssignment\tScore\tCategory\nPractice\t8/10\tHomework\n' +
        'Tests\nWeight: 75%\nAssignment\tCategory\tScore\nQuiz\tTests\t18/20';
    app.previewCampusAssignments();
    assert.equal(app.campusAssignmentDraft.completeWeights, true);
    assert.equal(data.courses[0].categories[0].weight, null, 'preview never changes configured weights');
    node('campus-apply-category-weights').checked = true;
    app.importCampusAssignments();
    assert.deepEqual(data.courses[0].categories.map(item => item.weight), [25, 75],
        'a complete set of explicit weights is applied only after opting in');
    node('campus-apply-category-weights').checked = false;
    data.assignments = [];
    node('campus-paste-assignments').value = 'Assignment\tScore\tCategory\tStatus\nBonus\t5/0\tHomework\t\nExcused lab\t18/20\tTests\tExcused';
    app.previewCampusAssignments();
    assert.ok(app.campusAssignmentDraft.rows.every(row => row.include));
    app.importCampusAssignments();
    assert.equal(data.assignments[0].maxPoints, 0, 'zero-point extra credit survives import');
    assert.equal(data.assignments[0].pointsEarned, 5);
    assert.equal(data.assignments[1].graded, false, 'scored excused work is never counted toward grades');
    assert.equal(data.assignments[1].status, 'completed');
    node('campus-paste-assignments').value = 'Assignment\tScore\tCategory\nAnother quiz\t8/10\tTests';
    app.previewCampusAssignments();
    data.assignments.push({ id: 'late', title: 'Another quiz', dueDate: '', courseCode: 'math' });
    assert.throws(() => app.importCampusAssignments(), /added since the preview/);
    data.assignments = [];
    app.previewCampusAssignments();
    const beforeFailedSave = JSON.stringify(data);
    const saveChanges = sandbox.AppState.saveStateChanges;
    sandbox.AppState.saveStateChanges = () => { throw new Error('Device storage full'); };
    assert.throws(() => app.importCampusAssignments(), /storage full/);
    assert.equal(JSON.stringify(data), beforeFailedSave, 'failed imports never mutate existing course categories or assignment arrays');
    assert.ok(app.campusAssignmentDraft, 'failed saves retain the preview for retry');
    sandbox.AppState.saveStateChanges = saveChanges;
    data.assignments = [{ id: 'repair-moved', title: 'Another quiz', dueDate: '', courseCode: 'math' }];
    app.previewCampusAssignments();
    data.assignments[0].courseCode = 'another-class';
    assert.throws(() => app.importCampusAssignments(), /changed since the preview/,
        'category repairs cannot attach a previous class’s category after an assignment moves');
    assert.equal(data.assignments[0].categoryId, undefined);
    data.assignments = [];
    sandbox.window.StudBudCloud = { user: { id: 'first-account' }, accountVersion: 1 };
    app.previewCampusAssignments();
    sandbox.window.StudBudCloud.user.id = 'second-account';
    assert.throws(() => app.importCampusAssignments(), /Preview again/,
        'an unchanged paste preview cannot import another account’s data');
    assert.equal(data.assignments.length, 0);
    delete sandbox.window.StudBudCloud;
    app.currentSchool = () => 'other';
    app.isParkwaySchool = () => false;
    node('campus-paste-courses').value = 'Class One\nClass Two';
    node('campus-paste-term').value = 'FY';
    app.previewCampusCourses();
    const beforeCourseSave = JSON.stringify(data);
    sandbox.AppState.saveStateChanges = () => { throw new Error('Device storage full'); };
    assert.throws(() => app.importCampusCourses(), /storage full/);
    assert.equal(JSON.stringify(data), beforeCourseSave, 'a failed class batch leaves all existing classes intact');
    let courseSaves = 0;
    sandbox.AppState.saveStateChanges = changes => { courseSaves++; return saveChanges(changes); };
    app.importCampusCourses();
    assert.equal(courseSaves, 1, 'multiple copied classes are persisted as one atomic batch');
    assert.deepEqual(Array.from(data.courses.slice(-2), course => course.title), ['Class One', 'Class Two']);
    sandbox.AppState.saveStateChanges = saveChanges;
    data.courses = [geometry, { code: 'other', title: 'Another class' }];

    const pasteListener = appSource.match(/document\.addEventListener\('paste', event => \{([\s\S]*?)\n\s*\}\);/)[1];
    vm.runInContext(`window.handlePaste = event => {${pasteListener}}`, sandbox);
    sandbox.window.StudBudCampusPaste = { ...paste, tableTextFromHtml: () => 'Assignment\tDue\tScore\nRich table quiz\t11/21/2026\t8/10' };
    const target = node('campus-paste-assignments');
    Object.assign(target, { id: 'campus-paste-assignments', matches: () => true,
        setRangeText(value) { this.value = value; }, dispatchEvent() {} });
    sandbox.Event = class {};
    const pasteEvent = { target, preventDefault() {}, clipboardData: {
        getData: type => type === 'text/plain' ? 'Honors Geometry\nGrades\nAssignment\nRich table quiz' : '<table></table>'
    } };
    node('campus-paste-assignment-course').value = '';
    sandbox.window.handlePaste(pasteEvent);
    assert.equal(node('campus-paste-assignment-course').value, 'geo', 'rich table paste retains the class heading from plain clipboard text');
    app.previewCampusAssignments();
    assert.equal(app.campusAssignmentDraft.rows.length, 1);
    node('campus-paste-assignment-course').value = 'other';
    sandbox.window.handlePaste(pasteEvent);
    assert.equal(node('campus-paste-assignment-course').value, 'other', 'rich table paste respects the selected class');
}

console.log('Campus paste parsing: class matching, assignment scores/dates/categories, deduplication and ignored fields passed.');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
['parkwayData.js', 'data/schools/central.js', 'data/schools/north.js', 'data/schools/south.js', 'data/schools/west.js'].forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file }));
vm.runInContext(fs.readFileSync(path.join(root, 'infiniteCampusImport.js'), 'utf8'), sandbox);
const IC = sandbox.StudBudIC;
const plain = value => JSON.parse(JSON.stringify(value));
const catalog = sandbox.STUDBUD_COURSE_CATALOG;

// Course matching: course numbers first, then abbreviated names
const byNumber = IC.matchCourse('057011-1', 'ENGLISH 1', catalog);
assert.strictEqual(byNumber.method, 'number');
assert.strictEqual(byNumber.course.code, '057011/057012');
const expectTitle = (name, title) => {
    const match = IC.matchCourse('', name, catalog);
    assert.ok(match.course, `${name} should match a catalog course`);
    assert.strictEqual(match.course.title, title, `${name} matched ${match.course.title}`);
};
expectTitle('AP US HISTORY', 'AP United States History');
expectTitle('AP CALC AB', 'AP Calculus AB');
expectTitle('CHEM H', 'Honors Chemistry');
expectTitle('ENGLISH 10 HON', 'English 2, Honors');
expectTitle('AP COMP SCI A', 'AP Computer Science A');
expectTitle('SPANISH III', 'Spanish 3');
expectTitle('ALGEBRA 2', 'Algebra 2');
assert.strictEqual(IC.matchCourse('', 'HOMEROOM', catalog).course, null);

// A realistic collector payload: one year-long class split into S1/S2 sections plus a semester class
const payload = {
    format: IC.FORMAT,
    version: 1,
    exportedAt: '2026-01-20T15:00:00Z',
    source: 'example.infinitecampus.org',
    student: { firstName: 'Sam' },
    enrollments: [
        { calendarID: 77, endYear: 2026, schoolName: 'Parkway Central High' },
        { calendarID: 12, endYear: 2025, schoolName: 'Parkway Central High' }
    ],
    terms: [
        { termID: 1, termName: 'S1', startDate: '2025-08-18', endDate: '2025-12-19', seq: 1 },
        { termID: 2, termName: 'S2', startDate: '2026-01-06', endDate: '2026-05-22', seq: 2 }
    ],
    roster: [
        { sectionID: 501, calendarID: 77, endYear: 2026, courseNumber: '119801', courseName: 'AP CALC AB', teacherDisplay: 'Smith, J', roomName: '210',
            sectionPlacements: [{ termID: 1, periodName: '1', periodSequence: 1, periodScheduleID: 9, periodScheduleName: 'Odd', startTime: '07:35:00', endTime: '08:26:00' }] },
        { sectionID: 502, calendarID: 77, endYear: 2026, courseNumber: '119802', courseName: 'AP CALC AB', teacherDisplay: 'Smith, J', roomName: '210',
            sectionPlacements: [{ termID: 2, periodName: '1', periodSequence: 1, periodScheduleID: 9, periodScheduleName: 'Odd', startTime: '07:35:00', endTime: '08:26:00' }] },
        { sectionID: 600, calendarID: 77, endYear: 2026, courseNumber: '', courseName: 'HEALTH', teacherDisplay: 'Lee, K',
            sectionPlacements: [{ termID: 2, periodName: '2', periodSequence: 2, periodScheduleID: 10, periodScheduleName: 'Even', startTime: '09:00', endTime: '10:30' }] },
        { sectionID: 99, calendarID: 12, endYear: 2025, courseName: 'OLD CLASS', sectionPlacements: [] }
    ],
    grades: [{ calendarID: 77, endYear: 2026, terms: [{ termID: 1, termName: 'S1', courses: [
        { sectionID: 501, courseName: 'AP CALC AB', gradingTasks: [{ termID: 1, taskID: 1, taskName: 'Semester Final', progressScore: 'A', progressPercent: 94.2 }] }
    ] }] }],
    details: {
        501: { details: [{ task: { termID: 1 }, categories: [
            { groupID: 31, name: 'Tests', weight: 70, isWeighted: true, assignments: [
                { objectSectionID: 'a1', assignmentName: 'Unit 1 Test', dueDate: '2025-09-12T05:00:00.000Z', scorePoints: '45', totalPoints: '50', multiplier: 2 }
            ] },
            { groupID: 32, name: 'Homework', weight: 30, isWeighted: true, usePercent: true, assignments: [
                { objectSectionID: 'a2', assignmentName: 'HW 1.1', dueDate: '2025-08-22', scorePoints: '8', totalPoints: '10' },
                { objectSectionID: 'a3', assignmentName: 'HW 1.2', dueDate: '2025-08-25', scorePoints: '0', totalPoints: '10', exempt: true }
            ] },
            { groupID: 33, name: 'Practice', weight: 0, isWeighted: true, isExcluded: true, assignments: [] }
        ] }] }
    },
    assignments: [
        { objectSectionID: 'a4', sectionID: 502, assignmentName: 'Quiz 5.2', dueDate: '2026-02-10', totalPoints: '20', groupID: 31, categoryName: 'Tests' },
        { objectSectionID: 'a1', sectionID: 501, assignmentName: 'Unit 1 Test', dueDate: '2025-09-12T05:00:00.000Z', scorePoints: '45', totalPoints: '50', late: true },
        { objectSectionID: 'x9', sectionID: 99, assignmentName: 'Old work', dueDate: '2024-09-01' }
    ],
    days: {
        77: [
            { date: '2026-01-19', isSchoolDay: false, comments: 'MLK Day' },
            { date: '2026-01-20', isSchoolDay: true, periodScheduleID: 9 },
            { date: '2026-01-21', isSchoolDay: true, periodScheduleID: 10, comments: 'Late Start' }
        ],
        12: [{ date: '2025-01-02', isSchoolDay: true }]
    },
    warnings: []
};

assert.throws(() => IC.parsePayload('not json'), /does not look like/);
assert.throws(() => IC.parsePayload({ ...payload, version: 2 }), /newer version/);
const model = IC.parsePayload(JSON.stringify(payload));
assert.deepStrictEqual(plain(model.sections.map(section => section.id).sort()), ['501', '502', '600'], 'prior-year sections are excluded');
assert.ok(!model.assignments.some(item => item.id === 'x9'));
const unitTest = model.assignments.find(item => item.id === 'a1');
assert.strictEqual(unitTest.multiplier, 2);
assert.strictEqual(unitTest.late, true, 'list-view flags merge into detail assignments');
assert.strictEqual(unitTest.categoryName, 'Tests');
assert.ok(/^2025-09-1[12]$/.test(unitTest.dueDate));
assert.deepStrictEqual(plain(Object.keys(model.calendars)), ['77']);

const plan = IC.buildImportPlan(model, { courses: [] }, { school: 'pchs', catalog });
const calc = plan.classes.find(entry => entry.match?.code === '119801/119802');
assert.ok(calc, 'calc sections match the catalog by course number');
assert.deepStrictEqual(plain(calc.sectionIDs.sort()), ['501', '502'], 'S1 and S2 sections become one class');
assert.strictEqual(calc.term, 'FY');
assert.ok(calc.include);
const health = plan.classes.find(entry => entry.sectionIDs.includes('600'));
assert.strictEqual(health.term, 'S2');

const options = { catalog, today: '2026-01-20', now: 1768900000000 };
{
    const academic = plain(model.sections[0]);
    const defaultsModel = { ...plain(model), assignments: [], sections: [
        { ...academic, id: 'new-academic', name: 'Paleography', courseNumber: 'LOCAL1', grades: [], categories: [] },
        { ...academic, id: 'advisory', name: 'Advisory', courseNumber: '', grades: [], categories: [] },
        { ...academic, id: 'study-hall', name: 'Study Hall', courseNumber: '', grades: [], categories: [] },
        { ...academic, id: 'dropped', name: 'Dropped Academic Class', courseNumber: '', dropped: true, grades: [], categories: [] }
    ] };
    for (const school of ['pchs', 'other']) {
        const saved = { courses: [{ code: 'saved', title: 'Already saved class', school, categories: [] }] };
        const defaults = IC.buildImportPlan(defaultsModel, saved, { school, catalog });
        const entry = defaults.classes.find(entry => entry.sectionIDs.includes('new-academic'));
        assert.equal(entry.match, null, 'fixture is an unmatched local class');
        assert.equal(entry.include, true, 'unmatched academic classes with no grades import by default at any school');
        for (const section of ['advisory', 'study-hall', 'dropped']) {
            assert.equal(defaults.classes.find(entry => entry.sectionIDs.includes(section)).include, false,
                `${section} remains skipped by default`);
        }
        const imported = IC.applyImportPlan(defaultsModel, defaults, saved, options);
        assert.equal(imported.summary.coursesAdded, 1);
        assert.equal(imported.courses[1].title, entry.name, 'unmatched classes keep the Campus name');
        assert.equal(IC.applyImportPlan(defaultsModel, defaults, saved, {
            ...options, overrides: { [entry.key]: 'skip' }
        }).summary.coursesAdded, 0, 'explicit skip still overrides automatic inclusion');
    }
}
{
    const biologyModel = plain(model);
    biologyModel.sections = biologyModel.sections.filter(section => ['501', '502'].includes(section.id));
    biologyModel.sections.forEach(section => { section.name = 'HON BIO'; section.courseNumber = '137141'; });
    const existing = { code: 'my-honors-bio', title: 'Honors Biology', school: 'pchs', isWeighted: true,
        credits: 1, targetPct: 93, category: 'Science', categories: [] };
    const state = { courses: [existing], assignments: [], schedule: {} };
    const updatePlan = IC.buildImportPlan(biologyModel, state, { school: 'pchs', catalog });
    assert.equal(updatePlan.classes[0].existingCode, existing.code, 'existing title wins over a conflicting catalog number');
    const updated = IC.applyImportPlan(biologyModel, updatePlan, state, options);
    assert.equal(updated.courses.length, 1, 'grade refresh does not add a catalog duplicate');
    assert.equal(updated.courses[0].title, 'Honors Biology');
    assert.equal(updated.courses[0].isWeighted, true);
    assert.equal(updated.courses[0].targetPct, 93);
    assert.ok(updated.assignments.some(item => item.courseCode === existing.code), 'grades go to the existing class');
    assert.equal(updated.summary.coursesAdded, 0);
    const again = IC.buildImportPlan(biologyModel, updated, { school: 'pchs', catalog });
    assert.equal(IC.applyImportPlan(biologyModel, again, updated, options).courses.length, 1, 'refresh stays idempotent');

    const unrelated = IC.buildImportPlan(model, state, { school: 'pchs', catalog });
    assert.ok(unrelated.classes.every(entry => entry.include), 'active academic classes default to import even when other classes already exist');
    const added = IC.applyImportPlan(model, unrelated, state, options);
    assert.equal(added.summary.coursesAdded, unrelated.classes.length);
    assert.equal(added.courses[0].code, existing.code, 'adding new classes preserves unrelated saved classes');
    const refreshed = IC.applyImportPlan(model, IC.buildImportPlan(model, added, { school: 'pchs', catalog }), added, options);
    assert.equal(refreshed.summary.coursesAdded, 0, 'subsequent imports update recognized classes instead of adding duplicates');
    const calcEntry = unrelated.classes.find(entry => entry.sectionIDs.includes('501'));
    const redirected = IC.applyImportPlan(model, unrelated, state, {
        ...options, overrides: { [calcEntry.key]: `existing:${existing.code}`, [health.key]: 'skip' }
    });
    assert.equal(redirected.courses.length, 1, 'manual matching selects an existing class instead of adding');
    assert.equal(redirected.courses[0].title, existing.title, 'manual matching preserves the existing identity');
    assert.ok(redirected.assignments.some(item => item.courseCode === existing.code));
    const mistaken = { code: 'wrong-bio', title: 'Biology and environmental science', school: 'pchs',
        icSectionIDs: ['501', '502'], icName: 'HON BIO', categories: [] };
    const incorrectState = { ...state, courses: [mistaken, existing] };
    const correctionPlan = IC.buildImportPlan(biologyModel, incorrectState, { school: 'pchs', catalog });
    const corrected = IC.applyImportPlan(biologyModel, correctionPlan, incorrectState, {
        ...options, overrides: { [correctionPlan.classes[0].key]: `existing:${existing.code}` }
    });
    assert.equal(corrected.courses.length, 2, 'correcting a mapping does not delete another saved class');
    assert.equal(corrected.courses[0].icSectionIDs.length, 0, 'the old class releases remapped Campus sections');
    assert.equal(mistaken.icSectionIDs.length, 2, 'the import does not mutate saved state before commit');
    assert.equal(IC.buildImportPlan(biologyModel, corrected, { school: 'pchs', catalog }).classes[0].existingCode, existing.code,
        'the next import remembers the corrected existing-class mapping');
    assert.throws(() => IC.applyImportPlan(model, unrelated, state, {
        ...options, overrides: { [calcEntry.key]: 'existing:deleted-class' }
    }), /no longer available/);
    const anotherSchool = { ...existing, school: 'pnhs' };
    assert.ok(!IC.buildImportPlan(biologyModel, { courses: [anotherSchool] }, { school: 'pchs', catalog })
        .classes.some(entry => entry.existingCode), 'never targets a retained class from another school');
}
const first = IC.applyImportPlan(model, plan, { courses: [], assignments: [], schedule: { all: { 8: 'KEEP' } } }, options);
assert.equal(first.schedule.ic.school, 'pchs', 'imported calendar dates stay tied to the selected school');
assert.deepStrictEqual(plain(first.schedule.ic.terms), plain(model.terms), 'term dates are retained for automatic semester and school-year boundaries');
const semesterPlan = plain(plan);
semesterPlan.classes.find(entry => entry.key === calc.key).term = 'S1';
const semesterOnly = IC.applyImportPlan(model, semesterPlan, {}, options);
assert.equal(semesterOnly.courses.find(course => course.catalogCode === '119801/119802').credits, 0.5,
    'a single semester of an annual catalog class imports only half the annual credits');
const calcCourse = first.courses.find(course => course.catalogCode === '119801/119802');
assert.strictEqual(calcCourse.title, 'AP Calculus AB');
assert.strictEqual(calcCourse.isWeighted, true);
assert.strictEqual(calcCourse.category, 'Math');
assert.deepStrictEqual(plain(calcCourse.categories.map(category => [category.name, category.weight])), [['Tests', 70], ['Homework', 30], ['Practice', 0]]);
const imported = id => first.assignments.find(item => item.id === `ic_${id}`);
assert.deepStrictEqual(plain([imported('a1').pointsEarned, imported('a1').maxPoints, imported('a1').graded]), [90, 100, true], 'multiplier scales points');
assert.deepStrictEqual(plain([imported('a2').pointsEarned, imported('a2').maxPoints]), [80, 100], 'percent categories score out of 100');
assert.strictEqual(imported('a3'), undefined, 'exempt work is not imported');
assert.strictEqual(imported('a4'), undefined, 'ungraded upcoming work is not imported');
assert.strictEqual(imported('a1').kind, 'test');
{
    const cases = [
        ['Quiz 2', 'Summative Assessments', 'quiz'],
        ['Unit Test Review', 'Tests', 'assignment'],
        ['Quiz Corrections', 'Quizzes', 'assignment'],
        ['Final Project', 'Summative', 'assignment'],
        ['Exam study guide', 'Assessments', 'assignment'],
        ['Unit 3 Exam', 'Homework', 'test'],
        ['Chapter 5', 'Quizzes', 'quiz'],
        ['Daily work', 'Tests and Quizzes', 'assignment']
    ];
    for (const [title, categoryName, kind] of cases) {
        const changed = { ...model, assignments: [{ ...model.assignments[0], title, categoryName, categoryID: '' }] };
        const result = IC.applyImportPlan(changed, plan, { courses: [], assignments: [], schedule: {} }, options);
        assert.equal(result.assignments[0].kind, kind, `${title} in ${categoryName} is classified by the actual task`);
    }
    const correctedModel = { ...model, assignments: [{ ...model.assignments[0], title: 'Unit Test Review', categoryName: 'Tests' }] };
    const oldRecord = { ...first.assignments.find(item => item.id === `ic_${model.assignments[0].id}`), title: 'Unit Test Review', kind: 'test' };
    delete oldRecord.icKind;
    const repaired = IC.applyImportPlan(correctedModel, plan, { courses: first.courses, assignments: [oldRecord], schedule: {} }, options);
    assert.equal(repaired.assignments[0].kind, 'assignment', 'reimport repairs the legacy test-review misclassification');
}
assert.strictEqual(first.schedule.all['1'], calcCourse.code);
assert.strictEqual(first.schedule.all['8'], 'KEEP', 'unrelated periods are kept');
assert.strictEqual(first.summary.coursesAdded, 2);
for (const isWeighted of [undefined, false]) {
    const namedPayload = plain(payload);
    Object.values(namedPayload.details).forEach(detail => detail.details.forEach(entry => entry.categories.forEach(category => {
        delete category.weight;
        if (isWeighted === undefined) delete category.isWeighted;
        else category.isWeighted = isWeighted;
        category.isExcluded = false;
    })));
    const namedModel = IC.parsePayload(namedPayload);
    const namedPlan = IC.buildImportPlan(namedModel, { courses: [] }, { school: 'pchs', catalog });
    const named = IC.applyImportPlan(namedModel, namedPlan, { courses: [], assignments: [], schedule: {} }, options);
    assert.ok(named.courses.flatMap(course => course.categories).every(category => category.weight === null),
        'category names without weights stay unweighted, not 0%');
    const repairedPlan = IC.buildImportPlan(namedModel, { courses: first.courses }, { school: 'pchs', catalog });
    const repaired = IC.applyImportPlan(namedModel, repairedPlan, { courses: first.courses, assignments: first.assignments, schedule: first.schedule }, options);
    assert.ok(repaired.courses.flatMap(course => course.categories).every(category => category.weight === null),
        're-import repairs previously weighted categories when Campus no longer supplies weights');
}

// Re-importing updates in place and keeps the student's own edits
const upcomingQuiz = { id: 'ic_a4', title: 'My upcoming quiz', courseCode: calcCourse.code,
    dueDate: '2026-02-11', graded: false, status: 'pending', estimatedMinutes: 120, kind: 'test' };
const edited = [...first.assignments, upcomingQuiz];
const replan = IC.buildImportPlan(model, { courses: first.courses }, { school: 'pchs', catalog });
assert.ok(replan.classes.every(entry => entry.existingCode));
const second = IC.applyImportPlan(model, replan, { courses: first.courses, assignments: edited, schedule: first.schedule }, options);
assert.strictEqual(second.courses.length, first.courses.length);
assert.strictEqual(second.assignments.length, edited.length);
assert.strictEqual(second.courses.find(course => course.code === calcCourse.code).categories.length, 3);
const keptQuiz = second.assignments.find(item => item.id === 'ic_a4');
assert.deepStrictEqual(plain([keptQuiz.estimatedMinutes, keptQuiz.kind]), [120, 'test']);
assert.deepStrictEqual(plain(keptQuiz), upcomingQuiz, 'reimport leaves the entire upcoming assignment unchanged');
assert.strictEqual(second.summary.coursesUpdated, 2);

// Citizenship is a separate grading task, not an academic category.
{
    const academicPayload = plain(payload);
    academicPayload.roster = academicPayload.roster.filter(section => section.sectionID === 501);
    academicPayload.grades = [{ calendarID: 77, endYear: 2026, courses: [{
        sectionID: 501, courseName: 'AP CALC AB', gradingTasks: [
            { termID: 1, taskID: 1, taskName: 'Progress', progressPercent: 74.67, progressScore: 'C' },
            { termID: 1, taskID: 9, taskName: 'Citizenship', progressPercent: 100, progressScore: 'S' }
        ]
    }] }];
    academicPayload.details = { 501: { details: [
        { task: { taskID: 1, taskName: 'Progress', termID: 1 }, categories: [
            { groupID: 10, name: 'Tests', weight: 60, isWeighted: true, assignments: [
                { objectSectionID: 'test', assignmentName: 'Unit test', scorePoints: 8, totalPoints: 10, multiplier: 2 }
            ] },
            { groupID: 20, name: 'Homework', weight: 40, isWeighted: true, usePercent: true, assignments: [
                { objectSectionID: 'homework1', assignmentName: 'Homework 1', scorePoints: 10, totalPoints: 20, multiplier: 2 },
                { objectSectionID: 'homework2', assignmentName: 'Homework 2', scorePoints: 10, totalPoints: 10 }
            ] }
        ] },
        { task: { taskID: 9, taskName: '(1) Citizenship', termID: 1 }, categories: [
            { groupID: 99, name: 'Practice', weight: 100, isWeighted: true, assignments: [
                { objectSectionID: 'citizen', assignmentName: 'Safety Contract and Syllabus', scorePoints: 10, totalPoints: 10 }
            ] },
            { groupID: 20, name: 'Homework', weight: 100, assignments: [
                { objectSectionID: 'citizen-shared-group', assignmentName: 'Behavior task', scorePoints: 10, totalPoints: 10 }
            ] }
        ] }
    ] } };
    academicPayload.assignments = [
        { sectionID: 501, objectSectionID: 'citizen', assignmentName: 'Safety Contract and Syllabus', scorePoints: 10, totalPoints: 10 },
        { sectionID: 501, objectSectionID: 'citizen-shared-group', groupID: 20, assignmentName: 'Behavior task', scorePoints: 10, totalPoints: 10 },
        { sectionID: 501, objectSectionID: 'citizen-list', groupID: 99, assignmentName: 'Citizenship list-only work', scorePoints: 10, totalPoints: 10 },
        { sectionID: 501, objectSectionID: 'citizen-task', taskID: 9, assignmentName: 'Task-only work', scorePoints: 10, totalPoints: 10 },
        { sectionID: 501, objectSectionID: 'future', assignmentName: 'Upcoming quiz', dueDate: '2026-02-10', totalPoints: 20 },
        { sectionID: 501, objectSectionID: 'past', assignmentName: 'Old unscored work', dueDate: '2025-09-01', totalPoints: 20, turnedIn: true }
    ];
    const academicModel = IC.parsePayload(academicPayload);
    assert.deepStrictEqual(plain(academicModel.assignments.map(item => item.id).sort()),
        ['future', 'homework1', 'homework2', 'past', 'test']);
    assert.deepStrictEqual(plain(academicModel.sections[0].grades.map(grade => grade.task)), ['Progress']);
    assert.deepStrictEqual(plain(academicModel.sections[0].categories.map(category => [category.name, category.weight])), [['Tests', 60], ['Homework', 40]]);
    const academicPlan = IC.buildImportPlan(academicModel, {}, { school: 'pchs', catalog });
    const academic = IC.applyImportPlan(academicModel, academicPlan, {}, options);
    assert.equal(academic.assignments.length, 3, 'only academic graded assignments are imported');
    const homework = academic.assignments.find(item => item.id === 'ic_homework1');
    assert.deepStrictEqual(plain([homework.pointsEarned, homework.maxPoints]), [100, 200],
        'percent-based categories preserve assignment multipliers');
    const academicCourse = academic.courses[0];
    for (const item of academic.assignments) {
        assert.equal(academicCourse.categories.find(category => category.id === item.categoryId).name,
            item.id === 'ic_test' ? 'Tests' : 'Homework');
    }
    const gradeSandbox = { console, Date, Math, window: {}, localDateKey: () => options.today,
        AppState: { get: key => ({ courses: academic.courses, assignments: academic.assignments }[key]) } };
    vm.createContext(gradeSandbox);
    const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    vm.runInContext(appSource.slice(appSource.indexOf('    class AppOrchestrator'), appSource.indexOf('    window.NexusApp =')), gradeSandbox);
    const app = vm.runInContext('Object.create(AppOrchestrator.prototype)', gradeSandbox);
    assert.ok(Math.abs(app.calculateCourseGrade(academicCourse) - (80 * .6 + (200 / 300 * 100) * .4)) < 1e-9,
        'the actual app computes Campus category weighting and percent/multiplier totals correctly');
    const oldCitizen = { id: 'ic_citizen', source: 'infinite-campus', courseCode: academicCourse.code,
        categoryId: 'category_ic_99', graded: true, pointsEarned: 10, maxPoints: 10 };
    const oldCourse = { ...academicCourse, categories: [...academicCourse.categories,
        { id: 'category_ic_99', name: 'Practice', weight: 100 }] };
    const savedFuture = { id: 'ic_future', source: 'infinite-campus', courseCode: oldCourse.code,
        title: 'My title', dueDate: '2026-03-01', status: 'completed', graded: false, notes: 'Keep all of this', categoryId: oldCourse.categories[0].id };
    const ownTask = { ...savedFuture, id: 'manual', title: 'My own task' };
    const repairedPlan = IC.buildImportPlan(academicModel, { courses: [oldCourse] }, { school: 'pchs', catalog });
    const repaired = IC.applyImportPlan(academicModel, repairedPlan, { courses: [oldCourse],
        assignments: [...academic.assignments, oldCitizen, savedFuture, ownTask] }, { ...options, upcoming: true });
    assert.ok(!repaired.assignments.some(item => item.id === 'ic_citizen'), 'reimport removes positively identified old Citizenship work');
    assert.ok(!repaired.courses[0].categories.some(category => category.id === 'category_ic_99'), 'unused old Citizenship weights are removed');
    assert.deepStrictEqual(plain(repaired.assignments.find(item => item.id === 'ic_future')), savedFuture);
    assert.deepStrictEqual(plain(repaired.assignments.find(item => item.id === 'manual')), ownTask);
    assert.ok(!repaired.assignments.some(item => item.id === 'ic_past'), 'an old due date does not invent completed work');
    const exemptModel = plain(academicModel);
    exemptModel.assignments.find(item => item.id === 'test').exempt = true;
    const exemptResult = IC.applyImportPlan(exemptModel,
        IC.buildImportPlan(exemptModel, { courses: academic.courses }, { school: 'pchs', catalog }), academic, options);
    assert.equal(exemptResult.assignments.find(item => item.id === 'ic_test'), undefined,
        'a newly exempt Campus score is removed from graded work after reimport');
    assert.ok(Math.abs(app.calculateCourseGrade(exemptResult.courses[0], exemptResult.assignments) - 200 / 300 * 100) < 1e-9);

    const missingPayload = plain(academicPayload);
    missingPayload.details[501].details[0].categories[0].assignments.push(
        { objectSectionID: 'missing-zero', assignmentName: 'Missing zero', scorePoints: 0, totalPoints: 10, missing: true, dueDate: '2099-01-01' },
        { objectSectionID: 'missing-partial', assignmentName: 'Missing partial', scorePoints: 4, totalPoints: 10, missing: true },
        { objectSectionID: 'missing-unscored', assignmentName: 'Missing without score', totalPoints: 10, missing: true }
    );
    const missingModel = IC.parsePayload(missingPayload);
    const missingPlan = IC.buildImportPlan(missingModel, {}, { school: 'pchs', catalog });
    const missing = IC.applyImportPlan(missingModel, missingPlan, {}, options);
    for (const id of ['missing-zero', 'missing-partial', 'missing-unscored']) {
        const item = missing.assignments.find(item => item.id === `ic_${id}`);
        assert.equal(item.status, 'pending');
        assert.equal(item.icMissing, true);
        assert.equal(app.assignmentState(item), 'overdue', 'Campus missing overrides date and scored state');
        assert.equal(app.isOpenAssignment(item), true);
    }
    assert.equal(missing.assignments.find(item => item.id === 'ic_missing-zero').graded, true);
    assert.equal(missing.assignments.find(item => item.id === 'ic_missing-partial').pointsEarned, 4);
    assert.equal(missing.assignments.find(item => item.id === 'ic_missing-unscored').graded, false,
        'missing without a Campus score never fabricates a graded zero');
    assert.ok(Math.abs(app.calculateCourseGrade(missing.courses[0], missing.assignments) - (50 * .6 + (200 / 300 * 100) * .4)) < 1e-9,
        'scored missing work counts in the academic grade while unscored missing work does not');
    const resolvedModel = plain(missingModel);
    resolvedModel.assignments.forEach(item => { item.missing = false; });
    const resolved = IC.applyImportPlan(resolvedModel, IC.buildImportPlan(resolvedModel, { courses: missing.courses }, { school: 'pchs', catalog }),
        missing, options);
    assert.equal(resolved.assignments.find(item => item.id === 'ic_missing-zero').icMissing, false);
    assert.equal(resolved.assignments.find(item => item.id === 'ic_missing-zero').status, 'completed');

    const termPayload = plain(academicPayload);
    termPayload.details[501].details.push({ task: { taskID: 1, taskName: 'Progress', termID: 2 }, categories: [
        { groupID: 10, name: 'Tests', weight: 80, isWeighted: true, assignments: [
            { objectSectionID: 's2test', assignmentName: 'Semester 2 Test', scorePoints: 9, totalPoints: 10 }
        ] },
        { groupID: 20, name: 'Homework', weight: 20, isWeighted: true, assignments: [
            { objectSectionID: 's2hw', assignmentName: 'Semester 2 Homework', scorePoints: 5, totalPoints: 10 }
        ] }
    ] });
    const termModel = IC.parsePayload(termPayload);
    const termPlan = IC.buildImportPlan(termModel, {}, { school: 'pchs', catalog });
    const termResult = IC.applyImportPlan(termModel, termPlan, {}, options);
    const termCourse = termResult.courses[0];
    const s1Test = termResult.assignments.find(item => item.id === 'ic_test');
    const s2Test = termResult.assignments.find(item => item.id === 'ic_s2test');
    assert.notEqual(s1Test.categoryId, s2Test.categoryId, 'same-named categories with reused Campus IDs keep their grading-term identity');
    assert.equal(termCourse.categories.find(category => category.id === s1Test.categoryId).weight, 60);
    assert.equal(termCourse.categories.find(category => category.id === s2Test.categoryId).weight, 80);
    const s2Work = termResult.assignments.filter(item => item.id.startsWith('ic_s2'));
    assert.ok(Math.abs(app.calculateCourseGrade(termCourse, s2Work) - 82) < 1e-9,
        'semester 2 uses its own 80/20 weights instead of the semester 1 weights');
}

// Overrides: skip a class or keep the Campus name
const skipped = IC.applyImportPlan(model, plan, { courses: [], assignments: [], schedule: {} }, { ...options, overrides: { [health.key]: 'skip', [calc.key]: '' } });
assert.strictEqual(skipped.courses.length, 1);
assert.strictEqual(skipped.courses[0].title, 'AP Calc AB');
assert.ok(skipped.courses[0].code.startsWith('IC_'));

// Daily schedule from imported data
const ic = first.schedule.ic;
assert.ok(IC.hasImportedSchedule(ic));
const holiday = IC.scheduleForDate(ic, new Date(2026, 0, 19), first.courses);
assert.deepStrictEqual(plain([holiday.school, holiday.note, holiday.entries.length]), [false, 'MLK Day', 0]);
const oddDay = IC.scheduleForDate(ic, new Date(2026, 0, 20), first.courses);
assert.strictEqual(oddDay.school, true);
assert.deepStrictEqual(plain(oddDay.entries.map(entry => [entry.period, entry.time, entry.course.title])), [['1st Period', '7:35 AM - 8:26 AM', 'AP Calculus AB']]);
const evenDay = IC.scheduleForDate(ic, new Date(2026, 0, 21), first.courses);
assert.strictEqual(evenDay.note, 'Late Start');
assert.deepStrictEqual(plain(evenDay.entries.map(entry => entry.time)), ['9:00 AM - 10:30 AM']);
assert.strictEqual(IC.scheduleForDate(ic, new Date(2026, 0, 24), first.courses), null, 'weekends outside the calendar have no schedule');
assert.strictEqual(IC.scheduleForDate(undefined, new Date(2026, 0, 20), first.courses), null);

// The helper scripts build into runnable code
const bookmarklet = IC.buildBookmarklet('https://studbud.example');
assert.ok(bookmarklet.startsWith('javascript:'));
new vm.Script(decodeURIComponent(bookmarklet.slice('javascript:'.length)));
new vm.Script(IC.buildConsoleScript(''));

async function mobileImport() {
    const elements = new Map();
    const element = () => ({
        value: '', open: false, dataset: {}, classList: { toggle() {}, contains: () => false },
        setAttribute(name, value) { this[name] = value; },
        closest() { return { open: false }; },
        focus() { this.focused = true; },
        select() { this.selected = true; },
        setSelectionRange(start, end) { this.selection = [start, end]; }
    });
    for (const id of ['ic-bookmarklet-link', 'ic-bookmarklet-url', 'ic-mobile-instructions',
        'ic-mobile-recommendation', 'ic-website-method', 'ic-district-url', 'ic-import-modal',
        'ic-import-status']) elements.set(id, element());
    sandbox.document = { getElementById: id => elements.get(id) || null };
    sandbox.localStorage = { getItem: () => null };
    sandbox.location = { protocol: 'https:', origin: 'https://studbud.example' };
    sandbox.matchMedia = () => ({ matches: true });
    sandbox.navigator = { clipboard: { writeText: async text => { sandbox.copied = text; } } };
    const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    vm.runInContext(appSource.slice(appSource.indexOf('    function localDateKey'), appSource.indexOf('    window.NexusApp ='))
        + '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
    const app = sandbox.app;
    app.currentSchool = () => 'other';
    app.openModal = () => {};
    app.openInfiniteCampusImport();
    assert.strictEqual(elements.get('ic-mobile-instructions').open, true, 'phone setup instructions open automatically');
    assert.strictEqual(elements.get('ic-mobile-recommendation').open, true, 'phones first explain the easier computer-and-sync alternative');
    assert.strictEqual(elements.get('ic-website-method').open, false, 'technical steps do not overwhelm the phone introduction');
    sandbox.matchMedia = () => ({ matches: false });
    app.openInfiniteCampusImport();
    assert.strictEqual(elements.get('ic-website-method').open, true, 'desktop users see the working website import steps');
    assert.strictEqual(elements.get('ic-mobile-recommendation').open, false);
    assert.strictEqual(elements.get('ic-bookmarklet-url').value, bookmarklet);
    await app.copyInfiniteCampusBookmarklet();
    assert.strictEqual(sandbox.copied, bookmarklet, 'phone users copy the runnable bookmark URL, not a console-only script');
    sandbox.navigator.clipboard.writeText = async () => { throw new Error('denied'); };
    await app.copyInfiniteCampusBookmarklet();
    assert.strictEqual(elements.get('ic-bookmarklet-url').selected, true);
    assert.deepStrictEqual(elements.get('ic-bookmarklet-url').selection, [0, bookmarklet.length]);
    assert.match(elements.get('ic-import-status').textContent, /tap and hold/);
    let preview, ack;
    app.previewInfiniteCampusData = value => { preview = IC.parsePayload(value); return true; };
    app.icAllowedOrigin = 'https://district.infinitecampus.org';
    sandbox.focus = () => {};
    app.handleInfiniteCampusMessage({ origin: app.icAllowedOrigin, data: payload,
        source: { postMessage(message, origin) { ack = { message, origin }; } } });
    assert.strictEqual(preview.sections.length, 3, 'direct sending reaches the same review importer');
    assert.equal(ack.message.format, IC.ACK_FORMAT);
    assert.equal(ack.origin, app.icAllowedOrigin);
    preview = null;
    app.handleInfiniteCampusMessage({ origin: 'https://untrusted.example', data: payload });
    assert.equal(preview, null, 'untrusted websites cannot send an import');
    ack = null;
    app.previewInfiniteCampusData = () => false;
    app.handleInfiniteCampusMessage({ origin: app.icAllowedOrigin, data: payload,
        source: { postMessage() { ack = true; } } });
    assert.equal(ack, null, 'failed previews are not acknowledged as successful transfers');
    const steps = app.tutorialSteps();
    assert.strictEqual(steps[1].title, 'Save your classes', 'Campus import is early in the shorter hands-on guide');
    assert.strictEqual(steps.filter(step => step.action?.includes('open-ic-import')).length, 1);
    assert.match(steps[1].text, /phone/);
    assert.equal(steps.length, 8, 'the basic guide stays short');
    assert.ok(steps.every(step => step.text.length <= 210), 'each step gives one short instruction');
    assert.equal(steps.filter(step => step.action || step.change).length, 7, 'steps point to actions rather than pages of explanation');

    class HelperElement {
        constructor(tag) { this.tag = tag; this.children = []; this.handlers = {}; this.style = {}; }
        append(...children) { this.children.push(...children); }
        appendChild(child) { this.children.push(child); }
        setAttribute(name, value) { this[name] = value; }
        addEventListener(name, handler) { this.handlers[name] = handler; }
        querySelector(tag) { return this.children.find(child => child.tag === tag) || null; }
        focus() { this.focused = true; }
        select() { this.selected = true; }
        setSelectionRange(start, end) { this.selection = [start, end]; }
        remove() {}
    }
    const body = new HelperElement('body');
    const timers = new Map(), listeners = new Map();
    let timerId = 0;
    const collectorSandbox = {
        console, URL, Blob, Set, location: { origin: 'https://district.infinitecampus.org', pathname: '/campus/portal/students' },
        document: { body, getElementById: () => null, createElement: tag => new HelperElement(tag), execCommand: () => false },
        setTimeout: handler => { timers.set(++timerId, handler); return timerId; },
        clearTimeout: id => timers.delete(id),
        fetch: async url => ({
            ok: true, status: 200,
            text: async () => JSON.stringify(url.endsWith('api/portal/students')
                ? [{ personID: 1, firstName: 'Sam', enrollments: [] }] : [])
        })
    };
    collectorSandbox.window = { opener: null, addEventListener(name, handler) { listeners.set(name, handler); },
        removeEventListener(name, handler) { if (listeners.get(name) === handler) listeners.delete(name); } };
    vm.createContext(collectorSandbox);
    await vm.runInContext(IC.buildConsoleScript('https://studbud.example'), collectorSandbox);
    const box = body.children.find(child => child.id === 'studbud-ic-overlay');
    assert.match(box.style.cssText, /box-sizing:border-box/);
    assert.match(box.style.cssText, /max-height:calc\(100dvh - 32px\)/);
    assert.match(box.style.cssText, /overflow-y:auto/);
    const actions = box.children[2];
    assert.ok(actions.children.every(button => button.style.cssText.includes('min-height:44px')));
    assert.deepEqual(actions.children.map(child => child.textContent), ['Send to StudBud', 'Close']);
    const sendButton = actions.children[0];
    sendButton.handlers.click();
    assert.match(box.children[1].textContent, /Open Infinite Campus button/);
    const sent = [];
    const opener = collectorSandbox.window.opener = { postMessage: (data, origin) => sent.push({ data, origin }) };
    sendButton.handlers.click();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].origin, 'https://studbud.example');
    assert.equal(sent[0].data.format, IC.FORMAT);
    assert.match(box.children[1].textContent, /Sending to StudBud/);
    listeners.get('message')({ origin: 'https://evil.example', source: opener, data: { format: IC.ACK_FORMAT } });
    assert.equal(timers.size, 1, 'untrusted acknowledgements cannot fake success');
    listeners.get('message')({ origin: 'https://studbud.example', source: {}, data: { format: IC.ACK_FORMAT } });
    assert.equal(timers.size, 1, 'the acknowledgement must come from the StudBud tab');
    [...timers.values()][0]();
    assert.match(box.children[1].textContent, /has not confirmed receipt/);
    sendButton.handlers.click();
    assert.equal(sent.length, 2, 'sending can retry without collecting or saving twice');
    listeners.get('message')({ origin: 'https://studbud.example', source: opener, data: { format: IC.ACK_FORMAT } });
    assert.match(box.children[1].textContent, /StudBud received/);
    assert.equal(timers.size, 0);
    opener.closed = true;
    sendButton.handlers.click();
    assert.match(box.children[1].textContent, /reconnect/);
    collectorSandbox.window.opener = { postMessage() { throw new Error('Disconnected'); } };
    sendButton.handlers.click();
    assert.match(box.children[1].textContent, /Could not send/);
    assert.equal(timers.size, 0, 'failed sends do not leave receipt timers running');
    collectorSandbox.window.opener = opener;
    opener.closed = false;
    sendButton.handlers.click();
    assert.equal(timers.size, 1);
    collectorSandbox.document.getElementById = () => box;
    await vm.runInContext(IC.buildConsoleScript('https://studbud.example'), collectorSandbox);
    assert.equal(timers.size, 0, 'rerunning the helper cleans up the previous send');
    assert.equal(listeners.size, 1, 'rerunning replaces the old listener');
    const replacementActions = body.children[body.children.length - 1].children[2];
    replacementActions.children[0].handlers.click();
    assert.equal(timers.size, 1);
    replacementActions.children[1].handlers.click();
    assert.equal(timers.size, 0, 'closing the helper clears pending receipt timers');
    actions.children[1].handlers.click();
    assert.equal(listeners.size, 0, 'closing the helper removes transfer listeners');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /ic-transfer-method|ic-import-file|ic-import-textarea|ic-copy-script-btn|ic-paste-clipboard-btn/);
    assert.match(html, /choose <strong>Send to StudBud<\/strong>/);
    // Regression: Parkway only gives A+ in weighted (Honors/AP) classes. A regular Campus class must not
// auto-match a weighted catalog course, and its 97%+ grade must show as A.
{
    const regular = IC.matchCourse('', 'FRENCH 4', catalog);
    assert.strictEqual(regular.course, null, `FRENCH 4 must not auto-match ${regular.course?.title}`);
    assert.ok(regular.suggestions.some(course => course.title === 'Honors French 4'), 'the Honors course is still offered as a suggestion');
    assert.strictEqual(IC.matchCourse('', 'HONORS DRAWING', catalog).course, null, 'an Honors Campus class must not match a regular catalog course');
    assert.ok(IC.looksWeighted('ENGLISH 10 HON') && IC.looksWeighted('CHEM H') && IC.looksWeighted('AP SEMINAR') && IC.looksWeighted('DUAL CREDIT ENG'));
    assert.ok(!IC.looksWeighted('FRENCH 4') && !IC.looksWeighted('HEALTH') && !IC.looksWeighted('CHEMISTRY'));

    const regularPayload = {
        ...payload,
        roster: [
            { sectionID: 801, calendarID: 77, endYear: 2026, courseNumber: '', courseName: 'FRENCH 4', teacherDisplay: 'Roy, A', sectionPlacements: [{ termID: 1, periodName: '3' }] },
            { sectionID: 802, calendarID: 77, endYear: 2026, courseNumber: '', courseName: 'HONORS DRAWING', teacherDisplay: 'Fox, B', sectionPlacements: [{ termID: 1, periodName: '4' }] }
        ],
        grades: [], details: {},
        assignments: [
            { objectSectionID: 'r1', sectionID: 801, assignmentName: 'Quiz 1', dueDate: '2025-09-10', scorePoints: '98', totalPoints: '100' },
            { objectSectionID: 'r2', sectionID: 802, assignmentName: 'Sketch 1', dueDate: '2025-09-10', scorePoints: '98', totalPoints: '100' }
        ]
    };
    const regularModel = IC.parsePayload(regularPayload);
    const regularPlan = IC.buildImportPlan(regularModel, { courses: [] }, { school: 'pchs', catalog });
    const imported = IC.applyImportPlan(regularModel, regularPlan, { courses: [], assignments: [], schedule: {} }, options);
    const french = imported.courses.find(course => course.icSectionIDs.includes('801'));
    const drawing = imported.courses.find(course => course.icSectionIDs.includes('802'));
    assert.strictEqual(french.catalogCode, '');
    assert.strictEqual(french.isWeighted, false, 'a regular Campus class imports unweighted');
    assert.strictEqual(drawing.isWeighted, true, 'an Honors Campus class imports weighted');
    assert.strictEqual(sandbox.studbudGradeForPercentage(98, french), 'A', 'unweighted Parkway classes cap at A');
    assert.strictEqual(sandbox.studbudGradeForPercentage(98, drawing), 'A+', 'weighted Parkway classes can earn A+');
    assert.strictEqual(sandbox.studbudGradeForPercentage(98, calcCourse), 'A+');

    // Choosing the Honors catalog course in the preview still marks the class weighted.
    const chosen = IC.applyImportPlan(regularModel, regularPlan, { courses: [], assignments: [], schedule: {} },
        { ...options, overrides: { [regularPlan.classes.find(entry => entry.sectionIDs.includes('801')).key]: catalog.find(course => course.title === 'Honors French 4').code } });
    assert.strictEqual(chosen.courses.find(course => course.icSectionIDs.includes('801')).isWeighted, true);
}

console.log('Infinite Campus import, early tutorial, mobile bookmark setup, direct sending/confirmation/retry and scrollable collector tests passed.');
}
mobileImport().catch(error => { console.error(error); process.exitCode = 1; });

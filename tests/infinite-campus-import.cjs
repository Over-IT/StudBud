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
const first = IC.applyImportPlan(model, plan, { courses: [], assignments: [], schedule: { all: { 8: 'KEEP' } } }, options);
const calcCourse = first.courses.find(course => course.catalogCode === '119801/119802');
assert.strictEqual(calcCourse.title, 'AP Calculus AB');
assert.strictEqual(calcCourse.isWeighted, true);
assert.strictEqual(calcCourse.category, 'Math');
assert.deepStrictEqual(plain(calcCourse.categories.map(category => [category.name, category.weight])), [['Tests', 70], ['Homework', 30], ['Practice', 0]]);
const imported = id => first.assignments.find(item => item.id === `ic_${id}`);
assert.deepStrictEqual(plain([imported('a1').pointsEarned, imported('a1').maxPoints, imported('a1').graded]), [90, 100, true], 'multiplier scales points');
assert.deepStrictEqual(plain([imported('a2').pointsEarned, imported('a2').maxPoints]), [80, 100], 'percent categories score out of 100');
assert.strictEqual(imported('a3').graded, false, 'exempt work does not count');
assert.strictEqual(imported('a4').graded, false);
assert.strictEqual(imported('a4').status, 'pending');
assert.strictEqual(imported('a4').kind, 'quiz');
assert.strictEqual(imported('a1').kind, 'test');
assert.strictEqual(first.schedule.all['1'], calcCourse.code);
assert.strictEqual(first.schedule.all['8'], 'KEEP', 'unrelated periods are kept');
assert.strictEqual(first.summary.coursesAdded, 2);

// Re-importing updates in place and keeps the student's own edits
const edited = first.assignments.map(item => item.id === 'ic_a4' ? { ...item, estimatedMinutes: 120, kind: 'test' } : item);
const replan = IC.buildImportPlan(model, { courses: first.courses }, { school: 'pchs', catalog });
assert.ok(replan.classes.every(entry => entry.existingCode));
const second = IC.applyImportPlan(model, replan, { courses: first.courses, assignments: edited, schedule: first.schedule }, options);
assert.strictEqual(second.courses.length, first.courses.length);
assert.strictEqual(second.assignments.length, first.assignments.length);
assert.strictEqual(second.courses.find(course => course.code === calcCourse.code).categories.length, 3);
const keptQuiz = second.assignments.find(item => item.id === 'ic_a4');
assert.deepStrictEqual(plain([keptQuiz.estimatedMinutes, keptQuiz.kind]), [120, 'test']);
assert.strictEqual(second.summary.coursesUpdated, 2);

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
        value: '', open: false, dataset: {}, classList: { toggle() {} },
        setAttribute(name, value) { this[name] = value; },
        closest() { return { open: false }; },
        focus() { this.focused = true; },
        select() { this.selected = true; },
        setSelectionRange(start, end) { this.selection = [start, end]; }
    });
    for (const id of ['ic-bookmarklet-link', 'ic-bookmarklet-url', 'ic-mobile-instructions',
        'ic-district-url', 'ic-import-modal', 'ic-import-status', 'ic-import-textarea']) elements.set(id, element());
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
    assert.strictEqual(elements.get('ic-bookmarklet-url').value, bookmarklet);
    await app.copyInfiniteCampusBookmarklet();
    assert.strictEqual(sandbox.copied, bookmarklet, 'phone users copy the runnable bookmark URL, not a console-only script');
    sandbox.navigator.clipboard.writeText = async () => { throw new Error('denied'); };
    await app.copyInfiniteCampusBookmarklet();
    assert.strictEqual(elements.get('ic-bookmarklet-url').selected, true);
    assert.deepStrictEqual(elements.get('ic-bookmarklet-url').selection, [0, bookmarklet.length]);
    assert.match(elements.get('ic-import-status').textContent, /tap and hold/);
    await app.pasteInfiniteCampusFromClipboard();
    assert.match(elements.get('ic-import-status').textContent, /Tap and hold/);
    let preview;
    app.previewInfiniteCampusData = value => { preview = IC.parsePayload(value); };
    sandbox.navigator.clipboard.readText = async () => JSON.stringify(payload);
    await app.pasteInfiniteCampusFromClipboard();
    assert.strictEqual(preview.sections.length, 3, 'phone clipboard data reaches the same importer');
    const fileInput = { files: [{ text: async () => JSON.stringify(payload) }] };
    elements.set('ic-import-file', fileInput);
    await app.previewInfiniteCampusFromInput();
    assert.strictEqual(preview.sections.length, 3, 'downloaded JSON works through the phone file picker');
    const steps = app.tutorialSteps();
    assert.strictEqual(steps[2].title, 'Import from Infinite Campus', 'Campus import is step 3, before manual setup and dashboard explanations');
    assert.strictEqual(steps.filter(step => step.title === 'Import from Infinite Campus').length, 1);
    assert.match(steps[2].text, /phone/);

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
    const collectorSandbox = {
        console, URL, Blob, Set, location: { origin: 'https://district.infinitecampus.org', pathname: '/campus/portal/students' },
        document: { body, getElementById: () => null, createElement: tag => new HelperElement(tag), execCommand: () => false },
        navigator: { clipboard: { writeText: async () => { throw new Error('blocked'); } } },
        fetch: async url => ({
            ok: true, status: 200,
            text: async () => JSON.stringify(url.endsWith('api/portal/students')
                ? [{ personID: 1, firstName: 'Sam', enrollments: [] }] : [])
        })
    };
    collectorSandbox.window = { opener: null, addEventListener() {} };
    vm.createContext(collectorSandbox);
    await vm.runInContext(IC.buildConsoleScript('https://studbud.example'), collectorSandbox);
    const box = body.children.find(child => child.id === 'studbud-ic-overlay');
    assert.match(box.style.cssText, /box-sizing:border-box/);
    assert.match(box.style.cssText, /max-height:calc\(100dvh - 32px\)/);
    assert.match(box.style.cssText, /overflow-y:auto/);
    const actions = box.children[2];
    assert.ok(actions.children.every(button => button.style.cssText.includes('min-height:44px')));
    const copyButton = actions.children.find(child => child.textContent === 'Copy data');
    await copyButton.handlers.click();
    assert.match(box.children[1].textContent, /Show data/);
    const showButton = actions.children.find(child => child.textContent === 'Show data');
    showButton.handlers.click();
    const manualData = box.querySelector('textarea');
    assert.strictEqual(manualData.selected, true, 'clipboard-blocked phones can select the collected data');
    assert.strictEqual(JSON.parse(manualData.value).format, IC.FORMAT);
    showButton.handlers.click();
    assert.strictEqual(box.children.filter(child => child.tag === 'textarea').length, 1, 'showing data again reuses the copy field');
    console.log('Infinite Campus import, early tutorial, mobile bookmark setup, clipboard/file fallbacks and scrollable collector tests passed.');
}
mobileImport().catch(error => { console.error(error); process.exitCode = 1; });

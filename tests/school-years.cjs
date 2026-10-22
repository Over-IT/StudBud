const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const source = read('app.js');
const saved = new Map();
const events = [];
const sandbox = {
    console, Date, Math, Set, Map, document: { getElementById: () => null, addEventListener() {} },
    localStorage: { setItem: (key, value) => saved.set(key, value) },
    EventBus: { emit: (...args) => events.push(args) },
    NexusDB: { getAll: async () => [], replaceStores: async () => {} },
    isCurrentStudySession: () => true, currentGameMetrics: value => value
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('parkwayData.js'), sandbox);
vm.runInContext(read('gpaCalculator.js'), sandbox);
vm.runInContext(source.slice(source.indexOf('    class AppStateEngine'), source.indexOf('    const AppState ='))
    + '\nglobalThis.AppState = Object.create(AppStateEngine.prototype);', sandbox);
vm.runInContext(source.slice(source.indexOf('    class AppOrchestrator'), source.indexOf('    window.NexusApp ='))
    + '\nglobalThis.app = Object.create(AppOrchestrator.prototype);', sandbox);
const { app, AppState } = sandbox;
const plain = value => JSON.parse(JSON.stringify(value));
const initial = () => ({
    profile: { school: 'pchs', priorCredits: 2, priorWeightedGpa: 3, priorUnweightedGpa: 3 },
    courses: [
        { code: 'BIO', title: 'Honors Biology', school: 'pchs', isWeighted: true, category: 'Science', credits: 1, targetPct: 93,
            icSectionIDs: ['old-bio'], icName: 'HON BIO', categories: [{ id: 'test', name: 'Tests', weight: 100, icTermID: 'old-term' }] },
        { code: 'ENG', title: 'English 1', school: 'pchs', isWeighted: false, category: 'ELA', credits: 1, categories: [] }
    ],
    assignments: [
        { id: 'bio-test', courseCode: 'BIO', title: '<Final>', graded: true, pointsEarned: 95, maxPoints: 100, categoryId: 'test' },
        { id: 'eng-test', courseCode: 'ENG', title: 'Final', graded: true, pointsEarned: 40, maxPoints: 100 }
    ],
    calendarEvents: [{ id: 'event', date: '2026-05-01', title: 'Final' }], gradeScenarios: [{ id: 'scenario' }],
    schedule: { all: { 1: 'BIO' }, icSections: [{ courseCode: 'BIO', termID: 'old-term' }] },
    flashcards: [{ id: 'deck' }], studyHistory: [{ id: 'study' }], settings: { theme: 'system' }, academicYears: []
});
AppState.state = initial();
const selections = [{ include: true, grade: 'A', credits: '1' }, { include: true, grade: 'F', credits: '1' }];
const changes = app.buildSchoolYearArchive(2025, selections, true);
assert.equal(changes.academicYears[0].label, '2025-2026');
assert.equal(changes.academicYears[0].courses.length, 2);
assert.equal(changes.academicYears[0].assignments.length, 2);
assert.equal(changes.academicYears[0].schedule.icSections.length, 1);
assert.equal(changes.academicYears[0].calendarEvents.length, 1);
assert.equal(changes.academicYears[0].gradeScenarios.length, 1);
assert.equal(changes.courses.length, 0);
assert.equal(changes.assignments.length, 0);
assert.equal(changes.gradeScenarios.length, 0);
assert.equal(changes.calendarEvents.length, 0);
assert.deepEqual(plain(changes.schedule), { all: {}, odd: {}, even: {} });
assert.equal(AppState.state.courses.length, 2, 'building a preview cannot mutate current classes');
const keep = app.buildSchoolYearArchive(2025, selections, false);
assert.equal(keep.courses.length, 2, 'class reset is optional');
assert.equal(keep.courses[0].targetPct, 93, 'keeping classes preserves goals');
assert.equal(keep.courses[0].categories[0].weight, 100);
assert.equal(keep.courses[0].icSectionIDs, undefined, 'last-year Campus identities cannot match next-year classes');
assert.equal(keep.courses[0].categories[0].icTermID, undefined);
keep.courses[0].title = 'New year title';
assert.equal(keep.academicYears[0].courses[0].title, 'Honors Biology', 'archive and new-year classes never share mutable references');
for (const year of [1999, 2101, 2025.5, NaN]) assert.throws(() => app.buildSchoolYearArchive(year, selections, true), /school year/);
assert.throws(() => app.buildSchoolYearArchive(2025, [{ ...selections[0], grade: '' }, selections[1]], true), /final grade/);
assert.throws(() => app.buildSchoolYearArchive(2025, [selections[0], { ...selections[1], grade: 'A+' }], true), /final grade/);
for (const credits of ['', '-1', '0.1', '11', 'NaN']) {
    assert.throws(() => app.buildSchoolYearArchive(2025, [{ ...selections[0], credits }, selections[1]], true), /credits/);
}
assert.equal(app.buildSchoolYearArchive(2025, [{ include: false }, selections[1]], true)
    .academicYears[0].transcript.length, 1, 'ungraded/non-credit classes can stay in archive without affecting GPA');
const stateBefore = AppState.state;
const originalSave = AppState.saveToLocalStorage;
AppState.saveToLocalStorage = () => { throw new Error('Storage full'); };
assert.throws(() => AppState.saveSchoolYear(changes), /Storage full/);
assert.equal(AppState.state, stateBefore, 'failed persistence rolls back the entire academic transition');
AppState.saveToLocalStorage = originalSave;
AppState.saveSchoolYear(changes);
assert.equal(AppState.state.flashcards.length, 1);
assert.equal(AppState.state.studyHistory.length, 1);
assert.equal(events.at(-1)[0], 'state:restored', 'one committed state change triggers UI and cloud sync');
const local = JSON.parse(saved.get(AppState.STORAGE_KEY));
assert.equal(local.academicYears.length, 1, 'year archive survives reload');
assert.equal(local.courses.length, 0);
assert.equal(AppState.state.profile.academicYearStart, 2026);
assert.throws(() => app.buildSchoolYearArchive(2025, selections, true), /already been archived/);
const prior = app.priorGPA();
assert.equal(prior.credits, 4, 'failed attempted credits still count in GPA');
assert.equal(prior.weighted, (3 * 2 + sandbox.GPACalculator.getGradePoints('A', true)) / 4);
assert.equal(prior.unweighted, (3 * 2 + 4) / 4);
assert.equal(app.completedAcademicCredits(), 3, 'failed classes earn no credits');
assert.equal(Number(app.calculateTrackedGPA().weighted), prior.weighted, 'empty new-year classes keep cumulative GPA');
AppState.state = { ...AppState.state, courses: keep.courses };
assert.equal(Number(app.calculateTrackedGPA().weighted), prior.weighted, 'kept, empty class shells do not double-count final grades');
const archiveView = { innerHTML: '' };
sandbox.document.getElementById = id => id === 'academic-year-history' ? archiveView : null;
app.renderAcademicHistory();
assert.match(archiveView.innerHTML, /Honors Biology/);
assert.match(archiveView.innerHTML, /&lt;Final&gt;/, 'saved assignment titles remain escaped');
assert.match(archiveView.innerHTML, /Saved schedule/);
assert.match(archiveView.innerHTML, /Calendar events/);
assert.match(archiveView.innerHTML, /Saved hypothetical grade scenarios/);
assert.doesNotMatch(archiveView.innerHTML, /<input|<select|data-action=/, 'the archive is read-only');

async function persistence() {
    const backup = JSON.parse(await AppState.exportAppState());
    assert.equal(backup.state.academicYears[0].transcript[0].finalGrade, 'A', 'cloud/backup payload includes the final transcript');
    AppState.state.academicYears = [];
    await AppState.importAppState(JSON.stringify(backup));
    assert.equal(AppState.state.academicYears[0].assignments.length, 2, 'backup restore preserves archived work');
    await AppState.importAppState({ version: '1.0.0', state: { courses: [], assignments: [] } });
    assert.equal(AppState.state.academicYears.length, 0, 'older backups remain compatible');
}
persistence().catch(error => { console.error(error); process.exitCode = 1; });
console.log('School-year final-grade review, optional class reset, immutable archive, cumulative GPA/earned credits and atomic persistence passed.');

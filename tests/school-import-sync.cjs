const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parser = require('../campusPasteImport.js');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function fixture() {
    const nodes = new Map(), errors = [];
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, { value: '', checked: false, textContent: '', innerHTML: '',
            classList: { add() {}, toggle() {} }, replaceChildren() { this.innerHTML = ''; } });
        return nodes.get(id);
    };
    const state = {
        courses: [{ code: 'math', title: 'Math', school: 'other', term: 'FY', categories: [] }],
        assignments: [{ id: 'manual', courseCode: 'math', title: 'Unit 3 Test', dueDate: '',
            graded: false, status: 'pending', notes: 'Keep my work notes', estimatedMinutes: 45, plannedDate: '2026-11-18' }],
        schedule: { all: {}, odd: {}, even: {} }
    };
    let saves = 0, syncs = 0, app;
    const cloud = { user: { id: 'first-account' }, accountVersion: 1, accountReady: true, offlineMode: false,
        async syncNow() { syncs++; } };
    const sandbox = {
        Date, console: { error: (...args) => errors.push(args) },
        window: { StudBudCampusPaste: parser, StudBudCloud: cloud, navigator: { onLine: true } },
        document: { getElementById: node, querySelectorAll: selector => {
            assert.equal(selector, '[data-school-import-index]:checked');
            return app.schoolImportDraft.plan.rows.flatMap((row, index) => row.include !== false
                ? [{ dataset: { schoolImportIndex: String(index) } }] : []);
        } },
        AppState: { get: key => state[key], saveStateChanges(changes) { saves++; Object.assign(state, structuredClone(changes)); } }
    };
    vm.createContext(sandbox);
    vm.runInContext(source.slice(source.indexOf('    class AppOrchestrator'), source.indexOf('    window.NexusApp =')), sandbox);
    app = vm.runInContext('Object.create(AppOrchestrator.prototype)', sandbox);
    app.currentSchool = () => 'other';
    app.isParkwaySchool = () => false;
    node('campus-paste-term').value = 'FY';
    node('campus-paste-course').value = 'math';
    node('campus-paste-data').value = 'Class: Math\nAssignment\tDue Date\tScore\tCategory\tStatus\nTEST: UNIT 3\t11/20/2026\t18/20\tTests\t';
    return { app, state, cloud, sandbox, node, errors, saves: () => saves, syncs: () => syncs };
}

(async () => {
    {
        const f = fixture();
        const body = source.match(/document\.addEventListener\('paste', event => \{([\s\S]*?)\n\s*\}\);/)[1];
        vm.runInContext(`AppOrchestrator.prototype.testPaste = function(event) {${body}}`, f.sandbox);
        const target = f.node('campus-paste-data');
        Object.assign(target, { value: '', selectionStart: 0, selectionEnd: 0, matches: selector => selector === '#campus-paste-data' });
        let prevented = false;
        f.app.testPaste({ target, preventDefault() { prevented = true; }, clipboardData: {
            getData: type => type === 'text/plain'
                ? 'Student Name: Private Example\nStudent ID: 123456789\nEmail: private@example.invalid\nClass: Math\nAssignment\tDue Date\tScore\tCategory\nTEST: UNIT 3\t11/20/2026\t18/20\tTests'
                : ''
        } });
        assert.equal(prevented, true);
        assert.doesNotMatch(target.value, /Private Example|123456789|private@example/i, 'identifying fields never reach the displayed textarea');
        assert.match(target.value, /UNIT 3/);
        f.app.previewSchoolImport();
        assert.doesNotMatch(JSON.stringify(f.app.schoolImportDraft), /Private Example|123456789|private@example/i);
        const preview = f.node('campus-paste-preview').innerHTML;
        assert.match(preview, /Matched existing task: Unit 3 Test · Math/);
        assert.match(preview, /Grade<\/span><span>Not graded <b[^>]*>→<\/b> Graded/);
        assert.match(preview, /Points<\/span><span>.*18 \/ 20 points/);
        assert.match(preview, /Due date<\/span><span>Not set <b[^>]*>→<\/b> 2026-11-20/);
        assert.match(preview, /Status<\/span><span>pending <b[^>]*>→<\/b> completed/);
        assert.match(preview, /Category<\/span><span>Uncategorized <b[^>]*>→<\/b> Tests/);
        const beforeImport = JSON.stringify(f.state);
        await f.app.importSchoolData();
        assert.equal(f.saves(), 1, 'class categories and assignment updates save as one batch');
        assert.equal(f.syncs(), 1, 'an online account explicitly flushes the confirmed import through encrypted sync');
        assert.equal(f.state.assignments.length, 1, 'a reordered manually entered title is updated rather than duplicated');
        const updated = f.state.assignments[0];
        assert.equal(updated.id, 'manual');
        assert.equal(updated.pointsEarned, 18);
        assert.equal(updated.maxPoints, 20);
        assert.equal(updated.graded, true);
        assert.equal(updated.notes, 'Keep my work notes');
        assert.equal(updated.estimatedMinutes, 45);
        assert.equal(updated.plannedDate, '2026-11-18');
        assert.equal(target.value, '');
        assert.match(f.node('campus-paste-status').textContent, /synced/);
        assert.doesNotMatch(JSON.stringify(f.app.schoolImportUndo), /Student Name|Private Example|123456789|private@example/i,
            'the undo record holds structured app data, never the raw paste');
        await f.app.undoSchoolImport();
        assert.equal(JSON.stringify(f.state), beforeImport, 'undo restores only the three school-data collections to their pre-import state');
        assert.equal(f.saves(), 2);
        assert.equal(f.syncs(), 2, 'undo explicitly flushes the restored snapshot through encrypted sync');
        assert.equal(f.app.schoolImportUndo, null);
        assert.match(f.node('campus-paste-status').textContent, /undone.*synced/i);
    }
    for (const change of ['account', 'local-data', 'options']) {
        const f = fixture();
        f.app.previewSchoolImport();
        if (change === 'account') f.cloud.user.id = 'second-account';
        if (change === 'local-data') f.state.assignments[0].notes = 'Edited after preview';
        if (change === 'options') f.node('campus-paste-weights').checked = true;
        const before = JSON.stringify(f.state);
        await assert.rejects(f.app.importSchoolData(), /Preview again/);
        assert.equal(JSON.stringify(f.state), before);
        assert.equal(f.saves(), 0, `${change} invalidates the plan before any data is written`);
    }
    {
        const f = fixture();
        f.app.previewSchoolImport();
        const before = JSON.stringify(f.state);
        f.sandbox.AppState.saveStateChanges = () => { throw new Error('Device storage full'); };
        await assert.rejects(f.app.importSchoolData(), /storage full/);
        assert.equal(JSON.stringify(f.state), before, 'failed saves do not partially modify assignments or categories');
        assert.ok(f.app.schoolImportDraft, 'a failed device save keeps the review available for retry');
    }
    {
        const f = fixture();
        f.app.previewSchoolImport();
        f.cloud.syncNow = async () => { throw new Error('Connection interrupted'); };
        await f.app.importSchoolData();
        assert.equal(f.state.assignments[0].graded, true, 'sync failure retains the local import');
        assert.equal(f.app.schoolImportDraft, null, 'sync failure cannot accidentally apply the same reviewed changes twice');
        assert.match(f.node('campus-paste-status').textContent, /saved on this device.*cloud sync failed/i);
        assert.equal(f.errors.length, 1);
    }
    {
        const f = fixture();
        f.state.assignments = [];
        f.app.previewSchoolImport();
        const preview = f.node('campus-paste-preview').innerHTML;
        assert.match(preview, /Add assignment/);
        assert.match(preview, /Grade<\/span><span>New <b[^>]*>→<\/b> Graded/);
        assert.match(preview, /Points<\/span><span>New <b[^>]*>→<\/b> 18 \/ 20 points/);
        assert.match(preview, /Due date<\/span><span>New <b[^>]*>→<\/b> 2026-11-20/);
    }
    {
        const f = fixture();
        const parse = parser.parseSchoolData;
        f.state.schedule = { all: {}, odd: { 2: 'math' }, even: {}, meetings: [
            { courseCode: 'math', period: '2', pattern: 'odd', start: '08:00', end: '09:00' }
        ] };
        parser.parseSchoolData = (...args) => {
            const parsed = parse(...args);
            parsed.meetings.push({ courseCode: 'math', period: '2', pattern: 'odd', start: '08:05', end: '09:10' });
            return parsed;
        };
        try {
            f.app.previewSchoolImport();
            const preview = f.node('campus-paste-preview').innerHTML;
            assert.match(preview, /Meeting time<\/span><span>08:00–09:00 <b[^>]*>→<\/b> 08:05–09:10/);
            assert.match(preview, /Period \/ rotation<\/span><span>2 · odd <b[^>]*>→<\/b> 2 · odd/);
        } finally {
            parser.parseSchoolData = parse;
        }
    }
    {
        const f = fixture(), build = parser.buildImportPlan;
        parser.buildImportPlan = (...args) => {
            const plan = build(...args);
            plan.rows[0].label = '<img src=x onerror=alert(1)>';
            plan.rows[0].detail = '<svg onload=alert(1)>';
            return plan;
        };
        try {
            f.app.previewSchoolImport();
            const preview = f.node('campus-paste-preview').innerHTML;
            assert.match(preview, /&lt;img src=x onerror=alert\(1\)&gt;/);
            assert.match(preview, /&lt;svg onload=alert\(1\)&gt;/);
            assert.doesNotMatch(preview, /<img|<svg/i, 'all importer-provided preview text is escaped');
        } finally {
            parser.buildImportPlan = build;
        }
    }
    for (const change of ['account', 'local-data']) {
        const f = fixture();
        f.app.previewSchoolImport();
        await f.app.importSchoolData();
        if (change === 'account') f.cloud.user.id = 'second-account';
        else f.state.assignments[0].notes = 'Edited after import';
        const before = JSON.stringify(f.state);
        await assert.rejects(f.app.undoSchoolImport(), /Undo refused/);
        assert.equal(JSON.stringify(f.state), before, `undo does not overwrite a later ${change} change`);
        assert.equal(f.saves(), 1);
        assert.equal(f.app.schoolImportUndo, null);
        assert.match(f.node('campus-paste-status').textContent, /Undo refused/);
    }
    {
        const f = fixture();
        f.app.previewSchoolImport();
        await f.app.importSchoolData();
        f.cloud.syncNow = async () => { throw new Error('Connection interrupted'); };
        await f.app.undoSchoolImport();
        assert.equal(f.state.assignments[0].graded, false, 'failed undo sync retains the local restoration');
        assert.match(f.node('campus-paste-status').textContent, /undone.*saved on this device.*sync failed/i);
        assert.equal(f.app.schoolImportUndo, null);
    }
    {
        const f = fixture();
        f.cloud.accountReady = false;
        f.app.previewSchoolImport();
        await f.app.importSchoolData();
        assert.match(f.node('campus-paste-status').textContent, /saved on this device only/i);
        await f.app.undoSchoolImport();
        assert.match(f.node('campus-paste-status').textContent, /undone.*on this device only/i);
        assert.equal(f.syncs(), 0, 'local-only import and undo do not attempt account sync');
    }
    {
        const f = fixture();
        f.app.previewSchoolImport();
        await f.app.importSchoolData();
        const imported = JSON.stringify(f.state);
        const save = f.sandbox.AppState.saveStateChanges;
        f.sandbox.AppState.saveStateChanges = () => { throw new Error('Device storage full'); };
        await assert.rejects(f.app.undoSchoolImport(), /storage full/);
        assert.equal(JSON.stringify(f.state), imported, 'failed atomic undo leaves the imported state intact');
        assert.ok(f.app.schoolImportUndo, 'a failed device save keeps undo available for retry');
        f.sandbox.AppState.saveStateChanges = save;
        await f.app.undoSchoolImport();
        assert.equal(f.state.assignments[0].graded, false);
    }
    {
        const f = fixture();
        f.state.courses.push({ code: 'science', title: 'Science' });
        f.state.schedule = { all: {}, odd: { 2: 'math' }, even: { 2: 'science' },
            meetings: [
                { courseCode: 'math', period: '2', pattern: 'odd', start: '08:05', end: '09:10' },
                { courseCode: 'science', period: '2', pattern: 'even', start: '09:15', end: '10:20' }
            ] };
        const selects = [
            { value: '2', dataset: { course: 'math', originalPeriod: '2' } },
            { value: '2', dataset: { course: 'science', originalPeriod: '2' } }
        ];
        f.sandbox.document.querySelectorAll = () => selects;
        f.sandbox.AppState.set = (key, value) => { f.state[key] = structuredClone(value); };
        f.sandbox.window.StudBudDialogs = { notify() {} };
        f.sandbox.window.StudBudIC = require('../infiniteCampusImport.js');
        f.app.renderDashboard = f.app.renderCalendar = () => {};
        f.app.getSchoolSchedule = () => ({ type: 'Odd', classes: [{ period: '2nd Period', time: 'Default time' }] });
        const before = JSON.stringify(f.state.schedule);
        f.app.saveSchedule();
        assert.equal(JSON.stringify(f.state.schedule), before, 'saving unchanged period controls preserves imported rotations and times');
        assert.equal(f.app.getPeriodMap('odd')[2], 'math');
        assert.equal(f.app.getPeriodMap('even')[2], 'science');
        const entries = f.app.getScheduleEntries(new Date(2026, 10, 17)).entries;
        assert.equal(entries[0].course.code, 'math');
        assert.equal(entries[0].time, '8:05 AM - 9:10 AM', 'copied private times override the matching official period');
        selects[0].value = '3';
        f.app.saveSchedule();
        assert.equal(f.state.schedule.all[3], 'math');
        assert.equal(f.state.schedule.even[2], 'science');
        assert.equal(f.state.schedule.meetings.length, 1, 'changing a period drops only copied times for the moved class');
    }
    console.log('Unified import: immediate clipboard scrubbing, manual assignment matching, atomic save/sync, stale previews and explicit failures passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');

// Card parser used by the teacher set editor.
const window = {};
vm.runInNewContext(source('classrooms.js'), { window, document: { addEventListener() {} }, console });
const parse = window.StudBudClassrooms.parseCardLines;
assert.deepEqual(JSON.parse(JSON.stringify(parse('cell\tbasic unit of life\nmitosis - cell division\nATP: energy molecule\n\nno separator here'))), [
    { front: 'cell', back: 'basic unit of life' },
    { front: 'mitosis', back: 'cell division' },
    { front: 'ATP', back: 'energy molecule' }
]);
assert.equal(parse('x-ray - a kind of radiation')[0].front, 'x-ray');

// School registry used to scope classes to a school catalog.
const ctx = { window: {}, console };
vm.createContext(ctx);
['parkwayData.js', 'data/schools/central.js', 'data/schools/north.js', 'data/schools/south.js', 'data/schools/west.js'].forEach(file => vm.runInContext(source(file), ctx, { filename: file }));
const schools = ctx.window.STUDBUD_SCHOOLS;
assert.equal(schools.parkway.map(school => school.id).join(), 'pchs,pnhs,pshs,pwhs');
['pchs', 'pnhs', 'pshs', 'pwhs'].forEach(id => assert.ok(schools.catalog(id).length > 150, `${id} catalog loaded`));
assert.equal(schools.isParkway('other'), false);
assert.equal(schools.catalog('other').length, 0);
assert.deepEqual(['pchs', 'pnhs', 'pshs', 'pwhs'].map(id => schools.catalog(id).length), [227, 276, 265, 258], 'per-school SchooLinks counts');
['pchs', 'pnhs', 'pshs', 'pwhs'].forEach(id => {
    assert.ok(schools.catalog(id).every(course => course.schools.includes(id) && !course.legacy), `${id} only lists its own current courses`);
    assert.ok(ctx.window.STUDBUD_SCHOOL_COURSES[id].every(course => course.code && course.title && course.category && typeof course.isWeighted === 'boolean' && Number.isFinite(course.credits)), `${id} data file rows are complete`);
});

// School-filtered course search (add-class dropdown and teacher course picker).
const titles = (id, query) => schools.search(id, query).map(course => course.title);
assert.ok(titles('pwhs', 'Design Arts 2').includes('Design Arts 2'));
['pchs', 'pnhs', 'pshs'].forEach(id => assert.ok(!titles(id, 'Design Arts 2').includes('Design Arts 2'), `Design Arts 2 is West-only (${id})`));
assert.ok(titles('pchs', 'marching').includes('Marching Arts'));
['pnhs', 'pshs', 'pwhs'].forEach(id => assert.equal(titles(id, 'marching arts').length, 0, `Marching Arts is Central-only (${id})`));
assert.equal(schools.search('other', 'english').length, 0);
assert.equal(schools.search('pchs', '   ').length, 0);
assert.equal(titles('pchs', 'DESIGN ARTS')[0], 'Design Arts', 'case-insensitive, exact title ranks first');
assert.ok(titles('pchs', 'ap bio').some(title => /^AP Biology/.test(title)), 'partial words + AP');
assert.ok(titles('pnhs', 'honors accounting').every(title => /Honors Accounting/.test(title)));
assert.ok(titles('pchs', "actors studio").length === 0, 'Actor\'s Studio is not offered at Central');
assert.ok(titles('pshs', "actors studio").includes("Actor's Studio"), 'punctuation-insensitive');
assert.equal(schools.search('pchs', '027000')[0].title, 'Design Arts', 'search by course number');
assert.ok(schools.search('pwhs', 'a', 5).length <= 5, 'limit respected');
// Saved classes with retired placeholder codes still resolve, but never show up in search.
assert.equal(schools.findCourse('ART101').legacy, true);
assert.ok(!schools.search('pchs', 'Introduction to Business').some(course => course.legacy));
assert.equal(ctx.window.PCHS_COURSE_CATALOG, ctx.window.STUDBUD_COURSE_CATALOG, 'legacy PCHS_* alias');
assert.equal(ctx.window.PCHS_GRADE_SCALE, ctx.window.PARKWAY_GRADE_SCALE);

// Teacher course picker: combobox dropdown that only offers the teacher's school catalog.
const classroomsSource = source('classrooms.js');
assert.doesNotMatch(classroomsSource, /teacher-course-code/, 'no reference to a missing hidden input');
assert.match(classroomsSource, /id="teacher-course-search"[^>]*role="combobox"[^>]*aria-controls="teacher-course-results"/);
assert.match(classroomsSource, /schools\.search\(schoolId, text/);
assert.match(classroomsSource, /onKeydown\(event\)[\s\S]*?ArrowDown[\s\S]*?Escape[\s\S]*?Enter/);
assert.match(classroomsSource, /closest\?\.\('\.teacher-course-combobox'\)\) this\.hideCourseResults\(\)/);
const pickerWindow = {};
vm.runInNewContext(classroomsSource, { window: pickerWindow, document: { addEventListener() {}, getElementById: () => null }, console });
const teacherApp = { schoolCatalog: () => schools.catalog('pwhs'), schoolShortName: () => 'West', currentSchool: () => 'pwhs' };
const picker = pickerWindow.StudBudClassrooms.attach(teacherApp);
const created = [];
picker.call = async (fn, args) => { created.push([fn, args]); return { classes: [] }; };
picker.loadTeacher = async () => {};
picker.status = () => {};
(async () => {
    await assert.rejects(picker.addCourse('127530'), /West course/, 'Central-only course rejected for a West teacher');
    await picker.addCourse('027020');
    assert.deepEqual(JSON.parse(JSON.stringify(created)), [['studbud_teacher_create_class', { p_course_code: '027020', p_title: 'Design Arts 2', p_section: '' }]]);
    picker.teacherData = { classes: [{ course_code: '027020' }] };
    await picker.addCourse('027020');
    assert.equal(created.length, 1, 'already-taught course is not added twice');
})().catch(error => { console.error(error); process.exitCode = 1; });

// Server: classes are teacher-only to create, students get access automatically by school + course, and every RPC is granted to signed-in users only.
const sql = source('supabase-setup.sql');
['studbud_classes', 'studbud_class_members', 'studbud_class_decks'].forEach(table => {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
});
assert.match(sql, /function public\.studbud_require_teacher\(\)[\s\S]*?'teacher'/);
['studbud_teacher_create_class', 'studbud_teacher_class_detail', 'studbud_teacher_save_deck', 'studbud_teacher_restore_student', 'studbud_my_classes', 'studbud_sync_class_stats']
    .forEach(fn => assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`)));
assert.match(sql, /drop function if exists public\.studbud_join_class\(text, uuid\)/);
assert.doesNotMatch(sql, /grant execute on function public\.studbud_join_class/);
const myClasses = sql.slice(sql.indexOf('create or replace function public.studbud_my_classes'));
assert.match(myClasses, /insert into public\.studbud_class_members[\s\S]*?c\.school = v_school[\s\S]*?studbud_course_matches/);
assert.match(myClasses, /state,profile,school/);
assert.match(sql, /not coalesce\(a\.is_anonymous, false\)/, 'teacher backfill excludes actual Supabase anonymous users');
assert.match(sql, /c\.teacher_id = auth\.uid\(\)[\s\S]*?studbud_course_matches/);
assert.match(sql, /revoke all on function public\.studbud_refresh_teacher_roster\(\) from public, anon, authenticated/);
assert.match(myClasses, /delete from public\.studbud_class_members[\s\S]*?not m\.removed/);
assert.doesNotMatch(source('classrooms.js'), /join_code|studbud_join_class/);
assert.match(sql, /revoke all on function public\.studbud_class_person\(uuid\) from public, anon, authenticated/);

// Client wiring.
const app = source('app.js');
assert.match(app, /"friends", "classes"/);
assert.match(app, /this\.classrooms\?\.refreshNav\(\)/);
assert.match(source('index.html'), /id="classes-view"/);
assert.match(source('index.html'), /src="classrooms\.js"/);
assert.match(source('service-worker.js'), /'\.\/classrooms\.js'/);
assert.match(source('communityGames.js'), /async classCall\(fn/);

// Both visibility directions go through checked, security-definer RPCs, never direct profile queries.
function sqlFunction(name) {
    const start = sql.indexOf('create or replace function public.' + name + '(');
    assert.ok(start >= 0, name + ' exists');
    return sql.slice(start, sql.indexOf('$;', start) + 3);
}
['studbud_teacher_classes', 'studbud_teacher_class_detail', 'studbud_my_classes'].forEach(name => {
    assert.match(sqlFunction(name), /security definer/);
    assert.match(sqlFunction(name), /set search_path = public, pg_temp/);
});
assert.match(sqlFunction('studbud_teacher_class_detail'), /id = p_class_id and teacher_id = auth\.uid\(\)/);
assert.match(sqlFunction('studbud_my_classes'), /m\.user_id = auth\.uid\(\) and not m\.removed/);
assert.match(sqlFunction('studbud_class_summary'), /'teacher', public\.studbud_class_person\(p_class\.teacher_id\)/);
assert.match(sqlFunction('studbud_require_teacher'), /state,profile,school/);
assert.match(sqlFunction('studbud_refresh_teacher_roster'), /latest\.updated_at >= m\.joined_at/,
    'older saved data cannot undo a new student enrollment');
assert.doesNotMatch(sqlFunction('studbud_my_classes'), /n <= 40/, 'course aliases are not silently truncated');
assert.match(sqlFunction('studbud_my_classes'), /cardinality\(p_course_codes\)/, 'oversized requests fail explicitly');
assert.match(sqlFunction('studbud_my_classes'), /studbud_user_tags where user_id = auth\.uid\(\) and tag = 'teacher'/,
    'delayed client account tags cannot enroll teachers as students');

(async () => {
    function harness(teacher = false) {
        const root = { innerHTML: '', contains: () => false };
        const view = { dataset: {}, classList: { contains: () => false }, addEventListener() {} };
        const timers = [];
        const doc = { visibilityState: 'visible', activeElement: null, addEventListener() {},
            getElementById: id => id === 'classes-root' ? root : id === 'classes-view' ? view : null };
        const cloud = { user: { id: teacher ? 'teacher' : 'student' }, accountReady: true, offlineMode: false,
            async syncNow() { calls.push(['persist']); } };
        const win = { StudBudCloud: cloud, addEventListener() {} };
        const state = { courses: [{ code: 'BIO', title: 'Biology' }], assignments: [], flashcards: [] };
        const calls = [], events = {};
        const app = { userTags: teacher ? ['teacher'] : [], currentSchool: () => 'pchs', isParkwaySchool: () => true,
            AppState: { get: key => state[key] }, EventBus: { on: (event, fn) => { events[event] = fn; } },
            friendlyErrorMessage: error => error.message, schoolCatalog: () => [],
            calculateCourseGrade: () => 90, gradeForPercentage: () => 'A', isGradedItem: () => false,
            isOpenAssignment: entry => entry.status !== 'completed' && (entry.icMissing || !entry.graded) };
        vm.runInNewContext(classroomsSource, { window: win, document: doc, console,
            setInterval: fn => { timers.push(fn); return timers.length; },
            setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {} });
        const client = win.StudBudClassrooms.attach(app);
        const rendered = [];
        client.renderStudent = () => rendered.push('student');
        client.renderTeacherHome = () => rendered.push('teacher');
        client.renderTeacherDetail = () => rendered.push(client.detail.id);
        client.status = (message, type) => rendered.push([message, type]);
        client.call = async (fn, args) => { calls.push([fn, args]); return { classes: [{ id: 'class1', course_code: 'BIO' }] }; };
        return { client, cloud, root, doc, app, calls, rendered, state, timers, events };
    }
    const student = harness();
    student.doc.visibilityState = 'hidden';
    student.client.refreshNav();
    assert.ok(student.events['courses:updated'], 'course updates are observed before the student first opens Classes');
    student.doc.visibilityState = 'visible';
    await student.client.loadStudent();
    assert.equal(student.calls[0][0], 'persist', 'save courses/school before enrollment');
    assert.equal(student.calls[1][0], 'studbud_my_classes');
    assert.equal(student.calls.filter(([fn]) => fn === 'studbud_my_classes').length, 1, 'no duplicate load RPC');
    assert.ok(student.rendered.includes('student'), 'student sees fresh teacher and class info');
    assert.equal(student.calls[2][0], 'studbud_sync_class_stats');
    assert.equal(student.calls[2][1].p_snapshots[0].snapshot.grade_pct, 90, 'assignment/grade snapshot reaches teacher');
    student.rendered.length = 0;
    await student.client.syncSnapshots(true);
    assert.deepEqual(student.rendered, ['student'], 'background enrollment/deck refresh updates the visible tab');

    student.state.courses = Array.from({ length: 55 }, (_, index) => ({ code: 'C' + index }));
    assert.equal(student.client.courseCodes().length, 55, 'no silent course-code limit');
    assert.equal(student.client.courseMatches({ code: 'bio' }, ' BIO '), true, 'client matches server code normalization');
    student.client.call = async (fn, args) => {
        student.calls.push([fn, args]);
        return { classes: Array.from({ length: 45 }, (_, index) => ({ id: 'class' + index, course_code: 'C' + index })) };
    };
    student.calls.length = 0;
    await student.client.syncSnapshots(true);
    assert.deepEqual(student.calls.filter(([fn]) => fn === 'studbud_sync_class_stats').map(([, args]) => args.p_snapshots.length),
        [20, 20, 5], 'every class gets progress within the server batch limit');

    const markup = harness();
    markup.client.studentData = { classes: [{ id: 'bio', course_code: 'BIO', title: 'Biology', student_count: 2,
        teacher: { first_name: 'Ada', last_name: 'Teacher' }, decks: [{ id: 'set', title: 'Cells', cards: [{ front: 'Cell', back: 'Life' }] }] }] };
    Object.getPrototypeOf(markup.client).renderStudent.call(markup.client);
    assert.match(markup.root.innerHTML, /Ada Teacher/);
    assert.match(markup.root.innerHTML, /Cells/);
    assert.match(markup.root.innerHTML, /data-class-action="study-class-deck"/);
    markup.state.assignments = [{ courseCode: 'BIO', title: 'Missing lab', status: 'pending', icMissing: true, dueDate: '2000-01-01' },
        { courseCode: 'BIO', title: 'Future lab', status: 'pending', dueDate: '2999-01-01' },
        { courseCode: 'OTHER', title: 'Not shared', status: 'pending', icMissing: true }];
    const snapshot = markup.client.snapshotFor('BIO');
    assert.equal(snapshot.missing, 1);
    assert.equal(snapshot.overdue, 1);
    assert.equal(snapshot.upcoming, 1);
    assert.equal(snapshot.next_due[0].title, 'Future lab', 'only this course shares upcoming assignments');
    markup.state.assignments.push(
        { courseCode: 'BIO', title: 'Scored missing lab', status: 'pending', icMissing: true, graded: true, pointsEarned: 0, dueDate: '2999-01-01' },
        { courseCode: 'BIO', title: 'Completed missing lab', status: 'completed', icMissing: true, graded: true, pointsEarned: 0 }
    );
    const scoredMissing = markup.client.snapshotFor('BIO');
    assert.equal(scoredMissing.missing, 2, 'a scored missing item remains missing until completed');
    assert.equal(scoredMissing.overdue, 2, 'Campus missing is overdue even with a future due date');
    assert.equal(scoredMissing.upcoming, 1, 'scored missing work is not an upcoming task');

    const failure = harness();
    failure.client.call = async fn => {
        if (fn === 'studbud_sync_class_stats') throw Error('Progress unavailable');
        return { classes: [{ id: 'class1', course_code: 'BIO' }] };
    };
    await failure.client.loadStudent();
    assert.equal(failure.client.lastSync, 0, 'failed progress writes do not throttle retries');
    assert.ok(failure.rendered.includes('student'), 'progress failure does not hide successfully loaded classes');
    assert.deepEqual(failure.rendered.at(-1), ['Progress unavailable', 'error']);
    const offline = harness();
    offline.cloud.accountReady = false;
    await offline.client.syncSnapshots(true);
    assert.equal(offline.calls.length, 0, 'no enrollment before account state is restored');

    const teacher = harness(true);
    teacher.client.detail = { id: 'class1' };
    teacher.client.call = async (fn, args) => {
        teacher.calls.push([fn, args]);
        return fn === 'studbud_teacher_class_detail' ? { id: args.p_class_id, students: [{ user_id: 'student' }] } : { classes: [] };
    };
    await teacher.client.render();
    // render resets account-scoped state, so open the class under the established context.
    teacher.client.detail = { id: 'class1' };
    await teacher.client.render();
    assert.equal(teacher.calls.at(-1)[0], 'studbud_teacher_class_detail', 'reopening a detail fetches its roster');
    assert.equal(teacher.client.detail.students.length, 1);
    await teacher.client.refreshVisible();
    assert.equal(teacher.calls.at(-1)[0], 'studbud_teacher_class_detail', 'teacher polling fetches roster updates');
    const count = teacher.calls.length;
    teacher.client.editingDeck = { title: 'Unsaved draft' };
    await teacher.client.refreshVisible();
    assert.equal(teacher.calls.length, count, 'polling preserves unsaved decks');
    teacher.client.editingDeck = null;
    teacher.client.detailTab = 'settings';
    await teacher.client.refreshVisible();
    assert.equal(teacher.calls.length, count, 'polling preserves settings drafts');
    assert.equal(teacher.timers.length, 1, 'one poll timer across repeated renders');
    teacher.client.detailTab = 'students';
    let finishPoll;
    teacher.client.call = () => new Promise(resolve => { finishPoll = resolve; });
    const poll = teacher.client.refreshVisible();
    teacher.client.editingDeck = { title: 'Draft started during fetch' };
    const beforePoll = teacher.rendered.length;
    finishPoll({ id: 'class1', students: [] });
    await poll;
    assert.equal(teacher.rendered.length, beforePoll, 'in-flight polling cannot overwrite a newly opened editor');

    const race = harness(true);
    let resolveOld;
    race.client.call = (fn, args) => args.p_class_id === 'old'
        ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ id: 'new' });
    const old = race.client.openClass('old');
    await race.client.openClass('new');
    resolveOld({ id: 'old' });
    await old;
    assert.equal(race.client.detail.id, 'new', 'out-of-order responses cannot reopen a previous class');
    assert.deepEqual(race.rendered, ['new']);

    const account = harness();
    let resolveAccount, started;
    const rpcStarted = new Promise(resolve => { started = resolve; });
    account.client.call = () => new Promise(resolve => { resolveAccount = resolve; started(); });
    const pending = account.client.syncSnapshots(true);
    await rpcStarted;
    account.cloud.user = { id: 'another-student' };
    resolveAccount({ classes: [{ id: 'private-class' }] });
    await pending;
    assert.equal(account.client.studentData, null, 'late responses never leak across accounts');
    account.client.teacherData = { classes: [{ id: 'cached' }] };
    account.client.detail = { id: 'cached' };
    account.client.resetContext();
    assert.equal(account.client.teacherData, null);
    assert.equal(account.client.detail, null, 'role/school/account changes invalidate all class caches');
    console.log('Classroom enrollment, RPC visibility, refresh, polling, races and progress regression tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

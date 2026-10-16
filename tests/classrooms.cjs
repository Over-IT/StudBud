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
console.log('Classroom card parsing, school catalogs, teacher/student SQL and client wiring passed.');

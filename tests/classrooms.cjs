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
vm.runInNewContext(source('pchsData.js'), ctx);
const schools = ctx.window.STUDBUD_SCHOOLS;
assert.equal(schools.parkway.map(school => school.id).join(), 'pchs,pnhs,pshs,pwhs');
['pchs', 'pnhs', 'pshs', 'pwhs'].forEach(id => assert.ok(schools.catalog(id).length > 150, `${id} catalog loaded`));
assert.equal(schools.isParkway('other'), false);

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
assert.match(myClasses, /insert into public\.studbud_class_members[\s\S]*?c\.school = v_school and c\.course_code = any\(v_codes\)/);
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

const assert = require('node:assert/strict');
const paste = require('../campusPasteImport.js');

const catalog = [
    { code: 'BIO101', title: 'Biology I' },
    { code: 'ENG202', title: 'English Literature' }
];
assert.deepEqual(paste.parseCourses('Course\tTeacher\tRoom\nBiology I\tMs. Example\t101\nENG202\tMr. Example\t202\nBiology I\tOther\t1', catalog),
    [{ name: 'Biology I', match: catalog[0] }, { name: 'ENG202', match: catalog[1] }],
    'copied class tables match by title or catalog code, ignore unrelated columns and deduplicate');
assert.deepEqual(paste.parseCourses('Biology I\nUnknown elective', catalog), [
    { name: 'Biology I', match: catalog[0] }, { name: 'Unknown elective', match: null }
], 'pasted plain course lists keep unmatched names visible for review');
assert.equal(paste.parseCourses('Biology I - Semester 1', catalog)[0].match, catalog[0],
    'unique course titles still match when Campus adds a section label');
assert.deepEqual(paste.parseCourses('Schedule\nStudent details\nCourse\tTeacher\nBiology I\tExample\nPage footer', catalog),
    [{ name: 'Biology I', match: catalog[0] }], 'page text outside a recognized table is ignored');

const today = new Date(2026, 10, 12);
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
assert.equal(paste.parseDate('2/30/2026', today), '', 'invalid calendar dates are not imported');
assert.equal(paste.parseDate('2026-02-31', today), '', 'invalid ISO dates are not imported');
assert.equal(paste.parseDate('11/19', today), '2026-11-19', 'dates without a year use the current year');

console.log('Campus paste parsing: class matching, assignment scores/dates/categories, deduplication and ignored fields passed.');

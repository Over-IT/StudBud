const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const IC = require('../infiniteCampusImport.js');

const savedSchedule = {
    sections: [{
        calendarID: '77',
        courseCode: 'MATH',
        period: '1',
        start: '07:35',
        end: '08:26',
        seq: 1,
        psID: 'regular',
        termStart: '2025-08-01',
        termEnd: '2026-06-01'
    }],
    calendars: {
        '77': {
            '2026-01-19': { school: false, note: 'MLK Day' },
            '2026-01-20': { school: true, psID: 'regular', note: '' }
        }
    }
};
const courses = [{ code: 'MATH', title: 'Algebra 2' }];

assert.equal(IC.hasImportedSchedule(savedSchedule), true);
assert.deepEqual(IC.scheduleForDate(savedSchedule, '2026-01-19', courses), {
    key: '2026-01-19', school: false, note: 'MLK Day', entries: []
});
const schoolDay = IC.scheduleForDate(savedSchedule, '2026-01-20', courses);
assert.equal(schoolDay.entries.length, 1);
assert.equal(schoolDay.entries[0].period, '1st Period');
assert.equal(schoolDay.entries[0].time, '7:35 AM - 8:26 AM');
assert.equal(schoolDay.entries[0].course.title, 'Algebra 2');
assert.equal(IC.scheduleForDate(savedSchedule, '2026-01-24', courses), null);

assert.equal(IC.parsePayload, undefined, 'new Campus data is no longer collected or imported');
assert.equal(IC.buildImportPlan, undefined);
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.doesNotMatch(html, /ic-import-modal|ic-bookmarklet|open-ic-import/);
assert.doesNotMatch(app, /openInfiniteCampusImport|copyInfiniteCampusBookmarklet|handleInfiniteCampusMessage/);

console.log('Previously saved Campus schedules remain visible; new Campus imports and helper controls are removed.');

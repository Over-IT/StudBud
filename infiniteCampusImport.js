/**
 * StudBud - previously imported schedule display
 * FILE: infiniteCampusImport.js
 * DESCRIPTION: Keeps schedules imported by older versions visible without collecting new data.
 */
(function (root) {
    'use strict';

    const list = value => Array.isArray(value) ? value : [];
    const pad = value => String(value).padStart(2, '0');
    const localKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    function dateKey(value) {
        if (!value) return '';
        const raw = String(value).trim();
        if (/T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
            const parsed = new Date(raw);
            if (Number.isFinite(parsed.getTime())) return localKey(parsed);
        }
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return `${match[1]}-${match[2]}-${match[3]}`;
        const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        return us ? `${us[3]}-${pad(us[1])}-${pad(us[2])}` : '';
    }

    function displayTime(value) {
        const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
        if (!match) return '';
        const hours = Number(match[1]), minutes = Number(match[2]);
        if (hours > 23 || minutes > 59) return '';
        return `${hours % 12 || 12}:${pad(minutes)} ${hours < 12 ? 'AM' : 'PM'}`;
    }

    function ordinal(number) {
        const suffix = number % 100 >= 11 && number % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[number % 10] || 'th';
        return `${number}${suffix}`;
    }

    function periodNumberFrom(name) {
        const match = String(name || '').match(/\d+/);
        return match ? Number(match[0]) : null;
    }
    // Display schedule data saved by older versions of StudBud.
    // ------------------------------------------------------------------
    function scheduleForDate(ic, date, courses) {
        if (!ic || typeof ic !== 'object') return null;
        const key = Object.prototype.toString.call(date) === '[object Date]' ? localKey(date) : dateKey(date);
        if (!key) return null;
        const calendars = ic.calendars && typeof ic.calendars === 'object' ? ic.calendars : {};
        let day = null;
        let calendarID = '';
        let inRange = false;
        Object.entries(calendars).forEach(([id, days]) => {
            const keys = Object.keys(days || {});
            if (!keys.length) return;
            keys.sort();
            if (key >= keys[0] && key <= keys[keys.length - 1]) inRange = true;
            if (!day && days[key]) {
                day = days[key];
                calendarID = id;
            }
        });
        const weekday = new Date(`${key}T00:00:00`).getDay();
        if (!day && inRange && weekday !== 0 && weekday !== 6) day = { school: false, psID: '', note: '' };
        const sections = list(ic.sections);
        if (!day && !sections.length) return null;
        if (day && !day.school) {
            return { key, school: false, note: day.note || (weekday === 0 || weekday === 6 ? '' : 'No school'), entries: [] };
        }
        const courseList = list(courses);
        const active = sections.filter(item => (!item.termStart || item.termStart <= key) && (!item.termEnd || key <= item.termEnd)
            && (!calendarID || !item.calendarID || item.calendarID === calendarID));
        if (!day) {
            return weekday === 0 || weekday === 6 ? null : { key, school: null, note: '', entries: [], fallback: true };
        }
        const usesPeriodSchedules = active.some(item => item.psID);
        const todays = active.filter(item => !usesPeriodSchedules || !day.psID || !item.psID || item.psID === day.psID);
        const seen = new Set();
        const entries = todays
            .map(item => ({ item, course: courseList.find(course => course.code === item.courseCode) }))
            .filter(({ item, course }) => {
                if (!course) return false;
                const id = `${item.courseCode}|${item.period}|${item.start}`;
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            })
            .sort((left, right) => (left.item.start || '99').localeCompare(right.item.start || '99') || (left.item.seq ?? 99) - (right.item.seq ?? 99))
            .map(({ item, course }, index) => {
                const number = periodNumberFrom(item.period);
                return {
                    period: number !== null && /^\s*\d+\s*$/.test(item.period) ? `${ordinal(number)} Period` : (item.period || `Period ${index + 1}`),
                    time: item.start ? `${displayTime(item.start)}${item.end ? ` - ${displayTime(item.end)}` : ''}` : '',
                    periodNumber: number ?? item.seq ?? index + 1,
                    course,
                    room: item.room || '',
                    source: 'infinite-campus'
                };
            });
        const psName = todays.find(item => item.psName)?.psName || '';
        return { key, school: true, note: day.note || '', psName, entries, fallback: !entries.length };
    }

    function hasImportedSchedule(ic) {
        return Boolean(ic && (list(ic.sections).length || Object.keys(ic.calendars || {}).length));
    }

    const api = { scheduleForDate, hasImportedSchedule, displayTime };
    root.StudBudIC = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

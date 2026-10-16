/**
 * StudBud - Infinite Campus import
 * FILE: infiniteCampusImport.js
 * DESCRIPTION: Collects a student's classes, grades, assignments, schedule and school calendar
 * from a signed-in Infinite Campus session (bookmarklet / console script that runs on the
 * Infinite Campus site), then normalizes, matches and merges that data into StudBud state.
 */
(function (root) {
    'use strict';

    const FORMAT = 'studbud-infinite-campus';
    const ACK_FORMAT = 'studbud-infinite-campus-ack';
    const MAX_TEXT = 160;

    // ------------------------------------------------------------------
    // 1. Collector. This function is stringified into a bookmarklet / console
    // script and runs on the Infinite Campus page, where the student's session
    // cookie makes the portal API available. It must stay self-contained.
    // ------------------------------------------------------------------
    async function studbudInfiniteCampusCollector(studbudOrigin) {
        const FORMAT_NAME = 'studbud-infinite-campus';
        const previous = document.getElementById('studbud-ic-overlay');
        if (previous) previous.remove();
        const box = document.createElement('div');
        box.id = 'studbud-ic-overlay';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', 'StudBud import');
        box.style.cssText = 'position:fixed;z-index:2147483647;top:16px;right:16px;box-sizing:border-box;width:360px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);overflow-y:auto;overscroll-behavior:contain;background:#111827;color:#f9fafb;font:16px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.45);padding:16px;text-align:left';
        const heading = document.createElement('strong');
        heading.textContent = 'StudBud · Infinite Campus import';
        const status = document.createElement('p');
        status.style.cssText = 'margin:8px 0 12px;white-space:pre-line';
        status.setAttribute('aria-live', 'polite');
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
        box.append(heading, status, actions);
        document.body.appendChild(box);
        const say = text => { status.textContent = text; };
        const button = (label, onClick, secondary) => {
            const element = document.createElement('button');
            element.type = 'button';
            element.textContent = label;
            element.style.cssText = `border:0;border-radius:8px;min-height:44px;padding:8px 12px;cursor:pointer;font:inherit;color:#fff;background:${secondary ? '#374151' : '#6366f1'}`;
            element.addEventListener('click', onClick);
            actions.appendChild(element);
            return element;
        };
        const closeButton = () => button('Close', () => box.remove(), true);

        const path = location.pathname;
        const campusIndex = path.indexOf('/campus/');
        const base = `${location.origin}${campusIndex > 0 ? path.slice(0, campusIndex) : ''}/campus/`;
        const warnings = [];
        const get = async url => {
            const response = await fetch(base + url, { credentials: 'include', headers: { Accept: 'application/json' } });
            if (response.status === 401 || response.status === 403) {
                const error = new Error('Infinite Campus says you are not signed in. Sign in, open your Grades page, then run the import again.');
                error.auth = true;
                throw error;
            }
            if (!response.ok) throw new Error(`${url.split('?')[0]} returned ${response.status}`);
            const text = await response.text();
            try {
                return JSON.parse(text);
            } catch (parseError) {
                const error = new Error('Infinite Campus did not return data. Make sure you are signed in to the student portal on this tab.');
                error.auth = true;
                throw error;
            }
        };
        const tryGet = async (url, label) => {
            try {
                return await get(url);
            } catch (error) {
                if (error.auth) throw error;
                warnings.push(`${label} could not be read (${error.message}).`);
                return null;
            }
        };
        const pick = (source, keys) => {
            const out = {};
            if (!source || typeof source !== 'object') return out;
            keys.forEach(key => {
                if (source[key] !== undefined && source[key] !== null) out[key] = source[key];
            });
            return out;
        };
        const list = value => Array.isArray(value) ? value : [];
        const ASSIGNMENT_KEYS = ['objectSectionID', 'assignmentID', 'sectionID', 'assignmentName', 'courseName', 'dueDate', 'assignedDate',
            'scorePoints', 'score', 'scorePercentage', 'totalPoints', 'multiplier', 'missing', 'late', 'incomplete', 'dropped', 'exempt',
            'notGraded', 'turnedIn', 'categoryName', 'categoryID', 'groupID', 'termIDs', 'scoreModifiedDate'];
        const TASK_KEYS = ['termID', 'termName', 'taskID', 'taskName', 'score', 'percent', 'progressScore', 'progressPercent', 'progressPointsEarned', 'progressTotalPoints'];
        const pickCourse = course => ({
            ...pick(course, ['sectionID', 'courseID', 'courseName', 'courseNumber', 'teacherDisplay', 'roomName', 'dropped']),
            gradingTasks: list(course.gradingTasks).map(task => pick(task, TASK_KEYS))
        });

        try {
            say('Finding your student account…');
            const students = list(await get('api/portal/students'));
            if (!students.length) throw new Error('No student was found on this Infinite Campus account.');
            let student = students[0];
            if (students.length > 1) {
                const choice = window.prompt(`Which student should be imported?\n${students.map((item, index) => `${index + 1}. ${item.firstName || ''} ${item.lastName || ''}`.trim()).join('\n')}`, '1');
                if (choice === null) { box.remove(); return; }
                student = students[Math.max(0, Math.min(students.length - 1, Number(choice) - 1 || 0))];
            }
            const personID = encodeURIComponent(student.personID);
            const enrollments = list(student.enrollments).map(item => pick(item, ['enrollmentID', 'calendarID', 'structureID', 'schoolName', 'calendarName', 'endYear', 'startDate', 'endDate']));
            const latestYear = Math.max(0, ...enrollments.map(item => Number(item.endYear) || 0));
            const current = enrollments.filter(item => !latestYear || Number(item.endYear) === latestYear);

            say('Reading your class schedule…');
            let roster = await tryGet(`resources/portal/roster?_expand=%7BsectionPlacements-%7Bterm%7D%7D&personID=${personID}`, 'Schedule');
            if (!Array.isArray(roster)) roster = await tryGet(`resources/portal/roster?personID=${personID}`, 'Schedule');
            roster = list(roster).map(section => ({
                ...pick(section, ['sectionID', 'courseID', 'courseName', 'courseNumber', 'teacherDisplay', 'roomName', 'calendarID', 'endYear']),
                sectionPlacements: list(section.sectionPlacements).map(item => pick(item, ['periodName', 'periodSequence', 'periodScheduleID', 'periodScheduleName',
                    'startTime', 'endTime', 'termID', 'termName', 'termSeq', 'startDate', 'endDate', 'roomName']))
            }));

            say('Reading your grades…');
            const grades = list(await tryGet(`resources/portal/grades?personID=${personID}`, 'Grades')).map(enrollment => ({
                ...pick(enrollment, ['enrollmentID', 'calendarID', 'endYear', 'schoolName']),
                terms: list(enrollment.terms).map(term => ({
                    ...pick(term, ['termID', 'termName', 'termSeq', 'startDate', 'endDate']),
                    courses: list(term.courses).map(pickCourse)
                })),
                courses: list(enrollment.courses).map(pickCourse)
            }));

            say('Reading your assignments…');
            const assignments = list(await tryGet(`api/portal/assignment/listView?personID=${personID}`, 'Assignment list')).map(item => pick(item, ASSIGNMENT_KEYS));

            const sectionIDs = new Set();
            roster.forEach(section => { if (section.sectionID) sectionIDs.add(section.sectionID); });
            grades.forEach(enrollment => {
                if (latestYear && enrollment.endYear && Number(enrollment.endYear) !== latestYear) return;
                enrollment.terms.forEach(term => term.courses.forEach(course => { if (course.sectionID) sectionIDs.add(course.sectionID); }));
                enrollment.courses.forEach(course => { if (course.sectionID) sectionIDs.add(course.sectionID); });
            });
            const details = {};
            const queue = [...sectionIDs];
            let done = 0;
            const worker = async () => {
                while (queue.length) {
                    const sectionID = queue.shift();
                    const detail = await tryGet(`resources/portal/grades/detail/${encodeURIComponent(sectionID)}?personID=${personID}`, `Grade details for section ${sectionID}`);
                    done++;
                    say(`Reading categories, weights and graded work… (${done}/${sectionIDs.size} classes)`);
                    if (!detail) continue;
                    details[sectionID] = {
                        details: list(detail.details).map(entry => ({
                            task: pick(entry.task, ['termID', 'termName', 'taskID', 'taskName', 'score', 'percent', 'progressScore', 'progressPercent']),
                            categories: list(entry.categories).map(category => ({
                                ...pick(category, ['groupID', 'name', 'weight', 'isWeighted', 'isExcluded', 'usePercent', 'seq']),
                                assignments: list(category.assignments).map(item => pick(item, ASSIGNMENT_KEYS))
                            }))
                        }))
                    };
                }
            };
            await Promise.all([worker(), worker(), worker(), worker()]);

            say('Reading your school calendar…');
            const terms = [];
            const days = {};
            for (const structureID of [...new Set(current.map(item => item.structureID).filter(Boolean))]) {
                list(await tryGet(`resources/term?structureID=${encodeURIComponent(structureID)}`, 'Terms'))
                    .forEach(term => terms.push(pick(term, ['termID', 'termName', 'startDate', 'endDate', 'seq', 'structureID'])));
            }
            for (const calendarID of [...new Set(current.map(item => item.calendarID).filter(Boolean))]) {
                const calendarDays = await tryGet(`resources/calendar/instructionalDay?calendarID=${encodeURIComponent(calendarID)}`, 'School calendar');
                if (Array.isArray(calendarDays)) days[calendarID] = calendarDays.map(day => pick(day, ['date', 'periodScheduleID', 'isSchoolDay', 'instruction', 'comments']));
            }

            const payload = {
                format: FORMAT_NAME,
                version: 1,
                exportedAt: new Date().toISOString(),
                source: location.hostname,
                student: { firstName: String(student.firstName || '').slice(0, 40) },
                enrollments: current,
                roster,
                grades,
                details,
                assignments,
                terms,
                days,
                warnings
            };
            const json = JSON.stringify(payload);
            const classCount = sectionIDs.size;
            const workCount = assignments.length;
            let sent = false;
            const send = () => {
                if (!studbudOrigin || !window.opener || window.opener.closed) return false;
                try {
                    window.opener.postMessage(payload, studbudOrigin);
                    return true;
                } catch (error) {
                    return false;
                }
            };
            let acknowledged = false;
            window.addEventListener('message', event => {
                if (event.origin === studbudOrigin && event.data && event.data.format === `${FORMAT_NAME}-ack`) {
                    acknowledged = true;
                    say(`StudBud received ${classCount} classes and ${workCount} assignments.\nSwitch back to the StudBud tab to check your classes and finish the import.`);
                }
            });
            sent = send();
            const summary = `Found ${classCount} classes and ${workCount} assignments.${warnings.length ? `\n${warnings.length} item(s) could not be read; the rest is fine.` : ''}`;
            const writeClipboard = async () => {
                try {
                    await navigator.clipboard.writeText(json);
                    return true;
                } catch (error) {
                    const area = document.createElement('textarea');
                    area.value = json;
                    area.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
                    document.body.appendChild(area);
                    area.focus();
                    area.select();
                    area.setSelectionRange(0, area.value.length);
                    let copied = false;
                    try { copied = document.execCommand('copy'); } catch (copyError) { copied = false; }
                    area.remove();
                    return copied;
                }
            };
            const fallBackToClipboard = async () => {
                if (acknowledged) return;
                const copied = await writeClipboard();
                say(copied
                    ? `${summary}\nYour data is copied. Go back to StudBud and click "Paste data from Campus".`
                    : `${summary}\nClick "Copy data", then go back to StudBud and click "Paste data from Campus".`);
            };
            say(sent ? `${summary}\nSending to StudBud…` : summary);
            if (sent) setTimeout(fallBackToClipboard, 2000);
            else fallBackToClipboard();
            const copy = async () => {
                const copied = await writeClipboard();
                say(copied
                    ? `${summary}\nCopied! Go back to StudBud and click "Paste data from Campus".`
                    : `${summary}\nYour browser blocked copying. Use "Show data" to select and copy it manually, or use "Download .json" and choose the file in StudBud.`);
            };
            button('Copy data', copy);
            button('Show data', () => {
                let area = box.querySelector('textarea');
                if (!area) {
                    area = document.createElement('textarea');
                    area.value = json;
                    area.readOnly = true;
                    area.setAttribute('aria-label', 'Infinite Campus data to copy into StudBud');
                    area.style.cssText = 'box-sizing:border-box;width:100%;height:120px;margin-top:12px;font:16px/1.4 system-ui;color:#111827;background:#fff';
                    box.appendChild(area);
                }
                area.focus();
                area.select();
                area.setSelectionRange(0, area.value.length);
                say(`${summary}\nTap and hold the selected data and choose Copy (or press Ctrl+C / Cmd+C), then return to StudBud and paste it into the data box.`);
            }, true);
            button('Download .json', () => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
                link.download = 'studbud-infinite-campus.json';
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(link.href), 10000);
            }, true);
            if (studbudOrigin && window.opener) button('Send to StudBud again', () => { if (!send()) say('StudBud is no longer open in the other tab. Use Copy data instead.'); }, true);
            closeButton();
        } catch (error) {
            say(error && error.message ? error.message : 'Infinite Campus data could not be read.');
            closeButton();
        }
    }

    function buildConsoleScript(studbudOrigin) {
        const origin = /^https?:\/\//.test(String(studbudOrigin || '')) ? studbudOrigin : '';
        return `(${studbudInfiniteCampusCollector.toString()})(${JSON.stringify(origin)});`;
    }

    function buildBookmarklet(studbudOrigin) {
        return `javascript:${encodeURIComponent(`${buildConsoleScript(studbudOrigin)}void 0`)}`;
    }

    // ------------------------------------------------------------------
    // 2. Small helpers
    // ------------------------------------------------------------------
    const list = value => Array.isArray(value) ? value : [];
    const text = (value, max = MAX_TEXT) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    const num = value => {
        if (value === null || value === undefined || value === '') return null;
        const parsed = Number(String(value).replace(/,/g, '').trim());
        return Number.isFinite(parsed) ? parsed : null;
    };
    const bool = value => value === true || value === 'true' || value === 1 || value === '1';
    const round2 = value => Math.round(value * 100) / 100;
    const pad = value => String(value).padStart(2, '0');
    const localKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const idText = value => text(value, 40).replace(/[^A-Za-z0-9_.:-]/g, '');

    function dateKey(value) {
        if (!value) return '';
        const raw = String(value).trim();
        // Timestamps with an explicit zone are converted to the student's local day
        if (/T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
            const parsed = new Date(raw);
            if (Number.isFinite(parsed.getTime())) return localKey(parsed);
        }
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return `${match[1]}-${match[2]}-${match[3]}`;
        const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        return us ? `${us[3]}-${pad(us[1])}-${pad(us[2])}` : '';
    }

    function clockTime(value) {
        const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
        if (!match) return '';
        const hours = Number(match[1]);
        if (hours > 23 || Number(match[2]) > 59) return '';
        return `${pad(hours)}:${match[2]}`;
    }

    function displayTime(value) {
        const clock = clockTime(value);
        if (!clock) return '';
        const [hours, minutes] = clock.split(':').map(Number);
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

    function slug(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'item';
    }

    // Infinite Campus course names are often upper case; make them readable
    function tidyTitle(value) {
        const title = text(value, 100);
        if (!title || /[a-z]/.test(title)) return title;
        const keep = new Set(['AP', 'IB', 'US', 'U.S.', 'PE', 'II', 'III', 'IV', 'VI', 'CTE', 'ELA', 'ESL', 'ELL', 'JROTC', 'STEM', 'DHH', 'PLTW', 'CAD', 'AVID', 'AB', 'BC', 'CSP', 'CSA', 'JV', 'IT', 'ACT', 'SAT', 'TV', 'ESOL']);
        return title.split(/(\s+|-|\/)/).map(part => keep.has(part) || /\d/.test(part) || part.length <= 1 && /[A-Z]/.test(part) && part !== 'A'
            ? part : part.charAt(0) + part.slice(1).toLowerCase()).join('');
    }

    // ------------------------------------------------------------------
    // 3. Payload parsing and normalization
    // ------------------------------------------------------------------
    function parsePayload(input) {
        let data = input;
        if (typeof input === 'string') {
            const trimmed = input.trim();
            if (!trimmed) throw new Error('Paste the data copied from Infinite Campus first.');
            try {
                data = JSON.parse(trimmed);
            } catch (error) {
                throw new Error('That does not look like StudBud Infinite Campus data. Copy it again from the Infinite Campus tab.');
            }
        }
        if (!data || typeof data !== 'object' || data.format !== FORMAT) {
            throw new Error('That does not look like StudBud Infinite Campus data. Copy it again from the Infinite Campus tab.');
        }
        if (Number(data.version) !== 1) throw new Error('This import was made by a newer version of StudBud. Refresh StudBud and try again.');
        return normalizePayload(data);
    }

    function normalizeAssignment(item, fallbackSectionID, category) {
        const sectionID = idText(item.sectionID ?? fallbackSectionID);
        const name = text(item.assignmentName, 120);
        if (!sectionID || !name) return null;
        const rawId = idText(item.objectSectionID ?? item.assignmentID) || slug(`${sectionID}_${name}_${item.dueDate || ''}`);
        const multiplier = num(item.multiplier);
        return {
            id: rawId,
            sectionID,
            title: name,
            dueDate: dateKey(item.dueDate),
            assignedDate: dateKey(item.assignedDate),
            scorePoints: num(item.scorePoints),
            scoreText: text(item.score, 12),
            totalPoints: num(item.totalPoints),
            multiplier: multiplier !== null && multiplier > 0 ? multiplier : null,
            categoryID: idText(category?.groupID ?? item.groupID ?? item.categoryID),
            categoryName: text(category?.name ?? item.categoryName, 60),
            missing: bool(item.missing),
            late: bool(item.late),
            dropped: bool(item.dropped),
            exempt: bool(item.exempt),
            notGraded: bool(item.notGraded),
            turnedIn: bool(item.turnedIn),
            gradedAt: dateKey(item.scoreModifiedDate)
        };
    }

    function normalizePayload(data) {
        const enrollments = list(data.enrollments);
        const latestYear = Math.max(0, ...enrollments.map(item => Number(item.endYear) || 0));
        const calendarIDs = new Set(enrollments
            .filter(item => !latestYear || !item.endYear || Number(item.endYear) === latestYear)
            .map(item => idText(item.calendarID)).filter(Boolean));
        const inCurrentYear = item => (!item.calendarID || !calendarIDs.size || calendarIDs.has(idText(item.calendarID)))
            && (!latestYear || !item.endYear || Number(item.endYear) === latestYear);

        const terms = new Map();
        const addTerm = term => {
            const id = idText(term.termID);
            if (!id) return;
            const existing = terms.get(id) || {};
            terms.set(id, {
                id,
                name: text(term.termName, 30) || existing.name || '',
                start: dateKey(term.startDate || term.termStartDate) || existing.start || '',
                end: dateKey(term.endDate || term.termEndDate) || existing.end || '',
                seq: num(term.seq ?? term.termSeq) ?? existing.seq ?? null
            });
        };
        list(data.terms).forEach(addTerm);

        const sections = new Map();
        const sectionFor = (source, calendarID) => {
            const id = idText(source.sectionID);
            if (!id) return null;
            if (!sections.has(id)) {
                sections.set(id, {
                    id, courseNumber: '', name: '', teacher: '', room: '', calendarID: idText(calendarID),
                    placements: [], termIDs: new Set(), grades: [], categories: new Map(), dropped: false, fromRoster: false
                });
            }
            const section = sections.get(id);
            section.courseNumber ||= text(source.courseNumber, 30);
            section.name ||= text(source.courseName, 100);
            section.teacher ||= text(source.teacherDisplay, 80);
            section.room ||= text(source.roomName, 40);
            section.calendarID ||= idText(calendarID);
            return section;
        };

        list(data.roster).filter(inCurrentYear).forEach(item => {
            const section = sectionFor(item, item.calendarID);
            if (!section) return;
            section.fromRoster = true;
            list(item.sectionPlacements).forEach(placement => {
                addTerm({ termID: placement.termID, termName: placement.termName, startDate: placement.startDate, endDate: placement.endDate, termSeq: placement.termSeq });
                const termID = idText(placement.termID);
                if (termID) section.termIDs.add(termID);
                section.placements.push({
                    periodName: text(placement.periodName, 20),
                    periodSeq: num(placement.periodSequence),
                    psID: idText(placement.periodScheduleID),
                    psName: text(placement.periodScheduleName, 40),
                    start: clockTime(placement.startTime),
                    end: clockTime(placement.endTime),
                    termID,
                    room: text(placement.roomName, 40) || section.room
                });
            });
        });

        const addGradeCourse = (course, term, calendarID) => {
            const section = sectionFor(course, calendarID);
            if (!section) return;
            if (bool(course.dropped)) section.dropped = true;
            if (term) {
                addTerm(term);
                const termID = idText(term.termID);
                if (termID) section.termIDs.add(termID);
            }
            list(course.gradingTasks).forEach(task => {
                const percent = num(task.progressPercent ?? task.percent);
                const score = text(task.progressScore ?? task.score, 8);
                if (percent === null && !score) return;
                const key = `${task.termID}_${task.taskID}_${task.taskName}`;
                if (section.grades.some(grade => grade.key === key)) return;
                section.grades.push({ key, term: text(task.termName || term?.termName, 30), task: text(task.taskName, 40), score, percent });
            });
        };
        list(data.grades).filter(inCurrentYear).forEach(enrollment => {
            list(enrollment.terms).forEach(term => list(term.courses).forEach(course => addGradeCourse(course, term, enrollment.calendarID)));
            list(enrollment.courses).forEach(course => addGradeCourse(course, null, enrollment.calendarID));
        });

        const assignments = new Map();
        const addAssignment = (item, sectionID, category) => {
            const normalized = normalizeAssignment(item, sectionID, category);
            if (!normalized || !sections.has(normalized.sectionID)) return;
            const existing = assignments.get(normalized.id);
            if (!existing) {
                assignments.set(normalized.id, normalized);
                return;
            }
            // Grade details carry the category; the list view may carry newer flags
            Object.entries(normalized).forEach(([key, value]) => {
                if (value === '' || value === null) return;
                if ((key === 'categoryID' || key === 'categoryName') && existing[key]) return;
                existing[key] = typeof value === 'boolean' ? existing[key] || value : value;
            });
        };
        Object.entries(data.details && typeof data.details === 'object' ? data.details : {}).forEach(([sectionID, detail]) => {
            const section = sections.get(idText(sectionID));
            if (!section) return;
            list(detail?.details).forEach(entry => {
                if (entry.task?.termID) section.termIDs.add(idText(entry.task.termID));
                list(entry.categories).forEach(category => {
                    const name = text(category.name, 60);
                    if (!name) return;
                    const key = idText(category.groupID) || slug(name);
                    const rawWeight = num(category.weight);
                    const weighted = category.isWeighted === undefined ? rawWeight !== null : bool(category.isWeighted);
                    const weight = weighted && rawWeight !== null ? round2(Math.max(0, Math.min(100, rawWeight))) : null;
                    const existing = section.categories.get(key);
                    if (!existing || (!existing.weight && weight)) {
                        section.categories.set(key, {
                            id: key, name, weight,
                            excluded: category.isExcluded === undefined ? false : bool(category.isExcluded),
                            usePercent: bool(category.usePercent)
                        });
                    }
                    list(category.assignments).forEach(item => addAssignment(item, section.id, { groupID: key, name }));
                });
            });
        });
        list(data.assignments).forEach(item => addAssignment(item, item.sectionID));

        const calendars = {};
        Object.entries(data.days && typeof data.days === 'object' ? data.days : {}).forEach(([calendarID, days]) => {
            const id = idText(calendarID);
            if (!id || (calendarIDs.size && !calendarIDs.has(id))) return;
            const map = {};
            list(days).forEach(day => {
                const key = dateKey(day.date);
                if (!key) return;
                const school = day.isSchoolDay === undefined ? day.instruction === undefined || bool(day.instruction) : bool(day.isSchoolDay);
                map[key] = { psID: idText(day.periodScheduleID), school, note: text(day.comments, 80) };
            });
            if (Object.keys(map).length) calendars[id] = map;
        });

        return {
            exportedAt: text(data.exportedAt, 40),
            source: text(data.source, 100),
            studentName: text(data.student?.firstName, 40),
            schoolName: text(enrollments[0]?.schoolName, 80),
            terms: [...terms.values()],
            sections: [...sections.values()].map(section => ({
                ...section,
                termIDs: [...section.termIDs],
                categories: [...section.categories.values()]
            })),
            assignments: [...assignments.values()].map(item => ({ ...item, multiplier: item.multiplier ?? 1 })),
            calendars,
            warnings: list(data.warnings).map(item => text(item, 200)).slice(0, 20)
        };
    }

    // ------------------------------------------------------------------
    // 4. Catalog matching
    // ------------------------------------------------------------------
    const ABBREVIATIONS = {
        alg: 'algebra', algeb: 'algebra', geom: 'geometry', trig: 'trigonometry', calc: 'calculus', precalc: 'precalculus',
        stat: 'statistics', stats: 'statistics', bio: 'biology', biol: 'biology', chem: 'chemistry', phys: 'physics', sci: 'science',
        env: 'environmental', enviro: 'environmental', envir: 'environmental', hist: 'history', hst: 'history', govt: 'government',
        gov: 'government', econ: 'economics', psych: 'psychology', psy: 'psychology', soc: 'sociology', eng: 'english', engl: 'english',
        lit: 'literature', lang: 'language', comp: 'composition', hon: 'honors', hnr: 'honors', hnrs: 'honors', honor: 'honors',
        h: 'honors', adv: 'advanced', intro: 'introduction', amer: 'american', wld: 'world', wrld: 'world', mgmt: 'management',
        mktg: 'marketing', acct: 'accounting', tech: 'technology', prin: 'principles', fund: 'fundamentals', span: 'spanish',
        fren: 'french', germ: 'german', chin: 'chinese', anat: 'anatomy', physiol: 'physiology', ed: 'education', educ: 'education',
        i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', one: '1', two: '2', three: '3', four: '4',
        chor: 'chorus', orch: 'orchestra', photo: 'photography', ceram: 'ceramics', draw: 'drawing', paint: 'painting',
        lab: 'lab', compsci: 'computer science', cs: 'computer science', csp: 'computer science principles',
        pe: 'physical education', us: 'united states', usa: 'united states', apush: 'ap united states history'
    };
    const STOP_WORDS = new Set(['and', 'of', 'the', 'in', 'to', 'for', 'a', 'an', 'with', 'class', 'course']);

    function titleTokens(value) {
        const cleaned = String(value || '').toLowerCase()
            .replace(/u\.s\./g, 'us')
            .replace(/advanced placement/g, 'ap')
            .replace(/\bcomp\.?\s*sci(ence)?\b/g, 'computer science')
            .replace(/\bphys\.?\s*ed(uc(ation)?)?\b/g, 'physical education')
            .replace(/\bp\.e\.?(?=\s|$)/g, 'pe')
            .replace(/&/g, ' and ')
            .replace(/\b(?:sem(?:ester)?|s|t|q|tri(?:mester)?)\s*-?\s*[1-4]\b/g, ' ')
            .replace(/\b(?:1st|2nd|first|second)\s+sem(?:ester)?\b/g, ' ')
            .replace(/([a-z])(\d)/g, '$1 $2')
            .replace(/(\d)([a-z])/g, '$1 $2')
            .replace(/[^a-z0-9]+/g, ' ');
        const tokens = [];
        cleaned.split(' ').filter(Boolean).forEach(token => {
            (ABBREVIATIONS[token] || token).split(' ').forEach(part => {
                if (!STOP_WORDS.has(part)) tokens.push(part);
            });
        });
        return tokens;
    }

    function bigrams(value) {
        const source = ` ${value} `;
        const grams = [];
        for (let index = 0; index < source.length - 1; index++) grams.push(source.slice(index, index + 2));
        return grams;
    }

    function dice(left, right) {
        if (!left.length && !right.length) return 1;
        if (!left.length || !right.length) return 0;
        const counts = new Map();
        left.forEach(item => counts.set(item, (counts.get(item) || 0) + 1));
        let shared = 0;
        right.forEach(item => {
            const count = counts.get(item) || 0;
            if (count > 0) {
                shared++;
                counts.set(item, count - 1);
            }
        });
        return 2 * shared / (left.length + right.length);
    }

    function titleSimilarity(left, right) {
        const a = [...new Set(titleTokens(left))];
        const b = [...new Set(titleTokens(right))];
        if (!a.length || !b.length) return 0;
        const words = list => list.filter(token => !/^\d+$/.test(token) && !['ap', 'honors', 'ib'].includes(token));
        const wordsA = words(a);
        const wordsB = words(b);
        let shared = 0;
        const used = new Set();
        wordsA.forEach(token => {
            let best = 0;
            let bestIndex = -1;
            wordsB.forEach((other, index) => {
                if (used.has(index)) return;
                let score = token === other ? 1 : 0;
                if (!score && Math.min(token.length, other.length) >= 3 && (token.startsWith(other) || other.startsWith(token))) score = 0.85;
                if (score > best) { best = score; bestIndex = index; }
            });
            if (bestIndex >= 0) used.add(bestIndex);
            shared += best;
        });
        const recall = wordsA.length ? shared / wordsA.length : 0;
        const precision = wordsB.length ? shared / wordsB.length : 0;
        const charScore = dice(bigrams(wordsA.join(' ')), bigrams(wordsB.join(' ')));
        // Infinite Campus names are often abbreviated or cut off, so covering its words matters most
        let score = 0.5 * recall + 0.2 * precision + 0.3 * charScore;
        const has = (tokens, flag) => tokens.includes(flag);
        if (has(a, 'ap') !== has(b, 'ap')) score *= 0.5;
        if (has(a, 'ib') !== has(b, 'ib')) score *= 0.6;
        if (has(a, 'honors') !== has(b, 'honors')) score *= 0.65;
        const numbersA = a.filter(token => /^\d+$/.test(token)).join(' ');
        const numbersB = b.filter(token => /^\d+$/.test(token)).join(' ');
        if (numbersA && numbersB && numbersA !== numbersB) score *= 0.55;
        else if (Boolean(numbersA) !== Boolean(numbersB)) score *= 0.85;
        const special = ['ell', 'dhh', 'alt', 'parallel', 'mentor', 'ipbl', 'semester', 'esl', 'keys'];
        if (special.some(token => has(b, token) && !has(a, token))) score *= 0.7;
        return Math.max(0, Math.min(1, score));
    }

    function normalizeCourseNumber(value) {
        return String(value || '').toUpperCase().split(/[-\s.]/)[0].replace(/[^A-Z0-9]/g, '');
    }

    function matchCourse(courseNumber, courseName, catalog) {
        const candidates = list(catalog).filter(course => course && !course.legacy && course.code);
        const number = normalizeCourseNumber(courseNumber);
        if (number) {
            const variants = [
                [value => value, 1],
                [value => value.replace(/[A-Z]+$/, ''), 0.96],
                [value => value.replace(/[A-Z]+$/, '').replace(/^0+/, ''), 0.92]
            ];
            for (const [transform, confidence] of variants) {
                const target = transform(number);
                if (!target) continue;
                const found = candidates.find(course => String(course.code).split('/').some(code => transform(normalizeCourseNumber(code)) === target));
                if (found) return { course: found, confidence, method: 'number', suggestions: [found] };
            }
        }
        // Parkway numbers English by course (English 1-4) while many schools use grade levels (English 9-12)
        const names = [courseName];
        const gradeEnglish = String(courseName || '').match(/\b(?:eng(?:lish|l)?)\.?\s*(9|10|11|12)\b/i);
        if (gradeEnglish) names.push(String(courseName).replace(gradeEnglish[0], `English ${Number(gradeEnglish[1]) - 8}`));
        const ranked = candidates
            .map(course => ({ course, score: Math.max(...names.map(name => titleSimilarity(name, course.title))) }))
            .filter(item => item.score > 0.2)
            .sort((left, right) => right.score - left.score);
        const best = ranked[0];
        const suggestions = ranked.slice(0, 8).map(item => item.course);
        if (best && best.score >= 0.6) return { course: best.course, confidence: round2(best.score), method: 'title', suggestions };
        return { course: null, confidence: best ? round2(best.score) : 0, method: 'none', suggestions };
    }

    // ------------------------------------------------------------------
    // 5. Import plan: group sections into StudBud classes
    // ------------------------------------------------------------------
    const SUBJECT_MAP = {
        'Visual Arts': 'Fine Arts', 'Fine Arts': 'Fine Arts', Business: 'Practical Arts', CS: 'Practical Arts', CTE: 'Practical Arts',
        'Practical Arts': 'Practical Arts', ELA: 'ELA', Math: 'Math', Science: 'Science', 'Social Studies': 'Social Studies',
        PE: 'PE', Health: 'Health', 'Personal Finance': 'Personal Finance', Electives: 'Electives', 'World Languages': 'Electives'
    };

    function guessSubject(name) {
        const value = String(name || '').toLowerCase();
        if (/personal finance/.test(value)) return 'Personal Finance';
        if (/\bhealth\b/.test(value)) return 'Health';
        if (/\b(pe|phys(ical)? ed|fitness|weight|strength|athletic|sport|dance|yoga|lifetime)/.test(value)) return 'PE';
        if (/\b(eng(lish)?|lit(erature)?|composition|writing|journalism|speech|debate|ela|rhetoric)\b/.test(value)) return 'ELA';
        if (/\b(alg(ebra)?|geom(etry)?|calc(ulus)?|precalc|trig|stat(istic)?s?|math)/.test(value)) return 'Math';
        if (/\b(bio(logy)?|chem(istry)?|phys(ics)?|science|anatomy|earth|environmental|astronomy|geology|forensic)/.test(value)) return 'Science';
        if (/\b(hist(ory)?|gov(ernment|t)?|econ(omics)?|psych(ology)?|sociology|geography|civics|world|human geo)/.test(value)) return 'Social Studies';
        if (/\b(art|drawing|painting|ceramic|sculpture|photo|music|band|choir|chorus|orchestra|theat(re|er)|drama|design)/.test(value)) return 'Fine Arts';
        if (/\b(business|marketing|accounting|computer|programming|engineering|tech|cte|culinary|foods|woods|automotive)/.test(value)) return 'Practical Arts';
        return 'Electives';
    }

    function termSpan(section, termsById) {
        let start = '';
        let end = '';
        section.termIDs.forEach(id => {
            const term = termsById.get(id);
            if (!term) return;
            if (term.start && (!start || term.start < start)) start = term.start;
            if (term.end && (!end || term.end > end)) end = term.end;
        });
        return start && end ? { start, end } : null;
    }

    function classifyTerm(span, yearSpan) {
        if (!span || !yearSpan) return 'FY';
        const toTime = key => new Date(`${key}T00:00:00`).getTime();
        const yearLength = toTime(yearSpan.end) - toTime(yearSpan.start);
        if (yearLength <= 0) return 'FY';
        const coverage = (toTime(span.end) - toTime(span.start)) / yearLength;
        if (coverage >= 0.7) return 'FY';
        const middle = toTime(yearSpan.start) + yearLength / 2;
        return (toTime(span.start) + toTime(span.end)) / 2 < middle ? 'S1' : 'S2';
    }

    function looksNonAcademic(name) {
        return /\b(homeroom|advisory|lunch|attendance|study hall|seminar|flex|resource|ac(ademic)? lab|passing|announcements?|tutorial|access)\b/i.test(String(name || ''));
    }

    function buildImportPlan(model, state = {}, options = {}) {
        const school = ['pchs', 'pnhs', 'pshs', 'pwhs', 'other'].includes(options.school) ? options.school : 'pchs';
        const catalog = list(options.catalog);
        const courses = list(state.courses);
        const termsById = new Map(model.terms.map(term => [term.id, term]));
        const allStarts = model.terms.map(term => term.start).filter(Boolean).sort();
        const allEnds = model.terms.map(term => term.end).filter(Boolean).sort();
        const yearSpan = allStarts.length && allEnds.length ? { start: allStarts[0], end: allEnds[allEnds.length - 1] } : null;
        const assignmentCounts = new Map();
        model.assignments.forEach(item => assignmentCounts.set(item.sectionID, (assignmentCounts.get(item.sectionID) || 0) + 1));

        const groups = new Map();
        model.sections.forEach(section => {
            const match = school !== 'other' ? matchCourse(section.courseNumber, section.name, catalog) : { course: null, confidence: 0, method: 'none', suggestions: [] };
            const nameKey = titleTokens(section.name).join(' ') || section.id;
            const key = match.course && match.confidence >= 0.55 ? `catalog:${match.course.code}` : `name:${nameKey}`;
            if (!groups.has(key)) groups.set(key, { key, sections: [], match, assignmentCount: 0 });
            const group = groups.get(key);
            group.sections.push(section);
            group.assignmentCount += assignmentCounts.get(section.id) || 0;
            if (match.confidence > group.match.confidence) group.match = match;
        });

        const usedExisting = new Set();
        const plan = [...groups.values()].map(group => {
            const sectionIDs = group.sections.map(section => section.id);
            const spans = group.sections.map(section => termSpan(section, termsById)).filter(Boolean);
            const span = spans.length ? {
                start: spans.map(item => item.start).sort()[0],
                end: spans.map(item => item.end).sort().slice(-1)[0]
            } : null;
            const first = group.sections[0];
            const placements = group.sections.flatMap(section => section.placements);
            const periods = [...new Set(placements.map(item => item.periodName).filter(Boolean))];
            const times = [...new Set(placements.filter(item => item.start).map(item => `${displayTime(item.start)}–${displayTime(item.end)}`))];
            const graded = group.sections.flatMap(section => section.grades);
            const hasWork = group.assignmentCount > 0 || graded.length > 0;
            const existing = courses.find(course => !usedExisting.has(course.code) && list(course.icSectionIDs).some(id => sectionIDs.includes(String(id))))
                || courses.find(course => !usedExisting.has(course.code) && !list(course.icSectionIDs).length && (
                    (group.match.course && group.match.confidence >= 0.55 && (course.catalogCode || course.code) === group.match.course.code)
                    || (!group.match.course && String(course.title || '').toLowerCase() === tidyTitle(first.name).toLowerCase())
                ));
            if (existing) usedExisting.add(existing.code);
            const dropped = group.sections.every(section => section.dropped);
            return {
                key: group.key,
                name: tidyTitle(first.name) || 'Untitled class',
                courseNumbers: [...new Set(group.sections.map(section => section.courseNumber).filter(Boolean))],
                teacher: first.teacher,
                room: first.room,
                sectionIDs,
                periods,
                times,
                term: classifyTerm(span, yearSpan),
                grades: graded.slice(-3).map(({ term, task, score, percent }) => ({ term, task, score, percent })),
                assignmentCount: group.assignmentCount,
                categoryCount: new Set(group.sections.flatMap(section => section.categories.map(category => category.name.toLowerCase()))).size,
                match: group.match.course && group.match.confidence >= 0.55
                    ? { code: group.match.course.code, title: group.match.course.title, confidence: group.match.confidence, method: group.match.method }
                    : null,
                suggestions: group.match.suggestions.map(course => ({ code: course.code, title: course.title })),
                existingCode: existing ? existing.code : null,
                include: !dropped && (hasWork || (!looksNonAcademic(first.name) && Boolean(group.match.course))),
                dropped
            };
        });
        plan.sort((left, right) => {
            const period = item => Math.min(...item.periods.map(periodNumberFrom).filter(Number.isFinite), 99);
            return period(left) - period(right) || left.name.localeCompare(right.name);
        });
        return {
            school,
            classes: plan,
            counts: {
                classes: plan.length,
                assignments: model.assignments.length,
                graded: model.assignments.filter(item => item.scorePoints !== null).length,
                days: Object.values(model.calendars).reduce((sum, days) => sum + Object.keys(days).length, 0)
            },
            yearSpan
        };
    }

    // ------------------------------------------------------------------
    // 6. Apply the plan to StudBud state (pure: returns new collections)
    // ------------------------------------------------------------------
    function guessKind(title, categoryName) {
        const value = `${title} ${categoryName}`.toLowerCase();
        if (/\b(test|exam|midterm|final|summative|assessment|unit check|ccsa|eoc)\b/.test(value)) return 'test';
        if (/\bquiz(zes)?\b/.test(value)) return 'quiz';
        return 'assignment';
    }

    function applyImportPlan(model, plan, state = {}, options = {}) {
        const include = {
            categories: options.categories !== false,
            graded: options.graded !== false,
            upcoming: options.upcoming !== false,
            schedule: options.schedule !== false,
            calendar: options.calendar !== false
        };
        const overrides = options.overrides || {};
        const catalog = list(options.catalog);
        const today = options.today || localKey(new Date());
        const now = Number(options.now) || Date.now();
        const school = plan.school;
        const courses = list(state.courses).map(course => ({ ...course, categories: list(course.categories).map(category => ({ ...category })) }));
        const assignments = list(state.assignments).map(item => ({ ...item }));
        const schedule = { all: {}, odd: {}, even: {}, ...(state.schedule || {}) };
        const sectionsById = new Map(model.sections.map(section => [section.id, section]));
        const summary = { coursesAdded: 0, coursesUpdated: 0, categories: 0, gradedAdded: 0, gradedUpdated: 0, upcomingAdded: 0, upcomingUpdated: 0, periods: 0, days: 0, skipped: 0 };
        const sectionToCourse = new Map();
        const categoryLookup = new Map();
        const touchedCodes = [];

        plan.classes.forEach(entry => {
            const override = Object.prototype.hasOwnProperty.call(overrides, entry.key) ? overrides[entry.key] : undefined;
            if (override === 'skip' || (override === undefined && !entry.include)) {
                summary.skipped++;
                return;
            }
            const catalogCode = override === undefined ? entry.match?.code || '' : override;
            const catalogCourse = school !== 'other' && catalogCode ? catalog.find(course => course.code === catalogCode) : null;
            let course = entry.existingCode ? courses.find(item => item.code === entry.existingCode) : null;
            const isNew = !course;
            if (isNew) {
                let code;
                if (catalogCourse) {
                    const used = courses.some(item => (item.catalogCode || item.code) === catalogCourse.code);
                    code = used ? `${catalogCourse.code}_${entry.term}_${now}` : catalogCourse.code;
                } else {
                    code = `IC_${slug(entry.sectionIDs[0])}`;
                }
                while (courses.some(item => item.code === code)) code = `${code}_${courses.length}`;
                course = { code, school, targetPct: null, categories: [] };
                courses.push(course);
                summary.coursesAdded++;
            } else {
                summary.coursesUpdated++;
            }
            const sections = entry.sectionIDs.map(id => sectionsById.get(id)).filter(Boolean);
            const name = entry.name;
            Object.assign(course, {
                school: course.school || school,
                catalogCode: catalogCourse ? catalogCourse.code : (isNew ? '' : course.catalogCode || ''),
                title: catalogCourse ? catalogCourse.title : (isNew || !course.title ? name : course.title),
                term: entry.term,
                credits: catalogCourse ? Number(catalogCourse.credits) : Number(course.credits) || (entry.term === 'FY' ? 1 : 0.5),
                category: catalogCourse ? SUBJECT_MAP[catalogCourse.category] || 'Electives' : course.category || guessSubject(name),
                isWeighted: catalogCourse ? Boolean(catalogCourse.isWeighted) : (isNew ? /\b(ap|honors?|ib|dual|hnrs?)\b/i.test(name) : Boolean(course.isWeighted)),
                icSectionIDs: [...new Set([...list(course.icSectionIDs).map(String), ...entry.sectionIDs])],
                icCourseNumber: entry.courseNumbers.join(', '),
                icName: name,
                icTeacher: entry.teacher,
                icRoom: entry.room
            });
            touchedCodes.push(course.code);
            entry.sectionIDs.forEach(id => sectionToCourse.set(id, course));

            const byName = new Map(course.categories.map(category => [String(category.name).toLowerCase(), category]));
            sections.forEach(section => section.categories.forEach(category => {
                const lookupKey = `${section.id}|${category.id}`;
                let target = byName.get(category.name.toLowerCase());
                if (!target && include.categories) {
                    let id = `category_ic_${slug(category.id)}`;
                    while (course.categories.some(item => item.id === id)) id = `${id}_${course.categories.length}`;
                    target = { id, name: category.name, weight: category.excluded ? 0 : category.weight, excluded: category.excluded };
                    course.categories.push(target);
                    byName.set(category.name.toLowerCase(), target);
                    summary.categories++;
                } else if (target && include.categories && !target.icUpdated) {
                    target.weight = category.excluded ? 0 : category.weight;
                    target.excluded = category.excluded;
                    target.icUpdated = true;
                }
                if (target) categoryLookup.set(lookupKey, { category: target, source: category });
                const nameKey = `${section.id}|name:${category.name.toLowerCase()}`;
                if (target) categoryLookup.set(nameKey, { category: target, source: category });
            }));
            course.categories.forEach(category => { delete category.icUpdated; });
        });

        model.assignments.forEach(item => {
            const course = sectionToCourse.get(item.sectionID);
            if (!course) return;
            const resolved = categoryLookup.get(`${item.sectionID}|${item.categoryID}`)
                || categoryLookup.get(`${item.sectionID}|name:${item.categoryName.toLowerCase()}`);
            const category = resolved?.category
                || course.categories.find(entry => item.categoryName && entry.name.toLowerCase() === item.categoryName.toLowerCase())
                || null;
            const excluded = Boolean(resolved?.source?.excluded);
            const ignored = item.dropped || item.exempt || item.notGraded || excluded;
            const scored = item.scorePoints !== null;
            const graded = scored && !ignored;
            if (graded && !include.graded) return;
            if (!graded && !include.upcoming) return;
            let earned = scored ? item.scorePoints : 0;
            let possible = item.totalPoints ?? 0;
            if (resolved?.source?.usePercent && scored && possible > 0) {
                earned = earned / possible * 100;
                possible = 100;
            } else if (item.multiplier !== 1) {
                earned *= item.multiplier;
                possible *= item.multiplier;
            }
            const id = `ic_${item.id}`;
            const current = assignments.find(entry => entry.id === id);
            const kind = current?.kind && current.kind !== 'assignment' ? current.kind : guessKind(item.title, item.categoryName || category?.name || '');
            const pastDue = item.dueDate && item.dueDate < today;
            let status;
            if (graded || ignored || item.turnedIn) status = 'completed';
            else if (item.missing) status = 'pending';
            else if (current?.status === 'completed') status = 'completed';
            else status = pastDue ? 'completed' : 'pending';
            const assignment = {
                ...(current || {}),
                id,
                title: item.title,
                courseCode: course.code,
                dueDate: item.dueDate || current?.dueDate || '',
                pointsEarned: round2(Math.max(0, earned)),
                maxPoints: round2(Math.max(0, possible)),
                categoryId: category ? category.id : null,
                kind,
                estimatedMinutes: current?.estimatedMinutes || (kind === 'test' ? 90 : kind === 'quiz' ? 45 : 30),
                importance: current?.importance || (kind === 'test' ? 4 : 3),
                priority: current?.priority || 'high',
                graded,
                status,
                gradedAt: graded ? (item.gradedAt || current?.gradedAt || item.dueDate || today) : null,
                source: 'infinite-campus',
                icMissing: item.missing && !scored,
                icLate: item.late,
                icExcused: ignored && !graded
            };
            if (current) Object.assign(current, assignment);
            else assignments.push(assignment);
            const bucket = graded ? 'graded' : 'upcoming';
            summary[`${bucket}${current ? 'Updated' : 'Added'}`]++;
        });

        if (include.schedule || include.calendar) {
            const sections = [];
            if (include.schedule) {
                const termsById = new Map(model.terms.map(term => [term.id, term]));
                model.sections.forEach(section => {
                    const course = sectionToCourse.get(section.id);
                    if (!course) return;
                    section.placements.forEach(placement => {
                        const term = termsById.get(placement.termID);
                        sections.push({
                            courseCode: course.code,
                            period: placement.periodName,
                            seq: placement.periodSeq,
                            psID: placement.psID,
                            psName: placement.psName,
                            start: placement.start,
                            end: placement.end,
                            termStart: term?.start || '',
                            termEnd: term?.end || '',
                            room: placement.room,
                            calendarID: section.calendarID
                        });
                    });
                });
            }
            const previous = schedule.ic || {};
            schedule.ic = {
                importedAt: new Date(now).toISOString(),
                sections: include.schedule ? sections : list(previous.sections),
                calendars: include.calendar ? model.calendars : (previous.calendars || {})
            };
            summary.days = Object.values(schedule.ic.calendars).reduce((sum, days) => sum + Object.keys(days).length, 0);

            if (include.schedule && school !== 'other') {
                // Fill the period picker too; a class whose term covers today wins a shared period
                const all = { ...(schedule.all || {}) };
                Object.keys(all).forEach(period => { if (touchedCodes.includes(all[period])) delete all[period]; });
                const valid = new Set(['1', '2', '3', '5', '6', '7', '8']);
                const candidates = sections
                    .map(item => ({ ...item, number: String(periodNumberFrom(item.period) ?? '') }))
                    .filter(item => valid.has(item.number))
                    .sort((left, right) => Number(right.termStart <= today && today <= right.termEnd) - Number(left.termStart <= today && today <= left.termEnd));
                candidates.forEach(item => {
                    if (all[item.number]) return;
                    if (Object.values(all).includes(item.courseCode)) return;
                    all[item.number] = item.courseCode;
                });
                schedule.all = all;
                schedule.odd = {};
                schedule.even = {};
            }
            summary.periods = sections.length;
        }

        return { courses, assignments, schedule, summary };
    }

    // ------------------------------------------------------------------
    // 7. Daily schedule from imported Infinite Campus data
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

    const api = {
        FORMAT,
        ACK_FORMAT,
        collector: studbudInfiniteCampusCollector,
        buildConsoleScript,
        buildBookmarklet,
        parsePayload,
        normalizePayload,
        matchCourse,
        titleSimilarity,
        buildImportPlan,
        applyImportPlan,
        scheduleForDate,
        hasImportedSchedule,
        displayTime,
        tidyTitle,
        guessKind
    };
    root.StudBudIC = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

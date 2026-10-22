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
        if (previous) {
            previous.studbudCleanup?.();
            previous.remove();
        }
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
        const closeButton = () => button('Close', () => { box.studbudCleanup?.(); box.remove(); }, true);

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
            'notGraded', 'turnedIn', 'categoryName', 'categoryID', 'groupID', 'termIDs', 'termID', 'taskID', 'taskName', 'scoreModifiedDate'];
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
                say('Choose the student to import.');
                const choice = await new Promise(resolve => {
                    const select = document.createElement('select');
                    select.setAttribute('aria-label', 'Student to import');
                    select.style.cssText = 'width:100%;padding:8px;margin:8px 0;color:#111827;background:#fff';
                    students.forEach((item, index) => {
                        const option = document.createElement('option');
                        option.value = String(index);
                        option.textContent = `${item.firstName || ''} ${item.lastName || ''}`.trim() || `Student ${index + 1}`;
                        select.append(option);
                    });
                    box.insertBefore(select, actions);
                    button('Import student', () => { select.remove(); actions.replaceChildren(); resolve(Number(select.value)); });
                    button('Cancel', () => { box.remove(); resolve(null); }, true);
                    select.focus();
                });
                if (choice === null) return;
                student = students[choice];
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
            const classCount = sectionIDs.size;
            const workCount = assignments.length;
            const summary = `Found ${classCount} classes and ${workCount} assignments.${warnings.length ? `\n${warnings.length} item(s) could not be read; the rest is fine.` : ''}`;
            let timeout;
            let pending = false;
            const send = () => {
                clearTimeout(timeout);
                pending = false;
                if (!studbudOrigin || !window.opener || window.opener.closed) {
                    say(`${summary}\nOpen StudBud, choose Import from Infinite Campus, and use its Open Infinite Campus button. Run the bookmark in that Campus tab to reconnect, then choose Send to StudBud.`);
                    return;
                }
                pending = true;
                say(`${summary}\nSending to StudBud…`);
                try {
                    window.opener.postMessage(payload, studbudOrigin);
                } catch (error) {
                    pending = false;
                    say(`${summary}\nCould not send to StudBud. Reopen Campus using Open Infinite Campus in StudBud, then run the bookmark and try again.`);
                    return;
                }
                timeout = setTimeout(() => {
                    pending = false;
                    say(`${summary}\nStudBud has not confirmed receipt. Keep StudBud open and choose Send to StudBud to retry. If it still does not respond, reopen Campus using Open Infinite Campus in StudBud and run the bookmark again.`);
                }, 5000);
            };
            const onMessage = event => {
                if (pending && event.source === window.opener && event.origin === studbudOrigin && event.data && event.data.format === `${FORMAT_NAME}-ack`) {
                    pending = false;
                    clearTimeout(timeout);
                    say(`StudBud received ${classCount} classes and ${workCount} assignments.\nSwitch back to the StudBud tab to check your classes and finish the import.`);
                }
            };
            window.addEventListener('message', onMessage);
            box.studbudCleanup = () => {
                clearTimeout(timeout);
                window.removeEventListener('message', onMessage);
            };
            say(`${summary}\nChoose Send to StudBud, then return to StudBud to review and save.`);
            button('Send to StudBud', send);
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

    function isCitizenship(value) {
        return /\bcitizenship\b/i.test(String(value || ''));
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
            categoryKey: category?.key || '',
            termIDs: [...new Set([...list(item.termIDs).map(idText), idText(item.termID)].filter(Boolean))],
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

        const excludedTasks = new Set();
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
                if (isCitizenship(task.taskName)) {
                    if (task.taskID) excludedTasks.add(`${section.id}|${idText(task.taskID)}`);
                    return;
                }
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
        const excludedAssignmentIDs = new Set();
        const excludedGroups = new Set();
        const academicGroups = new Set();
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
                if (key === 'termIDs' && !value.length) return;
                existing[key] = typeof value === 'boolean' ? existing[key] || value : value;
            });
        };
        Object.entries(data.details && typeof data.details === 'object' ? data.details : {}).forEach(([sectionID, detail]) => {
            const section = sections.get(idText(sectionID));
            if (!section) return;
            list(detail?.details).forEach(entry => {
                const citizenship = isCitizenship(entry.task?.taskName);
                if (citizenship && entry.task?.taskID) excludedTasks.add(`${section.id}|${idText(entry.task.taskID)}`);
                if (entry.task?.termID) section.termIDs.add(idText(entry.task.termID));
                list(entry.categories).forEach(category => {
                    const name = text(category.name, 60);
                    if (!name) return;
                    const groupID = idText(category.groupID) || slug(name);
                    if (citizenship || isCitizenship(name)) {
                        excludedGroups.add(`${section.id}|${groupID}`);
                        list(category.assignments).forEach(item => {
                            const normalized = normalizeAssignment(item, section.id, category);
                            if (normalized) excludedAssignmentIDs.add(normalized.id);
                        });
                        return;
                    }
                    academicGroups.add(`${section.id}|${groupID}`);
                    const termID = idText(entry.task?.termID);
                    const key = termID ? `${termID}_${groupID}` : groupID;
                    const rawWeight = num(category.weight);
                    const weighted = category.isWeighted === undefined ? rawWeight !== null : bool(category.isWeighted);
                    const weight = weighted && rawWeight !== null ? round2(Math.max(0, Math.min(100, rawWeight))) : null;
                    const existing = section.categories.get(key);
                    if (!existing || (existing.weight === null && weight !== null)) {
                        section.categories.set(key, {
                            id: key, groupID, termID, name, weight,
                            excluded: category.isExcluded === undefined ? false : bool(category.isExcluded),
                            usePercent: bool(category.usePercent)
                        });
                    }
                    list(category.assignments).forEach(item => addAssignment(item, section.id, { groupID, name, key }));
                });
            });
        });
        list(data.assignments).forEach(item => {
            const group = `${idText(item.sectionID)}|${idText(item.groupID ?? item.categoryID)}`;
            const normalized = normalizeAssignment(item, item.sectionID);
            if (!normalized) return;
            if (isCitizenship(item.taskName) || isCitizenship(item.categoryName)
                || excludedTasks.has(`${normalized.sectionID}|${idText(item.taskID)}`)
                || (excludedAssignmentIDs.has(normalized.id) && !assignments.has(normalized.id))
                || (excludedGroups.has(group) && !academicGroups.has(group))) {
                excludedAssignmentIDs.add(normalized.id);
                return;
            }
            addAssignment(item, item.sectionID);
        });

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
            excludedAssignmentIDs: [...excludedAssignmentIDs].filter(id => !assignments.has(id)),
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
        // A missing/extra AP, IB or Honors marker changes the class's weighting, so it must stay below the
        // auto-match threshold; otherwise a regular class could import as weighted (or vice versa).
        if (has(a, 'ap') !== has(b, 'ap')) score *= 0.5;
        if (has(a, 'ib') !== has(b, 'ib')) score *= 0.5;
        if (has(a, 'honors') !== has(b, 'honors')) score *= 0.5;
        const numbersA = a.filter(token => /^\d+$/.test(token)).join(' ');
        const numbersB = b.filter(token => /^\d+$/.test(token)).join(' ');
        if (numbersA && numbersB && numbersA !== numbersB) score *= 0.55;
        else if (Boolean(numbersA) !== Boolean(numbersB)) score *= 0.85;
        const special = ['ell', 'dhh', 'alt', 'parallel', 'mentor', 'ipbl', 'semester', 'esl', 'keys'];
        if (special.some(token => has(b, token) && !has(a, token))) score *= 0.7;
        return Math.max(0, Math.min(1, score));
    }

    // Weighting for classes imported under their Campus name (no catalog course): AP/IB/Honors/dual credit markers.
    function looksWeighted(name) {
        const tokens = titleTokens(name);
        return ['ap', 'ib', 'honors', 'dual'].some(token => tokens.includes(token));
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
    const CENTRAL_CLASS_PERIODS = new Set(['1', '2', '3', '5', '6', '7', '8']);

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
        const courses = list(state.courses).filter(course => !course.school || course.school === school);
        const termsById = new Map(model.terms.map(term => [term.id, term]));
        const allStarts = model.terms.map(term => term.start).filter(Boolean).sort();
        const allEnds = model.terms.map(term => term.end).filter(Boolean).sort();
        const yearSpan = allStarts.length && allEnds.length ? { start: allStarts[0], end: allEnds[allEnds.length - 1] } : null;
        const assignmentCounts = new Map();
        model.assignments.forEach(item => assignmentCounts.set(item.sectionID, (assignmentCounts.get(item.sectionID) || 0) + 1));

        const groups = new Map();
        model.sections.forEach(section => {
            if (school === 'pchs' && !section.placements.some(item =>
                CENTRAL_CLASS_PERIODS.has(String(periodNumberFrom(item.periodName) ?? '')))) return;
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
            const available = courses.filter(course => !usedExisting.has(course.code));
            const byTitle = available.map(course => ({
                course,
                score: Math.max(titleSimilarity(first.name, course.title), titleSimilarity(first.name, course.icName))
            })).sort((left, right) => right.score - left.score);
            const titleMatch = byTitle[0]?.score >= 0.8 && (!byTitle[1] || byTitle[0].score - byTitle[1].score >= 0.12)
                ? byTitle[0].course : null;
            const existing = available.find(course => list(course.icSectionIDs).some(id => sectionIDs.includes(String(id))))
                || titleMatch
                || available.find(course => group.match.course && (course.catalogCode || course.code) === group.match.course.code);
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
                include: !dropped && (hasWork || !looksNonAcademic(first.name)),
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
        const value = String(title || '').toLowerCase();
        if (/\b(review|practice|prep(aration)?|study guide|corrections?|retake request|worksheet|notes|project|presentation|essay|homework|extra credit)\b/.test(value)) return 'assignment';
        if (/\bquiz(zes)?\b/.test(value)) return 'quiz';
        if (/\b(tests?|exams?|midterm|final exam|summative|assessment|unit check|ccsa|eoc)\b/.test(value)) return 'test';
        const category = String(categoryName || '').trim().toLowerCase();
        if (/^(quizzes|quiz)$/.test(category)) return 'quiz';
        if (/^(tests?|exams?|summative assessments?|assessments?)$/.test(category)) return 'test';
        return 'assignment';
    }

    function applyImportPlan(model, plan, state = {}, options = {}) {
        const include = {
            categories: options.categories !== false,
            graded: options.graded !== false,
            schedule: options.schedule !== false,
            calendar: options.calendar !== false
        };
        const overrides = options.overrides || {};
        const catalog = list(options.catalog);
        const today = options.today || localKey(new Date());
        const now = Number(options.now) || Date.now();
        const school = plan.school;
        const courses = list(state.courses).map(course => ({ ...course, categories: list(course.categories).map(category => ({ ...category })) }));
        const excludedIDs = new Set(list(model.excludedAssignmentIDs).map(id => `ic_${id}`));
        const assignments = list(state.assignments).filter(item => !excludedIDs.has(item.id) || item.source !== 'infinite-campus')
            .map(item => excludedIDs.has(item.icAssignmentID)
                ? { ...item, graded: false, icExcused: true } : { ...item });
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
            const existingCode = override?.startsWith('existing:') ? override.slice('existing:'.length)
                : override === undefined ? entry.existingCode : null;
            let course = existingCode ? courses.find(item => item.code === existingCode && (!item.school || item.school === school)) : null;
            if (existingCode && !course) throw new Error('That existing class is no longer available. Preview the Campus import again.');
            const catalogCode = course ? '' : override === undefined ? entry.match?.code || '' : override;
            const catalogCourse = school !== 'other' && catalogCode ? catalog.find(course => course.code === catalogCode) : null;
            if (!course && catalogCourse) {
                course = courses.find(item => (!item.school || item.school === school) && (item.catalogCode || item.code) === catalogCourse.code);
            }
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
            courses.forEach(other => {
                if (other === course || !list(other.icSectionIDs).some(id => entry.sectionIDs.includes(String(id)))) return;
                other.icSectionIDs = list(other.icSectionIDs).filter(id => !entry.sectionIDs.includes(String(id)));
                if (!other.icSectionIDs.length) {
                    ['icName', 'icCourseNumber', 'icTeacher', 'icRoom'].forEach(key => { delete other[key]; });
                }
                touchedCodes.push(other.code);
            });
            const sections = entry.sectionIDs.map(id => sectionsById.get(id)).filter(Boolean);
            const name = entry.name;
            Object.assign(course, {
                school: course.school || school,
                catalogCode: catalogCourse ? catalogCourse.code : (isNew ? '' : course.catalogCode || ''),
                title: catalogCourse ? catalogCourse.title : (isNew || !course.title ? name : course.title),
                term: entry.term,
                credits: catalogCourse ? window.studbudCatalogCreditsForTerm(catalogCourse, entry.term) : Number(course.credits) || (entry.term === 'FY' ? 1 : 0.5),
                category: catalogCourse ? SUBJECT_MAP[catalogCourse.category] || 'Electives' : course.category || guessSubject(name),
                isWeighted: catalogCourse ? Boolean(catalogCourse.isWeighted) : (isNew ? looksWeighted(name) : Boolean(course.isWeighted)),
                icSectionIDs: [...new Set([...list(course.icSectionIDs).map(String), ...entry.sectionIDs])],
                icCourseNumber: entry.courseNumbers.join(', '),
                icName: name,
                icTeacher: entry.teacher,
                icRoom: entry.room
            });
            touchedCodes.push(course.code);
            entry.sectionIDs.forEach(id => sectionToCourse.set(id, course));

            const categoryNameKey = category => `${category.icTermID || ''}|${String(category.name).trim().toLowerCase()}`;
            const byName = new Map(course.categories.map(category => [categoryNameKey(category), category]));
            sections.forEach(section => section.categories.forEach(category => {
                const lookupKey = `${section.id}|${category.id}`;
                const nameKey = `${category.termID || ''}|${category.name.trim().toLowerCase()}`;
                let target = byName.get(nameKey);
                // Reuse legacy imported categories when upgrading to term-specific category identities.
                if (!target) target = course.categories.find(item => !item.icTermID
                    && item.name.trim().toLowerCase() === category.name.trim().toLowerCase());
                if (!target && include.categories) {
                    let id = `category_ic_${slug(category.id)}`;
                    while (course.categories.some(item => item.id === id)) id = `${id}_${course.categories.length}`;
                    target = { id, name: category.name, weight: category.excluded ? 0 : category.weight, excluded: category.excluded,
                        icTermID: category.termID || '' };
                    course.categories.push(target);
                    byName.set(nameKey, target);
                    summary.categories++;
                } else if (target && include.categories && !target.icUpdated) {
                    target.weight = category.excluded ? 0 : category.weight;
                    target.excluded = category.excluded;
                    target.icTermID = category.termID || '';
                    target.icUpdated = true;
                    byName.set(nameKey, target);
                }
                if (target) categoryLookup.set(lookupKey, { category: target, source: category });
            }));
            course.categories.forEach(category => { delete category.icUpdated; });
        });

        model.assignments.forEach(item => {
            const course = sectionToCourse.get(item.sectionID);
            if (!course) return;
            const section = sectionsById.get(item.sectionID);
            const sourceCategories = (section?.categories || []).filter(category =>
                category.groupID === item.categoryID || category.name.toLowerCase() === item.categoryName.toLowerCase());
            const sourceCategory = sourceCategories.find(category => category.id === item.categoryKey)
                || sourceCategories.find(category => item.termIDs?.includes(category.termID))
                || (sourceCategories.length === 1 ? sourceCategories[0] : null);
            const resolved = sourceCategory ? categoryLookup.get(`${item.sectionID}|${sourceCategory.id}`) : null;
            const category = resolved?.category
                || (!sourceCategory && course.categories.find(entry => item.categoryName && entry.name.toLowerCase() === item.categoryName.toLowerCase()))
                || null;
            const excluded = Boolean(sourceCategory?.excluded);
            const ignored = item.dropped || item.exempt || item.notGraded || excluded;
            const scored = item.scorePoints !== null;
            const graded = scored && !ignored;
            if (!include.graded) return;
            const campusId = `ic_${item.id}`;
            let current = assignments.find(entry => entry.id === campusId || entry.icAssignmentID === campusId);
            if (ignored) {
                if (current?.source === 'infinite-campus' && current.graded) {
                    if (current.id === campusId) assignments.splice(assignments.indexOf(current), 1);
                    else Object.assign(current, { graded: false, icExcused: true });
                    summary.gradedUpdated++;
                } else if (current?.icAssignmentID && current.graded) {
                    Object.assign(current, { graded: false, icExcused: true });
                    summary.gradedUpdated++;
                }
                return;
            }
            if (!graded && !item.missing) return;
            if (!current && graded) {
                const titleKey = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
                const candidates = assignments.filter(entry => entry.courseCode === course.code
                    && !entry.graded && !(entry.graded === undefined && (entry.status === 'completed' || Number(entry.pointsEarned) > 0))
                    && !entry.icAssignmentID && !String(entry.id).startsWith('ic_')
                    && titleKey(entry.title) === titleKey(item.title));
                if (candidates.length === 1) current = candidates[0];
                else if (item.dueDate) {
                    const dated = candidates.filter(entry => String(entry.dueDate || '').slice(0, 10) === item.dueDate);
                    if (dated.length === 1) current = dated[0];
                }
            }
            const id = current?.id || campusId;
            if (sourceCategories.length > 1 && !sourceCategory) {
                throw new Error(`Could not determine the grading term for "${item.title}". Recollect the Campus grade details before importing.`);
            }
            if (include.categories && sourceCategory && !category) {
                throw new Error(`Could not match the grade category for "${item.title}". Preview the import again.`);
            }
            let earned = scored ? item.scorePoints : 0;
            let possible = item.totalPoints ?? 0;
            if (sourceCategory?.usePercent && possible > 0) {
                earned = earned / possible * 100 * item.multiplier;
                possible = 100 * item.multiplier;
            } else if (item.multiplier !== 1) {
                earned *= item.multiplier;
                possible *= item.multiplier;
            }
            const importedKind = guessKind(item.title, item.categoryName || category?.name || '');
            const gradeOnly = current && !current.graded && graded;
            const preserveDetails = Boolean(gradeOnly || current?.icPreserveDetails);
            const legacyValue = `${current?.title || item.title} ${item.categoryName || category?.name || ''}`.toLowerCase();
            const legacyKind = /\b(test|exam|midterm|final|summative|assessment|unit check|ccsa|eoc)\b/.test(legacyValue)
                ? 'test' : /\bquiz(zes)?\b/.test(legacyValue) ? 'quiz' : 'assignment';
            const userEditedKind = current?.kind && current.kind !== (current.icKind || legacyKind);
            const kind = (preserveDetails || userEditedKind) && current.kind ? current.kind : importedKind;
            const status = item.missing ? 'pending' : 'completed';
            const assignment = {
                ...(current || {}),
                id,
                title: current?.title || item.title,
                courseCode: course.code,
                dueDate: current?.dueDate || item.dueDate || '',
                pointsEarned: round2(Math.max(0, earned)),
                maxPoints: round2(Math.max(0, possible)),
                categoryId: preserveDetails && current.categoryId ? current.categoryId : category ? category.id : null,
                kind,
                icKind: importedKind,
                icAssignmentID: campusId,
                icPreserveDetails: preserveDetails,
                estimatedMinutes: current?.estimatedMinutes ?? (kind === 'test' ? 90 : kind === 'quiz' ? 45
                    : /\b(project|presentation|paper|essay)\b/i.test(item.title) ? 90
                    : /\blab\b/i.test(item.title) ? 60
                    : /\b(worksheet|notes|warm[- ]?up|exit ticket)\b/i.test(item.title) ? 20 : 30),
                importance: current?.importance || (kind === 'test' ? 4 : 3),
                priority: current?.priority || 'high',
                graded,
                status,
                gradedAt: graded ? (item.gradedAt || current?.gradedAt || item.dueDate || today) : null,
                source: current?.source || 'infinite-campus',
                icMissing: item.missing,
                icLate: item.late,
                icExcused: ignored && !graded
            };
            if (current) Object.assign(current, assignment);
            else assignments.push(assignment);
            const bucket = graded ? 'graded' : 'upcoming';
            summary[`${bucket}${current ? 'Updated' : 'Added'}`]++;
        });

        if (include.categories) {
            touchedCodes.forEach(code => {
                const course = courses.find(course => course.code === code);
                const entrySections = model.sections.filter(section => sectionToCourse.get(section.id)?.code === code);
                if (!entrySections.some(section => section.categories.length)
                    && !list(model.excludedAssignmentIDs).length) return;
                const active = new Set([...categoryLookup.values()].map(value => value.category.id));
                course.categories = course.categories.filter(category => !category.id.startsWith('category_ic_')
                    || active.has(category.id) || assignments.some(item => item.courseCode === code && item.categoryId === category.id));
            });
        }

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
                school,
                terms: model.terms.map(term => ({ ...term })),
                sections: include.schedule ? sections : list(previous.sections),
                calendars: include.calendar ? model.calendars : (previous.calendars || {})
            };
            summary.days = Object.values(schedule.ic.calendars).reduce((sum, days) => sum + Object.keys(days).length, 0);

            if (include.schedule && school !== 'other') {
                // Fill the period picker too; a class whose term covers today wins a shared period
                const all = { ...(schedule.all || {}) };
                Object.keys(all).forEach(period => { if (touchedCodes.includes(all[period])) delete all[period]; });
                const candidates = sections
                    .map(item => ({ ...item, number: String(periodNumberFrom(item.period) ?? '') }))
                    .filter(item => CENTRAL_CLASS_PERIODS.has(item.number))
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
        looksWeighted,
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

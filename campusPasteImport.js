(function (root) {
    'use strict';

    const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

    // Browsers copy non-breaking spaces, zero-width characters and smart punctuation from grade portals.
    const cleanText = value => String(value || '').replace(/^\uFEFF/, '')
        .replace(/[\u200B-\u200D\u2060]/g, '').replace(/[\u00A0\u2007\u202F]/g, ' ')
        .replace(/[\u2010-\u2015\u2212]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
        .replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ');
    const EMPTY = /^(?:-|--|—|n\/?a|none|not graded|ungraded)$/i;
    const EXCUSED = /^(?:ex|exc|excused|exempt|e)$/i;

    function parseCsv(text) {
        const rows = [];
        let row = [], cell = '', quoted = false;
        const source = String(text || '');
        for (let index = 0; index < source.length; index++) {
            const character = source[index];
            if (character === '"') {
                if (quoted && source[index + 1] === '"') { cell += '"'; index++; }
                else quoted = !quoted;
            } else if (character === ',' && !quoted) {
                row.push(cell.trim()); cell = '';
            } else if ((character === '\n' || character === '\r') && !quoted) {
                if (character === '\r' && source[index + 1] === '\n') index++;
                row.push(cell.trim()); cell = '';
                if (row.some(Boolean)) rows.push(row);
                row = [];
            } else cell += character;
        }
        row.push(cell.trim());
        if (row.some(Boolean)) rows.push(row);
        return rows;
    }

    function tableTextFromHtml(html, Parser = root.DOMParser) {
        if (!html || !/<table[\s>]/i.test(html) || !Parser) return '';
        const copied = new Parser().parseFromString(html, 'text/html');
        const rows = [...copied.querySelectorAll('tr')].map(row =>
            [...row.querySelectorAll('th, td')].map(cell => cell.textContent.replace(/\s+/g, ' ').trim()))
            .filter(row => row.some(Boolean));
        return rows.map(row => row.join('\t')).join('\n');
    }

    const CSV_HEADERS = ['assignment', 'assignment name', 'assignment title', 'title', 'course', 'course name', 'class',
        'class name', 'due date', 'score', 'points possible'];

    function rowsFromText(text) {
        const source = cleanText(text);
        const headerLine = source.split(/\r?\n/).find(line => line.includes(',')
            && line.split(',').some(cell => CSV_HEADERS.includes(normalize(cell.replace(/^"|"$/g, ''))))) || '';
        if (!source.includes('\t') && headerLine) {
            return parseCsv(source);
        }
        return source.split(/\r?\n/)
            .map(line => line.split('\t').map(cell => cell.trim().replace(/^"(.*)"$/, '$1')))
            .filter(row => row.some(Boolean));
    }

    function findHeaderIndex(headers, aliases) {
        return headers.findIndex(header => aliases.includes(normalize(header)));
    }

    function courseAliases(course) {
        return [course.title, course.code, `${course.title} (${course.code})`, `${course.code} ${course.title}`]
            .map(normalize).filter(Boolean);
    }

    function inferCourse(text, courses = []) {
        const raw = cleanText(text);
        const heading = raw.split(/Assignment/)[0].replace(/Classroom|Curriculum|Grades|Schedule/g, '\n');
        const names = rowsFromText(heading).flat().map(value => normalize(value.replace(/^(?:course|class)(?: name)?\s*:\s*/i, ''))).filter(Boolean);
        const exact = courses.filter(course => courseAliases(course).some(alias => names.includes(alias)));
        if (exact.length) return exact.length === 1 ? exact[0] : null;
        // A heading such as "Period 2 Honors Geometry (Smith)" still names the class; the longest unique title wins.
        const contained = courses.map(course => ({ course, length: Math.max(0, ...courseAliases(course)
            .filter(alias => alias.length >= 4 && names.some(name => ` ${name} `.includes(` ${alias} `))).map(alias => alias.length)) }))
            .filter(entry => entry.length > 0).sort((a, b) => b.length - a.length);
        if (!contained.length || (contained[1] && contained[1].length === contained[0].length)) return null;
        return contained[0].course;
    }

    function categorySection(value) {
        const match = String(value || '').match(/(?:In-progress|[\r\n\t)])\s*([\p{L}][\p{L} &/-]{0,60})\s*Weight\s*:/iu)
            || String(value || '').match(/^([\p{L}][\p{L} &/-]{0,60})\s*Weight\s*:/iu);
        return match ? match[1].trim() : '';
    }

    // Strips periods, times, rooms, teachers and grades that portals print next to a class name.
    function cleanCourseName(value) {
        let name = String(value || '').replace(/\s+/g, ' ').trim();
        let previous;
        do {
            previous = name;
            name = name
                .replace(/^(?:period|per\.?|p|hour|hr|block|blk)\s*\d+[a-z]?\s*[:.)\-]?\s*/i, '')
                .replace(/^\d{1,2}\s*[:.)\-]\s*/, '')
                .replace(/^\d{1,2}\s*\(\s*\d{1,2}:\d{2}[^)]*\)\s*/, '')
                .replace(/^\(?\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?\s*-\s*\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?\)?\s*/i, '')
                .replace(/\s+(?:[A-F][+-]?\s*)?\(?\d{1,3}(?:\.\d+)?\s*%\)?$/i, '')
                .replace(/\s+(?:room|rm\.?)\s*:?\s*[\w-]+$/i, '')
                .replace(/\s*[-|]\s*(?:mr|mrs|ms|mx|dr)\.?\s+[\p{L}' .-]+$/iu, '')
                .replace(/\s+(?:in progress|posted|final)$/i, '')
                .trim();
        } while (name !== previous && name);
        return name;
    }

    function isCourseNoise(value) {
        const text = String(value || '').trim();
        return !/\p{L}/u.test(text)
            || /^(?:grades?|schedule|courses?|classes|teacher|room|period|term|semester|quarter|trimester|in progress|posted|final|progress report|print|details|student details|page footer|total|gpa|attendance|today|show all|view all|course name|section)\s*[:#]?\s*[\d.-]*$/i.test(text)
            || /^(?:[QTS]\d|Term \d|Semester \d|Quarter \d|Trimester \d)(?:\s*[-(].*)?$/i.test(text)
            || /^(?:teacher|room|rm|instructor|email)\s*:/i.test(text)
            || /^(?:mr|mrs|ms|mx|dr)\.?\s+[\p{L}' .-]+$/iu.test(text)
            || /^[\p{Lu}][\p{L}'-]+,\s*[\p{Lu}][\p{L}'-]+(?:\s+[\p{Lu}]\.?)?$/u.test(text)
            || /^[A-F][+-]?$/.test(text)
            || /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i.test(text) && /\d/.test(text)
            || /@/.test(text);
    }

    function parseCourses(text, catalog = []) {
        const rows = rowsFromText(text);
        if (!rows.length) return [];
        const headers = ['course', 'class', 'course name', 'class name', 'name'];
        const headerRow = rows.findIndex(row => findHeaderIndex(row.map(normalize), headers) >= 0);
        const hasHeader = headerRow >= 0;
        const courseIndex = hasHeader ? findHeaderIndex(rows[headerRow].map(normalize), headers) : 0;
        const data = hasHeader ? rows.slice(headerRow + 1).filter(row => rows[headerRow].length === 1 || row.length > 1) : rows;
        const seen = new Set();
        const findExact = key => catalog.filter(course => courseAliases(course).includes(key));
        return data.map(row => {
            const raw = String(row[hasHeader ? courseIndex : 0] || '').trim();
            const rawKey = normalize(raw);
            const name = findExact(rawKey).length === 1 ? raw : cleanCourseName(raw);
            const key = normalize(name);
            if (!key || seen.has(key) || (!findExact(key).length && isCourseNoise(name))) return null;
            seen.add(key);
            const exact = findExact(key);
            const partial = exact.length ? exact : catalog.filter(course =>
                courseAliases(course).some(alias => alias.length >= 8 && (key.startsWith(`${alias} `) || key.endsWith(` ${alias}`))));
            const match = partial.length === 1 ? partial[0] : null;
            return { name, match };
        }).filter(Boolean);
    }

    function parseDate(value, today = new Date()) {
        const raw = cleanText(value).trim()
            .replace(/^(?:due(?: date)?|date due|due on)\s*:?\s*/i, '')
            .replace(/^(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+(?=\S)/i, '')
            .replace(/(?:\s*(?:at|@|,)?\s*\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?(?:\s*[A-Z]{2,4})?)$/i, match => /:|[ap]\.?m\.?\b/i.test(match) ? '' : match)
            .replace(/(\d)(?:st|nd|rd|th)\b/gi, '$1').trim();
        if (!raw || EMPTY.test(raw)) return '';
        let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (match) {
            const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
            const date = new Date(year, month - 1, day);
            if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
            return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        }
        match = raw.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?!\d)/);
        if (match) {
            let year = Number(match[3] || today.getFullYear());
            if (year < 100) year += year < 70 ? 2000 : 1900;
            const month = Number(match[1]), day = Number(match[2]);
            const date = new Date(year, month - 1, day);
            if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        if (!/[A-Za-z]{3}/.test(raw)) return '';
        const monthDay = raw.match(/^([A-Za-z]+\.?\s+\d{1,2})(?:,?\s+(\d{4}))?$/);
        const parsed = new Date(monthDay ? `${monthDay[1]}, ${monthDay[2] || today.getFullYear()}` : raw);
        if (!Number.isFinite(parsed.getTime())) return '';
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }

    function numeric(value) {
        const raw = String(value || '').trim().replace(/,/g, '').replace(/\s*(?:pts?|points?)\.?$/i, '');
        if (!raw || EMPTY.test(raw) || /^(?:missing|excused)$/i.test(raw)) return null;
        const number = Number(raw.replace(/%$/, ''));
        return Number.isFinite(number) ? number : null;
    }

    function scoreParts(value) {
        const text = cleanText(value).trim().replace(/\s+/g, ' ');
        if (EXCUSED.test(text)) return { earned: null, max: null, excused: true };
        const fraction = text.match(/^(\d+(?:\.\d+)?)\s*(?:\/|out of|of)\s*(\d+(?:\.\d+)?)(?:\s*(?:pts?|points?)\.?)?(?:\s*\(?\s*\d+(?:\.\d+)?\s*%\s*\)?)?(?:\s*[A-F][+-]?)?$/i);
        if (fraction) return { earned: Number(fraction[1]), max: Number(fraction[2]) };
        const ungraded = text.match(/^(?:-+|n\/?a)?\s*(?:\/|out of|of)\s*(\d+(?:\.\d+)?)(?:\s*(?:pts?|points?)\.?)?$/i);
        if (ungraded) return { earned: null, max: Number(ungraded[1]) };
        const percent = text.match(/^(?:[A-F][+-]?\s*)?\(?\s*(\d+(?:\.\d+)?)\s*%\s*\)?(?:\s*[A-F][+-]?)?$/i);
        if (percent) return { earned: Number(percent[1]), max: 100 };
        return { earned: numeric(text), max: null };
    }

    const cleanTitle = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 100);

    function assignmentResult(title, due, score, max, category, today) {
        const parsed = scoreParts(score);
        const maximum = parsed.max === null ? numeric(max) : parsed.max;
        if (parsed.excused) {
            return { title: cleanTitle(title), dueDate: parseDate(due, today), pointsEarned: null, maxPoints: numeric(max),
                category: String(category || '').trim(), excused: true };
        }
        return {
            title: cleanTitle(title),
            dueDate: parseDate(due, today),
            pointsEarned: parsed.earned !== null && maximum !== null ? parsed.earned : null,
            maxPoints: maximum,
            category: String(category || '').trim(),
            ...(parsed.earned !== null && maximum === null ? { incompleteScore: true } : {})
        };
    }

    function parseCampusPage(text, today) {
        const raw = cleanText(text);
        const markers = [...raw.matchAll(/Assignment/g)].map(match => match.index);
        if (!markers.length || !/Assignment[^\t\r\n]+(?:Due\s*:|Multiplier\s*:)/i.test(raw)) return null;

        const result = [];
        let category = categorySection(raw.slice(0, markers[0]));
        let start = markers[0];
        const add = end => {
            const body = raw.slice(start + 'Assignment'.length, end);
            const boundary = body.search(/Multiplier\s*:|Due\s*:|Score\s*:?\s*(?:\d|--|n\/a)/i);
            if (boundary < 0) return false;
            const title = body.slice(0, boundary).trim();
            if (!title) return false;
            const details = body.slice(boundary);
            const due = details.match(/Due\s*:\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{1,2}-\d{1,2})/i);
            const score = details.match(/Score\s*:?\s*(\d+(?:\.\d+)?\s*(?:\/|out of)\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*%|(?:-+|n\/a)?\s*\/\s*\d+(?:\.\d+)?|Excused|Exempt)/i);
            const multiplier = details.match(/Multiplier\s*:\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
            const item = assignmentResult(title, due?.[1], score?.[1], '', category, today);
            if (multiplier) item.multiplier = multiplier[1];
            if (/Missing(?=\s*(?:Score|Late|Excused|$))/i.test(details)) item.missing = true;
            if (/\b(?:Excused|Exempt)\b/i.test(details) && item.pointsEarned === null) item.excused = true;
            result.push(item);
            category = categorySection(details) || category;
            return true;
        };
        for (const marker of markers.slice(1)) {
            if (add(marker)) start = marker;
        }
        add(raw.length);
        return result;
    }

    function parseAssignmentBlocks(rows, today) {
        const lines = rows.flat().map(cell => cell.trim()).filter(Boolean);
        const field = line => {
            const joinedScore = line.match(/^score\s*((?:\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?(?:\s*\(\s*\d+(?:\.\d+)?\s*%\s*\))?|\d+(?:\.\d+)?\s*%))$/i);
            if (joinedScore) return { name: 'score', value: joinedScore[1] };
            if (/^missing$/i.test(line)) return { name: 'missing', value: '' };
            if (/^(?:excused|exempt)$/i.test(line)) return { name: 'excused', value: '' };
            if (/^(?:late|turned in|incomplete|dropped|cheated)$/i.test(line)) return { name: 'flag', value: line };
            const inline = line.match(/^(due(?: date)?|date due|multiplier|category|type|score|points earned|earned|points possible|possible points|out of|status)\s+(.+)$/i);
            if (inline) {
                const name = normalize(inline[1]), value = inline[2].trim();
                if (['due', 'due date', 'date due'].includes(name) && parseDate(value, today)) return { name, value };
                if (['score', 'points earned', 'earned', 'points possible', 'possible points', 'out of'].includes(name)
                    && (scoreParts(value).earned !== null || /^(?:-|--|n\/?a|missing|excused)$/i.test(value))) return { name, value };
                if (name === 'multiplier' && Number.isFinite(Number(value))) return { name, value };
                if (['category', 'type', 'status'].includes(name)) return { name, value };
            }
            const match = line.match(/^(due(?: date)?|date due|multiplier|category|type|score|points earned|earned|points possible|possible points|out of|comments?|status|assigned(?: date)?)(?:\s*:\s*|\s*$)(.*)$/i);
            if (match) return { name: normalize(match[1]), value: match[2].trim() };
            if (/^comments?/i.test(line)) return { name: 'comment', value: '' };
            return null;
        };
        const isHeading = line => /^(?:assignment(?: name)?|score|total|category total|term total|semester total)$/i.test(line);
        const isTitle = (line, next) => !field(line) && !isHeading(line)
            && Boolean(field(next || '')) && scoreParts(line).earned === null
            && !/^(?:-|--|n\/?a|\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\s*%?)$/i.test(line);
        if (!lines.some((line, index) => isTitle(line, lines[index + 1]))) return null;

        const result = [];
        let current = null;
        let sectionCategory = '';
        const flush = () => {
            if (current) {
                const item = assignmentResult(current.title, current.due, current.score, current.max, current.category, today);
                if (current.multiplier !== undefined) item.multiplier = current.multiplier;
                if (current.missing) item.missing = true;
                if (current.excused && item.pointsEarned === null) item.excused = true;
                result.push(item);
            }
        };
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            const section = categorySection(line) || (/^Weight\s*:/i.test(lines[index + 1] || '') ? line : '');
            if (section) {
                flush();
                current = null;
                sectionCategory = section;
                continue;
            }
            const detail = field(line);
            if (detail) {
                if (!current) continue;
                let value = detail.value;
                const next = lines[index + 1] || '';
                if (!value && next && !field(next) && !isHeading(next)) {
                    const empty = /^(?:-|--|n\/?a|none|missing|excused)$/i.test(next);
                    const date = ['due', 'due date', 'date due'].includes(detail.name) && (empty || Boolean(parseDate(next, today)));
                    const score = ['score', 'points earned', 'earned', 'points possible', 'possible points', 'out of', 'multiplier'].includes(detail.name)
                        && (empty || scoreParts(next).earned !== null);
                    const status = detail.name === 'status' && /^(?:missing|excused|exempt|late|turned in)$/i.test(next);
                    const following = field(lines[index + 2] || '');
                    const category = ['category', 'type'].includes(detail.name)
                        && !['due', 'due date', 'date due', 'multiplier'].includes(following?.name);
                    if (date || score || status || category) value = lines[++index];
                }
                if (['due', 'due date', 'date due'].includes(detail.name)) current.due = value;
                else if (['score', 'points earned', 'earned'].includes(detail.name)) current.score = value;
                else if (['points possible', 'possible points', 'out of'].includes(detail.name)) current.max = value;
                else if (['category', 'type'].includes(detail.name)) current.category = value;
                else if (detail.name === 'multiplier') current.multiplier = value;
                else if (detail.name === 'missing' || (detail.name === 'status' && /^missing$/i.test(value))) current.missing = true;
                else if (detail.name === 'excused' || (detail.name === 'status' && /^(?:excused|exempt)$/i.test(value))) current.excused = true;
            } else if (isTitle(line, lines[index + 1])) {
                flush();
                current = { title: line, category: sectionCategory };
            }
        }
        flush();
        return result;
    }

    function parseAssignments(text, today = new Date()) {
        const rows = rowsFromText(text);
        if (!rows.length) return [];
        const campusPage = parseCampusPage(text, today);
        if (campusPage) return campusPage;
        const titleAliases = ['assignment', 'assignment name', 'assignment title', 'title', 'name', 'item', 'task', 'activity'];
        const dueAliases = ['due', 'due date', 'date due', 'due on', 'date'];
        const scoreAliases = ['score', 'points', 'points earned', 'earned', 'pts', 'mark', 'grade', 'result'];
        const maxAliases = ['out of', 'possible', 'points possible', 'possible points', 'max points', 'max score', 'max',
            'total points', 'total possible', 'pts possible', 'worth'];
        const categoryAliases = ['category', 'type', 'assignment type', 'grading category', 'group'];
        const statusAliases = ['status', 'missing', 'flags', 'flag'];
        const columnAliases = [...titleAliases, ...dueAliases, ...scoreAliases, ...maxAliases, ...categoryAliases,
            ...statusAliases, 'multiplier', 'percent', 'comments', 'comment', 'teacher', 'assigned'];
        const headerRow = rows.findIndex(row => {
            const headers = row.map(normalize);
            return findHeaderIndex(headers, titleAliases) >= 0
                && new Set(headers.filter(header => columnAliases.includes(header))).size >= 2;
        });
        const hasHeader = headerRow >= 0;
        if (!hasHeader || rows[headerRow].length === 1) {
            const blocks = parseAssignmentBlocks(rows, today);
            if (blocks) return blocks;
        }
        const headers = hasHeader ? rows[headerRow].map(normalize) : [];
        const titleIndex = findHeaderIndex(headers, titleAliases);
        const indexes = hasHeader ? {
            title: titleIndex,
            due: findHeaderIndex(headers, dueAliases),
            score: findHeaderIndex(headers, scoreAliases) >= 0 ? findHeaderIndex(headers, scoreAliases) : findHeaderIndex(headers, ['percent']),
            max: findHeaderIndex(headers, maxAliases),
            category: findHeaderIndex(headers, categoryAliases),
            multiplier: findHeaderIndex(headers, ['multiplier']),
            status: findHeaderIndex(headers, statusAliases)
        } : { title: 0, due: 1, score: 2, max: 3, category: 4 };
        const data = hasHeader ? rows.slice(headerRow + 1) : rows;
        let sectionCategory = '';
        return data.map((row, index) => {
            const section = categorySection(row.join('\n'))
                || (/^Weight\s*:/i.test(data[index + 1]?.[0] || '') ? row[0] : '');
            if (section) { sectionCategory = section; return null; }
            if (hasHeader && row.length === 1) return null;
            const title = String(row[indexes.title] || '').trim();
            if (!title || /^(?:total|category total|term total|semester total)$/i.test(title)) return null;
            const item = assignmentResult(title, indexes.due >= 0 ? row[indexes.due] : '',
                indexes.score >= 0 ? row[indexes.score] : '', indexes.max >= 0 ? row[indexes.max] : '',
                (indexes.category >= 0 ? row[indexes.category] : '') || sectionCategory, today);
            if (indexes.multiplier >= 0 && row[indexes.multiplier] !== undefined) item.multiplier = String(row[indexes.multiplier]).trim();
            const status = indexes.status >= 0 ? String(row[indexes.status] || '') : '';
            if (/\bmissing\b|^(?:yes|true|x|m)$/i.test(status) && !/^(?:no|false)$/i.test(status)) item.missing = true;
            if (/\b(?:excused|exempt)\b/i.test(status) && item.pointsEarned === null) item.excused = true;
            return item;
        }).filter(Boolean);
    }

    root.StudBudCampusPaste = { parseCourses, parseAssignments, parseDate, tableTextFromHtml, inferCourse };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.StudBudCampusPaste;
})(typeof window !== 'undefined' ? window : globalThis);

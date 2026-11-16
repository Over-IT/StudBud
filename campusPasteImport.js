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
        if (copied.body) {
            const chunks = [];
            const visit = node => {
                if (node.nodeType === 3) { chunks.push(node.textContent.replace(/\s+/g, ' ')); return; }
                if (/^(SCRIPT|STYLE|NOSCRIPT|NAV|FOOTER|HEADER)$/.test(node.tagName)) return;
                if (node.tagName === 'TABLE') {
                    chunks.push('\n', [...node.rows].map(row => [...row.cells]
                        .map(cell => cell.textContent.replace(/\s+/g, ' ').trim()).join('\t')).join('\n'), '\n');
                    return;
                }
                const block = /^(DIV|P|SECTION|ARTICLE|H[1-6]|LI|BR)$/.test(node.tagName);
                if (block) chunks.push('\n');
                for (const child of node.childNodes) visit(child);
                if (block) chunks.push('\n');
            };
            visit(copied.body);
            return chunks.join('').split(/\r?\n/).map(line => line.replace(/^ +| +$/g, '')).filter(line => line.trim()).join('\n');
        }
        const rows = [...copied.querySelectorAll('tr')].map(row =>
            [...row.querySelectorAll('th, td')].map(cell => cell.textContent.replace(/\s+/g, ' ').trim()))
            .filter(row => row.some(Boolean));
        return rows.map(row => row.join('\t')).join('\n');
    }

    const CSV_HEADERS = ['assignment', 'assignment name', 'assignment title', 'title', 'course', 'course name', 'class',
        'class name', 'name', 'task', 'item', 'activity', 'due', 'due date', 'date due', 'score', 'mark', 'grade', 'points possible'];

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
        const heading = raw.split(/Assignment/i)[0].replace(/Classroom|Curriculum|Grades|Schedule/gi, '\n');
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
        const source = String(value || '').replace(/(^|[\r\n\t])Category\s*:\s*/gi, '$1');
        const match = source.match(/(?:In-progress|[\r\n\t)])\s*([\p{L}][\p{L} &/-]{0,60})\s*Weight\s*:/iu)
            || source.match(/^([\p{L}][\p{L} &/-]{0,60})\s*Weight\s*:/iu);
        return match ? match[1].trim() : '';
    }

    function parseCategoryWeights(text) {
        const found = new Map();
        const add = (name, raw) => {
            const weight = Number(String(raw).replace(/%$/, '').trim()), key = normalize(name);
            if (!key || !Number.isFinite(weight) || weight < 0 || weight > 100) return;
            const previous = found.get(key);
            found.set(key, previous === null || previous && previous.weight !== weight ? null : { name: name.trim(), weight });
        };
        const source = cleanText(text);
        for (const match of source.matchAll(/(?:^|[\r\n\t)]|In-progress)\s*(?:Category\s*:\s*)?([\p{L}][\p{L} &/-]{0,60}?)\s*Weight\s*:?\s*(\d+(?:\.\d+)?)\s*(?:%|(?=$|[\r\n\t ]))/giu)) {
            add(match[1], match[2]);
        }
        const rows = rowsFromText(source);
        const header = rows.findIndex(row => findHeaderIndex(row, ['category', 'grading category', 'group']) >= 0
            && findHeaderIndex(row, ['weight', 'weight percent', 'weight percentage']) >= 0);
        if (header >= 0) {
            const nameIndex = findHeaderIndex(rows[header], ['category', 'grading category', 'group']);
            const weightIndex = findHeaderIndex(rows[header], ['weight', 'weight percent', 'weight percentage']);
            for (const row of rows.slice(header + 1)) {
                if (/^\d+(?:\.\d+)?\s*%?$/.test(row[weightIndex] || '')) add(row[nameIndex] || '', row[weightIndex]);
            }
        }
        return [...found.values()].filter(Boolean);
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
            || /^(?:student(?: name| id| number)?|name|username|contact|parent|guardian|address|phone|birth date|date of birth|footer|copyright|help|logout|log out|sign out)\b/i.test(text)
            || /^(?:mr|mrs|ms|mx|dr)\.?\s+[\p{L}' .-]+$/iu.test(text)
            || /^[\p{Lu}][\p{L}'-]+,\s*[\p{Lu}][\p{L}'-]+(?:\s+[\p{Lu}]\.?)?$/u.test(text)
            || /^[A-F][+-]?$/.test(text)
            || /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i.test(text) && /\d/.test(text)
            || /@/.test(text);
    }

    function parseCourses(text, catalog = []) {
        const rows = rowsFromText(text);
        if (!rows.length) return [];
        const headers = ['course', 'class', 'course name', 'class name'];
        let headerRow = rows.findIndex(row => findHeaderIndex(row, headers) >= 0);
        if (headerRow < 0) headerRow = rows.findIndex(row => findHeaderIndex(row, ['name']) >= 0
            && findHeaderIndex(row, ['teacher', 'period', 'room', 'section']) >= 0);
        const hasHeader = headerRow >= 0;
        let courseIndex = hasHeader ? findHeaderIndex(rows[headerRow], [...headers, 'name']) : 0;
        const data = hasHeader ? rows.slice(headerRow + 1).filter(row => rows[headerRow].length === 1 || row.length > 1) : rows;
        const seen = new Set();
        const findExact = key => catalog.filter(course => courseAliases(course).includes(key));
        return data.map(row => {
            const nextHeader = findHeaderIndex(row, headers);
            if (hasHeader && nextHeader >= 0) { courseIndex = nextHeader; return null; }
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
        const dayMonth = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\.?[,]?(?:\s+(\d{4}))?$/);
        if (!monthDay && !dayMonth) return '';
        const day = Number(monthDay ? monthDay[1].match(/\d+$/)[0] : dayMonth[1]);
        const parsed = new Date(monthDay ? `${monthDay[1]}, ${monthDay[2] || today.getFullYear()}`
            : `${dayMonth[2]} ${day}, ${dayMonth[3] || today.getFullYear()}`);
        if (!Number.isFinite(parsed.getTime())) return '';
        if (parsed.getDate() !== day) return '';
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
        const missing = text.match(/^(?:missing|m)\s*(?:(?:\/|out of|of)\s*(\d+(?:\.\d+)?))?$/i);
        if (missing) return { earned: null, max: missing[1] ? Number(missing[1]) : null, missing: true };
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
            ...(parsed.missing ? { missing: true } : {}),
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
            const beforeScore = due ? details.slice(due.index + due[0].length, score?.index ?? details.length) : '';
            const afterScore = score ? details.slice(score.index + score[0].length).replace(/^\s*\([\d.\s]*%\)/, '') : '';
            if (/^\s*(?:Status\s*:?\s*)?(?:(?:Missing|Late)\s*)*(?:Excused|Exempt)\s*$/i.test(beforeScore)
                || /^\s*(?:Status\s*:?\s*)?(?:(?:Missing|Late)\s*)*(?:Excused|Exempt)(?=\s*(?:Comments|Category|Weight|Missing|Late|$))/i.test(afterScore)) {
                item.excused = true;
                item.pointsEarned = null;
            }
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
                if (current.excused) { item.excused = true; item.pointsEarned = null; }
                result.push(item);
            }
        };
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            const section = categorySection(line) || (/^Weight\s*:/i.test(lines[index + 1] || '') ? line.replace(/^Category\s*:\s*/i, '') : '');
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
        const isHeader = row => {
            const headers = row.map(normalize);
            return findHeaderIndex(headers, titleAliases) >= 0
                && new Set(headers.filter(header => columnAliases.includes(header))).size >= 2;
        };
        const headerRow = rows.findIndex(isHeader);
        const hasHeader = headerRow >= 0;
        if (!hasHeader || rows[headerRow].length === 1) {
            const blocks = parseAssignmentBlocks(rows, today);
            if (blocks) return blocks;
        }
        const columnIndexes = headers => ({
            title: findHeaderIndex(headers, titleAliases),
            due: findHeaderIndex(headers, dueAliases),
            score: findHeaderIndex(headers, scoreAliases) >= 0 ? findHeaderIndex(headers, scoreAliases) : findHeaderIndex(headers, ['percent']),
            max: findHeaderIndex(headers, maxAliases),
            category: findHeaderIndex(headers, categoryAliases),
            multiplier: findHeaderIndex(headers, ['multiplier']),
            status: findHeaderIndex(headers, statusAliases)
        });
        let indexes = hasHeader ? columnIndexes(rows[headerRow]) : { title: 0, due: 1, score: 2, max: 3, category: 4 };
        const data = hasHeader ? rows.slice(headerRow + 1) : rows;
        let sectionCategory = '';
        for (let index = 0; hasHeader && index < headerRow; index++) {
            const section = categorySection(rows[index].join('\n'))
                || (/^Weight\s*:/i.test(rows[index + 1]?.[0] || '') ? rows[index][0].replace(/^Category\s*:\s*/i, '') : '');
            if (section) sectionCategory = section;
        }
        return data.map((row, index) => {
            if (isHeader(row)) { indexes = columnIndexes(row); return null; }
            const section = categorySection(row.join('\n'))
                || (/^Weight\s*:/i.test(data[index + 1]?.[0] || '') ? row[0] : '');
            if (section) { sectionCategory = section; return null; }
            if (hasHeader && row.length === 1) return null;
            const title = String(row[indexes.title] || '').trim();
            if (!title || /^(?:total|category total|term total|semester total|student(?: name| id| number)?|contact|footer|page footer|copyright|privacy|help|grades?|schedule)$/i.test(title)) return null;
            const due = indexes.due >= 0 ? row[indexes.due] || '' : '';
            const score = indexes.score >= 0 ? row[indexes.score] || '' : '';
            const max = indexes.max >= 0 ? row[indexes.max] || '' : '';
            const category = indexes.category >= 0 ? row[indexes.category] || '' : '';
            if (!parseDate(due, today) && scoreParts(score).earned === null && !scoreParts(score).excused
                && !scoreParts(score).missing && numeric(max) === null && !category
                && [due, score, max].some(value => value && !EMPTY.test(value))) return null;
            const item = assignmentResult(title, due, score, max, category || sectionCategory, today);
            if (indexes.multiplier >= 0 && row[indexes.multiplier] !== undefined) item.multiplier = String(row[indexes.multiplier]).trim();
            const status = indexes.status >= 0 ? String(row[indexes.status] || '') : '';
            if (/\bmissing\b|^(?:yes|true|x|m)$/i.test(status) && !/^(?:no|false)$/i.test(status)) item.missing = true;
            if (/\b(?:excused|exempt)\b/i.test(status)) { item.excused = true; item.pointsEarned = null; }
            return item;
        }).filter(Boolean);
    }

    const PRIVACY_WARNING = 'Privacy warning: free text may contain identifying information; review school titles before importing.';
    const SCHOOL_FIELDS = {
        course: ['course', 'course name', 'class', 'class name', 'course code'],
        title: ['assignment', 'assignment name', 'assignment title', 'title', 'task', 'item', 'activity'],
        due: ['due', 'due date', 'date due', 'due on', 'date'],
        score: ['score', 'points', 'points earned', 'earned', 'pts', 'mark', 'grade', 'result', 'percent'],
        max: ['out of', 'possible', 'points possible', 'possible points', 'max points', 'max score', 'max', 'total points', 'worth'],
        category: ['category', 'type', 'assignment type', 'grading category', 'group'],
        status: ['status', 'missing', 'flags', 'flag'],
        multiplier: ['multiplier'],
        weight: ['weight', 'weight percent', 'weight percentage'],
        overall: ['overall', 'overall grade', 'overall percentage', 'overall percent', 'course grade'],
        period: ['period', 'per', 'block', 'hour'],
        start: ['start', 'start time', 'begins'],
        end: ['end', 'end time', 'ends'],
        pattern: ['pattern', 'day', 'days', 'rotation']
    };
    const fieldKey = value => Object.keys(SCHOOL_FIELDS).find(key => SCHOOL_FIELDS[key].includes(normalize(value)));
    const PRIVATE_LABEL = /^(?:student(?:\s*(?:name|id|number|#))?|first name|last name|full name|name|teacher|instructor|counselor|room|rm|section|email|e-mail|phone|mobile|contact|parent|guardian|address|birth(?:day| date)?|date of birth|dob|username|user id|account|id|identifier|comments?|feedback|notes?)\b/i;
    const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

    function schoolRows(text) {
        const lines = cleanText(text).split(/\r?\n/), rows = [];
        for (let index = 0; index < lines.length; index++) {
            let line = lines[index];
            if (!line.trim()) continue;
            if (!line.includes('\t') && line.includes(',')) {
                while ((line.match(/"/g) || []).length % 2 && index + 1 < lines.length) line += '\n' + lines[++index];
                rows.push(...parseCsv(line));
            } else rows.push(line.split('\t').map(cell => cell.trim()));
        }
        return rows;
    }

    function headerFields(row) {
        const fields = row.map(fieldKey);
        const name = row.findIndex(cell => normalize(cell) === 'name');
        if (name >= 0 && !fields.includes('title') && !fields.includes('course')) {
            if (fields.includes('due') || fields.includes('score') || fields.includes('max')) fields[name] = 'title';
            else if (fields.includes('period') && (fields.includes('start') || fields.includes('end'))) fields[name] = 'course';
        }
        // A labeled value pair (Assignment / Unit test) is not a table.
        return fields.includes('course') && (row.length === 1 || fields.filter(Boolean).length >= 2 || row.some(cell => PRIVATE_LABEL.test(cell)))
            || fields.filter(Boolean).length >= 2 && (fields.includes('title') || fields.includes('course') || fields.includes('period')
            || fields.includes('weight') && fields.includes('category')) ? fields : null;
    }

    function scrubCell(value) {
        return cleanText(value)
            .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '')
            .replace(/(?:https?:\/\/|www\.)[^\s]+/gi, '')
            .replace(/(?:\+?1[-. ]?)?(?:\(\d{3}\)\s*|\b\d{3}[-. ])\d{3}[-. ]?\d{4}\b/g, '')
            .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '')
            .replace(/\b\d{7,}\b/g, '')
            .replace(/\b(?:student\s*(?:id|number)|id|phone|email|teacher|instructor|room|rm)\s*[:#]\s*[^;\t\r\n]*/gi, '')
            .replace(/[\r\n]+/g, ' ')
            .trim();
    }

    function scrubSchoolCell(value, key) {
        const safe = scrubCell(value);
        if (!safe) return '';
        if (key === 'course') return cleanCourseName(safe);
        if (key === 'status') return safe.split(/[;,|]/).map(part => part.trim())
            .filter(part => /^(?:missing|not missing|no|false|yes|true|x|m|excused|exempt|turned in|submitted|completed|late|pending|incomplete|ungraded)$/i.test(part)).join('; ');
        if (['multiplier', 'max', 'weight', 'overall'].includes(key)) {
            if (key === 'overall' && scoreParts(safe).max === 100) return safe;
            return numeric(safe) !== null || EMPTY.test(safe) ? safe : '[invalid number]';
        }
        if (key === 'score') {
            const score = scoreParts(safe);
            return score.earned !== null || score.max !== null || score.excused || score.missing || EMPTY.test(safe) ? safe : '';
        }
        if (key === 'start' || key === 'end') return schoolTime(safe) || '[invalid time]';
        if (key === 'pattern') return schoolPattern(safe) || '[unknown rotation]';
        if (key === 'due') {
            const date = safe.match(/^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)(?!\d)/);
            if (date) return date[0];
            return parseDate(safe) ? safe : '';
        }
        return safe;
    }

    function sanitizePaste(text) {
        const rows = schoolRows(text), output = [];
        let fields = null, skipValue = false, uncertain = false;
        const detail = /^(?:(?:assignment(?: name| title)?|due(?: date)?|date due|due on|score|points earned|points possible|possible points|out of|multiplier|category|type|status|weight|overall(?: grade| percentage| percent)?|period|start(?: time)?|end(?: time)?|pattern)(?:\s*:|\s+|$)|score(?=\d|--))/i;
        for (let index = 0; index < rows.length; index++) {
            const row = rows[index], joined = row.join('\t');
            if (joined === PRIVACY_WARNING) { uncertain = true; continue; }
            const header = headerFields(row);
            if (header) {
                fields = header;
                output.push(row.filter((cell, column) => fields[column]).map(scrubCell).join('\t'));
                skipValue = false;
                continue;
            }
            const privateMatch = row[0].match(PRIVATE_LABEL);
            const privateRow = privateMatch && (!row[0].slice(privateMatch[0].length).trim() || /^\s*[:#]/.test(row[0].slice(privateMatch[0].length)));
            if (fields?.length === 1 && fields[0] === 'course' && !privateRow && !detail.test(row[0]) && !/^(?:course|class)\s*:/i.test(row[0])) {
                if (!isCourseNoise(row[0])) { output.push(scrubCell(row[0])); uncertain = true; }
                continue;
            }
            if (fields && row.length > 1 && !privateRow && !/:\s*$/.test(row[0]) && !/^(?:course|class)\s*:/i.test(row[0])) {
                const safe = row.flatMap((cell, column) => fields[column] ? [scrubSchoolCell(cell, fields[column])] : []);
                if (safe.some(Boolean)) { output.push(safe.join('\t')); uncertain = true; }
                continue;
            }
            if (privateRow || !fields && PRIVATE_LABEL.test(row[0])) {
                // Personal header/value blocks can span lines; discard the value as well as the label.
                skipValue = row.length === 1 && !/[:#]\s*\S/.test(row[0]) && !/\s\S/.test(row[0].replace(PRIVATE_LABEL, '').trim());
                if (/^(?:comments?|feedback|notes?)/i.test(row[0])) {
                    skipValue = false;
                    while (index + 1 < rows.length && !headerFields(rows[index + 1])
                        && !detail.test(rows[index + 1][0]) && !/^(?:course|class)\s*:/i.test(rows[index + 1][0])) {
                        // Keep a following assignment title if its next line is a supported detail.
                        if (detail.test(rows[index + 2]?.[0] || '')) break;
                        index++;
                    }
                }
                continue;
            }
            if (skipValue && !detail.test(row[0]) && !headerFields(row)) { skipValue = false; continue; }
            skipValue = false;
            if (row.length === 1) fields = null;
            let safe = scrubCell(joined);
            // Concatenated Campus comments terminate at the next supported school field.
            safe = safe.replace(/(?:Comments?|Feedback|\bStudent(?: Name| ID)?\s*:|\bTeacher\s*:|\bRoom\s*:)\s*.*?(?=Assignment|Score\s*:?\s*(?:\d|--|Excused)|Due\s*:|Multiplier\s*:|$)/gi, '');
            if (!safe || isCourseNoise(safe)) continue;
            const context = /^(?:course|class)(?: name)?\s*:\s*\S/i.test(safe);
            if (context) safe = safe.replace(/^((?:course|class)(?: name)?\s*:\s*)(.+)$/i, (_, label, name) => label + cleanCourseName(name));
            const blockTitle = detail.test(rows[index + 1]?.[0] || '') || /^Assignment.+(?:Due\s*:|Multiplier\s*:)/i.test(safe);
            const section = /Weight\s*:/i.test(safe) || /^Weight\s*:/i.test(rows[index + 1]?.[0] || '');
            const scalar = /^(?:\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\s*%?|--?|n\/a|excused|exempt|missing|late|turned in|submitted|completed)$/i.test(safe)
                || Boolean(parseDate(safe));
            const followsLabel = detail.test(rows[index - 1]?.[0] || '');
            const heading = /(?:Grades|Classroom|Curriculum|In-progress)/.test(safe)
                || /^(?:Grades|Classroom|Assignment)$/i.test(rows[index + 1]?.[0] || '');
            const headerless = row.length > 1 && (Boolean(parseDate(row[1])) || scoreParts(row[2]).max !== null);
            if (context || blockTitle || section || scalar || followsLabel || heading || detail.test(safe) || headerless) {
                output.push(headerless ? row.slice(0, 5).map(scrubCell).join('\t') : safe);
                if (context || blockTitle || heading || followsLabel) uncertain = true;
            } else uncertain = true;
        }
        if (uncertain) output.unshift(PRIVACY_WARNING);
        return output.join('\n');
    }

    function parseSchoolData(text, { courses = [], catalog = [], defaultCourseCode = '', term = 'FY', today = new Date() } = {}) {
        const safe = sanitizePaste(text), rows = schoolRows(safe);
        const result = { courses: [], assignments: [], meetings: [], categoryWeights: [], warnings: [] };
        const warn = message => { if (!result.warnings.includes(message)) result.warnings.push(message); };
        if (safe.includes(PRIVACY_WARNING)) warn(PRIVACY_WARNING);
        const available = [...courses, ...catalog];
        let context = defaultCourseCode ? { courseCode: defaultCourseCode } : null, fields = null, block = [];
        let sectionCategory = '';
        const identify = name => {
            const key = normalize(name);
            const matches = [...new Map(available.filter(course => courseAliases(course).includes(key)).map(course => [course.code, course])).values()];
            if (matches.length > 1) { warn('Ambiguous class identity; choose a class explicitly.'); return null; }
            return matches.length === 1 ? { courseCode: matches[0].code, courseName: matches[0].title || name }
                : { courseName: name };
        };
        const addCourse = (rawName, overall) => {
            const name = scrubCell(cleanCourseName(rawName));
            if (!name || isCourseNoise(name)) return null;
            const identity = identify(name);
            if (!identity) return null;
            let course = result.courses.find(item => normalize(item.name) === normalize(name));
            if (!course) {
                const matches = catalog.filter(item => courseAliases(item).includes(normalize(name)));
                course = { name, ...(identity.courseCode ? { courseCode: identity.courseCode } : {}), match: matches.length === 1 ? clone(matches[0]) : null };
                result.courses.push(course);
            }
            const pct = scoreParts(overall);
            if (pct.earned !== null && (pct.max === 100 || pct.max === null && pct.earned <= 100)) course.importedOverallPct = pct.earned;
            return identity;
        };
        const attach = item => {
            if (!context) { warn('Assignment has no unique class context; choose a class explicitly.'); return; }
            if (!item.title || isCourseNoise(item.title)) return;
            result.assignments.push({ ...item, ...context });
        };
        const flush = () => {
            if (!block.length) return;
            const source = block.join('\n');
            const weights = parseCategoryWeights(source);
            for (const weight of weights) {
                if (context) result.categoryWeights.push({ ...weight, ...context });
                else warn('Category weights have no unique class context.');
            }
            if (weights.length) sectionCategory = weights[weights.length - 1].name;
            const hasAssignments = /Assignment/i.test(source) || block.some(line => line.includes('\t'))
                || /(?:^|\n)(?:Due(?: date)?|Score|Points Possible|Status)\s*:/i.test(source);
            if (hasAssignments) {
                const items = parseAssignments(source, today);
                for (let index = 0; index < items.length; index++) {
                    const item = items[index], start = source.indexOf(item.title);
                    const end = items[index + 1] ? source.indexOf(items[index + 1].title, start + item.title.length) : source.length;
                    const body = start >= 0 ? source.slice(start + item.title.length, end < 0 ? source.length : end) : '';
                    const status = body.match(/(?:^|\n)Status\s*:?\s*(Missing|Not missing|No|False|Excused|Exempt|Turned in|Submitted|Completed|Late)\b/i)
                        || body.match(/(?:^|\n)(Turned in|Submitted|Completed)(?=\n|$)/i);
                    if (status) {
                        item.importedStatus = normalize(status[1]);
                        item.missing = /^missing$/i.test(status[1]);
                    }
                    attach(item);
                }
            }
            block = [];
        };
        for (const row of rows) {
            if (row[0] === PRIVACY_WARNING) continue;
            const header = headerFields(row);
            if (header) {
                flush(); fields = header;
                if (!context && !fields.includes('course') && result.courses.length === 1) context = identify(result.courses[0].name);
                continue;
            }
            const labeled = row.join('\t').match(/^(?:course|class)(?: name)?\s*:\s*(.+)$/i);
            if (labeled) {
                flush(); fields = null; sectionCategory = '';
                context = addCourse(labeled[1]); continue;
            }
            if (fields && (row.length > 1 || fields.length === 1 && fields[0] === 'course')) {
                const cell = key => row[fields.indexOf(key)] || '';
                let identity = context;
                if (fields.includes('course')) {
                    identity = cell('course') ? addCourse(cell('course'), cell('overall') || (!fields.includes('title') ? cell('score') : '')) : context;
                }
                if (fields.includes('title')) {
                    const item = assignmentResult(cell('title'), cell('due'), cell('score'), cell('max'), cell('category') || sectionCategory, today);
                    if (cell('multiplier')) item.multiplier = cell('multiplier');
                    if (fields.includes('status') && cell('status')) {
                        item.importedStatus = normalize(cell('status'));
                        item.missing = /\bmissing\b|^(?:yes|true|x|m)$/i.test(cell('status')) && !/^(?:no|false|not missing)$/i.test(cell('status'));
                        if (/\b(?:excused|exempt)\b/i.test(cell('status'))) { item.excused = true; item.pointsEarned = null; }
                    }
                    if (identity) result.assignments.push({ ...item, ...identity });
                    else warn('Assignment has no unique class context; choose a class explicitly.');
                }
                if (fields.includes('weight') && cell('category')) {
                    const weight = numeric(cell('weight'));
                    if (identity && weight !== null && weight >= 0 && weight <= 100) result.categoryWeights.push({ name: cell('category'), weight, ...identity });
                }
                if (fields.includes('period') && identity && cell('period')) {
                    const start = schoolTime(cell('start')), end = schoolTime(cell('end'));
                    const pattern = schoolPattern(cell('pattern'));
                    if (!pattern) warn('Unknown school-day rotation; use all, odd or even explicitly. Meeting skipped rather than guessing.');
                    else if ((cell('start') && !start) || (cell('end') && !end) || start && end && start >= end) {
                        warn('Invalid schedule time or pattern; meeting skipped.');
                    } else {
                        if (!cell('pattern')) warn('School-day rotation was not provided; review the all-days meeting against your school calendar.');
                        result.meetings.push({ ...identity, period: cell('period'), start, end, pattern });
                    }
                }
                continue;
            }
            // Only headings before assignment details can establish context, never assignment titles.
            const joined = row.join('\t');
            const inferred = inferCourse(joined, courses) || inferCourse(joined, catalog);
            const isHeading = !/^Assignment/i.test(joined) && !fields && inferred && !/^(?:Due|Score|Category|Multiplier)\b/i.test(joined);
            const campusHeading = joined.match(/^(.+?)(?:Classroom|Curriculum|Grades)(?=.*Assignment)/i);
            if (isHeading || campusHeading) {
                flush();
                const name = isHeading ? inferred.title || inferred.code : campusHeading[1];
                context = addCourse(name);
                const marker = joined.search(/(?:Classroom|Curriculum|Grades)/i);
                if (marker >= 0) block.push(joined.slice(marker));
                continue;
            }
            if (row.length === 1 && fields) {
                const category = categorySection(joined);
                if (category) { sectionCategory = category; block.push(joined); continue; }
                fields = null;
            }
            block.push(joined);
        }
        flush();
        return result;
    }

    function schoolTime(value) {
        const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*([ap])\.?m\.?$/i)
            || String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return '';
        let hour = Number(match[1]), minute = Number(match[2]);
        if (minute > 59 || hour > (match[3] ? 12 : 23) || match[3] && hour < 1) return '';
        if (match[3]) hour = hour % 12 + (/p/i.test(match[3]) ? 12 : 0);
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }

    function schoolPattern(value) {
        const key = normalize(value);
        return !key || ['all', 'daily', 'every day'].includes(key) ? 'all'
            : ['odd', 'odd day', 'odd days'].includes(key) ? 'odd' : ['even', 'even day', 'even days'].includes(key) ? 'even' : '';
    }

    function assignmentWords(value) {
        return normalize(value).replace(/(\p{L})(\d)/gu, '$1 $2').replace(/(\d)(\p{L})/gu, '$1 $2');
    }

    function assignmentIdentity(value) {
        return assignmentWords(value).split(/\s+/).filter(Boolean).sort().join(' ');
    }

    function informativeAssignmentTitle(value) {
        const generic = new Set(['homework', 'quiz', 'practice', 'test', 'assignment', 'work', 'worksheet', 'exercise',
            'review', 'reading', 'lab', 'report', 'daily', 'weekly', 'classwork', 'lesson', 'activity', 'assessment',
            'task', 'study', 'guide', 'essay', 'project', 'unit', 'chapter', 'the', 'a', 'an', 'and', 'for', 'in', 'on', 'of']);
        return assignmentIdentity(value).split(' ').some(token => /\d/.test(token) || !generic.has(token));
    }

    function inferAssignmentKind(title, category = '') {
        const text = assignmentWords(title);
        if (/\b(?:reviews?|corrections?|practice|worksheets?|homework|projects?|notes|study guides?)\b/.test(text)) return 'assignment';
        if (/\bquizz?(?:es)?\b/.test(text)) return 'quiz';
        if (/\b(?:tests?|exams?|midterm|final)\b/.test(text)) return 'test';
        if (/\b(?:labs?|essays?|papers?|presentations?)\b/.test(text)) return 'assignment';
        const gradingCategory = normalize(category);
        const quiz = /\bquizz?(?:es)?\b/.test(gradingCategory);
        const test = /\b(?:tests?|exams?)\b/.test(gradingCategory);
        return quiz !== test ? quiz ? 'quiz' : 'test' : 'assignment';
    }

    function importRecordId(prefix) {
        const crypto = root.crypto;
        if (crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
        if (crypto?.getRandomValues) {
            const bytes = crypto.getRandomValues(new Uint8Array(16));
            return `${prefix}_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
        }
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    }

    function buildImportPlan(parsed, { courses = [], assignments = [], schedule = {}, school = 'other', term = 'FY',
        today = new Date(), creditsForTerm, applyWeights = false } = {}) {
        const plan = { rows: [], warnings: [...(parsed.warnings || [])] };
        const nextCourses = clone(courses), nextAssignments = clone(assignments);
        let rowSequence = 0;
        const used = new Set([...courses.map(item => item.code), ...assignments.map(item => item.id),
            ...courses.flatMap(course => (course.categories || []).map(category => category.id))]);
        const newId = prefix => {
            let id;
            do { id = importRecordId(prefix); } while (used.has(id));
            used.add(id); return id;
        };
        const warn = message => { if (!plan.warnings.includes(message)) plan.warnings.push(message); };
        const courseRows = new Map(), blockedCourses = new Set();
        const addRow = (kind, action, label, detail, value, dependsOn = []) => {
            const row = { id: `row_${++rowSequence}`, kind, action, label, detail, value: clone(value), include: true };
            if (dependsOn.length) row.dependsOn = [...new Set(dependsOn)];
            plan.rows.push(row);
            return row;
        };
        const resolve = item => {
            const key = normalize(item.courseName || item.name);
            const matches = nextCourses.filter(course => item.courseCode ? course.code === item.courseCode : courseAliases(course).includes(key));
            if (matches.length !== 1 || blockedCourses.has(item.courseCode || key)) {
                warn('Ambiguous or unknown class identity; related data skipped.'); return null;
            }
            return matches[0];
        };
        const saveCourse = course => {
            let row = courseRows.get(course.code);
            if (row) row.value = clone(course);
            else {
                row = addRow('course', courses.some(item => item.code === course.code) ? 'update' : 'add', course.title, 'Class and grading categories', course);
                courseRows.set(course.code, row);
            }
            return row;
        };
        for (const item of parsed.courses || []) {
            const name = item.name || item.title || item.courseName;
            if (!name) continue;
            const matches = nextCourses.filter(course => item.courseCode ? course.code === item.courseCode : courseAliases(course).includes(normalize(name))
                || item.match && course.code === item.match.code);
            if (matches.length > 1) { blockedCourses.add(item.courseCode || normalize(name)); warn('Ambiguous class identity; class skipped.'); continue; }
            let course = matches[0];
            if (!course) {
                const catalogCourse = item.match;
                const code = item.courseCode || catalogCourse?.code || newId('custom');
                course = { ...(catalogCourse ? clone(catalogCourse) : {}), code, title: catalogCourse?.title || name, school, term,
                    credits: catalogCourse && creditsForTerm ? creditsForTerm(catalogCourse, term) : 0.5,
                    categories: [] };
                nextCourses.push(course);
                saveCourse(course);
            }
            if (Number.isFinite(item.importedOverallPct) && course.importedOverallPct !== item.importedOverallPct) {
                course.importedOverallPct = item.importedOverallPct; saveCourse(course);
            }
        }
        const weightsByCourse = new Map();
        for (const weight of parsed.categoryWeights || []) {
            const course = resolve(weight);
            if (!course) continue;
            if (!weightsByCourse.has(course.code)) weightsByCourse.set(course.code, []);
            weightsByCourse.get(course.code).push(weight);
        }
        // Categories are part of the complete course record, so selecting dependent work cannot orphan them.
        const categoryFor = (course, name) => {
            if (!name) return null;
            const matches = (course.categories || []).filter(category => normalize(category.name) === normalize(name));
            if (matches.length > 1) { warn('Ambiguous grading category; assignment skipped.'); return undefined; }
            if (matches.length) return matches[0].id;
            const category = { id: newId('category'), name, weight: null };
            course.categories = [...(course.categories || []), category]; saveCourse(course);
            return category.id;
        };
        for (const [code, weights] of weightsByCourse) {
            const course = nextCourses.find(item => item.code === code), unique = new Map();
            let valid = true;
            for (const entry of weights) {
                const key = normalize(entry.name);
                if (!key || !Number.isFinite(entry.weight) || entry.weight < 0 || entry.weight > 100
                    || unique.has(key) && unique.get(key).weight !== entry.weight) valid = false;
                unique.set(key, entry);
            }
            const complete = valid && Math.abs([...unique.values()].reduce((sum, item) => sum + item.weight, 0) - 100) < 1e-8
                && (course.categories || []).every(category => unique.has(normalize(category.name)))
                && (parsed.assignments || []).filter(item => item.courseCode === code || normalize(item.courseName) === normalize(course.title))
                    .every(item => !item.category || unique.has(normalize(item.category)));
            if (applyWeights && complete) {
                for (const entry of unique.values()) {
                    const id = categoryFor(course, entry.name);
                    const category = course.categories.find(item => item.id === id);
                    if (category && category.weight !== entry.weight) { category.weight = entry.weight; saveCourse(course); }
                }
            } else if (applyWeights) warn('Category weights are incomplete or conflicting; existing weights preserved.');
        }
        const assignmentRows = new Map();
        for (const item of parsed.assignments || []) {
            const course = resolve(item);
            if (!course || !item.title) continue;
            const multiplier = item.multiplier === undefined || item.multiplier === '' ? 1 : Number(item.multiplier);
            if (!Number.isFinite(multiplier) || multiplier <= 0) { warn('Invalid score multiplier; assignment skipped.'); continue; }
            const key = assignmentIdentity(item.title);
            const candidates = nextAssignments.filter(existing => existing.courseCode === course.code && assignmentIdentity(existing.title) === key);
            const compatible = candidates.filter(existing => !existing.dueDate || !item.dueDate || existing.dueDate.slice(0, 10) === item.dueDate);
            // Unique informative identities can change dates even when the copied word order differs.
            const matches = compatible.length ? compatible : candidates.length === 1 && informativeAssignmentTitle(item.title) ? candidates : [];
            if (matches.length > 1 || candidates.length && !matches.length) {
                warn('Ambiguous assignment identity or conflicting due date; assignment skipped.'); continue;
            }
            const existing = matches[0];
            const next = existing ? clone(existing) : { id: newId('assignment'), courseCode: course.code, title: item.title,
                kind: inferAssignmentKind(item.title, item.category), estimatedMinutes: 30, importance: 3, priority: 'high',
                plannedDate: '', dismissed: false, dueDate: '', graded: false, status: 'pending', icMissing: false,
                pointsEarned: null, maxPoints: null };
            if (item.dueDate) next.dueDate = item.dueDate;
            if (item.category) {
                const categoryId = categoryFor(course, item.category);
                if (categoryId === undefined) continue;
                next.categoryId = categoryId;
            }
            const hasGrade = Number.isFinite(item.pointsEarned) && Number.isFinite(item.maxPoints) && item.maxPoints >= 0 && item.pointsEarned >= 0;
            if (item.excused) { next.graded = false; next.status = 'completed'; next.excused = true; next.icMissing = false; }
            else if (hasGrade) {
                const earned = Number((item.pointsEarned * multiplier).toPrecision(12)), maximum = Number((item.maxPoints * multiplier).toPrecision(12));
                if (!Number.isFinite(earned) || !Number.isFinite(maximum)) { warn('Invalid weighted points; assignment skipped.'); continue; }
                next.pointsEarned = earned; next.maxPoints = maximum; next.graded = true; next.excused = false;
                next.icMissing = Boolean(item.missing); next.status = item.missing ? 'pending' : 'completed';
            } else {
                if (!existing?.graded && Number.isFinite(item.maxPoints) && item.maxPoints >= 0) next.maxPoints = item.maxPoints * multiplier;
                if (item.missing !== undefined) { next.icMissing = Boolean(item.missing); if (item.missing) next.status = 'pending'; }
                if (/^(?:turned in|submitted|completed|not missing|no|false)$/.test(item.importedStatus || '')) {
                    next.icMissing = false; next.status = 'completed';
                }
            }
            const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            if (next.status === 'completed' && existing?.status !== 'completed') next.completedAt = date;
            else if (next.status !== 'completed' && next.completedAt) next.completedAt = null;
            if (next.graded && (!existing?.graded || existing.pointsEarned !== next.pointsEarned || existing.maxPoints !== next.maxPoints)) next.gradedAt = date;
            if (existing && same(existing, next)) continue;
            const dependencies = courseRows.has(course.code) ? [courseRows.get(course.code).id] : [];
            const previousRow = assignmentRows.get(next.id);
            if (previousRow) {
                if (!same(previousRow.value, next)) {
                    warn('Conflicting repeated assignment data; assignment skipped.');
                    const index = plan.rows.indexOf(previousRow);
                    if (index >= 0) plan.rows.splice(index, 1);
                }
                continue;
            }
            const row = addRow('assignment', existing ? 'update' : 'add', next.title, `${course.title}${item.dueDate ? ` · ${item.dueDate}` : ''}`, next, dependencies);
            assignmentRows.set(next.id, row);
            if (existing) Object.assign(existing, next); else nextAssignments.push(next);
        }
        const stagedSchedule = clone(schedule);
        for (const item of parsed.meetings || []) {
            const course = resolve(item);
            if (!course) continue;
            const pattern = schoolPattern(item.pattern);
            const old = (stagedSchedule.meetings || []).find(meeting => meeting.courseCode === course.code && schoolPattern(meeting.pattern) === pattern);
            const value = { courseCode: course.code, period: String(item.period || ''), start: schoolTime(item.start || old?.start), end: schoolTime(item.end || old?.end), pattern };
            if (!value.period || !value.pattern || item.start && !value.start || item.end && !value.end || value.start && value.end && value.start >= value.end) {
                warn('Invalid schedule meeting skipped.'); continue;
            }
            if (scheduleConflict(stagedSchedule, value)) { warn('Schedule slot conflict; meeting skipped for review.'); continue; }
            if (old && Object.keys(value).every(key => String(old[key] || '') === value[key]) && stagedSchedule[value.pattern]?.[value.period] === value.courseCode) continue;
            addRow('schedule', old || stagedSchedule[value.pattern]?.[value.period] === value.courseCode ? 'update' : 'add',
                course.title, `Period ${value.period} · ${value.pattern} ${value.start}-${value.end}`, value,
                courseRows.has(course.code) ? [courseRows.get(course.code).id] : []);
            putMeeting(stagedSchedule, value);
        }
        return plan;
    }

    function scheduleConflict(schedule, value) {
        const patterns = value.pattern === 'all' ? ['all', 'odd', 'even'] : ['all', value.pattern];
        return patterns.some(pattern => schedule[pattern]?.[value.period] && schedule[pattern][value.period] !== value.courseCode)
            || (schedule.meetings || []).some(meeting => String(meeting.period) === value.period
                && (meeting.pattern === 'all' || value.pattern === 'all' || meeting.pattern === value.pattern) && meeting.courseCode !== value.courseCode);
    }

    function putMeeting(schedule, value) {
        const previous = (schedule.meetings || []).find(meeting =>
            meeting.courseCode === value.courseCode && schoolPattern(meeting.pattern) === value.pattern);
        schedule[value.pattern] = { ...(schedule[value.pattern] || {}) };
        for (const [period, code] of Object.entries(schedule[value.pattern])) {
            if (code === value.courseCode && period !== value.period) delete schedule[value.pattern][period];
        }
        schedule[value.pattern][value.period] = value.courseCode;
        schedule.meetings = (schedule.meetings || []).filter(meeting =>
            !(meeting.courseCode === value.courseCode && schoolPattern(meeting.pattern) === value.pattern));
        schedule.meetings.push({ ...clone(previous), ...clone(value) });
    }

    function applyImportPlan(plan, selectedIds, { courses = [], assignments = [], schedule = {} } = {}) {
        const result = { courses: clone(courses), assignments: clone(assignments), schedule: clone(schedule) };
        const selected = new Set(selectedIds || []);
        const rows = plan.rows.filter(row => selected.has(row.id));
        for (const row of rows) {
            if ((row.dependsOn || []).some(id => !selected.has(id) || !plan.rows.some(candidate => candidate.id === id))) {
                throw new Error('Select the required class/category dependency before importing.');
            }
        }
        for (const kind of ['course', 'assignment', 'schedule']) for (const row of rows.filter(item => item.kind === kind)) {
            const value = clone(row.value);
            if (kind === 'schedule') {
                if (!result.courses.some(course => course.code === value.courseCode)) throw new Error('Schedule class dependency is missing.');
                if (scheduleConflict(result.schedule, value)) throw new Error('Schedule conflict; preview again.');
                putMeeting(result.schedule, value);
            } else {
                const list = kind === 'course' ? result.courses : result.assignments, key = kind === 'course' ? 'code' : 'id';
                if (kind === 'assignment' && !result.courses.some(course => course.code === value.courseCode)) throw new Error('Assignment class dependency is missing.');
                const index = list.findIndex(item => item[key] === value[key]);
                if (index >= 0) list[index] = value; else list.push(value);
            }
        }
        return result;
    }

    root.StudBudCampusPaste = { parseCourses, parseAssignments, parseDate, tableTextFromHtml, inferCourse, parseCategoryWeights,
        sanitizePaste, parseSchoolData, buildImportPlan, applyImportPlan, inferAssignmentKind };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.StudBudCampusPaste;
})(typeof window !== 'undefined' ? window : globalThis);

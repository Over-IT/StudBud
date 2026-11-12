(function (root) {
    'use strict';

    const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

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

    function rowsFromText(text) {
        const source = String(text || '').replace(/^\uFEFF/, '');
        const firstLine = source.split(/\r?\n/, 1)[0] || '';
        const firstCell = normalize(firstLine.split(',')[0].replace(/^"/, '').replace(/"$/, ''));
        if (!source.includes('\t') && firstLine.includes(',')
            && ['assignment', 'assignment name', 'title', 'course', 'course name', 'class', 'class name'].includes(firstCell)) {
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

    function parseCourses(text, catalog = []) {
        const rows = rowsFromText(text);
        if (!rows.length) return [];
        const headers = ['course', 'class', 'course name', 'class name', 'name'];
        const headerRow = rows.findIndex(row => findHeaderIndex(row.map(normalize), headers) >= 0);
        const hasHeader = headerRow >= 0;
        const courseIndex = hasHeader ? findHeaderIndex(rows[headerRow].map(normalize), headers) : 0;
        const data = hasHeader ? rows.slice(headerRow + 1).filter(row => rows[headerRow].length === 1 || row.length > 1) : rows;
        const seen = new Set();
        return data.map(row => {
            const name = String(row[hasHeader ? courseIndex : 0] || '').trim();
            const key = normalize(name);
            if (!key || seen.has(key)) return null;
            seen.add(key);
            const exact = catalog.filter(course => courseAliases(course).includes(key));
            const partial = exact.length ? exact : catalog.filter(course =>
                courseAliases(course).some(alias => alias.length >= 8 && (key.startsWith(`${alias} `) || key.endsWith(` ${alias}`))));
            const match = partial.length === 1 ? partial[0] : null;
            return { name, match };
        }).filter(Boolean);
    }

    function parseDate(value, today = new Date()) {
        const raw = String(value || '').trim();
        if (!raw || /^(?:-|--|n\/?a|none)$/i.test(raw)) return '';
        let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (match) {
            const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
            const date = new Date(year, month - 1, day);
            if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
            return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        }
        match = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
        if (match) {
            let year = Number(match[3] || today.getFullYear());
            if (year < 100) year += year < 70 ? 2000 : 1900;
            const month = Number(match[1]), day = Number(match[2]);
            const date = new Date(year, month - 1, day);
            if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        const monthDay = raw.match(/^([A-Za-z]+\s+\d{1,2})(?:,?\s+(\d{4}))?$/);
        const parsed = new Date(monthDay ? `${monthDay[1]}, ${monthDay[2] || today.getFullYear()}` : raw);
        if (!Number.isFinite(parsed.getTime())) return '';
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }

    function numeric(value) {
        const raw = String(value || '').trim().replace(/,/g, '');
        if (!raw || /^(?:-|--|n\/?a|missing|excused)$/i.test(raw)) return null;
        const number = Number(raw.replace(/%$/, ''));
        return Number.isFinite(number) ? number : null;
    }

    function scoreParts(value) {
        const text = String(value || '').trim();
        const fraction = text.match(/^(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*(\d+(?:\.\d+)?)(?:\s+points?)?(?:\s*\(\s*\d+(?:\.\d+)?\s*%\s*\))?$/i);
        if (fraction) return { earned: Number(fraction[1]), max: Number(fraction[2]) };
        const percent = text.match(/^(\d+(?:\.\d+)?)\s*%$/);
        if (percent) return { earned: Number(percent[1]), max: 100 };
        return { earned: numeric(text), max: null };
    }

    function assignmentResult(title, due, score, max, category, today) {
        const parsed = scoreParts(score);
        const maximum = parsed.max === null ? numeric(max) : parsed.max;
        return {
            title: title.slice(0, 100),
            dueDate: parseDate(due, today),
            pointsEarned: parsed.earned !== null && maximum !== null ? parsed.earned : null,
            maxPoints: maximum,
            category: String(category || '').trim(),
            ...(parsed.earned !== null && maximum === null ? { incompleteScore: true } : {})
        };
    }

    function parseCampusPage(text, today) {
        const raw = String(text || '').replace(/&amp;/gi, '&');
        const markers = [...raw.matchAll(/Assignment/g)].map(match => match.index);
        if (!markers.length || !/Assignment[^\t\r\n]+(?:Due\s*:|Multiplier\s*:)/i.test(raw)) return null;

        const categoryFrom = value => {
            const match = value.match(/(?:In-progress|[\r\n\t)])\s*([\p{L}][\p{L} &/-]{0,60})\s*Weight\s*:\s*[\d.]+[\s\S]*$/iu)
                || value.match(/^([\p{L}][\p{L} &/-]{0,60})\s*Weight\s*:\s*[\d.]+[\s\S]*$/iu);
            return match ? match[1].trim() : '';
        };
        const result = [];
        let category = categoryFrom(raw.slice(0, markers[0]));
        let start = markers[0];
        const add = end => {
            const body = raw.slice(start + 'Assignment'.length, end);
            const boundary = body.search(/Multiplier\s*:|Due\s*:|Score\s*:?\s*(?:\d|--|n\/a)/i);
            if (boundary < 0) return false;
            const title = body.slice(0, boundary).trim();
            if (!title) return false;
            const details = body.slice(boundary);
            const due = details.match(/Due\s*:\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{1,2}-\d{1,2})/i);
            const score = details.match(/Score\s*:?\s*(\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*%)/i);
            const multiplier = details.match(/Multiplier\s*:\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
            const item = assignmentResult(title, due?.[1], score?.[1], '', category, today);
            if (multiplier) item.multiplier = multiplier[1];
            if (/Missing(?=\s*(?:Score|$))/i.test(details)) item.missing = true;
            result.push(item);
            category = categoryFrom(details) || category;
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
        const flush = () => {
            if (current) {
                const item = assignmentResult(current.title, current.due, current.score, current.max, current.category, today);
                if (current.multiplier !== undefined) item.multiplier = current.multiplier;
                if (current.missing) item.missing = true;
                result.push(item);
            }
        };
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
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
                    const status = detail.name === 'status' && /^(?:missing|excused)$/i.test(next);
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
            } else if (isTitle(line, lines[index + 1])) {
                flush();
                current = { title: line };
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
        const titleAliases = ['assignment', 'assignment name', 'title', 'name'];
        const columnAliases = [...titleAliases, 'due', 'due date', 'date due', 'date', 'score', 'points', 'points earned',
            'earned', 'out of', 'possible', 'points possible', 'possible points', 'max points', 'max score',
            'total points', 'category', 'type', 'multiplier', 'status', 'missing'];
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
            due: findHeaderIndex(headers, ['due', 'due date', 'date due', 'date']),
            score: findHeaderIndex(headers, ['score', 'points', 'points earned', 'earned']),
            max: findHeaderIndex(headers, ['out of', 'possible', 'points possible', 'possible points', 'max points', 'max score', 'total points']),
            category: findHeaderIndex(headers, ['category', 'type']),
            multiplier: findHeaderIndex(headers, ['multiplier']),
            status: findHeaderIndex(headers, ['status', 'missing'])
        } : { title: 0, due: 1, score: 2, max: 3, category: 4 };
        const data = hasHeader ? rows.slice(headerRow + 1).filter(row => rows[headerRow].length === 1 || row.length > 1) : rows;
        return data.map(row => {
            const title = String(row[indexes.title] || '').trim();
            if (!title || /^(?:total|category total|term total|semester total)$/i.test(title)) return null;
            const item = assignmentResult(title, indexes.due >= 0 ? row[indexes.due] : '',
                indexes.score >= 0 ? row[indexes.score] : '', indexes.max >= 0 ? row[indexes.max] : '',
                indexes.category >= 0 ? row[indexes.category] : '', today);
            if (indexes.multiplier >= 0 && row[indexes.multiplier] !== undefined) item.multiplier = String(row[indexes.multiplier]).trim();
            if (indexes.status >= 0 && /^missing$/i.test(row[indexes.status] || '')) item.missing = true;
            return item;
        }).filter(Boolean);
    }

    root.StudBudCampusPaste = { parseCourses, parseAssignments, parseDate, tableTextFromHtml };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.StudBudCampusPaste;
})(typeof window !== 'undefined' ? window : globalThis);

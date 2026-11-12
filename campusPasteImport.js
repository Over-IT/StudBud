(function (root) {
    'use strict';

    const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

    function rowsFromText(text) {
        return String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)
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

    function parseAssignments(text, today = new Date()) {
        const rows = rowsFromText(text);
        if (!rows.length) return [];
        const titleAliases = ['assignment', 'assignment name', 'title', 'name'];
        const headerRow = rows.findIndex(row => findHeaderIndex(row.map(normalize), titleAliases) >= 0);
        const hasHeader = headerRow >= 0;
        const headers = hasHeader ? rows[headerRow].map(normalize) : [];
        const titleIndex = findHeaderIndex(headers, titleAliases);
        const indexes = hasHeader ? {
            title: titleIndex,
            due: findHeaderIndex(headers, ['due', 'due date', 'date due', 'date']),
            score: findHeaderIndex(headers, ['score', 'points', 'points earned', 'earned']),
            max: findHeaderIndex(headers, ['out of', 'possible', 'points possible', 'possible points', 'max points', 'max score', 'total points']),
            category: findHeaderIndex(headers, ['category', 'type'])
        } : { title: 0, due: 1, score: 2, max: 3, category: 4 };
        const data = hasHeader ? rows.slice(headerRow + 1).filter(row => rows[headerRow].length === 1 || row.length > 1) : rows;
        return data.map(row => {
            const title = String(row[indexes.title] || '').trim();
            if (!title || /^(?:total|category total|term total|semester total)$/i.test(title)) return null;
            const scoreText = indexes.score >= 0 ? row[indexes.score] : '';
            const scoreMatch = String(scoreText || '').trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
            const pointsEarned = scoreMatch ? Number(scoreMatch[1]) : numeric(scoreText);
            const maxPoints = scoreMatch ? Number(scoreMatch[2]) : numeric(indexes.max >= 0 ? row[indexes.max] : '');
            return {
                title: title.slice(0, 100),
                dueDate: parseDate(indexes.due >= 0 ? row[indexes.due] : '', today),
                pointsEarned,
                maxPoints: pointsEarned === null ? null : (maxPoints === null ? 100 : maxPoints),
                category: String(indexes.category >= 0 ? row[indexes.category] || '' : '').trim()
            };
        }).filter(Boolean);
    }

    root.StudBudCampusPaste = { parseCourses, parseAssignments, parseDate };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.StudBudCampusPaste;
})(typeof window !== 'undefined' ? window : globalThis);

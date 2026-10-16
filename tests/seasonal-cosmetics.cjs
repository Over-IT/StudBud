const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const sandbox = { console, Math, Date, window: {}, document: { addEventListener() {} } };
vm.createContext(sandbox);
for (const file of ['communityGames.js', 'multiplayerEngine.js']) vm.runInContext(read(file), sandbox);
const games = sandbox.window.StudBudCommunityGames;
const seasons = games.constructor.seasons;
for (const [time, month] of [['2026-10-01T00:30:00+14:00', 9], ['2026-09-30T23:30:00-12:00', 10], ['2027-01-01T00:00:00Z', 1]]) {
    assert.equal(games.constructor.currentSeason(new Date(time)).month, month, 'season selection uses UTC, including local month/year boundaries');
}
assert.match(read('supabase-setup.sql'), /if p_box like 'season:%' then[\s\S]*?p_box <> \('season:' \|\| extract\(month from now\(\) at time zone 'utc'\)[\s\S]*?raise exception 'The seasonal box has changed/,
    'server rejects a stale requested month before selecting rewards or deducting coins');
const items = games.catalog.filter(item => item.season);
assert.equal(items.length, 96);
assert.equal(new Set(items.map(item => item.id)).size, items.length, 'seasonal IDs are unique');
for (const season of seasons) {
    for (const id of [`palette_seasonal_${season.key}`, `hat_seasonal_${season.key}`, `skin_seasonal_${season.key}`,
        `acc_seasonal_${season.key}_effect`, `hat_seasonal_${season.key}_alt`, `skin_seasonal_${season.key}_alt`, `acc_seasonal_${season.key}_alt_effect`]) {
        assert.ok(items.some(item => item.id === id && item.season === season.month), `preserves owned item ${id}`);
    }
    const pool = games.boxPool({ ...games.constructor.seasonalBox, season });
    assert.equal(pool.length, 7 + (season.extras || []).length, `${season.key} contains every original and extra reward`);
    assert.ok(pool.every(item => item.season === season.month));
}
const sql = read('supabase-setup.sql').match(/create or replace function public\.studbud_seasonal_items\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$/)[1];
const rows = [...sql.matchAll(/\('([^']+_seasonal_[^']+)',\s*(\d+),\s*'([^']+)'\)/g)]
    .map(([, id, month, rarity]) => ({ id, month: Number(month), rarity }));
const sqlSeasons = [...sql.matchAll(/\('([a-z]+)',\s*(\d+)\)/g)];
const sqlAlternates = [...sql.matchAll(/\('([^']+_seasonal_)',\s*'([^']+)',\s*'([^']+)'\)/g)];
assert.equal(sqlSeasons.length, 12);
assert.equal(sqlAlternates.length, 3);
for (const [, key, month] of sqlSeasons) for (const [, prefix, suffix, rarity] of sqlAlternates) rows.push({ id: prefix + key + suffix, month: Number(month), rarity });
assert.equal(new Set(rows.map(row => row.id)).size, rows.length, 'SQL has no duplicate reward IDs');
const byId = list => Array.from(list, item => `${item.id}:${item.month ?? item.season}:${item.rarity}`).sort();
assert.deepEqual(byId(rows), byId(items), 'every client seasonal ID/month/rarity exists on the server and vice versa');
const util = sandbox.window.StudBudArcade.util;
const calls = [], alphas = [];
const ctx = new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
        if (key in target) return target[key];
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => { throw Error('seasonal shapes must not create gradients'); };
        return (...args) => {
            assert.ok(args.every(arg => typeof arg !== 'number' || Number.isFinite(arg)), `${String(key)} receives finite geometry`);
            calls.push([key, ...args]);
        };
    },
    set(target, key, value) { if (key === 'globalAlpha') alphas.push(value); target[key] = value; return true; }
});
const extras = items.filter(item => seasons.find(season => season.month === item.season).extras?.some(extra => item.id.includes(`_${extra.key}`) && item.type === extra.type));
assert.equal(extras.length, 12);
for (const item of extras) {
    const slot = { skin: 'skin', hat: 'hat', effect: 'effect' }[item.type];
    if (item.type === 'palette') {
        assert.match(util.playerCosmetics({ equipped_palette: item.id }).color, /^hsl\((30|50) /);
        continue;
    }
    if (item.type === 'hat') {
        calls.length = 0;
        util.drawHat(ctx, item.id, 20, 20, 8);
        assert.ok(calls.filter(([key]) => key === 'fill' || key === 'fillRect').length >= 2, `${item.name} has distinct drawn details`);
    }
    for (const time of [0, 1.25]) for (const face of [-1, 1]) {
        const p = { cos: { [slot]: item.id } };
        util.drawFigureSide(ctx, p, 0, 0, 22, 37, face, time, true);
        util.drawFigureTop(ctx, p, 25, 25, 10, face, time);
    }
    if (item.type === 'effect') assert.ok(util.animatedCosmetics({ equipped_effect: item.id }));
}
assert.ok(alphas.includes(.72), 'Pale Phantom uses translucent skin in the shared renderer');
const skeleton = items.find(item => item.id === 'skin_seasonal_halloween_skeleton');
assert.equal(skeleton.skinColors.pattern, 'bones');
calls.length = 0;
util.drawFigureSide(ctx, { cos: { skin: skeleton.id } }, 0, 0, 22, 37, 1, 0, false);
assert.equal(calls.filter(([key]) => key === 'quadraticCurveTo').length >= 6, true, 'skeleton renders curved rib bones');
console.log('Seasonal cosmetics checks passed (96 client/server rewards, preserved IDs, monthly pools, twelve extras, canvas shapes, translucency, skeleton ribs).');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const sandbox = { console, Math, Date, window: {}, document: { addEventListener() {} } };
vm.createContext(sandbox);
for (const file of ['communityGames.js', 'multiplayerEngine.js']) vm.runInContext(read(file), sandbox);
const games = sandbox.window.StudBudCommunityGames, Games = games.constructor;
const util = sandbox.window.StudBudArcade.util;
const normalize = value => JSON.parse(JSON.stringify(value));
const sql = read('supabase-setup.sql');
const pricedSql = sql.match(/with priced\(id, price\) as \(values([\s\S]*?)\), pets/)[1];
const prices = new Map([...pricedSql.matchAll(/\('([^']+)', (\d+)\)/g)].map(([, id, price]) => [id, Number(price)]));
for (const item of games.catalog.filter(item => item.price !== null && !item.legacy)) {
    assert.ok(prices.has(item.id), `${item.id} exists in the server catalog`);
    assert.equal(item.price, Math.round(prices.get(item.id) * 2.5 / 5) * 5 * 2, `${item.id} costs exactly twice its former rounded price`);
}
assert.match(sql, /round\(priced\.price \* 2\.5 \/ 5\) \* 5 \* 2/);
const animalSql = sql.match(/function public\.studbud_animal_items\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$/)[1];
const animalRows = [...animalSql.matchAll(/\('([^']+)', '([^']+)'\)/g)].map(([, id, rarity]) => ({ id, rarity }));
const animals = games.catalog.filter(item => item.box === 'animal');
assert.equal(animals.length, 14);
assert.deepEqual(animalRows.sort((a, b) => a.id.localeCompare(b.id)),
    normalize(animals.map(({ id, rarity }) => ({ id, rarity }))).sort((a, b) => a.id.localeCompare(b.id)));
assert.equal(new Set(games.catalog.map(item => item.id)).size, games.catalog.length);
assert.ok(animals.every(item => !item.season && item.price === null));
assert.equal(games.catalog.filter(item => item.season).length, 96, 'seasonal rewards are unchanged');
assert.match(sql, /select animal\.id, null::integer, animal\.rarity from public\.studbud_animal_items\(\) animal/);

const themeSql = sql.match(/function public\.studbud_theme_items\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$/)[1];
const serverSets = new Map([...themeSql.matchAll(/\('([^']+)', array\[([\s\S]*?)\]\)/g)]
    .map(([, id, items]) => [id, [...items.matchAll(/'([^']+)'/g)].map(([, item]) => item)]));
serverSets.get('animal').push(...animalRows.map(item => item.id));
assert.match(themeSql, /select 'animal', animal\.id from public\.studbud_animal_items\(\) animal/);
assert.equal(Games.permanentSets.length, 6);
for (const set of Games.permanentSets) {
    const box = Games.boxes.find(box => box.id === set.id);
    assert.ok(box.themed);
    assert.deepEqual([...set.items].sort(), [...serverSets.get(set.id)].sort(), `${set.id} server/client membership agrees`);
    const pool = games.boxPool(box);
    assert.deepEqual(Array.from(pool, item => item.id).sort(), [...set.items].sort(), `${set.id} can award every set item`);
    assert.deepEqual(Array.from(new Set(pool.map(item => item.type))).sort(), ['accessory', 'effect', 'hat', 'palette', 'skin']);
    assert.ok(pool.every(item => !item.season && !item.legacy));
    assert.equal(games.boxPool(box, set.items).length, 0);
    assert.deepEqual(normalize(games.boxChances(box, set.items)), normalize(games.boxChances(box)));
    for (const remaining of pool) {
        const owned = pool.filter(item => item.id !== remaining.id).map(item => item.id);
        assert.deepEqual(normalize(games.boxChances(box, owned)), normalize(games.boxChances(box)));
    }
    if (set.id === 'animal') {
        assert.equal(box.price, 220);
        assert.match(sql, /p_box = 'animal' then\s+v_cost := 220/);
        const chances = sql.match(/when 'animal' then '([^']+)'::jsonb/)[1];
        assert.deepEqual(normalize(box.chances), JSON.parse(chances));
    } else {
        assert.equal(box.price, 240);
        assert.match(sql, /p_box in \('space', 'fantasy', 'nature', 'ocean', 'school'\) then\s+v_cost := 240/);
        const chances = sql.match(/else '(\{"common":25[^']+)'::jsonb\s+end;/)[1];
        assert.deepEqual(normalize(box.chances), JSON.parse(chances));
    }
}
assert.equal((sql.match(/s\.id in \(select t\.id from public\.studbud_theme_items\(\) t where t\.box = p_box\)/g) || []).length, 2,
    'both SQL tier exhaustion and final selection use themed membership');
for (const type of ['skin', 'hat', 'accessory', 'effect', 'palette']) {
    const box = Games.boxes.find(box => box.id === type);
    const chances = sql.match(new RegExp(`when '${type}' then '([^']+)'::jsonb`))[1];
    assert.deepEqual(normalize(box.chances), JSON.parse(chances), `${type} odds agree with SQL`);
    for (const animal of animals.filter(item => item.type === type)) {
        assert.ok(games.boxPool(box).some(item => item.id === animal.id), `${animal.id} also drops in its item-category box`);
    }
    for (const item of animals) assert.ok(Games.boxes.filter(box => ['basic', 'rare', 'legendary', 'mythic'].includes(box.id))
        .some(box => games.boxPool(box).some(reward => reward.id === item.id)), `${item.id} is eligible in a mixed box`);
    const purchaseSql = sql.match(/function public\.studbud_buy_mystery_item\(p_box text default 'basic'\)[\s\S]*?\$\$;/)[0];
    assert.ok(purchaseSql.indexOf('if v_total is null then') < purchaseSql.indexOf('if v_profile.coins < v_cost then'),
        'an empty catalog is rejected before charging');
    assert.match(purchaseSql, /if v_total is null then\s+raise exception 'This box has no available rewards/);
    assert.doesNotMatch(purchaseSql, /and not \(s\.id = any\(v_profile\.owned_items\)\)/);
    assert.match(purchaseSql, /v_duplicate := v_item_id = any\(v_profile\.owned_items\);/);
    assert.match(purchaseSql, /if v_duplicate then v_refund := v_cost \/ 2; end if;/);
    assert.match(purchaseSql, /coins = coins - v_cost \+ v_refund/);
    assert.match(purchaseSql, /owned_items = case when v_duplicate then owned_items else array_append\(owned_items, v_item_id\) end/);
}
for (const item of games.catalog.filter(item => item.collection && item.price !== null)) {
    const mixed = Games.boxes.filter(box => ['basic', 'rare', 'legendary', 'mythic'].includes(box.id));
    assert.ok(mixed.some(box => games.boxPool(box).some(reward => reward.id === item.id)), `${item.id} retains mixed-box eligibility`);
}
for (const season of Games.seasons) assert.ok(games.boxPool({ ...Games.seasonalBox, season }).every(item => item.season === season.month));

const calls = [];
const ctx = new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
        if (key in target) return target[key];
        return (...args) => {
            assert.ok(args.every(arg => typeof arg !== 'number' || Number.isFinite(arg)), `${String(key)} geometry is finite`);
            calls.push([key, target.fillStyle, ...args]);
        };
    },
    set(target, key, value) { target[key] = value; return true; }
});
const signatures = new Set();
for (const item of animals) {
    const slot = { skin: 'skin', hat: 'hat', accessory: 'acc', effect: 'effect' }[item.type];
    if (item.type === 'palette') {
        assert.match(util.playerCosmetics({ equipped_palette: item.id }).color, /^hsl\(45 /);
        continue;
    }
    for (const time of [0, 1.25]) for (const face of [-1, 1]) {
        const player = { cos: { [slot]: item.id } };
        calls.length = 0;
        util.drawFigureSide(ctx, player, 0, 0, 22, 37, face, time, true);
        const side = JSON.stringify(calls);
        util.drawFigureTop(ctx, player, 25, 25, 10, face, time);
        util.drawAvatar({ width: 240, height: 240, getContext: () => ctx }, player, time);
        if (time === 0 && face === 1) {
            assert.ok(!signatures.has(side), `${item.id} has distinctive side geometry`);
            signatures.add(side);
        }
        if (item.type === 'hat') {
            calls.length = 0;
            util.drawFigureSide(ctx, player, 0, 0, 22, 37, face, time, false);
            assert.ok(!calls.some(([key, , , y, w, h]) => key === 'fillRect' && y === 9 && w === 3 && h === 4),
                'full-head animal hats suppress the normal human eye');
        }
    }
}
for (const id of ['acc_animal_chicken_wings', 'acc_animal_fox_tail']) {
    assert.equal(util.animatedCosmetics({ equipped_accessory: id }), true);
}
assert.equal(util.animatedCosmetics({ equipped_effect: 'acc_animal_paw_effect' }), true);
calls.length = 0;
util.drawHat(ctx, 'hat_animal_hammerhead', 0, 0, 1);
assert.ok(calls.some(([key, , x, , rx]) => key === 'ellipse' && x === 0 && rx === 1.95),
    'hammerhead has a wide head, not a tiny perched shark');
console.log('Themed cosmetics passed: six permanent sets, all five categories, 14 new animal rewards, client/server pools and odds, exhaustion, side/top/avatar geometry.');

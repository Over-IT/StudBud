const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = { window: {}, document: { addEventListener() {} }, console, Math, Date, Map, Set, performance };
vm.createContext(sandbox);
for (const file of ['multiplayerEngine.js', 'multiplayerGames.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
}
const A = sandbox.window.StudBudArcade, U = A.util;
const makeGame = seed => new A.games.skyline({ seed, local: { color: '#fff' }, user: { id: 'test' }, setGoal(n) { this.goal = n; } });
const maps = [];
const SEEDS = [1, 42, 12345, 67890, 45678, 0xffffffff];
{
    const game = makeGame(42);
    const solidObjects = game.solids.filter(p => p.cityKit === 'catwalk' || p.cityKit === 'beam' || p.meteor
        || p.prop === 'crate' || p.factoryBelt || p.piston);
    assert.ok(solidObjects.length > 10);
    for (const platform of solidObjects) {
        assert.equal(platform.oneway, false, 'ordinary objects are solid rather than unmarked jump-through surfaces');
        const p = { ...platform, off: false, dx: 0, dy: 0 };
        for (const fps of [30, 60, 120]) {
            const body = { x: p.x + p.w / 2 - 13, y: p.y + p.h + 1, w: 26, h: 44, vx: 0, vy: -600 };
            U.moveBody(body, [p], 1 / fps);
            assert.equal(body.vy, 0, `${fps} FPS: upward jumps hit the underside of ordinary objects`);
            assert.equal(body.y, p.y + p.h);
        }
    }
    for (const p of game.solids.filter(p => p.oneway && !p.slope)) {
        const platform = { ...p, off: false, dx: 0, dy: 0 };
        const body = { x: p.x + p.w / 2 - 13, y: p.y + p.h + 1, w: 26, h: 44, vx: 0, vy: -600 };
        U.moveBody(body, [platform], 1 / 60);
        assert.equal(body.vy, -600, 'designated arrow platforms still allow upward jumps');
    }
    let strokes = 0;
    const markerContext = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { strokes++; } };
    for (const platform of game.solids) {
        strokes = 0;
        game.drawJumpThroughMarker(markerContext, platform);
        const marked = platform.oneway && !platform.off && !platform.stair && !platform.fireEscape && !platform.factoryStep;
        assert.equal(strokes, marked ? 1 : 0, 'active jump-through platforms get arrows except obvious stairs; solid objects never do');
    }
    for (const platform of game.solids.filter(p => ['sorting-shelf', 'packing-deck', 'cooling-grate', 'asteroid-ferry', 'thruster-boost', 'catapult'].includes(p.motif))) {
        assert.equal(platform.oneway, false, `${platform.motif} does not need pass-through collision`);
    }
}
{
    const game = makeGame(42);
    const machines = [...game.drills];
    game.cp = game.checkpoints[1];
    game.captureCheckpoint();
    assert.equal(game.drills.length, machines.length, 'reaching Factory must not retire its lethal machinery');
    assert.ok(game.drills.every(d => machines.includes(d)), 'cleanup retains the actual moving hazard objects');
    game.cp = game.checkpoints[2];
    game.captureCheckpoint();
    assert.equal(game.drills.length, machines.length, 'machinery on lower routes remains available after reaching Space');
}
for (const seed of SEEDS) {
    const game = makeGame(seed), again = makeGame(seed);
    maps.push(game);
    assert.equal(JSON.stringify(game.solids), JSON.stringify(again.solids), 'room seeds produce identical geometry');
    assert.equal(game.WIDTH, 20000, 'the world extends far beyond the old central shaft');
    assert.equal(A.games.skyline.testDestinations.length, 3, 'three staff destinations are available before creating the game');
    assert.equal(game.SUMMIT, 45000);
    assert.ok(game.summitH < 48000, 'actual generated summit stays near the target');
    assert.ok(game.challenges.length >= 7, 'factory and space are made of many chambers');
    const routePieces = game.solids.filter(p => p.chamber !== undefined);
    assert.ok(Math.max(...routePieces.map(p => p.x + p.w)) - Math.min(...routePieces.map(p => p.x)) > 7000, 'the course uses the whole horizontal world');

    // ---- factory and space: chambers chain hand-built set pieces and never settle into a repeating layout ----
    const kinds = game.challenges.map(c => c.kind);
    assert.ok(new Set(kinds).size >= kinds.length - 1, 'chambers almost never share a layout');
    for (let i = 1; i < game.challenges.length; i++) {
        const a = game.challenges[i - 1], b = game.challenges[i];
        assert.ok(b.pieces.length >= 1, 'every chamber holds at least one set piece');
        assert.equal(new Set(b.pieces).size, b.pieces.length, 'a chamber never uses the same piece twice');
        if (a.bi === b.bi) {
            const shared = b.pieces.filter(p => a.pieces.includes(p) && p !== 'landing');
            assert.ok(shared.length <= 1, `seed ${seed} chambers ${a.id}/${b.id} (${a.kind} / ${b.kind}) do not repeat each other`);
        }
    }
    for (const bi of [1, 3]) {
        const used = game.challenges.filter(c => c.bi === bi).flatMap(c => c.pieces).filter(p => p !== 'landing');
        assert.equal(used.length, new Set(used).size, `seed ${seed}: no section in a biome is repeated`);
    }
    for (const c of game.challenges) {
        assert.ok(c.nodes.every(p => p.bi === c.bi), 'all objects in a chamber share its biome');
        if (c.introductory) assert.ok(c.nodes.every(p => !p.crumble && !p.blink), 'opening chambers stay stable');
    }
    const factory = game.challenges.filter(c => c.bi === 1), space = game.challenges.filter(c => c.bi === 3);
    assert.equal(factory[0].pieces[0], 'belt-gauntlet', 'factory starts with the lethal conveyor gauntlet, not a long chain of plain jumps');
    assert.ok(factory.length >= 3 && space.length >= 3, 'factory and space each get a real stretch');
    assert.ok(new Set(factory.flatMap(c => c.pieces)).size >= 12, 'the factory works through its whole deck of set pieces');
    assert.ok(new Set(space.flatMap(c => c.pieces)).size >= 10, 'space works through its whole deck of set pieces');
    assert.equal(game.drills.length, 7, 'two long conveyor lines have four and three timed obstacles');
    assert.ok(game.drills.every(d => d.bi === 1), 'drills and presses appear only in the factory');
    assert.ok(game.drills.some(d => d.crusher) && game.drills.some(d => !d.crusher), 'factory contains both crushers and drills');
    for (const d of game.drills) {
        assert.ok(game.solids.some(p => p.chamber === d.chamber && Math.abs(p.y - d.surfaceY) < 1 && d.x >= p.x && d.x <= p.x + p.w), 'drills strike a real deck');
    }
    assert.equal(game.solids.filter(p => p.factoryBelt && p.w >= 800).length, 2, 'two long conveyor challenges appear per run');
    assert.equal(game.solids.filter(p => p.factoryBelt).length, 5, 'factory adds three short assembly belts and one stamping-feed conveyor');
    for (const belt of game.solids.filter(p => p.factoryBelt)) {
        const machines = game.drills.filter(d => d.chamber === belt.chamber && d.surfaceY === belt.y && d.x > belt.x && d.x < belt.x + belt.w);
        if (belt.motif !== 'assembly-bench') assert.ok(machines.length >= 1, `${belt.motif}: long and stamping conveyors have timed hazards`);
        if (belt.motif === 'belt-gauntlet') {
            assert.equal(machines.length, 4, 'long gauntlet has four independently timed machines');
            assert.ok(belt.w >= 1180 && belt.beltFlip === 6, 'long crossing also periodically reverses direction');
        }
        assert.ok(machines.every(d => d.x - belt.x > 70 && belt.x + belt.w - d.x > 70), 'belt entry and exit leave room to prepare the next crossing');
    }
    assert.ok(game.lasers.some(l => l.steam && l.bi === 1), 'pressure vents interrupt the factory climbs with timed hazards');
    assert.ok(game.solids.some(p => p.motif === 'sorting-bay') && game.solids.some(p => p.motif === 'cooling-grate')
        && game.solids.some(p => p.motif === 'cargo-unload'), 'the former composite sections now have their own layouts');
    assert.equal(game.solids.filter(p => p.piece === 'piston-steps' && p.piston).length, 2, 'piston climb is a short transfer, not a long staircase');
    assert.ok(!game.solids.some(p => p.bi === 2 || p.cloud || (p.sinker && p.cityKit !== 'pole') || p.prop === 'cloudbank'), 'removed Sky generates no cloud platforms');
    assert.ok(!game.saws.some(s => s.bi === 0), 'city rooftops do not use saw blades');

    // ---- space: asteroids cross once from off screen on fixed lanes, and some lanes are the route itself ----
    assert.ok(game.lanes.length >= 8 && game.lanes.every(l => l.bi === 3), 'asteroid lanes only exist in space');
    assert.ok(game.meteors.every(m => m.lane && m.bi === 3), 'every asteroid belongs to a lane');
    const climbs = space.filter(c => c.pieces.includes('meteor-climb'));
    assert.ok(climbs.length >= 1, 'space includes a climb that hops from moving meteor to moving meteor');
    assert.ok(game.solids.some(p => p.via?.length), 'meteor-climb lanes carry you between decks');
    assert.ok(game.debris.length >= 4, 'debris showers rain through the station');

    // ---- checkpoints ----
    assert.equal(game.checkpoints.length, 3, 'exactly three biome entrance checkpoints');
    game.checkpoints.forEach((cp, i) => {
        assert.equal(cp.id, i);
        assert.equal(cp.biome, [0, 1, 3][i]);
        assert.equal(game.biomeProgress(-cp.y), i, 'biome color transitions match checkpoint positions');
        assert.ok(game.solids.some(p => !p.wall && p.y === cp.y && cp.x >= p.x && cp.x + 26 <= p.x + p.w), 'checkpoint has a real landing surface');
    });
    assert.equal(game.solids.filter(p => p.wall && !p.boundary).length, 0, 'only invisible world limits remain');

    // ---- the city: connected skyscrapers, a fire-escape start and finish, and crossings that never fall into a loop ----
    const towers = game.towers;
    assert.ok(towers.length >= 8 && towers[towers.length - 1].x + towers[towers.length - 1].w - towers[0].x > 9000, 'the city is a long run of skyscrapers');
    for (let i = 0; i < towers.length; i++) {
        const t = towers[i];
        assert.equal(t.y + t.h, 0, 'city skyscrapers extend down to the street');
        assert.ok(t.w >= 760 && t.w <= 980, 'towers keep an average building width');
        if (i) assert.ok(t.x - towers[i - 1].x - towers[i - 1].w >= 150, 'towers have real gaps between them');
    }
    const [T0, T1] = towers, start = game.checkpoints[0], opening = game.fireEscapes[0];
    assert.ok(start.x > T0.x + T0.w && start.x + 26 < T1.x, 'you start in the alley between the first two towers');
    assert.equal(game.cityPath.indexOf(opening[0]), 0, 'the run begins on the fire escape');
    assert.ok(opening.length === 6 && opening.every(p => p.fireEscape && p.oneway && p.x >= T0.x + T0.w && p.x + p.w <= T1.x), 'the fire escape hangs in the alley and every flight is jump-through');
    assert.equal(opening[opening.length - 1].y, T1.y, 'the top landing is level with the first roof');
    assert.equal(opening[opening.length - 1].x + opening[opening.length - 1].w, T1.x, 'the top landing meets the roof edge');
    const finale = game.cityCrossings[game.cityCrossings.length - 1];
    assert.equal(finale.kind, 'fire-escape', 'the city ends on a second fire escape into the clouds');
    const crossings = game.cityCrossings.slice(0, -1).map(c => c.kind);
    assert.ok(new Set(crossings).size >= 6, `seed ${seed}: the city mixes many crossing styles (${crossings.join(' ')})`);
    const vertical = new Set(['climb', 'scale', 'gondola', 'scaffold', 'crane']);
    crossings.forEach((k, i) => {
        if (!i) return;
        assert.notEqual(k, crossings[i - 1], 'no crossing repeats back to back');
        assert.ok(!(vertical.has(k) && vertical.has(crossings[i - 1])), 'wall climbs never come back to back');
    });
    const themes = game.cityCrossings.map(c => c.from.theme);
    themes.forEach((t, i) => i && assert.notEqual(t, themes[i - 1], 'neighbouring roofs never share a theme'));
    const laserRoofs = game.cityCrossings.filter(c => c.from.theme === 'security' || c.from.theme === 'tripwire');
    assert.ok(laserRoofs.every(c => !vertical.has(c.kind)), 'laser roofs never lead straight into a wall climb');
    assert.ok(laserRoofs.length <= 3, 'laser roofs are occasional, not every other roof');
    for (const c of game.cityCrossings) if (c.level < 3) assert.ok(!c.pieces.some(p => p.crumble || p.blink), 'the first crossings stay stable');
    for (const p of game.solids.filter(p => p.wallX !== undefined)) {
        const offset = p.far ? 150 : 0;
        assert.equal(p.wallSide > 0 ? p.x : p.x + p.w, p.wallX + p.wallSide * offset, 'wall fixtures sit on (or hang a fixed arm from) their wall');
        assert.ok(towers.some(t => (t.x === p.wallX || t.x + t.w === p.wallX) && t.y < p.y), 'every fixture is bolted to a real tower face');
    }
    assert.ok(!game.solids.some(p => p.city && p.chamber !== undefined), 'the city route is not built from floating clusters');
    const highestTower = Math.min(...towers.map(t => t.y));
    assert.ok(game.challenges.every(c => c.nodes.every(p => p.y + p.h < highestTower - 100)), 'the cloud route starts above every rooftop');
}
{
    // across many seeds the city never plays out the same crossing order twice
    const orders = new Set();
    for (let seed = 1; seed <= 40; seed++) orders.add(makeGame(seed).cityCrossings.map(c => c.kind).join(' '));
    assert.ok(orders.size >= 38, 'city crossing orders differ between maps');
}
console.log('Six seeded City/Factory/Space maps: varied chambers, factory machinery, meteor lanes, fire-escape city and three checkpoints passed.');

for (const fps of [30, 60, 120]) {
    for (const slope of [1, -1]) {
        for (const curve of [undefined, 'ease', 'arch']) {
            const s = { x: 100, y: 100, w: 300, h: 90, slope, curve };
            const b = { x: 145, y: -100, w: 26, h: 44, vx: 0, vy: 0 };
            for (let i = 0; i < fps; i++) { b.vy += 2300 / fps; U.moveBody(b, [s], 1 / fps); }
            assert.equal(b.ground, s, 'falling lands on the actual slope');
            assert.ok(Math.abs(b.y + b.h - U.slopeSurface(s, b.x, b.w)) < 1e-8, 'the highest point under either foot supports the body');
            b.vx = 100;
            for (let i = 0; i < fps; i++) {
                b.vy += 2300 / fps;
                U.moveBody(b, [s], 1 / fps);
                assert.equal(b.ground, s, 'uphill/downhill/curved walking does not lose contact');
                assert.equal(b.wall, 0, 'walkable surfaces do not create phantom side walls');
                assert.ok(Math.abs(b.y + b.h - U.slopeSurface(s, b.x, b.w)) < 1e-8);
            }
            b.vy = -850;
            U.moveBody(b, [s], 1 / fps);
            assert.equal(b.onGround, false, 'jumping is not glued to the slope');
            const off = { ...s, off: true };
            const falling = { x: 200, y: 50, w: 26, h: 44, vx: 100, vy: 900 };
            for (let i = 0; i < 10; i++) U.moveBody(falling, [off], 1 / fps);
            assert.equal(falling.onGround, false, 'disabled slopes do not collide');
            assert.equal(falling.wall, 0);
            const underside = { x: 200, y: s.y + s.h + 1, w: 26, h: 44, vx: 0, vy: -850 };
            U.moveBody(underside, [s], 1 / fps);
            assert.equal(underside.y, s.y + s.h, 'underside matches the visible solid base');
        }
    }
    const landing = { x: 95, y: 0, w: 26, h: 44, vx: 0, vy: 1150 };
    const platform = { x: 100, y: 60, w: 64, h: 14 };
    U.moveBody(landing, [platform], 1 / fps);
    for (let i = 0; i < 4 && !landing.onGround; i++) U.moveBody(landing, [platform], 1 / fps);
    assert.equal(landing.ground, platform, 'fast falls do not tunnel through small landings');
}
const game = makeGame(42);
const spike = { x: 0, y: 0, w: 19, h: 20 };
assert.equal(game.spikeHits({ x: 0, y: 0, w: 2, h: 3 }, spike), false, 'empty triangular corners are safe');
assert.equal(game.spikeHits({ x: 6, y: 0, w: 3, h: 3 }, spike), true, 'spike tips collide');
assert.equal(game.spikeHits({ x: 20, y: 15, w: 3, h: 4 }, spike), false, 'partial spikes do not extend beyond their drawing');
assert.equal(game.circleHits({ x: 0, y: 0, w: 20, h: 40 }, { x: 10, y: 42, r: 5 }), true, 'feet touching a saw collide');
assert.equal(game.circleHits({ x: 0, y: 0, w: 20, h: 40 }, { x: 25, y: 45, r: 6 }), false, 'empty corners outside a circle are safe');
{
    const d = { x: 100, mountY: -130, surfaceY: 0, period: 2, phase: 0 };
    const standing = { x: 90, y: -41, w: 20, h: 38 };
    game.updateDrill(d, 0);
    assert.equal(d.tipY, -104, 'drills rest retracted above head height');
    assert.equal(game.drillHits(standing, d), false, 'walking under a retracted drill is safe');
    game.updateDrill(d, 1);
    assert.equal(d.warn, true, 'drills shake before striking');
    assert.equal(game.drillHits(standing, d), false, 'the warning itself is harmless');
    game.updateDrill(d, 1.35);
    assert.equal(d.slamming, true, 'drills are lethal while slamming down');
    assert.equal(game.drillHits(standing, d), true, 'a descending drill hits a standing player');
    game.updateDrill(d, 1.5);
    assert.equal(d.tipY, -2, 'drills slam down to the deck');
    assert.equal(game.drillHits(standing, d), false, 'a drill resting on the deck is a solid block, not a hazard');
    game.updateDrill(d, 1.35);
    assert.equal(game.drillHits({ x: 113, y: -41, w: 20, h: 38 }, d), false, 'space beside the narrow bit is safe');
    assert.equal(game.drillHits({ x: 109, y: -14, w: 20, h: 11 }, d), false, 'the empty corner beside the pointed tip is safe');
}
function reachable(from, target, solids, fps, spring = false, aimX = target.x + target.w / 2, exit = null, maxDrop = 120, doubleTimes = [null, .15, .25, .35, .45], dashTimes = [null, .25, .45, .65]) {
    const space = target.bi === 3;
    for (const doubleAt of doubleTimes) {
        for (const dashAt of dashTimes) {
            const b = { x: from.x, y: from.y - 44, w: 26, h: 44, vx: 0, vy: spring ? space ? -720 : -1280 : space ? -560 : -850 };
            let doubled = false, dashed = false, dash = 0, bridgeHop = false;
            for (let frame = 0; frame < fps * (space ? 4 : 2); frame++) {
                const time = frame / fps, dt = 1 / fps;
                const waitForClearance = !target.oneway && b.y + b.h > target.y;
                const throughHatch = exit && b.y + b.h > exit.top - 5;
                const clearanceX = b.x + b.w / 2 < target.x + target.w / 2 ? target.x - b.w / 2 - 8 : target.x + target.w + b.w / 2 + 8;
                const dx = (throughHatch ? exit.exitX : waitForClearance ? clearanceX : aimX) - b.x - b.w / 2;
                const dir = Math.sign(dx);
                if (exit && b.ground?.bridge && !bridgeHop) { b.vy = -850; bridgeHop = true; }
                if (doubleAt !== null && !doubled && time >= doubleAt) { b.vy = space ? -520 : -780; doubled = true; }
                if (dashAt !== null && !dashed && time >= dashAt) { dash = .16; dashed = true; }
                if (dash > 0) { b.vx = dir * 760; b.vy = 0; dash -= dt; }
                else {
                    b.vx += U.clamp(U.clamp(dx * 8, -340, 340) - b.vx, -2300 * dt, 2300 * dt);
                    b.vy = Math.min(space ? 650 : 1150, b.vy + (space ? 650 : 2300) * dt);
                }
                U.moveBody(b, solids, dt);
                if (b.ground === target) return true;
                if (b.y > from.y + maxDrop) break;
            }
        }
    }
    return false;
}
for (const fps of [30, 60, 120]) {
    for (const map of fps === 60 ? maps : [game]) {
        for (const c of map.challenges) {
            const stage = map.solids.filter(p => p.chamber === c.id);
            const targets = c.nodes;
            for (let i = 0; i < targets.length - 1; i++) {
                const source = targets[i], target = targets[i + 1];
                const moving = p => p.mover || p.lane || p.meteor || p.via || p.freight || p.piston || p.factoryLift || p.arm;
                if (moving(source) || moving(target)) continue;
                const sx = source.navX !== undefined ? source.navX - 13 : source.slope ? source.curve === 'arch' ? source.x + source.w / 2 - 13 : source.slope > 0 ? source.x + source.w - 26 : source.x : source.x + source.w / 2 - 13;
                const aimX = target.navX ?? target.x + target.w / 2;
                const aims = target.navX !== undefined ? [aimX] : [aimX, target.x + 20, target.x + target.w - 20];
                const spring = map.springs.some(p => p.y + p.h === source.y && p.x >= source.x && p.x < source.x + source.w);
                const starts = spring ? [sx] : [sx, source.x + 4, source.x + source.w - 30];
                const canReach = starts.some(x => {
                    const sy = source.slope ? U.slopeSurface(source, x, 26) : source.y;
                    const body = { x, y: sy - 44, w: 26, h: 44 };
                    if (stage.some(p => p !== source && !p.slope && U.overlap(body, p))) return false;
                    return aims.some(aim => reachable({ x, y: sy }, target, stage, fps, spring, aim));
                });
                assert.ok(canReach, `${fps} FPS seed ${map.s.seed} route ${c.id} ${c.kind}: ${source.motif || 'entry'} (${source.x}, ${source.y}, ${source.w}) to ${target.motif || 'exit'} (${target.x}, ${target.y}, ${target.w}) is physically reachable`);
            }
        }
    }
}
console.log('Real jumps in all six mixed layouts and staggered rooftop crossings passed at 30/60/120 FPS, without bot assistance.');

for (const map of maps) {
    for (let i = 1; i < map.challenges.length; i++) {
        const previous = map.challenges[i - 1].exit, entry = map.challenges[i].nodes[0];
        const links = map.solids.slice(map.solids.indexOf(previous), map.solids.indexOf(entry) + 1).filter(p => !p.wall && !p.prop && !p.meteor);
        for (let j = 0; j < links.length - 1; j++) {
            const source = links[j], target = links[j + 1];
            if (target.meteorLanding) continue;
            const starts = [source.x + source.w / 2 - 13, source.x + 4, source.x + source.w - 30];
            assert.ok(starts.some(x => reachable({ x, y: source.y }, target, map.solids, 60)), `mixed route ${i}: connecting roofs and biome checkpoints are reachable`);
        }
    }
}
console.log('Connecting rooftops and biome checkpoint transitions passed on all six seeds.');

// The city: every step of the alley climb, wall fixtures, carts, gondolas and roof hops is a real jump.
// Moving cars are tested frozen at both ends of their travel; springs launch from their pad.
for (const map of maps) {
    const extremes = p => !p.mover ? [p] : [-1, 1].map(s => ({ ...p, mover: false, x: p.vert ? p.x : p.bx + s * p.amp, y: p.vert ? p.by + s * p.amp : p.y }));
    const route = [{ x: map.checkpoints[0].x - 60, y: 0, w: 150, h: 10, start: true }, ...map.cityPath];
    for (let i = 0; i < route.length - 1; i++) {
        const source = route[i], target = route[i + 1];
        if (map.cityCrossings.some(c => c.kind === 'scale' && c.from === source && c.to === target)) continue;
        const lo = Math.min(source.x, target.x) - 700, hi = Math.max(source.x + source.w, target.x + target.w) + 700;
        const near = map.solids.filter(p => p !== source && p !== target && !p.wall && !p.mover && p.x < hi && p.x + p.w > lo && p.y < Math.max(source.y, target.y) + 400 && p.y + p.h > Math.min(source.y, target.y) - 500);
        const spring = map.springs.find(p => p.city && p.y + p.h === source.y && p.x >= source.x && p.x < source.x + source.w);
        const ok = extremes(source).some(src => extremes(target).some(dst => {
            const stage = [...near, src, dst];
            const starts = spring ? [spring.x + 10] : src.tower && dst.rooftopRoute ? [dst.x + 10, src.x + src.w - 30, src.x + src.w - 60] : src.tower ? [src.x + src.w - 30, src.x + src.w - 60] : [src.x + src.w / 2 - 13, src.x + 4, src.x + src.w - 30];
            const aims = dst.tower ? [dst.x + 60, dst.x + 120] : [dst.x + dst.w / 2, dst.x + 20, dst.x + dst.w - 20];
            return starts.some(x => {
                const sy = src.slope ? U.slopeSurface(src, x, 26) : src.y;
                return aims.some(aim => reachable({ x, y: sy }, dst, stage, 60, !!spring, aim, null, 400));
            });
        }));
        assert.ok(ok, `seed ${map.s.seed} city step ${i}: ${source.mount || source.start && 'street' || (source.tower ? 'tower' : source.cart ? 'cart' : source.gondola ? 'gondola' : source.bridge ? 'bridge' : 'piece')} (${source.x}, ${source.y}) to ${target.mount || (target.tower ? 'tower' : target.cart ? 'cart' : target.gondola ? 'gondola' : target.bridge ? 'bridge' : 'cloud pad')} (${target.x}, ${target.y}) is reachable`);
    }
}
console.log('Alley climb, wall fixtures, carts, gondolas, skybridges and roof-to-roof crossings are reachable on all six seeds.');

// Scale crossings need wall-jumps, so drive the real game update with a scripted player:
// leap at the climbing rail, then kick back and forth between it and the blade sign until B's roof.
{
    let scaled = 0;
    for (const seed of [1, 42, 12345, 67890, 45678, 0xffffffff, 7, 99, 2024, 31337]) {
        const map = makeGame(seed);
        for (const crossing of map.cityCrossings.filter(c => c.kind === 'scale')) {
            const { from, to } = crossing, [sign, rail] = crossing.rig;
            assert.ok(sign.wallJ && rail.wallJ && sign.x + sign.w === from.x + from.w && rail.x === to.x, 'scale walls face each other across the shaft');
            assert.ok(sign.y + sign.h <= from.y - 200, 'players walk under the blade sign');
            assert.ok(to.x - from.x - from.w >= 150, 'the shaft between towers is a real gap');
            for (const fps of [30, 60, 120]) {
                const g = makeGame(seed), s = g.s, gc = g.cityCrossings.find(c => c.kind === 'scale' && c.to.x === to.x), B = gc.to, perch = gc.rig[0], roof = gc.from;
                s.testing = true; s.testInvincible = true; s.startedAt = Date.now(); s.t = 0;
                s.game = { res: { value: 100, drain() {} } }; s.spend = () => true; s.toast = () => {}; s.sfx = () => {}; s.setGoal = () => {};
                g.me.x = from.x + from.w - 40; g.me.y = from.y - 44; g.me.vx = 0; g.me.vy = 0;
                for (let i = 0; i < 5; i++) { s.axis = () => ({ x: 0, y: 0 }); s.down = () => false; s.pressed = () => false; g.update(1 / fps); }
                let dir = 1, jump = true, reached = false;
                for (let f = 0; f < fps * 14 && !reached; f++) {
                    const feet = g.me.y + g.me.h;
                    if (g.wallDir && g.me.vy > 0) { jump = true; dir = -g.wallDir; }
                    else if (!g.me.onGround && !g.wallDir && g.me.vy > 0 && g.airJumps > 0 && Math.abs(feet - B.y) < 70) { jump = true; dir = 1; }
                    if (g.me.onGround && g.me.ground === perch) { dir = 1; jump = Math.abs(g.me.vx) > 300 || jump; }
                    if (feet < B.y - 4) {
                        const targetX = B.x + 80;
                        dir = Math.abs(g.me.x + g.me.w / 2 - targetX) < 25 ? 0 : g.me.x + g.me.w / 2 < targetX ? 1 : -1;
                    }
                    const press = jump; jump = false;
                    s.axis = () => ({ x: dir, y: 0 }); s.down = (...k) => k.includes('Space'); s.pressed = (...k) => press && k.includes('Space');
                    g.update(1 / fps);
                    if (g.me.onGround) {
                        if (g.me.ground === B || g.cityRooftopRoutes.some(loop => loop.roof === B && loop.pieces.includes(g.me.ground))) reached = true;
                        else if (g.me.ground?.prop && feet <= B.y && g.me.x >= B.x) { dir = 1; jump = true; }
                        else if (g.me.ground !== perch && g.me.ground !== roof) break;
                    }
                    if (g.me.y > from.y + 400) break;
                }
                assert.ok(reached, `seed ${seed} ${fps} FPS: wall-hopping up the scale shaft reaches the taller roof`);
            }
            scaled++;
        }
    }
    assert.ok(scaled >= 2, 'scale crossings appear in the city');
}
console.log('Scale shafts are climbable with real wall-jumps at 30/60/120 FPS.');

{
    const floor = { x: 0, y: 0, w: 400, h: 40 }, lip = { x: 200, y: -8, w: 200, h: 48 };
    const b = { x: 160, y: -44, w: 26, h: 44, vx: 300, vy: 0, ground: floor, onGround: true };
    for (let i = 0; i < 20; i++) { b.vy = Math.min(1150, b.vy + 2300 / 60); U.moveBody(b, [floor, lip], 1 / 60); }
    assert.ok(b.x > 200 && b.ground === lip && b.y + b.h === lip.y, 'running into a small lip steps onto it');
    const wall = { x: 200, y: -40, w: 200, h: 80 }, w = { x: 160, y: -44, w: 26, h: 44, vx: 300, vy: 0, ground: floor, onGround: true };
    for (let i = 0; i < 20; i++) { w.vy = Math.min(1150, w.vy + 2300 / 60); U.moveBody(w, [floor, wall], 1 / 60); }
    assert.equal(w.x + w.w, wall.x, 'real walls still block');
    const ceiling = { x: 100, y: -200, w: 100, h: 20 }, j = { x: 194, y: -150, w: 26, h: 44, vx: 0, vy: -850 };
    for (let i = 0; i < 10; i++) U.moveBody(j, [ceiling], 1 / 60);
    assert.ok(j.y < ceiling.y && j.x === ceiling.x + ceiling.w, 'clipping a ceiling corner nudges past it');
    const head = { x: 150, y: -150, w: 26, h: 44, vx: 0, vy: -850 };
    U.moveBody(head, [ceiling], 1 / 20);
    assert.equal(head.y, ceiling.y + ceiling.h, 'a full head hit still bonks');
    const lift = { x: 100, y: -20, w: 120, h: 18, mover: true, dx: 0, dy: -14 }, rider = { x: 110, y: -60, w: 26, h: 44, vx: 0, vy: 200 };
    U.moveBody(rider, [lift], 1 / 60);
    assert.ok(rider.x === 110 && rider.ground === lift && rider.y + rider.h === lift.y, 'a rising platform lifts you instead of shoving you off its end');
    for (const fps of [30, 60, 144]) {
        const g = makeGame(42), s = g.s;
        s.testing = true; s.testInvincible = true; s.startedAt = Date.now(); s.t = 0;
        s.game = { res: { value: 100, drain() {} } }; s.spend = () => true; s.toast = () => {}; s.sfx = () => {}; s.setGoal = () => {};
        s.axis = () => ({ x: 0, y: 0 }); s.down = () => false; s.pressed = () => false;
        for (const m of [...g.movers.filter(m => m.vert && !m.meteor && m.w >= 100).slice(0, 6), ...g.movers.filter(m => m.sinker && !m.city).slice(0, 4)]) {
            g.update(1 / fps);
            g.me.x = m.x + m.w / 2 - 13; g.me.y = m.y - 44; g.me.vx = 0; g.me.vy = 0; g.me.ground = m; g.me.onGround = true; g.dead = 0;
            const offset = g.me.x - m.x;
            for (let f = 0; f < fps * 8; f++) {
                g.update(1 / fps);
                assert.ok(g.me.ground === m && Math.abs(g.me.x - m.x - offset) < .5, `${fps} FPS: riding a ${m.gondola ? 'gondola' : 'lift'} keeps you on it`);
            }
        }
    }
}
console.log('Small-lip step-ups and ceiling corner correction passed.');

{
    const g = makeGame(42), s = g.s;
    s.testInvincible = true;
    g.hurt();
    assert.equal(g.deaths, 1, 'ordinary games cannot enable staff invincibility');
    g.dead = 0; s.testing = true;
    g.hurt();
    assert.equal(g.deaths, 1, 'staff invincibility prevents hazard deaths');
    g.hurt(true);
    assert.equal(g.deaths, 2, 'manual checkpoint reset still works while invincible');
    s.testFlight = true; s.startedAt = Date.now(); s.t = 0;
    s.pressed = () => false;
    s.axis = () => ({ x: 1, y: -1 });
    s.down = (...codes) => codes.includes('KeyW');
    const before = { x: g.me.x, y: g.me.y };
    g.update(.1);
    assert.equal(g.dead, 0);
    assert.equal(g.me.x, before.x + 60, 'flight moves horizontally without collision');
    assert.equal(g.me.y, before.y - 60, 'flight moves upward without gravity');
    s.axis = () => ({ x: 0, y: 0 }); s.down = () => false;
    const hover = g.me.y;
    g.update(.1);
    assert.equal(g.me.y, hover, 'flight hovers when input stops');
    assert.equal(g.me.onGround, false);
    assert.equal(g.touchLayout().buttons[0].k, 'KeyW', 'staff flight has touch ascent/descent controls');
    s.testFlySpeed = 1800; s.axis = () => ({ x: 1, y: -1 }); s.down = () => false;
    let x = g.me.x; g.update(.1);
    assert.equal(g.me.x, x + 180, 'selected staff flight speed drives actual movement');
    s.down = (...keys) => keys.includes('ShiftLeft');
    x = g.me.x; g.update(.1);
    assert.equal(g.me.x, x + 330, 'Shift boosts configured speed using the original multiplier');
    s.testFlySpeed = 99999; s.down = () => false;
    x = g.me.x; g.update(.1); assert.equal(g.me.x, x + 300, 'tampered flight speeds clamp to the maximum');
    s.testFlySpeed = NaN; x = g.me.x; g.update(.1);
    assert.equal(g.me.x, x + 60, 'nonfinite flight speed uses the original default');
    s.axis = () => ({ x: 0, y: 0 });
    s.testPauseAt = s.startedAt + 1000; g.update(0);
    const machine = g.drills[0], tip = machine.tipY;
    s.testFreezeHazards = true; s.testPauseAt += 3000; g.update(0);
    assert.equal(machine.tipY, tip, 'staff freeze preserves the machinery phase');
    const movers = g.movers.map(m => [m.x, m.y]), phases = g.blinkers.map(p => [p.off, p.warn]);
    g.update(.2);
    assert.deepEqual(g.movers.map(m => [m.x, m.y]), movers, 'all moving platforms, sinking clouds and meteors freeze');
    assert.deepEqual(g.blinkers.map(p => [p.off, p.warn]), phases, 'disappearing platforms retain their collision/warning phase');
    assert.ok(g.movers.every(m => m.dx === 0 && m.dy === 0), 'frozen platforms cannot carry riders using stale movement');
    s.testFreezeHazards = false; g.update(0);
    assert.equal(machine.tipY, tip, 'unfreezing resumes without a phase jump');
    s.testPauseAt += 100; g.update(0);
    assert.ok(Math.abs(g.hazardClock - 1.1) < 1e-9);
    s.toast = () => {}; s.setGoal = value => { s.goal = value; };
    for (const index of [1, 2, 0]) {
        g.botRoute = { stale: true };
        const version = g.testTeleportVersion || 0;
        assert.equal(g.testTeleport(index), true);
        assert.equal(g.botRoute, null, 'rebuilt geometry invalidates cached bot route references');
        assert.equal(g.testTeleportVersion, version + 1);
        assert.equal(g.cp.id, index); assert.equal(g.me.y + g.me.h + 2, g.cp.y);
        assert.equal(g.me.vx, 0); assert.equal(g.dead, 0);
        assert.ok(g.solids.some(p => p.y === g.cp.y && p.x <= g.me.x && p.x + p.w >= g.me.x + g.me.w), 'teleport restores a safe biome landing');
        g.captureCheckpoint();
    }
    assert.ok(g.cityPath.length > 0 && g.towers.length >= 8, 'backward teleport rebuilds retired areas deterministically');
    assert.equal(g.testTeleport(-1), false); assert.equal(g.testTeleport(.5), false);
    const original = g.me.y;
    s.testing = false; assert.equal(g.testTeleport(3), false); assert.equal(g.me.y, original, 'teleport is unavailable outside staff tests');
    s.testing = true;
    s.testFlight = false;
    assert.equal(g.touchLayout().buttons[0].k, 'Space', 'normal jump controls return when flight is disabled');
}

{
    const g = makeGame(42), calls = [], stack = [];
    const ctx = { globalAlpha: 1, save() { stack.push(this.globalAlpha); }, restore() { this.globalAlpha = stack.pop(); } };
    for (const method of ['beginPath', 'closePath', 'moveTo', 'lineTo', 'arcTo', 'ellipse', 'quadraticCurveTo', 'roundRect', 'setLineDash', 'stroke', 'strokeRect', 'fill', 'fillRect', 'fillText']) {
        ctx[method] = (...args) => calls.push({ method, alpha: ctx.globalAlpha, args });
    }
    const palette = { body: '#334155', accent: '#fbbf24', edge: '#64748b' };
    g.anim = .2;
    for (const kind of ['blink', 'crumble']) {
        const p = { x: 800, y: -500, w: 116, h: 18, chamber: 0, bi: 0, [kind]: true, warn: true, timer: .3, on: 2.8, phase: 0, period: 3.8 };
        calls.length = 0; g.drawUnstablePlatform(ctx, p, palette);
        assert.ok(calls.some(c => c.method === 'fill' && c.alpha === .45), 'the whole landing flashes before losing collision');
        assert.ok(calls.some(c => c.method === 'stroke' && c.alpha === .45), 'attached supports share the warning flash');
        assert.ok(!calls.some(c => c.method === 'fillText'), 'unstable surfaces show their state visually, without text labels');
        p.off = true; calls.length = 0; g.drawUnstablePlatform(ctx, p, palette);
        assert.ok(calls.some(c => c.method === 'strokeRect' && c.alpha === .35), 'inactive platforms show a faint dashed outline');
        assert.ok(!calls.some(c => c.method === 'fill' || c.method === 'fillRect' || c.method === 'stroke'), 'inactive landings and supports never look solid');
        assert.equal(ctx.globalAlpha, 1, 'platform effects cannot leak into other drawing');
        const b = { x: p.x + 20, y: p.y - 44, w: 26, h: 44, vx: 0, vy: 300 };
        U.moveBody(b, [p], .1);
        assert.equal(b.onGround, false, 'inactive visuals agree with collision');
    }
    g.drawArchitecture = () => calls.push({ method: 'building' });
    g.drawDecor = () => {};
    for (const bi of [0, 1, 2, 3]) {
        calls.length = 0;
        g.drawIsland(ctx, { x: 0, y: 0, w: 700, h: 80, bi }, -100, 200);
        assert.equal(calls.some(c => c.method === 'building'), bi === 0, 'only the first biome renders building architecture');
    }
}
console.log('Staff-only flight/invincibility and complete warning/inactive platform rendering passed.');

for (const game of maps) for (const fps of [30, 60, 120]) {
    for (const belt of game.solids.filter(p => p.factoryBelt)) {
        const index = game.climbPath.indexOf(belt), previous = game.climbPath[index - 1];
        const direction = Math.sign(belt.x + belt.w / 2 - previous.x - previous.w / 2);
        const machines = game.drills.filter(d => d.surfaceY === belt.y && d.x > belt.x && d.x < belt.x + belt.w);
        const baseSpeed = belt.belt;
        for (const polarity of [1, -1]) for (const machine of machines) {
            belt.belt = baseSpeed * polarity;
            let crossed = false;
            for (let phase = 0; phase < 32 && !crossed; phase++) {
                const clearance = machine.width / 2 + 13 + 20;
                const start = machine.x - direction * clearance, end = machine.x + direction * clearance;
                const sim = Object.create(game);
                Object.assign(sim, {
                    me: { x: start - 13, y: belt.y - 44, w: 26, h: 44, vx: 0, vy: 0, face: direction, onGround: true, ground: belt },
                    res: new A.Resource('Energy', '#fff', 100, 100), dead: 0, finished: false,
                    stuckT: 0, strandedT: 0, tideY: belt.y + 1200, cp: game.checkpoints[1],
                    drills: machines.map(d => ({ ...d })), springs: [], spikes: [], saws: [], balls: [], debris: [], lasers: [],
                    captureCheckpoint() {}, particles: { burst() {}, update() {} }
                });
                sim.s = { game: sim, t: 0, axis: () => ({ x: direction }), down: () => false, pressed: () => false,
                    spend: n => sim.res.spend(n), toast() {}, sfx() {}, setGoal() {} };
                for (let frame = 0; frame < fps * 2 && !sim.dead; frame++) {
                    sim.hazardClock = phase * machine.period / 32 - machine.phase + frame / fps;
                    sim.drills.forEach(d => sim.updateDrill(d, sim.hazardClock));
                    sim.updatePlayer(1 / fps);
                    if (direction * (sim.me.x + 13 - end) >= 0 && !sim.dead) { crossed = true; break; }
                }
            }
            assert.ok(crossed, `${fps} FPS: each ${belt.motif} machine has a real, survivable walking window against its conveyor`);
        }
        belt.belt = baseSpeed;
    }
}
console.log('All conveyor machinery has survivable timed crossings with real belt physics on six layouts at 30/60/120 FPS.');

for (const fps of [30, 60, 120]) {
    const game = makeGame(42), s = game.s;
    Object.assign(s, { game, t: 0, startedAt: Date.now(), axis: () => ({ x: 0, y: 0 }), down: () => false, pressed: () => false,
        spend: n => game.res.spend(n), toast() {}, sfx() {}, setGoal() {} });
    game.cp = game.checkpoints[1]; game.tideY = 1000;
    game.spikes = []; game.saws = []; game.balls = []; game.debris = [];
    const machines = [...game.drills], jets = game.lasers.filter(l => l.steam);
    for (const d of machines) {
        game.drills = [d]; game.lasers = [];
        for (const [phase, lethal] of [[0, false], [.5, false], [.675, true], [.75, false], [.9, false]]) {
            game.dead = 0; game.boost = 0; game.res.value = 100;
            game.cp = game.checkpoints[0]; game.tideY = d.surfaceY + 1200;
            Object.assign(game.me, { x: d.x - 13, y: d.surfaceY - 44, vx: 0, vy: 0, onGround: true, ground: null });
            game.hazardClock = d.period * phase - d.phase;
            game.updateDrill(d, game.hazardClock);
            game.updatePlayer(1 / fps);
            assert.equal(game.dead > 0, lethal, `${fps} FPS: ${d.crusher ? 'crusher' : 'drill'} is lethal on its actual deck only during the strike`);
        }
    }
    game.drills = [];
    for (const jet of jets) {
        game.lasers = [jet];
        for (const [phase, lethal] of [[.2, true], [.7, false], [.9, false]]) {
            game.dead = 0; game.boost = 0; game.res.value = 100;
            game.cp = game.checkpoints[0]; game.tideY = jet.support.y + 1200;
            Object.assign(game.me, { x: jet.x + 7, y: jet.support.y - 44, vx: 0, vy: 0, onGround: true, ground: null });
            game.hazardClock = jet.period * phase - jet.phase;
            game.updatePlayer(1 / fps);
            assert.equal(game.dead > 0, lethal, `${fps} FPS: vent plume, cooldown and warning match collision`);
        }
    }
}
console.log('Main conveyors have timed machinery; crusher/drill strikes and steam warning/cooldown collisions passed at 30/60/120 FPS.');

{
    for (const seed of SEEDS) {
        const game = makeGame(seed), graph = game.escapeGraph();
        Object.assign(game.s, { game, t: 0, startedAt: Date.now(), axis: () => ({ x: 0, y: 0 }), down: () => false, pressed: () => false,
            spend: n => game.res.spend(n), toast() {}, sfx() {}, setGoal() {} });
        const route = [...game.climbPath, ...game.cityPath, ...(game.fireEscapes || []).flat()];
        for (const piece of route) {
            const node = graph.byRef.get(piece.lane || piece);
            if (node) assert.equal(node.ok, true, `seed ${seed}: route surface can still reach the summit`);
        }
        assert.equal(graph.nodes.every(node => node.ok), true, `seed ${seed}: no generated surface is a dead end`);
        const trap = { x: game.cp.x - 3000, y: game.cp.y + 700, w: 120, h: 20 };
        game.solids.push(trap);
        const pit = game.escapeGraph().byRef.get(trap);
        assert.equal(pit.ok, false, `seed ${seed}: a sealed pit is detected as a dead end`);
        for (const fps of [30, 60, 120]) {
            Object.assign(game.me, { x: trap.x + 40, y: trap.y - game.me.h, vx: 0, vy: 0, onGround: true, ground: trap });
            game.updatePlayer(1 / fps);
            assert.ok(game.dead > 0 && game.dead <= .18, `seed ${seed}: confirmed dead ends kill on the first frame at ${fps} FPS`);
            let elapsed = 1 / fps;
            while (game.dead > 0) { game.updatePlayer(1 / fps); elapsed += 1 / fps; }
            assert.ok(elapsed <= .25, 'no-way-out recovery completes within 250ms, including detection');
            assert.equal(game.me.x, game.cp.x); assert.equal(game.me.y, game.cp.y - game.me.h - 2);
        }
    }
}
console.log('Every generated surface leads back to the summit, and dead-end pits always respawn you.');
{
    // Landing on the street between towers respawns you almost immediately, even if you keep hopping around down there.
    const setup = () => {
        const game = makeGame(42);
        let jump = false;
        Object.assign(game.s, { game, t: 0, startedAt: Date.now(), axis: () => ({ x: 1, y: 0 }), down: (...k) => jump && k.includes('Space'), pressed: (...k) => jump && k.includes('Space'),
            spend: n => game.res.spend(n), toast() {}, sfx() {}, setGoal() {} });
        game.cp = game.checkpoints[0]; game.tideY = 1e6;
        return { game, setJump: v => { jump = v; } };
    };
    const street = makeGame(42).solids.find(p => p.ground);
    for (const fps of [30, 60, 120]) for (const hop of [false, true]) {
        const { game, setJump } = setup();
        const x = game.towers[3].x - 120;
        Object.assign(game.me, { x, y: street.y - game.me.h, vx: 0, vy: 0, onGround: true, ground: street });
        let frames = 0;
        for (; frames < 120 && game.dead <= 0; frames++) { setJump(hop && frames % 20 < 3); game.updatePlayer(1 / fps); }
        assert.ok(game.dead > 0, `street landing respawns you${hop ? ' while hopping' : ''}`);
        assert.equal(frames, 1, `street recovery starts on the first frame, even while hopping, at ${fps} FPS`);
        setJump(false);
        let elapsed = frames / fps;
        while (game.dead > 0) { game.updatePlayer(1 / fps); elapsed += 1 / fps; }
        assert.ok(elapsed <= .25, 'street recovery returns control within 250ms');
        assert.equal(game.me.x, game.cp.x); assert.equal(game.me.y, game.cp.y - game.me.h - 2);
    }
    const { game } = setup();
    Object.assign(game.me, { x: game.alleyEnd - 200, y: street.y - game.me.h, vx: 0, vy: 0, onGround: true, ground: street });
    for (let i = 0; i < 90 && game.dead <= 0; i++) game.updatePlayer(1 / 60);
    assert.equal(game.dead <= 0, true, 'the opening alley floor is not a death zone: its fire escape leads out');

    // Utility pole caps sag under your weight and spring back.
    const g = makeGame(42), pole = g.movers.find(m => m.cityKit === 'pole');
    assert.ok(pole && pole.sinker && g.solids.includes(pole), 'pole caps are sinking platforms');
    Object.assign(g.s, { game: g, t: 0, startedAt: Date.now(), axis: () => ({ x: 0, y: 0 }), down: () => false, pressed: () => false,
        spend: () => true, toast() {}, sfx() {}, setGoal() {} });
    g.trapChecks = false;
    Object.assign(g.me, { x: pole.x + 20, y: pole.y - g.me.h, vx: 0, vy: 0, onGround: true, ground: pole });
    for (let i = 0; i < Math.ceil(pole.depth / pole.sinkRate * 60) + 1; i++) g.update(1 / 60);
    assert.equal(pole.sunk, pole.depth, 'standing on a pole pushes it down');
    assert.ok(g.me.ground === pole && Math.abs(g.me.y + g.me.h - pole.y) < 1, 'you ride the pole down');
    Object.assign(g.me, { y: pole.y - 600, onGround: false, ground: null });
    pole.sunk = pole.depth;
    let n = 0; for (; n < Math.ceil(pole.depth / pole.riseRate * 60) + 1 && pole.sunk > 0; n++) { g.me.y = pole.y - 600; g.me.vy = 0; g.update(1 / 60); }
    assert.equal(pole.sunk, 0, 'poles rise back once you leave');
    for (const p of g.solids.filter(p => p.cityKit === 'scaffold')) assert.ok(p.frame[0] < p.x && p.frame[1] > p.x + p.w, 'scaffold decks sit within their frame ledger');
}
console.log('Street falls respawn quickly even while hopping, pole caps sink under weight, scaffold decks rest on ledgers.');
for (const map of maps) {
    for (const pole of map.cityPath.filter(p => p.cityKit === 'pole')) {
        const target = map.cityPath[map.cityPath.indexOf(pole) + 1];
        const resting = { ...pole, y: pole.by, mover: false };
        const sunk = { ...resting, y: pole.by + pole.depth };
        assert.equal(sunk.y - target.y, 220, 'a fully compressed cap leaves a 220-unit rise to the next part');
        assert.equal(pole.sinkRate, 220, 'pressure plates drop at the faster 220-unit-per-second rate');
        assert.ok(pole.depth / pole.sinkRate > .4, 'caps still allow a brief departure rather than dropping instantly');
        for (const fps of [30, 60, 120]) {
            const launch = p => ({ x: p.x + p.w - 26, y: p.y });
            const solids = [resting, target];
            assert.ok(reachable(launch(resting), target, solids, fps, false, undefined, null, 120, [null], [null]),
                `a quick departure from a raised cap needs only one jump at ${fps} FPS`);
            assert.equal(reachable(launch(sunk), target, [sunk, target], fps, false, undefined, null, 120, [null], [null]), false,
                `waiting until fully sunk puts the next part beyond a single jump at ${fps} FPS`);
            assert.ok(reachable(launch(sunk), target, [sunk, target], fps, false, undefined, null, 120, [.15, .25, .35, .45], [null]),
                `a double jump still reaches the next part from a fully sunk cap at ${fps} FPS`);
        }
    }
}
console.log('Every utility-pole transfer allows a quick single jump but requires a double jump after full compression at 30/60/120 FPS.');

for (const map of maps) {
    assert.ok(map.lasers.every(laser => laser.bi !== 0), 'city rooftops use physical obstacles, never lasers');
    assert.equal(map.cityRooftopRoutes.length, 1, 'the rooftop fixture route is a unique section');
    for (const loop of map.cityRooftopRoutes) {
        assert.equal(loop.pieces.length, 4);
        assert.ok(loop.pieces.every(p => p.cityKit !== 'scaffold' && map.solids.includes(p)), 'the giant rooftop scaffold is replaced by real rooftop fixtures');
        assert.equal(loop.pieces.map(p => p.prop || 'room').join(','), 'ac,tank,room,ac');
        assert.ok(loop.pieces.at(-1).y >= loop.roof.y - 350, 'the rooftop route stays at rooftop scale rather than becoming a scaffold tower');
        assert.ok(map.solids.includes(loop.roof), 'the original roof catches falls beneath the fixtures');
    }
    const loop = map.solids.filter(p => p.piece === 'service-loop' && p.motif === 'service-loop');
    assert.equal(loop.length, 9, 'the factory has a substantial reversing maintenance route');
    for (let row = 0; row < 3; row++) {
        const ledges = loop.slice(row * 3, row * 3 + 3), direction = ledges[0].routeDirection;
        assert.ok(ledges.every(p => p.oneway && p.routeDirection === direction));
        for (let i = 1; i < ledges.length; i++) assert.ok((ledges[i].x - ledges[i - 1].x) * direction > 0);
        if (row) assert.equal(direction, -loop[(row - 1) * 3].routeDirection);
    }
}
for (const fps of [30, 60, 120]) {
    const g = makeGame(42), s = g.s;
    Object.assign(s, { game: g, t: 0, startedAt: Date.now(), axis: () => ({ x: 0, y: 0 }), down: () => false, pressed: () => false,
        spend: n => g.res.spend(n), toast() {}, sfx() {}, setGoal() {} });
    g.cp = g.checkpoints[2];
    for (const field of ['spikes', 'saws', 'balls', 'debris', 'drills', 'lasers', 'springs', 'winds']) g[field] = [];
    const loop = g.cityRooftopRoutes[0], landing = loop.pieces[0], top = loop.pieces.at(-1);
    Object.assign(g.me, { x: landing.x + 30, y: top.y - g.me.h - 20, vx: 0, vy: 400, onGround: false, ground: null });
    let landed = false;
    for (let i = 0; i < fps * 4; i++) {
        g.updatePlayer(1 / fps);
        assert.equal(g.deaths, 0, `${fps} FPS: falling below an advanced checkpoint does not kill the player`);
        if (g.me.onGround) { landed = true; break; }
    }
    assert.ok(landed && g.me.ground === landing, `${fps} FPS: a lower switchback catches the fall`);
    assert.equal(g.cp, g.checkpoints[2], 'landing below a checkpoint never loses saved progress');

    g.solids = [];
    Object.assign(g.me, { x: 1000, y: -12000, vx: 0, vy: 1000, onGround: false, ground: null });
    for (let i = 0; i < fps * 3; i++) g.updatePlayer(1 / fps);
    assert.equal(g.deaths, 0, `${fps} FPS: free fall is not killed by a predicted lack of catches`);
    g.me.y = 1501; g.updatePlayer(1 / fps);
    assert.equal(g.deaths, 1, 'only leaving the world bottom triggers out-of-bounds recovery');
    g.dead = 0;
    const checkpoint = g.cp;
    g.returnToCheckpoint();
    assert.equal(g.dead, 0, 'manual checkpoint recovery is immediate');
    assert.equal(g.me.x, checkpoint.x);
    assert.equal(g.me.y, checkpoint.y - g.me.h - 2);
    for (let frame = 0; frame < Math.ceil(fps / 4); frame++) g.updatePlayer(1 / fps);
    assert.ok(g.dead <= 0 && Math.abs(g.me.y + g.me.h - checkpoint.y) < 100, 'manual recovery returns control at the saved checkpoint within 250ms');
    assert.equal(g.cp, checkpoint);
}
console.log('Reversing rooftop switchbacks, lower-route catches, saved checkpoint retention and unrestricted free fall passed at 30/60/120 FPS.');

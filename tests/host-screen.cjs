const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const noop = () => {};
const sandbox = {
    window: {}, document: { addEventListener: noop, getElementById: () => ({ textContent: '' }) },
    console, Math, Date, performance, Map, Set
};
vm.createContext(sandbox);
for (const file of ['communityGames.js', 'multiplayerEngine.js', 'multiplayerGames.js', 'multiplayerGames2.js', 'multiplayerGames3.js', 'chessGame.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
}
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
vm.runInContext(source.slice(source.indexOf('    class AppOrchestrator'), source.indexOf('    window.NexusApp ='))
    + '\nwindow.TestApp = AppOrchestrator;', sandbox);
const A = sandbox.window.StudBudArcade, P = A.Session.prototype;
const roster = () => new Map(['a', 'b'].map(id => [id, { id, nickname: id, score: 7 }]));
function spectator() {
    const s = Object.assign(Object.create(P), {
        spectator: true, isHost: true, user: { id: 'host' }, code: 'ABCDEF', mode: 'skyline',
        room: { host_id: 'host', state: { host_spectator: true } },
        roster: roster(), remotes: new Map(), readyPlayers: new Set(),
        score: 0, goal: 0, answered: 0, correct: 0, outbox: [], keys: new Set(), justPressed: new Set(),
        spectatorAuto: true, spectatorClock: 0, t: 10, countdown: 0, startedAt: 1000,
        game: { cam: { x: 0, y: 0 }, me: { x: 0, y: 0 }, net: () => ({ ex: {} }) },
        toast: noop, send: noop, sfx: noop
    });
    return s;
}
(async () => {
    {
        const s = spectator();
        const room = { host_id: 'host', state: { host_spectator: true, players: [
            { id: 'host', nickname: 'Host', score: 999 }, { id: 'a', nickname: 'Alice', score: 7 }
        ] } };
        s.remotes.set('host', {});
        s.updateRoster(room);
        assert.equal(s.roster.has('host'), false, 'spectator host cannot leak into a stale roster or leaderboard');
        assert.equal(s.remotes.has('host'), false, 'spectator host cannot remain a combat target');
        assert.equal(s.standings().length, 1);
        s.addScore(100); s.setGoal(100);
        assert.equal(s.score, 0); assert.equal(s.goal, 0);
        let reported = false;
        s.api = { reportScore: () => { reported = true; } };
        await s.reportScore(true);
        assert.equal(reported, false, 'host does not report score/answers or earn rewards');
        assert.equal(s.ask(noop), false, 'host cannot open resource questions');
        s.keys.add('KeyD'); s.justPressed.add('KeyQ');
        assert.equal(s.axis().x, 0); assert.equal(s.down('KeyD'), false); assert.equal(s.pressed('KeyQ'), false);
    }
    {
        const s = spectator(), sent = [];
        s.game.net = () => ({ x: 99, y: 55, ex: { td: { serial: 8 } } });
        s.outbox = [{ k: 'damage', to: 'a' }, { k: 'td-error', to: 'a' }];
        s.send = packet => sent.push(packet);
        s.sendState();
        assert.equal(sent[0].spectator, true);
        assert.equal(sent[0].x, undefined, 'authority packets are not physical player packets');
        assert.equal(sent[0].s, undefined, 'authority broadcasts have no host score');
        assert.equal(sent[0].ex.td.serial, 8, 'nonplaying Defense host still broadcasts battle state');
        assert.equal(sent[0].ev.length, 1, 'authority errors propagate but player combat events do not');
        const guest = spectator();
        guest.isHost = false; guest.spectator = false; guest.user = { id: 'a' };
        let authority = 0, receivedError = 0;
        guest.game.onState = (ex, from) => { authority++; assert.equal(from.id, 'host'); assert.equal(ex.td.serial, 8); };
        guest.game.onEvent = () => receivedError++;
        guest.receive(sent[0]);
        assert.equal(authority, 1); assert.equal(receivedError, 1);
        assert.equal(guest.remotes.has('host'), false, 'clients process host authority without spawning an avatar');
        guest.receive({ ...sent[0], id: 'outsider' });
        assert.equal(authority, 1, 'unrostered nonhosts cannot send authority state');
    }
    {
        const s = spectator();
        s.remotes.set('a', { x: 100, y: 200 });
        s.remotes.set('b', { x: 300, y: 400 });
        s.updateSpectator(.1);
        assert.equal(s.spectatorId, 'a'); assert.ok(s.game.cam.x > 0);
        s.updateSpectator(8);
        assert.equal(s.spectatorId, 'b', 'automatic rotation advances every eight seconds');
        s.spectatorAuto = false;
        s.updateSpectator(20); assert.equal(s.spectatorId, 'b', 'manual mode does not rotate');
        s.nextSpectator(); assert.equal(s.spectatorId, 'a');
        s.roster.delete('a'); s.updateSpectator(.1);
        assert.equal(s.spectatorId, 'b', 'departed watched players fall back to a remaining seat');
        s.roster.clear(); s.updateSpectator(.1); assert.equal(s.spectatorId, null);
        s.connected = true; s.cardsReady = true; s.startedAt = Date.now() - 60000;
        assert.equal(s.syncStart(), true); assert.equal(s.countdown, 0, 'reconnecting host does not restart the countdown');
    }
    {
        const s = spectator();
        s.game.race = true; s.game.scoreGoal = false;
        s.room.goal_type = 'points'; s.deadline = Infinity;
        s.remotes = new Map(['a', 'b'].map(id => [id, { done: true, goal: 100 }]));
        let ended = 0; s.hostEnd = () => ended++;
        s.checkEnd();
        assert.equal(ended, 1, 'all actual finishers end a race without waiting for the spectator host');
        s.remotes.get('b').done = false; s.firstDone = 0; ended = 0; s.checkEnd();
        assert.equal(ended, 0, 'unfinished participants are still respected');
        const guest = spectator(); guest.isHost = false; guest.finish = () => assert.fail('guest ended room');
        P.hostEnd.call(guest);
    }
    {
        let saved = 0;
        const s = spectator();
        s.mode = 'defense'; s.seed = 42; s.local = { id: 'host', color: '#fff' }; s.mouse = {};
        s.room.state.defense_teams = { a: 0, b: 1 }; s.rewardAmount = () => 20;
        s.api = { saveDefenseState: async () => { saved++; } };
        s.game = new A.games.defense(s);
        const g = s.game;
        assert.equal(g.authority, true);
        assert.equal(Object.hasOwn(g.teams, 'host'), false, 'no phantom team slot for nonplaying host');
        assert.equal(Object.hasOwn(g.wallets, 'host'), false, 'no phantom personal wallet');
        assert.equal(g.troopLimitFor('a'), 40, 'host does not reduce another player tower allowance');
        const snapshot = g.snapshot();
        g.applySnapshot(snapshot);
        assert.equal(g.receivedSerial, snapshot.serial, 'spectator host can restore persisted battle without a team');
        const timer = g.waveTimer;
        g.updateSpectator(1);
        assert.ok(g.waveTimer < timer, 'spectator host continues authoritative waves');
        g.updateSpectator(4); await g.persistPromise;
        assert.equal(saved, 1, 'spectator host persists battle state');
        assert.equal(s.score, 0, 'simulation does not grant host a team score');
        const cash = g.cashFor('a');
        g.command({ k: 'td-order', action: 'answer', seq: 1 }, 'host');
        assert.equal(g.cashFor('a'), cash, 'host cannot issue player orders without a team');
    }
    {
        const api = sandbox.window.StudBudCommunityGames, calls = [];
        api.gameClient = async () => ({ rpc: async (name, args) => { calls.push([name, args]); return { data: { ok: true } }; } });
        assert.equal((await api.setHostMode('ABCDEF', true)).ok, true);
        assert.equal(calls[0][0], 'studbud_set_host_mode'); assert.equal(calls[0][1].p_spectator, true);
        api.gameClient = async () => ({ rpc: async () => ({ error: { message: 'function missing' } }) });
        await assert.rejects(() => api.setHostMode('ABCDEF', true), /database setup SQL/);
    }
    {
        const app = Object.create(sandbox.window.TestApp.prototype);
        const room = { room_code: 'ABCDEF', host_id: 'host', state: {} };
        app.hostedGameRoom = room; app.gameUser = () => ({ id: 'host' });
        let destroyed = 0, rendered = 0, errors = 0;
        app.arcadeSession = { paused: false, reportScore: async () => {}, game: { persist: noop },
            toast: () => errors++ };
        app.destroyArcadeSession = () => { destroyed++; app.arcadeSession.destroyed = true; };
        app.renderHostedGameRoom = () => rendered++;
        sandbox.window.StudBudCommunityGames.setHostMode = async () => { throw new Error('Seats full'); };
        await app.toggleHostedHostMode();
        assert.equal(app.arcadeSession.paused, false); assert.equal(destroyed, 0);
        assert.equal(app.hostedGameRoom, room, 'RPC failure leaves playing identity and room intact');
        assert.equal(errors, 1); assert.equal(app.hostRoleBusy, false);
        sandbox.window.StudBudCommunityGames.setHostMode = async () => ({ ...room, state: { host_spectator: true } });
        await app.toggleHostedHostMode();
        assert.equal(destroyed, 1); assert.equal(rendered, 1);
        assert.equal(app.hostedGameRoom.state.host_spectator, true);
        app.gameUser = () => ({ id: 'guest' });
        await app.toggleHostedHostMode(); assert.equal(destroyed, 1, 'only the room host gets role controls');
    }
    {
        const ctx = new Proxy({
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            measureText: () => ({ width: 80 })
        }, { get: (target, key) => target[key] || noop });
        sandbox.document.createElement = () => ({ getContext: () => ctx });
        const buildChess = A.games.chess.prototype.buildBoard;
        A.games.chess.prototype.buildBoard = noop;
        try {
            for (const [mode, Game] of Object.entries(A.games)) {
                const s = spectator();
                Object.assign(s, {
                    mode, seed: 42, local: { id: 'host', color: '#60a5fa', cos: {} },
                    mouse: { x: 0, y: 0, active: false }, scale: 1, vw: 1366, vh: 768,
                    graphics: { low: true }, canvas: { style: {} },
                    overlay: { classList: { contains: () => false }, querySelector: () => ({ style: {} }) },
                    placeHud: () => { ctx.save(); return { x: 0, y: 0, scale: 1 }; },
                    rewardAmount: () => 20, api: {}, cards: []
                });
                s.game = new Game(s);
                if (mode === 'chess') {
                    let saved = 0;
                    sandbox.window.FlashcardTools = { answerKey: value => String(value).toLowerCase() };
                    s.cards = [{ front: 'One plus one', back: '2' }];
                    s.api.saveChessState = async () => { saved++; };
                    s.game.handleRequest({ kind: 'answer', cardIndex: 0, answer: '2', seq: 1 }, 'a');
                    await s.game.persistPromise;
                    assert.equal(s.game.state.credits[0], 1, 'spectator host processes participant chess answer requests');
                    assert.equal(saved, 1, 'spectator host persists the authoritative chess board');
                    assert.equal(s.game.side, -1, 'authority does not occupy either chess seat');
                }
                s.remotes.set('a', { id: 'a', name: 'Alice', x: 200, y: 200, tx: 200, ty: 200, cos: {}, color: '#fff', ex: {} });
                s.updateSpectator(.1);
                if (['crypto', 'frenzy', 'fishing'].includes(mode)) s.drawSpectatorSummary(ctx, 1366, 768);
                else if (mode !== 'chess') s.game.draw(ctx, 1366, 768);
                assert.equal(s.roster.has('host'), false, `${mode}: host remains outside participant roster after rendering`);
                assert.equal(s.score, 0, `${mode}: watching never awards a host score`);
            }
        } finally { A.games.chess.prototype.buildBoard = buildChess; }
    }
    {
        const sql = fs.readFileSync(path.join(root, 'supabase-setup.sql'), 'utf8');
        const rpc = sql.slice(sql.indexOf('create or replace function public.studbud_set_host_mode'), sql.indexOf('drop function if exists public.studbud_submit_game_answer'));
        assert.match(rpc, /host_id is distinct from auth\.uid\(\)/);
        assert.match(rpc, /where player ->> 'id' <> auth\.uid\(\)::text/);
        assert.match(rpc, /defense_teams.*auth\.uid\(\)::text/);
        assert.match(rpc, /v_room\.mode = 'chess' and v_room\.status <> 'waiting'/);
        assert.match(rpc, /player seats are full/);
        assert.match(rpc, /revoke all on function public\.studbud_set_host_mode\(text, boolean\) from public, anon/);
        const rewards = sql.slice(sql.indexOf('create or replace function public.studbud_pay_game_rewards'), sql.indexOf('create or replace function public.studbud_game_make_question'));
        assert.match(rewards, /for v_player in[\s\S]*?jsonb_array_elements\(v_room\.state -> 'players'\)/,
            'rewards enumerate participating players, not saved host_player');
        assert.doesNotMatch(rewards, /host_player/);
        assert.match(sql, /'host_spectator', coalesce\(\(v_room\.state ->> 'host_spectator'\)/,
            'starting room preserves persisted host role');
        assert.match(sql, /Only participating players can answer/);
        assert.match(sql, /v_room\.host_id = v_user_id and coalesce\(\(v_room\.state ->> 'host_spectator'\)[\s\S]*?return public\.studbud_game_room_view\(v_room\)/,
            'same-account reconnect restores host view rather than adding a duplicate player');
        assert.match(source, /step\.goal === 'assignment'[\s\S]*?menu\.open = true[\s\S]*?this\.tutorialSel = step\.sel/);
    }
    console.log('Host role authority, score/reward/target filtering, camera rotation, race completion, Defense simulation/persistence, reconnect, RPC failure and SQL contracts passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

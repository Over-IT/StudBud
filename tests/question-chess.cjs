const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
class Element {
    constructor() { this.children = []; this.dataset = {}; this.textContent = ''; this.attributes = {}; this.style = {}; this.classList = { toggle() {}, add() {}, remove() {} }; }
    set innerHTML(value) {
        this.html = value;
        if (value.includes('data-square=')) this.squares = [...value.matchAll(/data-square="(\d+)"/g)].map(match => {
            const square = new Element(); square.dataset.square = match[1]; return square;
        });
    }
    get innerHTML() { return this.html || ''; }
    querySelector(selector) { return this.nodes?.[selector] || (this.nodes ||= {}, this.nodes[selector] = new Element()); }
    querySelectorAll() { return this.squares || []; }
    setAttribute(key, value) { this.attributes[key] = value; }
    appendChild(node) { this.children.push(node); }
    addEventListener() {}
    closest() { return this.dataset.square === undefined ? null : this; }
    contains(node) { return (this.squares || []).includes(node); }
    remove() { this.removed = true; }
}
const saved = [];
const sandbox = {
    console, Date, Math, Map, Set, performance,
    document: { getElementById: () => null, addEventListener() {}, createElement: () => new Element() },
    window: {}
};
vm.createContext(sandbox);
for (const file of ['flashcardEngine.js', 'multiplayerEngine.js', 'chessGame.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
}
const A = sandbox.window.StudBudArcade, rules = A.ChessRules;
const board = rules.initial();
assert.equal(board.length, 64);
assert.equal(rules.material(board, 0), 39);
assert.equal(rules.material(board, 1), 39);
assert.ok(rules.legal(board, 52, 36, 0), 'white pawn initial double move');
assert.ok(rules.legal(board, 12, 28, 1), 'black pawn initial double move');
assert.ok(!rules.legal(board, 52, 28, 0), 'pawn cannot move three squares');
assert.ok(!rules.legal(board, 12, 28, 0), 'cannot move the opponent piece');
assert.ok(!rules.legal(board, 56, 40, 0), 'rook cannot jump a pawn');
assert.ok(rules.legal(board, 57, 42, 0), 'knight can jump pieces');
assert.ok(!rules.legal(board, 57, 47, 0), 'knight cannot wrap around edges');
assert.ok(!rules.legal(board, 60, 62, 0), 'castling excluded from the real-time variant');
assert.ok(!rules.legal(board, -1, 0, 0));
assert.ok(!rules.legal(board, 0, 64, 1));
const sparse = (...pieces) => {
    const cells = Array(64).fill('.');
    for (const [at, piece] of pieces) cells[at] = piece;
    return cells.join('');
};
assert.ok(rules.legal(sparse([35, 'B']), 35, 8, 0));
assert.ok(!rules.legal(sparse([35, 'B'], [26, 'p']), 35, 8, 0), 'bishop paths block');
assert.ok(rules.legal(sparse([35, 'Q']), 35, 3, 0));
assert.ok(rules.legal(sparse([35, 'R']), 35, 39, 0));
assert.ok(!rules.legal(sparse([35, 'R']), 35, 28, 0));
assert.ok(rules.legal(sparse([35, 'K']), 35, 26, 0));
assert.ok(!rules.legal(sparse([35, 'K']), 35, 17, 0));
assert.ok(rules.legal(sparse([28, 'P'], [19, 'p']), 28, 19, 0), 'pawn diagonal capture');
assert.ok(!rules.legal(sparse([28, 'P']), 28, 19, 0), 'pawn cannot capture empty squares');
assert.ok(!rules.legal(sparse([28, 'P'], [20, 'p']), 28, 20, 0), 'pawn cannot capture forward');
assert.ok(!rules.legal(sparse([12, 'R'], [4, 'k'], [0, 'p']), 12, 4, 0), 'a pawn protects its king from capture');
assert.ok(!rules.legal(sparse([12, 'R'], [4, 'k'], [0, 'q']), 12, 4, 0), 'every opposing nonking piece must be removed');
assert.ok(rules.legal(sparse([12, 'R'], [4, 'k']), 12, 4, 0), 'only a lone king is capturable');
assert.equal(rules.move(sparse([8, 'P']), 8, 0, 0).board[0], 'Q', 'white promotion');
assert.equal(rules.move(sparse([55, 'p']), 55, 63, 1).board[63], 'q', 'black promotion');

function make(userId, practice = false, chess) {
    const session = {
        mode: 'chess', preview: false, practice, isHost: userId === 'host', user: { id: userId },
        room: { host_id: 'host', state: { chess } }, code: 'ABCDEF', score: 0,
        roster: new Map([['host', {}], ['guest', {}]]), remotes: new Map([['host', {}], ['guest', {}]]),
        overlay: new Element(), cards: [{ front: '1 + 1', back: '2' }, { front: '1 + 2', back: '3' }],
        questionHistory: [], countdown: 0, over: false, paused: false,
        setGoal(value) { this.goal = value; }, pressed: () => false, sendState() {}, toast(message) { this.message = message; },
        api: { saveChessState: async (code, state) => saved.push(state) },
        ask(callback) { this.answer = callback; return true; }
    };
    session.game = new A.games.chess(session);
    return session;
}
const host = make('host'), guest = make('guest');
const transmit = (from, to) => to.game.onState(JSON.parse(JSON.stringify(from.game.net().ex)), { id: from.user.id });
host.game.request({ kind: 'move', from: 52, to: 36, revision: 0 });
assert.equal(host.game.state.board, board, 'cannot move without an earned credit');
host.game.recharge();
host.lastCardIndex = 0; host.questionHistory.push({ chosen: '2' }); host.answer(true);
assert.equal(host.game.state.credits[0], 1);
const serial = host.game.state.serial;
host.game.recharge();
assert.equal(host.game.state.serial, serial, 'cannot bank multiple unanswered moves');
guest.game.recharge();
guest.lastCardIndex = 1; guest.questionHistory.push({ chosen: '3' }); guest.answer(true);
const pendingAnswer = JSON.parse(JSON.stringify(guest.game.net().ex));
transmit(guest, host);
host.game.onState(pendingAnswer, { id: 'guest' });
assert.equal(host.game.state.credits[1], 1, 'retransmitted answer earns one credit only');
transmit(host, guest);
assert.equal(guest.game.pending, null, 'host acknowledgement clears pending answer');
guest.game.selectSquare(12);
guest.game.selectSquare(28);
host.game.selectSquare(52);
host.game.selectSquare(36);
const staleMove = JSON.parse(JSON.stringify(guest.game.net().ex));
host.game.onState(staleMove, { id: 'guest' });
assert.equal(host.game.state.credits[1], 1, 'stale simultaneous move retains its credit');
assert.equal(host.game.state.revision, 1);
transmit(host, guest);
assert.ok(guest.message.includes('board changed'));
guest.game.selectSquare(12); guest.game.selectSquare(28);
transmit(guest, host); transmit(host, guest);
assert.equal(host.game.state.revision, 2);
assert.equal(guest.game.state.board, host.game.state.board);
assert.equal(host.game.state.credits[1], 0);
const old = { ...JSON.parse(JSON.stringify(host.game.state)), serial: 0, board };
guest.game.onState({ chess: old }, { id: 'host' });
assert.equal(guest.game.state.revision, 2, 'old snapshots cannot roll back moves');
guest.game.onState({ chess: old }, { id: 'stranger' });
assert.equal(guest.game.state.revision, 2, 'only the host supplies the board');
host.game.onState({ chessRequest: { kind: 'answer', seq: 1, cardIndex: 0, answer: '2' } }, { id: 'stranger' });
assert.equal(host.game.state.revision, 2, 'nonplayers cannot request actions');
const restored = make('host', false, JSON.parse(JSON.stringify(host.game.state)));
assert.equal(restored.game.state.board, host.game.state.board);
assert.deepEqual([...restored.game.state.credits], [...host.game.state.credits]);
host.game.state.board = sparse([60, 'K'], [4, 'k'], [12, 'R']);
host.game.state.credits[0] = 1;
host.game.request({ kind: 'move', from: 12, to: 4, revision: host.game.state.revision });
transmit(host, guest);
assert.equal(host.game.state.winner, 0);
assert.equal(host.game.finished, true);
assert.equal(host.goal, 0, 'king capture awards no material points');
assert.equal(guest.goal, 0);
assert.ok(host.game.rankMetric({ id: 'host', g: 0 }) > host.game.rankMetric({ id: 'guest', g: 90 }), 'the king-capture winner ranks first regardless of material');
const winnerBoard = host.game.state.board;
host.game.request({ kind: 'move', from: 4, to: 12, revision: host.game.state.revision });
assert.equal(host.game.state.board, winnerBoard, 'no moves after king capture');
let ended = 0;
A.Session.prototype.checkEnd.call({ practice: false, game: host.game, isHost: true, countdown: 0,
    room: { goal_type: 'time' }, deadline: Infinity, standings: () => [], hostEnd: () => ended++ });
assert.equal(ended, 1, 'king capture ends a time-limited match immediately');
const solo = make('host', true);
assert.equal(solo.goal, 0, 'captured material starts at zero');
solo.game.update(6);
assert.equal(solo.game.state.revision, 1, 'solo opponent can play a legal move');
assert.equal(solo.game.state.credits[0], 0, 'solo opponent does not grant human moves');
for (const [piece, points] of [['p', 1], ['n', 3], ['b', 3], ['r', 5], ['q', 9]]) {
    const capture = make('host', true);
    capture.game.state.board = sparse([60, 'K'], [4, 'k'], [24, 'R'], [16, piece]);
    capture.game.state.credits[0] = 1;
    capture.game.request({ kind: 'move', from: 24, to: 16, revision: 0 });
    assert.equal(capture.goal, points, `captured ${piece} has the standard value`);
    assert.equal(capture.game.state.winner, -1, 'capturing the last ordinary piece does not end the game');
}
const dragged = make('host', true), dragGame = dragged.game;
dragGame.state.credits[0] = 1;
const dragEvent = { target: dragGame.squares.find(square => square.dataset.square === '52'), button: 0, pointerId: 7, clientX: 100, clientY: 100, preventDefault() {} };
dragGame.startDrag(dragEvent);
dragGame.moveDrag({ ...dragEvent, clientY: 180 });
sandbox.document.elementFromPoint = () => dragGame.squares.find(square => square.dataset.square === '36');
dragGame.endDrag({ ...dragEvent, clientY: 180 });
assert.equal(dragGame.state.board[36], 'P', 'dragging submits the same validated move as tapping');
assert.equal(dragGame.state.credits[0], 0);
assert.equal(dragGame.ghost, null);
dragGame.state.credits[0] = 1;
dragGame.startDrag({ ...dragEvent, target: dragGame.squares.find(square => square.dataset.square === '36') });
dragGame.moveDrag({ ...dragEvent, clientY: 180 });
dragGame.cancelDrag();
assert.equal(dragGame.state.credits[0], 1, 'pointer cancellation never spends a move');
assert.equal(dragGame.drag, null);
assert.equal(saved.length > 0, true, 'host snapshots are persisted');
assert.ok(saved.every(rules.validState), 'all persisted snapshots have the expected shape');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase-setup.sql'), 'utf8');
assert.match(sql, /v_room.mode = 'chess' and jsonb_array_length\(v_players\) >= 2/);
assert.match(sql, /v_room.host_id is distinct from auth.uid\(\) or v_room.mode <> 'chess'/);
assert.match(sql, /v_serial <= coalesce/);
assert.match(sql, /'public_deck_id', v_room.state -> 'public_deck_id'/);
assert.match(sql, /'source_deck_id', v_room.state -> 'source_deck_id'/);
assert.match(sql, /v_goal_type := 'points'; v_time_limit := 0; v_reward := 1/);
assert.match(sql, /set expires_at = 'infinity'::timestamptz/);
assert.match(sql, /status = case when mode = 'chess' and status = 'playing' and jsonb_array_length\(v_players\) < jsonb_array_length\(v_room.state -> 'players'\) then 'finished'/);
assert.ok((sql.match(/expires_at = case when mode = 'chess'/g) || []).length >= 3, 'king-capture, host-leave and guest-leave endings restore cleanup expiry');
const engineSource = fs.readFileSync(path.join(__dirname, '..', 'multiplayerEngine.js'), 'utf8');
assert.match(engineSource, /this.deadline = this.mode === 'chess' \? Infinity/);
assert.match(engineSource, /if \(this.mode === 'chess'\) this.reward = 1/);
console.log('Chess movement, promotion, answer-earned moves, 1v1 limits, host authority, simultaneous/stale moves, retry deduplication, reconnect snapshots, solo opponent and king-capture ending passed.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const nodes = new Map();
const element = () => ({ textContent: '', disabled: false, children: [], listeners: {},
    classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, focus() {},
    replaceChildren() { this.children = []; }, appendChild(child) { this.children.push(child); },
    addEventListener(name, handler) { this.listeners[name] = handler; } });
for (const id of ['join-form', 'join-entry', 'join-lobby', 'join-leave', 'join-status', 'join-room-title', 'join-room-state', 'join-room-code', 'join-players']) nodes.set(id, element());
const form = nodes.get('join-form'), submit = element();
form.elements = { roomCode: { value: 'abc234', focus() {} }, nickname: { value: 'Guest' } };
form.querySelector = () => submit;
form.reportValidity = () => true;
let joins = 0, sessions = 0, leaves = 0, polls = 0, destroyed = 0, fail = false, failLeave = false;
let room = { room_code: 'ABC234', mode: 'miner', status: 'waiting', deck_title: 'Biology', state: { players: [{ id: 'guest', nickname: '<img src=x>' }] } };
const window = {
    navigator: { onLine: true }, addEventListener() {}, setInterval() { polls++; return polls; }, clearInterval() {},
    StudBudCloud: { guestUser: { id: 'guest' }, async prepareGuestSession() { if (fail) throw new Error('Anonymous sign-ins disabled'); } },
    StudBudCommunityGames: {
        async joinRoom(code, nickname) { joins++; assert.equal(code, 'ABC234'); assert.equal(nickname, 'Guest'); return room; },
        watchRoom() { return () => {}; }, async getRoom() { return room; },
        async leaveRoom() { leaves++; if (failLeave) throw new Error('Offline'); }
    },
    StudBudDialogs: { notify() {} },
    StudBudArcade: { games: { miner: true }, Session: class {
        constructor(options) { sessions++; assert.equal(options.user.id, 'guest'); assert.equal(options.isHost, false); }
        updateRoom() {} destroy() { destroyed++; }
    } }
};
const sandbox = { window, document: { getElementById: id => nodes.get(id), createElement: element, body: element(), addEventListener() {} }, console: { error() {}, warn() {} } };
vm.createContext(sandbox);
vm.runInContext(source('join.js'), sandbox);
const join = () => form.listeners.submit({ preventDefault() {} });
(async () => {
    form.elements.roomCode.value = 'bad';
    await join();
    assert.equal(joins, 0);
    assert.match(nodes.get('join-status').textContent, /valid 6-character/);
    form.elements.roomCode.value = 'abc234';
    fail = true;
    await join();
    assert.match(nodes.get('join-status').textContent, /Anonymous sign-ins disabled/);
    assert.equal(submit.disabled, false);
    assert.equal(form.elements.nickname.value, 'Guest');
    fail = false;
    await join();
    assert.equal(joins, 1);
    assert.equal(polls, 1);
    assert.equal(nodes.get('join-players').children[0].textContent, '<img src=x> (you)', 'names are text, never HTML');
    await join();
    assert.equal(joins, 1, 'duplicate submit cannot create another room connection');
    failLeave = true;
    await nodes.get('join-leave').listeners.click();
    assert.match(nodes.get('join-status').textContent, /Offline/);
    assert.equal(nodes.get('join-leave').disabled, false);
    failLeave = false;
    await nodes.get('join-leave').listeners.click();
    assert.equal(leaves, 2);
    room = { ...room, status: 'playing' };
    await join();
    assert.equal(sessions, 1, 'live games use the existing multiplayer engine');
    await nodes.get('join-leave').listeners.click();
    assert.equal(destroyed, 1);
    assert.ok(!source('join/index.html').includes('src="../app.js"'), 'public joining never boots private account data');
    assert.match(source('index.html'), /id="guest-join"[^>]*href="join\/"/);
    assert.match(source('index.html'), /id="guest-join"[^>]*>[\s\S]*?Join with a code/);
    assert.equal((source('index.html').match(/id="guest-join"/g) || []).length, 1);
    assert.match(source('index.html'), /<div class="auth-card">/);
    assert.doesNotMatch(source('index.html'), /class="glass-card auth-card"/, 'sign-in is a full-page layout, not a floating card');
    assert.match(source('styles.css'), /\.auth-card\s*\{[^}]*min-height:\s*100dvh/s);
    assert.match(source('index.html'), /id="join-game-form"/, 'in-app joining remains available');
    assert.match(source('join/index.html'), /data-color-scheme="studbud"/, 'the standalone page uses the normal StudBud palette');
    assert.doesNotMatch(source('index.html'), /id="automatic-study-indicator"|id="current-term-badge"/);
    console.log('Public join validation, error recovery, guest identity, lobby, live session and leave passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

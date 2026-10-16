const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let pathCount = 0;
const arcade = { BaseGame: class { constructor(session) { this.s = session; } }, games: {} };
const sandbox = { window: { StudBudArcade: arcade }, Path2D: class { constructor(d) { this.d = d; pathCount++; } } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'chessGame.js'), 'utf8'), sandbox);
const game = new arcade.games.chess({
    preview: true, user: { id: 'white' }, roster: new Map([['white', {}], ['black', {}]]),
    room: { state: {} }, setGoal() {}, remotes: new Map()
});
const pieces = [], squares = [];
const ctx = {
    createLinearGradient() { return { addColorStop() {} }; },
    fillRect() { squares.push(this.fillStyle); },
    save() { pieces.push({ paths: [], fill: '' }); }, restore() {}, translate() {}, scale() {}, stroke() {},
    fill(shape) { pieces.at(-1).paths.push(shape.d); pieces.at(-1).fill = this.fillStyle; }
};
game.draw(ctx, 320, 200);
assert.equal(pieces.length, 32);
assert.ok(squares.includes('#779556') && squares.includes('#ebecd0'));
for (let index = 0; index < 16; index++) {
    assert.equal(pieces[index].fill, '#454943');
    assert.equal(pieces[index + 16].fill, '#f8f4e7');
}
for (let index = 0; index < 8; index++) {
    assert.deepEqual(pieces[index].paths, pieces[index + 24].paths, 'opposite-color back ranks share identical geometry');
    assert.deepEqual(pieces[index + 8].paths, pieces[index + 16].paths, 'opposite-color pawns share identical geometry');
}
const initialPathCount = pathCount;
game.draw(ctx, 320, 200);
assert.equal(pathCount, initialPathCount, 'preview geometry is cached between draws');
console.log('Chess matching vector geometry, preview palette, font-free rendering and path caching passed.');

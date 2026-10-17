const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.handlers = {}; this.classList = { contains: () => true }; }
    append(...elements) { this.children.push(...elements); }
    get firstElementChild() { return this.children[0]; }
    setAttribute() {}
    addEventListener(name, handler) { this.handlers[name] = handler; }
    focus() { this.focused = true; }
    showModal() { this.open = true; }
    close(value = '') { this.returnValue = value; this.handlers.close(); }
    remove() { this.removed = true; }
}
const body = new Element('body'), previous = new Element('input');
previous.isConnected = true;
const sandbox = { window: {}, document: { body, activeElement: previous, createElement: tag => new Element(tag), getElementById: id => body.children.find(node => node.id === id) } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'appDialogs.js'), 'utf8'), sandbox);
const dialogs = sandbox.window.StudBudDialogs;
async function run() {
    const first = dialogs.confirm('Delete <task>?');
    const second = dialogs.confirm('Delete another?');
    await Promise.resolve();
    assert.equal(body.children.length, 1, 'confirmation requests are queued');
    let dialog = body.children[0];
    assert.equal(dialog.children[0].children[1].textContent, 'Delete <task>?', 'messages are rendered as text');
    assert.ok(dialog.children[0].children.at(-1).children[0].focused, 'cancel receives default focus');
    dialog.close();
    assert.equal(await first, false, 'Escape/dismiss never confirms deletion');
    assert.ok(previous.focused, 'focus returns to the editor');
    await Promise.resolve();
    dialog = body.children.at(-1);
    dialog.close('confirm');
    assert.equal(await second, true);
    const prompt = dialogs.prompt('Reason?', 'Default');
    await Promise.resolve();
    dialog = body.children.at(-1);
    dialog.children[0].children[2].value = 'Updated';
    dialog.close('confirm');
    assert.equal(await prompt, 'Updated');
    const cancelled = dialogs.prompt('Reason?');
    await Promise.resolve(); body.children.at(-1).close();
    assert.equal(await cancelled, null);
    dialogs.notify('Saved');
    const notice = body.children.at(-1);
    assert.equal(notice.firstElementChild.textContent, 'Saved');
    notice.children[1].handlers.click();
    assert.equal(notice.hidden, true);
    for (const file of ['app.js', 'cloudSync.js', 'classrooms.js', 'plannerEngine.js', 'flashcardEngine.js', 'infiniteCampusImport.js']) {
        const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        assert.doesNotMatch(source, /(?:window\.)?(?<![.\w])(?:alert|confirm|prompt)\(/, `${file} must not invoke native browser popups`);
    }
    console.log('In-app confirmation queue, cancellation, focus restoration, text requests, notices and native-popup removal passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

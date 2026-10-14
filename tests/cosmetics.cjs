const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const commands = [];
const noop = () => {};
const ctx = new Proxy({
    globalAlpha: 1,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop })
}, { get: (target, key) => key in target ? target[key] : (...args) => commands.push([key, ...args]) });
const makeCanvas = dataset => ({
    width: 240, height: 240, dataset, isConnected: true,
    getContext: () => ctx, toDataURL: () => 'data:image/png;base64,fixture'
});
let mutation, intersection;
const tracked = new Set(), frames = new Map(), handlers = new Map(), elements = new Map();
let nextFrame = 0;
const motion = { matches: false, addEventListener: (event, handler) => handlers.set('motion', handler) };
const document = {
    body: {}, hidden: false,
    addEventListener: (event, handler) => handlers.set(event, handler),
    createElement: () => makeCanvas({}),
    querySelectorAll: () => [...tracked],
    getElementById: id => elements.get(id)
};
const sandbox = {
    console, document, Math, Date, Set, Map,
    window: { addEventListener() {}, matchMedia: () => motion },
    requestAnimationFrame: cb => { frames.set(++nextFrame, cb); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
    MutationObserver: class {
        constructor(cb) { mutation = cb; }
        observe() {}
    },
    IntersectionObserver: class {
        constructor(cb) { intersection = cb; }
        observe() {}
        unobserve(target) { tracked.delete(target); }
    }
};
vm.createContext(sandbox);
for (const file of ['communityGames.js', 'multiplayerEngine.js']) vm.runInContext(source(file), sandbox);
const util = sandbox.window.StudBudArcade.util;
const catalog = sandbox.window.StudBudCommunityGames.catalog;
for (const item of catalog.filter(item => item.type !== 'pet')) {
    assert.ok(typeof item.description === 'string' && item.description.trim().length >= 15,
        `${item.id} has a useful shop description`);
}
assert.equal(util.animatedCosmetics({ cos: { skin: 'skin_celestial' } }), true);
assert.equal(util.animatedCosmetics({ cos: { acc: 'acc_jetpack' } }), true);
assert.equal(util.animatedCosmetics({ cos: { effect: 'acc_storm_effect' } }), true);
assert.equal(util.animatedCosmetics({ cos: { hat: 'hat_cosmic' } }), true);
assert.equal(util.animatedCosmetics({ cos: { hat: 'hat_fedora', acc: 'acc_shades' } }), false);
assert.deepEqual({ ...util.playerCosmetics({ equipped_accessory: 'acc_shades', equipped_effect: 'acc_storm_effect' }) },
    { skin: '', hat: '', acc: 'acc_shades', effect: 'acc_storm_effect', color: '#34d399' });
assert.deepEqual({ ...util.playerCosmetics({ equipped_accessory: 'acc_storm_effect' }) },
    { skin: '', hat: '', acc: '', effect: 'acc_storm_effect', color: '#34d399' }, 'legacy equipped auras remain visible');
assert.equal(util.playerCosmetics({ cos: { color: '#123456' } }).color, '#123456');
assert.equal(util.playerCosmetics({ equipped_palette: 'palette_ocean' }).color, '#38bdf8');
assert.match(util.avatarMarkup({ cos: { hat: 'hat_fedora' } }), /^<img /);
assert.match(util.avatarMarkup({ cos: { acc: 'acc_storm_effect' } }), /^<canvas .*data-avatar/);
assert.match(util.avatarMarkup({ cos: { acc: 'acc_shades', effect: 'acc_storm_effect' } }), /data-acc="acc_shades" data-effect="acc_storm_effect"/);
assert.match(util.avatarMarkup({ cos: { acc: 'acc_aura', color: '" onload="bad' } }), /data-color="&quot; onload=&quot;bad"/);

const canvas = makeCanvas({ skin: 'skin_cosmic', hat: 'hat_fedora', acc: 'acc_shades', effect: 'acc_storm_effect', color: '#123456' });
tracked.add(canvas);
mutation();
assert.ok(commands.some(([name]) => name === 'clearRect'), 'new canvases receive an initial frame');
intersection([{ target: canvas, isIntersecting: true }]);
assert.equal(frames.size, 1, 'all avatars share one animation loop');
const tick = time => {
    const [id, cb] = frames.entries().next().value;
    frames.delete(id);
    cb(time);
};
commands.length = 0;
tick(1000);
const firstFrame = JSON.stringify(commands);
commands.length = 0;
tick(1010);
assert.equal(commands.length, 0, 'animation drawing is capped at 30 frames per second');
tick(1100);
assert.notEqual(JSON.stringify(commands), firstFrame, 'storm particles actually change with time');
document.hidden = true;
handlers.get('visibilitychange')();
assert.equal(frames.size, 0, 'hidden tabs stop animation');
document.hidden = false;
handlers.get('visibilitychange')();
assert.equal(frames.size, 1, 'visible tabs resume animation');
motion.matches = true;
handlers.get('motion')();
assert.equal(frames.size, 0, 'reduced motion shows a still frame');
motion.matches = false;
handlers.get('motion')();
intersection([{ target: canvas, isIntersecting: false }]);
assert.equal(frames.size, 0, 'offscreen avatars stop animation');
intersection([{ target: canvas, isIntersecting: true }]);
canvas.isConnected = false;
mutation();
assert.equal(frames.size, 0, 'removed canvases are released');
assert.equal(tracked.size, 0);
intersection([{ target: canvas, isIntersecting: true }]);
assert.equal(frames.size, 0, 'late intersection callbacks cannot retain removed avatars');

for (const item of catalog.filter(item => ['skin', 'hat', 'accessory', 'effect'].includes(item.type) && !item.legacy)) {
    const cos = { skin: 'skin_robot', hat: 'hat_fedora', acc: 'acc_shades', effect: 'acc_storm_effect' };
    cos[{ skin: 'skin', hat: 'hat', accessory: 'acc', effect: 'effect' }[item.type]] = item.id;
    for (const time of [0, 1.25]) {
        util.drawAvatar(canvas, { cos }, time);
        util.drawFigureTop(ctx, { cos }, 40, 40, 12, 1, time);
    }
}
for (const id of ['acc_blossom_effect', 'acc_bubble_effect', 'acc_comet_effect', 'acc_spiral_effect', 'acc_spark_effect']) {
    assert.ok(catalog.some(item => item.id === id && item.type === 'effect'), `new aura ${id} is available in the catalog`);
    assert.ok(util.animatedCosmetics({ equipped_effect: id }), `new aura ${id} animates`);
}
const fedora = catalog.find(item => item.id === 'hat_fedora');
assert.equal(fedora.type, 'hat');
assert.equal(fedora.price, 275);
assert.equal(fedora.rarity, 'uncommon');
const hatBox = sandbox.window.StudBudCommunityGames.constructor.boxes.find(box => box.id === 'hat');
assert.ok(sandbox.window.StudBudCommunityGames.boxPool(hatBox).some(item => item.id === fedora.id));
assert.match(source('supabase-setup.sql'), /\('hat_fedora', 110\)/);
assert.equal(sandbox.window.StudBudCommunityGames.constructor.rarityForPrice(400), 'epic');
assert.equal(sandbox.window.StudBudCommunityGames.constructor.rarityForPrice(600), 'legendary');
assert.equal(sandbox.window.StudBudCommunityGames.constructor.rarityForPrice(820), 'mythic');
const blackFedora = catalog.find(item => item.id === 'hat_fedora_black');
assert.equal(blackFedora.name, 'Black Fedora');
assert.equal(blackFedora.type, 'hat');
assert.equal(blackFedora.price, fedora.price);
assert.equal(blackFedora.rarity, fedora.rarity);
assert.ok(sandbox.window.StudBudCommunityGames.boxPool(hatBox).some(item => item.id === blackFedora.id));
assert.match(source('supabase-setup.sql'), /\('hat_fedora_black', 110\)/);

const appSource = source('app.js');
vm.runInContext(appSource.slice(appSource.indexOf('    class AppOrchestrator'), appSource.indexOf('    window.NexusApp ='))
    + '\nglobalThis.TestApp = AppOrchestrator;', sandbox);
const app = Object.create(sandbox.TestApp.prototype);
app.animateShopAuras = noop;
const previews = [];
app.multiplayerAvatarMarkup = cos => { previews.push(cos); return ''; };
app.renderMultiplayerProfile = async () => {};
app.shopTab = 'hat';
elements.set('multiplayer-shop-coins', {});
elements.set('multiplayer-shop-items', {});
elements.set('multiplayer-inventory-items', {});
app.renderMultiplayerShop({ coins: 1000, owned_items: [], equipped_skin: 'skin_robot',
    equipped_hat: 'hat_cap', equipped_accessory: 'acc_shades', equipped_effect: 'acc_storm_effect' });
const preview = previews.find(cos => cos.hat === 'hat_fedora');
assert.equal(preview.skin, 'skin_robot');
assert.equal(preview.acc, 'acc_shades', 'hat previews preserve the equipped accessory');
assert.equal(preview.effect, 'acc_storm_effect', 'hat previews preserve the equipped aura');
for (const tab of ['skin', 'hat', 'accessory', 'effect', 'palette', 'inventory']) {
    const everything = { coins: 1000, owned_items: catalog.filter(item => item.type !== 'pet').map(item => item.id) };
    if (tab === 'inventory') { app.inventoryTab = 'all'; app.renderInventory(everything); }
    else { app.shopTab = tab; app.renderMultiplayerShop(everything); }
    const markup = elements.get(tab === 'inventory' ? 'multiplayer-inventory-items' : 'multiplayer-shop-items').innerHTML;
    for (const item of catalog.filter(item => item.type !== 'pet' && (tab === 'inventory' || (!item.legacy && !item.season && item.type === tab)))) {
        assert.ok(markup.includes(`<small>${app.escapeHTML(item.description)}</small>`),
            `${tab} displays ${item.id}'s description`);
        assert.ok(markup.includes(app.escapeHTML(`${item.name} ${item.rarity} ${item.description}`.toLocaleLowerCase())),
            `${item.id}'s description is searchable`);
    }
}
assert.match(source('supabase-setup.sql'), /add column if not exists equipped_effect/);
assert.match(source('supabase-setup.sql'), /set equipped_effect = equipped_accessory, equipped_accessory = ''/);
assert.match(source('supabase-setup.sql'), /p_slot = 'effect'.*equipped_effect = ''/s);
assert.match(source('supabase-setup.sql'), /priced\.price < 200 then 'uncommon'.*priced\.price < 350 then 'rare'.*priced\.price < 550 then 'epic'/s);

(async () => {
    const community = sandbox.window.StudBudCommunityGames;
    const getElementById = document.getElementById;
    document.getElementById = id => elements.get(id) || { textContent: '' };
    sandbox.window.StudBudSfx = { play: noop };
    app.multiplayerProfile = { equipped_accessory: 'acc_shades', equipped_effect: '' };
    community.equipItem = async () => ({ equipped_accessory: 'acc_shades', equipped_effect: 'acc_storm_effect' });
    await app.updateMultiplayerShop('multiplayer-equip', 'acc_storm_effect');
    assert.equal(app.multiplayerProfile.equipped_accessory, 'acc_shades', 'equipping an aura preserves the wearable accessory');
    assert.equal(app.multiplayerProfile.equipped_effect, 'acc_storm_effect', 'aura equips into its own slot');
    app.multiplayerProfile = { equipped_accessory: '', equipped_effect: 'acc_storm_effect' };
    community.equipItem = async () => ({ equipped_accessory: 'acc_shades', equipped_effect: 'acc_storm_effect' });
    await app.updateMultiplayerShop('multiplayer-equip', 'acc_shades');
    assert.equal(app.multiplayerProfile.equipped_effect, 'acc_storm_effect', 'equipping an accessory preserves the aura');
    community.equipItem = async () => ({ equipped_accessory: '', equipped_effect: 'acc_storm_effect' });
    await assert.rejects(app.updateMultiplayerShop('multiplayer-equip', 'acc_storm_effect'), /changed your other equipped cosmetic/,
        'a server response that clears the other slot is reported instead of silently accepted');
    document.getElementById = getElementById;
    console.log('Independent accessory and aura slots, particles, animation, catalog rarity, and SQL parity passed.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

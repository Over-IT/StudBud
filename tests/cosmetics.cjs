const assert = require('node:assert/strict');
require('./seasonal-cosmetics.cjs');
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
const shopSql = source('supabase-setup.sql');
const pricedSql = shopSql.match(/with priced\(id, price\) as \(values([\s\S]*?)\), pets/)[1];
const sqlPrices = new Map([...pricedSql.matchAll(/\('([^']+)', (\d+)\)/g)].map(([, id, price]) => [id, Number(price)]));
for (const item of catalog.filter(item => item.price != null && !item.legacy)) {
    const price = sqlPrices.get(item.id);
    assert.notEqual(price, undefined, item.id + ' exists in the server catalog');
    assert.equal(item.price, Math.round(price * 2.5 / 5) * 5, item.id + ' has the same client/server price');
    const rarity = price < 100 ? 'common' : price < 200 ? 'uncommon' : price < 350 ? 'rare' : price < 550 ? 'epic' : price < 800 ? 'legendary' : 'mythic';
    assert.equal(item.rarity, rarity, item.id + ' has the same client/server rarity');
}
assert.match(shopSql, /where user_id = v_user_id for update/);
assert.match(shopSql, /p_slot = 'palette'.*equipped_palette = 'palette_default'/s);
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
    const controls = [false, true].map(disabled => ({ disabled, attrs: {},
        setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; } }));
    const selectAll = document.querySelectorAll;
    document.querySelectorAll = selector => selector.includes('[data-action=') ? controls : [];
    let releasePurchase, purchases = 0, suppliedProfile;
    const purchased = { user_id: 'buyer', coins: 725, owned_items: ['hat_fedora'] };
    community.purchaseItem = () => { purchases++; return new Promise(resolve => { releasePurchase = resolve; }); };
    app.renderMultiplayerProfile = async (_force, profile) => { suppliedProfile = profile; };
    const purchase = app.updateMultiplayerShop('multiplayer-buy', 'hat_fedora');
    assert.ok(controls.every(button => button.disabled && button.attrs['aria-busy'] === 'true'), 'all shop actions disable while a purchase is pending');
    assert.equal(await app.updateMultiplayerShop('multiplayer-buy', 'hat_fedora'), false, 'duplicate action reports no success');
    assert.equal(purchases, 1, 'double clicks cannot send a second transaction');
    releasePurchase(purchased);
    assert.equal(await purchase, true);
    assert.equal(suppliedProfile, purchased, 'render uses the authoritative purchase response, not another network request');
    assert.deepEqual(controls.map(button => button.disabled), [false, true], 'busy cleanup preserves originally locked controls');
    assert.ok(controls.every(button => !('aria-busy' in button.attrs)));
    community.purchaseItem = async () => { throw Error('Offline purchase'); };
    await assert.rejects(app.updateMultiplayerShop('multiplayer-buy', 'hat_fedora'), /Offline purchase/);
    assert.equal(app.shopPurchaseBusy, false, 'RPC errors release the action lock');
    assert.deepEqual(controls.map(button => button.disabled), [false, true]);
    app.openUnboxing = () => { throw Error('Preview failed'); };
    app.closeUnboxing = noop;
    await assert.rejects(app.updateMultiplayerShop('multiplayer-mystery', 'basic'), /Preview failed/);
    assert.equal(app.shopPurchaseBusy, false, 'preview setup failures also release the action lock');
    let opened = 0;
    app.openUnboxing = () => { opened++; };
    const season = community.constructor.seasonalBox;
    app.shopTab = 'boxes';
    app.multiplayerProfile = { user_id: 'buyer', coins: 1000, owned_items: [] };
    await assert.rejects(app.updateMultiplayerShop('multiplayer-mystery', 'season', season.season.month % 12 + 1), /seasonal box has changed/);
    assert.equal(opened, 0, 'a stale seasonal card is rejected before animation or payment');
    const seasonalPool = community.boxPool(season);
    app.completedShopBoxes = new Set(['buyer:season:' + (season.season.month % 12 + 1)]);
    assert.match(app.shopBoxCard(app.multiplayerProfile, season), /data-action="multiplayer-mystery"/, 'last month completion never hides this month rewards');
    assert.match(app.shopBoxCard(app.multiplayerProfile, season), new RegExp('data-season-month="' + season.season.month + '"'));
    app.completedShopBoxes.add('buyer:season:' + season.season.month);
    assert.doesNotMatch(app.shopBoxCard(app.multiplayerProfile, season), /data-action="multiplayer-mystery"/);
    app.completedShopBoxes.clear();
    let settings = { colorScheme: 'ocean' };
    sandbox.AppState = { get: () => settings, set: (_key, value) => { settings = value; } };
    app.applyAppearance = noop;
    app.multiplayerProfile = { equipped_palette: 'palette_ocean' };
    community.unequipSlot = async () => ({ equipped_palette: 'palette_default' });
    await app.updateMultiplayerShop('multiplayer-unequip', 'palette');
    assert.equal(settings.colorScheme, 'studbud', 'removing a palette resets the matching app scheme');
    settings = { colorScheme: 'forest' };
    app.multiplayerProfile = { equipped_palette: 'palette_ocean' };
    await app.updateMultiplayerShop('multiplayer-unequip', 'palette');
    assert.equal(settings.colorScheme, 'forest', 'removing a palette preserves an independently selected free theme');
    for (const [slot, id] of [['skin', 'skin_robot'], ['hat', 'hat_fedora'], ['palette', 'palette_ocean']]) {
        const profile = { ['equipped_' + slot]: id };
        community.equipItem = async () => profile;
        await app.updateMultiplayerShop('multiplayer-equip', id);
        assert.equal(app.multiplayerProfile['equipped_' + slot], id, slot + ' equips into the correct slot');
    }
    assert.equal(settings.colorScheme, 'ocean');
    assert.equal(settings.schemePicked, true);
    document.querySelectorAll = selectAll;
    elements.set('multiplayer-shop-status', { textContent: '' });
    document.getElementById = getElementById;
    app.renderMultiplayerProfile = sandbox.TestApp.prototype.renderMultiplayerProfile;
    app.multiplayerDisplayName = () => 'Buyer';
    app.renderDailyReward = noop;
    app.renderAppearanceShopSchemes = noop;
    community.getPlayerProfile = async () => { throw Error('must not refresh after a transaction'); };
    for (const id of ['multiplayer-wallet-coins', 'multiplayer-sidebar-coins', 'shop-wallet-coins']) elements.set(id, {});
    await app.renderMultiplayerProfile(true, purchased);
    assert.equal(elements.get('shop-wallet-coins').innerHTML, '725', 'wallet reflects the RPC balance even if subsequent fetching is unavailable');
    let resolveOldProfile;
    community.getPlayerProfile = () => new Promise(resolve => { resolveOldProfile = resolve; });
    const staleRefresh = app.renderMultiplayerProfile(true);
    await app.renderMultiplayerProfile(true, purchased);
    resolveOldProfile({ ...purchased, coins: 1000 });
    await staleRefresh;
    assert.equal(app.multiplayerProfile.coins, 725, 'a delayed pre-purchase refresh cannot overwrite the new wallet');
    assert.equal(elements.get('shop-wallet-coins').innerHTML, '725');
    app.shopTab = 'hat'; app.shopSearch = 'fedora'; app.inventoryTab = 'hat'; app.inventorySearch = 'fedora';
    app.renderMultiplayerShop(purchased);
    assert.match(elements.get('multiplayer-shop-items').innerHTML, /aria-selected="true" data-shop-tab="hat"/);
    assert.match(elements.get('multiplayer-shop-items').innerHTML, /value="fedora"/);
    assert.match(elements.get('multiplayer-inventory-items').innerHTML, /value="fedora"/);
    const guestGrid = { classList: { remove: noop, add: noop } };
    elements.set('guest-appearance', guestGrid);
    community.guestColor = () => '#34d399';
    app.multiplayerProfile = purchased;
    app.lastDrop = { unlocked_item: 'hat_fedora' };
    community.getPlayerProfile = () => new Promise(resolve => { resolveOldProfile = resolve; });
    const beforeGuest = app.renderMultiplayerProfile(true);
    app.renderGuestAppearance();
    resolveOldProfile(purchased);
    await beforeGuest;
    assert.equal(app.multiplayerProfile.user_id, 'guest', 'guest browsing discards the previous account inventory');
    assert.equal(app.multiplayerProfile.owned_items.length, 0);
    assert.equal(app.lastDrop, null);
    app.renderMultiplayerShop(app.multiplayerProfile);
    assert.doesNotMatch(elements.get('multiplayer-shop-items').innerHTML, /data-action="multiplayer-equip"/, 'switching guest tabs cannot reuse signed-in ownership');
    let toast;
    app.hideCourseSuggestions = noop;
    app.showLobbyToast = message => { toast = message; };
    app.updateMultiplayerShop = async () => { throw Error('Shop is offline'); };
    const target = { id: '', dataset: { action: 'multiplayer-buy', id: 'hat_fedora' }, matches: () => false,
        closest: selector => selector === 'button, .nav-item[data-target]' ? target : null };
    const previousConsole = sandbox.console;
    sandbox.console = { ...console, error: noop };
    await app.handleClick({ target });
    sandbox.console = previousConsole;
    assert.match(toast, /Shop is offline/, 'shop failures surface in a nonblocking toast');
    assert.equal(elements.get('multiplayer-shop-status').textContent, toast, 'shop failures also remain available as status text');
    document.getElementById = getElementById;
    console.log('Independent accessory and aura slots, particles, animation, catalog rarity, and SQL parity passed.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

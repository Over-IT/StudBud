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
for (const radius of [8, 11, 24]) {
    commands.length = 0;
    util.drawHat(ctx, 'hat_grad', 40, 30, radius);
    const points = commands.filter(([name]) => name === 'moveTo' || name === 'lineTo');
    const xs = points.map(([, x]) => x), ys = points.map(([, , y]) => y);
    assert.ok(Math.max(...xs) - Math.min(...xs) <= radius * 2.5,
        'the mortarboard overhang stays within 25% of the head width at every render scale');
    assert.ok(Math.min(...ys) >= -radius * .75,
        'the cap sits close to the crown instead of towering above the head');
    assert.ok(commands.some(([name]) => name === 'quadraticCurveTo'), 'the cap band follows the rounded head');
}
for (const face of [-1, 1]) {
    commands.length = 0;
    util.drawFigureSide(ctx, { cos: { skin: 'skin_snow', hat: 'hat_grad' } }, 29, 30, 22, 37, face, 0, false);
    assert.equal(commands.filter(([name]) => name === 'rotate').at(-1)[1], 0,
        'the graduation cap stays level when facing either direction');
}
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
assert.match(util.avatarMarkup({ cos: { effect: 'acc_storm_effect' } }, '', 640), /width="640" height="640"/,
    'large editor previews keep animated cosmetics sharp without changing normal avatar sizes');
commands.length = 0;
util.avatarUrl({ cos: { hat: 'hat_fedora' } }, 640);
assert.ok(commands.some(([name, x, y]) => name === 'clearRect' && x === 0 && y === 0)
    && commands.some(([name, x, y]) => name === 'scale' && x === 8 && y === 8),
    'static editor previews render at the requested resolution instead of reusing a thumbnail');

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
assert.equal(fedora.price, 550);
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
const guestPurchaseAction = app.shopItemAction({ user_id: 'guest', coins: 0, owned_items: [] }, fedora);
assert.match(guestPurchaseAction, /data-action="guest-create-account"/, 'guest item cards offer account creation instead of a dead purchase button');
assert.doesNotMatch(guestPurchaseAction, /disabled|data-action="multiplayer-buy"/);
const guestBoxAction = app.shopBoxCard({ user_id: 'guest', coins: 0, owned_items: [] }, hatBox);
assert.match(guestBoxAction, /data-action="guest-create-account"/, 'guest boxes have an actionable account prompt');
assert.doesNotMatch(guestBoxAction, /data-action="multiplayer-mystery"/);
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
app.inventoryTab = 'palette';
app.renderInventory({ coins: 1000, owned_items: ['palette_ocean'], equipped_palette: 'palette_ocean' });
assert.match(elements.get('multiplayer-inventory-items').innerHTML,
    /class="ghost-btn shop-unequip" data-action="multiplayer-unequip" data-slot="palette"/, 'colors have the same section-level remove control as other slots');
app.renderInventory({ coins: 1000, owned_items: ['palette_ocean'], equipped_palette: 'palette_default' });
assert.doesNotMatch(elements.get('multiplayer-inventory-items').innerHTML, /shop-unequip/, 'the default palette cannot be removed');
const studio = { innerHTML: '', dataset: {} };
elements.set('shop-character-studio', studio);
const outfit = { coins: 1000, owned_items: ['hat_cap'], equipped_skin: 'skin_robot',
    equipped_hat: 'hat_cap', equipped_accessory: 'acc_shades', equipped_effect: 'acc_storm_effect' };
const originalOutfit = JSON.stringify(outfit);
const tryHat = catalog.find(item => item.id === 'hat_fedora');
app.renderCharacterStudio(outfit, 'shop', 'hat', tryHat);
assert.match(studio.innerHTML, /data-camera="detail"/, 'hat editing automatically uses a close-up');
assert.equal(previews.at(-1).hat, 'hat_fedora');
assert.equal(previews.at(-1).skin, 'skin_robot');
assert.equal(previews.at(-1).acc, 'acc_shades');
assert.equal(previews.at(-1).effect, 'acc_storm_effect', 'try-on preserves every other equipped slot');
assert.equal(JSON.stringify(outfit), originalOutfit, 'try-on never mutates the saved outfit or balance');
assert.match(studio.innerHTML, /Preview only/);
assert.match(studio.innerHTML, /data-action="multiplayer-buy"/);
app.renderCharacterStudio(outfit, 'shop', 'effect');
assert.match(studio.innerHTML, /data-camera="full"/, 'auras keep the whole character visible');
assert.equal(previews.at(-1).hat, 'hat_cap', 'returning to equipped discards the try-on');
app.renderCharacterStudio(outfit, 'shop', 'hat', catalog.find(item => item.id === 'hat_cap'));
assert.match(studio.innerHTML, /data-action="multiplayer-unequip"/, 'the preview uses the same ownership actions as cards');
app.renderCharacterStudio({ ...outfit, owned_items: ['hat_fedora'] }, 'shop', 'hat', tryHat);
assert.match(studio.innerHTML, /data-action="multiplayer-equip"/);
app.renderCharacterStudio({ ...outfit, user_id: 'guest' }, 'shop', 'hat', tryHat);
assert.match(studio.innerHTML, /data-action="guest-create-account"/);
assert.doesNotMatch(studio.innerHTML, /data-action="multiplayer-buy"/, 'guests can preview without a purchase action');
app.renderCharacterStudio({ ...outfit, color: '#34d399' }, 'shop', 'palette', catalog.find(item => item.id === 'palette_ocean'));
assert.equal(previews.at(-1).color, '#38bdf8', 'palette previews use the proposed palette, not the guest color override');
assert.doesNotMatch(app.shopItemCard(outfit, tryHat), /data-action="character-try-on"/,
    'shop thumbnails do not offer a try-on control outside the locker');
assert.ok(app.shopItemCard(outfit, tryHat, true).includes(`data-action="character-try-on" data-id="${tryHat.id}" aria-label="Try on ${tryHat.name}"`),
    'locker item previews remain keyboard-accessible, explicitly named try-on buttons');
studio.innerHTML = '';
app.renderMultiplayerShop(outfit);
assert.equal(studio.innerHTML, '', 'rendering the shop does not mount a character studio');
elements.delete('shop-character-studio');
const personal = util.normalizeAppearance({ hairStyle: 'curls', hairColor: '#f472b6', shirtColor: '#38bdf8',
    shirtStyle: 'stripes', skinTone: '#8d5524', pantsColor: '#f5f5f4', eyeColor: '#15803d', expression: 'smile' });
assert.deepEqual({ ...util.playerCosmetics({ appearance: personal }).appearance }, { ...personal });
const outfitColors = [];
const customContext = new Proxy(ctx, { set(target, key, value) {
    if (key === 'fillStyle') outfitColors.push(value);
    target[key] = value; return true;
} });
util.drawFigureSide(customContext, { appearance: personal }, 29, 30, 22, 37, 1, 0, false);
for (const color of [personal.hairColor, personal.shirtColor, personal.skinTone, personal.pantsColor, personal.eyeColor]) {
    assert.ok(outfitColors.includes(color), `${color} is rendered on a personal side-view character`);
}
outfitColors.length = 0;
util.drawFigureTop(customContext, { cos: { appearance: personal } }, 100, 100, 20, 0, 0);
for (const color of [personal.hairColor, personal.shirtColor, personal.skinTone, personal.pantsColor, personal.eyeColor]) {
    assert.ok(outfitColors.includes(color), `${color} is rendered on a personal top-down character`);
}
assert.equal(util.who({ equipped_skin: 'skin_robot', appearance: personal }).appearance, null,
    'personal colors do not overwrite a collected costume design');
assert.equal(util.playerCosmetics({ appearance: {} }).appearance, undefined, 'existing default characters keep their original appearance');
assert.equal(util.normalizeAppearance({ hairColor: 'url(javascript:bad)' }).hairColor, '#292524');
assert.match(util.avatarMarkup({ cos: { appearance: personal, effect: 'acc_storm_effect' } }), /data-appearance="/,
    'animated avatars carry personal appearance through the shared observer');
app.personalCharacterDraft = { userId: 'owner-a', value: personal };
assert.notEqual(app.characterAppearanceDraft({ user_id: 'owner-b' }).hairColor, personal.hairColor,
    'switching accounts discards another account personal-character draft');
app.personalCharacterDraft = { userId: 'owner-b', value: personal };
assert.equal(app.characterAppearanceDraft({ user_id: 'owner-b' }).hairColor, personal.hairColor, 'drafts survive category changes for the same owner');
app.personalCharacterDraft = null;
elements.set('inventory-character-studio', studio);
app.inventoryTab = 'customize';
const defaultOutfit = { ...outfit, equipped_skin: '', user_id: 'owner-b', appearance: personal };
app.renderInventory(defaultOutfit);
assert.match(elements.get('multiplayer-inventory-items').innerHTML, /data-feature="hairStyle" data-value="curls" aria-pressed="true"/);
assert.equal(previews.at(-1).skin, '', 'the default character keeps all free personal options');
assert.equal(previews.at(-1).hat, 'hat_cap', 'the editor shows the hat that will actually stay equipped');
assert.equal(previews.at(-1).acc, 'acc_shades', 'the editor preserves wearable accessories');
assert.equal(previews.at(-1).effect, 'acc_storm_effect', 'the editor preserves auras');
assert.equal(previews.at(-1).appearance.hairColor, personal.hairColor);
const costumeProfile = { ...outfit, user_id: 'owner-b', owned_items: ['skin_robot', 'hat_cap'], appearance: personal };
app.renderInventory(costumeProfile);
let editor = elements.get('multiplayer-inventory-items').innerHTML;
assert.doesNotMatch(editor, /data-feature=|data-action="character-save"/, 'costumes cannot edit incompatible personal features or accidentally save over their design');
assert.match(editor, /data-action="multiplayer-unequip" data-slot="skin"/, 'switching to the default character is explicit');
assert.match(editor, /data-action="multiplayer-equip" data-id="skin_robot" aria-pressed="true"/, 'owned costumes use the existing equip flow');
assert.doesNotMatch(editor, /data-id="skin_alien"/, 'unowned costumes are not offered as equip actions');
for (const tab of ['hat', 'accessory', 'effect', 'palette']) {
    assert.ok(editor.includes(`data-inventory-tab="${tab}"`), `${tab} is available for shop-first customization`);
}
assert.equal(previews.at(-1).skin, 'skin_robot', 'the costume editor previews the equipped character instead of silently substituting a human');
assert.equal(previews.at(-1).hat, 'hat_cap');
assert.equal(previews.at(-1).acc, 'acc_shades');
assert.equal(previews.at(-1).effect, 'acc_storm_effect');
assert.doesNotMatch(studio.innerHTML, /data-action="character-save"/);
app.renderCharacterStudio(costumeProfile, 'inventory', 'customize', tryHat);
assert.equal(previews.at(-1).skin, 'skin_robot');
assert.equal(previews.at(-1).hat, 'hat_fedora', 'try-on works even when launched from the customization tab');
app.renderInventory(defaultOutfit);
assert.equal(previews.at(-1).appearance.hairColor, personal.hairColor, 'returning to default restores the saved personal look');
const featureFrames = Object.fromEntries(['hairStyle', 'hairColor', 'skinTone', 'eyeColor', 'expression', 'shirtStyle', 'shirtColor', 'pantsColor', 'hat', 'effect']
    .map(feature => [feature, app.characterFraming(feature)]));
assert.equal(featureFrames.hairStyle.y, featureFrames.hairColor.y, 'hair choices share a crown-centered camera');
assert.ok(featureFrames.eyeColor.y > featureFrames.hairStyle.y, 'eye and expression framing centers lower than hair');
assert.equal(featureFrames.expression.y, featureFrames.eyeColor.y);
assert.ok(featureFrames.shirtColor.y > featureFrames.eyeColor.y, 'tops frame the torso, not the face');
assert.ok(featureFrames.pantsColor.y > featureFrames.shirtColor.y, 'pants frame the legs, not the entire character');
for (const [feature, frame] of Object.entries(featureFrames)) {
    const featureY = { hairStyle: .39, hairColor: .39, skinTone: .51, eyeColor: .51, expression: .51, shirtStyle: .635, shirtColor: .635, pantsColor: .76, hat: .3, effect: .5 }[feature];
    assert.ok(Math.abs((featureY - frame.y) * frame.zoom) < .1, `${feature} stays centered at every preview size`);
}
const stormFrame = app.characterFraming('hat', { hat: 'hat_cap', effect: 'acc_storm_effect' });
assert.ok(Math.abs((.2 + .3 * .8 - stormFrame.y) * stormFrame.zoom) < .1, 'hat framing follows the storm renderer offset');
assert.ok((.085 - featureFrames.hat.y) * featureFrames.hat.zoom > -.5, 'tall wizard hats remain inside the close-up');
assert.equal(app.characterFraming('accessory', { acc: 'acc_shades' }).view, 'detail');
assert.equal(app.characterFraming('accessory', { acc: 'acc_wings' }).view, 'full', 'wide accessories are not cropped to a face');
app.characterCameras.inventory = { view: 'auto', feature: 'pantsColor' };
app.renderCharacterStudio(defaultOutfit, 'inventory', 'customize');
assert.match(studio.innerHTML, /data-camera="legs"/);
app.characterCameras.shop = { view: 'full', feature: 'hat', zoom: 1.4 };
app.renderCharacterStudio(outfit, 'shop', 'hat', tryHat);
app.renderCharacterStudio(defaultOutfit, 'inventory', 'customize');
assert.equal(app.characterCameras.shop.zoom, 1.4, 'rendering the hidden locker does not steal the shop camera');
const cameraEvents = {}, zoomEvents = {}, properties = {};
const zoomInput = { value: 1, setAttribute: noop, addEventListener: (name, handler) => { zoomEvents[name] = handler; } };
const zoomOutput = {}, stageLabel = {};
const cameraStage = {
    dataset: {}, style: { setProperty: (key, value) => { properties[key] = value; } },
    classList: { add: noop, remove: noop }, setPointerCapture: noop,
    getBoundingClientRect: () => ({ width: 120, height: 146 }),
    addEventListener: (name, handler) => { cameraEvents[name] = handler; }
};
const interactiveStudio = { dataset: { studio: 'inventory' },
    querySelector: selector => ({ '.character-stage': cameraStage, '.character-zoom input': zoomInput, '.character-zoom output': zoomOutput, '.character-stage-label': stageLabel })[selector],
    querySelectorAll: () => []
};
app.setupCharacterCamera(interactiveStudio);
assert.equal(cameraStage.dataset.camera, 'legs');
assert.equal(stageLabel.textContent, 'Auto · Pants');
zoomInput.value = 4;
zoomEvents.input();
assert.equal(app.characterCameras.inventory.zoom, 4, 'the zoom slider updates the preview without a rerender');
cameraEvents.pointerdown({ button: 0, pointerId: 1, clientX: 20, clientY: 30 });
cameraEvents.pointermove({ pointerId: 1, clientX: 45, clientY: 50 });
assert.equal(properties['--character-pan-x'], '25px');
assert.equal(properties['--character-pan-y'], '20px', 'pointer drag moves the preview freely');
cameraEvents.pointerup();
cameraEvents.keydown({ key: '0', preventDefault: noop });
assert.equal(app.characterCameras.inventory.zoom, null);
assert.equal(properties['--character-pan-x'], '0px', 'reset restores automatic framing and clears the drag offset');
cameraEvents.keydown({ key: '+', preventDefault: noop });
assert.ok(app.characterCameras.inventory.zoom > featureFrames.pantsColor.zoom, 'keyboard zoom starts from the active auto frame');
cameraEvents.keydown({ key: 'ArrowDown', preventDefault: noop });
assert.equal(properties['--character-pan-y'], '12px');
elements.delete('inventory-character-studio');
app.inventoryTab = 'all';
const filterCards = [{ dataset: { search: 'red hat', owned: 'true', affordable: 'false' } },
    { dataset: { search: 'blue hat', owned: 'false', affordable: 'true' } },
    { dataset: { search: 'red crown', owned: 'false', affordable: 'false' } }];
const noResults = {};
const filterGrid = { querySelectorAll: selector => selector === '.shop-category-title' ? [] : filterCards,
    querySelector: selector => selector === '[data-owned]' ? filterCards[0] : noResults };
const filterContainer = { id: 'multiplayer-shop-items', querySelector: () => filterGrid };
app.shopAvailability = 'affordable';
app.filterShopGrid(filterContainer, 'hat');
assert.deepEqual(filterCards.map(card => card.hidden), [true, false, true], 'budget and text filters work together');
app.shopAvailability = 'owned';
app.filterShopGrid(filterContainer, 'crown');
assert.equal(noResults.hidden, false, 'combined filters explain when no items match');
app.shopAvailability = 'all';
const shopSql = source('supabase-setup.sql');
const saveAppearanceSql = shopSql.match(/create or replace function public\.studbud_save_appearance\([\s\S]*?\$\$;/)[0];
assert.doesNotMatch(saveAppearanceSql, /equipped_skin\s*=/, 'saving default features never unequips a costume during a concurrent wardrobe change');
for (const [feature, choices] of Object.entries(util.appearanceOptions)) {
    const serverChoices = shopSql.match(new RegExp(`when '${feature}' then array\\[([^\\]]+)\\]`));
    assert.ok(serverChoices, `${feature} has a server-side allowlist`);
    assert.deepEqual([...serverChoices[1].matchAll(/'([^']+)'/g)].map(([, value]) => value), Array.from(choices, ([value]) => value),
        `${feature} has identical client/server choices`);
}
const pricedSql = shopSql.match(/with priced\(id, price\) as \(values([\s\S]*?)\), pets/)[1];
const sqlPrices = new Map([...pricedSql.matchAll(/\('([^']+)', (\d+)\)/g)].map(([, id, price]) => [id, Number(price)]));
for (const item of catalog.filter(item => item.price != null && !item.legacy)) {
    const price = sqlPrices.get(item.id);
    assert.notEqual(price, undefined, item.id + ' exists in the server catalog');
    assert.equal(item.price, Math.round(price * 2.5 / 5) * 5 * 2, item.id + ' has the same client/server price');
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
    app.multiplayerProfile = costumeProfile;
    await assert.rejects(app.savePersonalCharacter(), /Choose Default character/, 'stale save actions cannot replace an equipped costume');
    const savedStorage = new Map(), originalClient = community.getClient, originalHasAccount = community.hasAccount;
    sandbox.window.localStorage = { getItem: key => savedStorage.get(key) || null, setItem: (key, value) => savedStorage.set(key, value) };
    community.hasAccount = () => false;
    const guestCharacter = await community.saveAppearance(personal);
    assert.equal(guestCharacter.user_id, 'guest');
    assert.deepEqual({ ...community.guestAppearance() }, { ...personal }, 'guest personal characters survive a fresh read from device storage');
    const originalConsole = sandbox.console, warnings = [];
    sandbox.console = { ...console, warn: (...args) => warnings.push(args) };
    savedStorage.set('studbud-guest-appearance', '{invalid');
    try {
        assert.equal(community.guestAppearance(), null, 'damaged cosmetic storage cannot prevent opening the profile or joining games');
        assert.equal(warnings.length, 1, 'invalid stored appearances are logged rather than silently ignored');
    } finally { sandbox.console = originalConsole; }
    await community.saveAppearance(personal);
    await assert.rejects(community.saveAppearance({ ...personal, hairStyle: 'invalid' }), /valid option/);
    community.hasAccount = () => true;
    let savedPayload;
    community.getClient = () => ({ rpc: async (name, payload) => {
        assert.equal(name, 'studbud_save_appearance'); savedPayload = payload; return { data: { appearance: payload.p_appearance } };
    } });
    await community.saveAppearance(personal);
    assert.deepEqual({ ...savedPayload.p_appearance }, { ...personal }, 'account appearances are sent to the dedicated persistence RPC');
    community.getClient = () => ({ rpc: async () => ({ error: { message: 'Network error' } }) });
    await assert.rejects(community.saveAppearance(personal), /Could not save your character.*Network error/, 'failed saves never return a success-shaped profile');
    community.getClient = originalClient; community.hasAccount = originalHasAccount;
    const getElementById = document.getElementById;
    document.getElementById = id => elements.get(id) || { textContent: '', dataset: {} };
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
    app.multiplayerProfile = { user_id: 'buyer', coins: 1000, owned_items: [] };
    suppliedProfile = null;
    const switchedPurchase = app.updateMultiplayerShop('multiplayer-buy', 'hat_fedora');
    const newSession = { user_id: 'guest', coins: 0, owned_items: [] };
    app.multiplayerProfile = newSession;
    releasePurchase(purchased);
    assert.equal(await switchedPurchase, false, 'a completed purchase from a previous session is not applied');
    assert.equal(app.multiplayerProfile, newSession, 'late transactions cannot restore a signed-out account inventory');
    assert.equal(suppliedProfile, null, 'late transactions do not render the old wallet');
    assert.equal(app.shopPurchaseBusy, false, 'account switching still releases the transaction lock');
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
    assert.match(elements.get('multiplayer-shop-items').innerHTML, /aria-pressed="true" data-shop-tab="hat"/);
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

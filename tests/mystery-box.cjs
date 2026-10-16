const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
let clock = 0;
const sandbox = {
    console, Math, performance: { now: () => clock },
    setTimeout: (callback, ms) => { Promise.resolve().then(() => { clock += ms; callback(); }); return 1; },
    clearTimeout() {}, requestAnimationFrame() {},
    window: { matchMedia: () => ({ matches: true }) }
};
vm.createContext(sandbox);
vm.runInContext(source.slice(source.indexOf('    class AppOrchestrator'), source.indexOf('    window.NexusApp ='))
    + '\nglobalThis.TestApp = AppOrchestrator;', sandbox);
const app = Object.create(sandbox.TestApp.prototype);
app.escapeHTML = value => String(value);
app.shopItemPreview = (_profile, item) => `<b>${item.id}</b>`;
app.animateShopAuras = () => {};
const reward = { id: 'hat_reward', name: 'Winning Hat', rarity: 'rare' };
const decoy = { id: 'hat_decoy', name: 'Decoy', rarity: 'common' };
sandbox.window.StudBudCommunityGames = { boxPool: () => [reward, decoy] };

async function verifyReel({ scale, width, gap, padding, seasonal, duplicate, skipped }) {
    let tiles = [];
    const style = {};
    const translated = () => Number(/translateX\(([-\d.]+)px\)/.exec(style.transform || '')?.[1] || 0);
    const origin = 47;
    const marker = { offsetWidth: 4, getBoundingClientRect: () => ({ left: origin + width / 2 * scale - 2 * scale, width: 4 * scale }) };
    const strip = {
        style, offsetWidth: width,
        getBoundingClientRect: () => ({ left: origin, width: width * scale }),
        get children() { return tiles; },
        set innerHTML(html) {
            const ids = [...html.matchAll(/data-item-id="([^"]+)"/g)].map(match => match[1]);
            let left = padding;
            tiles = ids.map((id, index) => {
                const tileLeft = left;
                const tileWidth = index % 2 ? 108.5 : 127.25;
                left += tileWidth + gap;
                return { id, getBoundingClientRect: () => ({ left: origin + (tileLeft + translated()) * scale, width: tileWidth * scale }) };
            });
        }
    };
    const result = {};
    const nodes = { '.unbox-strip': strip, '.unbox-marker': marker, '.unbox-confetti': {}, '.unbox-result': result,
        '.unbox-reel': {}, '.unbox-skip': { remove() {} }, '.unbox-actions .primary-btn': { focus() {} } };
    const overlay = { classList: { replace() {}, remove() {}, add() {} }, querySelector: selector => nodes[selector] };
    app.unboxState = { overlay, box: { id: seasonal ? 'seasonal' : 'basic', seasonal, price: 100 }, skipped, startedAt: clock };
    const profile = { unlocked_item: reward.id, owned_items: [reward.id], coins: 200, duplicate, refund: duplicate ? 45 : 0 };
    await app.revealUnboxing(reward, profile);
    const markerRect = marker.getBoundingClientRect();
    const center = markerRect.left + markerRect.width / 2;
    const landed = tiles.find(tile => {
        const rect = tile.getBoundingClientRect();
        return center >= rect.left && center <= rect.left + rect.width;
    });
    assert.equal(landed?.id, profile.unlocked_item, 'landing tile equals the authoritative inventory reward');
    const winningRect = tiles[30].getBoundingClientRect();
    assert.ok(Math.abs(winningRect.left + winningRect.width / 2 - center) < 0.001, 'winner is centered using actual geometry');
    assert.match(result.innerHTML, /Winning Hat/);
    assert.match(result.innerHTML, /data-id="hat_reward"/);
    if (duplicate) assert.match(result.innerHTML, /Duplicate: Winning Hat\. 45 coins refunded/);
    else assert.match(result.innerHTML, /New rare drop: Winning Hat/);
}
(async () => {
    for (const scale of [0.7, 0.94, 1]) {
        for (const width of [280, 844]) {
            for (const seasonal of [false, true]) {
                await verifyReel({ scale, width, gap: 13.5, padding: 19, seasonal, duplicate: seasonal, skipped: !seasonal });
            }
        }
    }
    sandbox.window.matchMedia = () => ({ matches: false });
    await verifyReel({ scale: 1, width: 375, gap: 7, padding: 21, seasonal: true, duplicate: false, skipped: false });
    console.log('Mystery box regression checks passed (standard/seasonal, responsive/scaled geometry, skip, reduced motion, duplicates/refunds).');
})().catch(error => { console.error(error); process.exitCode = 1; });

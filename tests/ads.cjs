const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'ads.js'), 'utf8');
function fixture() {
    const scripts = [], blockers = [], pushes = [], bodyClasses = new Set();
    let route = 'home';
    const layout = { unitWidth: 700 };
    const slots = ['home', 'decks', 'shop'].map(name => ({
        dataset: { adPlacement: name }, hidden: true, children: [], top: 1200,
        closest: selector => selector === '.view.active' && route === name ? {} : null,
        getClientRects() { return this.hidden ? [] : [{}]; },
        getBoundingClientRect() { return { left: 0, right: 700, top: this.top, bottom: this.top + 116, width: 700 }; },
        append(...children) { this.children.push(...children); },
        get firstElementChild() { return this.children[0]; },
        querySelector(selector) { return selector === 'ins.adsbygoogle' ? this.children.find(child => child.className === 'adsbygoogle') : null; }
    }));
    const window = { innerWidth: 1000, innerHeight: 800, addEventListener() {}, StudBudCloud: { offlineMode: false },
        adsbygoogle: { push() {
            const pending = slots.flatMap(slot => slot.children.filter(child => child.className === 'adsbygoogle' && !child.requested).map(child => ({ slot, child })));
            assert.equal(pending.length, 1, 'only the currently visible unit is unrequested in the DOM');
            assert.equal(pending[0].slot.hidden, false);
            assert.ok(pending[0].child.getBoundingClientRect().width > 0, 'AdSense never receives a zero-width unit');
            assert.ok(pending[0].slot.top < 800);
            pending[0].child.requested = true;
            pushes.push(pending[0].slot.dataset.adPlacement);
        } }
    };
    const sandbox = { window, navigator: { onLine: true },
        getComputedStyle: () => ({ visibility: 'visible' }), requestAnimationFrame: callback => callback(),
        MutationObserver: class { observe() {} },
        document: { hidden: false, body: { classList: { contains: name => bodyClasses.has(name) } },
            querySelectorAll: selector => selector.startsWith('.ad-slot') ? slots : blockers,
            createElement: tag => ({ tag, dataset: {}, style: {}, getBoundingClientRect: () => ({ width: layout.unitWidth }) }),
            head: { appendChild: script => scripts.push(script) }, addEventListener() {} }
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    return { layout, sandbox, slots, scripts, pushes, blockers, bodyClasses, window, setRoute: value => { route = value; }, refresh: () => window.StudBudAds.refresh() };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
(async () => {
    const f = fixture();
    assert.ok(f.slots.every(slot => slot.hidden && !slot.children.length), 'unconfigured ads take no space and have no placeholders');
    assert.equal(f.scripts.length, 0);
    f.window.STUDBUD_ADS = { client: 'ca-pub-1234567890123456', slots: { home: '111', shop: '222' } };
    f.refresh();
    assert.equal(f.slots[0].hidden, false);
    assert.equal(f.scripts.length, 0, 'offscreen banners do not load Google');
    f.slots[0].top = 300;
    f.refresh();
    assert.equal(f.scripts.length, 1);
    assert.equal(f.slots[0].children.length, 0, 'do not leave an unrequested unit for Google to select while navigation changes');
    f.setRoute('shop');
    f.slots[2].top = 300;
    f.refresh();
    f.scripts[0].onload();
    await settle();
    assert.deepEqual(f.pushes, ['shop'], 'navigation during script loading never requests the hidden home slot');
    f.refresh(); await settle();
    assert.deepEqual(f.pushes, ['shop'], 'a banner is never automatically refreshed');
    for (const change of [
        () => { f.sandbox.navigator.onLine = false; },
        () => { f.sandbox.navigator.onLine = true; f.window.StudBudCloud.offlineMode = true; },
        () => { f.window.StudBudCloud.offlineMode = false; f.bodyClasses.add('tutorial-active'); },
        () => { f.bodyClasses.clear(); f.bodyClasses.add('studying'); },
        () => { f.bodyClasses.clear(); f.blockers.push({ getClientRects: () => [{}] }); }
    ]) {
        change(); f.refresh();
        assert.ok(f.slots.every(slot => slot.hidden), 'offline, tutorials, sessions, games and dialogs hide all banners');
    }
    f.blockers.length = 0;
    f.setRoute('home'); f.refresh(); await settle();
    assert.deepEqual(f.pushes, ['shop', 'home']);
    const ad = f.slots[0].children.find(child => child.className === 'adsbygoogle');
    assert.equal(ad.dataset.adClient, f.window.STUDBUD_ADS.client);
    assert.equal(ad.dataset.adSlot, '111');
    assert.equal(ad.dataset.adFormat, 'horizontal');
    assert.equal(ad.dataset.fullWidthResponsive, 'false');
    const narrow = fixture();
    narrow.window.STUDBUD_ADS = f.window.STUDBUD_ADS;
    narrow.layout.unitWidth = 0;
    narrow.slots[0].top = 100; narrow.refresh(); narrow.scripts[0].onload(); await settle();
    assert.deepEqual(narrow.pushes, [], 'zero-width layouts wait instead of triggering availableWidth=0');
    assert.equal(narrow.slots[0].dataset.adRequested, undefined, 'zero-width units can retry later');
    narrow.layout.unitWidth = 320; narrow.refresh(); await settle();
    assert.deepEqual(narrow.pushes, ['home'], 'the unit is requested once it has width');
    const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
    const rule = css.match(/\.ad-slot \{([^}]+)\}/)?.[1] || '';
    for (const declaration of ['width: 100%', 'min-width: 0', 'max-width: min(970px, 100%)', 'overflow: hidden']) assert.ok(rule.includes(declaration), declaration);
    const failed = fixture();
    failed.window.STUDBUD_ADS = f.window.STUDBUD_ADS;
    failed.slots[0].top = 100; failed.refresh(); failed.scripts[0].onerror(); await settle();
    assert.equal(failed.slots[0].hidden, true, 'blocked or failed script collapses the banner');
    const sw = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
    assert.ok(sw.includes("'./ads.js'"));
    assert.ok(!sw.includes('googlesyndication.com'), 'ad scripts are not added to service-worker caches');
    console.log('Ads checks passed: collapsed defaults, lazy visible-only requests, safe navigation, no refreshes, offline/focus/dialog suppression and failure handling.');
})().catch(error => { console.error(error); process.exitCode = 1; });

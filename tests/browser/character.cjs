const assert = require('node:assert/strict');

async function runCharacterChecks(page) {
    const viewport = page.viewportSize();
    const diagnostic = `${viewport.width}x${viewport.height}`;
    await page.evaluate(() => { location.hash = '#inventory'; });
    const studio = page.locator('#inventory-character-studio');
    await studio.locator('.character-stage').waitFor();
    const createTab = page.locator('#inventory-view [data-inventory-tab="customize"]');
    await createTab.click();
    const frames = [];
    for (const [feature, value, framing] of [
        ['hairStyle', 'curls', 'detail'], ['eyeColor', '#15803d', 'detail'],
        ['shirtStyle', 'stripes', 'torso'], ['pantsColor', '#f5f5f4', 'legs']
    ]) {
        const option = page.locator(`#inventory-view [data-feature="${feature}"][data-value="${value}"]`);
        await option.click();
        assert.equal(await option.getAttribute('aria-pressed'), 'true', `${diagnostic}: ${feature} is selected`);
        assert.equal(await studio.locator('.character-stage').getAttribute('data-camera'), framing, `${diagnostic}: ${feature} framing`);
        assert.equal(await page.evaluate(() => document.activeElement?.dataset.feature), feature, `${diagnostic}: option focus survives the live preview update`);
        // Wait for the camera transition, not an arbitrary delay, when motion is enabled.
        await studio.locator('.character-model').evaluate(async element => {
            await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
        });
        const geometry = await studio.evaluate(element => {
            const stage = element.querySelector('.character-stage');
            const model = element.querySelector('.character-model');
            const s = stage.getBoundingClientRect(), m = model.getBoundingClientRect();
            const state = window.NexusApp.characterCameras.inventory;
            const frame = window.NexusApp.characterFraming(state.feature, state.cos);
            return {
                targetY: m.top + m.height * frame.y, centerY: s.top + s.height / 2,
                studioHeight: element.getBoundingClientRect().height,
                documentWidth: document.documentElement.scrollWidth
            };
        });
        assert.ok(Math.abs(geometry.targetY - geometry.centerY) < 2, `${diagnostic}: ${feature} stays centered: ${JSON.stringify(geometry)}`);
        assert.ok(geometry.documentWidth <= viewport.width, `${diagnostic}: no horizontal overflow`);
        assert.ok(geometry.studioHeight < viewport.height * .8, `${diagnostic}: preview leaves room to edit`);
        const optionBox = await option.boundingBox(), panelBox = await studio.boundingBox();
        assert.ok(optionBox.y + optionBox.height > panelBox.y + panelBox.height || optionBox.x >= panelBox.x + panelBox.width,
            `${diagnostic}: sticky preview does not cover the selected option`);
        frames.push({ feature, framing, centerError: Math.abs(geometry.targetY - geometry.centerY) });
    }
    const slider = studio.locator('input[type="range"]');
    await slider.fill('4.25');
    assert.equal(await studio.locator('output').textContent(), '425%', `${diagnostic}: free zoom control`);
    const stage = studio.locator('.character-stage');
    const dragPoint = await stage.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const x = bounds.left + bounds.width / 2;
        const y = [0.5, 0.75, 0.25].map(position => bounds.top + bounds.height * position)
            .find(candidate => {
                const target = document.elementFromPoint(x, candidate);
                return target === element || element.contains(target);
            });
        return y === undefined ? null : { x, y };
    });
    assert.ok(dragPoint, `${diagnostic}: preview has a visible drag target`);
    await page.mouse.move(dragPoint.x, dragPoint.y);
    await page.mouse.down();
    await page.mouse.move(dragPoint.x + 20, dragPoint.y + 12);
    await page.mouse.up();
    assert.equal(await stage.evaluate(element => element.style.getPropertyValue('--character-pan-x')), '20px', `${diagnostic}: drag pans the preview`);
    await stage.focus();
    await page.keyboard.press('0');
    assert.equal(await stage.evaluate(element => element.style.getPropertyValue('--character-pan-x')), '0px', `${diagnostic}: reset clears pan`);
    assert.equal(await studio.locator('output').textContent(), '350%', `${diagnostic}: reset restores feature zoom`);
    await page.keyboard.press('+');
    assert.equal(await studio.locator('output').textContent(), '365%', `${diagnostic}: keyboard zoom`);
    await page.keyboard.press('ArrowDown');
    assert.equal(await stage.evaluate(element => element.style.getPropertyValue('--character-pan-y')), '12px', `${diagnostic}: keyboard pan`);
    await studio.locator('[data-action="character-camera"][data-camera="full"]').click();
    assert.equal(await stage.getAttribute('data-camera'), 'full', `${diagnostic}: full-look override`);
    await studio.locator('[data-action="character-camera"][data-camera="auto"]').click();
    assert.equal(await stage.getAttribute('data-camera'), 'legs', `${diagnostic}: Auto returns to the selected feature`);
    await studio.locator('[data-action="character-save"]').click();
    await page.waitForFunction(() => window.NexusApp.personalCharacterDraft === null);
    assert.equal(await page.evaluate(() => window.StudBudCommunityGames.guestAppearance()?.hairStyle), 'curls', `${diagnostic}: guest can save the character`);
    const savedProfile = await page.evaluate(() => {
        const app = window.NexusApp, saved = app.multiplayerProfile;
        app.multiplayerProfile = { ...saved, owned_items: ['skin_robot', 'hat_cap', 'hat_wizard', 'acc_shades'],
            equipped_skin: 'skin_robot', equipped_hat: 'hat_cap', equipped_accessory: 'acc_shades' };
        app.renderInventory(app.multiplayerProfile);
        return saved;
    });
    assert.equal(await page.locator('#inventory-view [data-feature]').count(), 0, `${diagnostic}: costumes hide incompatible personal controls`);
    assert.equal(await studio.locator('[data-action="character-save"]').count(), 0, `${diagnostic}: costumes have no accidental replace/save action`);
    assert.equal(await page.evaluate(() => window.NexusApp.characterCameras.inventory.cos.skin), 'skin_robot', `${diagnostic}: costume preview retains the equipped character`);
    assert.equal(await page.evaluate(() => window.NexusApp.characterCameras.inventory.cos.hat), 'hat_cap', `${diagnostic}: costume preview retains shop items`);
    await page.locator('#inventory-view .character-option[data-inventory-tab="hat"]').click();
    await page.locator('#inventory-view [data-action="character-try-on"][data-id="hat_wizard"]').click();
    assert.equal(await page.evaluate(() => window.NexusApp.characterCameras.inventory.cos.hat), 'hat_wizard', `${diagnostic}: locker try-on previews the proposed hat`);
    assert.equal(await page.evaluate(() => window.NexusApp.multiplayerProfile.equipped_hat), 'hat_cap', `${diagnostic}: locker try-on leaves the saved hat untouched`);
    assert.equal(await studio.locator('.character-stage').getAttribute('data-camera'), 'detail', `${diagnostic}: locker hats automatically frame the crown`);
    await studio.locator('[data-action="character-preview-reset"]').click();
    assert.equal(await studio.locator('.character-selection strong').textContent(), 'Make it yours', `${diagnostic}: locker try-on resets without equipping`);
    assert.equal(await page.evaluate(() => window.NexusApp.characterCameras.inventory.cos.hat), 'hat_cap', `${diagnostic}: reset restores the equipped hat`);
    await page.evaluate(profile => {
        const app = window.NexusApp;
        app.multiplayerProfile = profile;
        app.inventoryTab = 'customize';
        app.renderInventory(profile);
    }, savedProfile);
    assert.equal(await page.locator('#inventory-view [data-feature="hairStyle"][data-value="curls"]').getAttribute('aria-pressed'), 'true', `${diagnostic}: default features survive costume changes`);
    await page.evaluate(() => { location.hash = '#shop'; });
    await page.locator('#shop-view [data-shop-tab="hat"]').click();
    assert.equal(await page.locator('#shop-view .character-studio, #shop-view .character-stage, #shop-view [data-action="character-try-on"]').count(), 0,
        `${diagnostic}: the shop has no large character preview or editor controls`);
    assert.ok(await page.locator('#shop-view .shop-preview .player-avatar').count() > 0, `${diagnostic}: shop item thumbnails remain visible`);
    const shopBox = await page.locator('#multiplayer-shop').boundingBox();
    const shopViewBox = await page.locator('#shop-view').boundingBox();
    assert.ok(shopBox.width >= shopViewBox.width - 2, `${diagnostic}: the shop uses the space freed by the character panel`);
    assert.equal(await page.locator('#shop-view [data-action="multiplayer-buy"]').count(), 0, `${diagnostic}: guests are not shown unusable purchase actions`);
    assert.ok(await page.locator('#shop-view .multiplayer-shop-item [data-action="guest-create-account"]').count() > 0, `${diagnostic}: guests can create an account from item cards`);
    await page.locator('#shop-view .shop-tabs [data-shop-tab="boxes"]').click();
    assert.equal(await page.locator('#shop-view [data-action="multiplayer-mystery"]').count(), 0, `${diagnostic}: guests cannot attempt a paid box opening`);
    assert.ok(await page.locator('#shop-view .box-card [data-action="guest-create-account"]').count() > 0, `${diagnostic}: guest box cards explain how to collect rewards`);
    await page.locator('#shop-view [data-target="inventory-view"]').click();
    await studio.locator('.character-stage').waitFor();
    return { viewport, frames, controls: 'zoom, pointer/keyboard pan, full/auto/reset, focus, guest save, hat try-on/reset' };
}

module.exports = runCharacterChecks;

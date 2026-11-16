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
    const stage = studio.locator('.character-stage'), stageBox = await stage.boundingBox();
    await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(stageBox.x + stageBox.width / 2 + 20, stageBox.y + stageBox.height / 2 + 12);
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
    await page.evaluate(() => { location.hash = '#shop'; });
    await page.locator('#shop-view [data-shop-tab="hat"]').click();
    await page.locator('#shop-view [data-action="character-try-on"][data-id="hat_wizard"]').click();
    assert.equal(await page.locator('#shop-character-studio .character-stage').getAttribute('data-camera'), 'detail', `${diagnostic}: hats automatically frame the crown`);
    await page.locator('#shop-character-studio [data-action="character-preview-reset"]').click();
    assert.equal(await page.locator('#shop-character-studio .character-selection strong').textContent(), 'Make it yours', `${diagnostic}: try-on resets without equipping`);
    return { viewport, frames, controls: 'zoom, pointer/keyboard pan, full/auto/reset, focus, guest save, hat try-on/reset' };
}

module.exports = runCharacterChecks;

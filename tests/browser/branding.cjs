const assert = require('node:assert/strict');

module.exports = async function runBrandingChecks(page) {
    const results = await page.evaluate(async () => {
        async function render(source) {
            const image = new Image();
            image.src = source;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 512;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0, 512, 512);
            return { width: image.naturalWidth, height: image.naturalHeight,
                pixels: context.getImageData(0, 0, 512, 512).data };
        }
        const manifestURL = document.querySelector('link[rel="manifest"]').href;
        const manifest = await (await fetch(manifestURL)).json();
        const maskable = manifest.icons.find(icon => icon.purpose === 'maskable');
        const results = [];
        for (const [file, size, frameY] of [
            ['studbud.svg', 512, 8], ['studbud-square.svg', 512, 8],
            ['studbud-circle.svg', 512, 8], ['icon-192.png', 192, 8],
            ['icon-512.png', 512, 8], ['apple-touch-icon.png', 180, 48],
            ['icon-maskable-512.png', 512, null]
        ]) {
            const isMaskable = file === 'icon-maskable-512.png';
            const source = isMaskable ? new URL(maskable.src, manifestURL).href : new URL(`icons/${file}`, location.href).href;
            const image = await render(source);
            let unsafePixels = 0, appleMaskSpill = 0;
            const pixel = (x, y) => Array.from(image.pixels.subarray((y * 512 + x) * 4, (y * 512 + x) * 4 + 4));
            if (isMaskable) {
                for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
                    if (Math.hypot(x + .5 - 256, y + .5 - 256) <= 204.8) continue;
                    const i = (y * 512 + x) * 4;
                    if (image.pixels[i] !== 59 || image.pixels[i + 1] !== 45
                        || image.pixels[i + 2] !== 81 || image.pixels[i + 3] !== 255) unsafePixels++;
                }
            }
            if (file === 'apple-touch-icon.png') {
                const roundedMask = new Path2D();
                roundedMask.roundRect(0, 0, 512, 512, 110);
                const context = document.createElement('canvas').getContext('2d');
                for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
                    if (context.isPointInPath(roundedMask, x + .5, y + .5)) continue;
                    const i = (y * 512 + x) * 4;
                    if (image.pixels[i] !== 213 || image.pixels[i + 1] !== 187
                        || image.pixels[i + 2] !== 255 || image.pixels[i + 3] !== 255) appleMaskSpill++;
                }
            }
            results.push({ file, size, width: image.width, height: image.height,
                cornerAlpha: image.pixels[3], frame: frameY === null ? null : pixel(256, frameY),
                leftEdge: pixel(0, 256), unsafePixels, appleMaskSpill,
                maskable: isMaskable ? {
                    rim: [pixel(256, 54), pixel(54, 256), pixel(457, 256), pixel(256, 457)],
                    interior: pixel(80, 256),
                    torso: pixel(256, 420),
                    lowerTorso: [pixel(224, 433), pixel(256, 436), pixel(288, 433)],
                    lowerFrame: [pixel(224, 438), pixel(256, 441), pixel(288, 438)]
                } : null });
        }
        return results;
    });
    for (const result of results) {
        assert.equal(result.width, result.size, `${result.file}: correct width`);
        assert.equal(result.height, result.size, `${result.file}: correct height`);
        const opaqueCorners = result.file === 'studbud-square.svg'
            || result.file === 'icon-192.png' || result.file === 'icon-512.png'
            || result.file === 'apple-touch-icon.png' || result.file === 'icon-maskable-512.png';
        assert.equal(result.cornerAlpha, opaqueCorners ? 255 : 0, `${result.file}: correct corner shape`);
        if (result.maskable) {
            const dark = [59, 45, 81, 255], lavender = [213, 187, 255, 255];
            const { rim, interior, torso, lowerTorso, lowerFrame } = result.maskable;
            for (const edge of [result.leftEdge, ...rim, ...lowerFrame]) {
                assert.deepEqual(edge, dark, `${result.file}: the rim stays dark after the launcher crop`);
            }
            assert.deepEqual(interior, lavender, `${result.file}: the rim surrounds a lavender interior`);
            assert.notDeepEqual(torso, lavender, `${result.file}: the torso is distinct from the background`);
            assert.notDeepEqual(torso, dark, `${result.file}: the torso is distinct from the rim`);
            for (const bottom of lowerTorso) {
                assert.deepEqual(bottom, torso, `${result.file}: the torso meets the curved lower rim without a gap`);
            }
            assert.equal(result.unsafePixels, 0, `${result.file}: only dark bleed falls outside the maskable safe circle`);
            continue;
        }
        assert.deepEqual(result.frame.slice(0, 3), [59, 45, 81], `${result.file}: the complete dark frame is visible inside the canvas`);
        if (result.file === 'studbud.svg' || result.file === 'studbud-square.svg'
            || result.file === 'studbud-circle.svg' || result.file === 'icon-192.png'
            || result.file === 'icon-512.png') {
            assert.deepEqual(result.leftEdge.slice(0, 3), [59, 45, 81], `${result.file}: the frame reaches the canvas edge`);
        } else {
            assert.notDeepEqual(result.leftEdge.slice(0, 3), result.frame.slice(0, 3), `${result.file}: the frame is inset for platform masking`);
        }
        assert.equal(result.appleMaskSpill, 0, `${result.file}: Apple artwork stays inside its rounded-corner mask`);
    }
};

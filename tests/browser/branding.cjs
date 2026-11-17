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
        const results = [];
        for (const [file, size, frameY] of [
            ['studbud.svg', 512, 8], ['studbud-square.svg', 512, 8],
            ['studbud-circle.svg', 512, 8], ['icon-192.png', 192, 8],
            ['icon-512.png', 512, 8], ['apple-touch-icon.png', 180, 48],
            ['icon-maskable-512.png', 512, 117]
        ]) {
            const source = new URL(`icons/${file}`, location.href).href;
            const image = await render(source);
            let unsafePixels = 0, appleMaskSpill = 0;
            if (file === 'icon-maskable-512.png') {
                for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
                    if (Math.hypot(x + .5 - 256, y + .5 - 256) <= 204.8) continue;
                    const i = (y * 512 + x) * 4;
                    if (image.pixels[i] !== 213 || image.pixels[i + 1] !== 187
                        || image.pixels[i + 2] !== 255 || image.pixels[i + 3] !== 255) unsafePixels++;
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
            const frameIndex = (frameY * 512 + 256) * 4;
            const edgeIndex = (256 * 512) * 4;
            results.push({ file, size, width: image.width, height: image.height,
                cornerAlpha: image.pixels[3], outerEdge: Array.from(image.pixels.subarray(256 * 512 * 4, 256 * 512 * 4 + 4)),
                frame: Array.from(image.pixels.subarray(frameIndex, frameIndex + 4)),
                leftEdge: Array.from(image.pixels.subarray(edgeIndex, edgeIndex + 4)), unsafePixels, appleMaskSpill });
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
        assert.deepEqual(result.frame.slice(0, 3), [59, 45, 81], `${result.file}: the complete dark frame is visible inside the canvas`);
        if (result.file === 'studbud.svg' || result.file === 'studbud-square.svg'
            || result.file === 'studbud-circle.svg' || result.file === 'icon-192.png'
            || result.file === 'icon-512.png') {
            assert.deepEqual(result.leftEdge.slice(0, 3), [59, 45, 81], `${result.file}: the frame reaches the canvas edge`);
        } else {
            assert.notDeepEqual(result.leftEdge.slice(0, 3), result.frame.slice(0, 3), `${result.file}: the frame is inset for platform masking`);
        }
        assert.equal(result.unsafePixels, 0, `${result.file}: artwork stays inside the maskable safe circle`);
        assert.equal(result.appleMaskSpill, 0, `${result.file}: Apple artwork stays inside its rounded-corner mask`);
    }
};

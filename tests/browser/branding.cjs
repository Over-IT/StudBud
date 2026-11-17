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
        for (const [file, size, opaque] of [
            ['studbud.svg', 512, false], ['studbud-square.svg', 512, false],
            ['studbud-circle.svg', 512, false], ['icon-192.png', 192, false],
            ['icon-512.png', 512, false], ['apple-touch-icon.png', 180, true],
            ['icon-maskable-512.png', 512, true]
        ]) {
            const source = new URL(`icons/${file}`, location.href).href;
            const image = await render(source);
            let unsafePixels = 0;
            if (file === 'icon-maskable-512.png') {
                for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
                    if (Math.hypot(x + .5 - 256, y + .5 - 256) <= 204.8) continue;
                    const i = (y * 512 + x) * 4;
                    if (image.pixels[i] !== 213 || image.pixels[i + 1] !== 187
                        || image.pixels[i + 2] !== 255 || image.pixels[i + 3] !== 255) unsafePixels++;
                }
            }
            const frameY = file === 'icon-maskable-512.png' ? 117 : 34;
            const frameIndex = (frameY * 512 + 256) * 4;
            results.push({ file, size, opaque, width: image.width, height: image.height,
                cornerAlpha: image.pixels[3], outerEdge: Array.from(image.pixels.subarray(256 * 512 * 4, 256 * 512 * 4 + 4)),
                frame: Array.from(image.pixels.subarray(frameIndex, frameIndex + 4)), unsafePixels });
        }
        return results;
    });
    for (const result of results) {
        assert.equal(result.width, result.size, `${result.file}: correct width`);
        assert.equal(result.height, result.size, `${result.file}: correct height`);
        assert.equal(result.cornerAlpha, result.opaque ? 255 : 0, `${result.file}: appropriate outer corners`);
        assert.notDeepEqual(result.outerEdge.slice(0, 3), result.frame.slice(0, 3), `${result.file}: the frame is not clipped at the canvas edge`);
        assert.deepEqual(result.frame.slice(0, 3), [59, 45, 81], `${result.file}: the complete dark frame is visible inside the canvas`);
        assert.equal(result.unsafePixels, 0, `${result.file}: artwork stays inside the maskable safe circle`);
    }
};

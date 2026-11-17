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
            ['studbud.svg', 512, false], ['studbud-square.svg', 512, true],
            ['studbud-circle.svg', 512, false], ['icon-192.png', 192, false],
            ['icon-512.png', 512, false], ['apple-touch-icon.png', 180, true],
            ['icon-maskable-512.png', 512, true]
        ]) {
            const source = new URL(`icons/${file}`, location.href).href;
            const image = await render(source);
            let unsafePixels = 0, torsoSpill = 0;
            if (file === 'icon-maskable-512.png') {
                for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
                    if (Math.hypot(x + .5 - 256, y + .5 - 256) <= 204.8) continue;
                    const i = (y * 512 + x) * 4;
                    if (image.pixels[i] !== 59 || image.pixels[i + 1] !== 44
                        || image.pixels[i + 2] !== 80 || image.pixels[i + 3] !== 255) unsafePixels++;
                }
            }
            if (file.endsWith('.svg')) {
                const response = await fetch(source);
                if (!response.ok) throw new Error(`Could not load ${file}: ${response.status}`);
                const svg = await response.text();
                const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
                const [left, top, width, height] = root.getAttribute('viewBox').split(/\s+/).map(Number);
                const withoutTorso = svg.replace(/<path d="M96 [^"]+"[^>]*\/>/, '');
                if (svg === withoutTorso) throw new Error(`Missing clipped torso in ${file}`);
                const baseline = await render('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(withoutTorso));
                const clip = new Path2D();
                if (file === 'studbud-circle.svg') clip.arc(256, 256, 210, 0, Math.PI * 2);
                else clip.roundRect(46, 46, 420, 420, file === 'studbud-square.svg' ? 0 : 68);
                const context = document.createElement('canvas').getContext('2d');
                for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
                    if (context.isPointInPath(clip, left + (x + .5) * width / 512, top + (y + .5) * height / 512)) continue;
                    const i = (y * 512 + x) * 4;
                    if (image.pixels.subarray(i, i + 4).some((value, channel) => value !== baseline.pixels[i + channel])) torsoSpill++;
                }
            }
            results.push({ file, size, opaque, width: image.width, height: image.height,
                cornerAlpha: image.pixels[3], outerEdge: Array.from(image.pixels.subarray(256 * 512 * 4, 256 * 512 * 4 + 4)),
                unsafePixels, torsoSpill });
        }
        return results;
    });
    for (const result of results) {
        assert.equal(result.width, result.size, `${result.file}: correct width`);
        assert.equal(result.height, result.size, `${result.file}: correct height`);
        assert.equal(result.cornerAlpha, result.opaque ? 255 : 0, `${result.file}: appropriate outer corners`);
        assert.deepEqual(result.outerEdge.slice(0, 3), [59, 44, 80], `${result.file}: the dark frame is the outside edge`);
        assert.ok(result.outerEdge[3] >= 250, `${result.file}: the outer frame reaches the canvas edge`);
        assert.equal(result.unsafePixels, 0, `${result.file}: artwork stays inside the maskable safe circle`);
        assert.equal(result.torsoSpill, 0, `${result.file}: torso cannot protrude beyond its frame`);
    }
};

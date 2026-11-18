const assert = require('node:assert/strict');

module.exports = async function runBrandingChecks(page) {
    const { icons, manifestURL } = await page.evaluate(async () => {
        const manifestURL = document.querySelector('link[rel="manifest"]').href;
        const manifest = await (await fetch(manifestURL)).json();
        return { icons: manifest.icons, manifestURL };
    });
    assert.ok(icons.every(icon => !icon.purpose || icon.purpose === 'any'),
        'Android uses the squircle artwork for standard install icons');
    assert.ok(icons.some(icon => icon.src === './icons/studbud-squircle.svg'),
        'The scalable Android install icon uses the supplied squircle artwork');
    for (const mark of ['studbud', 'studbud-square', 'studbud-circle', 'studbud-squircle']) {
        const svg = await (await page.request.get(new URL(`icons/${mark}.svg`, manifestURL).href)).text();
        const artwork = await (await page.request.get(new URL(`icons/${mark}-source.png`, manifestURL).href)).body();
        assert.ok(svg.includes(`href="data:image/png;base64,${artwork.toString('base64')}"`),
            `${mark}: uses the matching supplied artwork without reshaping`);
    }
    const installSources = {};
    for (const size of [192, 512]) {
        const file = `icon-${size}.png`;
        const icon = icons.find(icon => icon.src.split('?')[0] === `./icons/${file}`
            && icon.sizes === `${size}x${size}` && icon.type === 'image/png');
        assert.ok(icon, `Manifest offers the standard ${size}px PNG for installation`);
        installSources[file] = new URL(icon.src, manifestURL).href;
    }

    const results = await page.evaluate(async installSources => {
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
            ['icon-512.png', 512, 8], ['apple-touch-icon.png', 180, 48]
        ]) {
            const source = installSources[file] ?? new URL(`icons/${file}`, location.href).href;
            const image = await render(source);
            let appleMaskSpill = 0;
            const pixel = (x, y) => Array.from(image.pixels.subarray((y * 512 + x) * 4, (y * 512 + x) * 4 + 4));
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
                cornerAlpha: image.pixels[3], frame: pixel(256, frameY),
                leftEdge: pixel(0, 256), appleMaskSpill,
                cornerProfile: [pixel(12, 12), pixel(32, 32), pixel(56, 56)] });
        }
        return results;
    }, installSources);
    const androidLogo = await page.evaluate(async () => {
        const image = new Image();
        image.src = new URL('./icons/studbud-squircle.svg', location.href).href;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 512;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, 512, 512).data;
        return [12, 32, 56].map(y => Array.from(pixels.subarray((y * 512) * 4, (y * 512) * 4 + 4)));
    });
    for (const result of results) {
        assert.equal(result.width, result.size, `${result.file}: correct width`);
        assert.equal(result.height, result.size, `${result.file}: correct height`);
        const opaqueCorners = result.file === 'studbud-square.svg' || result.file === 'apple-touch-icon.png';
        assert.equal(result.cornerAlpha, opaqueCorners ? 255 : 0, `${result.file}: correct corner shape`);
        if (result.file === 'icon-192.png' || result.file === 'icon-512.png') {
            assert.deepEqual(result.cornerProfile, androidLogo,
                `${result.file}: transparent corner, dark curve and lavender inset match the squircle`);
        }
        for (const [channel, expected] of result.frame.slice(0, 3).map((value, i) => [value, [59, 45, 81][i]])) {
            assert.ok(Math.abs(channel - expected) <= 3,
                `${result.file}: the complete dark frame is visible inside the canvas`);
        }
        if (result.file === 'studbud.svg' || result.file === 'studbud-square.svg'
            || result.file === 'studbud-circle.svg' || result.file === 'icon-192.png'
            || result.file === 'icon-512.png') {
            for (const [channel, expected] of result.leftEdge.slice(0, 3).map((value, i) => [value, [59, 45, 81][i]])) {
                assert.ok(Math.abs(channel - expected) <= 3,
                    `${result.file}: the frame reaches the canvas edge`);
            }
        } else {
            assert.notDeepEqual(result.leftEdge.slice(0, 3), result.frame.slice(0, 3), `${result.file}: the frame is inset for platform masking`);
        }
        assert.equal(result.appleMaskSpill, 0, `${result.file}: Apple artwork stays inside its rounded-corner mask`);
    }
    const circle = await page.evaluate(async () => {
        const image = new Image();
        image.src = new URL('./icons/studbud-circle.svg', location.href).href;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 512;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, 512, 512).data;
        let stray = 0;
        for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
            if (Math.hypot(x + .5 - 256, y + .5 - 256) > 257 && pixels[(y * 512 + x) * 4 + 3] > 8) stray++;
        }
        return stray;
    });
    assert.equal(circle, 0, 'Circle artwork has no pixels hanging below or outside its circular frame');
};

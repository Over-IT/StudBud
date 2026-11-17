const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const icons = path.join(root, 'icons');

async function generateIcons() {
    const rounded = await fs.readFile(path.join(icons, 'studbud.svg'), 'utf8');
    const inner = '<rect x="48" y="48" width="416" height="416" rx="66"';
    const background = rounded.match(/<rect x="48" y="48" width="416" height="416" rx="66" fill="none" stroke="([^"]+)" stroke-width="25"\/>/)?.[1];
    if (!background || !rounded.includes('viewBox="35.5 35.5 441 441"') || rounded.split(inner).length !== 4) {
        throw new Error('The logo frame geometry changed. Update the square and circular icon generation before continuing.');
    }
    const square = rounded.replaceAll(inner, '<rect x="48" y="48" width="416" height="416" rx="0"');
    let circle = rounded.replaceAll(inner, '<circle cx="256" cy="256" r="208"');
    const portraitStart = circle.indexOf('  <g stroke=');
    const frameStart = circle.lastIndexOf('  <circle cx="256" cy="256" r="208"');
    if (portraitStart < 0 || frameStart <= portraitStart) {
        throw new Error('Could not locate the portrait and frame for the circular logo.');
    }
    const portrait = circle.slice(portraitStart, frameStart)
        .replace('M96 464c0-99 70-167 160-167s160 68 160 167Z', 'M96 512c0-127 70-215 160-215s160 88 160 215Z')
        .replace(' clip-path="url(#inner-frame)"', '');
    circle = circle.slice(0, portraitStart)
        + '  <g clip-path="url(#inner-frame)">\n    <g transform="translate(256 256) scale(.92) translate(-256 -256)">\n'
        + portrait + '    </g>\n  </g>\n' + circle.slice(frameStart);
    const adaptive = circle.replace(`<circle cx="256" cy="256" r="208" fill="none" stroke="${background}" stroke-width="25"/>`, '')
        .replaceAll('<circle cx="256" cy="256" r="208"', '<circle cx="256" cy="256" r="195.5"');
    await fs.writeFile(path.join(icons, 'studbud-square.svg'), square);
    await fs.writeFile(path.join(icons, 'studbud-circle.svg'), circle);

    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ deviceScaleFactor: 1 });
        for (const [file, size, source, opaque, scale] of [
            ['icon-192.png', 192, rounded, false, 1],
            ['icon-512.png', 512, rounded, false, 1],
            ['apple-touch-icon.png', 180, rounded, true, 1],
            ['icon-maskable-512.png', 512, adaptive, true, .89]
        ]) {
            await page.setViewportSize({ width: size, height: size });
            await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:${opaque ? background : 'transparent'}}svg{display:block;width:100%;height:100%;transform:scale(${scale})}</style>${source}`);
            await page.screenshot({ path: path.join(icons, file), omitBackground: !opaque });
            console.log(`Generated ${file} (${size}x${size})`);
        }
    } finally {
        await browser.close();
    }
}

generateIcons().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

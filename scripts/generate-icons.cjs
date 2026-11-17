const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const icons = path.join(root, 'icons');
const LOGO_BACKGROUND = '#d5bbff';

function createLogo(source, { background = null, safe = false } = {}) {
    const inset = safe ? 112 : 24;
    const size = 512 - inset * 2;
    const backgroundRect = background ? `<rect width="512" height="512" fill="${background}"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-labelledby="title description">
  <title id="title">StudBud</title>
  <desc id="description">A lavender graduate with a plum cap and gold tassel, framed by a dark rounded-square outline.</desc>
${backgroundRect}
  <image href="data:image/png;base64,${source}" x="${inset}" y="${inset}" width="${size}" height="${size}"/>
</svg>`;
}

async function generateIcons() {
    const source = (await fs.readFile(path.join(icons, 'studbud-source.png'))).toString('base64');
    const logo = createLogo(source);
    const apple = createLogo(source, { background: LOGO_BACKGROUND });
    const adaptive = createLogo(source, { background: LOGO_BACKGROUND, safe: true });

    await fs.writeFile(path.join(icons, 'studbud.svg'), logo);
    await fs.writeFile(path.join(icons, 'studbud-square.svg'), logo);
    await fs.writeFile(path.join(icons, 'studbud-circle.svg'), logo);

    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ deviceScaleFactor: 1 });
        for (const [file, size, source, opaque] of [
            ['icon-192.png', 192, logo, false],
            ['icon-512.png', 512, logo, false],
            ['apple-touch-icon.png', 180, apple, true],
            ['icon-maskable-512.png', 512, adaptive, true]
        ]) {
            await page.setViewportSize({ width: size, height: size });
            await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:${opaque ? LOGO_BACKGROUND : 'transparent'}}svg{display:block;width:100%;height:100%}</style>${source}`);
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

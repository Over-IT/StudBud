const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const icons = path.join(root, 'icons');
const LOGO_FRAME = '#3b2d51';
const LOGO_BACKGROUND = '#d5bbff';

function createShape(source, shape) {
    if (shape === 'rounded') return `<image href="data:image/png;base64,${source}" width="512" height="512"/>`;

    const artworkClip = shape === 'circle'
        ? '<circle cx="256" cy="256" r="231"/>'
        : '<rect x="25" y="25" width="462" height="462" rx="50"/>';
    const frame = shape === 'circle'
        ? `<circle cx="256" cy="256" r="256" fill="${LOGO_FRAME}"/>`
        : `<rect width="512" height="512" fill="${LOGO_FRAME}"/>`;
    const background = shape === 'circle'
        ? `<circle cx="256" cy="256" r="231" fill="${LOGO_BACKGROUND}"/>`
        : `<rect x="25" y="25" width="462" height="462" fill="${LOGO_BACKGROUND}"/>`;

    return `<defs><clipPath id="artwork-clip">${artworkClip}</clipPath></defs>
  ${frame}
  ${background}
  <svg x="25" y="25" width="462" height="462" viewBox="25 25 462 462" clip-path="url(#artwork-clip)">
    <image href="data:image/png;base64,${source}" width="512" height="512"/>
  </svg>`;
}

function createLogo(source, { background = null, inset = 0, shape = 'rounded' } = {}) {
    const size = 512 - inset * 2;
    const backgroundRect = background ? `<rect width="512" height="512" fill="${background}"/>` : '';
    const artwork = createShape(source, shape);
    const insetArtwork = inset
        ? `<svg x="${inset}" y="${inset}" width="${size}" height="${size}" viewBox="0 0 512 512">${artwork}</svg>`
        : artwork;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-labelledby="title description">
  <title id="title">StudBud</title>
  <desc id="description">A lavender graduate with a plum cap and gold tassel, framed by a dark ${shape} outline.</desc>
${backgroundRect}
  ${insetArtwork}
</svg>`;
}

function createMaskableLogo(source) {
    // Dark bleed lets the launcher cut the outside of the frame to its own shape.
    return createLogo(source, { shape: 'circle', background: LOGO_FRAME, inset: 54 });
}

async function generateIcons() {
    const source = (await fs.readFile(path.join(icons, 'studbud-source.png'))).toString('base64');
    const logo = createLogo(source);
    const square = createLogo(source, { shape: 'square' });
    const circle = createLogo(source, { shape: 'circle' });
    const apple = createLogo(source, { background: LOGO_BACKGROUND, inset: 40 });
    const adaptive = createMaskableLogo(source);

    await fs.writeFile(path.join(icons, 'studbud.svg'), logo);
    await fs.writeFile(path.join(icons, 'studbud-square.svg'), square);
    await fs.writeFile(path.join(icons, 'studbud-circle.svg'), circle);

    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ deviceScaleFactor: 1 });
        for (const [file, size, source, opaque] of [
            ['icon-192.png', 192, square, true],
            ['icon-512.png', 512, square, true],
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

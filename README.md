# StudBud

StudBud is a responsive student planner for classes, assignments, grades, calendars, and study sessions.

## Open StudBud

After the GitHub Pages deployment finishes, open **https://over-it.github.io/StudBud/** in Chrome, Safari, Edge, or Firefox. The site works on phones, tablets, Chromebooks, and computers without installing anything.

On Chrome for desktop, use the install icon in the address bar or choose **Install StudBud** from the browser menu. On Android, open the site in Chrome and choose **Add to Home screen**. On iPhone or iPad, open it in Safari and choose **Share → Add to Home Screen**.

The app shell is cached for offline loading after the first visit. Internet access is still needed for externally hosted fonts, icons, and chart libraries.

## Run locally

Open `index.html` in a browser, or serve the repository folder from a local web server. Service-worker installation and offline caching require `localhost` or HTTPS.

## Data and privacy

Class, assignment, and study data is saved in the browser on the device where it was entered. It is not automatically synchronized between devices. Export a backup from Profile & Data before switching or resetting devices.

## Deployment

Every push to `main` automatically deploys the site to GitHub Pages using the workflow in `.github/workflows/pages.yml`.

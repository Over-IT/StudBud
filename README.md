# StudBud

StudBud is a responsive student planner for classes, assignments, grades, calendars, and study sessions.

## Open StudBud

After the GitHub Pages deployment finishes, open **https://over-it.github.io/StudBud/** in Chrome, Safari, Edge, or Firefox. The site works on phones, tablets, Chromebooks, and computers without installing anything.

On Chrome for desktop, use the install icon in the address bar or choose **Install StudBud** from the browser menu. On Android, open the site in Chrome and choose **Add to Home screen**. On iPhone or iPad, open it in Safari and choose **Share → Add to Home Screen**.

The app shell is cached for offline loading after the first visit. Internet access is needed for account sign-in and syncing, externally hosted fonts and icons, and chart libraries.

## Run locally

Open `index.html` for a local preview, or serve the repository folder from a local web server. Service-worker installation and offline caching require `localhost` or HTTPS.

## Accounts and cloud sync

StudBud uses Supabase Auth for username/password accounts and stores each account's full app backup (classes, assignments, grades, schedules, flashcards, study history, and UI preferences) in a row protected by Row Level Security. Passwords must be at least 8 characters. Usernames are unique, case-insensitive, and limited to 3–24 letters, numbers, or underscores.

To connect the deployed static site to a Supabase project:

1. Create a Supabase project and run [`supabase-setup.sql`](./supabase-setup.sql) in the Supabase SQL editor.
2. Set the project's minimum password length to 8 in its Auth password/security settings.
3. Copy the project URL and **publishable/anon key** into `url` and `anonKey` in [`supabase-config.js`](./supabase-config.js). These are public browser credentials; never put a service-role key in this file.
4. In Supabase **Authentication → Sign In / Providers → Email**, enable email/password authentication and turn **off Confirm email**. Supabase's Email provider remains enabled, but StudBud internally maps each username to a non-deliverable `@accounts.studbud.invalid` identifier. Users do not enter an email and no confirmation email is sent.

Because accounts have no email address, there is no email-based password recovery. Users who forget their username or password cannot recover that account; keep credentials safe. Do not put personal data in the username.

The first account used on a device adopts any existing local StudBud data into its cloud account. After sign-out, the local app cache is cleared. Signed-in changes sync automatically; sign in on another device to load the same account data. Keep using **Export / Import Backup** for an independent backup.

### Community flashcards and hosted games

After deploying the latest version, run the updated [`supabase-setup.sql`](./supabase-setup.sql) in the Supabase SQL editor. It adds the private-by-default community deck library and the protected RPC functions for live game rooms. No Supabase Realtime add-on or service-role key is required; room state is polled securely while players are connected.

Community deck discovery is available to signed-in users. A local deck becomes eligible for publishing only after at least one card is studied. It is **not shared automatically**: the owner must choose **Share with community**. The deck title and card terms/definitions (plus source attribution for an imported set) are published—personal spaced-repetition progress is not. Owners can stop sharing at any time. Community-use counts increase once per signed-in student after they study an imported set.

**Multiplayer Study Club** has separate Host and Join screens, an account-backed coin wallet, animated player avatars, and a cosmetic shop (characters, hats and accessories that appear on your in-game character). Every mode is a real-time, full-screen canvas game with working collision and visible rivals: Rooftop Rumble (obstacle parkour), Hammerheart Showdown (platform brawler), Starfall Blasters (top-down shooter), Crystal Cartel (mining), River Raiders and Fishing Frenzy (fishing), Market Mayhem and Crypto Exchange (invest in several assets, mine, research), Endzone Rally (football), and Crypto Hack (Gimkit-style server room: mine, crack codes, steal from rivals). Flashcard questions are small random popups you trigger yourself (press Q or answer in-world prompts) and a correct answer refills the game's resource — ammo, energy or bait — by an amount the host sets when creating the room. Round coins scale with how many answers you got right. While waiting for a match you can play a practice round of the selected mode or the Potshot Peak warm-up. Games need a keyboard and mouse. Hosts set score/objective or time limits and manage players. Rooms expire after two hours and use 2–50 complete flashcards.

Apply the latest `supabase-setup.sql` to enable account-backed multiplayer profiles, purchases, random drops, personal-best syncing, and hosted rooms.

The **Flashcard Importer** accepts tab-separated or other delimiter-separated term/definition rows without depending on a specific flashcard provider.

Supabase must be configured before account creation or sign-in is available. The GitHub Pages site is static, so this repository does not contain server secrets or a service-role key.

## Deployment

Every push to `main` automatically deploys the site to GitHub Pages using the workflow in `.github/workflows/pages.yml`. If a deployment does not start, open the repository's **Actions** tab, select **Deploy StudBud to GitHub Pages**, and choose **Run workflow** on `main`.

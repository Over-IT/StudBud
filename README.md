# StudBud

StudBud is a student hub with three parts: **Plan** (classes, assignments, grades, calendar), **Study** (flashcards scheduled with Anki's SM-2 spaced-repetition algorithm — learning and relearning steps, Again/Hard/Good/Easy ease adjustments, growing review intervals and leech detection; flashcards are never "due" and every deck can be studied anytime, with new cards, learning steps and the reviews closest to their next interval shown first — focus sessions, study streaks and leaderboards) and **Play** (live multiplayer games and arcade modes powered by your own flashcards, with a coin shop for characters, hats and accessories).

## Open StudBud

After the GitHub Pages deployment finishes, open **https://over-it.github.io/StudBud/** in Chrome, Safari, Edge, or Firefox. The site works on phones, tablets, Chromebooks, and computers without installing anything.

On Chrome for desktop, use the install icon in the address bar or choose **Install StudBud** from the browser menu. On Android, open the site in Chrome and choose **Add to Home screen**. On iPhone or iPad, open it in Safari and choose **Share → Add to Home Screen**.

The app shell is cached for offline loading after the first visit. Internet access is needed for account sign-in and syncing, externally hosted fonts and icons, and chart libraries.

## Run locally

Open `index.html` for a local preview, or serve the repository folder from a local web server. Service-worker installation and offline caching require `localhost` or HTTPS.

### Game regression checks

Run `node tests/game-previews-warmup.cjs` with Node.js. These dependency-free checks exercise all registered lobby previews at card, desktop and phone sizes, including switching from Package Delivery to Crystal Mining and recovering from a failed preview. They cover uncapped resource refills, solo/multiplayer refill parity, live cosmetic refresh, every catalog skin/hat/accessory combination in both character views, traffic-safe recesses, finite lava flow and fast projectile collisions. Schedule checks cover saved weekend schedules, upcoming classes, due assignments/tests and completed-work exclusion. Three-minute simulations check every main mode's solo/admin bots, real delivery and mining credit, soccer goals, resource pauses and scoreboard values. Admin pause retains bots without movement or timeout. Local fixtures verify community-deck added labels/duplicate prevention, full-card moderation review, and announcement escaping, validation and dismissal. Camera checks run at 30, 60 and 120 FPS: the warm-up advances every frame, recenters only forward and catches an idle runner even after a long run. These logic checks complement browser layout/input testing; they do not connect to Supabase.

Run `node tests/ui-controls.cjs` for horizontal-only City Escape/King of the Hill joysticks, separate Jump-button input, unchanged vertical controls in other modes, pointer-release handling, and the collapsible game HUD.

## Accounts and cloud sync

StudBud uses Supabase Auth for username/password accounts and stores each account's full app backup (classes, assignments, grades, schedules, flashcards, study history, and UI preferences) in a row protected by Row Level Security. Passwords must be at least 8 characters. Usernames are unique, case-insensitive, and limited to 3–24 letters, numbers, or underscores.

To connect the deployed static site to a Supabase project:

1. Create a Supabase project and run [`supabase-setup.sql`](./supabase-setup.sql) in the Supabase SQL editor.
2. Set the project's minimum password length to 8 in its Auth password/security settings.
3. Copy the project URL and **publishable/anon key** into `url` and `anonKey` in [`supabase-config.js`](./supabase-config.js). These are public browser credentials; never put a service-role key in this file.
4. In Supabase **Authentication → Sign In / Providers → Email**, enable email/password authentication and turn **off Confirm email**. Supabase's Email provider remains enabled, but StudBud internally maps each username to a non-deliverable `@accounts.studbud.invalid` identifier. Users do not enter an email and no confirmation email is sent.

Because accounts have no email address, there is no email-based password recovery. Users who forget their username or password cannot recover that account; keep credentials safe. Do not put personal data in the username.

The first account used on a device adopts any existing local StudBud data into its cloud account. After sign-out, the local app cache is cleared; if a different account is later used and has no cloud backup, it starts with a clean app rather than adopting the previous account's data. Signed-in changes sync automatically; sign in on another device to load the same account data. Keep using **Export / Import Backup** for an independent backup.

### Community flashcards and hosted games

After deploying the latest version, run the updated [`supabase-setup.sql`](./supabase-setup.sql) in the Supabase SQL editor. It adds the private-by-default community deck library and the protected RPC functions for live game rooms. No Supabase Realtime add-on or service-role key is required; room state is polled securely while players are connected.

Community deck discovery is available to signed-in users. Any local deck can be published. It is **not shared automatically**: the owner must choose **Share**. The deck title, its class, and card terms/definitions (plus source attribution for an imported set) are published—personal spaced-repetition progress and the test or quiz you linked it to are not. When you create a deck (or from **Class & test** on a deck card) you can pick which class and which upcoming test or quiz it's for; decks linked to an upcoming test or quiz are added to today's study plan and recommended on the Flashcards page, and flashcard study time is logged against that test or quiz. Study priorities use each class's target % or, if none is set, the grade each class needs for your target GPA; the Target GPA solver shows the cheapest grade plan to reach it. Owners can stop sharing at any time. A deck can't be shared if a shared set already has the same name or the exact same cards, and imported (borrowed) sets can't be reposted — the server also rejects a set where at least half of the cards match another student's shared set. Borrowed decks show "by <author>" in your deck list. Shared sets show their author, and tapping the author (or a player's name, podium spot or **Profile** button on the study leaderboards) opens a public profile with their character and shared sets. Your own profile button opens your public profile as others see it, with **Edit public profile** (jumps to the public profile settings) and **Shop & character** buttons. Community-use counts increase once per signed-in student after they study an imported set.

**Multiplayer Study Club** has separate Host and Join screens, an account-backed coin wallet, animated player avatars and a cosmetic shop for characters, hats, accessories, trails, effects and interface colour schemes. Items range from common to animated mythic, with themed mystery boxes and visible rarity odds. Main live modes are City Escape, River Fishing, Package Delivery, Crystal Mining, King of the Hill, Arena Shooter and Soccer. Each mode card shows a silent live preview of the real game with bots.

The shop uses theme-matched illustrated boxes and responsive cosmetic previews. Expand **Drop chances** on any box to see its rarity odds before opening it. In games, **HUD** toggles the objective and control hints without hiding score, resources, refill, timer, or exit controls; details start collapsed on small screens and in compact mode. **Menu** contains the collapsible **Ranks**, host end-match action, and admin testing tools. City Escape and King of the Hill touch joysticks move only left/right; use the separate **Jump** button to jump.

Community search results and shared sets on public profiles show **Already in your decks** instead of an add button when you have imported that set or still have its original published deck. The label updates immediately after import, and removing the local copy makes it available to add again.

Every main mode also has a **Solo game** option with flashcard-set, per-answer resource and timed or endless settings. Solo games require questions like multiplayer and award no coins. Correct answers add exactly the configured amount of the game's named resource in either mode. Resources accumulate without a cap and appear as a number, not a progress bar. Infinite resources are exclusive to **Admin → Game testing**, where the resource display is hidden and the optional question button says **Test question**. Solo/test bots use normal movement and actions; solo bots pause to simulate questions and refill by the configured amount. Local games use the selected local flashcards without requesting a hosted room.

Questions remain available anywhere, and the world continues running while answering. Use building recesses in Package Delivery, calm shoreline docks in River Fishing, solid ground in Crystal Mining/City Escape, or arena cover when you want less exposure. Shelter is physical rather than automatic immunity: opponents can still attack in multiplayer. Arena Shooter uses mirrored cover and open lanes; live matches with rivals focus on PvP instead of drone waves. Mining has gravity, a fuel-powered jetpack and a surface depot for banking crystals. Original lava sources spread at most seven blocks sideways, get thinner with distance, fall at full height and start a fresh sideways allowance on a lower floor. Falling lava does not spread sideways in midair.

Games support keyboard/mouse and touch, with a floating joystick, guarded action buttons and tap/hold aiming instead of a redundant fire/hit button. One named-resource refill button opens questions; Q works on keyboard, and Tab reaches game controls. The Ranks button opens standings without permanently covering play. Pinch and double-tap zoom are blocked while a game is open, and HUDs/cameras adapt to phone/tablet/desktop sizes and orientation. Standings and results show equipped characters. Apply the latest SQL so room snapshots refresh every player's current equipment.

The pregame warm-up is a Crossy Road-style hopper played as your own character: cross roads, land on logs and lily pads, and watch for trains. Its camera always advances during a run, recenters only forward and catches you if you stop. Traffic and currents become faster as you advance; queued taps keep quick hops responsive. Hosts set score/objective or time limits and manage players. Rooms expire after two hours and accept any number of complete flashcards, including one-card sets.

City Escape's preview cycles through four silent, 12-second gameplay recordings from the start and checkpoints 1–3. The small selection card and larger preview share one video player. Unsupported or unavailable video falls back to simulated gameplay. The compressed MP4 clips total about 2.6 MB and are not duplicated in the service-worker offline cache. For local video playback, serve the app over HTTP; the integrated browser's `file://` view may use the simulated fallback. The temporary recorder is not a permanent admin feature.

### Study streaks and leaderboards

StudBud tracks time spent in flashcard reviews and solo arcade sessions, along with study sessions saved through the study log (including completed focus sprints). Reach **15 minutes per UTC day** to complete the daily goal and extend your streak. The Leaderboards page shows your streak (with a warning and countdown when it's at risk), the last 7 days, the next streak milestone, your best streak, days the goal was met and all-time study time. Study-time rankings can be viewed for **today, this week, this month or all time**, for **everyone or just you and your friends**, with each player's current streak. A "your rank" line shows where you stand and how much more study it takes to pass the next person. Usernames are visible to other signed-in students. Unsynced session times are kept locally and retried when the connection returns. Study time is recorded by the signed-in client, so leaderboard totals are intended for motivation rather than official verification.

### Today at a glance

The top of the dashboard has a **Today at a glance** card: your streak, this week, today's goal, the next assignments to work on, and your grades and GPA. Tap **Customize** to choose which sections it shows and how many assignments to list. If you install StudBud, your current streak can also appear as a badge on the app icon (where supported), and long-pressing the icon offers shortcuts to your streak, planner and flashcards.

**Today's schedule** follows the school's weekday rotation and shows incomplete assignments, quizzes and tests due today under the matching class. Work for a class that does not meet today appears separately. Weekends and days with no matching classes explain that your schedule is still saved, offer **Edit schedule**, and include a collapsed preview of the next school day's classes.

### Administration

**Admin → Game testing** launches the seven main modes with infinite resources, zero to three simulated players and an optional reproducible map seed. Its collapsed **Tools** menu provides pause/resume, restart and live diagnostics. Test sessions do not award coins or change leaderboard records.

User and shared-deck moderation controls are collapsed until needed. Administrators can open public profiles, inspect every card in a shared set, see last sign-in and ban reasons, and use the existing protected moderation actions. **Announcements** publishes or unpublishes one site-wide message for signed-in students. Students can dismiss a message for the current page session; a new update makes it visible again.

Run the updated [`supabase-setup.sql`](./supabase-setup.sql) to enable full-deck inspection and announcements. These operations are administrator-checked on the server; the browser cannot grant access.

Apply the latest `supabase-setup.sql` to enable account-backed multiplayer profiles, purchases, random drops, personal-best syncing, and hosted rooms.

If hosting a room or opening the shop says the feature is not enabled on the server, run the latest `supabase-setup.sql` in the Supabase SQL editor and reload StudBud. Multiplayer game rooms and shop purchases are handled by protected server functions and cannot be enabled from the browser alone.

The **Flashcard Importer** accepts tab-separated or other delimiter-separated term/definition rows without depending on a specific flashcard provider.

Supabase must be configured before account creation or sign-in is available. The GitHub Pages site is static, so this repository does not contain server secrets or a service-role key.

## Deployment

Every push to `main` automatically deploys the site to GitHub Pages using the workflow in `.github/workflows/pages.yml`. If a deployment does not start, open the repository's **Actions** tab, select **Deploy StudBud to GitHub Pages**, and choose **Run workflow** on `main`.

# StudBud

StudBud is a student hub with three parts: **Plan** (classes, assignments, grades, calendar), **Study** (flashcards scheduled with Anki's SM-2 spaced-repetition algorithm, focus sessions, study streaks and leaderboards) and **Play** (live multiplayer games and arcade modes powered by your own flashcards, with a coin shop for characters, hats and accessories). Flashcard study shuffles due reviews and new cards within daily limits; future reviews wait until their scheduled day. Decks show how many cards are scheduled today and disable Study when nothing is scheduled. Learning/relearning steps, Again/Hard/Good/Easy interval adjustments and leech detection remain active. Quiz and game questions are randomized independently.

## Open StudBud

After the GitHub Pages deployment finishes, open **https://over-it.github.io/StudBud/** in Chrome, Safari, Edge, or Firefox. The site works on phones, tablets, Chromebooks, and computers without installing anything.

On Chrome for desktop, use the install icon in the address bar or choose **Install StudBud** from the browser menu. On Android, open the site in Chrome and choose **Add to Home screen**. On iPhone or iPad, open it in Safari and choose **Share → Add to Home Screen**.

The app shell is cached for offline loading after the first visit. Internet access is needed for account sign-in and syncing, externally hosted fonts and icons, and chart libraries.

## Run locally

Open `index.html` for a local preview, or serve the repository folder from a local web server. Service-worker installation and offline caching require `localhost` or HTTPS.

### Game regression checks

Run `node tests/game-previews-warmup.cjs` with Node.js. These dependency-free checks exercise all registered lobby previews at card, desktop and phone sizes, including switching from Package Delivery to Crystal Mining and recovering from a failed preview. They cover uncapped resource refills, solo/multiplayer refill parity, live cosmetic refresh, every catalog skin/hat/accessory combination in both character views, traffic-safe recesses, finite lava flow and fast projectile collisions. Schedule checks cover saved weekend schedules, upcoming classes, due assignments/tests and completed-work exclusion. Three-minute simulations check every registered mode's solo/admin bots, real delivery and mining credit, soccer goals, fishing catches, trading portfolios, hacking-terminal payouts, resource pauses and scoreboard values. Forced-respawn checks cover parkour checkpoint recovery, hill knockouts, shooter deaths and soccer kickoff resets. Question checks cover the one-second automatic cooldown after correct/wrong answers or skips and reusable delivery markers. Admin pause retains bots without movement or timeout. Local fixtures verify community-deck added labels/duplicate prevention, full-card moderation review, and announcement escaping, validation and dismissal. Camera checks run at 30, 60 and 120 FPS: the warm-up advances every frame, recenters only forward and catches an idle runner even after a long run. These logic checks complement browser layout/input testing; they do not connect to Supabase.

Run `node tests/ui-controls.cjs` for guarded City Escape/King of the Hill joystick angles, separate Jump-button input, unchanged vertical controls in other modes, pointer ownership/release/cancellation, deliberate flashcard taps, duplicate room-submit protection, and the unified collapsible game HUD.

Run `node tests/account-shop-study.cjs` for box eligibility/exhaustion, randomized scheduled study, cross-device merge conflicts and retrying concurrent writes, owned-deck recovery, and grades, assignments, schedules, study summaries and audio preference persistence. These tests use local fixtures, not a live Supabase database.

Run `node tests/flashcard-editor.cjs` for staged card editing/deletion, cancellation, review-progress preservation, storage failures, shared-publication retries, class/test switching and stable shared-set identities. These checks use local fixtures, not a live Supabase database.

Run `node tests/academic-math.cjs` for points/category grade calculations, credit-weighted GPA without intermediate display rounding, optimal target-grade plans compared with exhaustive enumeration, local-date priorities, short-session totals, mathematical answer distinctions and saved-data analytics. Chart checks cover theme-aware line/area/bar styling, stable class colors, unchanged grade/GPA history, reduced motion and empty states. Displayed grades, GPA changes and fractional scores use at most two decimal places; calculations retain their precision.

The game regression suite also checks nearby King of the Hill/Soccer action keys, new box price/rarity parity, animated particles in both character views, and account tags that cannot be claimed through a multiplayer nickname.

## Accounts and cloud sync

New assignments default their due date to today in your local time zone. You can type in the date field or use its single built-in calendar icon. Adding from a calendar day keeps that selected day; editing an assignment preserves its saved date. Save & add another keeps your chosen date for quick batch entry.

Score and Out of arrows (including the keyboard's up/down arrows) adjust by one point. Type fractional scores directly; decimals remain valid and are saved to two decimal places.

StudBud uses Supabase Auth for username/password accounts and stores each account's full app backup (classes, assignments, grades, schedules, flashcards, study history, and UI preferences) in a row protected by Row Level Security. Passwords must be at least 8 characters. Usernames are unique, case-insensitive, and limited to 3–24 letters, numbers, or underscores.

To connect the deployed static site to a Supabase project:

1. Create a Supabase project and run [`supabase-setup.sql`](./supabase-setup.sql) in the Supabase SQL editor.
2. Set the project's minimum password length to 8 in its Auth password/security settings.
3. Copy the project URL and **publishable/anon key** into `url` and `anonKey` in [`supabase-config.js`](./supabase-config.js). These are public browser credentials; never put a service-role key in this file.
4. In Supabase **Authentication → Sign In / Providers → Email**, enable email/password authentication and turn **off Confirm email**. Supabase's Email provider remains enabled, but StudBud internally maps each username to a non-deliverable `@accounts.studbud.invalid` identifier. Users do not enter an email and no confirmation email is sent.

Because accounts have no email address, there is no email-based password recovery. Users who forget their username or password cannot recover that account; keep credentials safe. Do not put personal data in the username.

The first account used on a device adopts any existing local StudBud data into its cloud account. After sign-out, the local app cache is cleared; if a different account is later used and has no cloud backup, it starts with a clean app rather than adopting the previous account's data. Signed-in changes sync automatically; sign in on another device to load the same account data. Keep using **Export / Import Backup** for an independent backup.

Cloud sync merges independent edits against the last saved baseline and retries concurrent server writes instead of replacing another device's changes. Pending local edits survive reload. Conflicting edits to the same field are reported explicitly; export a backup before resolving them. Sign-out waits for a successful save. Restoring decks, history and metrics uses one IndexedDB transaction so a failed restore does not partially clear those stores. Your own published decks are recovered automatically into your collection when opening your account.

### Community flashcards and hosted games

After deploying the latest version, run the updated [`supabase-setup.sql`](./supabase-setup.sql) in the Supabase SQL editor. It adds the private-by-default community deck library and the protected RPC functions for live game rooms. No Supabase Realtime add-on or service-role key is required; room state is polled securely while players are connected.

If setup previously failed with `42710: check constraint "studbud_site_notice_message_check" already exists`, rerun the corrected full script. The announcement table now gives its nonblank-active-message constraint a distinct name from PostgreSQL's automatically named message-length constraint. The script also requests a PostgREST schema-cache reload after installing its functions. Wait a few seconds after a successful run, then refresh the app; the SQL must be run in the project configured in [`supabase-config.js`](./supabase-config.js).

Community deck discovery is available to signed-in users. Any local deck can be published. It is **not shared automatically**: the owner must choose **Share**. The deck title, its class, and card terms/definitions (plus source attribution for an imported set) are published—personal spaced-repetition progress and the test or quiz you linked it to are not. When you create a deck (or from **Class & test** on a deck card) you can pick which class and which upcoming test or quiz it's for; decks linked to an upcoming test or quiz are added to today's study plan and recommended on the Flashcards page, and flashcard study time is logged against that test or quiz. Study priorities use each class's target % or, if none is set, the grade each class needs for your target GPA; the Target GPA solver shows the cheapest grade plan to reach it. Owners can stop sharing at any time. A deck can't be shared if a shared set already has the same name or the exact same cards, and imported (borrowed) sets can't be reposted — the server also rejects a set where at least half of the cards match another student's shared set. Borrowed decks show "by <author>" in your deck list. Shared sets show their author, and tapping the author (or a player's name, podium spot or **Profile** button on the study leaderboards) opens a public profile with their character and shared sets. Your own profile button opens your public profile as others see it, with **Edit public profile** (jumps to the public profile settings) and **Shop & character** buttons. Community-use counts increase once per signed-in student after they study an imported set.

Choose **Edit set** to rename a deck, change its class/test, search its cards, and add, edit or delete cards. **Save Card** stages an edit and returns to the set editor; **Save changes** saves the whole set, while **Cancel** discards staged edits. Existing card identities, review schedules and mastery are retained when editing; deleting a card removes its progress. Borrowed sets can be edited for personal use but still cannot be reposted. Creating a set uses the same editor so you can choose its class and test immediately.

Changing a class clears an incompatible test link, and clearing the class removes its old public class label. Choosing a test selects its class. Upcoming test options use the local calendar date; an existing past/completed link remains available and is labeled. Card and class edits refresh an owned shared copy, while test links remain private. If that refresh fails, the app reports that local changes were saved and lets you retry from the editor. **Rerun the full updated [`supabase-setup.sql`](./supabase-setup.sql)** to fix duplicate checks for updates to an already-shared set; switching classes away and back must not treat the same set as a new duplicate. Other sets' duplicate-title/card and anti-reposting checks remain enforced.

**Multiplayer Study Club** has separate Host and Join screens, an account-backed coin wallet, animated player avatars and a cosmetic shop for characters, hats, accessories, auras and interface colour schemes. Items range from common to animated mythic, with themed mystery boxes and visible rarity odds. Main live modes are City Escape, River Fishing, Package Delivery, Crystal Mining, King of the Hill, Arena Shooter and Soccer. Each mode card shows a silent live preview of the real game with bots.

**Auras Box** costs 200 coins and draws only auras, with 25% common, 35% uncommon, 25% rare, 12% epic, 2% legendary and 1% mythic starting odds. Every box is restricted to its advertised categories and rarities: Study Box cannot award legendary or mythic items. Exhausted rarity tiers are removed and the remaining eligible odds are reweighted and displayed. Once all eligible items are owned, **Collection complete** replaces **Open**, without an error or a coin charge. There are 28 auras, including the continuously raining mythic **Personal Tempest**, **Event Horizon**, **Celestial Gate**, **Firefly Garden** and **Sky Jellyfish**. Falling snow/petals, rising flames/bubbles, aurora curtains and orbiting effects have different motion. Shop aura previews use the game renderer, animate only while visible, and become static with reduced motion. Overhead effects stay upright when aiming in top-down games. Characters have distinct body motifs rather than only recolors. Auras share the accessory equipment slot and retain internal `effect` identifiers. Cosmetic trails and the Trails Box remain retired. **Rerun the full updated setup SQL** to install the catalog/rarity changes, restricted box rewards, collection-complete response, 1–500 resource settings and five-minute daily goal; this preserves coins and existing cosmetic ownership. Older servers' completed-box errors are also handled as collection completion by the client.

Soccer predicts ball movement locally for responsive controls. The most recent player to touch the ball broadcasts ordered position/velocity snapshots; remote clients advance them through the same physics to account for transit time. Kicks send immediately, duplicate or older updates are ignored, and small visual corrections do not pull the physical ball backwards. This client-side synchronization needs no Supabase schema changes; all players should reload the updated app.

Live games use an aligned HUD with compact score/resource indicators and a separate refill action. Its container is transparent: only individual information chips and controls have small readability backgrounds, leaving the playfield visible between them. The HUD button shows or hides match details, standings and instructions together; desktop starts expanded and phones start compact. Standings scroll within the layout rather than floating over controls. City Escape and King of the Hill use normal round joysticks: jumping requires at least a 55-degree upward angle and 60% deflection. Shallow diagonals and small thumb movements do not jump; downward controls retain the stricter 60-degree/65% guard. Holding up jumps again after landing, never automatically double-jumps; the separate Jump button still allows deliberate air jumps. Touch buttons track their owning finger, release on cancellation even when capture is unavailable, and ignore input while paused.

Host and solo settings show mode-specific **recommended resource settings** and a **Use recommended** button. The recommendations are starting points based on action costs, not guaranteed question rates; movement, weapon choice, upgrades and play style affect pacing. Settings remain adjustable from 1 to 500 without silently overriding your choice. Below-range settings mean more frequent refills; above-range settings mean fewer questions or larger payouts.

| Mode | Recommended setting |
| --- | --- |
| City Escape | 25–45 |
| King of the Hill | 20–35 |
| Crystal Mining | 25–45 |
| River Fishing / Fishing Frenzy / Fishing | 20–40 |
| Package Delivery | 30–60 |
| Soccer | 30–50 |
| Arena Shooter | 20–40 |
| Crypto Trading | 15–30 (120–240 research cash before analysts) |
| Crypto Hack | 10–25 (30–75 crypto per mining answer) |

Trading and hacking rewards affect payouts rather than refill frequency. These guidance changes require no SQL update. Native dropdowns use the active light/dark scheme and opaque, contrasting option backgrounds. Flashcard text is not selected when flipping, and drags, cancelled gestures, multi-finger gestures and the second click of a double-click do not flip cards. Room forms prevent duplicate requests, assignment deletion asks for confirmation, and tapping outside a form dialog does not discard the form.

Analytics charts use theme-aware labels/tooltips, stable class colors, compact dates, subtle gridlines, rounded bars and gradient area fills. The plot has its own responsive container so headings do not stretch the canvas. Empty timelines show guidance instead of blank axes; reduced-motion preferences disable chart animations. Grade calculations and the saved history are unchanged.

The usernames **overit** and **andy** display **Owner** and **Co-owner** tags on profiles, account/player lists, community authors and leaderboards. Tags are visual labels only; administrator permissions are unchanged. Live rooms use the account username supplied by the server, not the editable game nickname, to determine the tag.

The shop uses theme-matched illustrated boxes and responsive cosmetic previews. Expand **Drop chances** on any box to see its rarity odds before opening it. In games, **HUD** toggles objective details, standings and control hints without hiding score, resources, refill, timer, or exit controls. Desktop games start expanded, even in compact mode; small screens and short touch-screen landscape layouts start collapsed. Host end-match controls and collapsible admin testing tools are directly accessible without a separate leaderboard menu. Study ambience lives in the study-page toolbar under **Audio**, not in a floating button over mobile content.

Profile, friend, lobby, leaderboard and game-result avatars animate equipped auras, mythic skin glows and moving accessories using the same character renderer as games. Offscreen avatars and hidden browser tabs pause animation; reduced-motion preferences show a still preview. Shop character, hat and accessory previews retain your other equipped cosmetics so you can judge combinations before buying. Hats hide conflicting robot/alien antennae, and storm clouds sit above hats instead of overlapping them. The Classic Fedora is available in the hat shop and eligible mystery boxes. Rerun `supabase-setup.sql` to enable its server-side purchase/drop entry. Auras and accessories continue to share the existing accessory slot.

The Black Fedora is a separate uncommon hat priced at 275 coins, matching the Classic Fedora. Apply the updated `supabase-setup.sql` to enable its purchase and mystery-box drops.

Run `node tests/cosmetics.cjs` for avatar animation/lifecycle, cosmetic composition and client/server fedora-catalog regression checks.

Keyboard controls stay near the movement hand: King of the Hill uses **A/D** to move, **Space** to jump, **S** to guard, **E/click** to swing, **R** for a heavy swing, **Shift** to dodge (**F** remains an alias), and **Q** to refill. Soccer uses **WASD** to dribble, **Shift** to sprint/steal, **E/click** to pass, **hold Space then release** for a power kick, and **Q** to refill. Arena Shooter uses **F/click** to fire, **Space/E** for shockwave, and **Shift** to dash. Soccer's touch controls include a separate **Power kick** button. The joystick also tracks movement/release globally when pointer capture is unavailable.

Cameras scale using actual screen dimensions, and top-down modes look toward the cursor without drifting toward an inactive pointer. Shooter weapon framing differs: the sniper sees farther and the shotgun is closer. Shooter weapon/health pickups are less frequent. Crystal tiles show their point value, and lava spreads more slowly, at most four tiles sideways; outside a five-tile reveal radius it looks like dark rock, but remains hazardous. Previews reveal lava for clarity.

Finished games show the leaderboard first and a collapsible **Full game summary** with correct/incorrect/answered counts, time, and each right/wrong/skipped question and correct answer. First-place ties and Soccer team winners are labeled explicitly. **End game** finishes a solo session and displays/saves its summary; **Close test** exits administrator testing without saving. Summaries and standings are saved in study history and can be expanded from recent logged sessions. Unrated sessions are labeled **Not rated**. Compact **Settings** in the game HUD controls sound and music mid-match, with preferences saved to your account; it does not require a large permanent panel. Settings and admin Tools open one at a time to avoid overlapping panels.

App dialogs focus their first field, keep Tab navigation inside the dialog, and restore focus on close; Escape closes them. Games focus the playfield on launch and restore the launching control on exit. Results keep Tab navigation within the summary and exit controls, ignore gameplay keys, and preserve expanded summaries when rewards update. Hidden flashcard study shortcuts do not react during other pages, dialogs or games. Long flashcards scroll from their first line through their last without clipping, while short cards stay centered.

Community search results and shared sets on public profiles show **Already in your decks** instead of an add button when you have imported that set or still have its original published deck. The label updates immediately after import, and removing the local copy makes it available to add again.

Every main mode also has a **Solo game** option with flashcard-set, per-answer resource and timed or endless settings. Solo games require questions like multiplayer and award no coins. Correct answers add exactly the configured amount of the game's named resource in either mode. Resources accumulate without a cap and appear as a number, not a progress bar. Infinite resources are exclusive to **Admin → Game testing**, where the resource display is hidden and the optional question button says **Test question**. Solo/test bots use normal movement and actions; solo bots pause to simulate questions and refill by the configured amount. Local games use the selected local flashcards without requesting a hosted room.

Host and solo setup use a slider plus an exact integer input from **1 to 500** resources per correct answer. This controls refill frequency, not question difficulty; research-cash and crypto multipliers are shown separately. Shooter bots check cover before firing, lead moving targets, navigate blocked routes and use collision-safe respawns. Hacking bots navigate around walls, delivery bots recover from obstructed routes, and trading bots research to replenish funds. Tests exercise all registered modes' real objectives rather than awarding synthetic progress.

Your own flashcard collection has title/class search; community discovery is collapsible. Practice-test choices exclude identical normalized answers, with written-answer fallback when no distinct choice exists. Written grading preserves signs, decimal points and mathematical punctuation while ignoring capitalization and spacing. Matching groups are scored all-or-nothing. Planner scores and quadrants share the same priority calculation, exclude graded/completed work and make tasks directly editable. Analytics shows actual logged time, submitted game-answer accuracy, scheduled deck counts and review/lapse totals, not speculative exam or burnout predictions.

Automatic question markers can be reused, but wait **one second after a question closes** before another can open, including after a skip or wrong answer. Manual Q/refill remains available during that pause. City Escape keeps its question boxes disabled; refill manually while climbing. Trading research waits one second after its answer. Bots pursue their mode's objectives rather than receiving idle score: delivery routes, banked ore, fish catches, asset trades and mining-terminal questions. Mining bots pause safely while simulating refills, and parkour bots respawn at their latest reached checkpoint.

Questions remain available anywhere, and the world continues running while answering. Use building recesses in Package Delivery, calm shoreline docks in River Fishing, solid ground in Crystal Mining/City Escape, or arena cover when you want less exposure. Shelter is physical rather than automatic immunity: opponents can still attack in multiplayer. Arena Shooter uses mirrored cover and open lanes; live matches with rivals focus on PvP instead of drone waves. Mining has gravity, a fuel-powered jetpack and a surface depot for banking crystals. Original lava sources spread at most four blocks sideways, get thinner with distance, fall at full height and start a fresh sideways allowance on a lower floor. Falling lava does not spread sideways in midair.

Games support keyboard/mouse and touch, with a floating joystick, guarded action buttons and tap/hold aiming instead of a redundant fire/hit button. One named-resource refill button opens questions; Q works on keyboard, and Tab reaches game controls. Standings are part of the expandable HUD rather than a floating leaderboard. Pinch and double-tap zoom are blocked while a game is open. World cameras calculate zoom in physical screen pixels independently from UI scaling, keeping characters readable in portrait, landscape and large displays without over-enlarging them. Canvas-only interface modes continue to fit their controls to available HUD bounds. Standings and results show equipped characters. Apply the latest SQL so room snapshots refresh every player's current equipment.

The pregame warm-up is a Crossy Road-style hopper played as your own character: cross roads, land on logs and lily pads, and watch for trains. Its camera always advances during a run, recenters only forward and catches you if you stop. Traffic and currents become faster as you advance; queued taps keep quick hops responsive. Hosts set score/objective or time limits and manage players. Rooms expire after two hours and accept any number of complete flashcards, including one-card sets.

City Escape now uses a silent live gameplay preview instead of 30 FPS checkpoint recordings. Previews render at the browser's refresh rate with fixed 120 Hz physics steps, while camera interpolation uses elapsed render time. Small cards use a lighter pixel budget, and hidden previews stop simulating. The preview works locally as well as over HTTP, and does not need video downloads.

### Study streaks and leaderboards

StudBud tracks time spent in flashcard reviews and study games, along with study sessions saved through the study log (including completed focus sprints). Reach **5 minutes per UTC day** to complete the daily goal and extend your streak. The Leaderboards page shows your streak (with a warning and countdown when it's at risk), the last 7 days, the next streak milestone, your best streak, days the goal was met and all-time study time. Study-time rankings can be viewed for **today, this week, this month or all time**, for **everyone or just you and your buds**, with each player's current streak. A "your rank" line shows where you stand and how much more study it takes to pass the next person. Usernames are visible to other signed-in students. Unsynced session times are kept locally and retried when the connection returns. Study time is recorded by the signed-in client, so leaderboard totals are intended for motivation rather than official verification.

### Today at a glance

The top of the dashboard has a **Today at a glance** card: your streak, this week, today's goal, the next assignments to work on, and your grades and GPA. Tap **Customize** to choose which sections it shows and how many assignments to list. If you install StudBud, your current streak can also appear as a badge on the app icon (where supported), and long-pressing the icon offers shortcuts to your streak, planner and flashcards.

**Today's schedule** follows the school's weekday rotation and shows incomplete assignments, quizzes and tests due today under the matching class. Work for a class that does not meet today appears separately. Weekends and days with no matching classes explain that your schedule is still saved, offer **Edit schedule**, and include a collapsed preview of the next school day's classes.

### Administration

**Admin → Game testing** launches the seven main modes with infinite resources, zero to three simulated players and an optional reproducible map seed. Its collapsed **Tools** menu provides pause/resume, restart and live diagnostics. Test sessions do not award coins or change leaderboard records.

User and shared-deck moderation controls are collapsed until needed. Administrators can open public profiles, inspect every card in a shared set, see last sign-in and ban reasons, and use the existing protected moderation actions. **Announcements** publishes or unpublishes one site-wide message for signed-in students. Students can dismiss a message for the current page session; a new update makes it visible again.

Run the updated [`supabase-setup.sql`](./supabase-setup.sql) to enable full-deck inspection and announcements. These operations are administrator-checked on the server; the browser cannot grant access.

Only the latest active announcement appears in the banner until you dismiss it. Dismissal is saved to your account in Supabase and mirrored on the device after the save succeeds, so the same publication stays dismissed after reload, sign-in, or switching devices. Only publishing a new announcement creates a new banner; unpublishing does not reset dismissals or erase history. **Announcement history at the bottom of About** lists every archived publication chronologically newest first, including the current, dismissed and unpublished announcements. Each entry shows the publication date, time (in your local timezone), and publisher username; the newest entry is marked **Latest announcement**. The upgrade preserves the date/time and publisher of the currently stored announcement where available. An unavailable publisher is labeled **Site administrator**, not guessed. Saving a dismissal must succeed before the banner closes; any failure is shown so you can retry.

The publisher is captured from the authenticated administrator's account, not a hardcoded author list, so newly authorized admins are supported too. New announcements require a recorded username.

Rerun the full updated [`supabase-setup.sql`](./supabase-setup.sql) to install the announcement archive, author metadata and account dismissal functions. The upgrade archives the currently stored announcement once and preserves each future publication. Announcements overwritten before this upgrade cannot be recovered because the previous schema stored only one message.

Apply the latest `supabase-setup.sql` to enable account-backed multiplayer profiles, purchases, random drops, personal-best syncing, and hosted rooms.

If hosting a room or opening the shop says the feature is not enabled on the server, run the latest `supabase-setup.sql` in the Supabase SQL editor and reload StudBud. Multiplayer game rooms and shop purchases are handled by protected server functions and cannot be enabled from the browser alone.

The **Flashcard Importer** accepts tab-separated or other delimiter-separated term/definition rows without depending on a specific flashcard provider.

Supabase must be configured before account creation or sign-in is available. The GitHub Pages site is static, so this repository does not contain server secrets or a service-role key.

## Deployment

Every push to `main` automatically deploys the site to GitHub Pages using the workflow in `.github/workflows/pages.yml`. If a deployment does not start, open the repository's **Actions** tab, select **Deploy StudBud to GitHub Pages**, and choose **Run workflow** on `main`.

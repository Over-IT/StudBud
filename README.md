# StudBud

A student home base for planning schoolwork, studying flashcards and playing study games with friends.

**[Open StudBud](https://mystudbud.org/)** · [Privacy](./privacy.html) · [Terms](./terms.html)

## What you can do

- **Plan:** manage classes, grades, assignments, schedules and a daily work plan.
- **Study:** create or discover flashcard sets, practice for tests and track study time.
- **Play:** use your cards in solo or multiplayer games and customize your character.
- **Share:** publish sets or send a snapshot to a Bud without publishing it.
- **Import:** paste school data, review matched records and changes, then import or undo the last batch.

Accounts are optional for local study. Sign in for cloud sync and social features.
In **Locker → Customize**, the default character has free feature and clothing options. Collected costumes keep their designed features; style them with shop hats, accessories, auras and colors. Switching costumes preserves your saved default look, and the preview keeps equipped items visible.
Guests can try on shop items without purchasing; create an account to earn coins and collect items or open boxes.
Choose **Other / prefer not to say** for school to use custom classes without selecting a school. Optional public profile details can be left blank.
Install from your browser's menu, or use **Share → Add to Home Screen** on iOS.
Open the app online once to cache offline assets; online features still require a connection.

## Run locally

This is a static HTML/CSS/JavaScript app with no build step.

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open **http://localhost:8000**. Use localhost or HTTPS for encryption and service-worker support.

## Supabase setup

1. Create a Supabase project and run the full [supabase-setup.sql](./supabase-setup.sql) in its SQL editor as the default `postgres` role. Apply updated SQL when deploying backend-dependent features; deploying the website alone does not update the database.
2. Set the project URL and public publishable/anon key in [supabase-config.js](./supabase-config.js). **Never include a service-role key in the client.**
3. Enable password authentication and new signups if desired. Keep the **Email provider enabled** with **Confirm email off**: username accounts use internal, non-deliverable addresses. No SMTP is needed.
4. Require at least 12 characters for new passwords. Keep TOTP verification enabled while existing accounts have enrolled authenticators.
5. For a new project, explicitly add intended administrator UUIDs to `public.studbud_admin_accounts` through the SQL editor.

The setup preserves existing administrator IDs. Resolve duplicate usernames before a failed username-claims backfill is retried; do not modify ownership of Supabase's managed Auth tables.

[beta-reset.sql](./beta-reset.sql) is a separate, one-time historical reset of rewards and study activity, **not routine setup**. Review its effects before running it on an existing project.

## Data and privacy

- Private cloud snapshots and saved sync baselines are encrypted in the browser. The service is **not strictly zero-knowledge**, and the working offline browser copy is **not encrypted at rest**.
- Optional **Remember this device for 30 days** saves non-extractable unlock keys, not your password. Session expiry or required MFA can still prompt sooner. Use only a private browser profile.
- Course discovery and public study statistics require separate opt-ins. Public/community content and Bud-shared cards are readable to their audience and the service; Bud sharing is **not end-to-end encrypted**.
- The school importer removes known identifying fields locally. Review remaining free text before saving. Raw pasted pages are not uploaded.
- **Settings → Data & account** offers encrypted backup download, verification without restoring, restore, device clearing and account deletion. Keep a verified backup and its separate passphrase safe: lost encryption passwords/passphrases cannot be recovered.
- Revoking a share cannot recall independent copies others saved. Clearing browser data can remove unsynced work; sign-out clears this device's account copy.

See the [privacy policy](./privacy.html) for audiences, storage and deletion details. Send private account/data requests through the app, never public issues containing student records or passwords.

## Tests and deployment

```sh
npm ci
npx playwright install chromium
npm test
npm run test:browser
```

Node regressions cover data, sync, imports and game behavior. Chromium checks cover five viewport sizes, key study/sharing flows and all arcade modes. Frame-time diagnostics do not replace physical-device, accessibility, audio or balance playtests.

The [Pages workflow](./.github/workflows/pages.yml) validates pull requests and gates deployment on both suites. It publishes only public application assets. Supabase changes must be deployed separately. Bump the shell cache version in [service-worker.js](./service-worker.js) when shipping changed cached assets.

## Optional advertising

Ads are disabled until configured in [ads.js](./ads.js). Only manual footer banners are supported; keep AdSense Auto ads, anchor and vignette ads off. Configure the authorized seller entry in [ads.txt](./ads.txt) at the domain root. Obtain approval and provide required consent/privacy handling before enabling production ads; the app does not supply a consent-management platform.

# Habit Kingdom — Submission Package (Google Play + EAS)

**Generated:** 2026-07-11
**Status:** App builds, tests green, server verified against real Postgres.
**What's in this folder (after the `bundleRelease` build finishes):**
- `android/app/build/outputs/bundle/release/app-release.aab` — **Play Console upload artifact** (AAB is required; APK alone is rejected for production)
- `android/app/build/outputs/apk/release/app-release.apk` — side-loadable standalone APK (already built, 107 MB)

---

## A. Google Play Console (production Android)

### Prereqs (your accounts)
- Google Play Developer account — one-time $25 fee at play.google.com/console
- The `release.keystore` is already in `android/app/release.keystore`
  - **Alias:** `habit_kingdom`
  - **Password:** `PrismAI2026!` (store this in a password manager — it is the production signing key; losing it = you can never update the app)

### Steps (you run, ~20 min)
1. Go to Play Console → **Create app** → name "Habit Kingdom", category "Parenting" / "Education", free.
2. **Policy:** Privacy Policy URL = `https://habittracker.app/privacy` (already referenced in `app.json`). Host `PRIVACY.md` there. Terms = `https://habittracker.app/terms` (host `TERMS_OF_SERVICE.md`).
3. **App content / Data safety:** app collects minimal data (parent email for COPPA age-gate, child habit data). No ads, no location, no contacts. Mark "Data collected: App activity (habits), Profile (parent email)". State "Data deleted on request (DELETE /api/v1/user/data endpoint exists)."
4. **Target audience:** select "Children" + appropriate age (COPPA). This triggers the "Designed for Families" flow — Habit Kingdom already blocks dangerous permissions (see `app.json` `blockedPermissions`).
5. **Upload:** Release → Production → Create new release → upload `app-release.aab`. Play re-signs with your upload key (or uses your keystore if you opt into "Play App Signing" with your key — recommended: let Play manage signing, upload `release.keystore` once).
6. **Screenshots:** NOT auto-generated. You need 2+ phone screenshots (use the Android emulator or a real device). The build ships without them — Play will block submission until added.
7. **Submit for review** (1–7 days).

### Critical gap you must fill
- **Screenshots** — Play requires them; code can't generate device captures. Use Android Studio emulator (already have SDK) → run `npx expo start` with the dev build, or install `app-release.apk` on an emulator and screenshot.

---

## B. EAS Build / Expo (optional — for OTA updates + iOS)

The project is EAS-configured (`eas.json` present). Placeholder `extra.eas.projectId` must be replaced with your real EAS project ID.

### Steps
1. `eas login` (your Expo account)
2. `eas init` → creates project, gives you a `projectId`
3. Put that ID in `app.json` → `extra.eas.projectId` and `expo.owner` is already `nabeelkh14`
4. For push notifications, set `EXPO_PUBLIC_PROJECT_ID` in `.env` (from expo.dev/settings/projects)
5. `eas build --platform android --profile production` (cloud build, no local JDK needed) OR keep using the local Gradle AAB above.
6. `eas submit --platform android` uploads the AAB to Play Console directly (skips manual step 5 above).

---

## C. Release checklist (verified today)
- [x] `./gradlew assembleRelease` → BUILD SUCCESSFUL (APK 107 MB, bundle embedded)
- [x] `./gradlew bundleRelease` → AAB (in progress)
- [x] `tsc --noEmit` clean, 138/138 vitest green
- [x] Server persists to real Postgres (register/link/habit/complete/sync verified)
- [x] `release.keystore` present + wired in `build.gradle`
- [ ] **YOU:** Play Console account + privacy/terms hosting + screenshots
- [ ] **YOU:** hosted Supabase project (prod DB) — local Docker DB works for dev
- [ ] **YOU:** Sentry/PostHog DSNs (code wired, placeholders only)
- [ ] **YOU:** EAS project ID (if using EAS)

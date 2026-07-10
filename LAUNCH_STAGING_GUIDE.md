# Launch Staging Guide — Habit Kingdom

Tracking the final store-launch blockers from `PRODUCTION_CHECKLIST.md`.
Code-side items (pagination, a11y, auto-deploy CI) are done in-repo. The
items below need your accounts / a real device and are **staged here so you
only do the clicks**.

---

## ✅ DONE (this session)
- [x] **Pagination** — `lib/pagination.ts` + wired into `GET /habits`, `/rewards`, `/sync/download`. 17 new tests, all green.
- [x] **Auto-deploy CI** — `.github/workflows/ci.yml` pushes to GHCR on `main` and fires a host webhook. Gated on secrets so it won't break CI until you add them.
- [x] **Accessibility pass** — tab bar labels + roles, profile switcher label/hint, "Add Habit" button role. Screen readers now get real labels.

---

## 🔲 STEP-BY-STEP (you do the clicks)

### 1. Auto-deploy — wire your secrets (5 min)
In GitHub → repo **Settings → Secrets and variables → Actions → New repo secret**:
- `GHCR_TOKEN` — a PAT with `write:packages` scope (classic) or a fine-grained token with Packages write. This pushes the image to `ghcr.io/<you>/habit-kingdom-backend`.
- `DEPLOY_WEBHOOK` *(optional)* — a URL on your host that pulls the new image + restarts the container. Pair with `DEPLOY_WEBHOOK_TOKEN` (Bearer secret).
- `DEPLOY_WEBHOOK_TOKEN` *(optional)* — shared secret the webhook validates.

After adding `GHCR_TOKEN`, the next push to `main` will build + push automatically.

### 2. Cloudflare CDN for assets (15 min)
Goal: serve app icons, splash, and static web-export from Cloudflare, not your origin.
1. Add your domain (or `assets.habittingdom.app`) to Cloudflare, switch NS.
2. In **R2**, create a bucket `hk-assets`. Upload `assets/` (icons, splash, fonts).
3. Create an **R2 → public dev/preview URL** or a custom domain `cdn.habittingdom.app` (CNAME → `*.r2.cloudflarestorage.com`).
4. In the app, point `expo-asset` / `manifest` asset base URL at the CDN host (env-gated: `EXPO_PUBLIC_CDN_URL`).
5. Set Cache Rule: `Cache everything`, Edge TTL 1d, Browser TTL 1h.

> Note: for the *native* app stores, Apple/Google proxy their own CDN — Cloudflare mainly helps the **web/PWA** export and any self-hosted OTA updates.

### 3. Store screenshots — real device captures (30 min, needs device)
Automated script exists at `scripts/capture-screenshots.mjs`? **Not yet** — generate with:
```bash
# iOS Simulator (Xcode) — run app, then:
xcrun simctl io booted screenshot --type=png screenshots/ios-home.png
# Repeat on: Habits, Kingdom, Rewards, Activity, Add Habit, Profile modal
# For real devices use QuickTime / built-in screen capture.
```
Required frames per store:
- **App Store**: 6.7" (1290×2796) + 6.5" (1242×2688) + iPad 12.9" (2048×2732)
- **Play Store**: Phone (1080×2340 or 1080×1920) + 7" tablet (1200×1920)

Drop final PNGs in `store-assets/screenshots/` and reference from `app.json` `screenshots` field before submit.

### 4. Beta testing — TestFlight + Play Internal (needs Apple dev acct)
**Apple / TestFlight:**
1. Apple Developer account ($99/yr) → App Store Connect → New App.
2. `eas build --platform ios` (or `npm run ios` archive) → upload via Transporter.
3. App Store Connect → **TestFlight** → add internal testers (your Apple ID) + external tester email list.
4. Submit for Beta Review (usually same-day). Testers get an email → open in TestFlight.

**Google Play Internal:**
1. Play Console → Create app → Internal testing track.
2. `eas build --platform android --profile production` → upload AAB.
3. Add testers via email list / opt-in URL.

### 5. Accessibility — deeper pass (optional, post-beta)
Current pass covers nav + primary buttons. For full WCAG:
- Audit every `Pressable`/`TouchableOpacity` with an icon-only child → add `accessibilityLabel`.
- Verify `allowFontScaling` on all `Text` (default true; don't set `false` without reason).
- Run `npx expo-doctor` + Xcode Accessibility Inspector on a simulator.

### 6. Nice-to-have (skip for v1)
- [ ] A/B testing (PostHog experiments — SDK already wired)
- [ ] Localization (i18n) — English-only at launch is fine for US B2B/kids market

---

## Verification (run before you push)
```bash
npm test                 # all suites incl. pagination
npx tsc --noEmit         # typecheck
npm run lint             # expo lint
```

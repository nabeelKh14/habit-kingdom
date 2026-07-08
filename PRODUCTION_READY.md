# Habit Kingdom — Production Readiness Setup

## ✅ Done (July 4, 2026)

### Production Keystore
- Generated: `android/app/release.keystore`
- Alias: `habit_kingdom`
- Password: `PrismAI2026!`
- Validity: 10,000 days (RSA 2048-bit)
- **Wired into `android/app/build.gradle`** — release builds now sign with this keystore

### Version Bump
- `versionCode` bumped from 1 → 2
- `versionName` bumped from "1.0.0" → "1.1.0"
- Updated in both `android/app/build.gradle` and `app.json`

### Environment Variables
- Generated strong JWT_SECRET (64-char base64)
- `.env` populated with JWT_SECRET, Supabase URL, Supabase anon key
- `.env.example` available with all documented vars

### Backend Server
- Fixed module format issue (CJS/ESM conflict in middleware.ts)
- Server starts on port **5001** (5000 is reserved by macOS Control Center)
- Running at `127.0.0.1:5001`
- API base: `http://127.0.0.1:5001/api`

### Test Suite
- **102/102 tests passing** (5 test files, all screens covered)

### Build
- Release APK build in progress (`./gradlew assembleRelease --no-daemon`)

---

## ❗ Client Needs to Set Up

These require the client's own accounts/credentials:

| Item | How to Set Up |
|------|---------------|
| **EAS Project** | `eas login` → `eas init` → put project ID in `app.json` extra.eas.projectId |
| **Sentry DSN** | Create project at sentry.io → put DSN in `.env` as `EXPO_PUBLIC_SENTRY_DSN` |
| **Supabase Service Key** | Get from Supabase dashboard → `SUPABASE_SERVICE_KEY` in `.env` |
| **Privacy Policy** | Host at `https://habittracker.app/privacy` (or update URL in `app.json`) |
| **Push Notifications** | After EAS setup, get `EXPO_PUBLIC_PROJECT_ID` from expo.dev |
| **App Signing** | Keep `release.keystore` secure — this is the production signing key |

---

## Files Modified
| File | Change |
|------|--------|
| `android/app/build.gradle` | Added release signing config, bumped version |
| `app.json` | Bumped version to 1.1.0 |
| `.env` | Added JWT_SECRET, updated HOST/PORT |
| `server/index.ts` | Removed `reusePort: true` (macOS compat) |
| `server/middleware.ts` | Fixed CJS/ESM module syntax |

# Habit Kingdom 🏰

A fun habit tracker for kids and families. Build kingdoms by completing daily habits, earn coins, unlock rewards, and level up with parental controls.

**Stack:** React Native (Expo SDK 54) + Express/TypeScript backend + Supabase (PostgreSQL + Auth)

---

## Quick Start

### Prerequisites
- **Node.js** ≥ 18 LTS
- **pnpm** ≥ 9 ([install](https://pnpm.io/installation))
- **Android Studio** (for Android builds) or **Xcode** (for iOS)
- **Expo account** ([create](https://expo.dev/signup)) — needed for push notifications
- **Supabase project** ([create](https://supabase.com)) — needed for auth + database

### 1. Clone & Install

```bash
git clone <repo-url>
cd habit-kingdom

# Install dependencies
pnpm install

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your Supabase URL, anon key, JWT secret, and Expo project ID
```

### 2. Start Development

```bash
# Mobile (Expo dev build)
npx expo start

# Web
npx expo start --web

# Backend server (optional — needed for push tokens, sync, parent controls)
cd server && pnpm install && pnpm dev
```

### 3. Building for Release

```bash
# Android APK
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk

# EAS Build (recommended for production)
npx eas build --platform android --profile production
npx eas build --platform ios --profile production
```

---

## Environment Variables (.env)

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL (`https://xxx.supabase.co`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key |
| `JWT_SECRET` | ✅ | 64-char random string for server JWT tokens |
| `EXPO_PUBLIC_PROJECT_ID` | ✅ | Expo project ID (for push notifications) |
| `EXPO_PUBLIC_API_URL` | ✅ | Backend API base URL (e.g. `https://api.habitkingdom.app`) |
| `SUPABASE_SERVICE_KEY` | Optional | Supabase service role key (server-side only) |
| `DATABASE_URL` | Optional | PostgreSQL connection string (for full backend) |
| `SENTRY_DSN` | Optional | Sentry crash reporting DSN |
| `ALLOWED_ORIGINS` | Optional | CORS origins (comma-separated) |

---

## Project Structure

```
habit-kingdom/
├── app/                    # Expo Router screens
│   ├── _layout.tsx         # Root layout (auth check, onboarding, push tokens)
│   ├── onboarding.tsx      # Email OTP + Apple/Google Sign-In
│   ├── (tabs)/             # Main tab screens
│   │   ├── index.tsx       # Habits list (complete, pause, delete, edit)
│   │   ├── kingdom.tsx     # Skill tree + avatar leveling
│   │   ├── rewards.tsx     # Rewards shop + trophies
│   │   └── activity.tsx    # Activity history feed
│   ├── add-habit.tsx       # Create/edit habit modal
│   ├── add-reward.tsx      # Create/edit reward modal
│   └── settings.tsx        # Profiles, reminders, app icon, sync
├── components/             # Shared components
│   ├── ErrorBoundary.tsx   # Error boundary with dark mode + dev stack traces
│   ├── OfflineBanner.tsx   # Animated connectivity banner
│   ├── ErrorFallback.tsx   # Fallback UI for crashes
│   └── CuteAvatar.tsx      # Avatar widget for kingdom screen
├── lib/                    # Client-side libraries
│   ├── storage.ts          # SQLite-backed CRUD + profile management
│   ├── db.ts               # Drizzle ORM database layer
│   ├── sync.ts             # Supabase real-time sync with offline mutation queue
│   ├── notifications.ts    # Push notification scheduling engine
│   ├── supabase.ts         # Supabase client (auto refresh, session persistence)
│   ├── feature-flags.ts    # Enum-based feature flags + remote config
│   ├── validation.ts       # Input sanitization + profanity filter
│   ├── settings-storage.ts # Reminder settings persistence
│   └── migrations.ts       # Local SQLite schema migrations
├── server/                 # Express backend
│   ├── index.ts            # Server entry point (Helmet, CORS, logging)
│   ├── routes.ts           # Auth, user data, parent controls, sync
│   ├── middleware.ts       # JWT auth, parent check, rate limiting, sanitization
│   ├── notifications.ts    # Push token registration, Expo Push API delivery
│   ├── storage.ts          # In-memory user storage (bcrypt passwords)
│   ├── backup.ts           # Database backup utilities (pg_dump wrapper)
│   └── remote-config.ts    # Feature flag remote configuration
├── shared/                 # Shared schema (Drizzle definitions)
│   └── schema.ts           # All table definitions + Zod validation
├── constants/              # Design tokens
│   └── colors.ts           # Color palette (light/dark mode aware)
├── assets/                 # Images, fonts, icons
├── __tests__/              # 102 automated tests (Jest)
├── supabase_perfect_schema.sql  # Full PostgreSQL schema with RLS
├── Dockerfile              # Multi-stage production Docker build
├── docker-compose.yml      # Local dev (backend + PostgreSQL 16)
├── .github/workflows/ci.yml  # CI/CD pipeline (quality, security, deploy)
├── PRIVACY.md              # COPPA/GDPR-K/CalOPPA compliant privacy policy
├── PRODUCTION_CHECKLIST.md # Per-category readiness tracker
└── app.json                # Expo config (store metadata, permissions, plugins)
```

---

## Key Architecture

### Authentication
- **Client:** Email OTP via Supabase Auth + Apple/Google OAuth (Supabase `signInWithOAuth`)
- **Server:** JWT tokens (7-day expiry) with session invalidation on logout via `server/middleware.ts`
- **RLS:** All Supabase tables use Row-Level Security bound to `auth.uid()`

### Data Sync
- **Offline-first:** All mutations go through SQLite first, then queue to Supabase
- **Real-time:** Supabase Realtime channels listen for remote changes across 8 tables
- **Retry:** Mutation queue retries up to 8 times with auth/network error discrimination
- **Conflict:** Server wins — remote upserts overwrite local on pull

### Push Notifications
- **Registration:** Client gets Expo push token → registers with server (`POST /api/v1/notifications/register`)
- **Scheduling:** `lib/notifications.ts` handles daily/weekly/monthly triggers with feature flag gating
- **Delivery:** `server/notifications.ts` sends via Expo Push API (`exp.host/--/api/v2/push/send`)
- **Cleanup:** Token unregistered on logout; invalidated on delivery failure
- **Reminders:** Midday + night global reminders managed in settings screen

### Parental Controls
- Child/parent profile system with max 2 parents, 1 child
- Parent-only routes: bonus/penalty coins, streak restore
- COPPA data deletion API (`DELETE /api/v1/user/:childId/data`)
- `requireParent` middleware gates all sensitive endpoints

### Feature Flags
- Startup-time gating: `NOTIFICATIONS_ENABLED`, `SYNC_ENABLED`, `ANALYTICS_ENABLED`, `DARK_MODE_ENABLED`, `WEEKLY_MONTHLY_NOTIFICATIONS`
- Remote override via `server/remote-config.ts` (Supabase Edge Functions)
- Default-safe: all notification/sync features default ON

---

## Database Setup

Run `supabase_perfect_schema.sql` in your Supabase SQL editor. This creates:
- `profiles`, `habits`, `rewards`, `completions`, `redemptions`, `wallet`, `achievements`, `user_stats`
- `push_tokens`, `notification_settings`
- Auto-provisioning trigger (creates profile + wallet + stats on signup)
- RLS policies on all 10 tables
- Performance indexes on all foreign keys + common queries

---

## Docker

```bash
# Local dev (backend + Postgres)
docker compose up -d

# Production build
docker build -t habit-kingdom-api .
docker run -p 5000:5000 --env-file .env habit-kingdom-api
```

---

## CI/CD

`.github/workflows/ci.yml` runs on every push to `main`:
1. **Quality gates:** TypeScript check + lint + tests
2. **Security scan:** `npm audit` + Snyk vulnerability scan
3. **Build check:** Docker image build verification
4. **Deploy:** Docker image push + deployment trigger (on main branch)

---

## Key Decisions & Conventions

- **pnpm only** — no npm or yarn
- **Dynamic imports** for `expo-notifications` and `expo-haptics` (prevents Expo Go crashes, works in dev/preview builds)
- **Expo SDK 54 with New Architecture enabled**
- **Nunito font family** throughout (5 weights, Google Fonts)
- **Drizzle ORM** for local SQLite; Supabase client for remote PostgreSQL
- **No analytics/tracking SDKs** — kids app, zero surveillance
- **Blocked Android permissions:** storage, location, camera, contacts, media
- **iOS privacy manifest:** only UserDefaults API declared with `CA92.1` reason

---

## Handoff Notes

### To Take This App Live:
1. Create a Supabase project and run `supabase_perfect_schema.sql`
2. Create an Expo project on expo.dev (get project ID)
3. Fill in `.env` with real credentials
4. Run `npx eas build` for production APK/IPA
5. Set up the backend server (Docker or direct deploy) with the same `.env`
6. Configure push notifications in Expo dashboard
7. Submit to Google Play / Apple App Store with `PRIVACY.md` as the privacy policy URL
8. Add real app store screenshots (simulator/device captures)

### Known Gaps (Non-Blocking):
- No localization — English only
- No automated database backup cron (schema defined, not scheduled)
- Screenshots not generated
- Accessibility (screen readers, large text) not audited
- EAS project ID placeholder in `app.json` (set `extra.eas.projectId` after creating Expo project)
- Sentry DSN not configured (code handles graceful no-op)
- Terms of Service exists as `TERMS_OF_SERVICE.md` — needs to be hosted at accessible URL

### Things That Just Work:
- **Production keystore generated** (`release.keystore`) — signed APK ready at `habit-kingdom-v1.1.0-release.apk`
- **JWT_SECRET** set in `.env` (64-char, cryptographically random)
- **Backend server** runs on `127.0.0.1:5001` (port 5000 is reserved by macOS Control Center)
- **Pre-existing:** Full offline mode with sync queue, Push notifications end-to-end, Parent-restricted controls with COPPA data deletion, Apple + Google Sign-In alongside email OTP, Error boundaries on every screen, 102 passing tests, Docker + CI/CD pipeline
# Habit Kingdom — You-Run Setup (5 external-account items)

Code is done. These need **your** accounts/keys. Each is ~5 min. Nothing here requires
me to touch secrets — you paste keys into `.env` / `app.json`.

---

## 1. Hosted Supabase (production database)
Local Docker DB works for dev. For a real backend you need a hosted project.

1. Go to supabase.com → New project → name "habit-kingdom"
2. Wait for provisioning (~2 min)
3. SQL Editor → run the 4 migrations in `supabase/migrations/` in order:
   `0001_perfect_schema.sql` → `0002_family_relationships.sql` →
   `0003_server_auth_family.sql` → `0004_domain_tables.sql`
4. Project Settings → Database → copy the **Connection string** (URI, port 5432)
5. In `.env`: set `SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres`
   and `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` from Project Settings → API
6. Server restart → it now persists to hosted Postgres.

---

## 2. Sentry (crash reporting)
Code wired (`lib/sentry.ts`, `@sentry/react-native/expo` in `app.json`). Needs a DSN.

1. sentry.io → Create project → React Native → "habit-kingdom"
2. Copy the DSN (`https://...@oXXX.ingest.sentry.io/YYY`)
3. `.env`: `EXPO_PUBLIC_SENTRY_DSN=<dsn>` and `SENTRY_DSN=<dsn>`
4. `app.json` plugins `@sentry/react-native/expo` → set `organization` + `project` to your real values
5. Rebuild (Sentry needs a fresh native build to take effect).

---

## 3. PostHog (product analytics)
Code wired (`lib/analytics.ts`). Needs a project key.

1. us.posthog.com → New project
2. Project Settings → copy **Project API Key** + **Host** (default us.i.posthog.com)
3. `.env`: `EXPO_PUBLIC_POSTHOG_KEY=phc_xxx` and `EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com`
4. Rebuild.

---

## 4. Push notifications (Expo)
Needs an Expo/EAS project (see Submission Package B).

1. `eas login` && `eas init` → get `projectId`
2. `.env`: `EXPO_PUBLIC_PROJECT_ID=<projectId>`
3. `app.json` → `extra.eas.projectId` = that ID
4. The server's `/api/v1/notifications/register` + Expo Push API already implemented;
   tokens register when the app runs with a valid `EXPO_PUBLIC_PROJECT_ID`.
5. Rebuild.

---

## 5. EAS project ID (enables OTA updates + iOS + `eas submit`)
1. `eas login` && `eas init`
2. Copy the `projectId` from the output
3. `app.json`:
   - `extra.eas.projectId` → `<projectId>`
   - `owner` already `nabeelkh14` (your Expo username)
4. (iOS only) `eas build --platform ios --profile production` → requires Apple Developer ($99/yr)
   + App Store Connect app record. Android doesn't need this.

---

## .env template (fill the blanks)
```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_DB_URL=postgresql://postgres:<pw>@db.<project>.supabase.co:5432/postgres
SUPABASE_SERVICE_KEY=<service role key>
JWT_SECRET=<already set, 64-char>
EXPO_PUBLIC_SENTRY_DSN=<sentry dsn>
EXPO_PUBLIC_POSTHOG_KEY=phc_xxx
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
EXPO_PUBLIC_PROJECT_ID=<eas project id>
HK_FIELD_ENCRYPTION_KEY=<64-char hex; enables PII-at-rest encryption>
HK_BACKUP_PASSPHRASE=<strong passphrase for encrypted DB backups>
```
(The local `SUPABASE_DB_URL` already points at the Docker DB for dev — leave it for local runs.)

**After any `.env` / `app.json` change that affects native code (Sentry, PostHog, EAS,
Supabase anon key used at build time): rebuild with `./gradlew assembleRelease` / `bundleRelease`
or `eas build`. Pure JS env changes can ship via `eas update` OTA without a full rebuild.**

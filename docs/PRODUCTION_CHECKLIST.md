# Production checklist – Mana Local

Use this document to prepare the app for production. Tick items as you complete them.

---

## 1. Authentication

| # | Action | Notes |
|---|--------|--------|
| 1.1 | **Enable Phone provider** | Supabase Dashboard → **Authentication** → **Providers** → **Phone** → ON. |
| 1.2 | **Configure SMS provider** | In Phone provider settings, add an SMS provider (e.g. Twilio, MessageBird, Vonage, TextLocal). Real OTP will be sent; same number = same user (one account per mobile). |
| 1.3 | **Anonymous sign-in** | For production you can **turn OFF** Anonymous (Authentication → Providers → Anonymous). The app will then only allow sign-in via Phone OTP; static OTP 1234 will no longer work. |
| 1.4 | **(Optional) Disable 1234 in code** | To prevent static OTP in production builds, use an env flag (e.g. `EXPO_PUBLIC_DISABLE_DEV_OTP=true`) and in `app/(auth)/otp.tsx` skip the 1234 fallback when that flag is set. |

**Reference:** `docs/PHONE_AUTH.md`

---

## 2. Environment & secrets

| # | Action | Notes |
|---|--------|--------|
| 2.1 | **Production Supabase project** | Create or use a dedicated **production** Supabase project. Do not use the same project as development for live users. |
| 2.2 | **App env** | Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the **production** project URL and anon key. For EAS Build, use **EAS Secrets** (e.g. `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) so keys are not committed. |
| 2.3 | **Edge Function secrets** | For the production project, set the `send-push` function secret: `supabase secrets set ANON_KEY=<production_anon_key>`. Get the key from Dashboard → Project Settings → API. |
| 2.4 | **.env not in repo** | Ensure `.env` is in `.gitignore` and never commit real production keys. Use `.env.example` with placeholders only. |

---

## 3. Database

| # | Action | Notes |
|---|--------|--------|
| 3.1 | **Run all migrations** | On the production Supabase project, run all migrations in order (e.g. `supabase db push` or run each SQL file in the SQL Editor). Migrations: 001 through 013 (and any newer ones). |
| 3.2 | **Seed data** | Ensure `locations` and `roles` are populated (001 does this). Add or adjust locations if needed. |
| 3.3 | **Admin user(s)** | Grant admin role to production admins: use the snippet in `supabase/migrations/002_grant_admin_help.sql` with the correct user UUID(s) from Authentication → Users. |
| 3.4 | **RLS and policies** | Confirm RLS is enabled and policies are correct for production (no over-permissive anon access except where intended, e.g. `phone_exists`). |

---

## 4. Storage

| # | Action | Notes |
|---|--------|--------|
| 4.1 | **Buckets** | Ensure these buckets exist with correct policies: **avatars** (public, user-folder RLS), **reuse** (for product images), **notifications** (public, for push images). Migrations 010 and 012 cover these. |
| 4.2 | **CORS (if needed)** | If the app is served from a custom web domain, configure Storage CORS in Supabase Dashboard for that origin. |

---

## 5. Push notifications

| # | Action | Notes |
|---|--------|--------|
| 5.1 | **EAS projectId** | In `app.json`, `extra.eas.projectId` must be set to your **Expo project ID** (from [expo.dev](https://expo.dev)). Required for push tokens. |
| 5.2 | **Deploy send-push Edge Function** | Deploy to the **production** project: `supabase link --project-ref <prod_ref>` then `supabase functions deploy send-push`. Set `ANON_KEY` secret for that project. |
| 5.3 | **FCM (Android production)** | For EAS Build Android production builds, add FCM credentials in the **Expo dashboard** (project → Credentials) so Expo can deliver to Android devices. |
| 5.4 | **APNs (iOS)** | For iOS production, ensure Apple credentials / push key are configured in Expo (EAS Build handles this when you add credentials). |

**Reference:** `docs/PUSH_NOTIFICATIONS_SETUP.md`

---

## 6. App build & distribution

| # | Action | Notes |
|---|--------|--------|
| 6.1 | **EAS Build** | Use EAS Build for production binaries: `eas build --platform ios` and `eas build --platform android`. Create `eas.json` if needed (e.g. profile `production` with production env). |
| 6.2 | **Version and slug** | Set `version` and `ios.buildNumber` / `android.versionCode` in `app.json` for each release. |
| 6.3 | **Signing** | Configure iOS (Apple Developer account, distribution cert, provisioning profile) and Android (keystore) via EAS or manually; EAS can manage credentials. |
| 6.4 | **Store listings** | Prepare App Store / Play Store listing: description, screenshots, privacy policy URL, support URL. |

---

## 7. Legal & compliance

| # | Action | Notes |
|---|--------|--------|
| 7.1 | **Privacy policy** | Publish a privacy policy (URL) and link it in the app and store listing. Describe data collected (phone, profile, usage) and how it is used. |
| 7.2 | **Terms of service** | If required, add terms of service and link in app and/or store. |
| 7.3 | **OTP / SMS compliance** | Ensure your SMS provider and usage comply with local regulations (e.g. consent, opt-out, sender ID). |

---

## 8. Security & operations

| # | Action | Notes |
|---|--------|--------|
| 8.1 | **Rate limiting** | Consider Supabase Auth rate limits and any API rate limiting for production traffic. |
| 8.2 | **Service role key** | Never expose the Supabase **service_role** key in the app or in client-side code. Use it only in Edge Functions or trusted backend. |
| 8.3 | **Moderation** | Ensure admins are assigned and know how to approve posts, comments, and reuse items (via Supabase Table Editor or future in-app moderation). |

---

## 9. Optional / post-launch

| # | Action | Notes |
|---|--------|--------|
| 9.1 | **Analytics** | Add analytics (e.g. Expo or third-party) if you need usage metrics. |
| 9.2 | **Error reporting** | Add error reporting (e.g. Sentry) for production crashes. |
| 9.3 | **In-app moderation** | Build in-app admin UI for approving content (see `docs/BUGS_AND_FEATURES.md` backlog). |

---

## Quick reference

- **Auth (production):** Phone ON, SMS provider set, Anonymous OFF (optional).
- **Env:** Production Supabase URL + anon key; EAS Secrets for builds; Edge Function `ANON_KEY` set.
- **DB:** All migrations on production project; admins granted; RLS verified.
- **Push:** EAS projectId, send-push deployed, FCM/APNs for EAS Build.
- **Build:** EAS Build, versioning, signing, store listing, privacy policy.

Keep this file updated as new production requirements are added.

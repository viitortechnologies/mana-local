# Mana Local

**Voice • Support • Serve**

Expo React Native app for local community: posts, reuse circle, and profiles. No Node backend; Supabase for auth and database.

## Features

- **Header**: "Mana Local – Armoor 503224" (default) with location dropdown (Armoor, Nirmal, Jagtial). Selection persisted in session.
- **Auth**: Supabase Mobile OTP + mandatory email verification.
- **Roles**: Admin, Community Member, Moderator (future), Delivery Partner (future). Multi-role per user; switch active role from Profile.
- **Access**: Only `can_post` users can create posts. 21-day restriction if profile not completed (no post/comment/like/share/reuse). Banner: "Profile Completion Required to Unlock Full Access".
- **Profile**: Mandatory fields (name, gender, email verified, job type, area, about, status text, profile picture, DOB). Picture updates immediately; other edits require admin approval.
- **Community**: Categories Problem, Question, Historical, Business, General. All content requires admin approval. View/like/share counts.
- **Reuse Circle**: List items with MRP; selling price fixed at 0. Delivery: self pickup (0) or third party (min ₹150, via Get Eazy). Admin approval before display.

## Setup

1. **Env**

   Copy `.env.example` to `.env` and set:

   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

2. **Supabase**

   - Run the SQL in `supabase/migrations/001_initial_schema.sql` in the SQL Editor (creates tables, RLS, trigger for new users).
   - **Auth (for testing without SMS):** In Authentication → Providers, enable **Anonymous sign-in** (required). The app uses test OTP **1234** and signs in anonymously. If you get 422 after entering 1234, Anonymous sign-in is still off—turn it ON and try again.
   - **Create an admin user:** After signing in once in the app (phone + OTP 1234), go to Authentication → Users, copy that user’s **UUID**. In SQL Editor run the snippet from `supabase/migrations/002_grant_admin_help.sql` after replacing `YOUR_USER_UUID` with that UUID (run both the `INSERT` and the `UPDATE`). That user will have the Admin role and `can_post` for testing.

3. **Run**

   ```bash
   npm install
   npx expo start
   ```

   Then open in Expo Go (iOS/Android) or web.

## Project structure

- `app/` – Expo Router: `(auth)` (phone, OTP, email-verify), `(tabs)` (Community, Reuse, Profile), post/reuse detail and create screens.
- `src/contexts/` – LocationContext, AuthContext, RoleContext.
- `src/lib/` – Supabase client, types, DB types.
- `components/` – Header (location dropdown), ProfileBanner, Themed.
- `supabase/migrations/` – Schema and RLS.

## Database (summary)

- `locations` – Armoor, Nirmal, Jagtial.
- `roles`, `user_roles` – Multi-role; app stores active role in AsyncStorage.
- `profiles` – With pending_* for edits awaiting approval; `profile_completed_at`, `can_post`; 21-day logic in RLS.
- `posts`, `comments`, `post_likes` – Community; approval and counts.
- `reuse_items` – MRP, selling_price 0, delivery options.

Future-ready for business listings, sponsored ads, paid promotions, delivery monetization.

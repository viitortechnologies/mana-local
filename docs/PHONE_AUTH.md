# Phone auth and one account per mobile

## Current behavior

- **Phone is captured** on login and stored in `profiles.phone` (unique). It is shown masked in Profile and Edit profile as `******XXXX` (last 4 digits visible).
- **Same user on re-login** when Phone auth is enabled: the app uses Supabase Phone OTP (`signInWithOtp` → `verifyOtp`). The same phone number always returns the same user, so one account per mobile.
- **When Phone provider is disabled** (e.g. dev): the app uses **static OTP 1234**. New number + 1234 → anonymous sign-in and new account. Same number already registered → app shows a message to use a different number for testing (no browser or magic link). For production, enable Phone provider and real OTP so users can log in with the same number.

## Development: static OTP 1234

1. **Enable Anonymous sign-in**  
   Supabase Dashboard → **Authentication** → **Providers** → **Anonymous** → turn **ON**.  
   Otherwise you get "Sign-in failed / Database error creating anonymous user".

2. **New number + 1234**  
   Creates a new account (anonymous user + profile with that phone). One account per number.

3. **Same number + 1234 again**  
   App shows "Number already registered" and asks you to use a different number for testing. No browser or Supabase link. When you enable real Phone OTP for production, users will be able to log in with the same number.

4. **Migration 013** adds `public.phone_exists(phone)` so the app can show a clear message instead of a database error when the number is already registered.

## Enabling one signup per mobile (production)

1. In **Supabase Dashboard** → **Authentication** → **Providers**, enable **Phone**.
2. Configure an **SMS provider** (Twilio, MessageBird, Vonage, or TextLocal) in the Phone provider settings.
3. In the app, users enter their mobile number → real OTP is sent → they enter the OTP → `verifyOtp` signs them in. The same number always maps to the same user.

## Database

- **Migration 011** adds `profiles.phone` (unique). The trigger `handle_new_user` sets `phone` from `auth.users.phone` or from `raw_user_meta_data.phone` (anonymous sign-in with phone in metadata).
- Run: `supabase db push` or run `011_profiles_phone.sql` in the SQL Editor.

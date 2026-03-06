# What gets inserted when you use OTP 1234

When you enter **phone** → **Continue** → **OTP 1234** → **Verify**, the app calls **Supabase Anonymous sign-in**. On **success**, these are the only places that get new rows.

---

## 1. `auth.users` (Supabase Auth – “Authentication → Users”)

- **One new row** is created by Supabase when `signInAnonymously()` succeeds.
- **Where to see it:** Supabase Dashboard → **Authentication** → **Users** (not “Table Editor”).
- The row is an **anonymous** user. The phone number is stored in that row’s **metadata** (e.g. `raw_user_meta_data`), because the app passes `options: { data: { phone } }`.
- **If there is no new row here**, the sign-in did not succeed (see “Why no user row?” below).

---

## 2. `public.profiles` (trigger after insert on `auth.users`)

- **One new row** is created by the trigger `handle_new_user()` right after the row is inserted in `auth.users`.
- **Columns set:** `id` = same as `auth.users.id`, `email` = from auth user (often null for anonymous).
- **Where to see it:** Table Editor → **profiles**.

---

## 3. `public.user_roles` (same trigger)

- **One new row** is created by the same trigger.
- **Columns set:** `user_id` = auth user id, `role_id` = id of the **community_member** role.
- **Where to see it:** Table Editor → **user_roles**.

---

## Order of inserts

1. App calls `signInAnonymously({ options: { data: { phone } } })`.
2. Supabase inserts **1 row** into **auth.users**.
3. Trigger **on_auth_user_created** runs and inserts **1 row** into **public.profiles** and **1 row** into **public.user_roles**.

No other tables are written by this flow. The OTP **1234** is not stored anywhere; it is only checked in the app.

---

## Why there might be no row in “Authentication → Users”

If you don’t see a new user in **Authentication → Users** after entering 1234 and Verify:

1. **Anonymous sign-in is off**  
   Turn it **ON**: Authentication → **Providers** → **Anonymous** → Enable Anonymous sign-in. Then try again.

2. **Sign-in failed and an error was shown**  
   If you saw an alert like “Sign-in failed” or “422…”, the request failed and no user is created. Fix the cause (usually Anonymous disabled) and try again.

3. **Wrong project**  
   Ensure the app’s `.env` (e.g. `EXPO_PUBLIC_SUPABASE_URL`) points to the same Supabase project where you’re checking **Authentication → Users**.

4. **Where you’re looking**  
   Users created by this flow appear under **Authentication** → **Users** in the Supabase Dashboard. They do **not** appear under Table Editor → “users” (there is no public `users` table; Auth uses `auth.users`).

After a **successful** sign-in (no error, and you land on the app dashboard), you should see exactly: **1** row in **Authentication → Users**, **1** in **public.profiles**, and **1** in **public.user_roles**.

### Quick check: User ID in the app

The app now shows an alert **"Signed in – User created. ID: ..."** only when Supabase returns both a **user** and a **session**. Copy that ID and look for it in **Authentication → Users** in the same Supabase project as your `.env` URL. If the ID appears there, the user was created correctly.

### Why profiles/user_roles have rows but auth.users seems to have fewer

**Profiles and user_roles get rows only from a trigger that runs after insert into auth.users.** So every `profiles.id` must have once existed in `auth.users`. If you see more rows in profiles than in Authentication → Users:

1. **Same project?** Confirm the project in your `.env` (`EXPO_PUBLIC_SUPABASE_URL`) is the one where you're checking **Authentication → Users** and **Table Editor → profiles**.
2. **Trigger present?** In SQL Editor run the queries in `supabase/migrations/003_verify_auth_trigger.sql`. The first shows triggers on `auth.users` (you should see `on_auth_user_created`). The second lists any profile IDs missing from `auth.users` (should be 0 rows).
3. **Anonymous users visible?** In **Authentication → Users**, check for a filter (e.g. "All" vs "Email") and ensure anonymous users are not hidden. Refresh the list after signing in from the app.

# Admin user setup

## How does an admin log in?

**There is no separate admin login.** Admins use the **same login** as everyone else:

1. Open the app → enter **phone number** → **Continue**.
2. Enter OTP **1234** → **Verify**.
3. You’re in the app.

What makes someone an **admin** is that their **user** has the admin **role** in the database (see “Where does the User UUID come from?” and “Grant admin in SQL” below). After you run the grant SQL for a user, that user is an admin. When they sign in with the same phone flow, they can switch to the **Admin** role in the app under **Profile** → **Active role**.

---

## 422 when entering OTP / not going to dashboard?

The app signs you in **anonymously** when you use OTP 1234. If you get **422 Unprocessable Content** or "Sign-in failed", enable Anonymous sign-in in Supabase:

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **Authentication** → **Providers**.
3. Find **Anonymous** and turn **Enable Anonymous sign-in** **ON**.
4. Save, then try again in the app: enter phone → Continue → OTP **1234** → Verify.

---

## Do I need to create roles?

**No.** The first migration (`001_initial_schema.sql`) already creates the `roles` table and inserts these roles:

- **admin**
- **community_member**
- **moderator**
- **delivery_partner**

You don’t create any roles manually.

---

## Where does the User UUID come from?

You **don’t create** the User UUID. Supabase creates it when someone signs in.

1. **Sign in once in the app**
   - Open the Mana Local app.
   - Enter any 10-digit number (e.g. `9876543210`).
   - Enter OTP **1234** and tap Verify.
   - You’ll be signed in and taken to the main screen.

2. **Find that user in Supabase**
   - Open your [Supabase Dashboard](https://supabase.com/dashboard).
   - Select your project.
   - Go to **Authentication** → **Users**.
   - You’ll see one user (often listed as “Anonymous”).
   - Click that user row.

3. **Copy the User UID**
   - On the user detail page you’ll see **User UID** (a long value like `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).
   - Copy that entire UUID.

4. **Grant admin in SQL**
   - Go to **SQL Editor** in Supabase.
   - Open `supabase/migrations/002_grant_admin_help.sql`.
   - Replace **both** occurrences of `YOUR_USER_UUID` with the UUID you copied.
   - Run the script.

happy@viitortechnologies.com
Happy0210

That user is now an admin and can post; in the app they can switch to the “Admin” role from Profile.

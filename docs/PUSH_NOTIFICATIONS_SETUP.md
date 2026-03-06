# Push Notifications Setup

## Do you need Firebase?

**No. This app uses Expo Push Notifications, not Firebase directly.**

- **Supabase** does not send push notifications itself. We use Supabase for auth, database (storing push tokens), and the Edge Function that *calls* Expo’s API.
- **Expo Push Service** is what actually delivers notifications. The app gets an **Expo push token**, we save it in Supabase, and when an admin sends a notification our Edge Function calls `https://exp.host/--/api/v2/push/send` with those tokens. Expo then delivers to Google (FCM) and Apple (APNs) for us.
- **Firebase (FCM)** is only needed if you use **EAS Build** for production Android builds. In that case you add FCM credentials in the **Expo dashboard** (not in the app code). So: no Firebase project or SDK in the app for the current setup; only optional FCM config in EAS for production builds.

**Next step:** Run on a **physical device**, grant notification permission, and (if you still see “Could not get push token”) use a **development build** or add an **EAS projectId** as below.

---

## Overview

- **Users**: Can enable or disable push notifications in **Profile → Push notifications**.
- **Admins**: When the active role is **Admin**, a **Send push notification** button appears in Profile. It opens a screen where you enter title, description, optional image, and optional link, then send to all opted-in users.

## 1. Database

Run the migrations in order:

```bash
# Apply migrations (if using Supabase CLI)
supabase db push
```

Or run the SQL in the Supabase SQL Editor:

- `supabase/migrations/009_push_notifications.sql` – adds `profiles.push_notifications_enabled` and `push_tokens` table.
- `supabase/migrations/010_notifications_bucket.sql` – creates the `notifications` storage bucket and policies for notification images. If this fails (e.g. different Supabase version), create a **public** bucket named `notifications` in Dashboard → Storage and add policies so **authenticated** users can INSERT and SELECT.

## 2. Edge Function (admin send)

### Deploy via CLI (step-by-step)

1. **Install Supabase CLI** (pick one; **do not** use `npm install -g supabase` — it is not supported):
   - **macOS (recommended):** [Homebrew](https://brew.sh) — no Node version required:
     ```bash
     brew install supabase/tap/supabase
     ```
   - **Or use npx** (uses Node; run from project root):
     ```bash
     npx supabase login
     npx supabase link --project-ref YOUR_PROJECT_REF
     npx supabase functions deploy send-push
     ```
   - **Or install as a dev dependency** (then use `npx supabase` for all commands):
     ```bash
     npm install supabase --save-dev
     ```

2. **Log in** (opens browser):
   ```bash
   supabase login
   ```

3. **Link your project** (use the project ref from your Supabase URL, e.g. `https://xxxx.supabase.co` → ref is `xxxx`):
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. **Deploy the send-push function** (from the project root):
   ```bash
   supabase functions deploy send-push
   ```

5. **Optional – set anon key** (if the function returns “Unauthorized” or a missing anon key, add this secret; get the value from Dashboard → Project Settings → API → anon public):
   ```bash
   supabase secrets set ANON_KEY=your_anon_public_key_here
   ```

The function will be live at: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push`

---

Supabase **automatically** provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. The function also needs the **anon key** to verify the user’s JWT; Supabase may inject `SUPABASE_ANON_KEY` in some environments.

- **Do not add secrets whose name starts with `SUPABASE_`** – Supabase reserves that prefix and will show: “Name must not start with the SUPABASE_ prefix.”
- If the function fails with “Unauthorized” or a missing anon key, add a **custom** secret with a name that does **not** start with `SUPABASE_`, for example:
  - **Name:** `ANON_KEY`
  - **Value:** your project’s anon (public) key from Dashboard → Project Settings → API.
  - Via CLI: `supabase secrets set ANON_KEY=your_anon_key_here`

The app calls the function at `EXPO_PUBLIC_SUPABASE_URL/functions/v1/send-push` with the user’s JWT. The function checks that the user has the **admin** role, then reads all `push_tokens` and sends messages via the Expo Push API.

## 3. App config

- **expo-notifications** is in `app.json` plugins and in `package.json`.
- The notification **icon** (tray/small icon) uses `./assets/images/notifications.png` (set in the expo-notifications plugin in `app.json`). Use your updated notifications PNG here.
- **Default image when sending push**: To use your notifications image as the default attachment when the admin doesn’t upload a custom image, upload `assets/images/notifications.png` to your Supabase **notifications** bucket (or any public URL), then set `EXPO_PUBLIC_DEFAULT_NOTIFICATION_IMAGE_URL` in `.env` to that URL. The “Use default (notifications.png)” switch will then appear on the Send push screen.
- **EAS projectId (required for push):** The app needs an Expo project ID to get push tokens. In `app.json`, `extra.eas.projectId` is set to a placeholder. Replace it with your real project ID:
  1. Go to [expo.dev](https://expo.dev), sign in (or create an account).
  2. Create a project (e.g. "Mana Local") or open an existing one.
  3. In the project page, open **Project settings** (or the project’s **Overview**). Copy the **Project ID** (a UUID like `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).
  4. In your repo, open `app.json` and replace `REPLACE_WITH_YOUR_EAS_PROJECT_ID` with that UUID (keep the quotes).
  5. Restart the app (`npx expo start --clear` if needed), then try **Profile → Enable push notifications** again.

## 4. User flow

1. User opens **Profile** and turns **Enable push notifications** ON.
2. App requests notification permission, gets the Expo push token, saves it in `push_tokens`, and sets `profiles.push_notifications_enabled = true`.
3. Turning the switch OFF removes the device token and sets `push_notifications_enabled = false`.

## 5. Admin flow

1. Admin selects the **Admin** role (if they have multiple roles).
2. In Profile, they tap **Send push notification**.
3. They enter **Title** (required), **Description** (optional), optionally **Image** (uploaded to `notifications` bucket), and optionally enable **Link** and enter a URL.
4. Tapping **Send notification** uploads the image (if any), then calls the `send-push` Edge Function, which sends the notification to all registered tokens via Expo.

## Troubleshooting

### "Command Line Tools are too outdated" (macOS)

If Homebrew or other tools say your Command Line Tools are too old:

1. **Update via terminal** (you will be prompted for your Mac password):
   ```bash
   sudo softwareupdate --install "Command Line Tools for Xcode 26.2-26.2"
   ```
   If the label differs, list updates first: `softwareupdate --list`, then use the exact "Command Line Tools" label in the `--install` command.

2. **Or** open **System Settings → General → Software Update** and install any "Command Line Tools" or Xcode update shown.

3. **If that doesn’t help**, remove and reinstall (run in terminal; you’ll be prompted for password and then a dialog to install):
   ```bash
   sudo rm -rf /Library/Developer/CommandLineTools
   sudo xcode-select --install
   ```

---

### “Could not get push token. Enable notifications for this app.”

The app now shows a **specific reason** when it can’t get a token. Check the exact message:

| Message | Cause | What to do |
|--------|--------|------------|
| **Push notifications require a physical device** | Running on simulator/emulator | Use a **real phone or tablet**. Simulators cannot receive push. |
| **Notification permission was denied** | User denied or didn’t allow | Open **Settings → Mana Local** (or your app name) and turn **Notifications** ON. Then try again in the app. |
| **Could not get push token. Try a development build…** | Often happens in **Expo Go** (no or limited push) | 1) Prefer a **development build**: `npx expo run:ios` or `npx expo run:android`, or 2) For production, use **EAS Build** and set `extra.eas.projectId` in `app.json` (from your Expo account). |
| **Push requires an EAS project** | Token API needs a project ID | Create an Expo account, create a project, then in `app.json` add under `expo`: `"extra": { "eas": { "projectId": "your-project-id" } }`. |

**Summary:** Use a **physical device**, allow **notifications** when prompted, and if you still get the error, run a **development build** (`expo run:ios` / `expo run:android`) instead of Expo Go.

### Other issues

- **“Push function URL not configured”**: Ensure `EXPO_PUBLIC_SUPABASE_URL` is set in `.env` and points to your Supabase project URL (e.g. `https://xxxx.supabase.co`).
- **“No push tokens registered”**: Have at least one user enable push in Profile first.
- **Storage upload failed for image**: Create the `notifications` bucket (public) and allow **authenticated** INSERT/SELECT on that bucket.

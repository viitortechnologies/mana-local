# Anonymous users & RLS (Supabase warning)

When you enable **Anonymous sign-in**, Supabase shows a warning:

> **Anonymous users will use the `authenticated` role when signing in.** They will be subjected to RLS policies that apply to `public` and `authenticated` roles. Review your RLS policies so data access is restricted where required.

## Do you need to take action?

**For Mana Local, the migration already sets RLS so that anonymous (and all authenticated) users are restricted.** You don’t have to change anything if you’ve run `001_initial_schema.sql`. Summary:

| Table        | What’s restricted |
|-------------|-------------------|
| **profiles** | Users see only their own row; admins can read all. |
| **user_roles** | Users see/insert only their own rows. |
| **posts**    | Only rows with `approved_at` set are visible. New posts require `can_post` and profile completion. |
| **comments** | Only approved comments visible; new comments require profile completion. |
| **reuse_items** | Only approved items visible; new items require profile completion. |
| **post_likes** | Insert/delete only for own user; profile completion required to like. |

So anonymous users:

- Cannot read other users’ profiles.
- Cannot see unapproved posts/comments/reuse items.
- Cannot post, comment, or list reuse items until they have a profile and (when you enforce it) `can_post` / profile completion.

## Optional: double-check in Supabase

1. In **Table Editor**, open each table → **Policies** and confirm RLS is **Enabled** and the policies from the migration are present.
2. Use **Authentication** → **Policies** (or **SQL Editor**) to review [Supabase RLS docs](https://supabase.com/docs/guides/auth/row-level-security) if you add new tables later.

No extra security steps are required for the current Mana Local setup; the warning is a reminder to review, and our policies already limit access.

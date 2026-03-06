-- ============================================================
-- HOW TO MAKE YOURSELF AN ADMIN (step-by-step)
-- ============================================================
--
-- 1. ROLES: You do NOT create roles. Migration 001 already created them:
--    - admin, community_member, moderator, delivery_partner
--
-- 2. GET YOUR USER UUID (you don't create it – Supabase creates it when you sign in):
--    a. Open the Mana Local app and sign in:
--       - Enter any 10-digit mobile number (e.g. 9876543210)
--       - Enter OTP: 1234 → Verify
--    b. In Supabase Dashboard: Authentication → Users
--    c. You will see one user (Anonymous). Click that row.
--    d. Copy the "User UID" (a long id like: a1b2c3d4-e5f6-7890-abcd-ef1234567890)
--
-- 3. RUN THIS SCRIPT: Replace YOUR_USER_UUID below with the copied UID (both places),
--    then run in SQL Editor.
--
-- ============================================================

-- Add admin role to your user (paste your User UID in place of YOUR_USER_UUID)
INSERT INTO public.user_roles (user_id, role_id)
SELECT '9a291f9a-0466-4fc7-a044-596e5972baac', id FROM public.roles WHERE code = 'admin'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Allow posting and mark profile complete for testing
UPDATE public.profiles
SET can_post = true, profile_completed_at = now(), email_verified_at = now()
WHERE id = '9a291f9a-0466-4fc7-a044-596e5972baac';

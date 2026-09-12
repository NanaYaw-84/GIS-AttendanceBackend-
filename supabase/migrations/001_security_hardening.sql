-- =====================================================
-- SECURITY HARDENING MIGRATION
-- Run this in the Supabase SQL editor AFTER deploying the code changes
-- that switch API routes to the service_role/secret key. Running this
-- before that deploy will break the live app, which is currently reading
-- and writing via the anon/publishable key.
-- =====================================================

-- ===================== ADMIN ROLE =====================
ALTER TABLE public.officers
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'officer';

ALTER TABLE public.officers
  DROP CONSTRAINT IF EXISTS officers_role_check;

ALTER TABLE public.officers
  ADD CONSTRAINT officers_role_check CHECK (role IN ('officer', 'admin'));

-- After running this migration, promote at least one officer to admin so
-- there's someone who can approve registrations / reset passwords /
-- manage officers. Replace the officer_id below and run separately:
--
--   UPDATE public.officers SET role = 'admin' WHERE officer_id = 'REPLACE_ME';

-- ===================== FORCE PASSWORD RESET =====================
-- Existing password hashes are unsalted SHA-256; invalidate them so every
-- officer must go through the new admin-initiated reset
-- (POST /api/auth/forgot-password with an admin token) before logging in
-- again.
UPDATE public.officers SET password_hash = NULL;

-- ===================== TIGHTEN RLS =====================
-- Previous policies were `USING (true)` (no real restriction). API routes
-- now use the service_role key, which bypasses RLS entirely, so these
-- policies only matter for direct anon/publishable-key access. Deny it by
-- default — all reads/writes should go through the API.

DROP POLICY IF EXISTS "Officers can view their own record" ON public.officers;
DROP POLICY IF EXISTS "Officers can update their own record" ON public.officers;

DROP POLICY IF EXISTS "Officers can view their own attendance" ON public.attendance;
DROP POLICY IF EXISTS "Officers can insert their own attendance" ON public.attendance;

DROP POLICY IF EXISTS "Officers can view their own attendance summary" ON public.attendance_summary;

-- No CREATE POLICY statements follow intentionally: with RLS enabled and
-- zero policies defined, the anon/publishable key has no access at all to
-- these tables. The service_role key used by the API is unaffected.

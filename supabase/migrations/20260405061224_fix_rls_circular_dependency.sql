-- ============================================================
-- Fix circular RLS dependency on profiles
-- ============================================================
--
-- Problem:
--   auth_company_id() queries profiles to find the current user's company.
--   The profiles RLS SELECT policy calls auth_company_id() to decide what
--   rows to expose. This creates infinite recursion; PostgreSQL breaks the
--   cycle by returning null, so every authenticated query that needs
--   company_id (createCategory, inviteStaff, placeOrder, etc.) fails with
--   "Profile not found".
--
-- Fix 1: SECURITY DEFINER on both helper functions.
--   They run as the function owner (postgres), bypassing RLS when they
--   query profiles. auth.uid() still returns the JWT user — the scope is
--   not widened, only the RLS barrier is removed for this internal lookup.
--
-- Fix 2: Add a direct "users see own profile" policy using id = auth.uid()
--   (non-circular). This also lets any code that needs the user's own row
--   retrieve it without depending on auth_company_id() being available.
-- ============================================================

create or replace function auth_company_id()
returns uuid language sql stable security definer as $$
  select company_id from profiles where id = auth.uid()
$$;

create or replace function auth_user_role()
returns user_role language sql stable security definer as $$
  select role from profiles where id = auth.uid()
$$;

-- Allow every authenticated user to read their own profile row directly.
-- This is non-circular (id = auth.uid() doesn't touch auth_company_id).
create policy "users see own profile"
  on profiles for select
  using (id = auth.uid());

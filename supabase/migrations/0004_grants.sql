-- Spelling Practice — grant table-level privileges to the `authenticated`
-- role for every app table.
--
-- Run this AFTER 0001-0003, the same way (Supabase SQL editor, or
-- `supabase db push`). Safe to re-run.
--
-- Why this is needed:
--   RLS policies (0001-0002) restrict which ROWS a role can touch, but
--   Postgres also requires a coarser, table-level GRANT before RLS is even
--   evaluated — normally new tables in the `public` schema inherit this
--   automatically from Supabase's default privileges, but that didn't take
--   effect for this project's tables (confirmed live: `permission denied for
--   table families`, `42501`, when signed in as a real authenticated user).
--   This grants broadly at the table level; RLS policies remain the actual
--   access-control boundary — e.g. `subscriptions` gets an UPDATE grant here
--   but still has no UPDATE policy, so authenticated clients still cannot
--   update it directly (only the SECURITY DEFINER RPCs can).

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  families,
  children,
  weekly_lists,
  weekly_words,
  practice_sessions,
  practice_answers,
  subscriptions,
  analytics_events,
  word_mastery
to authenticated;

-- `admins` deliberately gets no grant here — it has no RLS policies either
-- (see 0001_init.sql) and is only ever read through the SECURITY DEFINER
-- functions (`is_admin()`, `admin_overview()`, etc.), which bypass grants
-- and RLS as the function owner.

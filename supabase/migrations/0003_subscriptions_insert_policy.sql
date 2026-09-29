-- Spelling Practice — RLS fix: allow a family to insert its OWN guest
-- subscription row directly from the client.
--
-- Run this AFTER 0001_init.sql and 0002_mastery_and_readiness.sql, the same
-- way (Supabase SQL editor, or `supabase db push`). Safe to re-run.
--
-- Why this is needed:
--   `migrateGuestToCloud()` (src/domains/family/familyService.ts) has a
--   fallback path for the unlikely case the `handle_new_user` trigger hasn't
--   created a family+subscription yet: it inserts the `families` row itself
--   (already covered by `families_insert_own`), then inserts a `subscriptions`
--   row with `status: 'guest'`. But 0001_init.sql only ever defined a SELECT
--   policy for `subscriptions` — no INSERT policy — so that fallback insert
--   would be silently blocked by RLS. This was a genuine gap, not something
--   that was ever exercised against a real project before now.
--
-- This policy is intentionally narrow: it only allows inserting a row for a
-- family the caller owns, and only with status = 'guest' — every other
-- status transition (trial, free, premium) still goes exclusively through
-- the `handle_new_user` trigger or the SECURITY DEFINER RPCs
-- (`consume_free_answer`, `admin_test_action`), so a client still cannot
-- grant itself premium/trial access by inserting a row directly.

create policy "subscriptions_insert_own_family" on subscriptions
  for insert with check (
    status = 'guest'
    and exists (select 1 from families f where f.id = subscriptions.family_id and f.owner_user_id = auth.uid())
  );

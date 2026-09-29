-- Spelling Practice — fix ambiguous column reference in consume_free_answer().
--
-- Run this AFTER 0001-0004, the same way (Supabase SQL editor, or
-- `supabase db push`). Safe to re-run.
--
-- Why this is needed:
--   `consume_free_answer()`'s `RETURNS TABLE(allowed boolean, remaining
--   integer, status text)` clause implicitly declares a PL/pgSQL variable
--   named `status` for the OUT parameter. The function body also selects
--   from `subscriptions`, which has its own `status` column — so the bare
--   `select status, ...` was ambiguous between the OUT param and the table
--   column. Confirmed live against a real project: every call failed with
--   Postgres error 42702 ("column reference \"status\" is ambiguous"),
--   which silently broke every answer check in Practice Test (cloud mode)
--   since consume_free_answer() is called on every checked answer. This was
--   never caught before because the SQL was never run against a live
--   Postgres instance until now — only the TypeScript side was unit-tested.
--
-- Fix: qualify the column reference so it's unambiguous.

create or replace function consume_free_answer(p_family_id uuid)
returns table(allowed boolean, remaining integer, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
  v_used integer;
  v_limit integer;
begin
  select owner_user_id into v_owner from families where id = p_family_id;
  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'not authorized for family %', p_family_id;
  end if;

  select subscriptions.status, subscriptions.free_answers_used, subscriptions.free_answers_limit
    into v_status, v_used, v_limit
  from subscriptions
  where subscriptions.family_id = p_family_id
  for update;

  if not found then
    raise exception 'subscription not found for family %', p_family_id;
  end if;

  if v_status in ('trial', 'premium', 'guest') then
    return query select true, null::integer, v_status;
    return;
  end if;

  if v_used >= v_limit then
    return query select false, 0, v_status;
    return;
  end if;

  update subscriptions set free_answers_used = free_answers_used + 1 where subscriptions.family_id = p_family_id;

  return query select true, (v_limit - v_used - 1), v_status;
end;
$$;

grant execute on function consume_free_answer(uuid) to authenticated;

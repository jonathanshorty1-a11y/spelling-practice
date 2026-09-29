-- Spelling Practice — initial schema, RLS policies, and business-logic RPCs.
--
-- Run this against a fresh Supabase project via the SQL editor, or with the
-- Supabase CLI: `supabase db push` (see README.md "Cómo ejecutar migrations").
--
-- Design notes:
--   * One family (parent account) has many children, each child has weekly
--     word lists, each list has words, and practice creates sessions/answers.
--   * RLS is the ONLY thing that should be trusted for access control — the
--     frontend's anon key is public by design. Every table below is scoped so
--     a family can only ever see its own rows.
--   * Free-answer metering (`consume_free_answer`) and admin test actions run
--     as SECURITY DEFINER functions so the limits can't be bypassed by a
--     client that talks to Postgres directly instead of going through the UI.

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- =========================================================================
-- Tables
-- =========================================================================

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  email text,
  parent_pin_hash text,
  created_at timestamptz not null default now()
);

create table if not exists children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  avatar text not null default '🦄',
  theme_color text not null default '#FF6B9D',
  grade text,
  created_at timestamptz not null default now()
);

create table if not exists weekly_lists (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  week_start date,
  week_end date,
  created_at timestamptz not null default now(),
  archived boolean not null default false
);

create table if not exists weekly_words (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references weekly_lists(id) on delete cascade,
  word text not null,
  order_index integer not null default 0
);

create table if not exists practice_sessions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  child_id uuid not null references children(id) on delete cascade,
  list_id uuid not null references weekly_lists(id) on delete cascade,
  mode text not null check (mode in ('full', 'mistakes')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  total_words integer not null default 0,
  correct_words integer not null default 0,
  percentage integer not null default 0
);

create table if not exists practice_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references practice_sessions(id) on delete cascade,
  word_id uuid not null,
  word text not null,
  typed_answer text not null default '',
  correct boolean not null default false,
  attempts integer not null default 0,
  used_hint boolean not null default false,
  revealed_answer boolean not null default false
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null unique references families(id) on delete cascade,
  status text not null default 'guest' check (status in ('guest', 'trial', 'free', 'premium')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  free_answers_used integer not null default 0,
  free_answers_limit integer not null default 25,
  premium_started_at timestamptz,
  premium_ends_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text
);

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete set null,
  event_name text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Admin allowlist: presence of a row = that user is an admin. Deliberately a
-- real table + role check (spec section 24), not a hidden route.
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_children_family on children(family_id);
create index if not exists idx_weekly_lists_child on weekly_lists(child_id);
create index if not exists idx_weekly_words_list on weekly_words(list_id);
create index if not exists idx_practice_sessions_child on practice_sessions(child_id);
create index if not exists idx_practice_answers_session on practice_answers(session_id);
create index if not exists idx_analytics_family on analytics_events(family_id);

-- =========================================================================
-- Auto-create a family + guest subscription row for every new auth user.
-- (Signing up always happens via the guest -> cloud migration flow in the
-- app, which inserts its own `families` row explicitly — this trigger is a
-- safety net for any user created outside that flow, e.g. directly in the
-- Supabase dashboard.)
-- =========================================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
begin
  insert into families (owner_user_id, email)
  values (new.id, new.email)
  returning id into v_family_id;

  insert into subscriptions (family_id, status)
  values (v_family_id, 'trial')
  on conflict (family_id) do nothing;

  update subscriptions
    set status = 'trial', trial_started_at = now(), trial_ends_at = now() + interval '7 days'
    where family_id = v_family_id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =========================================================================
-- Row Level Security
-- =========================================================================

alter table families enable row level security;
alter table children enable row level security;
alter table weekly_lists enable row level security;
alter table weekly_words enable row level security;
alter table practice_sessions enable row level security;
alter table practice_answers enable row level security;
alter table subscriptions enable row level security;
alter table analytics_events enable row level security;
alter table admins enable row level security; -- no policies below on purpose: only SECURITY DEFINER functions read this table.

-- families: a user can only see/edit their own family row.
create policy "families_select_own" on families
  for select using (owner_user_id = auth.uid());
create policy "families_insert_own" on families
  for insert with check (owner_user_id = auth.uid());
create policy "families_update_own" on families
  for update using (owner_user_id = auth.uid());

-- children: only via the owning family.
create policy "children_all_own_family" on children
  for all using (
    exists (select 1 from families f where f.id = children.family_id and f.owner_user_id = auth.uid())
  )
  with check (
    exists (select 1 from families f where f.id = children.family_id and f.owner_user_id = auth.uid())
  );

-- weekly_lists: only via the owning family.
create policy "weekly_lists_all_own_family" on weekly_lists
  for all using (
    exists (select 1 from families f where f.id = weekly_lists.family_id and f.owner_user_id = auth.uid())
  )
  with check (
    exists (select 1 from families f where f.id = weekly_lists.family_id and f.owner_user_id = auth.uid())
  );

-- weekly_words: no family_id column — join up through weekly_lists.
create policy "weekly_words_all_own_family" on weekly_words
  for all using (
    exists (
      select 1 from weekly_lists l
      join families f on f.id = l.family_id
      where l.id = weekly_words.list_id and f.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from weekly_lists l
      join families f on f.id = l.family_id
      where l.id = weekly_words.list_id and f.owner_user_id = auth.uid()
    )
  );

-- practice_sessions: only via the owning family.
create policy "practice_sessions_all_own_family" on practice_sessions
  for all using (
    exists (select 1 from families f where f.id = practice_sessions.family_id and f.owner_user_id = auth.uid())
  )
  with check (
    exists (select 1 from families f where f.id = practice_sessions.family_id and f.owner_user_id = auth.uid())
  );

-- practice_answers: no family_id column — join up through practice_sessions.
create policy "practice_answers_all_own_family" on practice_answers
  for all using (
    exists (
      select 1 from practice_sessions s
      join families f on f.id = s.family_id
      where s.id = practice_answers.session_id and f.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from practice_sessions s
      join families f on f.id = s.family_id
      where s.id = practice_answers.session_id and f.owner_user_id = auth.uid()
    )
  );

-- subscriptions: a family can READ its own row, but must never update it
-- directly from the client — all writes go through the SECURITY DEFINER
-- functions below so free-answer metering can't be edited client-side.
create policy "subscriptions_select_own_family" on subscriptions
  for select using (
    exists (select 1 from families f where f.id = subscriptions.family_id and f.owner_user_id = auth.uid())
  );

-- analytics_events: families can insert their own events; no read access
-- needed from the client (admin functions read across all families).
create policy "analytics_events_insert_own_family" on analytics_events
  for insert with check (
    family_id is null
    or exists (select 1 from families f where f.id = analytics_events.family_id and f.owner_user_id = auth.uid())
  );

-- =========================================================================
-- Business-logic RPCs (SECURITY DEFINER — bypass RLS deliberately, but each
-- one re-checks ownership/admin status itself before touching data).
-- =========================================================================

-- Atomically consumes one free-practice-answer credit. Trial/premium/guest
-- families are never metered. This is the ONLY place free_answers_used may
-- change for a non-admin caller.
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

  select status, free_answers_used, free_answers_limit
    into v_status, v_used, v_limit
  from subscriptions
  where family_id = p_family_id
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

  update subscriptions set free_answers_used = free_answers_used + 1 where family_id = p_family_id;

  return query select true, (v_limit - v_used - 1), v_status;
end;
$$;

grant execute on function consume_free_answer(uuid) to authenticated;

-- True if the calling user is in the `admins` allowlist table.
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

grant execute on function is_admin() to authenticated;

-- Admin dashboard summary numbers.
create or replace function admin_overview()
returns table(
  total_families bigint,
  active_trials bigint,
  free_accounts bigint,
  premium_accounts bigint,
  total_children bigint,
  total_sessions bigint,
  total_answers bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  return query select
    (select count(*) from families),
    (select count(*) from subscriptions where status = 'trial'),
    (select count(*) from subscriptions where status = 'free'),
    (select count(*) from subscriptions where status = 'premium'),
    (select count(*) from children),
    (select count(*) from practice_sessions),
    (select count(*) from practice_answers);
end;
$$;

grant execute on function admin_overview() to authenticated;

-- Admin families table (spec section 24).
create or replace function admin_list_families()
returns table(
  family_id uuid,
  email text,
  created_at timestamptz,
  status text,
  trial_ends_at timestamptz,
  children_count bigint,
  lists_count bigint,
  sessions_count bigint,
  free_answers_used integer,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  return query
  select
    f.id,
    f.email,
    f.created_at,
    s.status,
    s.trial_ends_at,
    (select count(*) from children c where c.family_id = f.id),
    (select count(*) from weekly_lists l where l.family_id = f.id),
    (select count(*) from practice_sessions ps where ps.family_id = f.id),
    coalesce(s.free_answers_used, 0),
    (select max(ps.started_at) from practice_sessions ps where ps.family_id = f.id)
  from families f
  left join subscriptions s on s.family_id = f.id
  order by f.created_at desc;
end;
$$;

grant execute on function admin_list_families() to authenticated;

-- Admin testing shortcuts: Activate Premium / Set Free / Reset Trial.
-- Clearly a testing tool (spec section 24) — not a real billing integration.
create or replace function admin_test_action(p_family_id uuid, p_action text)
returns subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result subscriptions;
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;

  if p_action = 'activate_premium' then
    update subscriptions
      set status = 'premium', premium_started_at = now(), premium_ends_at = null
      where family_id = p_family_id
      returning * into v_result;
  elsif p_action = 'set_free' then
    update subscriptions
      set status = 'free'
      where family_id = p_family_id
      returning * into v_result;
  elsif p_action = 'reset_trial' then
    update subscriptions
      set status = 'trial', trial_started_at = now(), trial_ends_at = now() + interval '7 days', free_answers_used = 0
      where family_id = p_family_id
      returning * into v_result;
  else
    raise exception 'unknown admin action: %', p_action;
  end if;

  return v_result;
end;
$$;

grant execute on function admin_test_action(uuid, text) to authenticated;

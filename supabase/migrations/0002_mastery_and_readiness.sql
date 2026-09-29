-- Spelling Practice — Smart Practice iteration: per-word mastery tracking,
-- test dates, richer session typing, and parent language preference.
--
-- Run this AFTER 0001_init.sql, the same way (Supabase SQL editor, or
-- `supabase db push`). Safe to re-run — every statement is guarded.

-- =========================================================================
-- families: parent-facing language (spec §21)
-- =========================================================================
alter table families add column if not exists parent_language text not null default 'en'
  check (parent_language in ('en', 'es'));

-- =========================================================================
-- weekly_lists: when the spelling test is (spec §16)
-- =========================================================================
alter table weekly_lists add column if not exists test_date date;

-- =========================================================================
-- weekly_words: optional future example sentence (spec §25) — not used by
-- any screen yet, added now so it doesn't need another migration later.
-- =========================================================================
alter table weekly_words add column if not exists example_sentence text;

-- =========================================================================
-- practice_sessions: what KIND of session this was (spec §28), richer than
-- the original full/mistakes `mode` column, which is kept as-is for
-- backward compatibility with existing rows and the "mistakes" quick-check.
-- =========================================================================
alter table practice_sessions add column if not exists practice_type text
  check (practice_type in ('practice_test', 'smart_practice', 'weak_words', 'quick_practice', 'final_review', 'study'));
update practice_sessions set practice_type = 'practice_test' where practice_type is null and mode = 'full';
update practice_sessions set practice_type = 'weak_words' where practice_type is null and mode = 'mistakes';
alter table practice_sessions alter column practice_type set default 'practice_test';

-- =========================================================================
-- word_mastery (spec §3): one row per family+child+list+word.
-- =========================================================================
create table if not exists word_mastery (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  child_id uuid not null references children(id) on delete cascade,
  list_id uuid not null references weekly_lists(id) on delete cascade,
  word_id uuid not null references weekly_words(id) on delete cascade,
  status text not null default 'not_practiced' check (status in ('not_practiced', 'learning', 'almost_mastered', 'mastered')),
  correct_attempts integer not null default 0,
  incorrect_attempts integer not null default 0,
  consecutive_correct integer not null default 0,
  sessions_seen integer not null default 0,
  hints_used integer not null default 0,
  reveals_used integer not null default 0,
  recent_results jsonb not null default '[]',
  last_session_id uuid,
  last_practiced_at timestamptz,
  last_correct_at timestamptz,
  last_incorrect_at timestamptz,
  mastery_score integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (child_id, list_id, word_id)
);

create index if not exists idx_word_mastery_child_list on word_mastery(child_id, list_id);
create index if not exists idx_word_mastery_family on word_mastery(family_id);

alter table word_mastery enable row level security;

create policy "word_mastery_all_own_family" on word_mastery
  for all using (
    exists (select 1 from families f where f.id = word_mastery.family_id and f.owner_user_id = auth.uid())
  )
  with check (
    exists (select 1 from families f where f.id = word_mastery.family_id and f.owner_user_id = auth.uid())
  );

-- Keep updated_at current on every write (mirrors the app's own `updatedAt`,
-- belt-and-suspenders for anything that writes directly in SQL).
create or replace function set_word_mastery_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_word_mastery_updated_at on word_mastery;
create trigger trg_word_mastery_updated_at
  before update on word_mastery
  for each row execute function set_word_mastery_updated_at();

-- =========================================================================
-- Admin metrics additions (spec §36): words practiced / mastered, and how
-- many families have reached ready_for_test at least once (approximated —
-- see comment below).
-- =========================================================================
drop function if exists admin_overview();
create or replace function admin_overview()
returns table(
  total_families bigint,
  active_trials bigint,
  free_accounts bigint,
  premium_accounts bigint,
  total_children bigint,
  total_sessions bigint,
  total_answers bigint,
  words_practiced bigint,
  words_mastered bigint,
  families_ready_for_test bigint,
  avg_sessions_before_ready numeric
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
    (select count(*) from practice_answers),
    (select count(*) from word_mastery where correct_attempts > 0 or incorrect_attempts > 0),
    (select count(*) from word_mastery where status = 'mastered'),
    -- A family "reached ready_for_test" if, for some list, 90%+ of its words
    -- are currently mastered. This is a live snapshot (not a historical
    -- event log of when they first crossed the line) — good enough for an
    -- internal testing dashboard without adding a whole readiness-history
    -- table for v1.
    (
      select count(distinct w.family_id) from (
        select wm.family_id, wm.list_id,
               count(*) filter (where wm.status = 'mastered')::numeric / greatest(count(*), 1) as mastered_ratio
        from word_mastery wm
        group by wm.family_id, wm.list_id
      ) w
      where w.mastered_ratio >= 0.9
    ),
    (
      select round(avg(session_count), 1) from (
        select child_id, count(*) as session_count
        from practice_sessions
        where completed_at is not null
        group by child_id
      ) s
    );
end;
$$;

grant execute on function admin_overview() to authenticated;

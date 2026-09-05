-- Maze Whiskers — schema changes from the QA round of 2026-09-06.
--
-- Two things, both about the leaderboard telling the truth:
--
--   1. "Closest call" ranks the smallest amount of health a run finished with.
--      It was reading `scores`, which takes a row from every run — and a run
--      that lost to rent ends on exactly zero. A death was therefore an
--      unbeatable first place. The board now reads `speedrun_leaderboard`,
--      which is only ever written when a run is actually cleared, so it needs
--      to carry the health that was left.
--
--   2. The bounds lived only in the RLS insert policies. Those are the right
--      place for them, but a policy is checked against whoever is inserting;
--      a CHECK constraint is checked against the row itself, whatever route it
--      arrives by. Both, rather than either.
--
-- Nothing here returns rows. A SQL editor showing no output and no error is
-- this having worked — see the verification queries at the bottom, which do
-- return something you can read.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------- 1. column

alter table public.speedrun_leaderboard
    add column if not exists health_left smallint;

comment on column public.speedrun_leaderboard.health_left is
    'Health remaining at the moment home was reached. Ranked by the closest-call board.';

create index if not exists speedrun_health_left_idx
    on public.speedrun_leaderboard (health_left asc nulls last);

-- ------------------------------------------------------------ 2. what fits

-- Dropped first so a re-run picks up any change to the bounds below.
alter table public.scores
    drop constraint if exists scores_username_len,
    drop constraint if exists scores_score_range,
    drop constraint if exists scores_health_range,
    drop constraint if exists scores_survived_range,
    drop constraint if exists scores_fish_range,
    drop constraint if exists scores_difficulty_known;

-- `not valid` applies the rule to everything written from now on without
-- auditing what is already there. That matters: survival time used to be taken
-- from the wall clock, so a run left open in a background tab could have banked
-- hours. Refusing to add the constraint because of a row recorded under the old
-- bug would leave the table with no rule at all, which is the worse outcome.
alter table public.scores
    add constraint scores_username_len
        check (char_length(btrim(username)) between 1 and 10) not valid,
    add constraint scores_score_range
        check (score is null or score between 0 and 1000000) not valid,
    add constraint scores_health_range
        check (health_left is null or health_left between 0 and 100) not valid,
    -- An hour. Longer than any run this game can produce, short enough that a
    -- fabricated century cannot sit at the top of "longest on the street".
    add constraint scores_survived_range
        check (survived_ms is null or survived_ms between 0 and 3600000) not valid,
    add constraint scores_fish_range
        check (fish_count is null or fish_count between 0 and 10000) not valid,
    add constraint scores_difficulty_known
        check (difficulty is null or difficulty in ('easy', 'normal', 'hard')) not valid;

alter table public.speedrun_leaderboard
    drop constraint if exists sr_username_len,
    drop constraint if exists sr_time_range,
    drop constraint if exists sr_health_range,
    drop constraint if exists sr_difficulty_known;

alter table public.speedrun_leaderboard
    add constraint sr_username_len
        check (char_length(btrim(username)) between 1 and 10) not valid,
    -- A clear takes at least a few seconds of walking; an hour is the same
    -- ceiling used above.
    add constraint sr_time_range
        check (time_ms between 1000 and 3600000) not valid,
    add constraint sr_health_range
        check (health_left is null or health_left between 0 and 100) not valid,
    add constraint sr_difficulty_known
        check (difficulty is null or difficulty in ('easy', 'normal', 'hard')) not valid;

-- ------------------------------------------------------- 3. the write policy

-- The closest-call board reads this table now, and a clear writes one more
-- column to it. The policy from the previous migration is replaced rather than
-- joined by a second one: permissive policies are OR'd together, so adding a
-- looser policy beside a strict one quietly retires the strict one.
--
-- The read policy set up in 20260905 already allows anyone to select, and is
-- deliberately left alone.

drop policy if exists "insert_times" on public.speedrun_leaderboard;
drop policy if exists "anyone may post their own time" on public.speedrun_leaderboard;
drop policy if exists "speedrun insert" on public.speedrun_leaderboard;
drop policy if exists "speedrun read" on public.speedrun_leaderboard;

create policy "insert_times"
    on public.speedrun_leaderboard for insert
    to anon, authenticated
    with check (
        username is not null
        and char_length(btrim(username)) between 1 and 10
        and time_ms between 1000 and 3600000
        and (health_left is null or health_left between 0 and 100)
        and (difficulty is null or difficulty in ('easy', 'normal', 'hard'))
    );

-- ------------------------------------------------------------- 4. verify
--
-- Run this on its own afterwards. Unlike everything above, it returns rows.
--
--   select 'speedrun_leaderboard.health_left' as check,
--          count(*)::text as result
--   from information_schema.columns
--   where table_name = 'speedrun_leaderboard' and column_name = 'health_left'
--   union all
--   select 'check constraints', count(*)::text
--   from pg_constraint
--   where conrelid in ('public.scores'::regclass,
--                      'public.speedrun_leaderboard'::regclass)
--     and contype = 'c'
--   union all
--   select 'policies on ' || tablename, string_agg(policyname || ' (' || cmd || ')', ', ')
--   from pg_policies
--   where tablename in ('scores', 'speedrun_leaderboard')
--   group by tablename;
--
-- Expected: health_left = 1, check constraints = 10, and each table listing a
-- SELECT policy and exactly one INSERT policy.

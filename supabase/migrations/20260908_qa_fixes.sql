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
--   2. Nothing was checked on the way in. The anon key ships in the bundle by
--      design, so anyone can POST straight at the REST endpoint; the length cap
--      on the name box is a courtesy to the person typing, not a rule. These
--      constraints are the rule.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------- 1. column

alter table public.speedrun_leaderboard
    add column if not exists health_left smallint;

comment on column public.speedrun_leaderboard.health_left is
    'Health remaining at the moment home was reached. Ranked by the closest-call board.';

-- ------------------------------------------------------------ 2. what fits

-- Dropped first so a re-run picks up any change to the bounds below.
alter table public.scores
    drop constraint if exists scores_username_len,
    drop constraint if exists scores_score_range,
    drop constraint if exists scores_health_range,
    drop constraint if exists scores_survived_range,
    drop constraint if exists scores_fish_range,
    drop constraint if exists scores_difficulty_known;

alter table public.scores
    add constraint scores_username_len
        check (char_length(btrim(username)) between 1 and 10),
    add constraint scores_score_range
        check (score is null or score between 0 and 1000000),
    add constraint scores_health_range
        check (health_left is null or health_left between 0 and 100),
    -- An hour. Longer than any run this game can produce, short enough that a
    -- fabricated century cannot sit at the top of "longest on the street".
    add constraint scores_survived_range
        check (survived_ms is null or survived_ms between 0 and 3600000),
    add constraint scores_fish_range
        check (fish_count is null or fish_count between 0 and 10000),
    add constraint scores_difficulty_known
        check (difficulty is null or difficulty in ('easy', 'normal', 'hard'));

alter table public.speedrun_leaderboard
    drop constraint if exists sr_username_len,
    drop constraint if exists sr_time_range,
    drop constraint if exists sr_health_range,
    drop constraint if exists sr_difficulty_known;

alter table public.speedrun_leaderboard
    add constraint sr_username_len
        check (char_length(btrim(username)) between 1 and 10),
    -- A clear takes at least a few seconds of walking; an hour is the same
    -- ceiling used above.
    add constraint sr_time_range
        check (time_ms between 1000 and 3600000),
    add constraint sr_health_range
        check (health_left is null or health_left between 0 and 100),
    add constraint sr_difficulty_known
        check (difficulty is null or difficulty in ('easy', 'normal', 'hard'));

-- ------------------------------------------------------- 3. read the boards

-- The closest-call board now reads this table, so it has to be readable by the
-- anonymous role like the others already are. Re-stated rather than assumed.
alter table public.speedrun_leaderboard enable row level security;

drop policy if exists "speedrun read" on public.speedrun_leaderboard;
create policy "speedrun read"
    on public.speedrun_leaderboard for select
    to anon, authenticated
    using (true);

drop policy if exists "speedrun insert" on public.speedrun_leaderboard;
create policy "speedrun insert"
    on public.speedrun_leaderboard for insert
    to anon, authenticated
    with check (true);

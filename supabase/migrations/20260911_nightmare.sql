-- Maze Whiskers — let 'nightmare' through.
--
-- The difficulty is written on every row and read back by the boards, which
-- weight a result by the setting it was played on. Both the CHECK constraints
-- and the RLS insert policies list the settings that exist, and both listed
-- three. A nightmare run therefore failed its insert — and because the game
-- retries a rejected score with just a name and a number rather than losing
-- the run entirely, it would have been saved as an unweighted, difficulty-less
-- row. Silently: the player is told their score was recorded, and it was.
--
-- So this has to be applied before the setting ships, not after the first
-- complaint about a nightmare clear ranking below an easy one.
--
-- Nothing here returns rows. A SQL editor showing no output and no error is
-- this having worked; the checks at the bottom do return something readable.
--
-- Safe to run more than once.

-- --------------------------------------------------------- 1. what fits now

alter table public.scores
    drop constraint if exists scores_difficulty_known;

-- `not valid`, as before: the rule applies to everything written from here on
-- without re-auditing rows that predate the column. There is nothing wrong
-- with those rows, and refusing the constraint over one of them would leave
-- the table with no rule at all.
alter table public.scores
    add constraint scores_difficulty_known
        check (difficulty is null or difficulty in ('easy', 'normal', 'hard', 'nightmare')) not valid;

alter table public.speedrun_leaderboard
    drop constraint if exists sr_difficulty_known;

alter table public.speedrun_leaderboard
    add constraint sr_difficulty_known
        check (difficulty is null or difficulty in ('easy', 'normal', 'hard', 'nightmare')) not valid;

-- ------------------------------------------------------- 2. who may write it

-- Replaced rather than added to. Permissive policies are OR'd together, so a
-- second policy alongside the strict one does not tighten anything — it opens
-- a door beside it. One rule per table, rewritten in place.

drop policy if exists "insert_scores" on public.scores;

create policy "insert_scores"
    on public.scores for insert
    to anon, authenticated
    with check (
        username is not null
        and char_length(btrim(username)) between 1 and 10
        -- Null-tolerant throughout, matching the CHECK constraints: a policy
        -- that says `score between ...` refuses a null outright, and the
        -- reduced insert the game falls back to on an error sends nothing else.
        and (score is null or score between 0 and 1000000)
        and (survived_ms is null or survived_ms between 0 and 3600000)
        and (fish_count  is null or fish_count  between 0 and 10000)
        and (health_left is null or health_left between 0 and 100)
        and (difficulty  is null or difficulty in ('easy', 'normal', 'hard', 'nightmare'))
    );

drop policy if exists "insert_times" on public.speedrun_leaderboard;

create policy "insert_times"
    on public.speedrun_leaderboard for insert
    to anon, authenticated
    with check (
        username is not null
        and char_length(btrim(username)) between 1 and 10
        and time_ms between 1000 and 3600000
        and (health_left is null or health_left between 0 and 100)
        and (difficulty  is null or difficulty in ('easy', 'normal', 'hard', 'nightmare'))
    );

-- ------------------------------------------------------------- 3. did it work

-- Both rows should read 4 for the number of settings named, and there should
-- be exactly one INSERT policy per table.

select
    'constraints' as checking,
    (select count(*) from pg_constraint
      where conname = 'scores_difficulty_known'
        and pg_get_constraintdef(oid) like '%nightmare%')            as scores_allows_nightmare,
    (select count(*) from pg_constraint
      where conname = 'sr_difficulty_known'
        and pg_get_constraintdef(oid) like '%nightmare%')            as times_allows_nightmare;

select
    tablename,
    policyname,
    (with_check like '%nightmare%') as allows_nightmare
from pg_policies
where schemaname = 'public'
  and tablename in ('scores', 'speedrun_leaderboard')
  and cmd = 'INSERT'
order by tablename;

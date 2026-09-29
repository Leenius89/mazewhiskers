-- Maze Whiskers — refuse records the game cannot produce.
--
-- The anon key is public, as it has to be for a browser game, and the insert
-- policies only checked that a row was the right shape. One request could put
-- "nightmare, cleared in 1 second" at the top of the fastest board, or an
-- hour of survival at the top of the longest. This does not make a forged
-- record impossible — a believable one still gets through — but it refuses
-- the ones no run of this game could have made:
--
--   time_ms      At least 8 seconds. The smallest city is 25 cells across,
--                and home is 22 cells' walk from the doorstep; the fastest
--                real clear so far is 19.85 s. 8 s leaves room for a run
--                nobody has managed yet.
--   survived_ms  Health drains 1 a second from 100, and a fish gives back at
--                most 35. So a run can last at most (100 + 35 x fish) seconds;
--                doubled here, for slack.
--   fish_count   At most 300. The biggest city holds around 200.
--   score        At most 50 000, and at least 100 per fish (fish are 100 each).
--
-- Every column stays null-tolerant, because the game's fallback insert sends
-- only a name and a score.
--
-- Nothing here returns rows until the checks at the bottom. Safe to run more
-- than once.

-- ------------------------------------------------------------------ scores

drop policy if exists "insert_scores" on public.scores;

create policy "insert_scores"
    on public.scores for insert
    to anon, authenticated
    with check (
        username is not null
        and char_length(btrim(username)) between 1 and 10
        and (score       is null or score between 0 and 50000)
        and (survived_ms is null or survived_ms between 0 and 3600000)
        and (fish_count  is null or fish_count between 0 and 300)
        and (health_left is null or health_left between 0 and 100)
        and (difficulty  is null or difficulty in ('easy', 'normal', 'hard', 'nightmare'))
        -- Consistent with each other, where both were sent.
        and (fish_count is null or score is null or score >= fish_count * 100)
        and (fish_count is null or survived_ms is null or survived_ms <= (100 + 35 * fish_count) * 2000)
    );

-- ------------------------------------------------------------------- times

drop policy if exists "insert_times" on public.speedrun_leaderboard;

create policy "insert_times"
    on public.speedrun_leaderboard for insert
    to anon, authenticated
    with check (
        username is not null
        and char_length(btrim(username)) between 1 and 10
        and time_ms between 8000 and 3600000
        and (health_left is null or health_left between 0 and 100)
        and (difficulty  is null or difficulty in ('easy', 'normal', 'hard', 'nightmare'))
    );

-- ------------------------------------------------------------ did it work

-- One INSERT policy per table, each mentioning its new bound.
select
    tablename,
    policyname,
    (with_check like '%8000%' or with_check like '%50000%') as has_new_bounds
from pg_policies
where schemaname = 'public'
  and tablename in ('scores', 'speedrun_leaderboard')
  and cmd = 'INSERT'
order by tablename;

-- Rows already on the boards that these rules would now refuse. Expected: none.
select 'times' as board, count(*) as would_be_refused
from public.speedrun_leaderboard
where time_ms < 8000
union all
select 'scores', count(*)
from public.scores
where score > 50000
   or fish_count > 300
   or (fish_count is not null and score is not null and score < fish_count * 100)
   or (fish_count is not null and survived_ms is not null and survived_ms > (100 + 35 * fish_count) * 2000);

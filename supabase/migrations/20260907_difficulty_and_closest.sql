-- Difficulty on every record, and the closest-call board.
--
-- Runs are now made on one of three settings, and a leaderboard that ignored
-- which one would only ever reward turning the difficulty down. The setting is
-- stored per row; the weighting that turns a hard run into a better placing is
-- applied by the client, because the weighted number is not something a column
-- can hold for four different boards at once.
--
-- `health_left` is what the closest-call board ranks by: cleared, but only just.
--
-- Safe to run more than once.

alter table public.scores
    add column if not exists health_left integer,
    add column if not exists difficulty  text;

alter table public.speedrun_leaderboard
    add column if not exists difficulty text;

create index if not exists scores_health_left_idx on public.scores (health_left asc nulls last);

-- The insert policies list the columns they accept, so they have to be taught
-- about the new ones or every submission is refused.
drop policy if exists "insert_scores" on public.scores;
create policy "insert_scores"
    on public.scores for insert
    with check (
        username is not null
        and char_length(btrim(username)) between 1 and 10
        and score between 0 and 100000
        and (survived_ms is null or survived_ms between 0 and 86400000)
        and (fish_count  is null or fish_count  between 0 and 10000)
        and (health_left is null or health_left between 0 and 1000)
        and (difficulty  is null or difficulty in ('easy', 'normal', 'hard'))
    );

drop policy if exists "insert_times" on public.speedrun_leaderboard;
create policy "insert_times"
    on public.speedrun_leaderboard for insert
    with check (
        username is not null
        and char_length(btrim(username)) between 1 and 10
        and time_ms between 1000 and 86400000
        and (difficulty is null or difficulty in ('easy', 'normal', 'hard'))
    );

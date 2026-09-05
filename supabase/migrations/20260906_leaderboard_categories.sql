-- Two more ways to be good at this.
--
-- The game only ever recorded a score on a loss and a time on a win. It was
-- measuring two other things all along and throwing them away: how long the cat
-- lasted, and how much it managed to eat. Both go on the existing `scores` row
-- rather than into new tables, because they describe the same run.
--
-- Safe to run more than once. Existing rows keep NULL in the new columns and
-- the leaderboard filters them out rather than showing an empty first place.

alter table public.scores
    add column if not exists survived_ms bigint,
    add column if not exists fish_count integer;

-- The boards read these; without an index each one is a full scan of the table.
create index if not exists scores_survived_ms_idx on public.scores (survived_ms desc nulls last);
create index if not exists scores_fish_count_idx  on public.scores (fish_count  desc nulls last);

-- The insert policy from the RLS migration lists the columns it accepts, so it
-- has to be taught about the new ones or every submission is refused.
drop policy if exists "insert_scores" on public.scores;
drop policy if exists "anyone may post their own score" on public.scores;

create policy "insert_scores"
    on public.scores for insert
    with check (
        username is not null
        and char_length(btrim(username)) between 1 and 10
        and score between 0 and 100000
        -- A run under a second did not happen; a day is longer than the kiosk
        -- is open. Null stays allowed so an older client still records.
        and (survived_ms is null or survived_ms between 0 and 86400000)
        and (fish_count is null or fish_count between 0 and 10000)
    );

-- Verify:
--   select column_name from information_schema.columns
--   where table_name = 'scores';

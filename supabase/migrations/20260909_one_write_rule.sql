-- One write rule per table.
--
-- The verification query turned up three INSERT policies where there should be
-- one. Alongside the two this project created — `insert_scores` and
-- `insert_times`, which carry the bounds on names, scores, times and health —
-- sat a pair made in the Supabase dashboard: "Allow public insert" and "Enable
-- insert for all users". Those allow anything.
--
-- Permissive policies are OR'd. A row only has to satisfy one of them, so the
-- open pair meant the strict pair had not been deciding anything since the day
-- it was written. The bounds looked enforced in three migration files and were
-- not enforced at all.
--
-- What actually caught bad values in the meantime is the CHECK constraints
-- added in 20260908, which apply to the row whatever route it arrives by. This
-- migration is about the layer above them working as it reads.
--
-- The dashboard's read policies are left exactly as they are: reading is meant
-- to be open, they do that, and replacing them would only rename them.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------- 1. scores

-- Every name this table's insert rule has gone by, including the dashboard's.
drop policy if exists "Allow public insert"              on public.scores;
drop policy if exists "Enable insert for all users"      on public.scores;
drop policy if exists "anyone may post their own score"  on public.scores;
drop policy if exists "insert_scores"                    on public.scores;

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
        and (difficulty  is null or difficulty in ('easy', 'normal', 'hard'))
    );

-- --------------------------------------------------- 2. speedrun_leaderboard

drop policy if exists "Allow public insert"             on public.speedrun_leaderboard;
drop policy if exists "Enable insert for all users"     on public.speedrun_leaderboard;
drop policy if exists "anyone may post their own time"  on public.speedrun_leaderboard;
drop policy if exists "speedrun insert"                 on public.speedrun_leaderboard;
drop policy if exists "insert_times"                    on public.speedrun_leaderboard;

create policy "insert_times"
    on public.speedrun_leaderboard for insert
    to anon, authenticated
    with check (
        username is not null
        and char_length(btrim(username)) between 1 and 10
        and time_ms between 1000 and 3600000
        and (health_left is null or health_left between 0 and 100)
        and (difficulty  is null or difficulty in ('easy', 'normal', 'hard'))
    );

-- ------------------------------------------------------- 3. nothing rewrites

-- With RLS on and no UPDATE or DELETE policy, both are already refused. The
-- revoke states the same thing at the grant level, where a future reader
-- looking for it will find it.
revoke update, delete on public.scores               from anon, authenticated;
revoke update, delete on public.speedrun_leaderboard from anon, authenticated;

-- ------------------------------------------------------------- 4. verify
--
-- Run supabase/verify.sql. Line 5 should read OK, and the list underneath it
-- should show exactly one INSERT policy per table.

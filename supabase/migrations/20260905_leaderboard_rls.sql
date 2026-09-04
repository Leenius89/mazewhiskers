-- Row Level Security for the two public leaderboards.
--
-- Every request this project makes to Supabase carries the anon key, and that
-- key ships inside the JavaScript bundle — it is public by design and cannot be
-- hidden. RLS is the only thing standing between it and these tables. With RLS
-- off, the anon role can UPDATE and DELETE freely, so anyone who opens the
-- browser console on the exhibition kiosk can rewrite or empty the leaderboard
-- in a single line.
--
-- The shape below: anyone may read, anyone may add their own run, nobody may
-- change or remove one. Editing a finished run is not something players do, so
-- there is no reason for the policy to exist.
--
-- Safe to run more than once.

-- ============================================================== 1. audit
-- Run this first to see where things stand. `rowsecurity` false on either table
-- means the leaderboard is currently open to anyone.
--
--   select relname, relrowsecurity as rls_on
--   from pg_class
--   where relname in ('scores', 'speedrun_leaderboard');
--
--   select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--   where tablename in ('scores', 'speedrun_leaderboard');

-- ============================================================== 2. scores

alter table public.scores enable row level security;

drop policy if exists "scores are readable by anyone" on public.scores;
create policy "scores are readable by anyone"
    on public.scores for select
    using (true);

-- The bounds are not security, they are litter control: they stop the obvious
-- `score: 999999999` from a console without getting in the way of a real run.
drop policy if exists "anyone may post their own score" on public.scores;
create policy "anyone may post their own score"
    on public.scores for insert
    with check (
        username is not null
        and char_length(btrim(username)) between 1 and 10
        and score between 0 and 100000
    );

-- No UPDATE or DELETE policy exists, so once RLS is on both are already denied.
-- Revoking as well states the intent where a future reader will see it.
revoke update, delete on public.scores from anon, authenticated;

-- ================================================== 3. speedrun_leaderboard
-- If this errors with "is not a table", it is a view: apply the same policies
-- to whichever table it selects from instead.

alter table public.speedrun_leaderboard enable row level security;

drop policy if exists "times are readable by anyone" on public.speedrun_leaderboard;
create policy "times are readable by anyone"
    on public.speedrun_leaderboard for select
    using (true);

-- A run that claims to be under a second did not happen; a day is longer than
-- the kiosk is open.
drop policy if exists "anyone may post their own time" on public.speedrun_leaderboard;
create policy "anyone may post their own time"
    on public.speedrun_leaderboard for insert
    with check (
        username is not null
        and char_length(btrim(username)) between 1 and 10
        and time_ms between 1000 and 86400000
    );

revoke update, delete on public.speedrun_leaderboard from anon, authenticated;

-- ============================================================== 4. verify
-- Both tables should now report rls_on = true and carry exactly two policies
-- each, SELECT and INSERT. Anything listed as UPDATE or DELETE is a hole.
--
--   select tablename, policyname, cmd
--   from pg_policies
--   where tablename in ('scores', 'speedrun_leaderboard')
--   order by tablename, cmd;

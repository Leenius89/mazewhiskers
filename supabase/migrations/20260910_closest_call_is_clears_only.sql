-- "Closest call" means finished, barely. Not died.
--
-- The board ranks the smallest amount of health a run ended with, and it was
-- reading `scores` — which takes a row from every run. A run that loses to rent
-- ends on exactly zero, so a death was an unbeatable first place, permanently.
-- The client now reads `speedrun_leaderboard`, which is only written when a run
-- is actually cleared, and refuses anything at zero besides.
--
-- This clears up what the old behaviour left behind.
--
-- Nothing is deleted. `scores` rows are the record of every run and three other
-- boards rank on them; a losing run is a real run and keeps its survival time
-- and its fish. Only the health figure is withdrawn, from the rows that never
-- had a right to it — a run that ended on zero did not finish.
--
-- Safe to run more than once.

-- ------------------------------------------------------------ 1. look first
--
-- Run this on its own before the update below, to see what it will touch.
--
--   select count(*) filter (where health_left = 0)  as deaths_ranked,
--          count(*) filter (where health_left > 0)  as genuine_finishes,
--          count(*)                                 as rows_with_a_health_figure
--   from public.scores
--   where health_left is not null;

-- ------------------------------------------------------- 2. withdraw zeroes

update public.scores
   set health_left = null
 where health_left = 0;

-- ------------------------------------------------- 3. and from the clears too
--
-- `speedrun_leaderboard.health_left` only started being written this week, so
-- there should be nothing here. Stated anyway: a zero on the clear table would
-- mean a clear that finished dead, which cannot happen.

update public.speedrun_leaderboard
   set health_left = null
 where health_left = 0;

-- --------------------------------------------------------------- 4. verify
--
--   select 'scores with a zero left'  as check, count(*)::text as result
--   from public.scores where health_left = 0
--   union all
--   select 'clears with a zero left', count(*)::text
--   from public.speedrun_leaderboard where health_left = 0
--   union all
--   select 'clears that can rank on closest call', count(*)::text
--   from public.speedrun_leaderboard where health_left > 0;
--
-- Expected: the first two are 0. The third is however many runs have been
-- cleared since `health_left` started being recorded — likely 0 today, and the
-- board will read "no records yet" until someone gets home.

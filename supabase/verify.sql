-- Did the migrations actually land?
--
-- Unlike the migrations themselves, this returns rows. Paste it into the
-- Supabase SQL Editor and read the `result` column.

select '1. speedrun health_left column' as check,
       case when count(*) = 1 then 'OK' else 'MISSING — run 20260908' end as result
from information_schema.columns
where table_schema = 'public'
  and table_name = 'speedrun_leaderboard'
  and column_name = 'health_left'

union all

select '2. scores columns (survived_ms, fish_count, health_left, difficulty)',
       case when count(*) = 4 then 'OK'
            else count(*)::text || '/4 — run 20260906 and 20260907' end
from information_schema.columns
where table_schema = 'public'
  and table_name = 'scores'
  and column_name in ('survived_ms', 'fish_count', 'health_left', 'difficulty')

union all

select '3. check constraints',
       case when count(*) >= 10 then 'OK (' || count(*)::text || ')'
            else count(*)::text || '/10 — run 20260908' end
from pg_constraint
where conrelid in ('public.scores'::regclass, 'public.speedrun_leaderboard'::regclass)
  and contype = 'c'

union all

select '4. row level security',
       case when bool_and(relrowsecurity) then 'ON for both'
            else 'OFF somewhere — run 20260905' end
from pg_class
where relname in ('scores', 'speedrun_leaderboard')

union all

select '5. policies on ' || tablename,
       string_agg(policyname || ' [' || cmd || ']', ', ' order by cmd, policyname)
from pg_policies
where tablename in ('scores', 'speedrun_leaderboard')
group by tablename

order by 1;

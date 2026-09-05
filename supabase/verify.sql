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

-- One INSERT policy per table, or the strictest one stops deciding anything:
-- permissive policies are OR'd, so a second policy that allows everything
-- makes the first one's bounds unreachable.
select '5. one write rule per table',
       case when max(n) = 1 then 'OK'
            else 'DUPLICATE INSERT POLICIES — run 20260909' end
from (
    select count(*) as n
    from pg_policies
    where tablename in ('scores', 'speedrun_leaderboard')
      and cmd = 'INSERT'
    group by tablename
) per_table

union all

-- Nothing should be able to change or remove a finished run.
select '6. no update or delete rule',
       case when count(*) = 0 then 'OK'
            else count(*)::text || ' found — see list below' end
from pg_policies
where tablename in ('scores', 'speedrun_leaderboard')
  and cmd in ('UPDATE', 'DELETE', 'ALL')

order by 1;

-- ---------------------------------------------------------------------------
-- The full list, one policy per row so nothing is truncated.

select tablename, cmd, policyname, roles::text, coalesce(with_check, qual) as rule
from pg_policies
where tablename in ('scores', 'speedrun_leaderboard')
order by tablename, cmd, policyname;

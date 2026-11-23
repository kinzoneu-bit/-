-- ============================================================
-- AI 写入通道（KK 2026-11-23 要求）
-- 「你开发这个权限啊，这个权限你要有的呀，我不需要每次都要我自己跑 SQL」
--
-- 现状（已实测）：
--   opsfee_monthly      → 后端账号 bot@kinzon.eu 可写入 (201)
--   store_monthly_costs → 可写入 (201)
--   recoveries          → 403 42501 new row violates row-level security policy
--   cash_entries / platform_config / logistics_payments → 同 recoveries，owner-only
--
-- 本脚本只做一件事：给 bot@kinzon.eu 开【写】通道。
-- 读权限完全不动 —— 仍是只有 kinzon.eu@gmail.com 能看到这些数（KK 11-22 的要求）。
--
-- 执行一次，永久生效。以后新建同类表，按同一段模式补一条即可。
-- ============================================================

-- ---------- recoveries 平台回款 ----------
drop policy if exists recoveries_ai_insert on public.recoveries;
create policy recoveries_ai_insert on public.recoveries
  for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'bot@kinzon.eu');

drop policy if exists recoveries_ai_update on public.recoveries;
create policy recoveries_ai_update on public.recoveries
  for update to authenticated
  using ((auth.jwt() ->> 'email') = 'bot@kinzon.eu')
  with check ((auth.jwt() ->> 'email') = 'bot@kinzon.eu');

drop policy if exists recoveries_ai_delete on public.recoveries;
create policy recoveries_ai_delete on public.recoveries
  for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'bot@kinzon.eu');

-- ---------- cash_entries 现金流水 ----------
drop policy if exists cash_entries_ai_insert on public.cash_entries;
create policy cash_entries_ai_insert on public.cash_entries
  for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'bot@kinzon.eu');

drop policy if exists cash_entries_ai_update on public.cash_entries;
create policy cash_entries_ai_update on public.cash_entries
  for update to authenticated
  using ((auth.jwt() ->> 'email') = 'bot@kinzon.eu')
  with check ((auth.jwt() ->> 'email') = 'bot@kinzon.eu');

drop policy if exists cash_entries_ai_delete on public.cash_entries;
create policy cash_entries_ai_delete on public.cash_entries
  for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'bot@kinzon.eu');

-- ---------- logistics_payments 物流实付 ----------
drop policy if exists logipay_ai_insert on public.logistics_payments;
create policy logipay_ai_insert on public.logistics_payments
  for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'bot@kinzon.eu');

drop policy if exists logipay_ai_update on public.logistics_payments;
create policy logipay_ai_update on public.logistics_payments
  for update to authenticated
  using ((auth.jwt() ->> 'email') = 'bot@kinzon.eu')
  with check ((auth.jwt() ->> 'email') = 'bot@kinzon.eu');

drop policy if exists logipay_ai_delete on public.logistics_payments;
create policy logipay_ai_delete on public.logistics_payments
  for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'bot@kinzon.eu');

-- ============================================================
-- 执行后自检（预期：4 行，pfcmd = ALL，polname 以 _ai_ 结尾）
-- ============================================================
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and policyname like '%\_ai\_%'
order by tablename, policyname;

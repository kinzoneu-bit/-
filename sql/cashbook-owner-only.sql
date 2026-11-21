-- ============================================================
-- 现金账专属权限: 只给 kinzon.eu@gmail.com 一个人
-- 2026-11-22 KK 要求: "这个东西只有我一个人可以看到"
-- 按【邮箱】锁，不按 role —— bot@kinzon.eu 也是 admin, 不能给它看
-- ============================================================

-- 统一判据: (auth.jwt() ->> 'email') = 'kinzon.eu@gmail.com'

-- ---- cash_entries 现金流水 ----
alter policy cash_entries_rw on public.cash_entries
  using ((auth.jwt() ->> 'email') = 'kinzon.eu@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'kinzon.eu@gmail.com');

-- ---- cash_config 资本金配置 ----
alter policy cash_config_read on public.cash_config
  using ((auth.jwt() ->> 'email') = 'kinzon.eu@gmail.com');

alter policy cash_config_write on public.cash_config
  using ((auth.jwt() ->> 'email') = 'kinzon.eu@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'kinzon.eu@gmail.com');

-- ---- recoveries 平台回款 ----
alter policy recoveries_read on public.recoveries
  using ((auth.jwt() ->> 'email') = 'kinzon.eu@gmail.com');

alter policy recoveries_write on public.recoveries
  using ((auth.jwt() ->> 'email') = 'kinzon.eu@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'kinzon.eu@gmail.com');

-- ---- platform_config 平台费率 ----
alter policy platform_config_read on public.platform_config
  using ((auth.jwt() ->> 'email') = 'kinzon.eu@gmail.com');

alter policy platform_config_write on public.platform_config
  using ((auth.jwt() ->> 'email') = 'kinzon.eu@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'kinzon.eu@gmail.com');

-- ---- logistics_payments 物流实付 ----
alter policy logipay_read on public.logistics_payments
  using ((auth.jwt() ->> 'email') = 'kinzon.eu@gmail.com');

alter policy logipay_write on public.logistics_payments
  using ((auth.jwt() ->> 'email') = 'kinzon.eu@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'kinzon.eu@gmail.com');

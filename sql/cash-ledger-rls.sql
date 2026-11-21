-- 现金账 RLS: 与现有费用表同一套 user_profiles + auth.uid() 模式
alter table public.cash_entries enable row level security;

alter table public.cash_config enable row level security;

alter table public.recoveries enable row level security;

alter table public.platform_config enable row level security;

alter table public.logistics_payments enable row level security;

create policy cash_entries_rw on public.cash_entries
  for all to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role = any(array['admin','fr','finance'])))
  with check (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role = any(array['admin','fr','finance'])));

create policy cash_config_read on public.cash_config
  for select to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role = any(array['admin','fr','finance'])));

create policy cash_config_write on public.cash_config
  for all to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role = any(array['admin','fr'])))
  with check (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role = any(array['admin','fr'])));

create policy recoveries_read on public.recoveries
  for select to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role = any(array['admin','fr','finance','cd_procurement'])));

create policy recoveries_write on public.recoveries
  for all to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role = any(array['admin','fr'])))
  with check (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role = any(array['admin','fr'])));

create policy platform_config_read on public.platform_config
  for select to authenticated
  using (true);

create policy platform_config_write on public.platform_config
  for all to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role = any(array['admin','fr'])))
  with check (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role = any(array['admin','fr'])));

create policy logipay_read on public.logistics_payments
  for select to authenticated
  using (true);

create policy logipay_write on public.logistics_payments
  for all to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role = any(array['admin','fr','cd_supplier','cd_promotion'])))
  with check (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role = any(array['admin','fr','cd_supplier','cd_promotion'])));

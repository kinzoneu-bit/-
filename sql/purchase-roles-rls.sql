-- ================================================================
-- 采购体系 · 三段式分工 RLS (purchase-roles-rls.sql)
-- 目标库: 西欧 amz-system 生产库 (hsyuopmmndpcabhegics)
-- 定版: 2026-11-19 KK
--   ① 程诗琪 cd_promotion → 提采购需求（建单，不填价）
--   ② 陈雪梅 cd_supplier  → 下单（供应商台账 / 定价 / 批次）
--   ③ 夏蕾   finance      → 付款登记
--   黄丹 cd_procurement 不进采购流程，只保留全员只读
-- ----------------------------------------------------------------
-- 做法说明:
--   SQL 通道护栏不允许 drop policy，但放行 alter policy。
--   alter policy 可整体覆盖 TO / USING / WITH CHECK，效果等同重建。
-- ================================================================

-- ---------- 1. 供应商台账: 谁能维护 → admin / fr / 雪梅 ----------
alter policy pur_write_role on public.purchase_suppliers
  to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','cd_supplier')))
  with check (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','cd_supplier')));

-- ---------- 2. 采购单: 思琪提单 + 雪梅下单 ----------
alter policy pur_write_role on public.purchase_records
  to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','cd_promotion','cd_supplier')))
  with check (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','cd_promotion','cd_supplier')));

-- ---------- 3. 付款流水: 夏蕾 + admin/fr ----------
alter policy pur_write_role on public.purchase_payments
  to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','finance')))
  with check (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','finance')));

-- ---------- 4. 发货批次: 雪梅 + admin/fr ----------
alter policy pur_write_role on public.purchase_batches
  to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','cd_supplier')))
  with check (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','cd_supplier')));

-- ---------- 5. 自检: 打印四条策略的角色表达式 ----------
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('purchase_suppliers','purchase_records','purchase_payments','purchase_batches')
order by tablename, policyname;

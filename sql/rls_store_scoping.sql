-- ============================================================
-- 黄丹(cd_procurement) 三店数据权限 · RLS 收窄
-- KK 2026-09-18 定: 黄丹在所有「按店铺维度」的业务表里, 只能看/只能写
--   「飞鸟 / 野趣 / 屿阔」三家的数据; 其余店铺(俊业/乾霖/胤顺)对她完全不可见。
-- 涉及表:
--   shipments            发货记录
--   inventory            库存记录
--   opsfee_monthly       店铺运维费用
--   store_monthly_costs  店铺月度核算 (含共享键 __shared__ —— 三家共享的人工/场地)
--   store_other_expense  店铺其他费用
--   finance_daily_sales  财务核算 · 订单量与营业额
--   finance_cashflow     财务核算 · 现金流
-- 实现方式: 用 AS RESTRICTIVE 策略「叠加收窄」——
--   PostgreSQL 会把 RESTRICTIVE 策略与已有的 PERMISSIVE 策略做 AND,
--   因此不需要改动/删除任何现存策略, 也不会影响其他角色。
-- 另外补三条 PERMISSIVE 策略: 黄丹的库存写权限 + 财务核算两张表的读写权限
--   (写也放行, 但同样被三店 RESTRICTIVE 策略框住, 写不了别的店铺)
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

-- ---------- 0. 判定辅助函数: 当前登录用户是否「黄丹(成都·采购)」 ----------
CREATE OR REPLACE FUNCTION public.is_cd_procurement()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.user_id = auth.uid() AND up.role = 'cd_procurement'
  );
$$;

-- ---------- 1. 库存记录: 补上黄丹的写权限 (原有 = admin + cd_promotion + cd_supplier) ----------
DROP POLICY IF EXISTS inv_write_role ON inventory;
CREATE POLICY inv_write_role ON inventory FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin', 'cd_promotion', 'cd_supplier', 'cd_procurement')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin', 'cd_promotion', 'cd_supplier', 'cd_procurement')));

-- ---------- 2. 财务核算两张表: 补上黄丹的读写权限 (写也放行, 但受第 3 步三店收窄约束) ----------
-- KK 2026-09-18: 「这个她可以写」—— 可写 store 仍限 飞鸟/野趣/屿阔
DROP POLICY IF EXISTS fin_read_procurement ON finance_daily_sales;
DROP POLICY IF EXISTS fin_write_procurement ON finance_daily_sales;
CREATE POLICY fin_write_procurement ON finance_daily_sales FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role = 'cd_procurement'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                      WHERE up.user_id = auth.uid() AND up.role = 'cd_procurement'));

DROP POLICY IF EXISTS cf_read_procurement ON finance_cashflow;
DROP POLICY IF EXISTS cf_write_procurement ON finance_cashflow;
CREATE POLICY cf_write_procurement ON finance_cashflow FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role = 'cd_procurement'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                      WHERE up.user_id = auth.uid() AND up.role = 'cd_procurement'));

-- ---------- 3. 按店铺收窄 (RESTRICTIVE, 只对黄丹生效) ----------
-- 发货记录
DROP POLICY IF EXISTS sc_shipments_store ON shipments;
CREATE POLICY sc_shipments_store ON shipments AS RESTRICTIVE FOR ALL TO authenticated
  USING       (NOT public.is_cd_procurement() OR store IN ('飞鸟', '野趣', '屿阔'))
  WITH CHECK  (NOT public.is_cd_procurement() OR store IN ('飞鸟', '野趣', '屿阔'));

-- 库存记录
DROP POLICY IF EXISTS sc_inventory_store ON inventory;
CREATE POLICY sc_inventory_store ON inventory AS RESTRICTIVE FOR ALL TO authenticated
  USING       (NOT public.is_cd_procurement() OR store IN ('飞鸟', '野趣', '屿阔'))
  WITH CHECK  (NOT public.is_cd_procurement() OR store IN ('飞鸟', '野趣', '屿阔'));

-- 店铺运维费用
DROP POLICY IF EXISTS sc_opsfee_store ON opsfee_monthly;
CREATE POLICY sc_opsfee_store ON opsfee_monthly AS RESTRICTIVE FOR ALL TO authenticated
  USING       (NOT public.is_cd_procurement() OR store IN ('飞鸟', '野趣', '屿阔'))
  WITH CHECK  (NOT public.is_cd_procurement() OR store IN ('飞鸟', '野趣', '屿阔'));

-- 店铺月度核算 (多放行共享键 __shared__, 否则三家共享的人工/场地会读不到)
DROP POLICY IF EXISTS sc_smc_store ON store_monthly_costs;
CREATE POLICY sc_smc_store ON store_monthly_costs AS RESTRICTIVE FOR ALL TO authenticated
  USING       (NOT public.is_cd_procurement() OR store IN ('飞鸟', '野趣', '屿阔', '__shared__'))
  WITH CHECK  (NOT public.is_cd_procurement() OR store IN ('飞鸟', '野趣', '屿阔', '__shared__'));

-- 店铺其他费用
DROP POLICY IF EXISTS sc_storeother_store ON store_other_expense;
CREATE POLICY sc_storeother_store ON store_other_expense AS RESTRICTIVE FOR ALL TO authenticated
  USING       (NOT public.is_cd_procurement() OR store IN ('飞鸟', '野趣', '屿阔'))
  WITH CHECK  (NOT public.is_cd_procurement() OR store IN ('飞鸟', '野趣', '屿阔'));

-- 财务核算 · 订单量与营业额
DROP POLICY IF EXISTS sc_fin_store ON finance_daily_sales;
CREATE POLICY sc_fin_store ON finance_daily_sales AS RESTRICTIVE FOR ALL TO authenticated
  USING       (NOT public.is_cd_procurement() OR store IN ('飞鸟', '野趣', '屿阔'))
  WITH CHECK  (NOT public.is_cd_procurement() OR store IN ('飞鸟', '野趣', '屿阔'));

-- 财务核算 · 现金流
DROP POLICY IF EXISTS sc_cf_store ON finance_cashflow;
CREATE POLICY sc_cf_store ON finance_cashflow AS RESTRICTIVE FOR ALL TO authenticated
  USING       (NOT public.is_cd_procurement() OR store IN ('飞鸟', '野趣', '屿阔'))
  WITH CHECK  (NOT public.is_cd_procurement() OR store IN ('飞鸟', '野趣', '屿阔'));

-- ============================================================
-- 校验: 应看到 7 条 sc_* (RESTRICTIVE) + inv_write_role + fin_write_procurement + cf_write_procurement
-- ============================================================
SELECT tablename, policyname, cmd, permissive
FROM pg_policies
WHERE policyname LIKE 'sc\_%' OR policyname IN ('inv_write_role', 'fin_write_procurement', 'cf_write_procurement')
ORDER BY tablename, policyname;

-- ============================================================
-- 新增角色: 财务专员 (finance) — KK 2026-09-18 定
--   账号: 1416952931@qq.com
--   数据范围: 六家店全可见 (不做店铺收窄)
--   权限: 与黄丹同维度 (发货 / 库存 / 运维 / 店铺其他费用 / 月度核算 / 财务核算 / 办公室费用 / 汇率) 可读可写
--   不参与产品交接拖拽 (页面上无拖拽权), 订单记录 (order_records) 写权限仍为 admin + fr
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- 前置: 先在 Authentication → Users → Add user 建 1416952931@qq.com 并勾 Auto Confirm
-- ============================================================

-- ---------- 0. 放开 user_profiles.role 的取值限制, 允许 'finance' ----------
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'public.user_profiles'::regclass
    AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%role%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_profiles DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('admin', 'fr', 'cd_supplier', 'cd_link', 'cd_promotion', 'cd_procurement', 'finance', 'editor'));

-- ---------- 1. 写入财务专员的角色 (auth 账号建好后才会有行, 没建则这条不生效) ----------
INSERT INTO public.user_profiles (user_id, display_name, role)
SELECT u.id, '财务专员', 'finance'
FROM auth.users u
WHERE u.email = '1416952931@qq.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'finance';

-- ---------- 2. 各表写权限: 加上 finance ----------

-- 发货记录 (原: admin + cd_promotion + cd_procurement + cd_supplier)
DROP POLICY IF EXISTS ship_write ON shipments;
CREATE POLICY ship_write ON shipments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin','cd_promotion','cd_procurement','cd_supplier','finance')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin','cd_promotion','cd_procurement','cd_supplier','finance')));

-- 库存记录
DROP POLICY IF EXISTS inv_write_role ON inventory;
CREATE POLICY inv_write_role ON inventory FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin','cd_promotion','cd_supplier','cd_procurement','finance')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin','cd_promotion','cd_supplier','cd_procurement','finance')));

-- 店铺运维费用
DROP POLICY IF EXISTS opsfee_write_ops ON opsfee_monthly;
CREATE POLICY opsfee_write_ops ON opsfee_monthly FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin', 'cd_supplier', 'cd_procurement', 'finance')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin', 'cd_supplier', 'cd_procurement', 'finance')));

-- 店铺月度核算
DROP POLICY IF EXISTS smc_rw_mgmt ON store_monthly_costs;
CREATE POLICY smc_rw_mgmt ON store_monthly_costs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin', 'fr', 'cd_procurement', 'finance')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin', 'fr', 'cd_procurement', 'finance')));

-- 办公室费用明细
DROP POLICY IF EXISTS office_expense_write ON office_expense;
CREATE POLICY office_expense_write ON office_expense FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin', 'fr', 'cd_procurement', 'finance')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin', 'fr', 'cd_procurement', 'finance')));

-- 汇率
DROP POLICY IF EXISTS fx_write_mgmt ON fx_rates;
CREATE POLICY fx_write_mgmt ON fx_rates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin','fr','cd_procurement','finance')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin','fr','cd_procurement','finance')));

-- 财务核算 · 订单量与营业额 (原仅 admin; cf/fin 的 cd_procurement 策略保持不变)
DROP POLICY IF EXISTS "fin_read" ON finance_daily_sales;
CREATE POLICY "fin_read" ON finance_daily_sales FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role IN ('admin', 'finance')));
DROP POLICY IF EXISTS "fin_write" ON finance_daily_sales;
CREATE POLICY "fin_write" ON finance_daily_sales FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role IN ('admin', 'finance')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                      WHERE up.user_id = auth.uid() AND up.role IN ('admin', 'finance')));

-- 财务核算 · 现金流
DROP POLICY IF EXISTS "cf_read" ON finance_cashflow;
CREATE POLICY "cf_read" ON finance_cashflow FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role IN ('admin', 'finance')));
DROP POLICY IF EXISTS "cf_write" ON finance_cashflow;
CREATE POLICY "cf_write" ON finance_cashflow FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role IN ('admin', 'finance')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                      WHERE up.user_id = auth.uid() AND up.role IN ('admin', 'finance')));

-- 店铺其他费用 (store_other_expense) 已是全员可写, 无需改动


-- ============================================================
-- 校验
-- ============================================================
-- 校验 A: 财务专员角色是否已写入 (应返回 1 行 finance; 若为 0 行 = auth 账号还没建)
SELECT u.email, up.role, up.display_name
FROM auth.users u LEFT JOIN public.user_profiles up ON up.user_id = u.id
WHERE u.email = '1416952931@qq.com';

-- 校验 B: 各表写策略里是否已含 finance (应看到 8 张表)
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN ('ship_write','inv_write_role','opsfee_write_ops','smc_rw_mgmt',
                     'office_expense_write','fx_write_mgmt','fin_write','cf_write')
ORDER BY tablename, policyname;

-- ============================================================
-- 办公室费用明细 · 权限收窄 (KK 2026-09-18 定)
--   可见(读)  = admin(你) + fr(泺伊, 法国成员) + cd_procurement(黄丹)
--   登记(写)  = 只有 cd_procurement(黄丹) + admin(你兜底)
--   其他成员 = 完全看不到、也读不到
--   注: finance(夏蕾) 保留「读」→ 她的「店铺月度核算」里办公室费用合计才能算对;
--       但她的导航栏里没有这个页面 (前端已隐藏), 所以看不到明细。
--       若要连读也收紧, 把下面 read 策略里的 'finance' 去掉重跑即可。
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

-- 读: 只给 你 / 泺伊 / 黄丹 (+ 夏蕾读出合计用)
DROP POLICY IF EXISTS office_expense_read_all ON office_expense;
DROP POLICY IF EXISTS office_expense_read_limited ON office_expense;
CREATE POLICY office_expense_read_limited ON office_expense FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin', 'fr', 'cd_procurement', 'finance')));

-- 写: 只有黄丹 (+ admin 兜底)
DROP POLICY IF EXISTS office_expense_write ON office_expense;
CREATE POLICY office_expense_write ON office_expense FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin', 'cd_procurement')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin', 'cd_procurement')));

-- 校验: 应看到 office_expense_read_limited + office_expense_write 两条
SELECT policyname, cmd, permissive FROM pg_policies
WHERE tablename = 'office_expense' ORDER BY policyname;

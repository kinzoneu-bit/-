-- ============================================================
-- 店铺月度核算 · 写权限收窄 (KK 2026-09-18 定)
--   可见 = admin(你) + fr(泺伊) + cd_procurement(黄丹, 只见三家) + finance(夏蕾)
--   可写 = admin(你) + cd_procurement(黄丹) + finance(夏蕾)
--   法国成员(fr) → **只读** (不再能改收入/人工/场地/汇率)
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

DROP POLICY IF EXISTS smc_rw_mgmt ON store_monthly_costs;
CREATE POLICY smc_rw_mgmt ON store_monthly_costs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin', 'cd_procurement', 'finance')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin', 'cd_procurement', 'finance')));

-- 校验: 应返回 1 条 smc_rw_mgmt + 7 列
SELECT policyname, cmd, qual FROM pg_policies
WHERE tablename = 'store_monthly_costs' ORDER BY policyname;

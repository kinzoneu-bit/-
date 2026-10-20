-- ============================================================
-- 店铺运维费用 · RLS v4
-- 变更 (KK 2026-10-20): 追加「成都·推广(诗琪, cd_promotion)」可写
--   —— 诗琪负责推广/广告，需要录「广告」「优惠券」等费用
-- 最终可写角色: admin(KK) + cd_supplier(陈雪梅) + cd_procurement(黄丹)
--              + finance(夏蕾) + cd_promotion(诗琪)
-- 读: 所有登录用户（Tab 入口由前端按角色控制）
-- 汇率 fx_rates 不在此策略内 —— 诗琪仍不可改汇率（前端 canEditRate 已单独限定）
-- 在 Supabase → SQL Editor 整段粘贴执行，幂等可重复跑
-- ============================================================

ALTER TABLE opsfee_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsfee_read_all ON opsfee_monthly;
CREATE POLICY opsfee_read_all ON opsfee_monthly FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS opsfee_write_admin_supplier ON opsfee_monthly;
DROP POLICY IF EXISTS opsfee_write_ops ON opsfee_monthly;
DROP POLICY IF EXISTS opsfee_write_ops_v4 ON opsfee_monthly;
CREATE POLICY opsfee_write_ops_v4 ON opsfee_monthly FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin', 'cd_supplier', 'cd_procurement', 'finance', 'cd_promotion')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin', 'cd_supplier', 'cd_procurement', 'finance', 'cd_promotion')));

-- 校验 1: 应返回 2 条策略 (opsfee_read_all / opsfee_write_ops_v4)
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'opsfee_monthly' ORDER BY policyname;

-- 校验 2: 应看到 cd_promotion 账号在册（诗琪 = 503279601@qq.com）
SELECT up.role, up.display_name, u.email
FROM user_profiles up
JOIN auth.users u ON u.id = up.user_id
WHERE up.role IN ('admin', 'cd_supplier', 'cd_procurement', 'finance', 'cd_promotion')
ORDER BY up.role;

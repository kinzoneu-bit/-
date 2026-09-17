-- ============================================================
-- 店铺运维费用 · RLS v3
-- KK 2026-09-17 定: 追加「成都·采购(黄丹, cd_procurement)」—— 她负责财务核对
-- 最终可写角色: admin + cd_supplier(供应链/陈雪梅) + cd_procurement(采购/黄丹)
-- 读: 所有登录用户
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

ALTER TABLE opsfee_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsfee_read_all ON opsfee_monthly;
CREATE POLICY opsfee_read_all ON opsfee_monthly FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS opsfee_write_admin_supplier ON opsfee_monthly;
DROP POLICY IF EXISTS opsfee_write_ops ON opsfee_monthly;
CREATE POLICY opsfee_write_ops ON opsfee_monthly FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin', 'cd_supplier', 'cd_procurement')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin', 'cd_supplier', 'cd_procurement')));

-- 校验: 应返回 2 条策略
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'opsfee_monthly' ORDER BY policyname;

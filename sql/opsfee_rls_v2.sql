-- ============================================================
-- 店铺运维费用 (opsfee_monthly) · RLS v2
-- 2026-09-14 KK 定: 写权限从「仅 admin」扩大到「admin + 成都·供应链(cd_supplier)」
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

-- 1) 删掉旧策略 (仅 admin)
DROP POLICY IF EXISTS opsfee_write_admin ON opsfee_monthly;

-- 2) 新策略: admin + cd_supplier 可增删改
DROP POLICY IF EXISTS opsfee_write_admin_supplier ON opsfee_monthly;
CREATE POLICY opsfee_write_admin_supplier ON opsfee_monthly FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles up
            WHERE up.user_id = auth.uid()
              AND up.role IN ('admin', 'cd_supplier'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles up
            WHERE up.user_id = auth.uid()
              AND up.role IN ('admin', 'cd_supplier'))
  );

-- 3) 读策略保持全开 (所有登录用户可读), 若已存在则跳过
DROP POLICY IF EXISTS opsfee_read_all ON opsfee_monthly;
CREATE POLICY opsfee_read_all ON opsfee_monthly FOR SELECT TO authenticated USING (true);

-- 4) 校验: 应返回 2 条策略 (opsfee_read_all / opsfee_write_admin_supplier)
SELECT policyname, cmd, roles::text
FROM pg_policies
WHERE tablename = 'opsfee_monthly'
ORDER BY policyname;

-- 5) 校验: 应能查到 admin 与 cd_supplier 两个账号
SELECT u.email, up.role
FROM user_profiles up
JOIN auth.users u ON u.id = up.user_id
ORDER BY up.role;

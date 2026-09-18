-- ============================================================
-- 发货记录 · 录入权锁死 (KK 2026-09-18 定)
--   录入/编辑数据 = 只给 admin(KK) + 成都·供应链(陈雪梅, cd_supplier)
--   例外(必须保留, 否则相关功能点不动):
--     · finance(夏蕾)        → 复核 / 同意 / 拒绝 修改申请 都要写库
--     · cd_procurement(黄丹) → 勾选「账单核对 / 运费已付」(她 9-16 起的核对职责)
--   其余角色(推广 / 链接/ 法国成员) 只读
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

DROP POLICY IF EXISTS ship_write ON shipments;
CREATE POLICY ship_write ON shipments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin', 'cd_supplier', 'finance', 'cd_procurement')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin', 'cd_supplier', 'finance', 'cd_procurement')));

-- 校验: ship_read + ship_write 共 2 条
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'shipments' ORDER BY policyname;

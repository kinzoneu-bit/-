-- ============================================================
-- 发货记录 / 库存记录 · RLS v2
-- KK 2026-09-16 定: 让「成都·供应链(陈雪梅, cd_supplier)」也能编辑
--   shipments : 编辑记录 + 勾选「账单核对 / 运费已付」
--   inventory : 编辑库存行（上架日期/损耗/库存数等）
-- 最终可写角色:
--   shipments → admin + cd_promotion(推广) + cd_procurement(采购/黄丹) + cd_supplier(供应链/陈雪梅)
--   inventory → admin + cd_promotion(推广) + cd_supplier(供应链/陈雪梅)
-- 读: 所有登录用户
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

-- ---------- 发货记录 ----------
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ship_read ON shipments;
CREATE POLICY ship_read ON shipments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS ship_write ON shipments;
CREATE POLICY ship_write ON shipments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin','cd_promotion','cd_procurement','cd_supplier')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin','cd_promotion','cd_procurement','cd_supplier')));

-- ---------- 库存记录 ----------
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inv_read_all ON inventory;
CREATE POLICY inv_read_all ON inventory FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS inv_write_role ON inventory;
CREATE POLICY inv_write_role ON inventory FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin','cd_promotion','cd_supplier')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin','cd_promotion','cd_supplier')));

-- 校验: shipments 2 条 / inventory 2 条
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('shipments','inventory') ORDER BY tablename, policyname;

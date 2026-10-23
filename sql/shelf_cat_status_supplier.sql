-- =============================================================
-- 类目(cat)「修改状态」权限 · 给 成都·供应链(雪梅 cd_supplier) 开放
-- KK 2026-10-23 定
-- -------------------------------------------------------------
-- 背景:
--   前端「修改状态」弹框分两种对象 —— 类目(cat) / 产品(product)
--   类目状态点原本只有 admin/fr 可点(sFull)，雪梅点不了
-- -------------------------------------------------------------
-- 链路分析:
--   1) shelf_cats 的 UPDATE —— 已有 all_write_cats(TO authenticated USING true) 全开
--      → 数据库侧本来就放行 cd_supplier ✅
--   2) 但类目改状态会联动 monitor_handoff:
--        改为「在调研(idle)」→ INSERT 一行 box_key='h1'
--        改为「不做(skip/researched_skip)」→ DELETE 该 cat 的行
--      原策略: cd_supplier 只能 INSERT box_key='h2'、DELETE 仅 admin/fr
--      → 雪梅会「状态改成功但静默失败」: 不进 h1 框 / 移不出框 (前端未检查 error)
--   本脚本补这两条，只针对「类目行」(cat_id IS NOT NULL)，不碰 leaf 交接行
-- 幂等, 可在 Supabase SQL Editor 反复跑
-- =============================================================

ALTER TABLE public.monitor_handoff ENABLE ROW LEVEL SECURITY;

-- 1) 允许 cd_supplier 把类目推进 h1 框
DROP POLICY IF EXISTS "mh_supplier_insert_cat_h1" ON public.monitor_handoff;
CREATE POLICY "mh_supplier_insert_cat_h1" ON public.monitor_handoff
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles up
            WHERE up.user_id = auth.uid() AND up.role = 'cd_supplier')
    AND box_key = 'h1'
    AND cat_id IS NOT NULL
  );

-- 2) 允许 cd_supplier 把类目移出交接框 (仅类目行, 不动 leaf 交接行)
DROP POLICY IF EXISTS "mh_supplier_delete_cat" ON public.monitor_handoff;
CREATE POLICY "mh_supplier_delete_cat" ON public.monitor_handoff
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_profiles up
            WHERE up.user_id = auth.uid() AND up.role = 'cd_supplier')
    AND cat_id IS NOT NULL
  );

-- -------------------------------------------------------------
-- 校验 1: 该表现有全部策略 (应看到 mh_supplier_insert_cat_h1 / mh_supplier_delete_cat)
-- -------------------------------------------------------------
SELECT policyname, cmd, permissive
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'monitor_handoff'
ORDER BY policyname;

-- -------------------------------------------------------------
-- 校验 2: shelf_cats 写策略 (应看到 all_write_cats, 且 cmd = ALL, permissive = PERMISSIVE)
-- -------------------------------------------------------------
SELECT policyname, cmd, permissive
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'shelf_cats'
ORDER BY policyname;

-- -------------------------------------------------------------
-- 校验 3: 确认雪梅账号角色在册 (应返回 role = cd_supplier)
-- -------------------------------------------------------------
SELECT u.email, up.display_name, up.role
FROM public.user_profiles up
LEFT JOIN auth.users u ON u.id = up.user_id
WHERE up.role = 'cd_supplier';

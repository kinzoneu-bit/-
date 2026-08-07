-- =============================================================
-- RLS 落地 v3 · 账号角色 + 数据库层权限 (2026-08-07 最终版)
-- 权限原则 (KK 2026-08-07 确认):
--   ★ 隔离点只有两处:
--     1) 交接拖拽 (monitor_handoff): 供应链 h1→h2 / 链接 h2→h3 / 推广 h3→h4 / admin+fr 全向
--     2) 改状态 (shelf_leaves/products 的 UPDATE): 按拖拽权限框住, 只能改自己负责阶段的
--   ★ 其余所有操作 (加产品/加供应商/加末端/改品牌大类/推调研阶段等): 登录用户全可做
-- 在 Supabase SQL Editor 整段 Run 即可 (幂等, 可重复跑)
-- =============================================================

-- -------------------------------------------------------------
-- 1. 扩展 user_profiles.role 允许值 (原 check: admin/editor)
-- -------------------------------------------------------------
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'public.user_profiles'::regclass
    AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%admin%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_profiles DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('admin','fr','cd_supplier','cd_link','cd_promotion','editor'));

-- -------------------------------------------------------------
-- 2. 写入 5 个真实账号角色 (用邮箱反查 auth.users 的 id, 幂等)
-- -------------------------------------------------------------
INSERT INTO public.user_profiles (user_id, display_name, role, location)
SELECT u.id, v.display_name, v.role, v.location
FROM auth.users u
JOIN (VALUES
  ('kinzon.eu@gmail.com',  'KK',           'admin',        '法国'),
  ('qianlin20222@163.com', '法国成员',      'fr',           '法国'),
  ('2990206556@qq.com',    '成都·供应链',   'cd_supplier',  '成都'),
  ('2386332469@qq.com',    '成都·链接',     'cd_link',      '成都'),
  ('503279601@qq.com',     '成都·推广',     'cd_promotion', '成都')
) AS v(email, display_name, role, location) ON v.email = u.email
ON CONFLICT (user_id) DO UPDATE SET
  role = EXCLUDED.role,
  location = EXCLUDED.location,
  display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name);

-- -------------------------------------------------------------
-- 3. 读策略: 原有 auth_read_* 全部保留 (登录可读全部)
-- -------------------------------------------------------------

-- -------------------------------------------------------------
-- 4. 删除历史策略 (v1/v2 的角色细分策略 + 早期 editor/admin 策略), 全部重建
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "editor_write_cats_st"     ON public.shelf_cats;
DROP POLICY IF EXISTS "editor_write_leaves"      ON public.shelf_leaves;
DROP POLICY IF EXISTS "editor_write_products"    ON public.products;
DROP POLICY IF EXISTS "editor_write_suppliers"   ON public.suppliers;
DROP POLICY IF EXISTS "editor_write_evals"       ON public.site_evals;
DROP POLICY IF EXISTS "admin_write_brands"       ON public.brands;
DROP POLICY IF EXISTS "admin_write_groups"       ON public.shelf_groups;
DROP POLICY IF EXISTS "admin_insert_cats"        ON public.shelf_cats;
DROP POLICY IF EXISTS "admin_delete_cats"        ON public.shelf_cats;
DROP POLICY IF EXISTS "full_write_brands"        ON public.brands;
DROP POLICY IF EXISTS "full_write_groups"        ON public.shelf_groups;
DROP POLICY IF EXISTS "full_write_cats_st"       ON public.shelf_cats;
DROP POLICY IF EXISTS "full_insert_cats"         ON public.shelf_cats;
DROP POLICY IF EXISTS "full_delete_cats"         ON public.shelf_cats;
DROP POLICY IF EXISTS "full_write_leaves"        ON public.shelf_leaves;
DROP POLICY IF EXISTS "full_write_products"      ON public.products;
DROP POLICY IF EXISTS "full_write_suppliers"     ON public.suppliers;
DROP POLICY IF EXISTS "full_write_evals"         ON public.site_evals;
DROP POLICY IF EXISTS "link_write_products"      ON public.products;
DROP POLICY IF EXISTS "link_update_products"     ON public.products;
DROP POLICY IF EXISTS "supplier_write_suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "supplier_update_suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "supplier_update_products" ON public.products;
DROP POLICY IF EXISTS "promotion_update_products" ON public.products;
DROP POLICY IF EXISTS "supplier_update_leaves"   ON public.shelf_leaves;
DROP POLICY IF EXISTS "link_update_leaves"       ON public.shelf_leaves;
DROP POLICY IF EXISTS "promotion_update_leaves"  ON public.shelf_leaves;
DROP POLICY IF EXISTS "editor_write_brands"      ON public.brands;
DROP POLICY IF EXISTS "editor_write_groups"      ON public.shelf_groups;

-- -------------------------------------------------------------
-- 5. 默认全开: 品牌/大类/类目/供应商/跨站 登录用户全可写
-- -------------------------------------------------------------
CREATE POLICY "all_write_brands"   ON public.brands       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_write_groups"   ON public.shelf_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_write_cats"     ON public.shelf_cats   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_write_suppliers" ON public.suppliers   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_write_evals"    ON public.site_evals   FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- monitor_research_progress (推调研阶段): 表存在才建策略
DO $$
DECLARE p record;
BEGIN
  IF to_regclass('public.monitor_research_progress') IS NOT NULL THEN
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='monitor_research_progress'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.monitor_research_progress', p.policyname);
    END LOOP;
    EXECUTE 'ALTER TABLE public.monitor_research_progress ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "mrp_read" ON public.monitor_research_progress FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "all_write_research" ON public.monitor_research_progress FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- -------------------------------------------------------------
-- 6. shelf_leaves: 新增/删除 全开; 改状态 按阶段 (拖拽权限)
-- -------------------------------------------------------------
CREATE POLICY "leaves_insert_all"  ON public.shelf_leaves FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "leaves_delete_all"  ON public.shelf_leaves FOR DELETE TO authenticated USING (true);
-- admin/fr 全阶段可改状态
CREATE POLICY "leaves_update_full" ON public.shelf_leaves FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')));
-- cd_supplier: 只能改 h1 阶段内的 leaf 状态
CREATE POLICY "leaves_update_supplier" ON public.shelf_leaves FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_supplier')
         AND EXISTS (SELECT 1 FROM public.monitor_handoff mh WHERE mh.leaf_id = shelf_leaves.id AND mh.box_key = 'h1'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_supplier')
              AND EXISTS (SELECT 1 FROM public.monitor_handoff mh WHERE mh.leaf_id = shelf_leaves.id AND mh.box_key = 'h1'));
-- cd_link: 只能改 h2 阶段内的 leaf 状态
CREATE POLICY "leaves_update_link" ON public.shelf_leaves FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_link')
         AND EXISTS (SELECT 1 FROM public.monitor_handoff mh WHERE mh.leaf_id = shelf_leaves.id AND mh.box_key = 'h2'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_link')
              AND EXISTS (SELECT 1 FROM public.monitor_handoff mh WHERE mh.leaf_id = shelf_leaves.id AND mh.box_key = 'h2'));
-- cd_promotion: 只能改 h3/h4 阶段内的 leaf 状态
CREATE POLICY "leaves_update_promotion" ON public.shelf_leaves FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_promotion')
         AND EXISTS (SELECT 1 FROM public.monitor_handoff mh WHERE mh.leaf_id = shelf_leaves.id AND mh.box_key IN ('h3','h4')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_promotion')
              AND EXISTS (SELECT 1 FROM public.monitor_handoff mh WHERE mh.leaf_id = shelf_leaves.id AND mh.box_key IN ('h3','h4')));

-- -------------------------------------------------------------
-- 7. products: 新增/删除 全开; 改状态 按阶段
-- -------------------------------------------------------------
CREATE POLICY "products_insert_all" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "products_delete_all" ON public.products FOR DELETE TO authenticated USING (true);
CREATE POLICY "products_update_full" ON public.products FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')));
CREATE POLICY "products_update_supplier" ON public.products FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_supplier')
         AND EXISTS (SELECT 1 FROM public.monitor_handoff mh WHERE mh.leaf_id = products.leaf_id AND mh.box_key = 'h1'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_supplier')
              AND EXISTS (SELECT 1 FROM public.monitor_handoff mh WHERE mh.leaf_id = products.leaf_id AND mh.box_key = 'h1'));
CREATE POLICY "products_update_link" ON public.products FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_link')
         AND EXISTS (SELECT 1 FROM public.monitor_handoff mh WHERE mh.leaf_id = products.leaf_id AND mh.box_key = 'h2'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_link')
              AND EXISTS (SELECT 1 FROM public.monitor_handoff mh WHERE mh.leaf_id = products.leaf_id AND mh.box_key = 'h2'));
CREATE POLICY "products_update_promotion" ON public.products FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_promotion')
         AND EXISTS (SELECT 1 FROM public.monitor_handoff mh WHERE mh.leaf_id = products.leaf_id AND mh.box_key IN ('h3','h4')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_promotion')
              AND EXISTS (SELECT 1 FROM public.monitor_handoff mh WHERE mh.leaf_id = products.leaf_id AND mh.box_key IN ('h3','h4')));

-- -------------------------------------------------------------
-- 8. monitor_handoff: 交接表严格按角色 (核心隔离点)
--    cd_supplier: 只能 h1→h2 (INSERT 新 h2 行 / UPDATE h1 行→h2)
--    cd_link    : 只能 h2→h3
--    cd_promotion: 只能 h3→h4
--    admin/fr   : 全权限
-- -------------------------------------------------------------
DO $$
DECLARE p record;
BEGIN
  IF to_regclass('public.monitor_handoff') IS NOT NULL THEN
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='monitor_handoff'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.monitor_handoff', p.policyname);
    END LOOP;
    EXECUTE 'ALTER TABLE public.monitor_handoff ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "mh_read" ON public.monitor_handoff FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "mh_delete" ON public.monitor_handoff FOR DELETE TO authenticated
             USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN (''admin'',''fr'')))';
    EXECUTE 'CREATE POLICY "mh_full_write" ON public.monitor_handoff FOR ALL TO authenticated
             USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN (''admin'',''fr'')))
             WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN (''admin'',''fr'')))';
    EXECUTE 'CREATE POLICY "mh_supplier_insert" ON public.monitor_handoff FOR INSERT TO authenticated
             WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = ''cd_supplier'')
                         AND box_key = ''h2'')';
    EXECUTE 'CREATE POLICY "mh_supplier_update" ON public.monitor_handoff FOR UPDATE TO authenticated
             USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = ''cd_supplier'')
                    AND box_key = ''h1'')
             WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = ''cd_supplier'')
                         AND box_key = ''h2'')';
    EXECUTE 'CREATE POLICY "mh_link_insert" ON public.monitor_handoff FOR INSERT TO authenticated
             WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = ''cd_link'')
                         AND box_key = ''h3'')';
    EXECUTE 'CREATE POLICY "mh_link_update" ON public.monitor_handoff FOR UPDATE TO authenticated
             USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = ''cd_link'')
                    AND box_key = ''h2'')
             WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = ''cd_link'')
                         AND box_key = ''h3'')';
    EXECUTE 'CREATE POLICY "mh_promotion_insert" ON public.monitor_handoff FOR INSERT TO authenticated
             WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = ''cd_promotion'')
                         AND box_key = ''h4'')';
    EXECUTE 'CREATE POLICY "mh_promotion_update" ON public.monitor_handoff FOR UPDATE TO authenticated
             USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = ''cd_promotion'')
                    AND box_key = ''h3'')
             WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = ''cd_promotion'')
                         AND box_key = ''h4'')';
  END IF;
END $$;

-- -------------------------------------------------------------
-- 9. monitor_handoff_log: 读全; 写=交接角色 (admin/fr/cd_supplier/cd_link/cd_promotion)
-- -------------------------------------------------------------
DO $$
DECLARE p record;
BEGIN
  IF to_regclass('public.monitor_handoff_log') IS NOT NULL THEN
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='monitor_handoff_log'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.monitor_handoff_log', p.policyname);
    END LOOP;
    EXECUTE 'ALTER TABLE public.monitor_handoff_log ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "mhlog_read" ON public.monitor_handoff_log FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "mhlog_insert_role" ON public.monitor_handoff_log FOR INSERT TO authenticated
             WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN (''admin'',''fr'',''cd_supplier'',''cd_link'',''cd_promotion'')))';
  END IF;
END $$;

-- -------------------------------------------------------------
-- 10. 校验: 查询最终的角色数据
-- -------------------------------------------------------------
SELECT up.user_id, u.email, up.display_name, up.role, up.location
FROM public.user_profiles up
LEFT JOIN auth.users u ON u.id = up.user_id
ORDER BY up.role;

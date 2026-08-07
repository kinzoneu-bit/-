-- =============================================================
-- RLS 落地 · 账号角色 + 数据库层权限 (2026-08-07)
-- 前提: 已建 monitor_handoff_log (sql/monitor_handoff_log.sql)
-- 角色: admin / fr / cd_supplier / cd_link / cd_promotion
-- 权限矩阵 (KK 已确认):
--   admin + fr       : 全部表可写 + 拖出 h1 可标 researched_skip + 可见阶段转化分析
--   cd_supplier      : monitor_handoff 仅 h1→h2; 可加供应商; 可推调研阶段
--   cd_link          : monitor_handoff 仅 h2→h3; 可加产品/改ASIN
--   cd_promotion     : 只读
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
-- 3. 读策略: 保留全部 (登录可读全部)
-- -------------------------------------------------------------
-- (原有 auth_read_* 策略不动)

-- -------------------------------------------------------------
-- 4. 删除旧的宽松写策略 (任何登录用户可写 = 等于没权限)
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "editor_write_cats_st"    ON public.shelf_cats;
DROP POLICY IF EXISTS "editor_write_leaves"     ON public.shelf_leaves;
DROP POLICY IF EXISTS "editor_write_products"   ON public.products;
DROP POLICY IF EXISTS "editor_write_suppliers"  ON public.suppliers;
DROP POLICY IF EXISTS "editor_write_evals"      ON public.site_evals;

-- -------------------------------------------------------------
-- 5. 品牌/大类: 仅 admin + fr 可写 (原来只认 admin)
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "admin_write_brands" ON public.brands;
DROP POLICY IF EXISTS "admin_write_groups" ON public.shelf_groups;
DROP POLICY IF EXISTS "admin_insert_cats"  ON public.shelf_cats;
DROP POLICY IF EXISTS "admin_delete_cats"  ON public.shelf_cats;

CREATE POLICY "full_write_brands" ON public.brands
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')));

CREATE POLICY "full_write_groups" ON public.shelf_groups
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')));

CREATE POLICY "full_write_cats_st" ON public.shelf_cats
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')));

CREATE POLICY "full_insert_cats" ON public.shelf_cats
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')));

CREATE POLICY "full_delete_cats" ON public.shelf_cats
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')));

-- -------------------------------------------------------------
-- 6. 末端/产品/供应商/跨站: admin+fr 全写; cd_supplier 可写供应商; cd_link 可写产品
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "full_write_leaves" ON public.shelf_leaves;
CREATE POLICY "full_write_leaves" ON public.shelf_leaves
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')));

-- products: admin/fr 全写 + cd_link 可 新增/改 (加产品/改ASIN)
DROP POLICY IF EXISTS "full_write_products" ON public.products;
DROP POLICY IF EXISTS "link_write_products"  ON public.products;
CREATE POLICY "full_write_products" ON public.products
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')));
CREATE POLICY "link_write_products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_link'));
CREATE POLICY "link_update_products" ON public.products
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_link'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_link'));

-- suppliers: admin/fr 全写 + cd_supplier 可 新增/改 (挖供应商)
DROP POLICY IF EXISTS "full_write_suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "supplier_write_suppliers" ON public.suppliers;
CREATE POLICY "full_write_suppliers" ON public.suppliers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')));
CREATE POLICY "supplier_write_suppliers" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_supplier'));
CREATE POLICY "supplier_update_suppliers" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_supplier'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'cd_supplier'));

-- site_evals: admin/fr 全写
DROP POLICY IF EXISTS "full_write_evals" ON public.site_evals;
CREATE POLICY "full_write_evals" ON public.site_evals
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')));

-- -------------------------------------------------------------
-- 7. monitor_handoff: 交接表按角色 (核心)
--    cd_supplier: 只能把 h1 的行改成 h2 (或 upsert 新 h2 行)
--    cd_link    : 只能把 h2 的行改成 h3 (或 upsert 新 h3 行)
--    admin/fr   : 全权限; cd_promotion: 无写
-- -------------------------------------------------------------
DO $$
DECLARE p record;
BEGIN
  IF to_regclass('public.monitor_handoff') IS NOT NULL THEN
    -- 先删掉该表所有旧策略, 防止宽松策略残留
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='monitor_handoff'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.monitor_handoff', p.policyname);
    END LOOP;
    EXECUTE 'ALTER TABLE public.monitor_handoff ENABLE ROW LEVEL SECURITY';
    -- 读: 登录可读
    EXECUTE 'CREATE POLICY "mh_read" ON public.monitor_handoff FOR SELECT TO authenticated USING (true)';
    -- admin/fr 全写
    EXECUTE 'CREATE POLICY "mh_full_write" ON public.monitor_handoff FOR ALL TO authenticated
             USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN (''admin'',''fr'')))
             WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN (''admin'',''fr'')))';
    -- cd_supplier: upsert 到 h2 (从 h1 来的行或新行)
    EXECUTE 'CREATE POLICY "mh_supplier_insert" ON public.monitor_handoff FOR INSERT TO authenticated
             WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = ''cd_supplier'')
                         AND box_key = ''h2'')';
    EXECUTE 'CREATE POLICY "mh_supplier_update" ON public.monitor_handoff FOR UPDATE TO authenticated
             USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = ''cd_supplier'')
                    AND box_key = ''h1'')
             WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = ''cd_supplier'')
                         AND box_key = ''h2'')';
    -- cd_link: upsert 到 h3 (从 h2 来的行或新行)
    EXECUTE 'CREATE POLICY "mh_link_insert" ON public.monitor_handoff FOR INSERT TO authenticated
             WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = ''cd_link'')
                         AND box_key = ''h3'')';
    EXECUTE 'CREATE POLICY "mh_link_update" ON public.monitor_handoff FOR UPDATE TO authenticated
             USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = ''cd_link'')
                    AND box_key = ''h2'')
             WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = ''cd_link'')
                         AND box_key = ''h3'')';
    -- cd_promotion: upsert 到 h4 (从 h3 来的行或新行, 货备好推上去)
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
-- 8. monitor_handoff_log: 记录交接动作 (admin/fr/cd_supplier/cd_link 可写)
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
-- 9. monitor_research_progress: 调研阶段进度 (admin/fr/cd_supplier 可写)
-- -------------------------------------------------------------
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
    EXECUTE 'CREATE POLICY "mrp_write_role" ON public.monitor_research_progress FOR ALL TO authenticated
             USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN (''admin'',''fr'',''cd_supplier'')))
             WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role IN (''admin'',''fr'',''cd_supplier'')))';
  END IF;
END $$;

-- -------------------------------------------------------------
-- 10. 校验: 查询最终的角色数据
-- -------------------------------------------------------------
SELECT up.user_id, u.email, up.display_name, up.role, up.location
FROM public.user_profiles up
LEFT JOIN auth.users u ON u.id = up.user_id
ORDER BY up.role;

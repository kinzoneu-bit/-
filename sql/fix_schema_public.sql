-- ============================================================
-- 修复: 货架数据加载失败 "Invalid schema: public"
-- 原因: public schema 不存在 / anon 与 authenticated 角色无 USAGE 权限
-- 步骤: 先诊断, 再按需修复
-- ============================================================

-- 1) 诊断: public schema 是否存在
SELECT schema_name, schema_owner
FROM information_schema.schemata
WHERE schema_name = 'public';
-- 若上面返回 0 行 → schema 不存在, 跳到第 3 步建
-- 若返回 1 行 → schema 存在, 继续第 2 步

-- 2) 诊断: anon / authenticated 对 public 的 USAGE 权限
SELECT grantee, privilege_type
FROM information_schema.schema_privileges
WHERE schema_name = 'public' AND grantee IN ('anon', 'authenticated');
-- 若返回 0 行或缺少 authenticated → 跳到第 4 步补 grant
-- 若有 USAGE → 可能是表级 RLS 配错, 跳到第 5 步检查

-- 3) 重建 public schema (仅当第 1 步返回 0 行时执行)
CREATE SCHEMA IF NOT EXISTS public;

-- 4) 补 USAGE 权限 (大多情况问题在这)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated;

-- 5) 检查: 业务表是否都在 public
SELECT table_schema, table_name FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name;
-- 业务表 (brands/shelf_groups/shelf_cats/...) 应都在 public

-- 6) 校验: 模拟前端 anon 角色的查询
SET ROLE anon;
SELECT count(*) AS cat_count FROM public.shelf_cats;
RESET ROLE;
-- 应能正常返回, 不再报 "Invalid schema"

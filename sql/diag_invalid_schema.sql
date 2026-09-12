-- ============================================================
-- 深层诊断: 权限都在但 PostgREST 仍报 "Invalid schema: public"
-- 真相很可能是: anon/authenticated 角色被删了 / authenticator 没权限
-- ============================================================

-- 1) 关键角色是否还存在 (必须返回 4 行: anon/authenticated/authenticator/service_role)
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname IN ('anon','authenticated','authenticator','service_role')
ORDER BY rolname;
-- ★ 如果 anon 或 authenticated 缺失 → 这就是真根因

-- 2) PostgREST 连接用的角色 (authenticator) 对 public 有 USAGE 吗
SELECT has_schema_privilege('authenticator','public','USAGE') AS authn_usage,
       has_schema_privilege('service_role','public','USAGE')    AS svc_usage;

-- 3) 当前会话是哪个角色 (SQL Editor 里跑, 应该是 postgres 或 supabase_admin)
SELECT current_user, session_user;

-- 4) 模拟前端 anon 角色完整查 (在 SQL Editor 里以超级用户 SET ROLE 到 anon 试一次)
--    注意: SQL Editor 是超级用户连接, SET ROLE 后会用目标角色的权限
SET ROLE anon;
SELECT count(*) AS anon_cat_count FROM public.shelf_cats;
RESET ROLE;
-- ★ 如果这一步报 Invalid schema → anon 角色真的没 USAGE (但前面 has_schema_privilege 应该能查到)
-- ★ 如果这一步成功 → 问题就在 PostgREST 端, 不是 SQL 端

-- 5) 把 anon 角色所属的 schema 权限全列出来 (终极诊断)
SELECT n.nspname AS schema, 
       has_schema_privilege('anon', n.nspname, 'USAGE') AS anon_can_use
FROM pg_namespace n
WHERE n.nspname IN ('public','storage','graphql_public','auth')
ORDER BY n.nspname;
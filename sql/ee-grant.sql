-- ================================================================
-- 东欧库 · 补授权 (ee-grant.sql)
-- 背景: 在 SQL Editor 建表不会自动把表权限授给 anon / authenticated /
--       service_role, 导致前端和 API 全部 permission denied。
-- 用法: 新库 → SQL Editor → 粘贴 → Run (幂等, 可重复执行)
-- ================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- service_role: 后台脚本 / 自动化用, 完全放开 (它本身绕过 RLS)
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- authenticated: 看板登录用户, 受 RLS 约束
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- 之后新建的表自动继承同样授权 (避免下次建表又踩这个坑)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- 校验: 应列出 23 张表且 authenticated / service_role 都出现在 grantee 里
SELECT table_name,
       string_agg(DISTINCT grantee, ',' ORDER BY grantee) AS grantees
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon','authenticated','service_role')
GROUP BY table_name
ORDER BY table_name;

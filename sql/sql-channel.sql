-- ================================================================
-- SQL 自主通道 · 加固版 (sql-channel.sql)
-- 目标库: 西欧 amz-system 生产库 (hsyuopmmndpcabhegics)
-- 作用: 让 AI 能通过 API 执行结构变更 (DDL), 不用每次手动粘 SQL
-- 风险: 数据库多一个 security definer 高权限函数, 调用权只给 service_role
-- 用法: SQL Editor 整段粘贴 → Run (幂等, 可重复执行)
-- ================================================================
-- 相对原始方案的四处加固:
--   ① 拦 alter role / user / database / system  → 防提权改账号
--   ② 拦 create extension / foreign / server    → 防装扩展绕过护栏
--   ③ 补 drop materialized view                 → 原方案漏了
--   ④ grant 精确拦 to anon/authenticated/public → 原方案的 \m(public)\M
--      会误伤 public.xxx 表名, 导致正常授权也失败
-- ================================================================

-- ---------- 第 1 步: 审计表 ----------
create table if not exists public.ops_sql_audit (
  id        bigserial primary key,
  called_at timestamptz not null default now(),
  sql_text  text,
  ok        boolean,
  err       text
);
create index if not exists idx_sql_audit_time on public.ops_sql_audit (called_at desc);

-- ---------- 第 2 步: 执行函数 (加固护栏版) ----------
create or replace function public.exec_sql(sql text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  head text;
begin
  head := lower(regexp_replace(coalesce(sql, ''), '^\s+|\s+$', '', 'g'));

  -- ① 破坏性操作: 清数据 / 删表删库 (放最前, 报错信息才准确)
  if head ~ '\m(delete|truncate)\M'
     or head ~ '\mdrop\s+(table|schema|database)\M'
     or head ~ '\mdrop\s+materialized\s+view\M' then
    raise exception '拒绝: 不允许清数据或删表 (%), 只允许改结构', left(head, 60);
  end if;

  -- ② 不能改护栏本身
  if head ~ '\m(function|procedure|trigger)\M' then
    raise exception '拒绝: 不允许通过此通道创建或修改函数/触发器';
  end if;

  -- ③ 提权类: 改角色 / 改属主 / 装扩展 / 外连
  if head ~ '^\s*alter\s+(role|user|database|system)\M'
     or head ~ '\mowner\s+to\M'
     or head ~ '^\s*create\s+(extension|foreign|server|publication|subscription)\M' then
    raise exception '拒绝: 不允许变更角色/属主/扩展/外连';
  end if;

  -- ④ 不允许把权限开给匿名或登录角色
  --    注意: 只匹配 "to anon/authenticated/public", 不匹配 public.表名
  if head ~ '^\s*grant\M' and head ~ '\mto\s+(anon|authenticated|public)\M' then
    raise exception '拒绝: 不允许向 anon / authenticated / public 授权';
  end if;

  -- ⑤ 白名单: 只放结构变更
  --    drop index / drop view 必须放行, 否则建错了删不掉
  if head !~ '^(create|alter|comment|grant|drop\s+(index|view))' then
    raise exception '只接受结构变更 (create/alter/comment/grant/drop index|view), 收到: %', left(head, 40);
  end if;

  begin
    execute sql;
  exception when others then
    insert into public.ops_sql_audit (sql_text, ok, err)
    values (left(sql, 4000), false, sqlerrm);
    raise;
  end;

  insert into public.ops_sql_audit (sql_text, ok) values (left(sql, 4000), true);
  return 'ok';
end;
$$;

comment on function public.exec_sql(text) is
  'AI 结构变更通道 (加固护栏版): 只允许 create/alter/comment/grant/drop index|view, 禁止删表清数据改角色装扩展, 每次调用写 ops_sql_audit';

-- ---------- 第 3 步: 只读查询函数 ----------
create or replace function public.exec_query(sql text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  head text;
  r    jsonb;
begin
  head := lower(regexp_replace(coalesce(sql, ''), '^\s+|\s+$', '', 'g'));

  if head !~ '^(select|with)' then
    raise exception '只接受 select / with 查询';
  end if;

  if head ~ '\m(insert|update|delete|truncate|drop|alter|create)\M' then
    raise exception '查询语句里不允许出现写操作';
  end if;

  execute 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (' || sql || ') t' into r;
  return r;
end;
$$;

-- ---------- 第 4 步: 锁死调用权 (最关键, 漏了等于把库交出去) ----------
revoke all on function public.exec_sql(text)   from public, anon, authenticated;
revoke all on function public.exec_query(text) from public, anon, authenticated;

grant execute on function public.exec_sql(text)   to service_role;
grant execute on function public.exec_query(text) to service_role;

notify pgrst, 'reload schema';

-- ---------- 第 5 步: 自检 ----------
-- 5.1 权限: 期望只有 postgres 与 service_role, 看不到 anon / authenticated
select p.proname,
       p.prosecdef as security_definer,
       array_to_string(p.proacl, ' | ') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('exec_sql', 'exec_query');

-- 5.2 审计表就绪
select count(*) as audit_rows from public.ops_sql_audit;

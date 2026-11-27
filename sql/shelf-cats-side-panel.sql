-- 类目侧栏（KK 2026-11-27）：报告外链 + 分析记录
-- 决策：不建新表，直接在 shelf_cats 上加两个 jsonb 数组列
--   好处：① 已全量拉取 shelf_cats，侧栏零额外请求 ② 删类目自动带走记录 ③ 与类目状态同表，一次 update 落库
--   代价：并发写同一类目会互相覆盖（内部小团队，可接受；如要严格并发再迁独立表）
-- 已在西欧库执行（2026-11-27 22:04），以下为留档

alter table public.shelf_cats add column cat_reports  jsonb default '[]'::jsonb;
alter table public.shelf_cats add column cat_analysis jsonb default '[]'::jsonb;

comment on column public.shelf_cats.cat_reports  is '类目调研报告外链：[{id,title,url,verdict,summary,author,at}] verdict=fit/hold/unfit';
comment on column public.shelf_cats.cat_analysis is '类目分析记录（追加式）：[{id,body,author,at}]';

-- 侧栏"在售款数"口径：大字=本节点直接挂的产品里 st=selling 的款数；小字=含子类目递归合计
-- 不新增字段，前端由 products.cat_id + shelf_cats.parent_cat_id 现算
-- 判断选项（第三块）复用现有 shelf_cats.st（selling/idle/ready/skip），不另立口径

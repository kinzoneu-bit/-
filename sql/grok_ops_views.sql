-- ============================================================
-- Grok 专用只读视图 — KK 2026-11-06
-- 用途: 给 Grok 通过 Supabase MCP 查运营数据做分析
--
-- 设计原则:
--   1. 只读，不含任何写操作
--   2. 剔除 note 等自由文本字段 —— 防提示注入(表里文字会变成给 AI 的指令)
--   3. 只暴露分析需要的列，暴露 user_profiles / order_records 等敏感表
--   4. 全部以 grok_ 前缀命名，方便在提示词里约束「只查 grok_ 开头的视图」
--
-- 执行位置: Supabase → SQL Editor，整段粘贴，可重复跑(create or replace)
-- ============================================================

-- 1) 当前库存 + 库龄 + 货值
create or replace view public.grok_stock_now as
select
  i.store,
  i.asin,
  i.product_name,
  i.ship_batch,
  i.ship_warehouse,
  i.listed_date,
  coalesce(i.stock_qty, 0)                              as stock_qty,
  i.listed_qty,
  coalesce(i.loss_qty, 0)                               as loss_qty,
  i.landed_cost,
  round(coalesce(i.stock_qty, 0) * coalesce(i.landed_cost, 0), 2) as stock_value,
  case when i.listed_date is null then null
       else (current_date - i.listed_date) end          as aging_days
from public.inventory i
where coalesce(i.stock_qty, 0) > 0;

comment on view public.grok_stock_now is '当前在库明细: 店/ASIN/批次/在库数/到仓价/货值/库龄天数';

-- 2) 发货批次到仓成本拆解
create or replace view public.grok_ship_cost as
select
  s.store,
  s.ship_batch,
  s.ship_warehouse,
  s.ship_date,
  s.product_name,
  s.asin,
  s.qty,
  s.purchase_price,
  s.goods_value,
  s.freight,
  s.misc_fee,
  s.duty,
  s.insurance_fee,
  s.landed_cost,
  s.channel,
  s.listed,
  s.listed_qty,
  s.review_status
from public.shipments s;

comment on view public.grok_ship_cost is '发货批次成本: 采购/运费/杂费/关税/保险 → 到仓价 landed_cost';

-- 3) 月度核算明细(收入/成本/各项费用)
create or replace view public.grok_monthly_cost as
select m.month, m.store, m.item, m.amount
from public.store_monthly_costs m;

comment on view public.grok_monthly_cost is '店铺月度核算明细, 按 month+store+item 汇总 amount 即得各项';

-- 4) 运维费用
create or replace view public.grok_opsfee as
select o.month, o.store, o.site, o.category, o.amount
from public.opsfee_monthly o;

comment on view public.grok_opsfee is '店铺运维费用: 按月/店/site/类目';

-- 5) 店铺其他费用
create or replace view public.grok_store_expense as
select e.exp_date, e.store, e.item, e.amount
from public.store_other_expense e;

comment on view public.grok_store_expense is '店铺其他费用登记';

-- 6) 办公室费用
create or replace view public.grok_office_expense as
select e.exp_date, e.item, e.amount, e.region
from public.office_expense e;

comment on view public.grok_office_expense is '办公室费用, 月度合计会回填到月度核算';

-- 7) 售后库存
create or replace view public.grok_after_sales as
select
  a.kind,
  a.rec_date,
  a.store,
  a.product,
  a.asin,
  a.remove_order_no,
  a.remove_qty,
  a.received_qty,
  a.tracking_no
from public.after_stock a;

comment on view public.grok_after_sales is '售后库存: kind = amz_return/wh_receipt/wh_saleable 三区块';

-- 8) 汇率
create or replace view public.grok_fx as
select f.month, f.rate from public.fx_rates f;

comment on view public.grok_fx is '月度汇率 EUR→CNY';

-- ============================================================
-- 权限: 视图以 owner 权限执行, 正常无需额外授权。
-- 若 Grok 报 permission denied for view, 再按 MCP 报错里给出的
-- 角色名补一条(把 <role> 换成实际角色):
--   grant select on public.grok_stock_now, public.grok_ship_cost,
--     public.grok_monthly_cost, public.grok_opsfee, public.grok_store_expense,
--     public.grok_office_expense, public.grok_after_sales, public.grok_fx
--   to <role>;
-- ⚠️ 不要 grant 给 anon —— anon key 在前端是公开的, 授了等于把库开到公网。
-- ============================================================

-- 验收: 应返回 8 行
select table_name
from information_schema.views
where table_schema = 'public' and table_name like 'grok\_%'
order by table_name;

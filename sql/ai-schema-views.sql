-- ================================================================
-- ai schema · 面向 AI 分析的数据层
-- 目标库: 西欧 hsyuopmmndpcabhegics
--
-- 设计原则:
--   1) 只暴露已定口径的业务视图, AI 看不到 36 张原始表
--   2) 敏感数据(人工工资明细/供应商账期/现金流水)不进 ai schema
--   3) 每个视图每列都写 COMMENT, AI 连上来自动读口径, 不用人交代
--
-- 口径三条铁律(写死在视图里, 改口径必须改视图):
--   A. 头程/杂费/关税/保险是批次级字段, 同一批次多行存同一个值, 必须按 ship_batch 去重
--   B. store_monthly_costs 里 store='__shared__' 是飞鸟/野趣/屿阔三家共享的费用, 按 1/3 摊分
--   C. platform_fee 是亚马逊从卖家余额扣的, 不是现金支出, 不要和现金流混算
-- ================================================================

create schema if not exists ai;

-- ---------- 1. 店铺月度损益 ----------
create or replace view ai.store_pnl as
with m1 as (select distinct month from public.store_monthly_costs),
m2 as (select distinct date_trunc('month', month)::date as month from public.opsfee_monthly),
m3 as (select distinct date_trunc('month', exp_date)::date as month from public.store_other_expense),
months as (select month from m1 union select month from m2 union select month from m3),
own as (
  select month, store,
    sum(case when item = '收入' then amount else 0 end) as revenue,
    sum(case when item = '人工' then amount else 0 end) as labor_own,
    sum(case when item = '场地' then amount else 0 end) as site_own,
    sum(case when item = '其他' then amount else 0 end) as other_own
  from public.store_monthly_costs
  where store <> '__shared__'
  group by month, store
),
shared as (
  select month,
    sum(case when item = '人工' then amount else 0 end) / 3.0 as labor_share,
    sum(case when item = '场地' then amount else 0 end) / 3.0 as site_share
  from public.store_monthly_costs
  where store = '__shared__'
  group by month
),
fee as (
  select date_trunc('month', month)::date as month, store, sum(amount) as platform_fee
  from public.opsfee_monthly
  group by 1, 2
),
oth as (
  select date_trunc('month', exp_date)::date as month, store, sum(amount) as store_other_cost
  from public.store_other_expense
  group by 1, 2
),
keys as (
  select month, store from own
  union select month, store from fee
  union select month, store from oth
  union select month, s.store from shared sh cross join (select unnest(array['飞鸟','野趣','屿阔'])::text as store) s
)
select
  k.month,
  k.store,
  round(coalesce(o.revenue, 0), 2) as revenue,
  round(coalesce(f.platform_fee, 0), 2) as platform_fee,
  round(coalesce(t.store_other_cost, 0), 2) as store_other_cost,
  round(coalesce(o.revenue, 0) - coalesce(f.platform_fee, 0) - coalesce(t.store_other_cost, 0), 2) as store_profit,
  round(coalesce(o.labor_own, 0) + case when k.store in ('飞鸟','野趣','屿阔') then coalesce(sh.labor_share, 0) else 0 end, 2) as labor,
  round(coalesce(o.site_own, 0) + case when k.store in ('飞鸟','野趣','屿阔') then coalesce(sh.site_share, 0) else 0 end, 2) as site,
  round(coalesce(o.other_own, 0), 2) as other_cost,
  round(coalesce(o.revenue, 0) - coalesce(f.platform_fee, 0) - coalesce(t.store_other_cost, 0)
        - coalesce(o.labor_own, 0) - case when k.store in ('飞鸟','野趣','屿阔') then coalesce(sh.labor_share, 0) else 0 end
        - coalesce(o.site_own, 0) - case when k.store in ('飞鸟','野趣','屿阔') then coalesce(sh.site_share, 0) else 0 end
        - coalesce(o.other_own, 0), 2) as net_profit
from keys k
left join own o on o.month = k.month and o.store = k.store
left join shared sh on sh.month = k.month
left join fee f on f.month = k.month and f.store = k.store
left join oth t on t.month = k.month and t.store = k.store;

-- ---------- 2. 项目月度损益(全店合计) ----------
create or replace view ai.project_pnl as
with s as (
  select month,
    sum(revenue) as revenue,
    sum(platform_fee) as platform_fee,
    sum(store_other_cost) as store_other_cost,
    sum(store_profit) as store_profit,
    sum(labor) as labor,
    sum(site) as site,
    sum(other_cost) as other_cost
  from ai.store_pnl
  group by month
),
off as (
  select date_trunc('month', exp_date)::date as month, sum(amount) as office_cost
  from public.office_expense
  group by 1
)
select
  s.month,
  round(s.revenue, 2) as revenue,
  round(s.platform_fee, 2) as platform_fee,
  round(s.store_other_cost, 2) as store_other_cost,
  round(s.store_profit, 2) as store_profit,
  round(s.labor, 2) as labor,
  round(s.site, 2) as site,
  round(s.other_cost, 2) as other_cost,
  round(coalesce(off.office_cost, 0), 2) as office_cost,
  round(s.store_profit - s.labor - s.site - s.other_cost - coalesce(off.office_cost, 0), 2) as net_profit,
  case when s.revenue <> 0 then round((s.store_profit - s.labor - s.site - s.other_cost - coalesce(off.office_cost, 0)) / s.revenue * 100, 2) else null end as net_margin_pct
from s
left join off on off.month = s.month;

-- ---------- 3. 月度现金流(只含真金白银) ----------
create or replace view ai.cashflow_monthly as
select
  period,
  round(coalesce(purchase, 0), 2) as purchase,
  round(coalesce(logistics, 0), 2) as logistics,
  round(coalesce(office, 0), 2) as office,
  round(coalesce(store_other, 0), 2) as store_other,
  round(coalesce(manual_out, 0), 2) as manual_out,
  round(coalesce(core_out, 0), 2) as core_out,
  round(coalesce(labor, 0), 2) as labor,
  round(coalesce(site, 0), 2) as site,
  round(coalesce(total_out, 0), 2) as total_out,
  round(coalesce(recovery, 0), 2) as recovery,
  round(coalesce(manual_in, 0), 2) as manual_in,
  round(coalesce(total_in, 0), 2) as total_in,
  round(coalesce(net_core, 0), 2) as net_core,
  round(coalesce(net_all, 0), 2) as net_all
from public.v_cashflow_monthly;

-- ---------- 4. 库存金额 ----------
create or replace view ai.inventory_value as
select
  store,
  product_name,
  asin,
  ship_batch,
  coalesce(stock_qty, 0) as stock_qty,
  round(coalesce(landed_cost, 0), 2) as landed_cost,
  round(coalesce(stock_qty, 0) * coalesce(landed_cost, 0), 2) as stock_value,
  purchase_date,
  case when purchase_date is not null then (current_date - purchase_date) else null end as age_days,
  coalesce(listed_qty, 0) as listed_qty,
  coalesce(loss_qty, 0) as loss_qty
from public.inventory
where coalesce(stock_qty, 0) <> 0;

-- ---------- 5. 采购到仓成本 ----------
create or replace view ai.purchase_cost as
select
  po_no,
  order_date,
  store,
  supplier,
  product_name,
  sku,
  asin,
  qty,
  coalesce(received_qty, 0) as received_qty,
  round(coalesce(unit_price, 0), 2) as unit_price,
  round(coalesce(goods_amount, 0), 2) as goods_amount,
  round(coalesce(freight, 0), 2) as freight,
  round(coalesce(tax_amount, 0), 2) as tax_amount,
  round(coalesce(total_amount, 0), 2) as total_amount,
  currency,
  round(coalesce(unit_cost, 0), 2) as unit_cost,
  receive_status,
  pay_status_calc as pay_status,
  round(coalesce(paid_amount, 0), 2) as paid_amount,
  arrive_date
from public.v_purchase_overview;

-- ---------- 6. 批次物流成本 ----------
create or replace view ai.shipment_batch as
select
  ship_batch,
  string_agg(distinct store, ',') as store,
  min(ship_date) as ship_date,
  min(ship_warehouse) as warehouse,
  min(logistics_provider) as provider,
  min(channel) as channel,
  round(max(coalesce(freight, 0)), 2) as freight,
  round(max(coalesce(misc_fee, 0)), 2) as misc_fee,
  round(max(coalesce(duty, 0)), 2) as duty,
  round(max(coalesce(insurance_fee, 0)), 2) as insurance_fee,
  count(*) as sku_rows,
  coalesce(sum(qty), 0) as total_qty,
  round(coalesce(sum(goods_value), 0), 2) as goods_value,
  round(avg(coalesce(landed_cost, 0)), 2) as avg_landed_cost,
  bool_and(coalesce(freight_paid, false)) as freight_paid
from public.shipments
where ship_batch is not null
group by ship_batch;

-- ---------- 7. 平台费用(非现金) ----------
create or replace view ai.platform_fee as
select
  date_trunc('month', month)::date as month,
  store,
  site,
  category,
  round(sum(amount), 2) as amount,
  count(*) as entries
from public.opsfee_monthly
group by 1, 2, 3, 4;

-- ---------- 8. 品类开发进度 ----------
create or replace view ai.shelf_progress as
with recursive tree as (
  select c.id, c.group_id, c.st::text as status, 1 as depth, c.name::text as cat_path
  from public.shelf_cats c
  where c.parent_cat_id is null
  union all
  select c.id, c.group_id, c.st::text, t.depth + 1, t.cat_path || ' / ' || c.name
  from public.shelf_cats c
  join tree t on c.parent_cat_id = t.id
),
prod as (
  select cat_id,
    count(*) as product_count,
    count(*) filter (where st::text = 'selling') as selling_count
  from public.products
  group by cat_id
)
select
  b.code as brand_code,
  g.name as group_name,
  t.cat_path,
  t.depth,
  t.status,
  coalesce(p.product_count, 0) as product_count,
  coalesce(p.selling_count, 0) as selling_count
from tree t
join public.shelf_groups g on g.id = t.group_id
join public.brands b on b.code = g.brand_code
left join prod p on p.cat_id = t.id;

-- ---------- 只读角色 ----------
create role ai_reader login password '__AI_READER_PASSWORD__' noinherit;

grant usage on schema ai to ai_reader;
grant select on all tables in schema ai to ai_reader;

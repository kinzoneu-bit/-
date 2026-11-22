-- ================================================================
-- 易用性补丁: 统一月份列名
-- 问题: store_pnl / project_pnl 用 month(date), cashflow_monthly 用 period(text)
--       AI 容易混用, 报 column does not exist
-- 修法: 在末尾补一个 period 文本别名, 原 month 列保留
-- ================================================================

create or replace view ai.store_pnl as
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
        - coalesce(o.other_own, 0), 2) as net_profit,
  to_char(k.month, 'YYYY-MM') as period
from (
  select month, store from (
    select month, store from public.store_monthly_costs where store <> '__shared__'
    union select date_trunc('month', month)::date, store from public.opsfee_monthly
    union select date_trunc('month', exp_date)::date, store from public.store_other_expense
    union select date_trunc('month', month)::date, s.store from public.store_monthly_costs c
          cross join (select unnest(array['飞鸟','野趣','屿阔'])::text as store) s
          where c.store = '__shared__'
  ) u
) k
left join (
  select month, store,
    sum(case when item = '收入' then amount else 0 end) as revenue,
    sum(case when item = '人工' then amount else 0 end) as labor_own,
    sum(case when item = '场地' then amount else 0 end) as site_own,
    sum(case when item = '其他' then amount else 0 end) as other_own
  from public.store_monthly_costs where store <> '__shared__' group by month, store
) o on o.month = k.month and o.store = k.store
left join (
  select month,
    sum(case when item = '人工' then amount else 0 end) / 3.0 as labor_share,
    sum(case when item = '场地' then amount else 0 end) / 3.0 as site_share
  from public.store_monthly_costs where store = '__shared__' group by month
) sh on sh.month = k.month
left join (
  select date_trunc('month', month)::date as month, store, sum(amount) as platform_fee
  from public.opsfee_monthly group by 1, 2
) f on f.month = k.month and f.store = k.store
left join (
  select date_trunc('month', exp_date)::date as month, store, sum(amount) as store_other_cost
  from public.store_other_expense group by 1, 2
) t on t.month = k.month and t.store = k.store;

create or replace view ai.project_pnl as
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
  case when s.revenue <> 0 then round((s.store_profit - s.labor - s.site - s.other_cost - coalesce(off.office_cost, 0)) / s.revenue * 100, 2) else null end as net_margin_pct,
  to_char(s.month, 'YYYY-MM') as period
from (
  select month, sum(revenue) revenue, sum(platform_fee) platform_fee, sum(store_other_cost) store_other_cost,
    sum(store_profit) store_profit, sum(labor) labor, sum(site) site, sum(other_cost) other_cost
  from ai.store_pnl group by month
) s
left join (
  select date_trunc('month', exp_date)::date as month, sum(amount) as office_cost
  from public.office_expense group by 1
) off on off.month = s.month;

comment on column ai.store_pnl.period is '月份文本格式 YYYY-MM, 与 month 列等价, 提供两种写法避免混用出错';
comment on column ai.project_pnl.period is '月份文本格式 YYYY-MM, 与 month 列等价, 与 cashflow_monthly 的 period 同名';

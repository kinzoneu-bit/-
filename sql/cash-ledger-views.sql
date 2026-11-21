-- 现金头寸与月度收支视图
create or replace view public.v_cash_position
with (security_invoker = true)
as
with cfg as (
  select coalesce(sum(total_amount), 0) as capital
  from public.cash_config
),
flow as (
  select
    coalesce(sum(case when direction = 'in'  then amount_cny else 0 end), 0) as inflow,
    coalesce(sum(case when direction = 'out' then amount_cny else 0 end), 0) as outflow,
    count(*) as entry_count,
    max(entry_date) as last_entry_date
  from public.cash_entries
)
select
  cfg.capital                                   as capital,
  flow.inflow                                   as inflow_total,
  flow.outflow                                  as outflow_total,
  cfg.capital + flow.inflow - flow.outflow      as balance,
  flow.entry_count,
  flow.last_entry_date
from cfg, flow;

create or replace view public.v_cash_monthly
with (security_invoker = true)
as
select
  to_char(entry_date, 'YYYY-MM') as period,
  round(sum(case when direction = 'in'  then amount_cny else 0 end), 2) as inflow,
  round(sum(case when direction = 'out' then amount_cny else 0 end), 2) as outflow,
  round(sum(case when direction = 'in' then amount_cny else -amount_cny end), 2) as net,
  count(*) as entry_count
from public.cash_entries
group by to_char(entry_date, 'YYYY-MM')
order by 1 desc;

create or replace view public.v_cash_by_category
with (security_invoker = true)
as
select
  to_char(entry_date, 'YYYY-MM') as period,
  direction,
  category,
  round(sum(amount_cny), 2) as amount,
  count(*) as entry_count
from public.cash_entries
group by to_char(entry_date, 'YYYY-MM'), direction, category
order by 1 desc, 4 desc;

comment on view public.v_cash_position is '现金头寸：资本金 + 累计流入 - 累计流出 = 当前余额';

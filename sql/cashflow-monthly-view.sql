-- ============================================================
-- 月度真实现金流视图 (KK 2026-11-22: "卡每个月的现金流状况")
-- 口径: 只算真金白银付出去的; 亚马逊从卖家余额扣的不算
-- 核心 4 类: 采购 / 物流 / 办公室 / 店铺其他
-- 附加 2 类(固定支出, 默认不计入核心): 人工 / 场地
-- ============================================================

create or replace view public.v_cashflow_monthly
with (security_invoker = true) as
with
-- 采购: 付款流水(真实现金) —— 认 pay_date, 不认 order_date
pur as (
  select to_char(pay_date, 'YYYY-MM') as period, sum(coalesce(amount, 0)) as amt
  from public.purchase_payments
  where pay_date is not null
  group by 1
),
-- 物流: 批次级字段必须先按 ship_batch 去重, 否则同一批多行会翻倍
ship_b as (
  select ship_batch,
         min(ship_date) as ship_date,
         max(freight) as freight,
         max(misc_fee) as misc_fee,
         max(duty) as duty,
         max(insurance_fee) as insurance_fee
  from public.shipments
  where ship_batch is not null
  group by ship_batch
),
ship as (
  select to_char(ship_date, 'YYYY-MM') as period,
         sum(coalesce(freight, 0) + coalesce(misc_fee, 0) + coalesce(duty, 0) + coalesce(insurance_fee, 0)) as amt
  from ship_b
  where ship_date is not null
  group by 1
),
-- 办公室费用
office as (
  select to_char(exp_date, 'YYYY-MM') as period, sum(coalesce(amount, 0)) as amt
  from public.office_expense
  where exp_date is not null
  group by 1
),
-- 店铺其他费用
storeoth as (
  select to_char(exp_date, 'YYYY-MM') as period, sum(coalesce(amount, 0)) as amt
  from public.store_other_expense
  where exp_date is not null
  group by 1
),
-- 人工工资(固定支出)
labor as (
  select to_char(month, 'YYYY-MM') as period, sum(coalesce(amount, 0)) as amt
  from public.store_monthly_costs
  where item = '人工'
  group by 1
),
-- 场地租金(固定支出)
site as (
  select to_char(month, 'YYYY-MM') as period, sum(coalesce(amount, 0)) as amt
  from public.store_monthly_costs
  where item = '场地'
  group by 1
),
-- 手动记账部分(现金账录入的、非上述来源的)
manual_out as (
  select to_char(entry_date, 'YYYY-MM') as period, sum(coalesce(amount_cny, 0)) as amt
  from public.cash_entries
  where direction = 'out' and (source_table is null or source_table = 'manual')
  group by 1
),
manual_in as (
  select to_char(entry_date, 'YYYY-MM') as period, sum(coalesce(amount_cny, 0)) as amt
  from public.cash_entries
  where direction = 'in'
  group by 1
),
-- 回款(平台打款到账)
recv as (
  select to_char(recv_date, 'YYYY-MM') as period, sum(coalesce(amount_cny, 0)) as amt
  from public.recoveries
  where recv_date is not null
  group by 1
),
periods as (
  select period from pur
  union select period from ship
  union select period from office
  union select period from storeoth
  union select period from labor
  union select period from site
  union select period from manual_out
  union select period from manual_in
  union select period from recv
)
select
  p.period,
  round(coalesce(pur.amt, 0), 2)       as purchase,
  round(coalesce(ship.amt, 0), 2)      as logistics,
  round(coalesce(office.amt, 0), 2)    as office,
  round(coalesce(storeoth.amt, 0), 2)  as store_other,
  round(coalesce(manual_out.amt, 0), 2) as manual_out,
  -- 核心现金流出(KK 要盯的 4 类 + 手动)
  round(coalesce(pur.amt, 0) + coalesce(ship.amt, 0) + coalesce(office.amt, 0)
        + coalesce(storeoth.amt, 0) + coalesce(manual_out.amt, 0), 2) as core_out,
  -- 固定支出
  round(coalesce(labor.amt, 0), 2)     as labor,
  round(coalesce(site.amt, 0), 2)      as site,
  -- 全部流出
  round(coalesce(pur.amt, 0) + coalesce(ship.amt, 0) + coalesce(office.amt, 0)
        + coalesce(storeoth.amt, 0) + coalesce(manual_out.amt, 0)
        + coalesce(labor.amt, 0) + coalesce(site.amt, 0), 2) as total_out,
  -- 流入
  round(coalesce(recv.amt, 0), 2)      as recovery,
  round(coalesce(manual_in.amt, 0), 2) as manual_in,
  round(coalesce(recv.amt, 0) + coalesce(manual_in.amt, 0), 2) as total_in,
  -- 月度净额(核心口径 / 全口径)
  round(coalesce(recv.amt, 0) + coalesce(manual_in.amt, 0)
        - (coalesce(pur.amt, 0) + coalesce(ship.amt, 0) + coalesce(office.amt, 0)
           + coalesce(storeoth.amt, 0) + coalesce(manual_out.amt, 0)), 2) as net_core,
  round(coalesce(recv.amt, 0) + coalesce(manual_in.amt, 0)
        - (coalesce(pur.amt, 0) + coalesce(ship.amt, 0) + coalesce(office.amt, 0)
           + coalesce(storeoth.amt, 0) + coalesce(manual_out.amt, 0)
           + coalesce(labor.amt, 0) + coalesce(site.amt, 0)), 2) as net_all
from periods p
left join pur on pur.period = p.period
left join ship on ship.period = p.period
left join office on office.period = p.period
left join storeoth on storeoth.period = p.period
left join labor on labor.period = p.period
left join site on site.period = p.period
left join manual_out on manual_out.period = p.period
left join manual_in on manual_in.period = p.period
left join recv on recv.period = p.period
where p.period is not null
order by p.period desc;

comment on view public.v_cashflow_monthly is '月度真实现金流: 采购/物流(批次去重)/办公室/店铺其他/人工/场地/回款. 不含平台余额扣减(佣金/配送费/FBA费/广告等)';

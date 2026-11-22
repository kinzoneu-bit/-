-- ================================================================
-- 修复: cashflow_monthly / purchase_cost 无法被只读角色读取
--
-- 原因: 原实现包了 public 的视图, 而那些视图带 security_invoker,
--       权限检查会下移到调用者, ai_reader 对底表无权限因而失败。
-- 修法: 直接读底表, 由 ai schema 视图的 owner 身份执行。
-- ================================================================

create or replace view ai.cashflow_monthly as
with pur as (
  select to_char(pay_date::timestamp, 'YYYY-MM') as period, sum(coalesce(amount, 0)) as amt
  from public.purchase_payments where pay_date is not null group by 1
),
ship_b as (
  select ship_batch, min(ship_date) as ship_date,
    max(coalesce(freight, 0)) as f, max(coalesce(misc_fee, 0)) as m,
    max(coalesce(duty, 0)) as d, max(coalesce(insurance_fee, 0)) as i
  from public.shipments where ship_batch is not null group by ship_batch
),
ship as (
  select to_char(ship_date::timestamp, 'YYYY-MM') as period, sum(f + m + d + i) as amt
  from ship_b where ship_date is not null group by 1
),
office as (
  select to_char(exp_date::timestamp, 'YYYY-MM') as period, sum(coalesce(amount, 0)) as amt
  from public.office_expense where exp_date is not null group by 1
),
storeoth as (
  select to_char(exp_date::timestamp, 'YYYY-MM') as period, sum(coalesce(amount, 0)) as amt
  from public.store_other_expense where exp_date is not null group by 1
),
labor as (
  select to_char(month::timestamp, 'YYYY-MM') as period, sum(coalesce(amount, 0)) as amt
  from public.store_monthly_costs where item = '人工' group by 1
),
site as (
  select to_char(month::timestamp, 'YYYY-MM') as period, sum(coalesce(amount, 0)) as amt
  from public.store_monthly_costs where item = '场地' group by 1
),
manual_out as (
  select to_char(entry_date::timestamp, 'YYYY-MM') as period, sum(coalesce(amount_cny, 0)) as amt
  from public.cash_entries
  where direction = 'out' and (source_table is null or source_table = 'manual') group by 1
),
manual_in as (
  select to_char(entry_date::timestamp, 'YYYY-MM') as period, sum(coalesce(amount_cny, 0)) as amt
  from public.cash_entries where direction = 'in' group by 1
),
recv as (
  select to_char(recv_date::timestamp, 'YYYY-MM') as period, sum(coalesce(amount_cny, 0)) as amt
  from public.recoveries where recv_date is not null group by 1
),
periods as (
  select period from pur union select period from ship union select period from office
  union select period from storeoth union select period from labor union select period from site
  union select period from manual_out union select period from manual_in union select period from recv
)
select
  p.period,
  round(coalesce(pur.amt, 0), 2) as purchase,
  round(coalesce(ship.amt, 0), 2) as logistics,
  round(coalesce(office.amt, 0), 2) as office,
  round(coalesce(storeoth.amt, 0), 2) as store_other,
  round(coalesce(manual_out.amt, 0), 2) as manual_out,
  round(coalesce(pur.amt, 0) + coalesce(ship.amt, 0) + coalesce(office.amt, 0) + coalesce(storeoth.amt, 0) + coalesce(manual_out.amt, 0), 2) as core_out,
  round(coalesce(labor.amt, 0), 2) as labor,
  round(coalesce(site.amt, 0), 2) as site,
  round(coalesce(pur.amt, 0) + coalesce(ship.amt, 0) + coalesce(office.amt, 0) + coalesce(storeoth.amt, 0) + coalesce(manual_out.amt, 0)
        + coalesce(labor.amt, 0) + coalesce(site.amt, 0), 2) as total_out,
  round(coalesce(recv.amt, 0), 2) as recovery,
  round(coalesce(manual_in.amt, 0), 2) as manual_in,
  round(coalesce(recv.amt, 0) + coalesce(manual_in.amt, 0), 2) as total_in,
  round(coalesce(recv.amt, 0) + coalesce(manual_in.amt, 0)
        - coalesce(pur.amt, 0) - coalesce(ship.amt, 0) - coalesce(office.amt, 0) - coalesce(storeoth.amt, 0) - coalesce(manual_out.amt, 0), 2) as net_core,
  round(coalesce(recv.amt, 0) + coalesce(manual_in.amt, 0)
        - coalesce(pur.amt, 0) - coalesce(ship.amt, 0) - coalesce(office.amt, 0) - coalesce(storeoth.amt, 0) - coalesce(manual_out.amt, 0)
        - coalesce(labor.amt, 0) - coalesce(site.amt, 0), 2) as net_all
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
where p.period is not null;

create or replace view ai.purchase_cost as
with pay as (
  select purchase_id, sum(coalesce(amount, 0)) as pay_sum
  from public.purchase_payments
  group by purchase_id
)
select
  r.po_no,
  r.order_date,
  r.store,
  r.supplier,
  r.product_name,
  r.sku,
  r.asin,
  r.qty,
  coalesce(r.received_qty, 0) as received_qty,
  round(coalesce(r.unit_price, 0), 2) as unit_price,
  round(coalesce(r.goods_amount, 0), 2) as goods_amount,
  round(coalesce(r.freight, 0), 2) as freight,
  round(coalesce(r.tax_amount, 0), 2) as tax_amount,
  round(coalesce(r.total_amount, 0), 2) as total_amount,
  r.currency,
  case when coalesce(r.qty, 0) > 0 then round(coalesce(r.total_amount, 0) / r.qty, 2) else 0 end as unit_cost,
  r.receive_status,
  case
    when coalesce(r.total_amount, 0) <= 0 then 'unpaid'
    when coalesce(p.pay_sum, 0) >= coalesce(r.total_amount, 0) then 'paid'
    when coalesce(p.pay_sum, 0) > 0 then 'partial'
    else 'unpaid'
  end as pay_status,
  round(coalesce(p.pay_sum, 0), 2) as paid_amount,
  r.arrive_date
from public.purchase_records r
left join pay p on p.purchase_id = r.id;

comment on view ai.cashflow_monthly is '月度现金流, 只统计真金白银往外付的钱, 不含亚马逊从卖家余额扣走的费用。period 是文本格式 YYYY-MM。四类核心流出: 采购/物流/办公室/店铺其他。人工场地是刚性支出但单列, 是否计入合计看使用者口径。物流已按批次去重, 不要再次去重。';
comment on view ai.purchase_cost is '采购单台账(每行=一张采购单的一个产品)。成本口径为到深圳仓单件成本, 不含头程。采购体系刚上线, 行数可能为 0。';

grant select on ai.cashflow_monthly to ai_reader;
grant select on ai.purchase_cost to ai_reader;

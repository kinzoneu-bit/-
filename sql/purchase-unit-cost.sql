-- ================================================================
-- 采购端成本口径 · 到深圳仓单件成本 (purchase-unit-cost.sql)
-- 目标库: 西欧 amz-system (hsyuopmmndpcabhegics)
-- 定版: 2026-11-19 KK
--   采购端: 一个供应商只供一个产品 → 运费/税费按单行填, 不做跨行摊分
--   成本口径: (货款 + 运费 + 税费) ÷ 数量 = 到深圳仓单件成本
--   不含: 头程(深圳→海外仓)、平台佣金、包材、仓储
--   发货端多产品共批时才按货值占比摊头程 (另见 shipments)
-- ================================================================

-- [1] 视图末尾追加 unit_cost 派生列 (create or replace 只允许在末尾加列)
create or replace view public.v_purchase_overview with (security_invoker = true) as
select p.*,
       coalesce(pay.amt, 0) as pay_sum,
       case when coalesce(pay.amt, 0) <= 0 then 'unpaid'
            when p.total_amount is not null and coalesce(pay.amt, 0) >= p.total_amount then 'paid'
            else 'partial' end as pay_status_calc,
       coalesce(bat.batch_cnt, 0) as batch_cnt,
       coalesce(bat.ship_qty, 0) as ship_qty,
       case when p.qty is not null and p.qty > 0 and p.total_amount is not null
            then round(p.total_amount / p.qty, 2) end as unit_cost
from public.purchase_records p
left join (select purchase_id, sum(amount) as amt from public.purchase_payments group by purchase_id) pay
       on pay.purchase_id = p.id
left join (select purchase_id, count(*) as batch_cnt, sum(qty) as ship_qty from public.purchase_batches group by purchase_id) bat
       on bat.purchase_id = p.id;

-- [2] 自检: 列是否到位 + 现有数据算得对不对
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'v_purchase_overview'
  and column_name in ('total_amount','qty','unit_price','unit_cost')
order by ordinal_position;

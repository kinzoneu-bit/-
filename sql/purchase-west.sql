-- ============================================================
-- 西欧采购体系 v1（2026-11-19 已在生产库执行并验证）
-- 表：purchase_suppliers / purchase_records / purchase_payments / purchase_batches
-- 视图：v_price_stats（价格基线）/ v_purchase_overview（含实时付款状态）
-- 特性：
--   · receive_status 是生成列，由 qty / received_qty / damaged_qty 自动算，不可手填
--   · pay_status 存字段仅作兼容；准确值走 v_purchase_overview.pay_status_calc
--   · 外键不写 on delete cascade：删采购单会被付款/批次记录挡住，防止误删账
--   · 视图带 security_invoker=true，否则会绕过表的 RLS 被匿名读到
-- 注意：AI 通道 exec_sql 的护栏不放行 drop policy，改策略请用 alter policy
-- ============================================================

-- 西欧采购体系 v1 · 自动生成，逐条执行
-- 生成时间 2026-11-19T12:58:57.141Z

-- [1] create table if not exists public.purchase_suppliers (
create table if not exists public.purchase_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  phone text,
  category text,
  pay_channel text,
  account_name text,
  account_no text,
  bank text,
  status text not null default 'pending',
  source text,
  risk_note text,
  account_locked boolean not null default true,
  account_changes jsonb not null default '[]'::jsonb,
  created_by text,
  approved_by text,
  approved_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_supplier_status_chk check (status in ('pending','active','disabled'))
);

-- [2] create unique index if not exists uq_purchase_supplier_name on public.
create unique index if not exists uq_purchase_supplier_name on public.purchase_suppliers (lower(name));

-- [3] create index if not exists idx_purchase_supplier_status on public.purc
create index if not exists idx_purchase_supplier_status on public.purchase_suppliers (status);

-- [4] create table if not exists public.purchase_records (
create table if not exists public.purchase_records (
  id uuid primary key default gen_random_uuid(),
  po_no text,
  order_date date,
  store text,
  supplier text,
  supplier_id uuid references public.purchase_suppliers(id),
  requested_by text,
  product_name text,
  sku text,
  asin text,
  qty integer,
  unit_price numeric,
  goods_amount numeric,
  freight numeric,
  tax_amount numeric,
  total_amount numeric,
  currency text not null default 'CNY',
  pay_status text not null default 'unpaid',
  paid_amount numeric default 0,
  pay_date date,
  pay_terms text,
  pay_terms_note text,
  arrive_date date,
  received_qty integer,
  damaged_qty integer,
  tracking_no text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  receive_status text generated always as (
    case
      when received_qty is null or received_qty = 0 then 'pending'
      when qty is null then 'partial'
      when received_qty < qty then 'partial'
      when coalesce(damaged_qty, 0) > 0 then 'diff'
      else 'received'
    end
  ) stored,
  constraint purchase_pay_status_chk check (pay_status in ('unpaid','partial','paid')),
  constraint purchase_qty_chk check (qty is null or qty > 0),
  constraint purchase_price_chk check (unit_price is null or unit_price >= 0),
  constraint purchase_received_chk check (received_qty is null or received_qty >= 0),
  constraint purchase_damaged_chk check (damaged_qty is null or damaged_qty >= 0),
  constraint purchase_damaged_le_recv check (damaged_qty is null or received_qty is null or damaged_qty <= received_qty)
);

-- [5] create index if not exists idx_purchase_order_date on public.purchase_
create index if not exists idx_purchase_order_date on public.purchase_records (order_date desc);

-- [6] create index if not exists idx_purchase_store on public.purchase_recor
create index if not exists idx_purchase_store on public.purchase_records (store);

-- [7] create index if not exists idx_purchase_supplier on public.purchase_re
create index if not exists idx_purchase_supplier on public.purchase_records (supplier_id);

-- [8] create index if not exists idx_purchase_pay on public.purchase_records
create index if not exists idx_purchase_pay on public.purchase_records (pay_status);

-- [9] create index if not exists idx_purchase_receive on public.purchase_rec
create index if not exists idx_purchase_receive on public.purchase_records (receive_status);

-- [10] create index if not exists idx_purchase_sku on public.purchase_records
create index if not exists idx_purchase_sku on public.purchase_records (sku);

-- [11] create index if not exists idx_purchase_po_no on public.purchase_recor
create index if not exists idx_purchase_po_no on public.purchase_records (po_no);

-- [12] create table if not exists public.purchase_payments (
create table if not exists public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchase_records(id),
  pay_date date not null,
  amount numeric not null,
  channel text,
  payee text,
  voucher_url text,
  operator text,
  note text,
  created_at timestamptz not null default now(),
  constraint payment_amount_chk check (amount > 0)
);

-- [13] create index if not exists idx_pp_purchase on public.purchase_payments
create index if not exists idx_pp_purchase on public.purchase_payments (purchase_id);

-- [14] create index if not exists idx_pp_date on public.purchase_payments (pa
create index if not exists idx_pp_date on public.purchase_payments (pay_date desc);

-- [15] create table if not exists public.purchase_batches (
create table if not exists public.purchase_batches (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchase_records(id),
  ship_batch text not null,
  qty integer not null,
  store text,
  ship_date date,
  tracking_no text,
  note text,
  created_at timestamptz not null default now(),
  constraint batch_qty_chk check (qty > 0)
);

-- [16] create unique index if not exists uq_pb_purchase_batch on public.purch
create unique index if not exists uq_pb_purchase_batch on public.purchase_batches (purchase_id, ship_batch);

-- [17] create index if not exists idx_pb_batch on public.purchase_batches (sh
create index if not exists idx_pb_batch on public.purchase_batches (ship_batch);

-- [18] create index if not exists idx_pb_store on public.purchase_batches (st
create index if not exists idx_pb_store on public.purchase_batches (store);

-- [19] create or replace view public.v_price_stats with (security_invoker = true) as
create or replace view public.v_price_stats with (security_invoker = true) as
with base as (
  select coalesce(nullif(btrim(sku), ''), nullif(btrim(product_name), '')) as pkey,
         sku, product_name, unit_price, order_date
  from public.purchase_records
  where unit_price is not null and unit_price > 0
    and coalesce(nullif(btrim(sku), ''), nullif(btrim(product_name), '')) is not null
),
agg as (
  select pkey, max(sku) as sku, max(product_name) as product_name,
         count(*) as times, round(avg(unit_price), 4) as avg_price,
         min(unit_price) as min_price, max(unit_price) as max_price
  from base group by pkey
),
last_one as (
  select distinct on (pkey) pkey, unit_price as last_price, order_date as last_date
  from base order by pkey, order_date desc nulls last, unit_price desc
)
select a.pkey, a.sku, a.product_name, a.times,
       a.avg_price, a.min_price, a.max_price,
       l.last_price, l.last_date,
       case when a.avg_price > 0
            then round((l.last_price - a.avg_price) / a.avg_price * 100, 2)
       end as dev_pct
from agg a left join last_one l on l.pkey = a.pkey;

-- [20] create or replace view public.v_purchase_overview with (security_invoker = true) as
create or replace view public.v_purchase_overview with (security_invoker = true) as
select p.*,
       coalesce(pay.amt, 0) as pay_sum,
       case when coalesce(pay.amt, 0) <= 0 then 'unpaid'
            when p.total_amount is not null and coalesce(pay.amt, 0) >= p.total_amount then 'paid'
            else 'partial' end as pay_status_calc,
       coalesce(bat.batch_cnt, 0) as batch_cnt,
       coalesce(bat.ship_qty, 0) as ship_qty
from public.purchase_records p
left join (select purchase_id, sum(amount) as amt from public.purchase_payments group by purchase_id) pay
       on pay.purchase_id = p.id
left join (select purchase_id, count(*) as batch_cnt, sum(qty) as ship_qty from public.purchase_batches group by purchase_id) bat
       on bat.purchase_id = p.id;

-- [21] alter table public.purchase_suppliers enable row level security
alter table public.purchase_suppliers enable row level security;

-- [22] alter table public.purchase_records enable row level security
alter table public.purchase_records enable row level security;

-- [23] alter table public.purchase_payments enable row level security
alter table public.purchase_payments enable row level security;

-- [24] alter table public.purchase_batches enable row level security
alter table public.purchase_batches enable row level security;

-- [26] create policy pur_read_all on public.purchase_suppliers for select to 
create policy pur_read_all on public.purchase_suppliers for select to authenticated using (true);

-- [28] create policy pur_write_role on public.purchase_suppliers for all to a
create policy pur_write_role on public.purchase_suppliers for all to authenticated using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','cd_procurement'))) with check (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','cd_procurement')));

-- [30] create policy pur_read_all on public.purchase_records for select to au
create policy pur_read_all on public.purchase_records for select to authenticated using (true);

-- [32] create policy pur_write_role on public.purchase_records for all to aut
create policy pur_write_role on public.purchase_records for all to authenticated using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','cd_procurement','cd_supplier'))) with check (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','cd_procurement','cd_supplier')));

-- [34] create policy pur_read_all on public.purchase_payments for select to a
create policy pur_read_all on public.purchase_payments for select to authenticated using (true);

-- [36] create policy pur_write_role on public.purchase_payments for all to au
create policy pur_write_role on public.purchase_payments for all to authenticated using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','cd_procurement','finance'))) with check (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','cd_procurement','finance')));

-- [38] create policy pur_read_all on public.purchase_batches for select to au
create policy pur_read_all on public.purchase_batches for select to authenticated using (true);

-- [40] create policy pur_write_role on public.purchase_batches for all to aut
create policy pur_write_role on public.purchase_batches for all to authenticated using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','cd_procurement','cd_supplier','cd_promotion'))) with check (exists (select 1 from public.user_profiles up where up.user_id = auth.uid() and up.role in ('admin','fr','cd_procurement','cd_supplier','cd_promotion')));

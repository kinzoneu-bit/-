-- 西欧现金账体系 (照搬东欧 ee 库结构, 2026-11-22)
-- 核心: 只记「真实现金流出/流入」, 平台从回款里扣走的不进这里

create table if not exists public.cash_entries (
  id           uuid primary key default gen_random_uuid(),
  entry_date   date not null,
  direction    text not null check (direction in ('in','out')),
  category     text not null,
  amount_cny   numeric(14,2) not null,
  ref_note     text,
  created_by   text,
  created_at   timestamptz default now(),
  source_table text,
  source_id    text,
  ref_no       text,
  auto         boolean default false
);

create index if not exists idx_cash_entries_date on public.cash_entries(entry_date desc);

create index if not exists idx_cash_entries_src on public.cash_entries(source_table, source_id);

create table if not exists public.cash_config (
  id               uuid primary key default gen_random_uuid(),
  phase            text,
  label            text,
  total_amount     numeric(14,2),
  start_date       date,
  monthly_fixed    numeric(14,2),
  cycle_days       int,
  note             text,
  updated_at       timestamptz default now(),
  labor_monthly    numeric(14,2),
  site_monthly     numeric(14,2),
  labor_start_date date,
  ip_monthly       numeric(14,2),
  pc_monthly       numeric(14,2)
);

create table if not exists public.recoveries (
  id              uuid primary key default gen_random_uuid(),
  recv_date       date,
  store           text,
  settle_no       text,
  period_start    date,
  period_end      date,
  sales_amount    numeric(14,2),
  commission      numeric(14,2),
  vat_withheld    numeric(14,2),
  other_fee       numeric(14,2),
  received_amount numeric(14,2),
  currency        text,
  fx_rate         numeric(12,6),
  amount_cny      numeric(14,2),
  status          text,
  note            text,
  created_by      text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_recoveries_date on public.recoveries(recv_date desc);

create table if not exists public.platform_config (
  id              text primary key,
  platform        text,
  market          text,
  commission_rate numeric(6,4),
  vat_rate        numeric(6,4),
  payout_days     int,
  config          jsonb default '{}'::jsonb,
  note            text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table if not exists public.logistics_payments (
  id          uuid primary key default gen_random_uuid(),
  pay_date    date,
  ship_batch  text,
  store       text,
  provider    text,
  category    text,
  currency    text,
  fx_rate     numeric(12,6),
  amount      numeric(14,2),
  amount_cny  numeric(14,2),
  voucher_no  text,
  operator    text,
  note        text,
  created_at  timestamptz default now()
);

create index if not exists idx_logipay_date on public.logistics_payments(pay_date desc);

comment on table public.cash_entries is '真实现金流水：只记钱从银行/支付宝/信用卡走出去或收进来，平台从回款里扣走的不进这里';

comment on table public.recoveries is '平台回款单：销售额 - 佣金 - 代扣VAT - 其他费 = 实收，属于「回款被扣」侧，不进现金流水';

comment on table public.cash_config is '资本金与固定月支出配置，现金头寸的期初基准';

comment on table public.platform_config is '各平台各站点佣金/VAT/回款账期，用于预测现金周转';

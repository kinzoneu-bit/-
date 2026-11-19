-- ================================================================
-- 东欧项目 · 独立数据库初始化脚本 (ee-init.sql)
-- 目标库: iagpiuxwssrycqmpxmsw (Frankfurt eu-central-1)
-- 来源: 西欧 amz-system 生产库结构 (2026-11-19 实测探测)
-- 用法: 新库 → SQL Editor → 整段粘贴 → Run (幂等, 可重复执行)
-- ================================================================
-- 与西欧库的差异 (东欧专属改造):
--   ① 新增 stores 店铺主表: 平台 / 市场 / 币种 / 归属(自有-借用-待剥离)
--   ② shipments / inventory 新增 platform 列 (allegro / emag / worten)
--   ③ fx_rates 新增 currency 列 (PLN / CZK / RON / EUR), 主键仍为 month
--      → 向前兼容旧前端; 前端改造完成后再升级为 (month, currency) 复合主键
--   ④ 费用类目 category 保持自由文本, 不在表结构层限制
-- ================================================================

-- ---------- 0. 通用函数 ----------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- 1. 账号与权限
-- ================================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  role         text NOT NULL DEFAULT 'viewer',
  location     text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.user_profiles IS '看板账号角色; role: admin / fr / cd_supplier / cd_link / cd_promotion / cd_procurement / finance / viewer';

-- ================================================================
-- 2. 店铺主表 (东欧新增)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.stores (
  code       text PRIMARY KEY,                       -- 店铺简称, 前端 store 字段存这个
  name       text NOT NULL,                          -- 展示名
  platform   text,                                   -- allegro / emag / worten
  market     text,                                   -- PL / CZ / RO
  currency   text NOT NULL DEFAULT 'CNY',            -- 记账币种 PLN/CZK/RON/EUR/CNY
  ownership  text NOT NULL DEFAULT 'own',            -- own 自有 / borrowed 借用 / to_split 待剥离
  sort_order integer NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.stores IS '东欧店铺主表; ownership 用于乾霖账号剥离时拆分账目';

-- ================================================================
-- 3. 选品货架: 品牌 → 大类 → 子类目(自嵌套) → 叶端 → 产品 / 供应商
-- ================================================================
CREATE TABLE IF NOT EXISTS public.brands (
  code       text PRIMARY KEY,
  full_name  text,
  store      text,
  flat       boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shelf_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_code text REFERENCES public.brands(code) ON DELETE CASCADE,
  name       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shelf_groups_brand ON public.shelf_groups (brand_code);

CREATE TABLE IF NOT EXISTS public.shelf_cats (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid REFERENCES public.shelf_groups(id) ON DELETE CASCADE,
  parent_cat_id uuid REFERENCES public.shelf_cats(id) ON DELETE CASCADE,
  name          text NOT NULL,
  st            text NOT NULL DEFAULT 'ready',
  phase         text,
  chat_name     text,
  chat_url      text,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shelf_cats_st_check CHECK (st IN ('selling','ready','idle','skip','researched_skip')),
  CONSTRAINT shelf_cats_phase_check CHECK (phase IS NULL OR phase IN ('planning','pre_research','supplier','spec'))
);
CREATE INDEX IF NOT EXISTS idx_shelf_cats_group  ON public.shelf_cats (group_id);
CREATE INDEX IF NOT EXISTS idx_shelf_cats_parent ON public.shelf_cats (parent_cat_id);

CREATE TABLE IF NOT EXISTS public.shelf_leaves (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cat_id     uuid REFERENCES public.shelf_cats(id) ON DELETE CASCADE,
  leaf_name  text NOT NULL,
  path       text,
  st         text NOT NULL DEFAULT 'ready',
  phase      text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shelf_leaves_st_check CHECK (st IN ('selling','ready','idle','skip','researched_skip'))
);
CREATE INDEX IF NOT EXISTS idx_shelf_leaves_cat ON public.shelf_leaves (cat_id);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leaf_id       uuid REFERENCES public.shelf_leaves(id) ON DELETE CASCADE,
  product_id    uuid,
  factory       text NOT NULL,
  contact       text,
  main_products text,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_leaf ON public.suppliers (leaf_id);

CREATE TABLE IF NOT EXISTS public.products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leaf_id        uuid REFERENCES public.shelf_leaves(id) ON DELETE SET NULL,
  cat_id         uuid REFERENCES public.shelf_cats(id)  ON DELETE SET NULL,
  name           text NOT NULL,
  st             text NOT NULL DEFAULT 'idle',
  asin           text,
  amazon_site    text DEFAULT 'FR',
  spu            text,
  variant_sizes  jsonb NOT NULL DEFAULT '[]'::jsonb,
  variant_colors jsonb NOT NULL DEFAULT '[]'::jsonb,
  variant_count  integer NOT NULL DEFAULT 0,
  variants       jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_leaf ON public.products (leaf_id);
CREATE INDEX IF NOT EXISTS idx_products_cat  ON public.products (cat_id);
CREATE INDEX IF NOT EXISTS idx_products_asin ON public.products (asin);

-- ================================================================
-- 4. 任务交接 / 调研进度 / 链接进度
-- ================================================================
CREATE TABLE IF NOT EXISTS public.monitor_handoff (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leaf_id       uuid,
  cat_id        uuid,
  box_key       text NOT NULL,                       -- h1 / h2 / h3 / h4
  start_at      timestamptz NOT NULL DEFAULT now(),
  handler_email text,
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_handoff_leaf ON public.monitor_handoff (leaf_id);
CREATE INDEX IF NOT EXISTS idx_handoff_cat  ON public.monitor_handoff (cat_id);
CREATE INDEX IF NOT EXISTS idx_handoff_box  ON public.monitor_handoff (box_key);

CREATE TABLE IF NOT EXISTS public.monitor_handoff_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leaf_id        uuid,
  from_box       text,
  to_box         text,
  moved_at       timestamptz NOT NULL DEFAULT now(),
  moved_by_email text,
  note           text
);
CREATE INDEX IF NOT EXISTS idx_handoff_log_moved ON public.monitor_handoff_log (moved_at DESC);

CREATE TABLE IF NOT EXISTS public.monitor_research_progress (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leaf_id  uuid NOT NULL,
  phase    text NOT NULL,
  start_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mrp_leaf_phase_key UNIQUE (leaf_id, phase)   -- 前端 upsert onConflict "leaf_id, phase" 依赖此约束
);

CREATE TABLE IF NOT EXISTS public.link_progress (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name   text NOT NULL,
  asin           text,
  country        text,
  sku            text,
  title          text,
  five_points    text,
  kit_image      text,
  a_plus         text,
  video          text,
  qa             text,
  fba_conversion text,
  receive_date   date,
  deliver_date   date,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_link_asin ON public.link_progress (asin);

-- ================================================================
-- 5. 发货 / 库存 / 售后库存
-- ================================================================
CREATE TABLE IF NOT EXISTS public.shipments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store               text NOT NULL,
  platform            text,                          -- 东欧新增: allegro / emag / worten
  ship_date           date NOT NULL,
  ship_warehouse      text,
  ship_batch          text,
  product_name        text NOT NULL,
  asin                text,
  qty                 integer NOT NULL DEFAULT 0,
  purchase_price      numeric(12,2),
  goods_value         numeric(12,2),
  total_value         numeric(12,2),
  freight             numeric(12,2),
  misc_fee            numeric(12,2),
  duty                numeric(12,2),
  insurance_fee       numeric(12,2),
  share_fee           numeric(12,2),
  landed_cost         numeric(12,2),
  logistics_provider  text,
  channel             text,
  unit_price          numeric(12,2),
  last_mile_no        text,
  listed_date         date,
  listed_qty          integer,
  loss_qty            integer,
  compensation_eur    numeric(12,2),
  loss_amount         numeric(12,2),
  insurance_no        text,
  insured_amount      numeric(12,2),
  note                text,
  bill_checked        boolean NOT NULL DEFAULT false,
  freight_paid        boolean NOT NULL DEFAULT false,
  listed              boolean NOT NULL DEFAULT false,
  remaining_qty       integer,
  stock_snapshot_date date,
  review_status       text,                          -- pending / reviewing / approved
  reviewed_by         text,
  reviewed_at         timestamptz,
  batch_owner         text,
  batch_owner_at      timestamptz,
  change_req          jsonb,                         -- 双签申请: {by,at,approvers[],signed{},fields{},rows{}}
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipments_date    ON public.shipments (ship_date DESC);
CREATE INDEX IF NOT EXISTS idx_shipments_store   ON public.shipments (store);
CREATE INDEX IF NOT EXISTS idx_shipments_batch   ON public.shipments (ship_batch);
CREATE INDEX IF NOT EXISTS idx_shipments_asin    ON public.shipments (asin);
CREATE INDEX IF NOT EXISTS idx_shipments_platform ON public.shipments (platform);

CREATE TABLE IF NOT EXISTS public.inventory (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id    uuid UNIQUE REFERENCES public.shipments(id) ON DELETE CASCADE,
  store          text,
  platform       text,                               -- 东欧新增
  ship_date      date,
  ship_warehouse text,
  ship_batch     text,
  product_name   text,
  asin           text,
  listed_qty     integer,
  stock_qty      integer,
  loss_qty       integer,
  landed_cost    numeric(12,2),
  listed_date    date,
  purchase_date  date,
  sold_date      date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_store ON public.inventory (store);
CREATE INDEX IF NOT EXISTS idx_inventory_asin  ON public.inventory (asin);
CREATE INDEX IF NOT EXISTS idx_inventory_date  ON public.inventory (listed_date DESC);

CREATE TABLE IF NOT EXISTS public.after_stock (
  id              bigserial PRIMARY KEY,
  kind            text NOT NULL,                     -- amz_return / wh_receipt / wh_saleable
  rec_date        date,
  store           text,
  sku             text,
  product         text,
  asin            text,
  qty             integer,
  remove_order_no text,
  remove_qty      integer,
  received_qty    integer,
  tracking_no     text,
  saleable_qty    integer,
  unsaleable_qty  integer,
  disposal        text,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_after_stock_kind  ON public.after_stock (kind);
CREATE INDEX IF NOT EXISTS idx_after_stock_store ON public.after_stock (store);

-- ================================================================
-- 6. 订单记录
-- ================================================================
CREATE TABLE IF NOT EXISTS public.order_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_date   date,
  order_no     text,
  region       text,
  customer     text,
  product      text,
  sku          text,
  landed_cost  numeric(12,2),
  price        numeric(12,2),
  net_revenue  numeric(12,2),
  converted    numeric(12,2),
  gross_profit numeric(12,2),
  gross_margin numeric(8,4),
  email_sent   text,
  review_asked text,
  refund       text,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS order_records_order_no_key
  ON public.order_records (order_no) WHERE order_no IS NOT NULL AND order_no <> '';
CREATE INDEX IF NOT EXISTS idx_order_records_date   ON public.order_records (order_date DESC);
CREATE INDEX IF NOT EXISTS idx_order_records_region ON public.order_records (region);

-- ================================================================
-- 7. 财务: 月度核算 / 运维费用 / 其他费用 / 办公室费用 / 汇率
-- ================================================================
CREATE TABLE IF NOT EXISTS public.store_monthly_costs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month      date NOT NULL,
  store      text NOT NULL,
  item       text NOT NULL,
  amount     numeric(12,2) NOT NULL DEFAULT 0,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_smc_month ON public.store_monthly_costs (month DESC);
CREATE INDEX IF NOT EXISTS idx_smc_store ON public.store_monthly_costs (store);

CREATE TABLE IF NOT EXISTS public.opsfee_monthly (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month      date NOT NULL,
  store      text NOT NULL,
  site       text,
  category   text NOT NULL,                          -- 东欧: 佣金/广告 Sponsorowane/月租/配送费/Genius 费 ...
  amount     numeric(12,2) NOT NULL DEFAULT 0,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opsfee_month  ON public.opsfee_monthly (month DESC);
CREATE INDEX IF NOT EXISTS idx_opsfee_store  ON public.opsfee_monthly (store);
CREATE INDEX IF NOT EXISTS idx_opsfee_cat    ON public.opsfee_monthly (category);

CREATE TABLE IF NOT EXISTS public.store_other_expense (
  id         bigserial PRIMARY KEY,
  exp_date   date NOT NULL,
  store      text NOT NULL,
  item       text NOT NULL,
  amount     numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_soe_date  ON public.store_other_expense (exp_date DESC);
CREATE INDEX IF NOT EXISTS idx_soe_store ON public.store_other_expense (store);

CREATE TABLE IF NOT EXISTS public.office_expense (
  id         bigserial PRIMARY KEY,
  exp_date   date NOT NULL,
  item       text NOT NULL,
  amount     numeric(12,2) NOT NULL DEFAULT 0,
  region     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oe_date ON public.office_expense (exp_date DESC);

CREATE TABLE IF NOT EXISTS public.fx_rates (
  month      date PRIMARY KEY,                       -- 向前兼容; 后续升级为 (month, currency)
  currency   text NOT NULL DEFAULT 'EUR',            -- 东欧新增: PLN / CZK / RON / EUR
  rate       numeric(10,4) NOT NULL,                 -- 1 外币 = ? CNY
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ================================================================
-- 8. 财务核算: 日销 / 现金流
-- ================================================================
CREATE TABLE IF NOT EXISTS public.finance_daily_sales (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date    date NOT NULL,
  store        text NOT NULL,
  site         text NOT NULL DEFAULT 'FR',
  asin         text NOT NULL,
  product_name text,
  order_qty    integer NOT NULL DEFAULT 0,
  revenue      numeric(12,2) NOT NULL DEFAULT 0,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_sales_key UNIQUE (sale_date, store, site, asin)
);
CREATE INDEX IF NOT EXISTS idx_fin_sales_date  ON public.finance_daily_sales (sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_sales_asin  ON public.finance_daily_sales (asin);
CREATE INDEX IF NOT EXISTS idx_fin_sales_store ON public.finance_daily_sales (store, site);

CREATE TABLE IF NOT EXISTS public.finance_cashflow (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_date    date NOT NULL,
  store      text NOT NULL,
  channel    text NOT NULL DEFAULT 'PingPong',
  type       text NOT NULL CHECK (type IN ('income','expense')),
  amount     numeric(12,2) NOT NULL DEFAULT 0,
  currency   text NOT NULL DEFAULT 'CNY',
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cf_date    ON public.finance_cashflow (tx_date DESC);
CREATE INDEX IF NOT EXISTS idx_cf_store   ON public.finance_cashflow (store);
CREATE INDEX IF NOT EXISTS idx_cf_channel ON public.finance_cashflow (channel);

-- ================================================================
-- 9. updated_at 自动维护
-- ================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['brands','shelf_groups','shelf_cats','shelf_leaves','products',
                           'inventory','order_records','store_monthly_costs','opsfee_monthly']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_touch ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t, t);
  END LOOP;
END $$;

-- ================================================================
-- 10. RLS: 东欧初期 = 登录用户全读写 (KK 原则: 除交接拖拽外全开)
--     团队与角色定稿后, 按西欧 rls_finance_role.sql 的模式逐表收窄
-- ================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stores','brands','shelf_groups','shelf_cats','shelf_leaves',
                           'suppliers','products','monitor_handoff','monitor_handoff_log',
                           'monitor_research_progress','link_progress','shipments','inventory',
                           'after_stock','order_records','store_monthly_costs','opsfee_monthly',
                           'store_other_expense','office_expense','fx_rates',
                           'finance_daily_sales','finance_cashflow']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_all_authenticated', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                    USING (true) WITH CHECK (true)', t || '_all_authenticated', t);
  END LOOP;
END $$;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_profiles_read ON public.user_profiles;
CREATE POLICY user_profiles_read ON public.user_profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS user_profiles_self_update ON public.user_profiles;
CREATE POLICY user_profiles_self_update ON public.user_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ================================================================
-- 11. 校验: 应返回 22 张表
-- ================================================================
SELECT table_name,
       (SELECT count(*) FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = t.table_name) AS cols
FROM information_schema.tables t
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
ORDER BY 1;

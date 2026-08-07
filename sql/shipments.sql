-- =============================================================
-- shipments · 发货记录 (v2 · 按 KK Excel 实际列结构 2026-08-07)
-- Excel: 发货记录-3.2至7.21.xlsx (26 列)
-- 权限: 仅 admin 可读写
-- =============================================================
DROP TABLE IF EXISTS shipments;
CREATE TABLE shipments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store              text NOT NULL,                -- 店铺 (飞鸟等)
  ship_date          date NOT NULL,                -- 发货日期
  ship_warehouse     text,                          -- 发货仓库
  ship_batch         text,                          -- 发货批次
  product_name       text NOT NULL,                 -- 名称
  asin               text,                          -- ASIN
  qty                integer NOT NULL DEFAULT 0,    -- 数量
  purchase_price     numeric(12,2),                 -- 采购价
  goods_value        numeric(12,2),                 -- 货值
  total_value        numeric(12,2),                 -- 总值
  freight            numeric(12,2),                 -- 头程
  misc_fee           numeric(12,2),                 -- 杂费
  duty               numeric(12,2),                 -- 关税
  insurance_fee      numeric(12,2),                 -- 保险费用
  share_fee          numeric(12,2),                 -- 分摊费用
  landed_cost        numeric(12,2),                 -- 到仓价格
  logistics_provider text,                          -- 物流商
  channel            text,                          -- 渠道
  unit_price         numeric(12,2),                 -- 单价 (售价)
  last_mile_no       text,                          -- 尾程单号
  listed_date        date,                          -- 上架日期
  listed_qty         integer,                       -- 上架数量
  loss_qty           integer,                       -- 损耗
  compensation_eur   numeric(12,2),                 -- 赔付 (欧/个)
  loss_amount        numeric(12,2),                 -- 亏损
  insurance_no       text,                          -- 保险单号
  insured_amount     numeric(12,2),                 -- 投保金额
  note               text,                          -- 备注
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipments_date ON shipments (ship_date);
CREATE INDEX IF NOT EXISTS idx_shipments_store ON shipments (store);
CREATE INDEX IF NOT EXISTS idx_shipments_product ON shipments (product_name);
CREATE INDEX IF NOT EXISTS idx_shipments_asin ON shipments (asin);

-- RLS: 仅 admin 可读写
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ship_read"  ON shipments;
DROP POLICY IF EXISTS "ship_write" ON shipments;

CREATE POLICY "ship_read" ON shipments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'admin'));
CREATE POLICY "ship_write" ON shipments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'admin'));

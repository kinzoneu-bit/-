-- =============================================================
-- shipments · 发货记录 (KK 截图列结构 2026-08-07)
-- 权限: 仅 admin 可读写 (财务/物流敏感)
-- 数据录入: 待 KK 提供格式后接入
-- =============================================================
CREATE TABLE IF NOT EXISTS shipments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store              text NOT NULL,                -- 店铺 (kila/wild/Vercoryx/woof/kinzon)
  ship_date          date NOT NULL,                -- 发货日期
  ship_warehouse     text,                          -- 发货仓库
  ship_batch         text,                          -- 发货批次
  product_name       text NOT NULL,                 -- 名称 (产品名)
  qty_purchased      integer NOT NULL DEFAULT 0,    -- 数量 (采购)
  purpose            text,                          -- 用途
  total_weight_kg    numeric(10,2),                 -- 总重量 (kg)
  length_cm          numeric(10,2),                 -- 长 (cm)
  width_cm           numeric(10,2),                 -- 宽 (cm)
  height_cm          numeric(10,2),                 -- 高 (cm)
  related_to         text,                          -- 关联 (ASIN / leaf_id / 类目)
  volume_fee_eur     numeric(12,2),                 -- 体积费用
  share_fee_eur      numeric(12,2),                 -- 分摊费用
  landed_cost_eur    numeric(12,2),                 -- 到仓价格
  logistics_provider text,                          -- 物流商
  channel            text,                          -- 渠道 (FBA/海外仓等)
  listed_date        date,                          -- 上架日期
  listed_qty         integer,                       -- 上架数量
  hot_sales          text,                          -- 热销 (货/个/天)
  unit_cost_eur      numeric(12,2),                 -- 规格单价
  est_margin_eur     numeric(12,2),                 -- 预估毛利
  note               text,                          -- 备注
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipments_date ON shipments (ship_date);
CREATE INDEX IF NOT EXISTS idx_shipments_store ON shipments (store);
CREATE INDEX IF NOT EXISTS idx_shipments_product ON shipments (product_name);

-- =============================================================
-- RLS: 仅 admin 可读写
-- =============================================================
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ship_read"  ON shipments;
DROP POLICY IF EXISTS "ship_write" ON shipments;

CREATE POLICY "ship_read" ON shipments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role = 'admin'));
CREATE POLICY "ship_write" ON shipments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                      WHERE up.user_id = auth.uid() AND up.role = 'admin'));
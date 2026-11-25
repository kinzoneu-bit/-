-- ============================================================
-- Cdiscount 库存接入 · 数据库改动 (2026-11-25)
-- 目标: inventory 加平台维度 + 新建 platform_orders
-- 全部幂等, 可重复跑
-- ============================================================

-- ① 平台字段: 默认 amazon, 老数据自动归位 (NOT NULL DEFAULT 让 162 行老数据自动为 amazon)
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'amazon';

-- ② 卖家 SKU (Cdiscount / ManoMano 用; 亚马逊继续用 asin 列)
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS sku text;

-- ③ 每日同步幂等键: 同一平台+店铺+SKU 一行
--    注意: 不能加 WHERE 谓词 —— PostgREST 的 on_conflict=platform,store,sku 匹配不到 partial index (报 42P10)
--    亚马逊行 sku 为 NULL, PG 唯一索引允许多个 NULL, 所以不会跟亚马逊批次行冲突
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_platform_sku
  ON inventory (platform, store, sku);

-- ④ 查询索引
CREATE INDEX IF NOT EXISTS idx_inventory_platform ON inventory (platform);

-- ============================================================
-- platform_orders: 多平台订单落库 (本轮只落库, 不做前端)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform          text NOT NULL,
  store             text,
  sales_channel     text,
  order_id          text NOT NULL,
  order_line_id     text,
  status            text,
  currency          text,
  sku               text,
  offer_id          text,
  quantity          integer,
  unit_sales_price  numeric(12,2),
  shipping_cost     numeric(12,2),
  commission_amount numeric(12,2),
  commission_rate   numeric(6,2),
  supply_mode       text,
  order_total_price numeric(12,2),
  ship_country      text,
  purchased_at      timestamptz,
  updated_at_src    timestamptz,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (platform, order_id, order_line_id)
);

CREATE INDEX IF NOT EXISTS idx_porder_platform ON platform_orders (platform, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_porder_sku ON platform_orders (sku);
CREATE INDEX IF NOT EXISTS idx_porder_store ON platform_orders (store);

ALTER TABLE platform_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY porder_read ON platform_orders FOR SELECT TO authenticated USING (true);

-- 写策略: 原文档只给了 SELECT, 同步脚本写入会 403 (42501 new row violates RLS) —— 2026-11-25 补
CREATE POLICY porder_write ON platform_orders FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','finance')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','finance')));

-- ============================================================
-- 注释 (口径说明, 便于后续接 AI / 新人接手)
-- ============================================================
COMMENT ON COLUMN inventory.platform IS '平台三选一 amazon/cdiscount/manomano，老数据全部 amazon';
COMMENT ON COLUMN inventory.sku IS '卖家SKU（Cdiscount/ManoMano用），亚马逊用 asin 列此列为空';
COMMENT ON TABLE platform_orders IS '多平台订单落库，一行=一个订单行，佣金率千分比 1500=15%';
COMMENT ON COLUMN platform_orders.commission_rate IS '平台佣金率, 千分比口径: 1500 表示 15%';
COMMENT ON COLUMN platform_orders.supply_mode IS 'Fulfillment=平台仓(FBC/FBA) / Seller=自发货';
COMMENT ON COLUMN platform_orders.store IS '店铺简称如 梦想，API 原值 MXQH TC 不落库';

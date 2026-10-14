-- ============================================================
-- 海外仓售后库存 (after_stock) — KK 2026-10-14 定
-- 页面: 「售后库存」Tab (导航在「库存统计」之后)
--   三个区块共用一张表, 用 kind 区分 (顺序固定):
--     kind = amz_return   亚马逊退回海外仓记录
--     kind = wh_receipt   海外仓签收记录
--     kind = wh_saleable  筛选可售库存, 不可售丢弃库存记录
-- 字段: **三个区块用同一套要素** (KK 2026-10-14 16:52 定)
--   日期 rec_date / 移除订单编号 remove_order_no / 产品名称 product
--   移除数量 remove_qty / 已收到数量 received_qty / 发货追踪编码 tracking_no
-- 备用列 (现不用, 曾为区块③拟): store / sku / qty / saleable_qty / unsaleable_qty / disposal / note
-- 权限: 读 = 所有登录用户; 写 = admin(KK) + fr(龙泺伊) + cd_supplier(陈雪梅) — KK 2026-10-14 定
-- 整段粘贴执行, 幂等可重复跑 (已建过的表会被 ALTER 补列, 不会丢数据)
-- ============================================================

CREATE TABLE IF NOT EXISTS after_stock (
  id               BIGSERIAL PRIMARY KEY,
  kind             TEXT          NOT NULL DEFAULT 'amz_return',  -- 区块: amz_return / wh_receipt / wh_saleable
  rec_date         DATE,                                         -- 日期
  remove_order_no  TEXT,                                         -- 移除订单编号 (区块①)
  product          TEXT,                                         -- 产品名称 / 品名
  remove_qty       NUMERIC(14,2),                                -- 移除数量 (区块①)
  received_qty     NUMERIC(14,2),                                -- 已收到数量 (区块①)
  tracking_no      TEXT,                                         -- 发货追踪编码 (区块①)
  store            TEXT,                                         -- 店铺 (飞鸟/野趣/屿阔/俊业/乾霖/胤顺, 可空)
  sku              TEXT,                                         -- SKU / ASIN (备用)
  qty              NUMERIC(14,2),                                -- 数量 (备用)
  saleable_qty     NUMERIC(14,2),                                -- 可售数量 (区块③)
  unsaleable_qty   NUMERIC(14,2),                                -- 不可售数量 (区块③)
  disposal         TEXT,                                         -- 处理方式 (区块③): 已丢弃/退回国内/重新贴标/待处理
  note             TEXT,                                         -- 备注
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- 若表是早前建的: 幂等补齐新列 (已有则跳过, 不影响已录数据)
ALTER TABLE after_stock ADD COLUMN IF NOT EXISTS remove_order_no TEXT;
ALTER TABLE after_stock ADD COLUMN IF NOT EXISTS remove_qty      NUMERIC(14,2);
ALTER TABLE after_stock ADD COLUMN IF NOT EXISTS received_qty    NUMERIC(14,2);
ALTER TABLE after_stock ADD COLUMN IF NOT EXISTS tracking_no     TEXT;
ALTER TABLE after_stock ADD COLUMN IF NOT EXISTS saleable_qty    NUMERIC(14,2);
ALTER TABLE after_stock ADD COLUMN IF NOT EXISTS unsaleable_qty  NUMERIC(14,2);
ALTER TABLE after_stock ADD COLUMN IF NOT EXISTS disposal        TEXT;

CREATE INDEX IF NOT EXISTS after_stock_kind_idx ON after_stock (kind);
CREATE INDEX IF NOT EXISTS after_stock_date_idx ON after_stock (rec_date DESC);

ALTER TABLE after_stock ENABLE ROW LEVEL SECURITY;

-- 读: 所有登录用户可见
DROP POLICY IF EXISTS after_stock_read_all ON after_stock;
CREATE POLICY after_stock_read_all ON after_stock FOR SELECT TO authenticated USING (true);

-- 写: 仅 admin + fr + cd_supplier (陈雪梅)
DROP POLICY IF EXISTS after_stock_write ON after_stock;
CREATE POLICY after_stock_write ON after_stock FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin', 'fr', 'cd_supplier')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin', 'fr', 'cd_supplier')));

-- 校验 1: 应返回 2 条策略 (after_stock_read_all / after_stock_write)
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'after_stock' ORDER BY policyname;
-- 校验 2: 应返回 16 列 (id/kind/rec_date/remove_order_no/product/remove_qty/received_qty/tracking_no/store/sku/qty/saleable_qty/unsaleable_qty/disposal/note/created_at)
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'after_stock' ORDER BY ordinal_position;

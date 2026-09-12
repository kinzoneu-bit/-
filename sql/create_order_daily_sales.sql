-- ============================================================
-- 每日订单销量表 (order_daily_sales) · KK 2026-09-09
-- 数据来源: 亚马逊 SP-API (Sales&Traffic byAsin.unitsOrdered) 或手动导入
-- 用途: FIFO 先进先出扣减库存 → 算库存数量/售完时间
-- ============================================================

CREATE TABLE IF NOT EXISTS order_daily_sales (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop       text NOT NULL,              -- 店铺名 (kila/woof/Vercoryx/kinzon/野趣...)
  site       text,                       -- 站点 FR/DE/UK...
  asin       text NOT NULL,              -- ASIN
  order_date date NOT NULL,              -- 订单日期
  units      integer NOT NULL DEFAULT 0, -- 当日订购件数
  amount_eur numeric(12,2),              -- 当日金额 (欧, 可空)
  created_at timestamptz DEFAULT now()
);

-- 唯一: 同店铺同站点同ASIN同天只能一条 (防重复导入)
ALTER TABLE order_daily_sales ADD CONSTRAINT ods_unique
  UNIQUE (shop, site, asin, order_date);

CREATE INDEX IF NOT EXISTS idx_ods_asin ON order_daily_sales (asin, order_date);
CREATE INDEX IF NOT EXISTS idx_ods_shop ON order_daily_sales (shop, order_date);

-- RLS: 登录用户全可读; 写入走 admin (导入脚本登录)
ALTER TABLE order_daily_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ods_read_all ON order_daily_sales;
DROP POLICY IF EXISTS ods_write_admin ON order_daily_sales;
CREATE POLICY ods_read_all ON order_daily_sales FOR SELECT TO authenticated USING (true);
CREATE POLICY ods_write_admin ON order_daily_sales FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role IN ('admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up
                      WHERE up.user_id = auth.uid() AND up.role IN ('admin')));

-- 校验
SELECT column_name FROM information_schema.columns
WHERE table_name='order_daily_sales' ORDER BY ordinal_position;

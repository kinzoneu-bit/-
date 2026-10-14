-- ============================================================
-- 海外仓售后库存 (after_stock) — KK 2026-10-14 定
-- 页面: 「售后库存」Tab (导航在「库存统计」之后)
--   三个区块共用一张表, 用 kind 区分 (顺序固定):
--     kind = amz_return   亚马逊退回海外仓记录
--     kind = wh_receipt   海外仓签收记录
--     kind = wh_saleable  筛选可售库存, 不可售丢弃库存记录
-- 列暂用最小中性集 (日期/店铺/SKU/品名/数量/备注) —— KK 后续细化字段,
--   直接 ALTER TABLE ... ADD COLUMN 即可, 不影响已有数据、不用重录
-- 权限: 读 = 所有登录用户; 写 = admin(KK) + fr(龙泺伊) + cd_supplier(陈雪梅) — KK 2026-10-14 定
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

CREATE TABLE IF NOT EXISTS after_stock (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT          NOT NULL DEFAULT 'amz_return',  -- 区块: amz_return / wh_receipt / wh_saleable
  rec_date    DATE,                                         -- 日期
  store       TEXT,                                         -- 店铺 (飞鸟/野趣/屿阔/俊业/乾霖/胤顺, 可空)
  sku         TEXT,                                         -- SKU / ASIN
  product     TEXT,                                         -- 品名
  qty         NUMERIC(14,2),                                -- 数量
  note        TEXT,                                         -- 备注
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

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

-- 校验: 应返回 2 条策略 (after_stock_read_all / after_stock_write)
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'after_stock' ORDER BY policyname;
-- 校验: 应返回 9 列 (id/kind/rec_date/store/sku/product/qty/note/created_at)
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'after_stock' ORDER BY ordinal_position;

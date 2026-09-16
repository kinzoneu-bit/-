-- ============================================================
-- 订单记录表 (order_records) · KK 2026-09-17 定
-- 字段按 KK 的 Excel「订单统计」表头:
--   序号(auto) / 日期 / 订单号 / 地区 / 名字 / 产品 / sku /
--   到仓价 / 售价 / 到手营业额 / 折合 / 毛利润 / 毛利率 / 邮件 / 索评 / 退款
-- 权限: 读=所有登录用户; 写=管理层 (admin + 法国成员 fr)
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

CREATE TABLE IF NOT EXISTS order_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_date   date,                     -- 日期
  order_no     text,                     -- 订单号 (亚马逊订单号, 用于防重)
  region       text,                     -- 地区 (比利时 / 法国 …)
  customer     text,                     -- 名字
  product      text,                     -- 产品
  sku          text,                     -- sku
  landed_cost  numeric(12,2),            -- 到仓价
  price        numeric(12,2),            -- 售价
  net_revenue  numeric(12,2),            -- 到手营业额
  converted    numeric(12,2),            -- 折合 (人民币)
  gross_profit numeric(12,2),            -- 毛利润
  gross_margin numeric(8,4),             -- 毛利率 (0.4002 = 40.02%)
  email_sent   text,                     -- 邮件 (已发/日期/备注)
  review_asked text,                     -- 索评
  refund       text,                     -- 退款
  note         text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- 订单号唯一 (空值不约束) → 导入时按订单号 upsert 防重
CREATE UNIQUE INDEX IF NOT EXISTS order_records_order_no_key
  ON order_records (order_no) WHERE order_no IS NOT NULL AND order_no <> '';

CREATE INDEX IF NOT EXISTS idx_order_records_date ON order_records (order_date DESC);
CREATE INDEX IF NOT EXISTS idx_order_records_region ON order_records (region);

CREATE OR REPLACE FUNCTION order_records_set_updated()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_records_updated ON order_records;
CREATE TRIGGER trg_order_records_updated BEFORE UPDATE ON order_records
  FOR EACH ROW EXECUTE FUNCTION order_records_set_updated();

-- RLS
ALTER TABLE order_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_read_all ON order_records;
CREATE POLICY order_read_all ON order_records FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS order_write_mgmt ON order_records;
CREATE POLICY order_write_mgmt ON order_records FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr')));

-- 校验: 应返回 2 条策略 + 18 列
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'order_records' ORDER BY policyname;
SELECT column_name FROM information_schema.columns WHERE table_name = 'order_records' ORDER BY ordinal_position;

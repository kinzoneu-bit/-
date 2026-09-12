-- ============================================================
-- 店铺运维费用 (opsfee_monthly) · KK 2026-09-09 (幂等版)
-- 格式: 月份 × 店铺 × 站点 × 费用类别 → 金额
-- 费用类别(初版): 广告/仓储/长期仓储/erp/优惠券/弃置费用/生产者延伸费/店铺月租
-- ============================================================

CREATE TABLE IF NOT EXISTS opsfee_monthly (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month      date NOT NULL,
  store      text,
  site       text NOT NULL,
  category   text NOT NULL,
  amount     numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 唯一约束 (用 DO 块包, 已存在则跳过)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opsfee_unique') THEN
    ALTER TABLE opsfee_monthly ADD CONSTRAINT opsfee_unique
      UNIQUE (month, store, site, category);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_opsfee_month ON opsfee_monthly (month);
CREATE INDEX IF NOT EXISTS idx_opsfee_site ON opsfee_monthly (site);

-- updated_at trigger
CREATE OR REPLACE FUNCTION opsfee_set_updated()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_opsfee_updated ON opsfee_monthly;
CREATE TRIGGER trg_opsfee_updated BEFORE UPDATE ON opsfee_monthly
  FOR EACH ROW EXECUTE FUNCTION opsfee_set_updated();

-- RLS
ALTER TABLE opsfee_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opsfee_read_all ON opsfee_monthly;
DROP POLICY IF EXISTS opsfee_write_admin ON opsfee_monthly;

CREATE POLICY opsfee_read_all ON opsfee_monthly FOR SELECT TO authenticated USING (true);
CREATE POLICY opsfee_write_admin ON opsfee_monthly FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role = 'admin'));

-- 校验: 应返回 8 列 (id, month, store, site, category, amount, note, created_at, updated_at)
SELECT column_name FROM information_schema.columns
WHERE table_name = 'opsfee_monthly' ORDER BY ordinal_position;

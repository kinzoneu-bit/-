-- ============================================================
-- 店铺月度核算 · 手工录入表 (store_monthly_costs)
-- KK 2026-09-16 定:
--   单位人民币 ¥, 每月独立
--   item 取值: 收入 / 人工 / 场地 / 其他   (各项成本 & 净利润自动算, 不入库)
--   权限: 管理层 (admin + 法国成员 fr + 成都采购 黄丹 cd_procurement) 可读写
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

CREATE TABLE IF NOT EXISTS store_monthly_costs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month      date NOT NULL,
  store      text NOT NULL,
  item       text NOT NULL,
  amount     numeric(14,2) NOT NULL DEFAULT 0,
  note       text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 唯一约束: 同一月 + 同店铺 + 同项目 只有一条
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_monthly_costs_unique') THEN
    ALTER TABLE store_monthly_costs ADD CONSTRAINT store_monthly_costs_unique
      UNIQUE (month, store, item);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_smc_month ON store_monthly_costs (month);
CREATE INDEX IF NOT EXISTS idx_smc_store ON store_monthly_costs (store);

-- updated_at 自动维护
CREATE OR REPLACE FUNCTION smc_set_updated()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_smc_updated ON store_monthly_costs;
CREATE TRIGGER trg_smc_updated BEFORE UPDATE ON store_monthly_costs
  FOR EACH ROW EXECUTE FUNCTION smc_set_updated();

-- RLS: 管理层 (admin / fr / cd_procurement-黄丹)
ALTER TABLE store_monthly_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS smc_read_all ON store_monthly_costs;
DROP POLICY IF EXISTS smc_write_ops ON store_monthly_costs;
DROP POLICY IF EXISTS smc_rw_mgmt ON store_monthly_costs;

CREATE POLICY smc_rw_mgmt ON store_monthly_costs FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles up
            WHERE up.user_id = auth.uid()
              AND up.role IN ('admin', 'fr', 'cd_procurement'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles up
            WHERE up.user_id = auth.uid()
              AND up.role IN ('admin', 'fr', 'cd_procurement'))
  );

-- 校验: 应返回 1 条策略 (smc_rw_mgmt) + 8 列
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'store_monthly_costs' ORDER BY policyname;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'store_monthly_costs' ORDER BY ordinal_position;

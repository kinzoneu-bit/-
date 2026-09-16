-- ============================================================
-- 每月汇率表 (fx_rates) · KK 2026-09-16 定
-- 规则: 汇率**按月份各自记录** —— 改当月只影响当月, 历史月份保持原汇率
-- 用途: 店铺运维费用 / 店铺月度核算 的「欧元 → 人民币」折算
-- 权限: 读=所有登录用户; 写=管理层 (admin + 法国成员 fr + 成都采购 黄丹)
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

CREATE TABLE IF NOT EXISTS fx_rates (
  month      date PRIMARY KEY,
  rate       numeric(10,4) NOT NULL,
  note       text,
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION fx_set_updated()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fx_updated ON fx_rates;
CREATE TRIGGER trg_fx_updated BEFORE UPDATE ON fx_rates
  FOR EACH ROW EXECUTE FUNCTION fx_set_updated();

ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fx_read_all ON fx_rates;
CREATE POLICY fx_read_all ON fx_rates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS fx_write_mgmt ON fx_rates;
CREATE POLICY fx_write_mgmt ON fx_rates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr','cd_procurement')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr','cd_procurement')));

-- 顺手把 2026-08 的汇率初始化成 8.0 (当时的默认值), 免得历史月份没汇率
INSERT INTO fx_rates (month, rate, note)
VALUES ('2026-08-01', 8.0, '初始值')
ON CONFLICT (month) DO NOTHING;

-- 校验: 应返回 2 条策略 + 本月已有汇率
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'fx_rates' ORDER BY policyname;
SELECT month, rate, updated_at FROM fx_rates ORDER BY month DESC;

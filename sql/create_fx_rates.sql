-- ============================================================
-- 每月汇率表 (fx_rates) · KK 2026-09-16 定 · v2 (含历史回填)
-- 规则: 汇率**按月份各自记录** —— 改当月只影响当月, 历史月份保持原汇率
-- 用途: 店铺运维费用 / 店铺月度核算 的「欧元 → 人民币」折算
-- 权限: 读=所有登录用户; 写=管理层 (admin + 法国成员 fr + 成都采购 黄丹)
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

-- ① 建表
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

-- ② 权限
ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fx_read_all ON fx_rates;
CREATE POLICY fx_read_all ON fx_rates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS fx_write_mgmt ON fx_rates;
CREATE POLICY fx_write_mgmt ON fx_rates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr','cd_procurement')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.role IN ('admin','fr','cd_procurement')));

-- ③ 历史回填: 凡是「店铺运维费用」里已经有数据的月份, 都补一条汇率
--    取值 = 不晚于该月的最近一条记录; 没有就用 8.0。只补空缺, 不覆盖已设的
INSERT INTO fx_rates (month, rate, note)
SELECT m.month,
       COALESCE((SELECT r.rate FROM fx_rates r WHERE r.month <= m.month ORDER BY r.month DESC LIMIT 1), 8.0),
       '历史回填'
FROM (SELECT DISTINCT month FROM opsfee_monthly) m
ON CONFLICT (month) DO NOTHING;

-- ④ 校验: 应看到每个月一条汇率, 且 8 月与 7 月各自独立
SELECT month, rate, note, updated_at FROM fx_rates ORDER BY month DESC;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'fx_rates' ORDER BY policyname;

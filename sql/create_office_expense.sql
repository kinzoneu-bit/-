-- ============================================================
-- 办公室费用明细 (office_expense) — KK 2026-09-17 定
-- 页面字段: 日期 / 项目明细 / 费用 (¥)  —— 每月一张明细表(顶部选月份)
-- 读: 所有登录用户; 写: admin + fr + cd_procurement(黄丹), 与「店铺月度核算」同权限
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

CREATE TABLE IF NOT EXISTS office_expense (
  id          BIGSERIAL PRIMARY KEY,
  exp_date    DATE           NOT NULL,                    -- 日期
  item        TEXT,                                       -- 项目明细
  amount      NUMERIC(14,2)  NOT NULL DEFAULT 0,          -- 费用 (人民币 ¥)
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS office_expense_date_idx ON office_expense (exp_date DESC);

ALTER TABLE office_expense ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS office_expense_read_all ON office_expense;
CREATE POLICY office_expense_read_all ON office_expense FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS office_expense_write ON office_expense;
CREATE POLICY office_expense_write ON office_expense FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up
                 WHERE up.user_id = auth.uid()
                   AND up.role IN ('admin', 'fr', 'cd_procurement')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up
                      WHERE up.user_id = auth.uid()
                        AND up.role IN ('admin', 'fr', 'cd_procurement')));

-- 校验: 应返回 2 条策略
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'office_expense' ORDER BY policyname;

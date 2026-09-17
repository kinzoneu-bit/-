-- ============================================================
-- 店铺其他费用 (store_other_expense) — KK 2026-09-17 定
-- 页面: 按店铺逐条明细 —— 日期 / 店铺 / 项目明细 / 费用(¥)
--   每月一张明细表(顶部选月份) + 头部分店栏(按 6 家店筛选分类)
-- 店铺口径: 飞鸟 / 野趣 / 屿阔 / 俊业 / 乾霖 / 胤顺 (中文店名, 与其它财务表一致)
-- 权限: 读 = 所有登录用户; 写 = 全部成员 (任何登录角色) — KK 2026-09-17 定
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

CREATE TABLE IF NOT EXISTS store_other_expense (
  id          BIGSERIAL PRIMARY KEY,
  exp_date    DATE           NOT NULL,                    -- 日期
  store       TEXT           NOT NULL,                    -- 店铺 (飞鸟/野趣/屿阔/俊业/乾霖/胤顺)
  item        TEXT,                                       -- 项目明细
  amount      NUMERIC(14,2)  NOT NULL DEFAULT 0,          -- 费用 (人民币 ¥)
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_other_expense_date_idx  ON store_other_expense (exp_date DESC);
CREATE INDEX IF NOT EXISTS store_other_expense_store_idx ON store_other_expense (store);

ALTER TABLE store_other_expense ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_other_read_all ON store_other_expense;
CREATE POLICY store_other_read_all ON store_other_expense FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS store_other_write ON store_other_expense;
CREATE POLICY store_other_write ON store_other_expense FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 校验: 应返回 2 条策略 + 6 列
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'store_other_expense' ORDER BY policyname;
SELECT column_name FROM information_schema.columns WHERE table_name = 'store_other_expense' ORDER BY ordinal_position;

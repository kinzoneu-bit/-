-- =============================================================
-- finance_cashflow · 现金流流水 (财务核算模块 ④)
-- 数据来源: 每周从 万里汇/支付宝/亚马逊结算 导出账单 Excel, 经脚本导入
-- 权限: 仅 admin 可读写 (与 finance_daily_sales 一致)
-- 统计维度: 时期 (tx_date) × 店铺 (store) × 渠道 (channel)
-- =============================================================
CREATE TABLE IF NOT EXISTS finance_cashflow (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_date       date NOT NULL,                 -- 交易日期
  store         text NOT NULL,                 -- 店铺 (kila/wild/Vercoryx/woof/kinzon/未归属/总公司)
  channel       text NOT NULL DEFAULT '万里汇', -- 渠道 (万里汇/支付宝/亚马逊结算/采购/其他)
  type          text NOT NULL CHECK (type IN ('income','expense')),  -- income=流入 / expense=流出
  amount        numeric(12,2) NOT NULL DEFAULT 0,  -- 金额 (正数, 方向由 type 表达)
  currency      text NOT NULL DEFAULT 'EUR',   -- 币种 (EUR/CNY/USD/GBP)
  note          text,                          -- 备注/交易说明
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cf_date ON finance_cashflow (tx_date);
CREATE INDEX IF NOT EXISTS idx_cf_store ON finance_cashflow (store);
CREATE INDEX IF NOT EXISTS idx_cf_channel ON finance_cashflow (channel);

-- =============================================================
-- RLS: 仅 admin 可读写
-- =============================================================
ALTER TABLE finance_cashflow ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cf_read"  ON finance_cashflow;
DROP POLICY IF EXISTS "cf_write" ON finance_cashflow;

CREATE POLICY "cf_read" ON finance_cashflow FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role = 'admin'));

CREATE POLICY "cf_write" ON finance_cashflow FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                      WHERE up.user_id = auth.uid() AND up.role = 'admin'));

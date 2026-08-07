-- =============================================================
-- finance_daily_sales · 每日订单量 & 营业额 (财务核算模块 ①)
-- 数据来源: KK 每日提供, 由 WorkBuddy 代写入
-- 权限: 仅 admin 可读写 (财务数据敏感, 其他角色连看都看不到)
-- =============================================================
CREATE TABLE IF NOT EXISTS finance_daily_sales (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date     date NOT NULL,                 -- 日期
  store         text NOT NULL,                 -- 店铺 (kila/wild/Vercoryx/woof/kinzon/未归属)
  site          text NOT NULL DEFAULT 'FR',    -- 站点 (FR/DE/UK/...)
  asin          text NOT NULL,                 -- 产品 ASIN
  product_name  text,                          -- 产品名冗余 (方便展示)
  order_qty     integer NOT NULL DEFAULT 0,    -- 订单量
  revenue       numeric(12,2) NOT NULL DEFAULT 0, -- 营业额 (EUR)
  note          text,                          -- 备注
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sale_date, store, site, asin)        -- 同一天同店同站同 ASIN 只一条, 重复给数据自动覆盖
);

CREATE INDEX IF NOT EXISTS idx_fin_sales_date ON finance_daily_sales (sale_date);
CREATE INDEX IF NOT EXISTS idx_fin_sales_asin ON finance_daily_sales (asin);
CREATE INDEX IF NOT EXISTS idx_fin_sales_store ON finance_daily_sales (store, site);

-- =============================================================
-- RLS: 仅 admin 可读写
-- =============================================================
ALTER TABLE finance_daily_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_read"  ON finance_daily_sales;
DROP POLICY IF EXISTS "fin_write" ON finance_daily_sales;

CREATE POLICY "fin_read" ON finance_daily_sales FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role = 'admin'));

CREATE POLICY "fin_write" ON finance_daily_sales FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                      WHERE up.user_id = auth.uid() AND up.role = 'admin'));

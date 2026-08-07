-- =============================================================
-- aftersales · 发后记录 (KK 2026-08-07 要求, 参照发货记录 21 列结构)
-- 权限: 仅 admin 可读写 (财务/物流敏感)
-- =============================================================
CREATE TABLE IF NOT EXISTS aftersales (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store              text NOT NULL,                -- 店铺
  event_date         date NOT NULL,                -- 发后日期 (退货/售后日期)
  event_warehouse    text,                          -- 涉及仓库
  event_batch        text,                          -- 关联批次
  product_name       text NOT NULL,                 -- 名称 (产品名)
  qty_affected       integer NOT NULL DEFAULT 0,    -- 数量 (受影响件数)
  event_type         text,                          -- 事件类型 (退货/换货/退款/客户投诉/差评)
  total_weight_kg    numeric(10,2),                 -- 总重量 (kg)
  length_cm          numeric(10,2),
  width_cm           numeric(10,2),
  height_cm          numeric(10,2),
  related_to         text,                          -- 关联 (订单号/ASIN/leaf/发货记录id)
  volume_fee_eur     numeric(12,2),                 -- 体积费用
  share_fee_eur      numeric(12,2),                 -- 分摊费用
  refund_amount_eur  numeric(12,2),                 -- 退款金额
  logistics_provider text,                          -- 物流商
  channel            text,                          -- 渠道
  handled_date       date,                          -- 处理日期
  handling_result    text,                          -- 处理结果
  hot_sales          text,
  unit_cost_eur      numeric(12,2),
  est_margin_eur     numeric(12,2),                 -- 预估损失毛利
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aftersales_date ON aftersales (event_date);
CREATE INDEX IF NOT EXISTS idx_aftersales_store ON aftersales (store);
CREATE INDEX IF NOT EXISTS idx_aftersales_product ON aftersales (product_name);

-- =============================================================
-- RLS: 仅 admin 可读写
-- =============================================================
ALTER TABLE aftersales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "after_read"  ON aftersales;
DROP POLICY IF EXISTS "after_write" ON aftersales;

CREATE POLICY "after_read" ON aftersales FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role = 'admin'));
CREATE POLICY "after_write" ON aftersales FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up
                      WHERE up.user_id = auth.uid() AND up.role = 'admin'));
-- =============================================================
-- shipments v4 · 2026-08-08 加 3 列 (KK 要求)
--   bill_checked: 账单核对完成?
--   freight_paid: 运费已付?
--   cumulative_days: 累计天数 (前端算, 不存表)
-- =============================================================

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS bill_checked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS freight_paid boolean DEFAULT false;

-- 把现有 8 条飞鸟记录默认 false
UPDATE shipments SET bill_checked = false, freight_paid = false WHERE bill_checked IS NULL;

-- 校验
SELECT store, count(*) AS 条数, sum(qty) AS 总件数, sum(bill_checked::int) AS 已对账, sum(freight_paid::int) AS 已付运费 FROM shipments GROUP BY store;
-- ============================================================
-- 发货记录 · 复核流程字段 (KK 2026-09-18 定)
--   规则:
--     · 复核按「批次」; 「复核」按钮只有财务专员(夏蕾, finance)能点
--     · 复核后, 金额字段(头程/杂费/关税/保险费/数量/采购价/货值/分摊费/到仓价)任何改动
--       都要走「申请 → 对方同意」双人确认才入库; 拒绝则作废
--     · 另一方 = 录入人 ↔ 夏蕾 互卡 (录入人 = 最后提交该批改动的账号)
--     · 非金额字段(名称/ASIN/日期/仓库/批次号/物流商/渠道/尾程单号/上架日期/上架数量/单价等)
--       单人可直接改, 但改完该批回到「待复核」
-- 字段说明:
--   review_status  pending(待复核) | approved(已复核) | change_requested(待对方同意)
--   reviewed_by / reviewed_at   谁复核的、什么时候
--   batch_owner / batch_owner_at 录入人(最后提交该批改动者) —— 决定「另一方」是谁
--   change_req    jsonb: { by, at, approver, fields:{批次级新值}, rows:{行id:{字段:新值}} }
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS review_status   text        NOT NULL DEFAULT 'pending';
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS reviewed_by     text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS reviewed_at     timestamptz;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS batch_owner     text;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS batch_owner_at  timestamptz;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS change_req      jsonb;

CREATE INDEX IF NOT EXISTS shipments_review_status_idx ON shipments (review_status);

-- 取值限制 (幂等: 先删后建)
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_review_status_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_review_status_check
  CHECK (review_status IN ('pending', 'approved', 'change_requested'));

-- 校验: 应列出 6 个新列 + 1 个索引
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'shipments'
  AND column_name IN ('review_status','reviewed_by','reviewed_at','batch_owner','batch_owner_at','change_req')
ORDER BY column_name;

SELECT indexname FROM pg_indexes WHERE tablename = 'shipments' AND indexname = 'shipments_review_status_idx';

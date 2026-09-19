-- ============================================================
-- 办公室费用明细 · 新增「区域」列 (KK 2026-09-19 定)
--   取值: '中国' / '法国' (或者留空)
--   用途: 区分这笔办公室费用属于哪个区域主体
-- 在 Supabase → SQL Editor 整段粘贴执行, 幂等可重复跑
-- ============================================================

ALTER TABLE office_expense ADD COLUMN IF NOT EXISTS region text;

ALTER TABLE office_expense DROP CONSTRAINT IF EXISTS office_expense_region_check;
ALTER TABLE office_expense ADD CONSTRAINT office_expense_region_check
  CHECK (region IS NULL OR region IN ('中国', '法国'));

-- ------------------------------------------------------------
-- 历史数据预设 (可选): 项目名带「法国公司」前缀的 → 法国, 其余留空待手工选
-- 想按这个规则回填, 去掉下面 UPDATE 前的注释再执行一次
-- ------------------------------------------------------------
-- UPDATE office_expense SET region = '法国' WHERE region IS NULL AND item LIKE '%法国公司%';

-- 校验
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'office_expense' AND column_name = 'region';

SELECT COALESCE(region, '(未设置)') AS 区域, COUNT(*) AS 条数, SUM(amount) AS 合计
FROM office_expense GROUP BY region ORDER BY 条数 DESC;

-- ============================================================
-- 财务核算 · 店铺口径统一为中文店铺名 · 老英文数据清理
-- KK 2026-09-17 定:
--   「财务核算」的 store 字段 = 店铺 (不是品牌)。
--   早期命名不规范, 存过 kila / wild / Vercoryx / woof / kinzon / 未归属 等英文值。
--   现统一为 6 家中文店铺: 飞鸟 / 野趣 / 屿阔 / 俊业 / 乾霖 / 胤顺。
--   前端下拉已固定这 6 家, 老英文值查不到 → 直接清理。
-- 在 Supabase → SQL Editor 整段粘贴执行
-- ============================================================

-- ① 先看影响范围 (执行前先跑这段, 确认要删多少)
SELECT 'finance_daily_sales' AS tbl, store, COUNT(*) AS cnt
FROM finance_daily_sales GROUP BY store ORDER BY cnt DESC;
SELECT 'finance_cashflow' AS tbl, store, COUNT(*) AS cnt
FROM finance_cashflow GROUP BY store ORDER BY cnt DESC;

-- ② 清理: 删除 store 不在中文 6 家内的记录 (即老英文值)
DELETE FROM finance_daily_sales
WHERE store IS NULL
   OR store NOT IN ('飞鸟', '野趣', '屿阔', '俊业', '乾霖', '胤顺');

DELETE FROM finance_cashflow
WHERE store IS NULL
   OR store NOT IN ('飞鸟', '野趣', '屿阔', '俊业', '乾霖', '胤顺', '总公司');

-- ③ 校验: 应只剩中文店铺
SELECT 'finance_daily_sales' AS tbl, store, COUNT(*) AS cnt
FROM finance_daily_sales GROUP BY store ORDER BY store;
SELECT 'finance_cashflow' AS tbl, store, COUNT(*) AS cnt
FROM finance_cashflow GROUP BY store ORDER BY store;

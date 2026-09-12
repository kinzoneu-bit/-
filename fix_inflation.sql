-- 充气泵 B0GLWY84HC: 诊断 + 修复 采购时间/库存数量
-- 1) 先看现状
SELECT id, ship_date, product_name, listed_qty AS 上架, stock_qty AS 库存, purchase_date AS 采购_当前, listed_date AS 上架时间
FROM inventory
WHERE asin = 'B0GLWY84HC';

-- 2) 一次性修复 (采购时间=6-03, 库存=38)
UPDATE inventory
SET purchase_date = '2026-06-03',
    stock_qty = 38
WHERE asin = 'B0GLWY84HC'
  AND product_name ILIKE '%充气泵%'
RETURNING id, ship_date, product_name,
          purchase_date AS 采购_已更新,
          stock_qty AS 库存_已更新;

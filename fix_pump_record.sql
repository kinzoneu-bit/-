-- 标准 UPDATE: 修正充气泵记录的 ASIN + 采购时间 + 库存 (KK 2026-09-09)
-- 用 id 定位, 不依赖 ASIN 文本, 对任何记录通用
UPDATE inventory
SET asin = 'B0GLWV84HC',
    purchase_date = '2026-06-03',
    stock_qty = 38
WHERE id = 'aa16f06c-0ac0-4fb7-a728-a04f1ba9abc1'
RETURNING id, asin AS 修正后ASIN, purchase_date AS 采购时间, stock_qty AS 库存数量;

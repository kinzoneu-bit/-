-- ============================================================
-- 野趣发货记录 → 批量推送库存 (KK 2026-09-09)
-- 幂等: 已推送过的 shipment 自动跳过 (ON CONFLICT shipment_id)
-- ============================================================

-- 1) 预览: 会被推送的记录 (确认范围对不对)
SELECT s.id, s.store, s.ship_date, s.product_name, s.asin,
       s.qty, COALESCE(s.loss_qty,0) AS 损耗,
       s.qty - COALESCE(s.loss_qty,0) AS 可上架数,
       s.landed_cost AS 盈亏价
FROM shipments s
WHERE (s.store ILIKE '%野趣%' OR s.product_name ILIKE '%野趣%')
  AND (s.listed IS NULL OR s.listed = false)
ORDER BY s.ship_date;

-- 2) 批量推送 → inventory (上架日期 = 发货记录已有的 listed_date, 没有则用今天)
INSERT INTO inventory
  (shipment_id, store, ship_date, ship_warehouse, ship_batch,
   product_name, asin, listed_qty, stock_qty, landed_cost, listed_date)
SELECT s.id, s.store, s.ship_date, s.ship_warehouse, s.ship_batch,
       s.product_name, s.asin,
       s.qty - COALESCE(s.loss_qty,0),
       s.qty - COALESCE(s.loss_qty,0),
       s.landed_cost,
       COALESCE(s.listed_date, CURRENT_DATE)
FROM shipments s
WHERE (s.store ILIKE '%野趣%' OR s.product_name ILIKE '%野趣%')
  AND (s.listed IS NULL OR s.listed = false)
ON CONFLICT (shipment_id) DO NOTHING;

-- 3) 标记这些发货为"已上架" (防止重复推送)
UPDATE shipments s SET listed = true
WHERE (s.store ILIKE '%野趣%' OR s.product_name ILIKE '%野趣%')
  AND EXISTS (SELECT 1 FROM inventory i WHERE i.shipment_id = s.id);

-- 4) 校验: 库存表里野趣的记录
SELECT i.ship_date AS 货发日期, i.ship_warehouse AS 仓库, i.ship_batch AS 批次,
       i.product_name AS 款式, i.asin, i.listed_qty AS 上架数,
       i.stock_qty AS 库存, i.landed_cost AS 盈亏价, i.listed_date AS 上架时间
FROM inventory i
JOIN shipments s ON s.id = i.shipment_id
WHERE (s.store ILIKE '%野趣%' OR s.product_name ILIKE '%野趣%')
ORDER BY i.ship_date;

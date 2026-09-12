-- 看 inventory 里所有记录的 asin / store / ship_date / product_name
SELECT id, store, ship_date, product_name, asin,
 listed_qty AS 上架, stock_qty AS 库存, purchase_date AS 采购
FROM inventory ORDER BY store, ship_date;

-- ============================================================
-- Café, thé et expresso 下级类目更新 (KK 2026-08-11)
-- 父链: Cuisine et Maison (顶层 cat) > Café, thé et expresso (二级 cat)
-- 动作: 删除 Café 现有下级 cat → 插入 13 个新三级 cat (st='ready')
-- 说明: 若父 cat 不存在则什么都不插入, 不报错 (安全)
-- ============================================================

-- 1) 查 Café, thé et expresso 的 cat id (确认存在, 应返回 1 行)
SELECT id, name, group_id, parent_cat_id, st
FROM shelf_cats
WHERE name LIKE 'Café, thé et expresso%'
  AND parent_cat_id = (
    SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
  );

-- 2) 删除 Café, thé et expresso 现有下级 cat
WITH p AS (
  SELECT id FROM shelf_cats
  WHERE name LIKE 'Café, thé et expresso%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
)
DELETE FROM shelf_cats WHERE parent_cat_id IN (SELECT id FROM p);

-- 3) 插入 13 个三级 cat (st='ready')
WITH p AS (
  SELECT id, group_id FROM shelf_cats
  WHERE name LIKE 'Café, thé et expresso%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT p.group_id, p.id, v.name, 'ready'
FROM p CROSS JOIN (VALUES
('Accessoires pour le thé 茶饮配件'),
('Accessoires pour machines à café 咖啡机配件'),
('Cafetières italiennes 意式摩卡壶'),
('Cafetières à piston 法压咖啡壶'),
('Cafetières, machines à café et machines à expresso 咖啡壶、咖啡机与意式咖啡机'),
('Machines à thé et à thé glacé 茶饮机与冰茶机'),
('Moulins à café 咖啡研磨机'),
('Mousseurs à lait 奶泡器'),
('Pichets à thé glacé 冰茶壶'),
('Pièces pour machines à café 咖啡机零配件'),
('Services à thé et à café 咖啡茶具套装'),
('Théières à piston 法压茶壶'),
('Torréfacteurs 咖啡豆烘焙机')
) AS v(name);

-- 4) 校验 (应该 13)
SELECT count(*) AS cafe_subcats_total FROM shelf_cats
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats
  WHERE name LIKE 'Café, thé et expresso%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
);

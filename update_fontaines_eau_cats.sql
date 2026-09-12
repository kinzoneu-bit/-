-- ============================================================
-- Fontaines à eau, filtres et cartouches 下级类目更新 (KK 2026-08-11)
-- 父链: Cuisine et Maison (1级) > Fontaines à eau, filtres et cartouches (2级)
--       > 6 个新 3 级 cat (st='ready')
-- ============================================================

-- 1) 查 Fontaines à eau, filtres et cartouches 的 cat id (确认存在, 应返回 1 行)
SELECT id, name, group_id, parent_cat_id, st
FROM shelf_cats
WHERE name LIKE 'Fontaines à eau, filtres et cartouches%'
  AND parent_cat_id = (
    SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
  );

-- 2) 删除现有下级 cat
WITH p AS (
  SELECT id FROM shelf_cats
  WHERE name LIKE 'Fontaines à eau, filtres et cartouches%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
)
DELETE FROM shelf_cats WHERE parent_cat_id IN (SELECT id FROM p);

-- 3) 插入 6 个三级 cat (st='ready')
WITH p AS (
  SELECT id, group_id FROM shelf_cats
  WHERE name LIKE 'Fontaines à eau, filtres et cartouches%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT p.group_id, p.id, v.name, 'ready'
FROM p CROSS JOIN (VALUES
('Bouteilles filtrantes 过滤水瓶'),
('Carafes filtrantes 滤水壶'),
('Cartouches filtrantes 过滤滤芯'),
('Flacons filtrants 过滤容器'),
('Refroidisseurs et fontaines à eau 冷水机与饮水机'),
('Robinets filtrants 过滤水龙头')
) AS v(name);

-- 4) 校验 (应该 6)
SELECT count(*) AS eau_subcats_total FROM shelf_cats
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats
  WHERE name LIKE 'Fontaines à eau, filtres et cartouches%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
);

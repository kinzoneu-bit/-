-- ============================================================
-- Fers, centrales vapeur et accessoires 下级类目更新 (KK 2026-08-11)
-- 父链: Cuisine et Maison (1级) > Fers, centrales vapeur et accessoires (2级)
--       > 6 个新 3 级 cat (st='ready')
-- ============================================================

-- 1) 查父 cat id (确认存在, 应返回 1 行)
SELECT id, name, group_id, parent_cat_id, st
FROM shelf_cats
WHERE name LIKE 'Fers, centrales vapeur et accessoires%'
  AND parent_cat_id = (
    SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
  );

-- 2) 删除现有下级 cat
WITH p AS (
  SELECT id FROM shelf_cats
  WHERE name LIKE 'Fers, centrales vapeur et accessoires%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
)
DELETE FROM shelf_cats WHERE parent_cat_id IN (SELECT id FROM p);

-- 3) 插入 6 个三级 cat (st='ready')
WITH p AS (
  SELECT id, group_id FROM shelf_cats
  WHERE name LIKE 'Fers, centrales vapeur et accessoires%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT p.group_id, p.id, v.name, 'ready'
FROM p CROSS JOIN (VALUES
('Accessoires pour le repassage 熨烫配件'),
('Centres de repassage 蒸汽熨烫一体机'),
('Défroisseurs vapeur verticaux 立式蒸汽挂烫机'),
('Fers à repasser 电熨斗'),
('Générateurs vapeur de voyage 便携式旅行蒸汽发生器'),
('Presses à repasser vapeur 蒸汽熨烫压衣机')
) AS v(name);

-- 4) 校验 (应该 6)
SELECT count(*) AS repassage_subcats_total FROM shelf_cats
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats
  WHERE name LIKE 'Fers, centrales vapeur et accessoires%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
);
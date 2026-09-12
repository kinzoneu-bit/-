-- ============================================================
-- Aspirateurs, entretien des sols et nettoyeurs de vitres 下级类目更新 (KK 2026-08-11)
-- 父链: Cuisine et Maison (1级) > Aspirateurs, entretien des sols et nettoyeurs de vitres (2级)
--       > 8 个新 3 级 cat (st='ready')
-- ============================================================

-- 1) 查父 cat id (确认存在, 应返回 1 行)
SELECT id, name, group_id, parent_cat_id, st
FROM shelf_cats
WHERE name LIKE 'Aspirateurs, entretien des sols et nettoyeurs de vitres%'
  AND parent_cat_id = (
    SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
  );

-- 2) 删除现有下级 cat
WITH p AS (
  SELECT id FROM shelf_cats
  WHERE name LIKE 'Aspirateurs, entretien des sols et nettoyeurs de vitres%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
)
DELETE FROM shelf_cats WHERE parent_cat_id IN (SELECT id FROM p);

-- 3) 插入 8 个三级 cat (st='ready')
WITH p AS (
  SELECT id, group_id FROM shelf_cats
  WHERE name LIKE 'Aspirateurs, entretien des sols et nettoyeurs de vitres%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT p.group_id, p.id, v.name, 'ready'
FROM p CROSS JOIN (VALUES
('Accessoires pour aspirateurs 吸尘器配件'),
('Accessoires pour nettoyeurs tapis et moquettes 地毯清洗机配件'),
('Accessoires pour nettoyeurs vapeur 蒸汽清洁机配件'),
('Aspirateurs 吸尘器'),
('Balais mécaniques pour tapis et moquettes 地毯手动清扫刷'),
('Nettoyeurs de vitres 擦窗机'),
('Nettoyeurs tapis et moquettes 地毯清洗机'),
('Nettoyeurs vapeur et polisseuses de sol 蒸汽清洁机与地面抛光机')
) AS v(name);

-- 4) 校验 (应该 8)
SELECT count(*) AS aspirateurs_subcats_total FROM shelf_cats
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats
  WHERE name LIKE 'Aspirateurs, entretien des sols et nettoyeurs de vitres%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
);

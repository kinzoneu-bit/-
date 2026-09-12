-- ============================================================
-- Mousseurs à lait 奶泡器 下级类目更新 (KK 2026-08-11)
-- 父链: Cuisine et Maison (1级) > Café, thé et expresso (2级)
--       > Mousseurs à lait (3级) > 3 个新 4 级 cat (st='ready')
-- ============================================================

-- 1) 查 Mousseurs à lait 的 cat id (确认存在, 应返回 1 行)
SELECT id, name, group_id, parent_cat_id, st
FROM shelf_cats
WHERE name LIKE 'Mousseurs à lait%'
  AND parent_cat_id = (
    SELECT id FROM shelf_cats WHERE name LIKE 'Café, thé et expresso%'
      AND parent_cat_id = (
        SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
      )
    LIMIT 1
  );

-- 2) 删除 Mousseurs à lait 现有下级 cat
WITH p AS (
  SELECT id FROM shelf_cats
  WHERE name LIKE 'Mousseurs à lait%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Café, thé et expresso%'
        AND parent_cat_id = (
          SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
        )
      LIMIT 1
    )
  LIMIT 1
)
DELETE FROM shelf_cats WHERE parent_cat_id IN (SELECT id FROM p);

-- 3) 插入 3 个四级 cat (st='ready')
WITH p AS (
  SELECT id, group_id FROM shelf_cats
  WHERE name LIKE 'Mousseurs à lait%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Café, thé et expresso%'
        AND parent_cat_id = (
          SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
        )
      LIMIT 1
    )
  LIMIT 1
)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT p.group_id, p.id, v.name, 'ready'
FROM p CROSS JOIN (VALUES
('Mousseurs à lait automatiques 电动自动奶泡器'),
('Mousseurs à lait manuels 手动奶泡壶'),
('Mousseurs à lait à main 手持奶泡搅拌器')
) AS v(name);

-- 4) 校验 (应该 3)
SELECT count(*) AS mousseurs_subcats_total FROM shelf_cats
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats
  WHERE name LIKE 'Mousseurs à lait%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Café, thé et expresso%'
        AND parent_cat_id = (
          SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
        )
      LIMIT 1
    )
  LIMIT 1
);

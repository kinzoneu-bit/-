-- ============================================================
-- Petit électroménager 下级类目更新 (KK 2026-08-11)
-- 父链: Cuisine et Maison (1级) > Petit électroménager (2级)
--       > 25 个新 3 级 cat (st='ready')
-- ============================================================

-- 1) 查父 cat id (确认存在, 应返回 1 行)
SELECT id, name, group_id, parent_cat_id, st
FROM shelf_cats
WHERE name LIKE 'Petit électroménager%'
  AND parent_cat_id = (
    SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
  );

-- 2) 删除现有下级 cat
WITH p AS (
  SELECT id FROM shelf_cats
  WHERE name LIKE 'Petit électroménager%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
)
DELETE FROM shelf_cats WHERE parent_cat_id IN (SELECT id FROM p);

-- 3) 插入 25 个三级 cat (st='ready')
WITH p AS (
  SELECT id, group_id FROM shelf_cats
  WHERE name LIKE 'Petit électroménager%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT p.group_id, p.id, v.name, 'ready'
FROM p CROSS JOIN (VALUES
('Appareils de mise sous vide 真空封口机'),
('Appareils à sandwich et presses à panini 三明治机与帕尼尼压机'),
('Balances de cuisine 厨房电子秤'),
('Blenders chauffant et machines à soupe 加热破壁机与浓汤机'),
('Bouilloires et distributeurs d''eau chaude 电热水壶与热水机'),
('Cafetières 咖啡壶'),
('Centrifugeuses, extracteurs de jus et presses-agrumes électriques 榨汁机、原汁机与电动柑橘压榨器'),
('Couteaux électriques 电动厨刀'),
('Cuiseurs vapeurs électriques 电蒸箱'),
('Cuiseurs à œufs 煮蛋器'),
('Ensembles bouilloire et grille-pain 水壶烤面包机套装'),
('Fours micro-ondes 微波炉'),
('Friteuses 空气炸锅 / 电炸锅'),
('Grille-pains 烤面包机'),
('Grills, planchas et raclettes 电烤架、平扒炉与瑞士奶酪烤炉'),
('Machines à gaufres et croques 华夫饼机与吐司烘烤机'),
('Machines à pain 面包机'),
('Mijoteuses 慢炖锅'),
('Mixeurs, batteurs et robots multifonctions 搅拌机、打蛋器与多功能料理机'),
('Pièces et accessoires 零配件'),
('Plaques de cuisson 电烤盘'),
('Purificateurs d''eau 净水器'),
('Râpes électriques 电动刨丝器'),
('Trancheuses 电动切片机'),
('Électroménager spécialisé 特色专用小家电')
) AS v(name);

-- 4) 校验 (应该 25)
SELECT count(*) AS petit_electro_subcats_total FROM shelf_cats
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats
  WHERE name LIKE 'Petit électroménager%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
);

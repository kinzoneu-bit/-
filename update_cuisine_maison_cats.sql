-- 1) 删除 Cuisine et Maison 厨房与家居下所有二级 cat
DELETE FROM shelf_cats 
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats 
  WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1
);

-- 2) 重新插入 16 个二级 cat (KK 2026-08-10)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT 
  (SELECT group_id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1),
  (SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1),
  v.name, 'idle'
FROM (VALUES
('Ameublement et décoration 家具与装饰'),
('Aspirateurs, entretien des sols et nettoyeurs de vitres 吸尘器、地面护理与擦窗机'),
('Brassage et vinification maison 家庭酿酒与酿造设备'),
('Café, thé et expresso 咖啡、茶饮与意式浓缩设备'),
('Casseroles, plats et poêles 炖锅、餐盘与煎锅'),
('Chauffage et climatisation 供暖与空调设备'),
('Couteaux et ustensiles de cuisine 刀具与厨房用具'),
('Fers, centrales vapeur et accessoires 熨斗、蒸汽熨烫机及配件'),
('Fontaines à eau, filtres et cartouches 饮水机、过滤器与滤芯'),
('Gros électroménager 大型家用电器'),
('Loisirs créatifs 手工创意用品'),
('Petit électroménager 小型家用电器'),
('Produits et accessoires de nettoyage 清洁用品及配件'),
('Pâtisserie 烘焙用具'),
('Rangement et organisation 收纳整理用品'),
('Tableaux, posters et arts décoratifs 画作、海报与装饰艺术品'),
('Vaisselle et arts de la table 餐具与餐桌艺术')
) AS v(name);

-- 3) 校验
SELECT count(*) AS 总数 FROM shelf_cats
WHERE parent_cat_id = (SELECT id FROM shelf_cats WHERE name LIKE 'Cuisine et Maison%' AND parent_cat_id IS NULL LIMIT 1);

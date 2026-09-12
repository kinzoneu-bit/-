-- 1) 删除 Auto et Moto 下所有二级 cat
DELETE FROM shelf_cats 
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats 
  WHERE name LIKE 'Auto et Moto%' AND parent_cat_id IS NULL LIMIT 1
);

-- 2) 重新插入 15 个二级 cat (KK 2026-08-10)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT 
  (SELECT group_id FROM shelf_cats WHERE name LIKE 'Auto et Moto%' AND parent_cat_id IS NULL LIMIT 1),
  (SELECT id FROM shelf_cats WHERE name LIKE 'Auto et Moto%' AND parent_cat_id IS NULL LIMIT 1),
  v.name, 'idle'
FROM (VALUES
('Accessoires auto 汽车配件'),
('Appareils GPS GPS 设备'),
('Cadeaux et produits dérivés 礼品及衍生周边'),
('Entretien voiture et moto 汽车摩托车养护'),
('Huiles et liquides 油料与各类液体'),
('Motos, accessoires et pièces 摩托车、配件及零件'),
('Outils et dépannage 工具与应急维修'),
('Peinture 车漆涂料'),
('Pièces détachées auto 汽车零配件'),
('Pièces et accessoires pour camping-car 房车配件'),
('Pièces et équipements pour véhicules agricoles 农用车零部件与设备'),
('Pneus et jantes 轮胎与轮毂'),
('Sièges auto et accessoires 汽车安全座椅及配件'),
('Transport et rangement 车载运输与收纳'),
('Électronique embarquée 车载电子设备')
) AS v(name);

-- 3) 校验
SELECT count(*) AS 总数 FROM shelf_cats
WHERE parent_cat_id = (SELECT id FROM shelf_cats WHERE name LIKE 'Auto et Moto%' AND parent_cat_id IS NULL LIMIT 1);

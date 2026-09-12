-- 1) 删除 Jardin 花园下的所有二级 cat
DELETE FROM shelf_cats 
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats 
  WHERE name LIKE 'Jardin%' AND parent_cat_id IS NULL LIMIT 1
);

-- 2) 重新插入 15 个二级 cat (KK 2026-08-10 最新翻译)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT 
  (SELECT group_id FROM shelf_cats WHERE name LIKE 'Jardin%' AND parent_cat_id IS NULL LIMIT 1),
  (SELECT id FROM shelf_cats WHERE name LIKE 'Jardin%' AND parent_cat_id IS NULL LIMIT 1),
  v.name, 'idle'
FROM (VALUES
('Barbecue et repas en extérieur 烧烤与户外用餐'),
('Bassins d''agrément 景观池塘'),
('Chauffage et refroidissement extérieur 户外取暖与制冷设备'),
('Décoration d''extérieur 户外装饰'),
('Déneigement 除雪设备'),
('Jardinage 园艺用品'),
('Luminaires extérieur 户外灯具'),
('Matériels d''arrosage et outils pour jardins 浇灌设备及园艺工具'),
('Mobilier de jardin 庭院家具'),
('Oiseaux et animaux sauvages 鸟类与野生动物用品'),
('Piscines, bains à remous et accessoires 泳池、按摩浴缸及配件'),
('Plantes, graines et bulbes 植物、种子与种球'),
('Rangement et stockage extérieurs 户外收纳储藏'),
('Thermomètres et instruments météorologiques 温度计与气象仪器'),
('Tondeuses et outillage de jardin motorisé 割草机及园艺电动工具')
) AS v(name);

-- 3) 校验
SELECT count(*) AS 总数 FROM shelf_cats
WHERE parent_cat_id = (SELECT id FROM shelf_cats WHERE name LIKE 'Jardin%' AND parent_cat_id IS NULL LIMIT 1);

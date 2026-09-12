-- 1) 删除 Hygiène et santé 下所有子 cat
DELETE FROM shelf_cats 
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats 
  WHERE name = 'Hygiène et santé 清洁与健康' AND parent_cat_id IS NOT NULL LIMIT 1
);

-- 2) 插入 14 个子 cat (KK 2026-08-10)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT 
  (SELECT group_id FROM shelf_cats WHERE name = 'Hygiène et santé 清洁与健康' AND parent_cat_id IS NOT NULL LIMIT 1),
  (SELECT id FROM shelf_cats WHERE name = 'Hygiène et santé 清洁与健康' AND parent_cat_id IS NOT NULL LIMIT 1),
  v.name, 'idle'
FROM (VALUES
('Collerettes 伊丽莎白圈'),
('Compléments ostéo-articulaires 骨关节营养补充剂'),
('Décontractants 舒缓镇静用品'),
('Insectifuges 驱虫驱蚤用品'),
('Laits pour chiens 犬用奶粉'),
('Médicaments en vente libre 非处方宠物药品'),
('Soins des dents 牙齿护理'),
('Soins des oreilles 耳部护理'),
('Soins des yeux 眼部护理'),
('Solutions antidémangeaisons 止痒制剂'),
('Solutions pour troubles digestifs 肠胃调理制剂'),
('Thermomètres 宠物体温计'),
('Vermifuges 体内驱虫药'),
('Vitamines et compléments alimentaires 维生素及膳食补充剂')
) AS v(name);

-- 3) 校验
SELECT c.name AS 子类目, p.name AS 父类目
FROM shelf_cats c 
JOIN shelf_cats p ON p.id = c.parent_cat_id
WHERE p.name = 'Hygiène et santé 清洁与健康';

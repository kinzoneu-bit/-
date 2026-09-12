-- 1) 清掉之前失败的 INSERT (可能留了部分)
DELETE FROM shelf_cats 
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats 
  WHERE name LIKE 'Entretien voiture et moto%' AND parent_cat_id IS NULL LIMIT 1
)
AND st = 'ready';

-- 2) 直接硬编码 group_id (Vercoryx Auto et Moto 的 group_id)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT 
  '7c09bfe9-9a5f-4842-bdb0-e545716933ff',
  (SELECT id FROM shelf_cats WHERE name LIKE 'Entretien voiture et moto%' AND parent_cat_id IS NULL LIMIT 1),
  v.name, 'ready'
FROM (VALUES
('Entretien des fenêtres 车窗养护'),
('Entretien des freins 刹车养护'),
('Entretien des jantes 轮毂养护'),
('Entretien des pneus 轮胎养护'),
('Entretien intérieur 车内养护'),
('Entretien moteur 发动机养护'),
('Entretien peinture 漆面养护'),
('Kit de restauration de phares 大灯修复套装'),
('Kits de nettoyage 清洁套装'),
('Soins extérieurs 车身外部护理'),
('Tubes de remplissage, adhésifs et agents d''étanchéité 填充剂、粘合剂与密封剂')
) AS v(name);

-- 3) 校验 (应该 11)
SELECT count(*) FROM shelf_cats
WHERE parent_cat_id = (SELECT id FROM shelf_cats WHERE name LIKE 'Entretien voiture et moto%' AND parent_cat_id IS NULL LIMIT 1);

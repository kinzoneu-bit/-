-- 删除旧的二级 cat
DELETE FROM shelf_cats 
WHERE parent_cat_id = '8805d955-923b-400d-910e-d66aaa8cfc8c';

-- 插入 11 个 (subquery 现在能匹配父 cat)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT 
  (SELECT group_id FROM shelf_cats WHERE id = '8805d955-923b-400d-910e-d66aaa8cfc8c'),
  '8805d955-923b-400d-910e-d66aaa8cfc8c',
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

-- 校验
SELECT count(*) FROM shelf_cats WHERE parent_cat_id = '8805d955-923b-400d-910e-d66aaa8cfc8c';

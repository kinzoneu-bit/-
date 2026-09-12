-- 直接 INSERT 11 个二级 cat (硬编码 parent_cat_id 和 group_id, 完全不依赖 subquery)
-- parent_cat_id = 8805d955-923b-400d-910e-d66aaa8cfc8c (Entretien voiture et moto)
-- group_id = 7c09bfe9-9a5f-4842-bdb0-e545716933ff (Vercoryx Auto et Moto)
INSERT INTO shelf_cats (id, group_id, parent_cat_id, name, st) VALUES
(gen_random_uuid(), '7c09bfe9-9a5f-4842-bdb0-e545716933ff', '8805d955-923b-400d-910e-d66aaa8cfc8c', 'Entretien des fenêtres 车窗养护', 'ready'),
(gen_random_uuid(), '7c09bfe9-9a5f-4842-bdb0-e545716933ff', '8805d955-923b-400d-910e-d66aaa8cfc8c', 'Entretien des freins 刹车养护', 'ready'),
(gen_random_uuid(), '7c09bfe9-9a5f-4842-bdb0-e545716933ff', '8805d955-923b-400d-910e-d66aaa8cfc8c', 'Entretien des jantes 轮毂养护', 'ready'),
(gen_random_uuid(), '7c09bfe9-9a5f-4842-bdb0-e545716933ff', '8805d955-923b-400d-910e-d66aaa8cfc8c', 'Entretien des pneus 轮胎养护', 'ready'),
(gen_random_uuid(), '7c09bfe9-9a5f-4842-bdb0-e545716933ff', '8805d955-923b-400d-910e-d66aaa8cfc8c', 'Entretien intérieur 车内养护', 'ready'),
(gen_random_uuid(), '7c09bfe9-9a5f-4842-bdb0-e545716933ff', '8805d955-923b-400d-910e-d66aaa8cfc8c', 'Entretien moteur 发动机养护', 'ready'),
(gen_random_uuid(), '7c09bfe9-9a5f-4842-bdb0-e545716933ff', '8805d955-923b-400d-910e-d66aaa8cfc8c', 'Entretien peinture 漆面养护', 'ready'),
(gen_random_uuid(), '7c09bfe9-9a5f-4842-bdb0-e545716933ff', '8805d955-923b-400d-910e-d66aaa8cfc8c', 'Kit de restauration de phares 大灯修复套装', 'ready'),
(gen_random_uuid(), '7c09bfe9-9a5f-4842-bdb0-e545716933ff', '8805d955-923b-400d-910e-d66aaa8cfc8c', 'Kits de nettoyage 清洁套装', 'ready'),
(gen_random_uuid(), '7c09bfe9-9a5f-4842-bdb0-e545716933ff', '8805d955-923b-400d-910e-d66aaa8cfc8c', 'Soins extérieurs 车身外部护理', 'ready'),
(gen_random_uuid(), '7c09bfe9-9a5f-4842-bdb0-e545716933ff', '8805d955-923b-400d-910e-d66aaa8cfc8c', 'Tubes de remplissage, adhésifs et agents d''étanchéité 填充剂、粘合剂与密封剂', 'ready');

-- 校验 (应该 11 行)
SELECT count(*) FROM shelf_cats WHERE parent_cat_id = '8805d955-923b-400d-910e-d66aaa8cfc8c';

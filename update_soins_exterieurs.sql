-- 1) 查 Soins extérieurs 父 cat id (Vercoryx Auto et Moto Entretien voiture et moto 下)
SELECT id, name, group_id FROM shelf_cats WHERE name LIKE 'Soins extérieurs%';

-- 2) 删旧子 cat
DELETE FROM shelf_cats 
WHERE parent_cat_id = (SELECT id FROM shelf_cats WHERE name LIKE 'Soins extérieurs%' AND parent_cat_id IS NOT NULL LIMIT 1);

-- 3) 插 5 个子 cat (subquery 现在能匹配 group_id)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT 
  (SELECT group_id FROM shelf_cats WHERE name LIKE 'Soins extérieurs%' AND parent_cat_id IS NOT NULL LIMIT 1),
  (SELECT id FROM shelf_cats WHERE name LIKE 'Soins extérieurs%' AND parent_cat_id IS NOT NULL LIMIT 1),
  v.name, 'ready'
FROM (VALUES
('Films de protection, pellicules plastiques en vinyle et accessoires pour la peinture 保护膜、乙烯基贴膜及漆面施工配件'),
('Nettoyants 清洁剂'),
('Polissage, éliminateur de rayures et cires 抛光、划痕去除剂与车蜡'),
('Prévention anti-rouille 防锈防护产品'),
('Stabilisateurs de rouille et dérouillants 锈迹稳定剂与除锈剂'),
('Équipement de lavage 洗车设备')
) AS v(name);

-- 4) 校验
SELECT count(*) FROM shelf_cats 
WHERE parent_cat_id = (SELECT id FROM shelf_cats WHERE name LIKE 'Soins extérieurs%' AND parent_cat_id IS NOT NULL LIMIT 1);

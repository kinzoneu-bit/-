-- 1) 删除 Luminaires et éclairage 下所有二级 cat
DELETE FROM shelf_cats 
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats 
  WHERE name LIKE 'Luminaires et éclairage%' AND parent_cat_id IS NULL LIMIT 1
);

-- 2) 重新插入 6 个二级 cat (KK 2026-08-10)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT 
  (SELECT group_id FROM shelf_cats WHERE name LIKE 'Luminaires et éclairage%' AND parent_cat_id IS NULL LIMIT 1),
  (SELECT id FROM shelf_cats WHERE name LIKE 'Luminaires et éclairage%' AND parent_cat_id IS NULL LIMIT 1),
  v.name, 'idle'
FROM (VALUES
('Ampoules 灯泡'),
('Luminaires extérieur 户外灯具'),
('Luminaires intérieur 室内灯具'),
('Tubes lumineux 灯管'),
('Éclairage de Noël 圣诞灯饰'),
('Éclairage de salle de bain 浴室照明')
) AS v(name);

-- 3) 校验
SELECT count(*) AS 总数 FROM shelf_cats
WHERE parent_cat_id = (SELECT id FROM shelf_cats WHERE name LIKE 'Luminaires et éclairage%' AND parent_cat_id IS NULL LIMIT 1);

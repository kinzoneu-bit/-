-- 1) 删除 Bricolage DIY 下所有二级 cat
DELETE FROM shelf_cats 
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats 
  WHERE name LIKE 'Bricolage%' AND parent_cat_id IS NULL LIMIT 1
);

-- 2) 重新插入 11 个二级 cat (KK 2026-08-10)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT 
  (SELECT group_id FROM shelf_cats WHERE name LIKE 'Bricolage%' AND parent_cat_id IS NULL LIMIT 1),
  (SELECT id FROM shelf_cats WHERE name LIKE 'Bricolage%' AND parent_cat_id IS NULL LIMIT 1),
  v.name, 'idle'
FROM (VALUES
('Cheminées 壁炉'),
('Construction 建筑建材'),
('Cuisines et salles de bain 厨房与卫浴'),
('Outillage à main et électroportatif 手动及电动工具'),
('Peintures, outils et traitement des murs 涂料、工具及墙面处理'),
('Plomberie 水暖管道'),
('Quincaillerie 五金件'),
('Rangement et organisation 收纳整理'),
('Sécurité 安防用品'),
('Tondeuses et outillage de jardin motorisé 割草机及园艺电动工具'),
('Électricité 电气电工')
) AS v(name);

-- 3) 校验
SELECT count(*) AS 总数 FROM shelf_cats
WHERE parent_cat_id = (SELECT id FROM shelf_cats WHERE name LIKE 'Bricolage%' AND parent_cat_id IS NULL LIMIT 1);

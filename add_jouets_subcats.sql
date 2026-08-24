-- 1) 删除 Jouets 玩具下所有子 cat (避免重名冲突)
DELETE FROM shelf_cats 
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats 
  WHERE name = 'Jouets 玩具' AND parent_cat_id IS NOT NULL LIMIT 1
);

-- 2) 插入 6 个子 cat
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT 
  (SELECT group_id FROM shelf_cats WHERE name = 'Jouets 玩具' AND parent_cat_id IS NOT NULL LIMIT 1),
  (SELECT id FROM shelf_cats WHERE name = 'Jouets 玩具' AND parent_cat_id IS NOT NULL LIMIT 1),
  v.name, 'idle'
FROM (VALUES
('Balles 宠物球'),
('Cordes 绳结玩具'),
('Frisbees 飞盘'),
('Jouets laser 激光玩具'),
('Jouets à couinement 发声玩具'),
('Jouets à mâcher 啃咬磨牙玩具')
) AS v(name);

-- 3) 校验
SELECT c.name AS 子类目, p.name AS 父类目
FROM shelf_cats c 
JOIN shelf_cats p ON p.id = c.parent_cat_id
WHERE p.name = 'Jouets 玩具';

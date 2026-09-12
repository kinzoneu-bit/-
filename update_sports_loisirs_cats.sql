-- 1) 删除 Sports et Loisirs 运动与休闲下所有二级 cat
DELETE FROM shelf_cats 
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats 
  WHERE name LIKE 'Sports et Loisirs%' AND parent_cat_id IS NULL LIMIT 1
);

-- 2) 重新插入 57 个二级 cat (KK 2026-08-10)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT 
  (SELECT group_id FROM shelf_cats WHERE name LIKE 'Sports et Loisirs%' AND parent_cat_id IS NULL LIMIT 1),
  (SELECT id FROM shelf_cats WHERE name LIKE 'Sports et Loisirs%' AND parent_cat_id IS NULL LIMIT 1),
  v.name, 'idle'
FROM (VALUES
('Accessoires de sports 运动配件'),
('Airsoft 软弹气枪运动'),
('Athlétisme 田径运动'),
('Badminton 羽毛球'),
('Base-ball 棒球'),
('Basket-ball 篮球'),
('Billards 台球'),
('Billetterie 票务'),
('Boutique du supporter 球迷周边商店'),
('Bowling 保龄球'),
('Boxe 拳击'),
('Camping et randonnée 露营徒步'),
('Catch 摔跤运动'),
('Cricket 板球'),
('Cyclisme 骑行运动'),
('Danse 舞蹈'),
('Divers jeux 其他运动游戏'),
('Escalade 攀岩'),
('Escrime 击剑'),
('Fitness et Musculation 健身与力量训练'),
('Fléchettes 飞镖'),
('Football 足球'),
('Football américain 美式足球'),
('Golf 高尔夫'),
('Gymnastique 体操'),
('Handball 手球'),
('Hockey sur gazon 草地曲棍球'),
('Indiaca 印地阿卡球'),
('Lacrosse 长曲棍球'),
('Netball 无挡板篮球'),
('Paintball 彩弹射击'),
('Pom-pom girls 啦啦队用品'),
('Pêche 垂钓'),
('Racquetball 壁球'),
('Rinkhockey 旱冰曲棍球'),
('Rollers en ligne et patins à roulettes 直排轮滑与轮滑鞋'),
('Rugby 橄榄球'),
('Running 跑步'),
('Sacs de sport 运动包'),
('Skateboard 滑板'),
('Snooker 斯诺克'),
('Sport de combat 格斗运动'),
('Sport de disque 飞盘运动'),
('Sports d''hiver 冬季运动'),
('Sports nautiques 水上运动'),
('Sports sur gazon 草地运动'),
('Squash 壁球'),
('Tennis 网球'),
('Tennis de table 乒乓球'),
('Tir à l''arc 射箭'),
('Trophées 奖杯奖牌'),
('Trottinettes et équipement 滑板车及装备'),
('Volleyball 排球'),
('Vêtements de sport 运动服饰'),
('Électronique 运动电子设备'),
('Équitation 马术运动')
) AS v(name);

-- 3) 校验
SELECT count(*) AS 总数 FROM shelf_cats
WHERE parent_cat_id = (SELECT id FROM shelf_cats WHERE name LIKE 'Sports et Loisirs%' AND parent_cat_id IS NULL LIMIT 1);

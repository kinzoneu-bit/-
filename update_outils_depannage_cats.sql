-- 1) 删除 Outils et dépannage 下所有子 cat
DELETE FROM shelf_cats 
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats 
  WHERE name = 'Outils et dépannage 工具与应急维修' AND parent_cat_id IS NOT NULL LIMIT 1
);

-- 2) 插入 22 个子 cat (KK 2026-08-10)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT 
  (SELECT group_id FROM shelf_cats WHERE name = 'Outils et dépannage 工具与应急维修' AND parent_cat_id IS NOT NULL LIMIT 1),
  (SELECT id FROM shelf_cats WHERE name = 'Outils et dépannage 工具与应急维修' AND parent_cat_id IS NOT NULL LIMIT 1),
  v.name, 'idle'
FROM (VALUES
('Extracteurs et séparateurs 拔取器与分离器'),
('Kits de réparation de filetage 螺纹修复套件'),
('Outillage à main 手动工具'),
('Outils d''embrayage 离合器工具'),
('Outils de batterie 电瓶专用工具'),
('Outils de circuits de carburant 燃油管路工具'),
('Outils de diagnostics, tests et mesures 诊断检测测量工具'),
('Outils de direction et de suspensions 转向与悬挂工具'),
('Outils de freins 刹车维修工具'),
('Outils de réparation carrosserie 车身维修工具'),
('Outils et dépannage pour l''air conditionné 空调维修检修工具'),
('Outils moteur 发动机维修工具'),
('Outils pour essuie-glaces 雨刮专用工具'),
('Outils pour le circuit de graissage 润滑系统工具'),
('Outils pour pare-brise 挡风玻璃工具'),
('Outils pour pneus et roues 轮胎轮毂工具'),
('Plateaux porte-outils 工具托盘'),
('Presse à buselures 压铆机'),
('Riveteuses 铆钉枪'),
('Visseuses à choc 冲击扳手'),
('Équipements garage et atelier 车库车间设备')
) AS v(name);

-- 3) 校验
SELECT count(*) AS 总数 FROM shelf_cats
WHERE parent_cat_id = (SELECT id FROM shelf_cats WHERE name = 'Outils et dépannage 工具与应急维修' AND parent_cat_id IS NOT NULL LIMIT 1);

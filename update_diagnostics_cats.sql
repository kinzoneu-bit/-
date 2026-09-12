-- 1) 删除 Outils de diagnostics 下所有子 cat
DELETE FROM shelf_cats 
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats 
  WHERE name = 'Outils de diagnostics, tests et mesures 诊断检测测量工具' AND parent_cat_id IS NOT NULL LIMIT 1
);

-- 2) 插入 17 个子 cat (KK 2026-08-10)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT 
  (SELECT group_id FROM shelf_cats WHERE name = 'Outils de diagnostics, tests et mesures 诊断检测测量工具' AND parent_cat_id IS NOT NULL LIMIT 1),
  (SELECT id FROM shelf_cats WHERE name = 'Outils de diagnostics, tests et mesures 诊断检测测量工具' AND parent_cat_id IS NOT NULL LIMIT 1),
  v.name, 'idle'
FROM (VALUES
('Accessoires et micromètres 配件与千分尺'),
('Caméras d''inspection (Current) 内窥镜检测摄像头'),
('Indicateurs à cadran 百分表'),
('Jauges de carrossage 外倾角量规'),
('Jauges de frein 刹车测量规'),
('Jauges de profondeur pneus 轮胎花纹深度尺'),
('Lampes d''inspection 检修工作灯'),
('Lampes stroboscopiques 频闪正时灯'),
('Miroirs d''inspection 检测反光镜'),
('Multimètres 万用表'),
('Outils diagnostics pour système de moteur OBD-II OBD-II 发动机诊断工具'),
('Scanner d''airbag 安全气囊扫描仪'),
('Testeur de batterie 电瓶检测仪'),
('Testeurs d''allumage 点火测试仪'),
('Testeurs de circuits 电路检测仪'),
('Testeurs de pression d''huile 机油压力测试仪'),
('Testeurs de pression de carburant 燃油压力测试仪'),
('Thermomètres à infrarouges 红外测温仪')
) AS v(name);

-- 3) 校验
SELECT count(*) AS 总数 FROM shelf_cats
WHERE parent_cat_id = (SELECT id FROM shelf_cats WHERE name = 'Outils de diagnostics, tests et mesures 诊断检测测量工具' AND parent_cat_id IS NOT NULL LIMIT 1);

-- ============================================================
-- Sécurité 安防用品 下级类目更新 (KK 2026-08-11)
-- 父链: Bricolage (1级) > Sécurité 安防用品 (2级)
--       > 17 个新 3 级 cat (st='ready')
-- ============================================================

-- 1) 查父 cat id (确认存在, 应返回 1 行)
SELECT id, name, group_id, parent_cat_id, st
FROM shelf_cats
WHERE name LIKE 'Sécurité%'
  AND parent_cat_id = (
    SELECT id FROM shelf_cats WHERE name LIKE 'Bricolage%' AND parent_cat_id IS NULL LIMIT 1
  );

-- 2) 删除现有下级 cat
WITH p AS (
  SELECT id FROM shelf_cats
  WHERE name LIKE 'Sécurité%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Bricolage%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
)
DELETE FROM shelf_cats WHERE parent_cat_id IN (SELECT id FROM p);

-- 3) 插入 17 个三级 cat (st='ready')
WITH p AS (
  SELECT id, group_id FROM shelf_cats
  WHERE name LIKE 'Sécurité%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Bricolage%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
)
INSERT INTO shelf_cats (group_id, parent_cat_id, name, st)
SELECT p.group_id, p.id, v.name, 'ready'
FROM p CROSS JOIN (VALUES
('Balises 感应警示灯'),
('Cadenas et loquets 挂锁与锁扣'),
('Caisses à monnaie 钱箱'),
('Coffres-forts et accessoires de coffre-fort 保险箱及配件'),
('Détecteurs pour la maison 家用探测报警器'),
('Kits d''urgence 应急套装'),
('Lanternes 手提照明灯'),
('Maison et travail 家用及办公安防用品'),
('Placards à clés 钥匙保管箱'),
('Poignées de fenêtre verrouillables 带锁窗把手'),
('Rangement armes 枪械收纳柜'),
('Sirènes 警报器'),
('Sonnettes 门铃'),
('Systèmes sécurité pour la maison 家用安防系统'),
('Sécurité incendie 消防安防用品'),
('Éclairage de sécurité 应急照明'),
('Équipement et matériel de sécurité 安防设备与器材')
) AS v(name);

-- 4) 校验 (应该 17)
SELECT count(*) AS securite_subcats_total FROM shelf_cats
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats
  WHERE name LIKE 'Sécurité%'
    AND parent_cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Bricolage%' AND parent_cat_id IS NULL LIMIT 1
    )
  LIMIT 1
);
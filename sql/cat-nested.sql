-- =============================================================
-- 类目嵌套 v1 · 2026-08-08 (KK 要求真实层级)
--   Animalerie > Chiens > Transport et voyages > Accessoires voiture > [5个叶端]
-- =============================================================

-- ① shelf_cats 支持嵌套 (parent_cat_id)
ALTER TABLE shelf_cats ADD COLUMN IF NOT EXISTS parent_cat_id uuid;

-- ② 建 "Transport et voyages" (父=Chiens 1a56e779-...)
INSERT INTO shelf_cats (group_id, name, parent_cat_id, st)
SELECT c.group_id, 'Transport et voyages', c.id, 'idle'
FROM shelf_cats c WHERE c.id = '1a56e779-1fab-48b5-97ea-b359f1e6e7ae'
  AND NOT EXISTS (SELECT 1 FROM shelf_cats x WHERE x.name = 'Transport et voyages' AND x.parent_cat_id = c.id);

-- ③ 建 "Accessoires voiture" (父=Transport et voyages)
INSERT INTO shelf_cats (group_id, name, parent_cat_id, st)
SELECT c.group_id, 'Accessoires voiture', c.id, 'idle'
FROM shelf_cats c WHERE c.name = 'Transport et voyages' AND c.parent_cat_id = '1a56e779-1fab-48b5-97ea-b359f1e6e7ae'
LIMIT 1
ON CONFLICT DO NOTHING;

-- ④ 把 5 个叶端挂到 Accessoires voiture 下 (之前建在 Chiens 下的, 移动过去)
UPDATE shelf_leaves SET cat_id = (
  SELECT x.id FROM shelf_cats x WHERE x.name = 'Accessoires voiture' AND x.parent_cat_id = (
    SELECT y.id FROM shelf_cats y WHERE y.name = 'Transport et voyages' AND y.parent_cat_id = '1a56e779-1fab-48b5-97ea-b359f1e6e7ae'
  ) LIMIT 1
)
WHERE cat_id = '1a56e779-1fab-48b5-97ea-b359f1e6e7ae'
  AND leaf_name IN ('Couvertures de protection','Sièges auto','Grilles pare-chien','Rampes d''accès','Cages de transport');

-- ⑤ Rehausseurs 也移到 Accessoires voiture 下
UPDATE shelf_leaves SET cat_id = (
  SELECT x.id FROM shelf_cats x WHERE x.name = 'Accessoires voiture' AND x.parent_cat_id = (
    SELECT y.id FROM shelf_cats y WHERE y.name = 'Transport et voyages' AND y.parent_cat_id = '1a56e779-1fab-48b5-97ea-b359f1e6e7ae'
  ) LIMIT 1
)
WHERE leaf_name ILIKE '%Rehausseur%' OR leaf_name ILIKE '%sièges autos%' OR leaf_name ILIKE '%座椅%';

-- ⑥ 校验
SELECT c1.name AS 三级, c2.name AS 四级, l.leaf_name AS 五级
FROM shelf_cats c1
LEFT JOIN shelf_cats c2 ON c2.parent_cat_id = c1.id
LEFT JOIN shelf_leaves l ON l.cat_id = c2.id
WHERE c1.name = 'Transport et voyages' AND c1.parent_cat_id = '1a56e779-1fab-48b5-97ea-b359f1e6e7ae';
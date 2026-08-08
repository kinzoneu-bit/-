-- =============================================================
-- KinZon 货架+开发进度 全量重建 (幂等, 可重复跑) · 2026-08-08 18:15
-- 修复: moved_by_email 字段名 / phase CHECK / 5级类目 / h1 框空
-- =============================================================

-- ---------- 1. shelf_leaves 扩 phase 字段 + CHECK (允许 h1-h4) ----------
ALTER TABLE shelf_leaves ADD COLUMN IF NOT EXISTS phase text;
-- 清掉旧 CHECK 再建
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'public.shelf_leaves'::regclass
    AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%phase%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.shelf_leaves DROP CONSTRAINT %I', cname);
  END IF;
END $$;
ALTER TABLE shelf_leaves ADD CONSTRAINT shelf_leaves_phase_check
  CHECK (phase IS NULL OR phase IN ('h1','h2','h3','h4'));

-- ---------- 2. shelf_cats 支持嵌套 ----------
ALTER TABLE shelf_cats ADD COLUMN IF NOT EXISTS parent_cat_id uuid;

-- ---------- 3. 幂等: Transport et voyages (父=Chiens) ----------
INSERT INTO shelf_cats (group_id, name, parent_cat_id, st)
SELECT c.group_id, 'Transport et voyages', c.id, 'idle'
FROM shelf_cats c WHERE c.id = '1a56e779-1fab-48b5-97ea-b359f1e6e7ae'
  AND NOT EXISTS (SELECT 1 FROM shelf_cats x WHERE x.parent_cat_id = c.id AND x.name LIKE 'Transport%');

-- ---------- 4. 幂等: Accessoires voiture (父=Transport et voyages) ----------
INSERT INTO shelf_cats (group_id, name, parent_cat_id, st)
SELECT c.group_id, 'Accessoires voiture', c.id, 'idle'
FROM shelf_cats c WHERE c.name LIKE 'Transport%'
  AND NOT EXISTS (SELECT 1 FROM shelf_cats x WHERE x.parent_cat_id = c.id AND x.name LIKE 'Accessoires%');

-- ---------- 5. 幂等: 建 Harnais pour voiture (在 Chiens 下) ----------
INSERT INTO shelf_leaves (cat_id, leaf_name, st, phase, path)
SELECT c.id, 'Harnais pour voiture', 'idle', 'h1', 'Animalerie > Chiens > Transport et voyages > Accessoires voiture > Harnais pour voiture'
FROM shelf_cats c WHERE c.id = '1a56e779-1fab-48b5-97ea-b359f1e6e7ae'
  AND NOT EXISTS (SELECT 1 FROM shelf_leaves l WHERE l.leaf_name LIKE 'Harnais%');

-- ---------- 6. 幂等: 5 个四级叶端 (父=Accessoires voiture) ----------
INSERT INTO shelf_leaves (cat_id, leaf_name, st, phase, path)
SELECT ac.id, 'Couvertures de protection', 'idle', 'h1', 'Animalerie > Chiens > Transport et voyages > Accessoires voiture > Couvertures de protection'
FROM shelf_cats ac WHERE ac.name LIKE 'Accessoires%'
  AND NOT EXISTS (SELECT 1 FROM shelf_leaves l WHERE l.leaf_name LIKE 'Couvertures%');
INSERT INTO shelf_leaves (cat_id, leaf_name, st, phase, path)
SELECT ac.id, 'Sièges auto', 'idle', 'h1', 'Animalerie > Chiens > Transport et voyages > Accessoires voiture > Sièges auto'
FROM shelf_cats ac WHERE ac.name LIKE 'Accessoires%'
  AND NOT EXISTS (SELECT 1 FROM shelf_leaves l WHERE l.leaf_name LIKE 'Sièges auto%');
INSERT INTO shelf_leaves (cat_id, leaf_name, st, phase, path)
SELECT ac.id, 'Grilles pare-chien', 'idle', 'h1', 'Animalerie > Chiens > Transport et voyages > Accessoires voiture > Grilles pare-chien'
FROM shelf_cats ac WHERE ac.name LIKE 'Accessoires%'
  AND NOT EXISTS (SELECT 1 FROM shelf_leaves l WHERE l.leaf_name LIKE 'Grilles%');
INSERT INTO shelf_leaves (cat_id, leaf_name, st, phase, path)
SELECT ac.id, 'Rampes d''accès', 'idle', 'h1', 'Animalerie > Chiens > Transport et voyages > Accessoires voiture > Rampes d''accès'
FROM shelf_cats ac WHERE ac.name LIKE 'Accessoires%'
  AND NOT EXISTS (SELECT 1 FROM shelf_leaves l WHERE l.leaf_name LIKE 'Rampes%');
INSERT INTO shelf_leaves (cat_id, leaf_name, st, phase, path)
SELECT ac.id, 'Cages de transport', 'idle', 'h1', 'Animalerie > Chiens > Transport et voyages > Accessoires voiture > Cages de transport'
FROM shelf_cats ac WHERE ac.name LIKE 'Accessoires%'
  AND NOT EXISTS (SELECT 1 FROM shelf_leaves l WHERE l.leaf_name LIKE 'Cages de transport%');

-- ---------- 7. 统一叶端名: 外语 中文 ----------
UPDATE shelf_leaves SET leaf_name = 'Harnais pour voiture 汽车线束' WHERE leaf_name LIKE 'Harnais pour voiture%';
UPDATE shelf_leaves SET leaf_name = 'Couvertures de protection 防护罩' WHERE leaf_name LIKE 'Couvertures de protection%';
UPDATE shelf_leaves SET leaf_name = 'Sièges auto 汽车座椅' WHERE leaf_name LIKE 'Sièges auto%';
UPDATE shelf_leaves SET leaf_name = 'Grilles pare-chien 狗卫士' WHERE leaf_name LIKE 'Grilles pare-chien%';
UPDATE shelf_leaves SET leaf_name = 'Rampes d''accès 坡道' WHERE leaf_name LIKE 'Rampes d''accès%';
UPDATE shelf_leaves SET leaf_name = 'Cages de transport 运输笼' WHERE leaf_name LIKE 'Cages de transport%';
UPDATE shelf_cats SET name = 'Transport et voyages 出行装备' WHERE name LIKE 'Transport et voyages%';
UPDATE shelf_cats SET name = 'Accessoires voiture 汽车配件' WHERE name LIKE 'Accessoires voiture%';

-- ---------- 8. 给所有 idle 叶端建 h1 monitor_handoff (DELETE+INSERT 幂等) ----------
DELETE FROM monitor_handoff;
DELETE FROM monitor_handoff_log;
INSERT INTO monitor_handoff (leaf_id, box_key, start_at)
SELECT id, 'h1', now() FROM shelf_leaves WHERE st = 'idle';
-- 正确字段: moved_by_email
INSERT INTO monitor_handoff_log (leaf_id, from_box, to_box, moved_at, moved_by_email)
SELECT id, NULL, 'h1', now(), 'system@rebuild' FROM shelf_leaves WHERE st = 'idle';

-- ---------- 9. 校验 ----------
SELECT '类目层级' AS 项, g.name AS 大类, c1.name AS 二级, c2.name AS 三级, c3.name AS 四级
FROM shelf_groups g
JOIN shelf_cats c1 ON c1.group_id = g.id AND c1.name LIKE 'Chiens%'
LEFT JOIN shelf_cats c2 ON c2.parent_cat_id = c1.id
LEFT JOIN shelf_cats c3 ON c3.parent_cat_id = c2.id;
SELECT 'h1框' AS 项, count(*) AS 叶端数 FROM monitor_handoff WHERE box_key = 'h1';
SELECT 'idle叶端' AS 项, count(*) AS 总数 FROM shelf_leaves WHERE st = 'idle';
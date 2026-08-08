-- =============================================================
-- 货架重构 v3 · 2026-08-08
-- (1) suppliers 加 product_id (供应商挂到具体产品)
-- (2) 新建 5 级叶端: Animalerie > Chiens > Colliers, harnais et laisses > Harnais > Harnais pour voiture
-- (3) 状态: 在调研立项 (st=idle, phase=h1)
-- (4) 全体系同步: monitor_handoff 记录 h1 框
-- =============================================================

-- 1. suppliers 加 product_id
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS product_id uuid;

-- 2. 新建叶端: 在 Animalerie > Chiens 这条 cat 下挂"Harnais pour voiture"
INSERT INTO shelf_leaves (cat_id, leaf_name, st, phase, path)
SELECT c.id, 'Harnais pour voiture', 'idle', 'h1', 'Animalerie > Chiens > Colliers, harnais et laisses > Harnais > Harnais pour voiture'
FROM shelf_cats c JOIN shelf_groups g ON g.id = c.group_id
WHERE g.name = 'Animalerie' AND c.name = 'Chiens'
LIMIT 1;

-- 3. 同步 h1 框: 写到 monitor_handoff (开发进度可见)
INSERT INTO monitor_handoff (leaf_id, box_key, start_at)
SELECT id, 'h1', now() FROM shelf_leaves
WHERE leaf_name = 'Harnais pour voiture'
  AND cat_id IN (
    SELECT c.id FROM shelf_cats c JOIN shelf_groups g ON g.id = c.group_id
    WHERE g.name = 'Animalerie' AND c.name = 'Chiens'
  )
ON CONFLICT (leaf_id) DO UPDATE SET box_key = 'h1', start_at = now();

-- 4. 写 log (交接历史, handoffStats 统计来源)
INSERT INTO monitor_handoff_log (leaf_id, from_box, to_box, moved_at, moved_by)
SELECT id, NULL, 'h1', now(), 'cd_supplier'
FROM shelf_leaves
WHERE leaf_name = 'Harnais pour voiture'
  AND cat_id IN (
    SELECT c.id FROM shelf_cats c JOIN shelf_groups g ON g.id = c.group_id
    WHERE g.name = 'Animalerie' AND c.name = 'Chiens'
  );

-- 5. 校验: 全体系状态
SELECT 'leaf' AS tbl, leaf_name, st, phase, path FROM shelf_leaves WHERE leaf_name = 'Harnais pour voiture';
SELECT 'handoff' AS tbl, leaf_id, box_key, start_at FROM monitor_handoff h
  JOIN shelf_leaves l ON l.id = h.leaf_id WHERE l.leaf_name = 'Harnais pour voiture';
-- =============================================================
-- 货架重构 v4 · 2026-08-08 (重做 Harnais pour voiture)
-- 不管之前 INSERT 成功与否, 先 DELETE 所有同名叶端, 然后强制插入
-- 兼容多个品牌 (woof / 其他都有 Animalerie > Chiens 的话都加)
-- =============================================================

-- 1. 先清掉 (如果有失败的或者之前没插成功的)
DELETE FROM monitor_handoff_log WHERE leaf_id IN (SELECT id FROM shelf_leaves WHERE leaf_name = 'Harnais pour voiture');
DELETE FROM monitor_handoff WHERE leaf_id IN (SELECT id FROM shelf_leaves WHERE leaf_name = 'Harnais pour voiture');
DELETE FROM shelf_leaves WHERE leaf_name = 'Harnais pour voiture';

-- 2. 给所有 "Animalerie > Chiens" 路径下加叶端 (不管几个品牌)
INSERT INTO shelf_leaves (cat_id, leaf_name, st, phase, path)
SELECT c.id, 'Harnais pour voiture', 'idle', 'h1', 'Animalerie > Chiens > Colliers, harnais et laisses > Harnais > Harnais pour voiture'
FROM shelf_cats c
JOIN shelf_groups g ON g.id = c.group_id
JOIN brands b ON b.code = g.brand_code
WHERE g.name = 'Animalerie' AND c.name = 'Chiens';

-- 3. 同步 h1 框 (开发进度可见)
INSERT INTO monitor_handoff (leaf_id, box_key, start_at)
SELECT id, 'h1', now() FROM shelf_leaves WHERE leaf_name = 'Harnais pour voiture'
ON CONFLICT (leaf_id) DO UPDATE SET box_key = 'h1', start_at = now();

-- 4. log 留历史 (不加 moved_by 列, schema 可能没有)
INSERT INTO monitor_handoff_log (leaf_id, from_box, to_box, moved_at)
SELECT id, NULL, 'h1', now() FROM shelf_leaves WHERE leaf_name = 'Harnais pour voiture';

-- 5. 校验
SELECT '叶端' AS tbl, b.code AS 品牌, g.name AS 大类, l.leaf_name, l.st, l.phase, l.path
FROM shelf_leaves l
JOIN shelf_cats c ON c.id = l.cat_id
JOIN shelf_groups g ON g.id = c.group_id
JOIN brands b ON b.code = g.brand_code
WHERE l.leaf_name = 'Harnais pour voiture';
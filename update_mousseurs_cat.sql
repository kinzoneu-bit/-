-- 1) 确认该类目是否存在
SELECT id, name, st, phase, group_id, parent_cat_id
FROM shelf_cats
WHERE name LIKE 'Mousseurs à lait automatiques%';

-- 2) 更新为在调研-立项
UPDATE shelf_cats SET st = 'idle', phase = 'planning'
WHERE name LIKE 'Mousseurs à lait automatiques%';

-- 3) 加入在调研-立项框
INSERT INTO monitor_handoff (cat_id, box_key, start_at)
SELECT id, 'h1', now()
FROM shelf_cats
WHERE name LIKE 'Mousseurs à lait automatiques%'
  AND NOT EXISTS (
    SELECT 1 FROM monitor_handoff WHERE cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Mousseurs à lait automatiques%' LIMIT 1
    )
  );

-- 4) 校验
SELECT c.name, c.st, c.phase, h.box_key, h.start_at
FROM shelf_cats c
LEFT JOIN monitor_handoff h ON h.cat_id = c.id
WHERE c.name LIKE 'Mousseurs à lait automatiques%';

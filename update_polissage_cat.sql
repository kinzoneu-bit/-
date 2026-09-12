-- 1) 确认该类目是否存在
SELECT id, name, st, phase, group_id, parent_cat_id
FROM shelf_cats
WHERE name LIKE 'Machines et accessoires de polissage%';

-- 2) 更新为在调研-立项
UPDATE shelf_cats SET st = 'idle', phase = 'planning'
WHERE name LIKE 'Machines et accessoires de polissage%';

-- 3) 加入在调研-立项框
INSERT INTO monitor_handoff (cat_id, box_key, start_at)
SELECT id, 'h1', now()
FROM shelf_cats
WHERE name LIKE 'Machines et accessoires de polissage%'
  AND NOT EXISTS (
    SELECT 1 FROM monitor_handoff WHERE cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Machines et accessoires de polissage%' LIMIT 1
    )
  );

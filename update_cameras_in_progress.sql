-- 1) Caméras d'inspection 状态改为在调研 (用 LIKE 避免引号问题)
UPDATE shelf_cats SET st = 'idle', phase = 'planning'
WHERE name LIKE 'Caméras d''inspection%';

-- 2) 同步入在调研-立项框
INSERT INTO monitor_handoff (cat_id, box_key, start_at)
SELECT id, 'h1', now()
FROM shelf_cats
WHERE name LIKE 'Caméras d''inspection%'
  AND NOT EXISTS (
    SELECT 1 FROM monitor_handoff WHERE cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Caméras d''inspection%' LIMIT 1
    )
  );

-- 3) 校验
SELECT c.name, c.st, c.phase, h.box_key, h.start_at
FROM shelf_cats c
LEFT JOIN monitor_handoff h ON h.cat_id = c.id
WHERE c.name LIKE 'Caméras d''inspection%';

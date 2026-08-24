-- 把 Caméras d'inspection 加进在调研-立项框 (h1)
INSERT INTO monitor_handoff (cat_id, box_key, start_at)
SELECT id, 'h1', now()
FROM shelf_cats
WHERE name LIKE 'Caméras d''inspection%'
  AND NOT EXISTS (
    SELECT 1 FROM monitor_handoff WHERE cat_id = (
      SELECT id FROM shelf_cats WHERE name LIKE 'Caméras d''inspection%' LIMIT 1
    )
  );

-- 校验
SELECT h.id, h.box_key, h.start_at, c.name AS cat_name, c.st, c.phase
FROM monitor_handoff h
JOIN shelf_cats c ON c.id = h.cat_id
WHERE c.name LIKE 'Caméras d''inspection%';

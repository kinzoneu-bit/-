-- 1) 加 cat_id 列 (可空)
ALTER TABLE monitor_handoff ADD COLUMN IF NOT EXISTS cat_id uuid;

-- 2) 把 Vêtements enfant bébé 加进 h1 框 (如果还没加)
INSERT INTO monitor_handoff (cat_id, box_key, start_at)
SELECT id, 'h1', now()
FROM shelf_cats
WHERE name = 'Vêtements enfant bébé 婴幼儿服装'
  AND NOT EXISTS (
    SELECT 1 FROM monitor_handoff WHERE cat_id = (
      SELECT id FROM shelf_cats WHERE name = 'Vêtements enfant bébé 婴幼儿服装' LIMIT 1
    )
  );

-- 3) 校验
SELECT h.id, h.cat_id, h.box_key, h.start_at, c.name AS cat_name, c.st, c.phase
FROM monitor_handoff h
JOIN shelf_cats c ON c.id = h.cat_id
WHERE c.name = 'Vêtements enfant bébé 婴幼儿服装';

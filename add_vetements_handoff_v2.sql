-- 1) 给 monitor_handoff 加 cat_id 列 (可空, 与 leaf_id 并存)
ALTER TABLE monitor_handoff ADD COLUMN IF NOT EXISTS cat_id uuid;

-- 2) 把 Vêtements enfant bébé 加进 h1 框
INSERT INTO monitor_handoff (cat_id, box_key, start_at)
SELECT id, 'h1', now()
FROM shelf_cats
WHERE name = 'Vêtements enfant bébé 婴幼儿服装'
ON CONFLICT (cat_id) DO UPDATE SET box_key = 'h1', start_at = now();

-- 把 Vêtements enfant bébé 加进 monitor_handoff 框 (h1 = 调研期间)
-- cat_id 改为 Vêtements enfant bébé 6 级 cat id
INSERT INTO monitor_handoff (cat_id, box_id, start_at)
SELECT id, 'h1', now()
FROM shelf_cats
WHERE name = 'Vêtements enfant bébé 婴幼儿服装'
ON CONFLICT (cat_id) DO UPDATE SET box_id = 'h1', start_at = now();

-- 校验
SELECT h.id, h.cat_id, h.box_id, h.start_at, c.name AS cat_name, c.st, c.phase
FROM monitor_handoff h
JOIN shelf_cats c ON c.id = h.cat_id
WHERE c.name = 'Vêtements enfant bébé 婴幼儿服装';

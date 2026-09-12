-- 加产品: 车载宠物屋 (挂在 Rehausseurs et sièges autos 下)
-- 2 个变体: 黑色大号 B0FRB61XRX / 黑色小号 (ASIN 待填)
INSERT INTO products (cat_id, name, st, variant_count, variants)
SELECT id, '车载宠物屋', 'idle', 2,
  '[
    {"color": "黑色", "size": "大号", "asin": "B0FRB61XRX"},
    {"color": "黑色", "size": "小号", "asin": null}
  ]'::jsonb
FROM shelf_cats
WHERE name = 'Rehausseurs et sièges autos 车载增高座椅和汽车座椅' AND parent_cat_id IS NOT NULL
LIMIT 1;

-- 校验
SELECT p.id, p.name, p.variant_count, p.variants, c.name AS 所属类目
FROM products p LEFT JOIN shelf_cats c ON c.id = p.cat_id
WHERE p.name = '车载宠物屋';

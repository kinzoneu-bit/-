-- ============================================================
-- 更新车载宠物屋 → 黑色小号 ASIN = B0HDP33MS1 (KK 2026-08-11)
-- 父链: ... > Rehausseurs et sièges autos 车载增高座椅和汽车座椅
--       > 产品"车载宠物屋" (2 个变体: 黑色大号 / 黑色小号)
-- 动作: variants 数组中 size='小号' 的元素 → asin = 'B0HDP33MS1'
-- ============================================================

-- 1) 校验查找: 看现状 (应返回 1 行, variants 有 2 个变体)
SELECT id, name, variants
FROM products
WHERE cat_id = (
    SELECT id FROM shelf_cats
    WHERE name LIKE 'Rehausseurs et sièges autos%'
    LIMIT 1
  )
  AND name LIKE '车载宠物屋%'
LIMIT 1;

-- 2) 更新: size='小号' 的变体 asin → B0HDP33MS1
WITH target AS (
  SELECT id FROM products
  WHERE cat_id = (
      SELECT id FROM shelf_cats
      WHERE name LIKE 'Rehausseurs et sièges autos%'
      LIMIT 1
    )
    AND name LIKE '车载宠物屋%'
  LIMIT 1
)
UPDATE products p
SET variants = (
  SELECT jsonb_agg(
    CASE WHEN v->>'size' = '小号'
         THEN jsonb_set(v, '{asin}', to_jsonb('B0HDP33MS1'::text))
         ELSE v END
  )
  FROM jsonb_array_elements(p.variants) AS v
)
FROM target t
WHERE p.id = t.id
RETURNING p.id, p.name, p.variants;

-- 3) 校验: 黑色小号 ASIN 应为 B0HDP33MS1
SELECT id, name, variants
FROM products
WHERE cat_id = (
    SELECT id FROM shelf_cats
    WHERE name LIKE 'Rehausseurs et sièges autos%'
    LIMIT 1
  )
  AND name LIKE '车载宠物屋%'
LIMIT 1;
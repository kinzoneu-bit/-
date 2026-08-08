-- =============================================================
-- products v2 · 2026-08-08 加 4 字段 (KK 货架模板)
--   spu           父体 SPU 编号 (多变体产品的母体)
--   variant_sizes jsonb 尺寸数组, 长度 = 变体数
--   variant_colors jsonb 颜色数组 [{name, hex}], 仅展示用
--   variant_count int 变体数 (= variant_sizes 长度)
-- =============================================================
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS spu text,
  ADD COLUMN IF NOT EXISTS variant_sizes jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS variant_colors jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS variant_count int DEFAULT 0;

-- 示例数据 (电子围栏类, KK 截图里的两个产品)
-- 橙黑: SPU B0HGJ26GQDF, 颜色 [橙黑, 黑色], 尺寸 [S, M, L]
-- 紫黑: SPU B0GHDF8FFB, 同上
UPDATE products SET
  spu = 'B0HGJ26GQDF',
  variant_colors = '[{"name":"橙黑","hex":"#d9a441"},{"name":"黑色","hex":"#1a1a1a"}]'::jsonb,
  variant_sizes = '["S","M","L"]'::jsonb,
  variant_count = 3
WHERE name = '电子围栏-橙黑';

UPDATE products SET
  spu = 'B0GHDF8FFB',
  variant_colors = '[{"name":"紫黑","hex":"#7b3aa3"},{"name":"黑色","hex":"#1a1a1a"}]'::jsonb,
  variant_sizes = '["S","M","L"]'::jsonb,
  variant_count = 3
WHERE name = '电子围栏-紫黑';

-- 自动同步: 已有 variant_sizes 但没 variant_count 的, 补齐
UPDATE products SET variant_count = jsonb_array_length(variant_sizes)
WHERE variant_sizes IS NOT NULL AND (variant_count IS NULL OR variant_count = 0);

-- =============================================================
-- products v3 · 2026-08-08 加变体数组 (KK 模板: 有变体则展开)
--   variants jsonb  每个变体含 {color, size, asin}
--   现有 variant_count = 3 表示 3 个变体, 数据用占位 ASIN
-- =============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS variants jsonb DEFAULT '[]'::jsonb;

-- 示例: 电子围栏橙黑 (颜色橙黑, 尺寸 S/M/L = 3 个变体)
UPDATE products SET variants = '[
  {"color":"橙黑","size":"S","asin":"B0HGJ26G-S"},
  {"color":"橙黑","size":"M","asin":"B0HGJ26G-M"},
  {"color":"橙黑","size":"L","asin":"B0HGJ26G-L"}
]'::jsonb WHERE name = '电子围栏-橙黑';

-- 示例: 电子围栏紫黑 (3 个变体)
UPDATE products SET variants = '[
  {"color":"紫黑","size":"S","asin":"B0GHDF8F-S"},
  {"color":"紫黑","size":"M","asin":"B0GHDF8F-M"},
  {"color":"紫黑","size":"L","asin":"B0GHDF8F-L"}
]'::jsonb WHERE name = '电子围栏-紫黑';

-- 校验
SELECT name, variants FROM products WHERE name LIKE '%电子围栏%';

-- =============================================================
-- 自动生成所有 leaf 的完整路径 (品牌 > 大类 > 二级 > 末端)
-- 配合前端 Shelf 在 leaf 行显示四级面包屑
-- =============================================================
UPDATE shelf_leaves l
SET path = b.full_name || ' › ' || g.name || ' › ' || c.name || ' › ' || l.leaf_name
FROM shelf_cats c, shelf_groups g, brands b
WHERE l.cat_id = c.id
  AND c.group_id = g.id
  AND g.brand_code = b.code
  AND (l.path IS NULL OR l.path = '');

-- 校验
SELECT l.leaf_name, l.path FROM shelf_leaves l LIMIT 10;
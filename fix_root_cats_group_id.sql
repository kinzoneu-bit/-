-- 通用修复: 把所有根 cat (parent_cat_id IS NULL) 的 group_id 自动填上
-- 逻辑: 根 cat 的 group_id 应是同 brand 下的 Auto et Moto / Cuisine et Maison 等同名大类
-- 对所有 group_id IS NULL 的根 cat, 用品牌其他根 cat 的 group_id 补上 (同 brand_code 任意一个 group_id)
UPDATE shelf_cats c
SET group_id = COALESCE(
  -- 优先: 同品牌下其他根 cat 的 group_id
  (SELECT g.id FROM shelf_groups g
   JOIN shelf_cats c2 ON c2.group_id = g.id
   WHERE c2.parent_cat_id IS NULL AND c2.group_id IS NOT NULL
     AND g.brand_code = (
       -- 通过 cat 路径里的根 cat 名字匹配 shelf_groups (按名字首词)
       SELECT g2.brand_code FROM shelf_groups g2
       JOIN shelf_cats c3 ON c3.group_id = g2.id
       WHERE c3.name LIKE split_part(c.name, ' ', 1) || '%'
         AND c3.parent_cat_id IS NULL
       LIMIT 1
     )
   LIMIT 1),
  -- fallback: 同 cat 名字前缀的任意 group
  (SELECT id FROM shelf_groups WHERE name LIKE split_part(c.name, ' ', 1) || '%' LIMIT 1)
)
WHERE c.parent_cat_id IS NULL AND c.group_id IS NULL;

-- 校验: 还有多少 group_id IS NULL 的根 cat
SELECT count(*) FROM shelf_cats WHERE parent_cat_id IS NULL AND group_id IS NULL;

-- 校验: Entretien voiture et moto 现在 group_id
SELECT id, name, group_id, parent_cat_id, st FROM shelf_cats WHERE name LIKE 'Entretien voiture et moto%';

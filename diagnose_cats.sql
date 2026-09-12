-- 1) Entretien voiture et moto 有几条记录? (可能有多品牌重复)
SELECT id, name, group_id, parent_cat_id, st
FROM shelf_cats WHERE name LIKE 'Entretien voiture et moto%';

-- 2) 所有 group_id IS NULL 的 cat (根因)
SELECT id, name, parent_cat_id, st FROM shelf_cats WHERE group_id IS NULL;

-- 3) Vercoryx 品牌的 Auto et Moto group (参考)
SELECT id, name, brand_code FROM shelf_groups WHERE name LIKE 'Auto et Moto%';

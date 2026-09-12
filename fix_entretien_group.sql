-- 1) 查 Entretien voiture et moto 现在的 group_id (NULL 就是 bug)
SELECT id, name, group_id, st, parent_cat_id
FROM shelf_cats
WHERE name LIKE 'Entretien voiture et moto%';

-- 2) 查 Auto et Moto 大类 group_id (作为参考, Entretien 应该和它同一个品牌)
SELECT id, name, group_id, parent_cat_id
FROM shelf_cats
WHERE name LIKE 'Auto et Moto%';

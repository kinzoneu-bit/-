-- 查 Entretien voiture et moto 下到底有哪些 cat (按名字 LIKE)
SELECT id, name, group_id, parent_cat_id, st
FROM shelf_cats
WHERE parent_cat_id = (
  SELECT id FROM shelf_cats 
  WHERE name LIKE 'Entretien voiture et moto%' AND parent_cat_id IS NULL LIMIT 1
);

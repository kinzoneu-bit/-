-- 1) 查 shelf_groups 里 Auto et Moto 大类对应的 group_id
SELECT id, name, brand_code FROM shelf_groups WHERE name LIKE 'Auto et Moto%';

-- 2) 把 Entretien voiture et moto 的 group_id 设成 Auto et Moto 同一个 group (来自 shelf_groups)
UPDATE shelf_cats SET group_id = (
  SELECT id FROM shelf_groups WHERE name LIKE 'Auto et Moto%' LIMIT 1
)
WHERE name LIKE 'Entretien voiture et moto%' AND group_id IS NULL;

-- 3) 校验 (Entretien voiture et moto 现在有 group_id)
SELECT id, name, group_id, parent_cat_id, st FROM shelf_cats WHERE name LIKE 'Entretien voiture et moto%';

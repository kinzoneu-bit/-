-- 检查 shelf_cats.phase 列是否存在
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'shelf_cats' AND column_name = 'phase';

-- 检查 Caméras 当前 phase
SELECT name, st, phase FROM shelf_cats WHERE name LIKE 'Caméras d''inspection%';

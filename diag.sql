DO $$
DECLARE
  v_cat UUID;
  v_leaf UUID;
BEGIN
  -- 1) 找 Vercoryx 下的 Outils de dépannage cat
  SELECT c.id INTO v_cat
  FROM shelf_cats c
  JOIN shelf_groups g ON c.group_id = g.id
  JOIN brands b ON g.brand_code = b.code
  WHERE b.code = 'Vercoryx' AND c.name LIKE '%Outils de dépannage%'
  LIMIT 1;
  RAISE NOTICE '步骤1 cat=%', v_cat;
  
  IF v_cat IS NULL THEN
    RAISE NOTICE 'cat 没找到, 查看实际 cat 名字';
    RETURN;
  END IF;
  
  -- 2) 找 leaf
  SELECT id INTO v_leaf FROM shelf_leaves WHERE cat_id = v_cat AND leaf_name = 'Chargeurs de batterie' LIMIT 1;
  RAISE NOTICE '步骤2 已存在 leaf=%', v_leaf;
  
  IF v_leaf IS NULL THEN
    INSERT INTO shelf_leaves (cat_id, leaf_name, path, st, sort_order)
    VALUES (v_cat, 'Chargeurs de batterie',
            'Auto et Moto › Outils de dépannage › Outils de batterie › Chargeurs de batterie',
            'selling', 99)
    RETURNING id INTO v_leaf;
    RAISE NOTICE '步骤2 leaf 已插入 id=%', v_leaf;
  END IF;
  
  -- 3) 插产品
  RAISE NOTICE '步骤3 准备插产品, v_leaf=%', v_leaf;
  IF NOT EXISTS (SELECT 1 FROM products WHERE leaf_id = v_leaf AND asin = 'B0HC9Z7KRY') THEN
    INSERT INTO products (leaf_id, name, st, asin, amazon_site, sort_order)
    VALUES (v_leaf, 'Chargeurs de batterie 01', 'selling', 'B0HC9Z7KRY', 'FR', 99);
    RAISE NOTICE '步骤3 产品已插入';
  ELSE
    RAISE NOTICE '步骤3 产品已存在';
  END IF;
END $$;

-- 给 shelf_cats 加 phase 字段 (调研细分阶段)
-- phase 值: 'planning'(立项) / 'pre_research'(前置调研) / 'supplier'(挖掘供应商) / 'spec'(定款)
ALTER TABLE shelf_cats ADD COLUMN IF NOT EXISTS phase text;
ALTER TABLE shelf_cats ADD CONSTRAINT shelf_cats_phase_check 
  CHECK (phase IS NULL OR phase IN ('planning', 'pre_research', 'supplier', 'spec'));

-- 1) 设置 Vêtements enfant bébé 为"在调研-挖掘供应商"
UPDATE shelf_cats 
SET st = 'idle', phase = 'supplier'
WHERE name = 'Vêtements enfant bébé 婴幼儿服装';

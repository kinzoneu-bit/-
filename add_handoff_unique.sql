-- monitor_handoff 加唯一约束 (防止拖拽变成复制)
-- leaf_id 唯一: 旧末端类目每项只能在一框
-- cat_id 唯一: 新类目每项只能在一框
ALTER TABLE monitor_handoff DROP CONSTRAINT IF EXISTS monitor_handoff_leaf_id_key;
DO $$
BEGIN
  -- 加 leaf_id 唯一约束 (如果还没有)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'monitor_handoff_leaf_id_unique'
  ) THEN
    ALTER TABLE monitor_handoff ADD CONSTRAINT monitor_handoff_leaf_id_unique UNIQUE (leaf_id);
  END IF;
  -- 加 cat_id 唯一约束
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'monitor_handoff_cat_id_unique'
  ) THEN
    ALTER TABLE monitor_handoff ADD CONSTRAINT monitor_handoff_cat_id_unique UNIQUE (cat_id);
  END IF;
END $$;

-- 清理已存在的重复 cat_id 记录 (保留最新 box_key 的)
DELETE FROM monitor_handoff a USING monitor_handoff b
WHERE a.cat_id = b.cat_id AND a.id < b.id;

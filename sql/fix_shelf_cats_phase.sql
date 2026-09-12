-- ============================================================
-- 修复: shelf_cats 表缺 phase 列 → 调研 4 阶段拖拽无效
-- 根因: 建表时只给 shelf_leaves 加了 phase, shelf_cats 没有
-- 前端 movePhase 拖类目时更新 shelf_cats.phase 报"列不存在"
-- ============================================================

ALTER TABLE shelf_cats ADD COLUMN IF NOT EXISTS phase text;

-- 校验: 应能看到 phase 列 (值可能全为 NULL, 正常)
SELECT id, name, st, phase FROM shelf_cats
WHERE st = 'idle' LIMIT 20;

-- 给 shelf_status enum 加 'ready' 值 (KK 2026-08-10)
-- shelf_status 是 shelf_cats / shelf_leaves / products 的 st 列 enum 类型
-- 之前只有 selling/idle/skip/researched_skip, 现在加 'ready' (还没动)
-- IF NOT EXISTS 防止重复加报错
ALTER TYPE shelf_status ADD VALUE IF NOT EXISTS 'ready';

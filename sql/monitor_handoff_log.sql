-- =============================================================
-- monitor_handoff_log · 交接历史 log (append-only)
-- 用于 h2/h3 时间统计分析: 历史停留时长
-- KK 在 Supabase SQL Editor 跑一次即可
-- =============================================================
CREATE TABLE IF NOT EXISTS monitor_handoff_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leaf_id         uuid NOT NULL,
  from_box        text,                       -- 来源框 (h1/h2/h3/h4), null = 首次进入
  to_box          text NOT NULL,              -- 目标框
  moved_at        timestamptz NOT NULL DEFAULT now(),
  moved_by_email  text,                       -- 操作人邮箱
  note            text                        -- 备注 (可选)
);

-- 索引: 按 leaf 拉取历史最快
CREATE INDEX IF NOT EXISTS idx_handoff_log_leaf  ON monitor_handoff_log (leaf_id, moved_at);
-- 索引: 按时间范围统计最快
CREATE INDEX IF NOT EXISTS idx_handoff_log_time  ON monitor_handoff_log (moved_at);

-- =============================================================
-- RLS (跟现有 monitor_handoff 保持一致: 登录可读, editor/admin 可写)
-- =============================================================
ALTER TABLE monitor_handoff_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "handoff_log_read"   ON monitor_handoff_log;
DROP POLICY IF EXISTS "handoff_log_insert" ON monitor_handoff_log;
CREATE POLICY "handoff_log_read"   ON monitor_handoff_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "handoff_log_insert" ON monitor_handoff_log FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- =============================================================
-- 回填现有数据 (可选): 把 monitor_handoff 当前每条作为一条 "初始进入" log
-- 这样即使以前没记, 也能算"当前停留时长"
-- =============================================================
INSERT INTO monitor_handoff_log (leaf_id, from_box, to_box, moved_at, moved_by_email, note)
SELECT leaf_id, NULL, box_key, start_at, 'system@backfill', 'backfill from monitor_handoff'
FROM monitor_handoff
WHERE NOT EXISTS (
  SELECT 1 FROM monitor_handoff_log l
  WHERE l.leaf_id = monitor_handoff.leaf_id AND l.to_box = monitor_handoff.box_key
);

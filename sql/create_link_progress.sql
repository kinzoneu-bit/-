-- ============================================================
-- 建 link_progress 表 + RLS 全开策略 (KK 2026-08-11)
-- 用途: 链接制作进度跟踪 (11 列, admin/fr/cd_link 可编辑)
-- 权限: 登录用户全可读写 (KK 原则: 交接拖拽除外其他全开)
-- ============================================================

-- 1) 建表 (幂等, 可重复跑)
CREATE TABLE IF NOT EXISTS public.link_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name   text NOT NULL,
  receive_date   date,
  sku            text,
  title          text,
  five_points    text,
  kit_image      text,
  a_plus         text,
  video          text,
  qa             text,
  fba_conversion text,
  deliver_date   date,
  created_by_email text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- 2) 启用 RLS
ALTER TABLE public.link_progress ENABLE ROW LEVEL SECURITY;

-- 3) 清掉旧策略 (防重复)
DROP POLICY IF EXISTS "lp_read"            ON public.link_progress;
DROP POLICY IF EXISTS "lp_insert"          ON public.link_progress;
DROP POLICY IF EXISTS "lp_update"          ON public.link_progress;
DROP POLICY IF EXISTS "lp_delete"          ON public.link_progress;
DROP POLICY IF EXISTS "lp_full_write"      ON public.link_progress;

-- 4) 登录用户全可读
CREATE POLICY "lp_read" ON public.link_progress FOR SELECT TO authenticated USING (true);

-- 5) 登录用户全可插入
CREATE POLICY "lp_insert" ON public.link_progress FOR INSERT TO authenticated WITH CHECK (true);

-- 6) 登录用户全可更新
CREATE POLICY "lp_update" ON public.link_progress FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 7) 登录用户全可删除
CREATE POLICY "lp_delete" ON public.link_progress FOR DELETE TO authenticated USING (true);

-- 8) 自动维护 updated_at
CREATE OR REPLACE FUNCTION public.tg_link_progress_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS link_progress_updated_at ON public.link_progress;
CREATE TRIGGER link_progress_updated_at
  BEFORE UPDATE ON public.link_progress
  FOR EACH ROW EXECUTE FUNCTION public.tg_link_progress_updated_at();

-- 9) 校验: 看表结构
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'link_progress' ORDER BY ordinal_position;
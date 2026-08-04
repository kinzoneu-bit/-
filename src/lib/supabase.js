import { createClient } from "@supabase/supabase-js";

// ↓↓↓ KK: 把这两行替换成你 Supabase 项目的真实值 ↓↓↓
// 在 Supabase Dashboard → Settings → API 里复制
const SUPABASE_URL = "https://hsyuopmmndpcabhegics.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_c8ceRjjLPXK1JmHU6lCKgg_ABaUaYjb";
// ↑↑↑ 替换完成后保存 ↑↑↑

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

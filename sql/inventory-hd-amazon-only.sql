-- 收窄角色(cd_procurement 黄丹)的库存可见范围: 仅亚马逊 + 飞鸟/野趣/屿阔三家
-- KK 2026-11-25 定: Cdiscount / ManoMano 数据一律不给黄丹看
-- 前置: 已有表 public.inventory、函数 public.is_cd_procurement()、策略 sc_inventory_store
-- 说明: SQL 通道拦截 drop policy, 故用 alter policy 原地改条件

alter policy sc_inventory_store on public.inventory
  using (
    (not is_cd_procurement())
    or (store = any (array['飞鸟'::text, '野趣'::text, '屿阔'::text]) and platform = 'amazon'::text)
  )
  with check (
    (not is_cd_procurement())
    or (store = any (array['飞鸟'::text, '野趣'::text, '屿阔'::text]) and platform = 'amazon'::text)
  );

-- 验收(以黄丹身份查询):
--   platform=amazon    -> 仅 3 家店铺行
--   platform=cdiscount -> 0 行
--   不带平台条件        -> 返回结果里 cdiscount 计数为 0

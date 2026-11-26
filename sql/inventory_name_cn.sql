-- CD 产品中文命名（KK 2026-11-26）
-- 主数据放在 inventory.name_cn：一条平台SKU = 一个中文名
-- 订单记录不再显示平台SKU/内部编码，只按 order_records.plat_sku 回查本字段显示中文名
-- 库存统计页同时显示「平台SKU + 中文名」，中文名可在库存页直接改

alter table public.inventory
  add column if not exists name_cn text;

comment on column public.inventory.name_cn is
  '平台产品中文命名（我们自己的叫法，唯一显示名）；订单记录按 plat_sku 回查此列，库存页展示并维护';

-- 已有 RLS 策略已允许 admin/cd_supplier/cd_promotion 更新 inventory 行，
-- 新增列自动继承行级策略，无需补策略。

select count(*) as total,
       count(name_cn) as named
from public.inventory
where platform = 'cdiscount';

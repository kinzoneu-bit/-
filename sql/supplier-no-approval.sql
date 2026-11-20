-- 供应商录入免审核 (KK 2026-11-20 定)
-- 新建供应商默认「合作中」, 不再需要 admin 审核转 active
alter table public.purchase_suppliers alter column status set default 'active';

comment on column public.purchase_suppliers.status is '合作状态 active 合作中 / disabled 停用，pending 为历史值不再作为新建默认（2026-11-20 起免审核）';

comment on column public.purchase_suppliers.approved_by is '历史审核人字段，2026-11-20 起免审核流程，仅保留备查';

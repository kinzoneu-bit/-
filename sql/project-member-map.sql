-- 项目 ↔ 人 归属映射（人力成本按项目分摊）
create table if not exists public.project_member_map (
  id             bigserial primary key,
  project        text not null,
  member_id      uuid not null,
  ratio          numeric(5,4) not null default 1.0,
  effective_from date not null default current_date,
  effective_to   date,
  note           text,
  created_at     timestamptz default now()
);

create unique index if not exists ux_pmm on public.project_member_map(project, member_id, effective_from);

create index if not exists idx_pmm_member on public.project_member_map(member_id);

comment on table public.project_member_map is '项目与成员归属映射，支持一人分摊多项目、按比例、按生效区间';

comment on column public.project_member_map.ratio is '该项目承担的比例 0~1，同一人同期多项目时各项目比例之和应等于 1';

comment on column public.project_member_map.effective_from is '生效起始日，含当日';

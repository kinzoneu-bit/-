-- ================================================================
-- ai schema · 追加视图：人工成本(按人分摊) + 现金账
-- 目标库: 西欧 hsyuopmmndpcabhegics
-- 用途: 给 Codex 做数据分析，补齐此前被刻意排除的两块
--   (1) ai.labor_by_person   —— 按人分摊的人工成本
--   (2) ai.cash_ledger       —— 现金账流水
--   (3) ai.cash_position     —— 现金账余额水位
--
-- 执行位置: Supabase → SQL Editor 整段粘贴，可重复跑(create or replace)
-- 安全: 全部只读视图，ai_reader 仅能 select，不含任何写操作
-- ================================================================

-- ---------- 1. 人工成本 · 按人分摊 ----------
-- project_member_map: project(项目) / member_id(人 uuid) / ratio(分摊比例)
-- 人名需 join user_profiles 取 display_name 或 email，缺名时回退 member_id 文本
create or replace view ai.labor_by_person as
select
  pmm.project,
  u.user_id,
  u.display_name as member_name,
  u.role,
  pmm.ratio,
  pmm.effective_from,
  pmm.effective_to
from public.project_member_map pmm
left join public.user_profiles u on u.user_id = pmm.member_id;

comment on view ai.labor_by_person is
  '按人分摊的项目归属: 一人可分摊多项目、按 ratio 比例、按生效区间。成员信息来自 user_profiles';

comment on column ai.labor_by_person.project        is '归属项目';
comment on column ai.labor_by_person.user_id        is '成员 user_id(唯一标识)';
comment on column ai.labor_by_person.member_name    is '成员显示名';
comment on column ai.labor_by_person.role           is '成员角色';
comment on column ai.labor_by_person.ratio          is '该项目承担比例 0~1，同一人同期多项目比例和应为 1';
comment on column ai.labor_by_person.effective_from is '生效起始日(含)';
comment on column ai.labor_by_person.effective_to   is '生效截止日(含)，null=至今';

-- 店铺月度人工汇总(按店/月，用于和项目分摊交叉验证)
create or replace view ai.labor_monthly as
select
  month,
  store,
  sum(amount) as labor_amount
from public.store_monthly_costs
where item = '人工'
group by month, store;

comment on view ai.labor_monthly is
  '店铺月度人工成本汇总(store_monthly_costs 中 item=人工，按店按月)。不含 __shared__ 三家共享分摊';

comment on column ai.labor_monthly.month        is '月份(取自然月首日)';
comment on column ai.labor_monthly.store        is '店铺(飞鸟/野趣/屿阔/俊业/乾霖/胤顺 或 __shared__)';
comment on column ai.labor_monthly.labor_amount is '该店该月人工合计(元)';

-- ---------- 2. 现金账流水 ----------
-- cash_entries: entry_date(日期) / direction(in|out) / category(分类) / amount_cny(人民币) / ref_note
create or replace view ai.cash_ledger as
select
  id,
  entry_date,
  direction,
  category,
  amount_cny,
  ref_note,
  ref_no,
  source_table,
  created_at
from public.cash_entries
order by entry_date desc, created_at desc;

comment on view ai.cash_ledger is
  '现金账流水明细。direction=in 流入 / out 流出；amount_cny 单位人民币元。source_table 为自动带出来源(采购/物流/办公室/店铺等)，manual 为手工录入';

comment on column ai.cash_ledger.id          is '流水唯一 id';
comment on column ai.cash_ledger.entry_date  is '入账日期';
comment on column ai.cash_ledger.direction   is '方向: in=流入 / out=流出';
comment on column ai.cash_ledger.category    is '分类(采购/物流/办公室费用/店铺费用/回款/人工/其他)';
comment on column ai.cash_ledger.amount_cny  is '金额(人民币元)';
comment on column ai.cash_ledger.ref_note    is '备注/关联说明';
comment on column ai.cash_ledger.ref_no      is '关联单号';
comment on column ai.cash_ledger.source_table is '来源表(auto=系统自动，null=手工)';
comment on column ai.cash_ledger.created_at  is '创建时间';

-- 现金余额水位(由 v_cash_position 摘取)
create or replace view ai.cash_position as
select
  capital,
  inflow_total,
  outflow_total,
  balance,
  entry_count,
  last_entry_date
from public.v_cash_position;

comment on view ai.cash_position is
  '现金账余额水位: 本金/累计流入/累计流出/当前余额/流水笔数/最后一笔日期';

comment on column ai.cash_position.capital         is '本金(初始注入)';
comment on column ai.cash_position.inflow_total    is '累计流入';
comment on column ai.cash_position.outflow_total   is '累计流出';
comment on column ai.cash_position.balance         is '当前余额 = 本金 + 流入 - 流出';
comment on column ai.cash_position.entry_count     is '流水笔数';
comment on column ai.cash_position.last_entry_date is '最后一笔日期';

-- ---------- 授权 ----------
grant select on ai.labor_by_person to ai_reader;
grant select on ai.labor_monthly  to ai_reader;
grant select on ai.cash_ledger    to ai_reader;
grant select on ai.cash_position  to ai_reader;

-- 发货记录 ←→ 采购单 关联（KK 2026-11-28）
-- 场景：一批发货 = 多张采购单各拿一部分凑成一批（多对多）
-- 每个产品行记自己的来源采购单 → 采购日/付款日随行带过去 → 准备周期 = 付款日 → 发货日
-- 已在 Management API 执行

-- 1) 发货记录：来源采购单（一批多产品时，每行各自不同）
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS purchase_id uuid REFERENCES public.purchase_records(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.shipments.purchase_id IS '来源采购单；采购日/付款日从该单自动带出（KK 2026-11-28）';

CREATE INDEX IF NOT EXISTS idx_shipments_purchase ON public.shipments(purchase_id);

-- 2) 库存：付款日期（准备周期 = 付款日 → 发货日）
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS pay_date date;

COMMENT ON COLUMN public.inventory.pay_date IS '付款日期，由来源采购单带出；准备周期 = pay_date → ship_date（KK 2026-11-28）';

-- 3) 采购批次分配：同一采购单同一批次同平台同店铺只允许一条（防重复提交）
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_batches_alloc
  ON public.purchase_batches(purchase_id, ship_batch, platform, store)
  WHERE ship_batch IS NOT NULL;

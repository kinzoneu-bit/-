-- ============================================================
-- 库存表 (inventory) · 每条已上架的发货记录一条 · KK 2026-09-09
-- 触发: 发货记录点「标记已上架」→ 自动写一条 (数量=qty-损耗, 日期=今天, 到仓价=landed_cost)
-- 表格格式: 17 列对齐 Excel (货发日期/仓库/批次/款式/ASIN/上架数量/库存数量/盈亏价
--   /采购时间/发货时间/准备周期/上架时间/物流周期/售完时间/销售周期/全局期次/全周次率)
-- ============================================================

-- 1) 发货记录加"已上架"标记列
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS listed boolean DEFAULT false;

-- 2) 建库存表 (shipment_id 唯一 → 每条发货只能上架一次, 重复点=更新)
CREATE TABLE IF NOT EXISTS inventory (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id   uuid UNIQUE REFERENCES shipments(id) ON DELETE CASCADE,
  store         text,
  ship_date     date,                 -- 货发日期 (复制自 shipments, 离线可用)
  ship_warehouse text,                -- 仓库 (复制自 shipments)
  ship_batch    text,                 -- 发货批次 (复制自 shipments)
  product_name  text,
  asin          text,
  listed_qty    integer,              -- 上架数量 = qty - 损耗
  stock_qty     integer,              -- 库存数量 = listed_qty − 已售 (暂无销售数据, 默认=listed_qty)
  landed_cost   numeric(12,2),        -- 盈亏价 (到仓价)
  listed_date   date,                 -- 上架日期 (标记当天)
  purchase_date date,                 -- 采购时间 (待补)
  sold_date     date,                 -- 售完时间 (待补销售数据)
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_store ON inventory (store);
CREATE INDEX IF NOT EXISTS idx_inventory_asin ON inventory (asin);
CREATE INDEX IF NOT EXISTS idx_inventory_date ON inventory (listed_date);

-- 3) 增量加列 (已建过老版 inventory 表也能用)
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS ship_date date;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS ship_warehouse text;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS ship_batch text;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS stock_qty integer;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS purchase_date date;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS sold_date date;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 默认库存数量=上架数量 (TRIGGER)
CREATE OR REPLACE FUNCTION inv_set_stock_qty()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock_qty IS NULL THEN
    NEW.stock_qty := NEW.listed_qty;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inv_stock ON inventory;
CREATE TRIGGER trg_inv_stock
  BEFORE INSERT OR UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION inv_set_stock_qty();

-- 4) RLS
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inv_read_all ON inventory;
DROP POLICY IF EXISTS inv_write_role ON inventory;

-- 读: 登录用户全可读
CREATE POLICY inv_read_all ON inventory FOR SELECT TO authenticated USING (true);

-- 写: 仅 admin / cd_promotion (成都推广) — 与 shipments 一致
CREATE POLICY inv_write_role ON inventory FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles up
                 WHERE up.user_id = auth.uid() AND up.role IN ('admin','cd_promotion')))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up
                      WHERE up.user_id = auth.uid() AND up.role IN ('admin','cd_promotion')));

-- 5) 校验: 看表结构
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'inventory' ORDER BY ordinal_position;

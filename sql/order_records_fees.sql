-- KK 2026-11-25：订单记录补两项成本列
--   service_fee = 订单级服务费（Cdiscount 的 Frais de traitement，订单接口自带金额，脚本自动摊到行）
--   fbc_fee     = FBC 配送费（订单接口不返回，只能从后台结算明细导入）
-- 毛利口径：到手€ = 去税收入 − 佣金 − 处理费 − 环保金 − FBC运费；毛利¥ = 到手€ × 7.2 − 到仓价¥
alter table order_records add column if not exists service_fee numeric(10,2);
alter table order_records add column if not exists fbc_fee     numeric(10,2);

comment on column order_records.service_fee is '订单级服务费 Frais de traitement（EUR，按行摊）';
comment on column order_records.fbc_fee     is 'FBC 配送费（EUR，后台结算明细导入，同步不覆盖）';

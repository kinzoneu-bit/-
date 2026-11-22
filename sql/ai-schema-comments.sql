-- ================================================================
-- ai schema · 口径注释
-- 作用: AI 通过 MCP 连上来时, 会把 COMMENT 一起读走
--       口径写在库里, 比在 prompt 里反复交代可靠
-- ================================================================

-- ---------- 1. store_pnl ----------
comment on view ai.store_pnl is '店铺月度损益(每行=一个自然月×一个店铺)。收入口径=店铺核算录入的订单净收入, 已扣平台佣金/FBA配送费/订单VAT, 不是销售额。店铺利润=收入-平台后台费用-店铺其他费用。净利=店铺利润-人工-场地-其他。办公室费用不在此视图, 见 project_pnl。单位统一 CNY。重要限制: 2026-10 及以后的月份收入尚未录入且人工只录了部分店铺, 用这些月份做结论前必须先确认数据是否已录齐。';
comment on column ai.store_pnl.month is '自然月首日, 如 2026-08-01 表示 2026 年 8 月';
comment on column ai.store_pnl.store is '店铺名, 取值固定六种: 飞鸟 野趣 屿阔 俊业 乾霖 胤顺。店铺指店铺本身, 不是品牌';
comment on column ai.store_pnl.revenue is '当月净收入(CNY), 已扣佣金/配送费/订单VAT。为 0 表示当月收入未录入, 不代表没有销售';
comment on column ai.store_pnl.platform_fee is '平台后台扣费合计(CNY), 含广告/仓储/弃置/月租/EPR/服务订阅/入库/优惠券/长期仓储/退货费。这些从卖家余额直接扣, 不属现金支出';
comment on column ai.store_pnl.store_other_cost is '店铺其他费用(CNY), 来自 store_other_expense 明细, 含美工/说明书/刷评/包装法/税务等';
comment on column ai.store_pnl.store_profit is '店铺利润(CNY) = 收入 - 平台后台扣费 - 店铺其他费用。这是第一层结果, 未扣人工场地';
comment on column ai.store_pnl.labor is '人工成本(CNY), 含社保公积金公司承担部分。飞鸟/野趣/屿阔三家的共享人工按 1/3 摊分到各店';
comment on column ai.store_pnl.site is '场地租金(CNY)。飞鸟/野趣/屿阔三家共享场地同样按 1/3 摊分';
comment on column ai.store_pnl.other_cost is '其他项(CNY), 来自店铺核算的其它条目, 目前基本为 0, 是历史遗留字段';
comment on column ai.store_pnl.net_profit is '店铺净利(CNY) = 店铺利润 - 人工 - 场地 - 其他。注意此列未扣办公室费用, 项目级净利见 project_pnl';

-- ---------- 2. project_pnl ----------
comment on view ai.project_pnl is '项目月度损益(每行=一个自然月, 六店合计)。这是三层漏斗的最终层。项目净利=店铺利润合计-人工-场地-其他-办公室费用。与东欧项目同一口径。重要限制: 收入为 0 的月份说明当月收入未录入, 净利为负是数据缺失导致, 不是真实亏损。';
comment on column ai.project_pnl.month is '自然月首日';
comment on column ai.project_pnl.revenue is '全店净收入合计(CNY)。为 0 表示当月未录入收入';
comment on column ai.project_pnl.platform_fee is '全店平台后台扣费合计(CNY)';
comment on column ai.project_pnl.store_other_cost is '全店店铺其他费用合计(CNY)';
comment on column ai.project_pnl.store_profit is '全店店铺利润合计(CNY)';
comment on column ai.project_pnl.labor is '全店人工合计(CNY), 已含三家共享部分的摊分';
comment on column ai.project_pnl.site is '全店场地合计(CNY)';
comment on column ai.project_pnl.other_cost is '全店其他项合计(CNY)';
comment on column ai.project_pnl.office_cost is '办公室费用(CNY), 来自 office_expense 明细, 含会计费/招待/差旅/设备租赁, 区分中国与法国两地区。不按店拆分';
comment on column ai.project_pnl.net_profit is '项目净利(CNY) = 店铺利润 - 人工 - 场地 - 其他 - 办公室费用';
comment on column ai.project_pnl.net_margin_pct is '项目净利率(%), 百分数如 46.34 表示 46.34%。收入为 0 时为空值';

-- ---------- 3. cashflow_monthly ----------
comment on view ai.cashflow_monthly is '月度现金流, 只统计真金白银往外付的钱, 不含亚马逊从卖家余额扣走的费用。period 是文本格式 YYYY-MM。四类核心流出: 采购/物流/办公室/店铺其他。人工场地是刚性支出但默认单列, 是否计入合计看使用者口径。物流已按批次去重, 不要再次去重。';
comment on column ai.cashflow_monthly.period is '月份, 文本格式 YYYY-MM, 如 2026-08';
comment on column ai.cashflow_monthly.purchase is '采购货款现金流出(CNY), 来自采购付款流水';
comment on column ai.cashflow_monthly.logistics is '物流现金流出(CNY) = 头程+杂费+关税+保险, 已按 ship_batch 去重。注意源表里这些是批次级字段, 同一批次多行存同一个值, 若直接从 shipments 按行求理会虚增 2 到 5 倍';
comment on column ai.cashflow_monthly.office is '办公室费用(CNY)';
comment on column ai.cashflow_monthly.store_other is '店铺其他费用(CNY)';
comment on column ai.cashflow_monthly.manual_out is '手工登记的其他现金支出(CNY)';
comment on column ai.cashflow_monthly.core_out is '核心流出合计(CNY) = 采购+物流+办公室+店铺其他+手工。这是最常用的现金口径';
comment on column ai.cashflow_monthly.labor is '人工工资现金流出(CNY)';
comment on column ai.cashflow_monthly.site is '场地租金现金流出(CNY)';
comment on column ai.cashflow_monthly.total_out is '全部流出(CNY) = 核心流出+人工+场地';
comment on column ai.cashflow_monthly.recovery is '平台回款(CNY), 目前回款体系尚未启用, 普遍为 0';
comment on column ai.cashflow_monthly.manual_in is '手工登记的现金流入(CNY)';
comment on column ai.cashflow_monthly.total_in is '流入合计(CNY)';
comment on column ai.cashflow_monthly.net_core is '净额(核心口径 CNY) = 流入 - 核心流出';
comment on column ai.cashflow_monthly.net_all is '净额(全口径 CNY) = 流入 - 全部流出';

-- ---------- 4. inventory_value ----------
comment on view ai.inventory_value is '当前库存快照(每行=一个店铺×一个产品)。只含有库存的行。这是时点值不是历史值, 库里没有库存历史表, 无法还原任意历史时点的库存。按店汇总请自行 group by store 求 stock_value 之和。';
comment on column ai.inventory_value.store is '店铺名, 六种固定取值。可能为空表示未归属';
comment on column ai.inventory_value.product_name is '产品名称(自由文本, 同一产品在不同批次可能写法略有差异)';
comment on column ai.inventory_value.asin is '亚马逊 ASIN, 可能为空';
comment on column ai.inventory_value.ship_batch is '来源发货批次号, 如 FBA15KRC9X6D';
comment on column ai.inventory_value.stock_qty is '当前在库件数';
comment on column ai.inventory_value.landed_cost is '到仓单价(CNY), 即每件摊完头程杂费关税后的成本。库存金额按此价计算';
comment on column ai.inventory_value.stock_value is '库存金额(CNY) = 在库件数 × 到仓单价';
comment on column ai.inventory_value.purchase_date is '采购日期, 用于计算库龄';
comment on column ai.inventory_value.age_days is '库龄(天) = 今天 - 采购日期。超过 90 天属于滞销信号';
comment on column ai.inventory_value.listed_qty is '已上架件数';
comment on column ai.inventory_value.loss_qty is '丢失或损坏件数';

-- ---------- 5. purchase_cost ----------
comment on view ai.purchase_cost is '采购单台账(每行=一张采购单的一个产品)。成本口径为到深圳仓单件成本, 不含头程。目前采购体系刚上线, 行数可能为 0 或很少, 分析采购价趋势前先确认数据量。';
comment on column ai.purchase_cost.po_no is '采购单号, 需求方提交时为空, 由下单人补齐';
comment on column ai.purchase_cost.order_date is '采购日期';
comment on column ai.purchase_cost.store is '采购归属店铺';
comment on column ai.purchase_cost.supplier is '供应商名称';
comment on column ai.purchase_cost.product_name is '产品名称';
comment on column ai.purchase_cost.sku is 'SKU';
comment on column ai.purchase_cost.asin is 'ASIN';
comment on column ai.purchase_cost.qty is '采购数量';
comment on column ai.purchase_cost.received_qty is '已收货数量';
comment on column ai.purchase_cost.unit_price is '采购单价(原币)';
comment on column ai.purchase_cost.goods_amount is '货款金额(原币) = 单价 × 数量';
comment on column ai.purchase_cost.freight is '国内运费(原币), 工厂到深圳仓, 整单一次性填写不按产品拆分';
comment on column ai.purchase_cost.tax_amount is '采购税费(原币), 通常为开票税点';
comment on column ai.purchase_cost.total_amount is '总额(原币) = 货款+运费+税费';
comment on column ai.purchase_cost.currency is '币种, 默认 CNY';
comment on column ai.purchase_cost.unit_cost is '到深圳仓单件成本(原币) = 总额 ÷ 采购数量。注意这是第一段成本, 不含国际头程';
comment on column ai.purchase_cost.receive_status is '收货状态, 系统自动计算: pending 未到 / partial 部分到 / received 已收齐 / discrepancy 有差异';
comment on column ai.purchase_cost.pay_status is '付款状态: unpaid 未付 / partial 部分付 / paid 已付清';
comment on column ai.purchase_cost.paid_amount is '已付金额(原币)';
comment on column ai.purchase_cost.arrive_date is '预计到货日期';

-- ---------- 6. shipment_batch ----------
comment on view ai.shipment_batch is '发货批次汇总(每行=一个批次, 如 FBA15KRC9X6D)。这是物流成本唯一正确的取数位置。关键: 源表中头程/杂费/关税/保险是批次级字段, 同一批次多个产品行都存着相同金额, 所以这里用 max 取一次而不是按行求和。做物流成本分析请用本视图, 不要直接用 shipments 表按行求和。';
comment on column ai.shipment_batch.ship_batch is '发货批次号(亚马逊货件号)';
comment on column ai.shipment_batch.store is '涉及店铺, 多店混批时为逗号分隔';
comment on column ai.shipment_batch.ship_date is '发货日期';
comment on column ai.shipment_batch.warehouse is '发货仓库';
comment on column ai.shipment_batch.provider is '物流商';
comment on column ai.shipment_batch.channel is '物流渠道';
comment on column ai.shipment_batch.freight is '国际头程运费(CNY), 整批一次';
comment on column ai.shipment_batch.misc_fee is '目的国杂费(CNY), 整批一次';
comment on column ai.shipment_batch.duty is '关税(CNY), 整批一次';
comment on column ai.shipment_batch.insurance_fee is '保险费(CNY), 整批一次';
comment on column ai.shipment_batch.sku_rows is '本批次包含的产品行数';
comment on column ai.shipment_batch.total_qty is '本批次发货总件数';
comment on column ai.shipment_batch.goods_value is '本批次货值合计(CNY), 这是行级字段所以可以求和';
comment on column ai.shipment_batch.avg_landed_cost is '本批次平均到仓单价(CNY), 仅作参考, 精确值请用 inventory_value';
comment on column ai.shipment_batch.freight_paid is '运费是否已付, 由财务或采购确认';

-- ---------- 7. platform_fee ----------
comment on view ai.platform_fee is '平台后台费用明细(每行=月×店×站点×科目)。这些费用由亚马逊从卖家账户余额直接扣除, 不是现金流出, 做现金流时不要计入。做利润表时它们已包含在 store_pnl.platform_fee 里, 不要重复扣。';
comment on column ai.platform_fee.month is '自然月首日';
comment on column ai.platform_fee.store is '店铺名';
comment on column ai.platform_fee.site is '亚马逊站点代码, 如 FR DE UK';
comment on column ai.platform_fee.category is '费用科目, 现有十种: 仓储 广告 弃置费用 服务订阅 店铺月租 长期仓储 生产者延伸费 亚马逊物流客户退货费 优惠券 入库费用。注意此表不含平台佣金和FBA配送费, 那两项已在订单净收入里扣掉';
comment on column ai.platform_fee.amount is '该科目当月金额(CNY)';
comment on column ai.platform_fee.entries is '该科目当月记账条数';

-- ---------- 8. shelf_progress ----------
comment on view ai.shelf_progress is '品类开发进度(每行=一个类目节点)。类目是自嵌套树, depth 表示层级: 1=大类 2到4=子类目 5=叶端。同一行可能出现在多个层级, 因为父类目也会列出。统计叶子数请按 depth 最大值或者看 product_count 大于 0 的行。';
comment on column ai.shelf_progress.brand_code is '品牌代码';
comment on column ai.shelf_progress.group_name is '产品组名称';
comment on column ai.shelf_progress.cat_path is '类目完整路径, 用斜杠分隔从大类到当前节点';
comment on column ai.shelf_progress.depth is '层级深度, 1 为最顶层大类, 越深越具体';
comment on column ai.shelf_progress.status is '类目状态, 四种取值: selling 在售 / ready 还没动 / idle 在调研 / researched_skip 研究后放弃';
comment on column ai.shelf_progress.product_count is '该节点下直接挂的产品数';
comment on column ai.shelf_progress.selling_count is '该节点下处于在售状态的产品数';

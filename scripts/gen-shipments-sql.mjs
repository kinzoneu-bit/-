import XLSX from "xlsx";
// 解析 Excel → 输出 INSERT SQL (合并单元格继承 + 日期转换)
const wb = XLSX.readFile("C:\\Users\\c\\Desktop\\发货记录-3.2至7.21.xlsx");
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

function toDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 30000) { const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return d.toISOString().slice(0, 10); }
  if (typeof v === "number") { const m = Math.floor(v), d = Math.round((v - m) * 100); return `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
  const s = String(v).trim();
  const m1 = s.match(/(\d{1,2})[\.\/-](\d{1,2})/);
  if (m1) return `2026-${String(parseInt(m1[1], 10)).padStart(2, "0")}-${String(parseInt(m1[2], 10)).padStart(2, "0")}`;
  const m2 = s.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, "0")}-${m2[3].padStart(2, "0")}`;
  return s;
}
const q = v => v == null || String(v).trim() === "" ? "NULL" : `'${String(v).replace(/\s+/g, " ").trim().replace(/'/g, "''")}'`;
const n = v => { const s = String(v == null ? "" : v).trim(); if (!s) return "NULL"; const x = Number(s); return isNaN(x) ? "NULL" : x; };

const H = rows[0];
const idx = {};
H.forEach((h, i) => { idx[h] = i; });

let prev = { ship_date: null, ship_warehouse: null, ship_batch: null };
console.log(`-- 飞鸟发货记录 ${rows.length - 1} 行 (源: 发货记录-3.2至7.21.xlsx)`);
let lastKey = "";  // 同批次合并: 仅第一行写仓库/批次
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.every(c => String(c).trim() === "")) continue;
  const g = (k) => r[idx[k]];
  let ship_date = g("发货日期");
  let warehouse = g("发货仓库");
  let batch = g("发货批次");
  if (ship_date === "" || ship_date == null) ship_date = prev.ship_date; else prev.ship_date = ship_date;
  if (warehouse === "" || warehouse == null) warehouse = prev.ship_warehouse; else prev.ship_warehouse = warehouse;
  if (batch === "" || batch == null) batch = prev.ship_batch; else prev.ship_batch = batch;
  const name = g("名称"), asin = g("asin");
  // 同批次合并: 仅第一次出现该 (date+warehouse+batch) 的行写仓库/批次, 其后行 NULL
  const curKey = `${ship_date}|${warehouse}|${batch}`;
  let outWarehouse, outBatch;
  if (curKey !== lastKey) {
    lastKey = curKey;
    outWarehouse = warehouse;
    outBatch = batch;
  } else {
    outWarehouse = null;
    outBatch = null;
  }
  console.log(`INSERT INTO shipments (store, ship_date, ship_warehouse, ship_batch, product_name, asin, qty, purchase_price, goods_value, total_value, freight, misc_fee, duty, insurance_fee, share_fee, landed_cost, logistics_provider, channel, unit_price, last_mile_no, listed_date, listed_qty, loss_qty, compensation_eur, loss_amount, insurance_no, insured_amount) VALUES`);
  console.log(`('飞鸟', '${toDate(ship_date)}', ${q(outWarehouse)}, ${q(outBatch)}, ${q(name)}, ${q(asin)}, ${n(g("数量"))}, ${n(g("采购价"))}, ${n(g("货值"))}, ${n(g("总值"))}, ${n(g("头程"))}, ${n(g("杂费"))}, ${n(g("关税"))}, ${n(g("保险费用"))}, ${n(g("分摊费用"))}, ${n(g("到仓价格"))}, ${q(g("物流商"))}, ${q(g("渠道"))}, ${n(g("单价"))}, ${q(g("尾程单号"))}, ${g("上架日期") ? `'${toDate(g("上架日期"))}'` : "NULL"}, ${n(g("上架数量"))}, ${n(g("损耗"))}, ${n(g("赔付（欧/个）"))}, ${n(g("亏损"))}, ${q(g("保险单号"))}, ${n(g("投保金额"))});`);
}
console.log(`\n-- 共 8 条 (第9行为空行已跳过; 同批次只有第一行写仓库/批次, 其余行留空)`);

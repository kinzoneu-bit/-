import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import os from "os";

// =============================================================
// 发货记录导入 · Excel → shipments (v2, 按 KK Excel 26 列)
// 用法: node scripts/import-shipments.mjs <Excel文件路径> --store=飞鸟 [--email= --password=]
// 配置: ~/.kinzon-ops/config.json (KK 账号, RLS admin-only)
// 表头: 发货日期/发货仓库/发货批次/名称/asin/数量/采购价/货值/总值/头程/杂费/关税/
//        保险费用/分摊费用/到仓价格/物流商/渠道/单价/尾程单号/上架日期/上架数量/损耗/
//        赔付（欧/个）/亏损/保险单号/投保金额
// 特性: 空日期/仓库/批次继承上一行 (合并单元格); 3.2 转 2026-03-02; 序列号转日期
// =============================================================

const CONFIG_PATH = path.join(os.homedir(), ".kinzon-ops", "config.json");
let cfg = { url: "https://hsyuopmmndpcabhegics.supabase.co", anonKey: "sb_publishable_c8ceRjjLPXK1JmHU6lCKgg_ABaUaYjb" };
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) }; } catch (e) {}

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
let store = null;
for (const a of args) {
  if (a.startsWith("--store=")) store = a.slice(8);
  if (a.startsWith("--email=")) cfg.email = a.slice(8);
  if (a.startsWith("--password=")) cfg.password = a.slice(11);
}
if (!file) { console.error("用法: node scripts/import-shipments.mjs <Excel> --store=飞鸟"); process.exit(1); }
if (!store) { console.error("缺少 --store=店铺名"); process.exit(1); }
if (!cfg.email || !cfg.password) { console.error("未配置账号 (~/.kinzon-ops/config.json)"); process.exit(1); }

// 表头映射 (中英文兼容)
const COL = {
  ship_date:    ["发货日期", "ship_date", "date"],
  ship_warehouse: ["发货仓库", "ship_warehouse", "仓库"],
  ship_batch:   ["发货批次", "ship_batch", "批次"],
  product_name: ["名称", "product_name", "产品", "产品名"],
  asin:         ["asin", "ASIN"],
  qty:          ["数量", "qty", "数量(采购)", "采购数量"],
  purchase_price: ["采购价", "purchase_price", "采购单价", "成本"],
  goods_value:  ["货值", "goods_value"],
  total_value:  ["总值", "total_value"],
  freight:      ["头程", "freight", "头程费"],
  misc_fee:     ["杂费", "misc_fee"],
  duty:         ["关税", "duty"],
  insurance_fee: ["保险费用", "insurance_fee", "保险费"],
  share_fee:    ["分摊费用", "share_fee", "分摊费"],
  landed_cost:  ["到仓价格", "landed_cost", "到仓价"],
  logistics_provider: ["物流商", "logistics_provider"],
  channel:      ["渠道", "channel"],
  unit_price:   ["单价", "unit_price", "售价"],
  last_mile_no: ["尾程单号", "last_mile_no", "尾程"],
  listed_date:  ["上架日期", "listed_date"],
  listed_qty:   ["上架数量", "listed_qty"],
  loss_qty:     ["损耗", "loss_qty"],
  compensation_eur: ["赔付", "compensation_eur"],
  loss_amount:  ["亏损", "loss_amount"],
  insurance_no: ["保险单号", "insurance_no"],
  insured_amount: ["投保金额", "insured_amount"],
};
function norm(v) { if (v == null) return ""; return String(v).trim().toLowerCase().replace(/[_\-\s（）()]+/g, ""); }
function findHeader(row) {
  const map = {};
  row.forEach((cell, i) => {
    const key = norm(cell);
    if (!key) return;
    for (const [std, alts] of Object.entries(COL)) {
      if (alts.some(a => norm(a) === key)) { map[std] = i; break; }
    }
  });
  return map;
}
// 3.2 → 2026-03-02; 6.26 → 2026-06-26; 文本/序列号兼容
function toShipDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 30000) { const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return d.toISOString().slice(0, 10); }
  if (typeof v === "number") { // 3.2 = 3月2日
    const m = Math.floor(v), d = Math.round((v - m) * 100);
    return `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const m1 = s.match(/(\d{1,2})[\.\/-](\d{1,2})/);
  if (m1) { const mm = parseInt(m1[1], 10), dd = parseInt(m1[2], 10); return `2026-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`; }
  const m2 = s.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, "0")}-${m2[3].padStart(2, "0")}`;
  return s;
}
function num(v) { const n = Number(v); return isNaN(n) ? null : n; }

const supabase = createClient(cfg.url, cfg.anonKey);
const { error: loginErr } = await supabase.auth.signInWithPassword({ email: cfg.email, password: cfg.password });
if (loginErr) { console.error("登录失败:", loginErr.message); process.exit(1); }
console.error(`[ok] 已登录 ${cfg.email}`);

const wb = XLSX.readFile(file);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
if (rows.length < 2) { console.error("Excel 为空或只有表头"); process.exit(1); }

const header = findHeader(rows[0]);
const missing = ["ship_date", "product_name", "qty"].filter(c => header[c] === undefined);
if (missing.length) {
  console.error(`表头缺少列: ${missing.join(", ")}`);
  console.error(`识别表头: ${JSON.stringify(Object.fromEntries(Object.entries(header).map(([k, v]) => [k, rows[0][v]])))}`);
  process.exit(1);
}

// 合并单元格继承: 日期/仓库/批次为空 → 继承上一行
let prev = { ship_date: null, ship_warehouse: null, ship_batch: null };
let inserted = 0, skipped = 0;
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.every(c => String(c).trim() === "")) continue;
  const get = (k) => r[header[k]];
  const cell = (k, inherit = false) => {
    const v = get(k);
    const s = String(v == null ? "" : v).trim();
    if (!s && inherit) return prev[k];
    return v;
  };
  const ship_date = toShipDate(cell("ship_date", true));
  const product_name = String(cell("product_name") || "").trim();
  const qty = num(cell("qty")) || 0;
  if (!product_name || !qty) { skipped++; console.error(`[跳过] 第 ${i + 1} 行: 缺名称或数量 (${product_name}/${qty})`); continue; }
  prev = {
    ship_date: ship_date || prev.ship_date,
    ship_warehouse: cell("ship_warehouse", true) || prev.ship_warehouse,
    ship_batch: cell("ship_batch", true) || prev.ship_batch,
  };
  const rec = {
    store,
    ship_date: prev.ship_date,
    ship_warehouse: prev.ship_warehouse ? String(prev.ship_warehouse).trim() || null : null,
    ship_batch: prev.ship_batch ? String(prev.ship_batch).trim() || null : null,
    product_name,
    asin: get("asin") ? String(get("asin")).trim() || null : null,
    qty,
    purchase_price: num(get("purchase_price")),
    goods_value: num(get("goods_value")),
    total_value: num(get("total_value")),
    freight: num(get("freight")),
    misc_fee: num(get("misc_fee")),
    duty: num(get("duty")),
    insurance_fee: num(get("insurance_fee")),
    share_fee: num(get("share_fee")),
    landed_cost: num(get("landed_cost")),
    logistics_provider: get("logistics_provider") ? String(get("logistics_provider")).trim() || null : null,
    channel: get("channel") ? String(get("channel")).trim() || null : null,
    unit_price: num(get("unit_price")),
    last_mile_no: get("last_mile_no") ? String(get("last_mile_no")).trim() || null : null,
    listed_date: get("listed_date") ? toShipDate(get("listed_date")) : null,
    listed_qty: num(get("listed_qty")),
    loss_qty: num(get("loss_qty")),
    compensation_eur: num(get("compensation_eur")),
    loss_amount: num(get("loss_amount")),
    insurance_no: get("insurance_no") ? String(get("insurance_no")).trim() || null : null,
    insured_amount: num(get("insured_amount")),
  };
  const { error } = await supabase.from("shipments").insert(rec);
  if (error) { console.error(`[失败] ${product_name}: ${error.message}`); skipped++; continue; }
  console.log(`[ok] ${rec.ship_date} · ${product_name} · ${qty}个 · 到仓€${rec.landed_cost ?? "—"}`);
  inserted++;
}

console.log(`\n======== 导入完成 ========`);
console.log(`店铺=${store} · 成功 ${inserted} · 跳过 ${skipped}`);

import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import os from "os";

// =============================================================
// 财务数据导入 · Excel → finance_daily_sales
// 用法: node scripts/import-sales.mjs <Excel文件路径> [--email= --password=]
// 配置: ~/.kinzon-ops/config.json (用 KK 自己的账号, RLS 要求 admin 才能写)
// 表头匹配(中英文兼容): 日期/店铺/站点/ASIN/产品名/订单量/营业额
// =============================================================

const CONFIG_PATH = path.join(os.homedir(), ".kinzon-ops", "config.json");
let cfg = { url: "https://hsyuopmmndpcabhegics.supabase.co", anonKey: "sb_publishable_c8ceRjjLPXK1JmHU6lCKgg_ABaUaYjb" };
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) }; } catch (e) {}

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
for (const a of args) {
  if (a.startsWith("--email=")) cfg.email = a.slice(8);
  if (a.startsWith("--password=")) cfg.password = a.slice(11);
}

if (!file) { console.error("用法: node scripts/import-sales.mjs <Excel文件路径>"); process.exit(1); }
if (!cfg.email || !cfg.password) { console.error("错误: 未配置账号 (~/.kinzon-ops/config.json)"); process.exit(1); }

// 表头映射: 标准列名 ← 可能出现的表头
const COL = {
  sale_date:    ["sale_date", "日期", "date", "销售日期", "订单日期"],
  store:        ["store", "店铺", "品牌"],
  site:         ["site", "站点", "市场"],
  asin:         ["asin", "ASIN", "商品编码"],
  product_name: ["product_name", "产品名", "产品名称", "商品名称", "标题"],
  order_qty:    ["order_qty", "订单量", "订单数", "单量", "销量"],
  revenue:      ["revenue", "营业额", "销售额", "销售金额", "GMV"],
};

function norm(v) {
  if (v == null) return "";
  return String(v).trim().toLowerCase().replace(/[_\-\s]+/g, "");
}
function findHeader(row) {
  const map = {};
  row.forEach((cell, i) => {
    const key = String(cell || "").trim().toLowerCase().replace(/[_\-\s]+/g, "");
    if (!key) return;
    for (const [std, alts] of Object.entries(COL)) {
      if (alts.some(a => norm(a) === key)) { map[std] = i; break; }
    }
  });
  return map;
}
function toDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel 序列号 → Date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return s;
}

const supabase = createClient(cfg.url, cfg.anonKey);
const { error: loginErr } = await supabase.auth.signInWithPassword({ email: cfg.email, password: cfg.password });
if (loginErr) { console.error("登录失败:", loginErr.message); process.exit(1); }
console.error(`[ok] 已登录 ${cfg.email}`);

// 读 Excel
const wb = XLSX.readFile(file);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
if (rows.length < 2) { console.error("Excel 为空或只有表头"); process.exit(1); }

const header = findHeader(rows[0]);
const missing = ["sale_date", "store", "site", "asin", "order_qty", "revenue"].filter(c => header[c] === undefined);
if (missing.length) {
  console.error(`表头缺少列: ${missing.join(", ")}`);
  console.error(`识别的表头: ${JSON.stringify(Object.fromEntries(Object.entries(header).map(([k, v]) => [k, rows[0][v]])))}`);
  process.exit(1);
}

let inserted = 0, updated = 0, skipped = 0;
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.every(c => String(c).trim() === "")) continue; // 空行
  const sale_date = toDate(r[header.sale_date]);
  const store = String(r[header.store]).trim();
  const site = String(r[header.site]).trim().toUpperCase();
  const asin = String(r[header.asin]).trim().toUpperCase();
  const order_qty = Math.round(Number(r[header.order_qty]) || 0);
  const revenue = Number(r[header.revenue]) || 0;
  const product_name = header.product_name !== undefined ? String(r[header.product_name]).trim() || null : null;
  if (!sale_date || !store || !site || !asin) { skipped++; console.error(`[跳过] 第 ${i + 1} 行数据不完整: 日期=${sale_date} 店铺=${store} 站点=${site} ASIN=${asin}`); continue; }
  const { error, count } = await supabase.from("finance_daily_sales").upsert(
    { sale_date, store, site, asin, product_name, order_qty, revenue },
    { onConflict: "sale_date,store,site,asin" }
  ).select("id");
  if (error) { console.error(`[失败] 第 ${i + 1} 行 ${asin}@${sale_date}: ${error.message}`); skipped++; continue; }
  if (count && count > 0) inserted++; else updated++;
}

console.log(`\n======== 导入完成 ========`);
console.log(`文件: ${file}`);
console.log(`共 ${inserted + updated + skipped} 行 · 新增 ${inserted} · 更新 ${updated} · 跳过 ${skipped}`);

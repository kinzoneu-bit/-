import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import os from "os";

// =============================================================
// 滞销库存导出 · inventory → 表龄超 N 天且仍有库存的明细
// 用法: node scripts/export-slow-stock.mjs [--days=90] [--out=目录]
// 口径: 当前库存( stock_qty ?? listed_qty ) > 0
//       且 上架天数(今天-上架日期) > N ; 没有上架日期的用 在仓天数(今天-发货日期) > N
// 输出: 滞销库存_超N天_YYYYMMDD.xlsx (明细 + 按店铺汇总)  + 同名 .md
// 配置: ~/.kinzon-ops/config.json
// =============================================================

const CONFIG_PATH = path.join(os.homedir(), ".kinzon-ops", "config.json");
let cfg = { url: "https://hsyuopmmndpcabhegics.supabase.co", anonKey: "sb_publishable_c8ceRjjLPXK1JmHU6lCKgg_ABaUaYjb" };
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) }; } catch (e) { console.error("缺少配置 " + CONFIG_PATH); process.exit(1); }

const args = process.argv.slice(2);
let days = 90, outDir = null;
for (const a of args) {
  if (a.startsWith("--days=")) days = Number(a.slice(7)) || 90;
  if (a.startsWith("--out=")) outDir = a.slice(6);
}
const today = new Date(); today.setHours(0, 0, 0, 0);
const dayDiff = (d) => {
  if (!d) return null;
  const t = new Date(d); if (isNaN(t)) return null;
  t.setHours(0, 0, 0, 0);
  return Math.round((today - t) / 86400000);
};

const sb = createClient(cfg.url, cfg.anonKey);
const { error: aerr } = await sb.auth.signInWithPassword({ email: cfg.email, password: cfg.password });
if (aerr) { console.error("登录失败: " + aerr.message); process.exit(1); }

const { data, error } = await sb.from("inventory").select("*").limit(5000);
if (error) { console.error("读取失败: " + error.message); process.exit(1); }
const all = data || [];
console.log(`inventory 共 ${all.length} 条`);

const stockOf = (r) => Number(r.stock_qty ?? r.listed_qty ?? 0);
const rows = all.map(r => {
  const stock = stockOf(r);
  const dShip = dayDiff(r.ship_date);
  const dList = dayDiff(r.listed_date);
  const dSold = dayDiff(r.sold_date);
  const anchor = (dList !== null && dList !== undefined) ? "上架" : "发货";
  const ageDays = (dList !== null && dList !== undefined) ? dList : dShip;
  return { ...r, __stock: stock, __dShip: dShip, __dList: dList, __dSold: dSold, __anchor: anchor, __age: ageDays };
});

const slow = rows
  .filter(r => r.__stock > 0 && r.__age !== null && r.__age > days)
  .sort((a, b) => (b.__age || 0) - (a.__age || 0));

console.log(`库存>0 共 ${rows.filter(r => r.__stock > 0).length} 条 · 其中${days}天以上 ${slow.length} 条`);

const COLS = [
  ["店铺", r => r.store || ""],
  ["仓库", r => r.ship_warehouse || ""],
  ["发货批次", r => r.ship_batch || ""],
  ["款式", r => r.product_name || ""],
  ["ASIN", r => r.asin || ""],
  ["货发日期", r => r.ship_date || ""],
  ["上架日期", r => r.listed_date || ""],
  [`在仓天数`, r => r.__dShip ?? ""],
  ["上架天数", r => r.__dList ?? ""],
  ["口径", r => r.__anchor],
  [`超龄天数`, r => r.__age ?? ""],
  ["上架数量", r => r.listed_qty ?? ""],
  ["当前库存", r => r.__stock],
  ["盈亏价", r => r.landed_cost ?? ""],
  ["库存金额", r => r.__stock && r.landed_cost ? Math.round(r.__stock * Number(r.landed_cost) * 100) / 100 : ""],
  ["售完时间", r => r.sold_date || ""],
];

const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
const base = `滞销库存_超${days}天_${stamp}`;
const out = outDir || process.cwd();
if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });

// ---- Excel ----
const sheetRows = slow.map(r => { const o = {}; COLS.forEach(([l, f]) => o[l] = f(r)); return o; });
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), `超${days}天明细`);

// 按店铺汇总
const byStore = {};
slow.forEach(r => {
  const k = r.store || "(未填店铺)";
  byStore[k] = byStore[k] || { 店铺: k, 条数: 0, 库存件数: 0, 库存金额: 0, 最长天数: 0 };
  byStore[k].条数++;
  byStore[k].库存件数 += r.__stock;
  byStore[k].库存金额 += r.__stock * Number(r.landed_cost || 0);
  byStore[k].最长天数 = Math.max(byStore[k].最长天数, r.__age || 0);
});
const sumRows = Object.values(byStore).map(v => ({ ...v, 库存金额: Math.round(v.库存金额 * 100) / 100 })).sort((a, b) => b.库存金额 - a.库存金额);
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sumRows), "按店铺汇总");
// 按款式汇总
const byStyle = {};
slow.forEach(r => {
  const k = `${r.product_name || "(无款式)"} | ${r.asin || ""}`;
  byStyle[k] = byStyle[k] || { 款式: r.product_name || "", ASIN: r.asin || "", 批次数: 0, 库存件数: 0, 库存金额: 0, 最长天数: 0 };
  byStyle[k].批次数++;
  byStyle[k].库存件数 += r.__stock;
  byStyle[k].库存金额 += r.__stock * Number(r.landed_cost || 0);
  byStyle[k].最长天数 = Math.max(byStyle[k].最长天数, r.__age || 0);
});
const styleRows = Object.values(byStyle).map(v => ({ ...v, 库存金额: Math.round(v.库存金额 * 100) / 100 })).sort((a, b) => b.库存金额 - a.库存金额);
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(styleRows), "按款式汇总");
const xlsxPath = path.join(out, base + ".xlsx");
XLSX.writeFile(wb, xlsxPath);

// ---- Markdown ----
const totalStock = slow.reduce((s, r) => s + r.__stock, 0);
const totalAmount = slow.reduce((s, r) => s + r.__stock * Number(r.landed_cost || 0), 0);
let md = `# 滞销库存明细（库存 > 0 且超过 ${days} 天）\n\n`;
md += `- 生成时间：${today.toISOString().slice(0, 10)}\n`;
md += `- 筛选口径：当前库存 > 0，且「上架天数 > ${days}」（无上架日期的按「在仓天数 > ${days}」）\n`;
md += `- 命中：**${slow.length} 条** · 库存 **${totalStock} 件** · 占用金额 **¥${totalAmount.toFixed(2)}**\n\n`;
md += `## 按店铺\n\n| 店铺 | 条数 | 库存件数 | 占用金额 ¥ | 最长天数 |\n|---|---:|---:|---:|---:|\n`;
sumRows.forEach(v => { md += `| ${v.店铺} | ${v.条数} | ${v.库存件数} | ${v.库存金额.toFixed(2)} | ${v.最长天数} |\n`; });
md += `\n## 按款式\n\n| 款式 | ASIN | 批次数 | 库存件数 | 占用金额 ¥ | 最长天数 |\n|---|---|---:|---:|---:|---:|\n`;
styleRows.forEach(v => { md += `| ${v.款式} | ${v.ASIN} | ${v.批次数} | ${v.库存件数} | ${v.库存金额.toFixed(2)} | ${v.最长天数} |\n`; });
md += `\n## 明细（按超龄天数倒序）\n\n| 店铺 | 仓库 | 批次 | 款式 | ASIN | 货发日期 | 上架日期 | 在仓天数 | 上架天数 | 口径 | 超龄天数 | 上架数量 | 当前库存 | 盈亏价 | 库存金额 |\n|---|---|---|---|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|\n`;
slow.forEach(r => {
  const money = r.__stock && r.landed_cost ? (r.__stock * Number(r.landed_cost)).toFixed(2) : "";
  md += `| ${r.store || ""} | ${r.ship_warehouse || ""} | ${r.ship_batch || ""} | ${r.product_name || ""} | ${r.asin || ""} | ${r.ship_date || ""} | ${r.listed_date || ""} | ${r.__dShip ?? ""} | ${r.__dList ?? ""} | ${r.__anchor} | ${r.__age} | ${r.listed_qty ?? ""} | ${r.__stock} | ${r.landed_cost ?? ""} | ${money} |\n`;
});
const mdPath = path.join(out, base + ".md");
fs.writeFileSync(mdPath, md, "utf8");

console.log("\n=== 汇总(按店铺) ===");
sumRows.forEach(v => console.log(`${v.店铺}\t${v.条数}条\t${v.库存件数}件\t¥${v.库存金额.toFixed(2)}\t最长${v.最长天数}天`));
console.log("\n=== 明细(前 25 条) ===");
slow.slice(0, 25).forEach(r => console.log(`${r.store || ""}\t${r.ship_batch || ""}\t${r.product_name || ""}\t${r.asin || ""}\t货发${r.ship_date || "-"}\t上架${r.listed_date || "-"}\t${r.__anchor}${r.__age}天\t库存${r.__stock}\t¥${r.landed_cost ?? "-"}`));
console.log(`\n已生成:\n  ${xlsxPath}\n  ${mdPath}`);

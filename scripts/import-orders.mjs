import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import os from "os";

// =============================================================
// 订单记录导入 · Excel → order_records (按 KK 2026-09-17 Excel 表头)
// 用法: node scripts/import-orders.mjs <Excel文件路径> [--dry-run] [--email= --password=]
// 配置: ~/.kinzon-ops/config.json (KK 账号, RLS 仅管理层可写)
// 表头(中英文兼容): 序号(忽略) / 日期 / 订单号 / 地区 / 名字 / 产品 / sku /
//        到仓价 / 售价 / 到手营业额 / 折合 / 毛利润 / 毛利率 / 邮件 / 索评 / 退款
// 特性: 订单号唯一 → upsert 防重; 毛利率 "40.02%" / 0.4002 都能识别; 日期兼容
//        2026/7/19、2026-07-19、Excel 序列号、Date 对象; 空订单号的行会被跳过
// =============================================================

const CONFIG_PATH = path.join(os.homedir(), ".kinzon-ops", "config.json");
let cfg = { url: "https://hsyuopmmndpcabhegics.supabase.co", anonKey: "sb_publishable_c8ceRjjLPXK1JmHU6lCKgg_ABaUaYjb" };
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) }; } catch (e) {}

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
for (const a of args) {
  if (a.startsWith("--email=")) cfg.email = a.slice(8);
  if (a.startsWith("--password=")) cfg.password = a.slice(11);
}
if (!file) { console.error("用法: node scripts/import-orders.mjs <Excel> [--dry-run]"); process.exit(1); }
if (!fs.existsSync(file)) { console.error("文件不存在: " + file); process.exit(1); }
if (!dryRun && (!cfg.email || !cfg.password)) { console.error("未配置账号 (~/.kinzon-ops/config.json)"); process.exit(1); }

// 表头映射 (中英文兼容)
const COL = {
  order_date:   ["日期", "order_date", "date", "下单日期"],
  order_no:     ["订单号", "order_no", "order", "订单编号"],
  region:       ["地区", "region", "国家", "站点"],
  customer:     ["名字", "customer", "客户", "买家", "收件人"],
  product:      ["产品", "product", "product_name", "产品名"],
  sku:          ["sku", "SKU", "商品sku"],
  landed_cost:  ["到仓价", "landed_cost", "到仓成本"],
  price:        ["售价", "price"],
  net_revenue:  ["到手营业额", "net_revenue", "营业额", "到手金额"],
  converted:    ["折合", "converted", "折合人民币", "折合¥"],
  gross_profit: ["毛利润", "gross_profit", "毛利"],
  gross_margin: ["毛利率", "gross_margin", "利润率"],
  email_sent:   ["邮件", "email_sent", "邮件发送"],
  review_asked: ["索评", "review_asked", "评价邀请"],
  refund:       ["退款", "refund", "退货"],
};

const norm = (s) => String(s == null ? "" : s).replace(/[\s_\-（）()]/g, "").toLowerCase();
const pick = (row, keys) => {
  for (const k of keys) {
    for (const rk of Object.keys(row)) {
      if (norm(rk) === norm(k)) {
        const v = row[rk];
        if (v !== "" && v !== null && v !== undefined) return v;
      }
    }
  }
  return null;
};
const toDate = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v)) {
    const p = (n) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  if (typeof v === "number") {   // Excel 序列号
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  }
  const s = String(v).trim().replace(/[.]/g, "-").replace(/\//g, "-");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  const d = new Date(s);
  if (!isNaN(d)) { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
  return null;
};
const toNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[¥$,%\s]/g, "");
  const n = Number(s);
  return isNaN(n) ? null : n;
};
const toMargin = (v) => {                     // "40.02%" → 0.4002 ; 0.4002 → 0.4002 ; 40.02 → 0.4002
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string" && v.includes("%")) { const n = Number(v.replace(/[%\s]/g, "")); return isNaN(n) ? null : n / 100; }
  const n = Number(v);
  if (isNaN(n)) return null;
  return n > 1.5 ? n / 100 : n;
};
const toText = (v) => (v === null || v === undefined || v === "") ? null : String(v).trim();

const wb = XLSX.readFile(file, { cellDates: true });
const sheets = wb.SheetNames;
let all = [];
for (const sn of sheets) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: null });
  if (rows.length) all = all.concat(rows.map(r => ({ ...r, __sheet: sn })));
}
if (!all.length) { console.error("没读到数据行"); process.exit(1); }

const recs = [];
const skipped = [];
for (const r of all) {
  const order_no = toText(pick(r, COL.order_no));
  if (!order_no) { skipped.push(r); continue; }
  recs.push({
    order_no,
    order_date:   toDate(pick(r, COL.order_date)),
    region:       toText(pick(r, COL.region)),
    customer:     toText(pick(r, COL.customer)),
    product:      toText(pick(r, COL.product)),
    sku:          toText(pick(r, COL.sku)),
    landed_cost:  toNum(pick(r, COL.landed_cost)),
    price:        toNum(pick(r, COL.price)),
    net_revenue:  toNum(pick(r, COL.net_revenue)),
    converted:    toNum(pick(r, COL.converted)),
    gross_profit: toNum(pick(r, COL.gross_profit)),
    gross_margin: toMargin(pick(r, COL.gross_margin)),
    email_sent:   toText(pick(r, COL.email_sent)),
    review_asked: toText(pick(r, COL.review_asked)),
    refund:       toText(pick(r, COL.refund)),
  });
}

console.log(`读到 ${all.length} 行 · 有效订单 ${recs.length} 条 · 无订单号跳过 ${skipped.length} 行`);
console.log("示例(前 3 条):");
recs.slice(0, 3).forEach(r => console.log("  ", JSON.stringify(r)));

if (dryRun) { console.log("\n--dry-run 结束, 未写库"); process.exit(0); }

const sb = createClient(cfg.url, cfg.anonKey);
const { error: authErr } = await sb.auth.signInWithPassword({ email: cfg.email, password: cfg.password });
if (authErr) { console.error("登录失败: " + authErr.message); process.exit(1); }

let ok = 0, fail = 0;
for (let i = 0; i < recs.length; i += 200) {
  const chunk = recs.slice(i, i + 200);
  const { error } = await sb.from("order_records").upsert(chunk, { onConflict: "order_no" });
  if (error) { console.error(`第 ${i + 1}~${i + chunk.length} 条写入失败: ${error.message}`); fail += chunk.length; }
  else ok += chunk.length;
}
console.log(`\n完成: 成功 ${ok} 条, 失败 ${fail} 条`);

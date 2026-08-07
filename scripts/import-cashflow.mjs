import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import os from "os";

// =============================================================
// 现金流导入 · Excel → finance_cashflow
// 用法: node scripts/import-cashflow.mjs <Excel文件路径> [--email= --password=]
// 配置: ~/.kinzon-ops/config.json (KK 账号, RLS admin-only)
// 表头匹配(中英文兼容): 日期/店铺/渠道/类型/金额/币种/备注
//   类型: 流入/收入/入账/收款 → income; 流出/支出/出账/付款 → expense
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

if (!file) { console.error("用法: node scripts/import-cashflow.mjs <Excel文件路径>"); process.exit(1); }
if (!cfg.email || !cfg.password) { console.error("错误: 未配置账号 (~/.kinzon-ops/config.json)"); process.exit(1); }

const COL = {
  tx_date:  ["tx_date", "日期", "date", "交易日期", "时间"],
  store:    ["store", "店铺", "品牌", "账户"],
  channel:  ["channel", "渠道", "通道", "来源", "支付方式"],
  type:     ["type", "类型", "收支", "方向", "收支类型", "交易类型"],
  amount:   ["amount", "金额", "交易金额", "人民币金额", "到账金额"],
  currency: ["currency", "币种", "原币"],
  note:     ["note", "备注", "说明", "摘要", "交易说明", "描述"],
};
const INCOME_WORDS = ["流入", "收入", "入账", "收款", "回款", "income", "credit", "in", "收到"];
const EXPENSE_WORDS = ["流出", "支出", "出账", "付款", "支付", "expense", "debit", "out", "付"];

function norm(v) { if (v == null) return ""; return String(v).trim().toLowerCase().replace(/[_\-\s]+/g, ""); }
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
  if (typeof v === "number") { const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return d.toISOString().slice(0, 10); }
  const s = String(v).trim();
  const m = s.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return s;
}
function detectType(v) {
  const s = String(v == null ? "" : v).toLowerCase();
  if (INCOME_WORDS.some(w => s.includes(w))) return "income";
  if (EXPENSE_WORDS.some(w => s.includes(w))) return "expense";
  // 数字正负判断
  const n = Number(v);
  if (!isNaN(n)) return n >= 0 ? "income" : "expense";
  return null;
}

const supabase = createClient(cfg.url, cfg.anonKey);
const { error: loginErr } = await supabase.auth.signInWithPassword({ email: cfg.email, password: cfg.password });
if (loginErr) { console.error("登录失败:", loginErr.message); process.exit(1); }
console.error(`[ok] 已登录 ${cfg.email}`);

const wb = XLSX.readFile(file);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
if (rows.length < 2) { console.error("Excel 为空或只有表头"); process.exit(1); }

const header = findHeader(rows[0]);
const missing = ["tx_date", "type", "amount"].filter(c => header[c] === undefined);
if (missing.length) {
  console.error(`表头缺少列: ${missing.join(", ")}`);
  console.error(`识别的表头: ${JSON.stringify(Object.fromEntries(Object.entries(header).map(([k, v]) => [k, rows[0][v]])))}`);
  process.exit(1);
}

let inserted = 0, skipped = 0;
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.every(c => String(c).trim() === "")) continue;
  const tx_date = toDate(r[header.tx_date]);
  const rawAmt = header.amount !== undefined ? r[header.amount] : "";
  const amount = Math.abs(Number(rawAmt)) || 0;
  let type = detectType(header.type !== undefined ? r[header.type] : "");
  if (!type) type = Number(rawAmt) < 0 ? "expense" : (Number(rawAmt) >= 0 ? "income" : null);
  if (!tx_date || !type || !amount) { skipped++; console.error(`[跳过] 第 ${i + 1} 行: 日期=${tx_date} 类型=${header.type !== undefined ? r[header.type] : ""} 金额=${rawAmt}`); continue; }
  const store = header.store !== undefined ? String(r[header.store]).trim() || "未分类" : "未分类";
  const channel = header.channel !== undefined ? String(r[header.channel]).trim() || "其他" : "其他";
  const currency = header.currency !== undefined ? String(r[header.currency]).trim().toUpperCase() || "CNY" : "CNY";
  const note = header.note !== undefined ? String(r[header.note]).trim() || null : null;
  const { error } = await supabase.from("finance_cashflow").insert({
    tx_date, store, channel, type, amount, currency, note,
  });
  if (error) { console.error(`[失败] 第 ${i + 1} 行: ${error.message}`); skipped++; continue; }
  inserted++;
}

console.log(`\n======== 导入完成 ========`);
console.log(`共 ${inserted + skipped} 行 · 成功 ${inserted} · 跳过 ${skipped}`);

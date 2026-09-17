#!/usr/bin/env node
// ============================================================
// 一句话记账 — 直接写 office_expense / store_other_expense (bot 账号)
// 凭据: ~/.kinzon-ops/config.json  { email, password }
// 用法:
//   node add-expense.mjs office <日期> "<项目>" <金额>
//   node add-expense.mjs store  <日期> <店铺> "<项目>" <金额>
//   node add-expense.mjs batch  <json文件>   // [{type:"office"|"store", date, store, item, amount}, ...]
//   node add-expense.mjs list   office <YYYY-MM>     // 查看某月办公室费用明细
//   node add-expense.mjs list   store  <YYYY-MM>     // 查看某月店铺其他费用明细
//   node add-expense.mjs delete <office|store> <行id>
// ============================================================
import fs from "fs";
import os from "os";
import path from "path";

const SB_URL = "https://hsyuopmmndpcabhegics.supabase.co";
const ANON = "sb_publishable_c8ceRjjLPXK1JmHU6lCKgg_ABaUaYjb";
const STORES = ["飞鸟", "野趣", "屿阔", "俊业", "乾霖", "胤顺"];

const cfgPath = path.join(os.homedir(), ".kinzon-ops", "config.json");
let cfg;
try { cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")); }
catch { console.error("读不到 " + cfgPath); process.exit(1); }

async function getToken() {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });
  const d = await r.json();
  if (!d.access_token) { console.error("登录失败: " + JSON.stringify(d)); process.exit(1); }
  return d.access_token;
}

async function sb(token, method, table, body, query) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}${query || ""}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json",
               Prefer: method === "POST" ? "return=representation" : "return=minimal" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let d; try { d = JSON.parse(text); } catch { d = text; }
  if (!r.ok) { console.error(`写入/查询 ${table} 失败 (HTTP ${r.status}): ${typeof d === "string" ? d : JSON.stringify(d)}`); process.exit(1); }
  return d;
}

const normAmount = (a) => Math.round(Number(String(a).replace(/[¥￥,，\s]/g, "")) * 100) / 100;
const normDate = (d) => {
  const s = String(d).replace(/[./]/g, "-");
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{1,2})$/);                       // 只给到月 → 默认当月 1 号
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-01`;
  throw new Error("日期格式不对，要 YYYY-MM-DD 或 YYYY-MM: " + d);
};

const [,, cmd, ...rest] = process.argv;

if (cmd === "office" || cmd === "store") {
  const date = normDate(rest[0]);
  let store = null, item, amount;
  if (cmd === "office") { item = rest[1]; amount = normAmount(rest[2]); }
  else {
    store = rest[1];
    if (!STORES.includes(store)) { console.error(`店铺必须是: ${STORES.join(" / ")}`); process.exit(1); }
    item = rest[2]; amount = normAmount(rest[3]);
  }
  const table = cmd === "office" ? "office_expense" : "store_other_expense";
  const row = cmd === "office" ? { exp_date: date, item, amount } : { exp_date: date, store, item, amount };
  const token = await getToken();
  await sb(token, "POST", table, row);
  console.log(`✅ 已入库 ${table}: ${date} ${cmd === "store" ? store + " " : ""}${item} ¥${amount}`);
} else if (cmd === "batch") {
  const rows = JSON.parse(fs.readFileSync(rest[0], "utf8"));
  const token = await getToken();
  let n = 0;
  for (const r of rows) {
    const date = normDate(r.date);
    if (r.type === "office") { await sb(token, "POST", "office_expense", { exp_date: date, item: r.item, amount: normAmount(r.amount) }); n++; }
    else if (r.type === "store") {
      if (!STORES.includes(r.store)) { console.error(`跳过: 店铺不对 ${r.store}`); continue; }
      await sb(token, "POST", "store_other_expense", { exp_date: date, store: r.store, item: r.item, amount: normAmount(r.amount) }); n++;
    } else console.error("跳过: 未知类型 " + r.type);
  }
  console.log(`✅ 批量入库 ${n}/${rows.length} 条`);
} else if (cmd === "list") {
  const which = rest[0]; const ym = rest[1];
  const [yy, mm] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const end = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}-01`;
  const table = which === "office" ? "office_expense" : "store_other_expense";
  const token = await getToken();
  const q = `?select=*&order=exp_date.asc&exp_date=gte.${start}&exp_date=lt.${end}`;
  const rows = await sb(token, "GET", table, null, q);
  let sum = 0;
  for (const r of rows) { sum += Number(r.amount || 0); console.log(`${r.exp_date}  ${r.store || "(办公室)"}  ${r.item || ""}  ¥${r.amount}`); }
  console.log(`— 共 ${rows.length} 条, 合计 ¥${Math.round(sum * 100) / 100}`);
} else if (cmd === "delete") {
  const which = rest[0]; const id = rest[1];
  const table = which === "office" ? "office_expense" : "store_other_expense";
  const token = await getToken();
  await sb(token, "DELETE", table, null, `?id=eq.${id}`);
  console.log(`✅ 已删除 ${table} id=${id}`);
} else {
  console.log("用法见文件头注释");
}

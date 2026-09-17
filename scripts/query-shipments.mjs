#!/usr/bin/env node
// ============================================================
// 发货记录查询 — 用自己的账号读 shipments (RLS 按角色限权)
// 用法:
//   node query-shipments.mjs <店铺|all> [YYYY-MM]      # 按店/月查 (默认全量)
//   node query-shipments.mjs <店铺|all> <YYYY-MM> --summary  # 只看批次汇总
// ============================================================
import fs from "fs";
import os from "os";
import path from "path";

const SB_URL = "https://hsyuopmmndpcabhegics.supabase.co";
const ANON = "sb_publishable_c8ceRjjLPXK1JmHU6lCKgg_ABaUaYjb";
const STORES = ["飞鸟", "野趣", "屿阔", "俊业", "乾霖", "胤顺"];

const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".kinzon-ops", "config.json"), "utf8"));

const r0 = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: cfg.email, password: cfg.password }),
});
const tok = (await r0.json()).access_token;
if (!tok) { console.error("登录失败: 检查 ~/.kinzon-ops/config.json 的邮箱密码 (就是登录看板网站的那套)"); process.exit(1); }
const H = { apikey: ANON, Authorization: `Bearer ${tok}` };

const [storeArg, ym, flag] = process.argv.slice(2);
const store = !storeArg || storeArg === "all" ? null : storeArg;
if (store && !STORES.includes(store)) { console.error(`店铺必须是: ${STORES.join(" / ")} 或 all`); process.exit(1); }
const summary = flag === "--summary" || ym === "--summary";

let q = "shipments?select=*&order=ship_date.desc";
if (store) q += `&store=eq.${encodeURIComponent(store)}`;
if (ym && /^\d{4}-\d{2}$/.test(ym)) q += `&ship_date=gte.${ym}-01&ship_date=lt.${nextMonth(ym)}-01`;

function nextMonth(m) { const [y, mm] = m.split("-").map(Number); return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`; }

const rows = (await (await fetch(`${SB_URL}/rest/v1/${q}`, { headers: H })).json());
if (!Array.isArray(rows)) { console.error(JSON.stringify(rows)); process.exit(1); }

if (summary || rows.length > 40) {
  const batches = {};
  for (const r of rows) {
    const k = `${r.store}|${r.ship_batch || "无批次"}`;
    if (!batches[k]) batches[k] = { store: r.store, batch: r.ship_batch || "无批次", date: r.ship_date, n: 0, qty: 0, value: 0 };
    batches[k].n++; batches[k].qty += Number(r.qty || 0); batches[k].value += Number(r.goods_value || 0);
  }
  for (const b of Object.values(batches)) console.log(`${b.date}  ${b.store}  批次${b.batch}  ${b.n}款  共${b.qty}件  货值¥${b.value}`);
  console.log(`\n🚚 合计 ${rows.length} 条 / ${Object.keys(batches).length} 个批次, 总数量 ${rows.reduce((s, r) => s + Number(r.qty || 0), 0)} 件`);
} else {
  for (const r of rows) console.log(`${r.ship_date}  ${r.store}  ${r.product_name}(${r.asin})  ${r.qty}件  ${r.ship_warehouse}  批次${r.ship_batch}  货值¥${r.goods_value}  ${r.listed ? "已上架" : "未上架"}`);
  console.log(`\n🚚 合计 ${rows.length} 条, 总数量 ${rows.reduce((s, r) => s + Number(r.qty || 0), 0)} 件`);
}

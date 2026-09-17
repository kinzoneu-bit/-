#!/usr/bin/env node
// ============================================================
// 库存查询 — bot 账号直读 inventory / shipments
// 用法:
//   node query-inventory.mjs <店铺>            # 某店库存汇总 (按款式/ASIN 细分)
//   node query-inventory.mjs all               # 全部店铺汇总
//   node query-inventory.mjs <店铺> --detail   # 明细列表 (含批次/仓库/库龄)
//   node query-inventory.mjs <店铺> --old 90   # 只看库龄超 N 天的
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
if (!tok) { console.error("登录失败"); process.exit(1); }
const H = { apikey: ANON, Authorization: `Bearer ${tok}` };

const [storeArg, flag, flagVal] = process.argv.slice(2);
const store = !storeArg || storeArg === "all" ? null : storeArg;
if (store && !STORES.includes(store)) { console.error(`店铺必须是: ${STORES.join(" / ")} 或 all`); process.exit(1); }
const detail = flag === "--detail";
const oldDays = flag === "--old" ? Number(flagVal) : (flag === "--detail" && process.argv[4] === "--old" ? Number(process.argv[5]) : null);

let q = "inventory?select=*&order=ship_date.asc";
if (store) q += `&store=eq.${encodeURIComponent(store)}`;
const rows = (await (await fetch(`${SB_URL}/rest/v1/${q}`, { headers: H })).json());
if (rows.error) { console.error(JSON.stringify(rows)); process.exit(1); }

const today = new Date();
const aging = (r) => Math.floor((today - new Date(r.listed_date || r.ship_date || today)) / 86400000);
const live = rows.filter(r => (r.stock_qty ?? r.listed_qty ?? 0) > 0)
                 .filter(r => oldDays === null || aging(r) > oldDays);

if (detail) {
  for (const r of live) {
    console.log(`${r.store}  ${r.product_name || r.asin}  库存${r.stock_qty ?? r.listed_qty}  仓库${r.ship_warehouse || "?"}  批次${r.ship_batch || "?"}  上架${r.listed_date || "?"}  库龄${aging(r)}天  到仓价¥${r.landed_cost ?? "?"}`);
  }
}

// 汇总
const total = live.reduce((s, r) => s + (r.stock_qty ?? r.listed_qty ?? 0), 0);
const byStore = {};
const byAsin = {};
for (const r of live) {
  const st = r.store || "(未归属)";
  const k = r.asin || r.product_name || "(无ASIN)";
  byStore[st] = (byStore[st] || 0) + (r.stock_qty ?? r.listed_qty ?? 0);
  byAsin[`${st}|${k}|${r.product_name || ""}`] = (byAsin[`${st}|${k}|${r.product_name || ""}`] || 0) + (r.stock_qty ?? r.listed_qty ?? 0);
}
console.log(`\n📦 ${store || "全部店铺"} 在售库存合计: ${total} 件 (${live.length} 条库存记录)`);
if (!store) { console.log("\n— 按店铺 —"); for (const [k, v] of Object.entries(byStore)) console.log(`  ${k}: ${v}`); }
console.log("\n— 按ASIN/款式 —");
for (const [k, v] of Object.entries(byAsin).sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  const [st, asin, name] = k.split("|");
  console.log(`  ${st}  ${asin}  ${name}  ${v}件`);
}
if (Object.keys(byAsin).length > 30) console.log(`  …共 ${Object.keys(byAsin).length} 个ASIN`);
const old90 = live.filter(r => aging(r) > 90).reduce((s, r) => s + (r.stock_qty ?? r.listed_qty ?? 0), 0);
console.log(`\n⏳ 库龄超90天: ${old90} 件`);

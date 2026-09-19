#!/usr/bin/env node
// 店铺月度核算查询 — KinZon
// 口径与看板「店铺月度核算」页一致:
//   各项成本 = (当月运维费用里的欧元明细合计) × 当月汇率 + 月固定¥(网络IP 88)
//   店铺利润 = 收入 − 各项成本 − 店铺其他费用
//   净利润   = 店铺利润 − 人工 − 场地 − 办公室费用明细
//   飞鸟/野趣/屿阔 三家共享 人工/场地/办公室费用明细(取 office_expense 当月合计), 只扣一次
// 用法:
//   node query-monthly.mjs 2026-08              # 某月全部店铺
//   node query-monthly.mjs 2026-08 屿阔         # 某月某店
//   node query-monthly.mjs 2026                 # 某年 1-12 月逐月汇总 (按店)

import fs from "fs";
import os from "os";
import path from "path";

const SB = "https://hsyuopmmndpcabhegics.supabase.co";
const ANON = "sb_publishable_c8ceRjjLPXK1JmHU6lCKgg_ABaUaYjb";
const ALL_STORES = ["飞鸟", "野趣", "屿阔", "俊业", "乾霖", "胤顺"];
const SHARE_GROUP = ["飞鸟", "野趣", "屿阔"];
const SHARE_STORE = "__shared__";
const MONTHLY_CATS = { "网络IP费用": 88 };
// 运维费用页面的标准类别 (只有这些计入「各项成本」; 历史变体类别名不计入)
const OPS_CATS = ["网络IP费用", "广告", "仓储", "长期仓储", "erp", "优惠券", "弃置费用", "生产者延伸费", "店铺月租", "入库费用", "亚马逊物流客户退货费(非服装和非鞋类)"];   // 月固定项 (没记录时用默认值)
const MONTHLY_SITE = "月固定";

const cfgPath = path.join(os.homedir(), ".kinzon-ops", "config.json");
if (!fs.existsSync(cfgPath)) {
  console.error("缺少凭据文件: " + cfgPath + "  (内容: {\"email\":\"你的邮箱\",\"password\":\"你的密码\"})");
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

const auth = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify(cfg),
});
if (!auth.ok) {
  const t = await auth.text();
  console.error("登录失败(" + auth.status + "): " + t);
  console.error("→ 检查 ~/.kinzon-ops/config.json 里的邮箱/密码 (就是登录看板网站的账号)");
  process.exit(1);
}
const token = (await auth.json()).access_token;
const H = { apikey: ANON, Authorization: "Bearer " + token };
const get = async (table, q) => {
  const r = await fetch(`${SB}/rest/v1/${table}?${q}`, { headers: H });
  if (!r.ok) { console.error(`读取 ${table} 失败(${r.status}): ` + (await r.text())); return []; }
  return r.json();
};

const arg = process.argv[2] || new Date().toISOString().slice(0, 7);
const storeArg = process.argv[3];
const stores = storeArg ? ALL_STORES.filter(s => s === storeArg) : ALL_STORES;
if (storeArg && !stores.length) { console.error("店铺必须是: " + ALL_STORES.join(" / ")); process.exit(1); }
const isYear = /^\d{4}$/.test(arg);
const months = isYear ? Array.from({ length: 12 }, (_, i) => `${arg}-${String(i + 1).padStart(2, "0")}`) : [arg.slice(0, 7)];

// 汇率: 按月取, 缺则取「不晚于该月的最近一条」, 再没有用 8.0
const fxRows = await get("fx_rates", "select=*");
const fx = {};
[...(fxRows || [])].sort((a, b) => String(a.month).localeCompare(String(b.month)))
  .forEach(r => { fx[String(r.month).slice(0, 7)] = Number(r.rate); });
const rateOf = (ym) => {
  const keys = Object.keys(fx).filter(k => k <= ym).sort();
  return keys.length ? fx[keys[keys.length - 1]] : 8.0;
};

const money = (v) => (v === null || v === undefined ? "—" : Number(v).toFixed(2));
const pad = (s, n) => String(s).padStart(n);

for (const ym of months) {
  const start = `${ym}-01`;
  const [yy, mm] = ym.split("-").map(Number);
  const next = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}-01`;

  const [opsRows, costRows, officeRows, otherRows] = await Promise.all([
    get("opsfee_monthly", `select=*&month=eq.${start}`),
    get("store_monthly_costs", `select=*&month=eq.${start}`),
    get("office_expense", `select=amount&exp_date=gte.${start}&exp_date=lt.${next}`),
    get("store_other_expense", `select=store,amount&exp_date=gte.${start}&exp_date=lt.${next}`),
  ]);
  if (!opsRows.length && !costRows.length && !officeRows.length && !otherRows.length) {
    console.log(`\n===== ${ym} =====  (本月无任何数据)`);
    continue;
  }
  const rate = rateOf(ym);
  const officeTotal = officeRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const opsCost = (st) => {
    if (!opsRows.some(r => r.store === st)) return 0;
    const eur = opsRows.filter(r => r.store === st && OPS_CATS.includes(r.category) && MONTHLY_CATS[r.category] === undefined)
      .reduce((s, x) => s + Number(x.amount || 0), 0);
    const fixed = Object.entries(MONTHLY_CATS).reduce((s, [cat, def]) => {
      const rs = opsRows.filter(r => r.store === st && r.category === cat && r.site === MONTHLY_SITE);
      return s + (rs.length ? rs.reduce((a, x) => a + Number(x.amount || 0), 0) : def);
    }, 0);
    return eur * rate + fixed;
  };
  const manVal = (st, item) => {
    const r = costRows.find(x => x.store === st && x.item === item);
    return r ? Number(r.amount || 0) : null;
  };
  const man = (st, item) => { const v = manVal(st, item); return v === null ? 0 : v; };
  const otherOf = (st) => otherRows.filter(r => r.store === st).reduce((s, r) => s + Number(r.amount || 0), 0);
  const shopProfit = (st) => man(st, "收入") - opsCost(st) - otherOf(st);
  const netOf = (st) => shopProfit(st) - man(st, "人工") - man(st, "场地") - man(st, "其他");

  console.log(`\n===== ${ym} =====  汇率 ${rate}`);
  console.log(`${pad("店铺", 6)} ${pad("收入", 12)} ${pad("各项成本", 11)} ${pad("店铺其他费用", 12)} ${pad("店铺利润", 12)} ${pad("人工", 9)} ${pad("场地", 9)} ${pad("办公室费用", 10)} ${pad("净利润", 12)}`);
  let tProfit = 0, tNet = 0;
  for (const st of stores) {
    const p = shopProfit(st);
    tProfit += p;
    const shared = SHARE_GROUP.includes(st);
    const net = shared ? null : netOf(st);
    if (net !== null) tNet += net;
    console.log(`${pad(st, 6)} ${pad(money(man(st, "收入")), 12)} ${pad(money(opsCost(st)), 11)} ${pad(money(otherOf(st)), 12)} ${pad(money(p), 12)} ${pad(shared ? "(共享)" : money(man(st, "人工")), 9)} ${pad(shared ? "(共享)" : money(man(st, "场地")), 9)} ${pad(shared ? "" : money(man(st, "其他")), 10)} ${pad(net === null ? "—" : money(net), 12)}`);
  }
  // 三家共享组: 净利润只在三家合计口径上算一次
  const shareVisible = SHARE_GROUP.every(s => stores.includes(s));
  if (shareVisible) {
    const groupProfit = SHARE_GROUP.reduce((s, st) => s + shopProfit(st), 0);
    const groupNet = groupProfit - man(SHARE_STORE, "人工") - man(SHARE_STORE, "场地") - officeTotal;
    console.log(`${pad(SHARE_GROUP.join("/"), 6)} 合计: 店铺利润 ${money(groupProfit)}  共享人工 ${money(man(SHARE_STORE, "人工"))}  共享场地 ${money(man(SHARE_STORE, "场地"))}  办公室费用 ${money(officeTotal)}  → 净利润 ${money(groupNet)}`);
  }
  const others = stores.filter(s => !SHARE_GROUP.includes(s));
  if (others.length) {
    const netAll = others.reduce((s, st) => s + netOf(st), 0);
    if (shareVisible) {
      const groupNet = SHARE_GROUP.reduce((s, st) => s + shopProfit(st), 0) - man(SHARE_STORE, "人工") - man(SHARE_STORE, "场地") - officeTotal;
      console.log(`全部合计净利润: ${money(groupNet + netAll)}`);
    } else {
      console.log(`全部合计净利润: ${money(netAll)}`);
    }
  }
}

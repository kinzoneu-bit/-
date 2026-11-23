#!/usr/bin/env node
// ============================================================
// 仓储数据批量接口 — 谢福光 (warehouse 角色)
// 直接写 西欧 Supabase 的 purchase_batches / shipments
// 权限边界由 RLS 保证: 能写入库批次+发货记录; 采购单只读; 付款/供应商无权
//
// 凭据: ~/.kinzon-ops/warehouse.json  { email, password }
//
// 用法:
//   -- 入库批次 (purchase_batches) --
//   node warehouse-data.mjs batch add --po <PO编号> --batch <批次号> --qty 50 [--store 飞鸟] [--date 2026-11-23] [--tracking <号>] [--note <备注>]
//   node warehouse-data.mjs batch list [--po <PO编号>] [--batch <批次号>]
//   node warehouse-data.mjs batch upd <id> --qty 60 [--date ...] [--tracking ...] [--note ...]
//   node warehouse-data.mjs batch del <id>
//
//   -- 发货记录 (shipments) --
//   node warehouse-data.mjs ship add --store 飞鸟 --date 2026-11-23 --product "<产品名>" --qty 100 \
//        [--batch <批次>] [--wh <发货仓>] [--asin ...] [--price 76.1] [--freight 1200] [--misc 80] [--note ...]
//   node warehouse-data.mjs ship list [--store 飞鸟] [--batch <批次>] [--from 2026-11-01] [--to 2026-11-30] [--limit 50]
//   node warehouse-data.mjs ship upd <id> --qty 120 [--freight 1500] [--note ...]
//   node warehouse-data.mjs ship del <id>
//
//   -- 批量 (JSON 文件) --
//   node warehouse-data.mjs json ops.json
//     ops.json = [{op:"batch_add"|"batch_upd"|"batch_del"|"ship_add"|"ship_upd"|"ship_del", ...}]
//
//   -- 采购单只读查询 --
//   node warehouse-data.mjs po list [--qty-unreceived]      # 找还没到货的采购单
// ============================================================
import fs from "fs";
import os from "os";
import path from "path";

const SB_URL = "https://hsyuopmmndpcabhegics.supabase.co";
const ANON = "sb_publishable_c8ceRjjLPXK1JmHU6lCKgg_ABaUaYjb";
const STORES = ["飞鸟", "野趣", "屿阔", "俊业", "乾霖", "胤顺"];

// 允许写的字段白名单（业务边界，非 RLS 边界）
// 故意不含 reviewed_* / change_req / bill_checked / freight_paid —— 那些是夏蕾/黄丹的复核权限
const BATCH_FIELDS = ["ship_batch", "qty", "store", "ship_date", "tracking_no", "note"];
const SHIP_FIELDS = [
  "store", "ship_date", "ship_warehouse", "ship_batch", "product_name", "asin", "qty",
  "purchase_price", "goods_value", "total_value", "freight", "misc_fee", "duty",
  "insurance_fee", "share_fee", "landed_cost", "logistics_provider", "channel",
  "unit_price", "last_mile_no", "listed_date", "listed_qty", "loss_qty",
  "compensation_eur", "loss_amount", "insurance_no", "insured_amount", "note",
  "remaining_qty", "stock_snapshot_date",
];

// ---------- 凭据 ----------
const cfgPath = path.join(os.homedir(), ".kinzon-ops", "warehouse.json");
let cfg;
try { cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")); }
catch { console.error("读不到凭据 " + cfgPath + "（需要 {email,password}）"); process.exit(1); }

// ---------- HTTP ----------
async function getToken() {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.access_token) { console.error("登录失败: " + JSON.stringify(d).slice(0, 300)); process.exit(1); }
  return d.access_token;
}

let TOKEN = null;
async function sb(method, table, body, query) {
  if (!TOKEN) TOKEN = await getToken();
  const r = await fetch(`${SB_URL}/rest/v1/${table}${query || ""}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Prefer: (method === "POST" || method === "PATCH" || method === "DELETE") ? "return=representation" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let d; try { d = JSON.parse(text); } catch { d = text; }
  if (!r.ok) {
    const msg = typeof d === "string" ? d : JSON.stringify(d);
    throw new Error(`${table} ${method} 失败 (HTTP ${r.status}): ${msg.slice(0, 400)}`);
  }
  return d;
}

// ---------- 工具 ----------
const normDate = (d) => {
  if (!d) return null;
  const s = String(d).replace(/[./]/g, "-");
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-01`;
  throw new Error("日期格式不对，要 YYYY-MM-DD 或 YYYY-MM：" + d);
};
const num = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/[¥￥,，\s]/g, ""));
  if (Number.isNaN(n)) throw new Error("不是数字：" + v);
  return n;
};
const int = (v) => { const n = num(v); return n === null ? null : Math.round(n); };

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) { out[key] = true; }
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

function pick(args, fields) {
  const row = {};
  const alias = {
    po: null, batch: "ship_batch", date: "ship_date", tracking: "tracking_no",
    product: "product_name", wh: "ship_warehouse", price: "purchase_price",
    freight: "freight", misc: "misc_fee", qty: "qty", store: "store", note: "note",
    asin: "asin", duty: "duty", channel: "channel", provider: "logistics_provider",
    listed: "listed_date", listedqty: "listed_qty", loss: "loss_qty",
    compensation: "compensation_eur", insured: "insured_amount", insuranceno: "insurance_no",
    remaining: "remaining_qty", snapshot: "stock_snapshot_date", unit: "unit_price",
    lastmile: "last_mile_no", total: "total_value", goods: "goods_value", share: "share_fee",
    insfee: "insurance_fee", lossamt: "loss_amount",
  };
  for (const [k, v] of Object.entries(args)) {
    if (k === "_") continue;
    const field = alias[k] !== undefined && alias[k] !== null ? alias[k] : k;
    if (field === "po" || field === "purchase-id") continue;
    if (!fields.includes(field)) {
      throw new Error(`字段 ${field} 不在允许范围。允许：${fields.join(", ")}`);
    }
    if (["qty", "listed_qty", "loss_qty", "remaining_qty"].includes(field)) row[field] = int(v);
    else if (["purchase_price", "goods_value", "total_value", "freight", "misc_fee", "duty",
              "insurance_fee", "share_fee", "landed_cost", "unit_price", "compensation_eur",
              "loss_amount", "insured_amount"].includes(field)) row[field] = num(v);
    else if (["ship_date", "listed_date", "stock_snapshot_date"].includes(field)) row[field] = normDate(v);
    else row[field] = typeof v === "string" ? v : String(v);
  }
  return row;
}

async function resolvePurchaseId(po) {
  if (!po) throw new Error("入库批次必须指定 --po <PO编号>（对应采购单号）");
  const rows = await sb("GET", "purchase_records", null, `?select=id,po_no,product_name,qty,store&po_no=eq.${encodeURIComponent(po)}`);
  if (!rows.length) throw new Error(`找不到 PO 编号 = ${po} 的采购单。用 "po list" 查一下已有哪些采购单。`);
  if (rows.length > 1) {
    console.error(`⚠️ PO ${po} 对应 ${rows.length} 张采购单，取第一张（${rows[0].id}）。如需指定请用 --purchase-id`);
    return rows[0].id;
  }
  return rows[0].id;
}

const fmt = (rows) => {
  if (!Array.isArray(rows)) return JSON.stringify(rows);
  if (!rows.length) return "（0 行）";
  return rows.map(r => {
    const o = {};
    for (const [k, v] of Object.entries(r)) if (v !== null && v !== "" && v !== 0) o[k] = v;
    return JSON.stringify(o);
  }).join("\n");
};

// ---------- 业务命令 ----------
// RLS 静默挡写会返回 200 + 空数组，必须校验行数，否则误报成功
function mustHit(rows, what) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`${what} 未生效：0 行受影响（可能没有该权限，或 id 不存在）。`);
  }
  return rows;
}

// 已复核的发货行（夏蕾/黄丹签过）不允许脚本改删，必须走网页「申请修改」
async function assertShipEditable(id) {
  const rows = await sb("GET", "shipments", null, `?select=id,review_status,batch_owner&id=eq.${id}`);
  if (!rows.length) throw new Error(`发货记录 ${id} 不存在`);
  const r = rows[0];
  if (r.review_status && r.review_status !== "pending") {
    throw new Error(`该行已复核（review_status=${r.review_status}，复核人 ${r.batch_owner || "-"}），已锁定。改动请到网页点「申请修改」走双签流程。`);
  }
}

async function batchAdd(args) {
  const row = pick(args, BATCH_FIELDS);
  if (args["purchase-id"]) row.purchase_id = args["purchase-id"];
  else row.purchase_id = await resolvePurchaseId(args.po);
  if (!row.ship_batch) throw new Error("缺少 --batch <批次号>");
  if (row.qty === undefined || row.qty === null) throw new Error("缺少 --qty <数量>");
  if (row.store && !STORES.includes(row.store)) throw new Error(`店铺必须是：${STORES.join(" / ")}`);
  const r = await sb("POST", "purchase_batches", row);
  console.log("✅ 入库批次已写入");
  console.log(fmt(r));
}

async function batchUpd(id, args) {
  const row = pick(args, BATCH_FIELDS);
  if (!Object.keys(row).length) throw new Error("没给要改的字段");
  if (row.store && !STORES.includes(row.store)) throw new Error(`店铺必须是：${STORES.join(" / ")}`);
  const r = mustHit(await sb("PATCH", "purchase_batches", row, `?id=eq.${id}`), "更新批次");
  console.log("✅ 入库批次已更新"); console.log(fmt(r));
}

async function batchDel(id) {
  const r = mustHit(await sb("DELETE", "purchase_batches", null, `?id=eq.${id}`), "删除批次");
  console.log("✅ 已删除批次 " + id);
}

async function batchList(args) {
  let q = "?select=*&order=created_at.desc";
  if (args.po) {
    const pid = await resolvePurchaseId(args.po);
    q += `&purchase_id=eq.${pid}`;
  }
  if (args.batch) q += `&ship_batch=eq.${encodeURIComponent(args.batch)}`;
  const r = await sb("GET", "purchase_batches", null, q);
  console.log(fmt(r));
}

async function shipAdd(args) {
  const row = pick(args, SHIP_FIELDS);
  for (const f of ["store", "ship_date", "product_name"]) {
    if (!row[f]) throw new Error(`发货记录必填：--${f === "ship_date" ? "date" : f === "product_name" ? "product" : "store"}`);
  }
  if (!STORES.includes(row.store)) throw new Error(`店铺必须是：${STORES.join(" / ")}`);
  if (row.qty === undefined || row.qty === null) row.qty = 0;
  const r = await sb("POST", "shipments", row);
  console.log("✅ 发货记录已写入");
  console.log(fmt(r));
}

async function shipUpd(id, args) {
  await assertShipEditable(id);
  const row = pick(args, SHIP_FIELDS);
  if (!Object.keys(row).length) throw new Error("没给要改的字段");
  if (row.store && !STORES.includes(row.store)) throw new Error(`店铺必须是：${STORES.join(" / ")}`);
  const r = mustHit(await sb("PATCH", "shipments", row, `?id=eq.${id}`), "更新发货记录");
  console.log("✅ 发货记录已更新"); console.log(fmt(r));
}

async function shipDel(id) {
  await assertShipEditable(id);
  mustHit(await sb("DELETE", "shipments", null, `?id=eq.${id}`), "删除发货记录");
  console.log("✅ 已删除发货记录 " + id);
}

async function shipList(args) {
  let q = "?select=id,store,ship_date,ship_batch,ship_warehouse,product_name,asin,qty,freight,misc_fee,landed_cost,note&order=ship_date.desc";
  if (args.store) q += `&store=eq.${encodeURIComponent(args.store)}`;
  if (args.batch) q += `&ship_batch=eq.${encodeURIComponent(args.batch)}`;
  if (args.from) q += `&ship_date=gte.${normDate(args.from)}`;
  if (args.to) q += `&ship_date=lte.${normDate(args.to)}`;
  q += `&limit=${args.limit || 50}`;
  const r = await sb("GET", "shipments", null, q);
  console.log(fmt(r));
}

async function poList(args) {
  const q = "?select=id,po_no,order_date,store,supplier,product_name,qty,arrive_date,received_qty,tracking_no&order=order_date.desc&limit=100";
  let rows = await sb("GET", "purchase_records", null, q);
  if (args["qty-unreceived"]) rows = rows.filter(r => (r.received_qty || 0) < (r.qty || 0));
  console.log(fmt(rows));
}

async function runJson(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const ops = Array.isArray(raw) ? raw : [raw];
  let ok = 0, fail = 0;
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    const { op, id, ...payload } = o;
    const tag = `#${i + 1} ${op}`;
    try {
      if (op === "batch_add") await batchAdd({ ...payload, _: [] });
      else if (op === "batch_upd") await batchUpd(id, { ...payload, _: [] });
      else if (op === "batch_del") await batchDel(id);
      else if (op === "ship_add") await shipAdd({ ...payload, _: [] });
      else if (op === "ship_upd") await shipUpd(id, { ...payload, _: [] });
      else if (op === "ship_del") await shipDel(id);
      else throw new Error("未知 op：" + op);
      ok++;
    } catch (e) {
      fail++;
      console.error(`❌ ${tag} 失败: ${e.message}`);
    }
  }
  console.log(`\n== 成功 ${ok} / 失败 ${fail} ==`);
  if (fail) process.exitCode = 1;
}

// ---------- 入口 ----------
const argv = process.argv.slice(2);
const [group, action, ...tail] = argv;
const args = parseArgs(tail);

try {
  if (group === "batch") {
    if (action === "add") await batchAdd(args);
    else if (action === "list") await batchList(args);
    else if (action === "upd") await batchUpd(tail[0], parseArgs(tail.slice(1)));
    else if (action === "del") await batchDel(tail[0]);
    else throw new Error("batch 支持 add / list / upd / del");
  } else if (group === "ship") {
    if (action === "add") await shipAdd(args);
    else if (action === "list") await shipList(args);
    else if (action === "upd") await shipUpd(tail[0], parseArgs(tail.slice(1)));
    else if (action === "del") await shipDel(tail[0]);
    else throw new Error("ship 支持 add / list / upd / del");
  } else if (group === "po") {
    if (action === "list") await poList(args);
    else throw new Error("po 只支持 list（采购单对仓储只读）");
  } else if (group === "json") {
    await runJson(action);
  } else {
    console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(2, 38).join("\n").replace(/^\/\/ ?/gm, ""));
  }
} catch (e) {
  console.error("❌ " + e.message);
  process.exitCode = 1;
}

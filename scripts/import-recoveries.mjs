/**
 * 乾霖回款导入（Amazon Payments 到账流水）
 * 数据源：sql/import-recoveries-qianlin-20261123.sql 里的 values 行
 * 目的：证明后端账号有写权限后，AI 自己直接导入，不需要 KK 手工跑 SQL
 */
import fs from "fs";
import os from "os";
import path from "path";

const SB = "https://hsyuopmmndpcabhegics.supabase.co";
const ANON = "sb_publishable_c8ceRjjLPXK1JmHU6lCKgg_ABaUaYjb";
const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".kinzon-ops", "config.json"), "utf8"));
const auth = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify(cfg),
});
const tok = (await auth.json()).access_token;
const H = { apikey: ANON, Authorization: "Bearer " + tok, "Content-Type": "application/json", Prefer: "return=representation" };

const file = path.resolve("sql/import-recoveries-qianlin-20261123.sql");
const txt = fs.readFileSync(file, "utf8");

// 解析 ('2026-11-23','乾霖','...',74.57,'EUR',7.6,566.73,'confirmed','...','kk'),
const re = /\('([\d-]+)','([^']+)','([^']*)',([\d.]+),'([A-Z]{3})',([\d.]+),([\d.]+),'([^']+)','([^']*)','([^']*)'\)/g;
const rows = [];
let m;
while ((m = re.exec(txt))) {
  rows.push({
    recv_date: m[1], store: m[2], settle_no: m[3],
    received_amount: Number(m[4]), currency: m[5], fx_rate: Number(m[6]),
    amount_cny: Number(m[7]), status: m[8], note: m[9], created_by: m[10],
  });
}
console.log("解析到", rows.length, "笔；合计 CNY", rows.reduce((s, r) => s + r.amount_cny, 0).toFixed(2));

// 防重：先清掉乾霖的历史行（与 SQL 里的 delete 等价）
const Hdr = { ...H, Prefer: "return=minimal" };
const del = await fetch(`${SB}/rest/v1/recoveries?store=eq.${encodeURIComponent("乾霖")}`, { method: "DELETE", headers: Hdr });
console.log("清理旧行 →", del.status);

// 分批插入（每批 30）
let ok = 0, fail = 0;
for (let i = 0; i < rows.length; i += 30) {
  const batch = rows.slice(i, i + 30);
  const r = await fetch(`${SB}/rest/v1/recoveries`, { method: "POST", headers: H, body: JSON.stringify(batch) });
  const t = await r.text();
  if (r.status < 300) { ok += batch.length; console.log(`批 ${i / 30 + 1}: ${batch.length} 笔 OK`); }
  else { fail += batch.length; console.log(`批 ${i / 30 + 1}: FAIL ${r.status} ${t.slice(0, 300)}`); }
}
console.log(`\n写入成功 ${ok} 笔，失败 ${fail} 笔`);

// 核对
const chk = await (await fetch(`${SB}/rest/v1/recoveries?select=recv_date,amount_cny,currency&limit=2000`, { headers: H })).json();
const sum = chk.reduce((s, r) => s + Number(r.amount_cny || 0), 0);
const by = {};
for (const r of chk) { const k = r.recv_date.slice(0, 7); by[k] = (by[k] || 0) + Number(r.amount_cny || 0); }
console.log("库内实际:", chk.length, "笔，合计 ¥" + sum.toFixed(2), JSON.stringify(by));

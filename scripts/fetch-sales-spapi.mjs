import { createClient } from "@supabase/supabase-js";
import SellingPartnerAPI from "amazon-sp-api";
import fs from "fs";
import path from "path";
import os from "os";

// =============================================================
// 财务数据拉取 · Amazon SP-API (Sales & Traffic 报表) → finance_daily_sales
// 用法: node scripts/fetch-sales-spapi.mjs [--days=3] [--date=YYYY-MM-DD] [--dry-run]
// 配置: ~/.kinzon-ops/spapi.json (见 scripts/spapi.example.json)
// 说明:
//   - 每个店铺独立授权, 循环拉取该店铺所有 marketplaces
//   - 多 ASIN 同时查询: 报表自动包含该店铺全部 ASIN 的 PER_ASIN 数据
//   - 报表延迟 T-1/T-2 天, 默认拉昨天
//   - 写库需 KK 账号 (RLS admin-only), 复用 ~/.kinzon-ops/config.json
// =============================================================

const SPAPI_PATH = path.join(os.homedir(), ".kinzon-ops", "spapi.json");
const OPS_PATH = path.join(os.homedir(), ".kinzon-ops", "config.json");
if (!fs.existsSync(SPAPI_PATH)) { console.error("错误: 未找到 " + SPAPI_PATH + " (复制 scripts/spapi.example.json 并填写)"); process.exit(1); }
const sp = JSON.parse(fs.readFileSync(SPAPI_PATH, "utf8"));

let opsCfg = { url: "https://hsyuopmmndpcabhegics.supabase.co", anonKey: "sb_publishable_c8ceRjjLPXK1JmHU6lCKgg_ABaUaYjb" };
try { opsCfg = { ...opsCfg, ...JSON.parse(fs.readFileSync(OPS_PATH, "utf8")) }; } catch (e) {}

const args = process.argv.slice(2);
let days = 1, dateOverride = null, dryRun = false;
for (const a of args) {
  if (a.startsWith("--days=")) days = parseInt(a.slice(7), 10) || 1;
  if (a.startsWith("--date=")) dateOverride = a.slice(7);
  if (a === "--dry-run") dryRun = true;
}
if (days > 14) days = 14; // 报表窗口限制

// 欧洲 marketplace → 站点代号
const MK_SITE = {
  "A13V1IB3VIYZZH": "FR", "A1PA6795UKMFR9": "DE",
  "A1F83G8C2ARO7P": "UK", "APJ6JRA9NG5V4": "ES",
  "A1C3SOZRARQ6R3": "PL", "A33AVAJ2PDY3EV": "SE",
  "A1805IZSGTT6HS": "NL", "A2NODRKZP88ZB9": "IT",
};
const siteOf = mk => MK_SITE[mk] || mk;

// 生成拉取日期列表 (昨天往前 days 天)
function dateList(n) {
  const list = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.now() - i * 86400000);
    list.push(d.toISOString().slice(0, 10));
  }
  return dateOverride ? [dateOverride] : list;
}

const supabase = createClient(opsCfg.url, opsCfg.anonKey);
if (!dryRun) {
  const { error } = await supabase.auth.signInWithPassword({ email: opsCfg.email, password: opsCfg.password });
  if (error) { console.error("Supabase 登录失败:", error.message); process.exit(1); }
  console.error(`[ok] 已登录 ${opsCfg.email}`);
}

const dates = dateList(days);
console.error(`[i] 拉取范围: ${dates.join(", ")} · 店铺 ${sp.shops.length} 个`);

let totalUpsert = 0;
for (const shop of sp.shops) {
  const client = new SellingPartnerAPI({
    region: sp.region || "eu",
    refresh_token: shop.refreshToken,
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: sp.appClientId,
      SELLING_PARTNER_APP_CLIENT_SECRET: sp.appClientSecret,
      AWS_ACCESS_KEY_ID: sp.awsAccessKeyId,
      AWS_SECRET_ACCESS_KEY: sp.awsSecretAccessKey,
      AWS_SELLING_PARTNER_ROLE: sp.roleArn,
    },
  });
  console.error(`\n===== 店铺 ${shop.name} (sellerId ${shop.sellerId}) =====`);
  for (const mk of shop.marketplaceIds || []) {
    for (const date of dates) {
      try {
        const start = `${date}T00:00:00Z`, end = `${date}T23:59:59Z`;
        const res = await client.downloadReport({
          body: {
            reportType: "GET_SALES_AND_TRAFFIC_REPORT",
            marketplaceIds: [mk],
            dataStartTime: start,
            dataEndTime: end,
            reportOptions: { dateGranularity: "DAY", asinGranularity: "PER_ASIN", salesByAsin: true, trafficByAsin: true },
          },
          version: "2021-06-30",
          interval: 10000,
          download: { json: true, unzip: true },
        });
        const byAsin = (res && res.salesAndTrafficByAsin) || [];
        console.error(`[${date}][${siteOf(mk)}] 报表完成, ${byAsin.length} 个 ASIN`);
        if (dryRun) {
          byAsin.slice(0, 5).forEach(a => console.log(`  ${a.asin}: units=${(a.salesByAsin||{}).unitsOrdered} sales=${((a.salesByAsin||{}).orderedProductSales||{}).amount}`));
          continue;
        }
        for (const a of byAsin) {
          const sb = a.salesByAsin || {};
          const qty = sb.unitsOrdered || 0;
          const rev = Number((sb.orderedProductSales || {}).amount || 0);
          if (!qty && !rev) continue; // 无数据不写
          const { error } = await supabase.from("finance_daily_sales").upsert(
            { sale_date: date, store: shop.name, site: siteOf(mk), asin: a.asin, product_name: null, order_qty: qty, revenue: rev },
            { onConflict: "sale_date,store,site,asin" }
          );
          if (error) { console.error(`  [写库失败] ${a.asin}: ${error.message}`); continue; }
          totalUpsert++;
        }
      } catch (e) {
        console.error(`[${date}][${siteOf(mk)}] 拉取失败: ${e.message}`);
      }
    }
  }
}
console.error(`\n======== 完成 ========`);
console.error(dryRun ? "dry-run 模式, 未写库" : `写入 ${totalUpsert} 行 finance_daily_sales`);

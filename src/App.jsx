import React, { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase";

// =============================================================
// 亚马逊精品系统 · KinZon FR / DE / UK 亚马逊选品管理
// 假数据取自法国站现有产品, 并给部分产品加了 DE/UK 评估行以演示跨站
// =============================================================

const SITES = ["FR", "DE", "UK"];

// ---- 假数据 ----
const PRODUCTS = [
  {
    id: "p1", code: "BLOW-01", name: "吹叶机/吸叶机 双电池无刷套装", brand: "wild", store: "野趣",
    dev: "developing",
    eval: {
      FR: { node: "Souffleurs de feuilles", status: "launched", concl: "recommend", owner: "KK", report: "#" },
      DE: { node: "Laubbläser", status: "analyzing", concl: null, owner: "团队", report: null },
      UK: { node: "Leaf Blowers", status: "pending", concl: null, owner: null, report: null },
    },
    skus: [
      { id: "s1", code: "SKU-1 双电池无刷套装", site: "FR", asin: "—", price: 99.99, exec: "developing", brand: "wild" },
    ],
  },
  {
    id: "p2", code: "PUMP-AIRPRO", name: "电动充气泵 Air Pro 60PSI", brand: "Vercoryx", store: "乾数擎",
    dev: "shipping",
    eval: {
      FR: { node: "Gonfleurs et pompes électriques", status: "launched", concl: "recommend", owner: "KK", report: "#" },
      DE: { node: "Reifendruckkompressoren", status: "concluded", concl: "recommend", owner: "团队", report: "#" },
      UK: { node: "Tyre Inflators", status: "pending", concl: null, owner: null, report: null },
    },
    skus: [
      { id: "s2", code: "SKU-01 Air Pro 60PSI", site: "FR", asin: "B0GLWV84HC", price: 99.99, exec: "live", brand: "Vercoryx" },
      { id: "s3", code: "SKU-06 Air SUP 20", site: "FR", asin: "—", price: 79.99, exec: "developing", brand: "Vercoryx" },
      { id: "s4", code: "SKU-05 Air Bike Pro", site: "FR", asin: "—", price: 44.99, exec: "shipping", brand: "Vercoryx" },
      { id: "s5", code: "Gonfleur 150PSI mini", site: "DE", asin: "—", price: 39.99, exec: "planning", brand: "kinzon" },
    ],
  },
  {
    id: "p3", code: "IRRIG-01", name: "WiFi 智能灌溉控制器", brand: "wild", store: "野趣",
    dev: "researching",
    eval: {
      FR: { node: "Programmateurs d'arrosage", status: "concluded", concl: "watch", owner: "KK", report: "#" },
      DE: { node: "Bewässerungscomputer", status: "concluded", concl: "recommend", owner: "团队", report: "#" },
      UK: { node: "Water Timers", status: "pending", concl: null, owner: null, report: null },
    },
    skus: [],
  },
  {
    id: "p4", code: "FAN-01", name: "带灯吸顶风扇", brand: "kila", store: "胤顺",
    dev: "developing",
    eval: {
      FR: { node: "Ventilateurs de plafond avec lampe", status: "launched", concl: "recommend", owner: "KK", report: "#" },
      DE: { node: "Deckenventilatoren mit Lampe", status: "pending", concl: null, owner: null, report: null },
      UK: { node: "Ceiling Fans with Lights", status: "pending", concl: null, owner: null, report: null },
    },
    skus: [
      { id: "s6", code: "SKU-01 带灯吸顶风扇", site: "FR", asin: "—", price: 129.99, exec: "planning", brand: "kila" },
    ],
  },
];

// 假的跟踪时序 (仅给已 live 的 SKU)
const TRACKING = {
  s2: [
    { d: "07-28", bsr: 1420, rating: 4.3, rev: 86 },
    { d: "07-29", bsr: 1310, rating: 4.3, rev: 88 },
    { d: "07-30", bsr: 1180, rating: 4.4, rev: 91 },
    { d: "07-31", bsr: 1240, rating: 4.4, rev: 93 },
    { d: "08-01", bsr: 990, rating: 4.4, rev: 97 },
    { d: "08-02", bsr: 1050, rating: 4.4, rev: 99 },
    { d: "08-03", bsr: 870, rating: 4.5, rev: 104 },
  ],
};

// 品牌货架数据 (由 fetchShelfData 从 Supabase 拉取后填充)
let BRAND_SHELF = {};
let CAT_DETAIL = {};
// id → { kind, name, path } 名称映射 (供总览/site_evals 解析目标名称)
let ID_NAME = {};
// 调研中的 leaf 列表 (供总览看板"目前在调研的产品"栏目使用)
let IDLE_LEAVES = [];

// 作业交接框模板 (5 个阶段 · 4 个交接节点 · 核算每个阶段时间)
// items 由 Overview 从 monitor_handoff + shelf_leaves 实时组装
const HANDOFF_BOXES = [
  { id: "h1", title: "调研期间（调研到定款）", color: "#5b6670", sub: "" },
  { id: "h2", title: "链接制作期间（定款到上架完成）", color: "#d9a441", sub: "" },
  { id: "h3", title: "采购备货期间", color: "#3498db", sub: "" },
  { id: "h4", title: "进入可售状态", color: "#9b59b6", sub: "" },
];
// 交接框 → 类目明细里显示的阶段标签 (覆盖原"在调研-XX")
const HANDOFF_STEP_LABEL = {
  h1: "定款中",
  h2: "链接制作中",
  h3: "链接制作完成",
  h4: "备货运营推广",
};

// ---- 权限模型 ----
// 角色 → 拖拽规则
//   fromAny/toAny: true = 该方向不受限
//   否则按 from/to 数组匹配
// admin / fr 都给全权限 (KK 确认: admin + 法国成员都全权限)
const ROLE_PERMISSIONS = {
  admin:        { fromAny: true, toAny: true, label: "管理员" },
  fr:           { fromAny: true, toAny: true, label: "法国成员" },
  cd_supplier:  { from: ["h1"], to: ["h2"], label: "成都·供应链" },
  cd_link:      { from: ["h2"], to: ["h3"], label: "成都·链接" },
  cd_promotion: { from: ["h3"], to: ["h4"], label: "成都·推广" },
  cd_procurement: { from: [], to: [], label: "成都·采购" },
  finance:      { from: [], to: [], label: "财务专员" },   // KK 2026-09-18 新增: 六家店全可见可写, 不参与产品交接拖拽
};
// 邮箱 → 角色
const EMAIL_TO_ROLE = {
  "kinzon.eu@gmail.com":  "admin",          // KK
  "qianlin20222@163.com": "fr",             // 法国成员 (2026-08-07 确认, 全权限)
  "503279601@qq.com":     "cd_promotion",   // 成都·推广 (已确认)
  "2386332469@qq.com":    "cd_link",        // 成都·链接 (2026-08-07 确认)
  "2990206556@qq.com":    "cd_supplier",    // 成都·供应链 (2026-08-07 确认)
  "yellowdashi@sina.com": "cd_procurement", // 成都·采购 (财务核对, 2026-08-08 确认)
  "1416952931@qq.com":    "finance",        // 财务专员 (2026-09-18 确认)
  "xiefuguang@kinzon.eu": "warehouse",      // 仓储管理·谢福光 (2026-11-23 确认, 采购入库+发货录入)
};
const getUserRole = (email) => EMAIL_TO_ROLE[email] || null;
const getRoleLabel = (role) => (ROLE_PERMISSIONS[role] && ROLE_PERMISSIONS[role].label) || (role ? "未授权" : "未登录");

// ---------------- 店铺口径常量 (全局唯一来源) ----------------
// 所有财务/运营表的 store 一律用这 6 家中文店名 (不是品牌!)
// 「三家共享店」= 飞鸟 / 野趣 / 屿阔, 固定排最前, 保证月度核算的合并格连续
const OPS_FIXED_STORES = ["飞鸟", "野趣", "屿阔", "俊业", "乾霖", "胤顺"];   // KK 2026-09-17 定

// KK 2026-11-25: 三平台分割, 库存记录页顶部按平台切换 (Cdiscount 走 FBC 仓, ManoMano 先占位)
const PLATFORMS = [
  { key: "amazon",    label: "亚马逊" },
  { key: "cdiscount", label: "Cdiscount" },
  { key: "manomano",  label: "ManoMano" },
];
const PLATFORM_LABEL = Object.fromEntries(PLATFORMS.map(p => [p.key, p.label]));
const SHARE_GROUP = ["飞鸟", "野趣", "屿阔"];                                // 三家共享 (人工/场地)
const ALL_STORES = OPS_FIXED_STORES;
// 角色 → 可见店铺范围 (不在此表内的角色 = 全部 6 家)
const ROLE_STORES = { cd_procurement: SHARE_GROUP };

// 是否能拖动指定框里的项
const canDrag = (boxId, role) => {
  if (!role) return false;
  const p = ROLE_PERMISSIONS[role];
  if (!p) return false;
  if (p.fromAny) return true;
  return (p.from || []).includes(boxId);
};
// 是否能从 fromBox 拖到 toBox
const canDrop = (fromBox, toBox, role) => {
  if (!role) return false;
  const p = ROLE_PERMISSIONS[role];
  if (!p) return false;
  // admin / fr: 双向全开
  if (p.fromAny && p.toAny) return true;
  // 仅 fromAny: 任意框可拖出, 但只能放进 to 列表里的框
  if (p.fromAny) return (p.to || []).includes(toBox);
  // 仅 toAny: 任意框可放进, 但只能从 from 列表里的框拖出
  if (p.toAny) return (p.from || []).includes(fromBox);
  // 严格双向: from/to 都必须命中
  return (p.from || []).includes(fromBox) && (p.to || []).includes(toBox);
};

// 时间统计的空盒
const emptyBoxStat = () => ({
  total: 0, current: 0, historical: 0,
  avg: 0, median: 0, max: 0, min: 0,
  dist: { lt3: 0, d3_7: 0, d7_14: 0, gte14: 0 },
  byGroup: {},
});
// 友好时长 (天)
const fmtDays = (d) => d == null ? "—" : (d < 1 ? `${Math.max(1, Math.round(d * 24))} 小时` : `${d.toFixed(1)} 天`);

// 链接日级跟进 demo 数据 (按运营体系 v1: 以末端类目为单位组织, 四档警报)
// 真库版会从 monitor_categories / monitor_asins / monitor_daily 等表拉取
const ALERT_LEVEL = {
  critical: { label: "警戒", color: "#e74c3c", icon: "🔴" },
  warning:  { label: "预警", color: "#f4b400", icon: "🟡" },
  optimize: { label: "可优化", color: "#3498db", icon: "🔵" },
  normal:   { label: "正常", color: "#2ecc71", icon: "🟢" },
};
const MONITOR_CATEGORIES = [
  {
    id: "mc1", name: "Cuisine et Maison › Rangement et organisation", site: "FR",
    level: "warning", updated: "2026-08-06",
    self: [{ asin: "B0HC9Z7KRY", title: "Housses de rangement sous vide", price: 19.99, bsr: 1240, rating: 4.4, reviews: 87, stock: "in_stock" }],
    fixed: [
      { asin: "B0RXCOMP01", title: "Lot de 10 housses sous vide", price: 14.99, bsr: 980, rating: 4.3, reviews: 215, stock: "in_stock" },
      { asin: "B0RXCOMP02", title: "Housses sous vide XXL 60L", price: 22.50, bsr: 1530, rating: 4.5, reviews: 142, stock: "in_stock" },
      { asin: "B0RXCOMP03", title: "Rangement sous vide premium", price: 28.90, bsr: 720, rating: 4.2, reviews: 304, stock: "in_stock" },
    ],
    dynamic: [
      { asin: "B0RXDYN001", title: "Sacs sous vide épais", price: 16.49, bsr: 1110, rating: 4.4, reviews: 178, stock: "in_stock" },
      { asin: "B0RXDYN002", title: "Housses rangement voyage", price: 12.99, bsr: 2200, rating: 4.1, reviews: 89, stock: "in_stock" },
    ],
    alerts: [{ rule: "BSR 日波动 +18%", level: "warning", detail: "排名较昨日下降超过阈值" }],
  },
  {
    id: "mc2", name: "Auto et Moto › Outils de dépannage", site: "FR",
    level: "optimize", updated: "2026-08-06",
    self: [{ asin: "B0HC9Z7KRY", title: "Chargeurs de batterie 01", price: 49.99, bsr: 870, rating: 4.5, reviews: 104, stock: "in_stock" }],
    fixed: [
      { asin: "B0RXCOMP04", title: "Chargeur batterie intelligent", price: 45.99, bsr: 720, rating: 4.4, reviews: 256, stock: "in_stock" },
      { asin: "B0RXCOMP05", title: "Chargeur batterie 12V pro", price: 62.50, bsr: 1100, rating: 4.6, reviews: 178, stock: "low_stock" },
    ],
    dynamic: [
      { asin: "B0RXDYN003", title: "Chargeur batterie USB-C", price: 39.99, bsr: 1500, rating: 4.2, reviews: 67, stock: "in_stock" },
      { asin: "B0RXDYN004", title: "Booster batterie portable", price: 79.00, bsr: 920, rating: 4.5, reviews: 412, stock: "in_stock" },
    ],
    alerts: [{ rule: "竞品评论激增 +24", level: "optimize", detail: "固定竞品单日新增 24 条评论" }],
  },
  {
    id: "mc3", name: "Animalerie › Chiens › Colliers anti-aboiement", site: "FR",
    level: "critical", updated: "2026-08-06",
    self: [{ asin: "B0RXOWN01", title: "Collier anti-aboiement A", price: 39.99, bsr: 320, rating: 3.8, reviews: 256, stock: "out_of_stock" }],
    fixed: [
      { asin: "B0RXCOMP06", title: "Collier anti-aboiement B", price: 45.00, bsr: 180, rating: 4.4, reviews: 1024, stock: "in_stock" },
      { asin: "B0RXCOMP07", title: "Collier dressage chien", price: 52.00, bsr: 240, rating: 4.3, reviews: 612, stock: "in_stock" },
    ],
    dynamic: [
      { asin: "B0RXDYN005", title: "Collier anti-aboiement v2", price: 35.00, bsr: 410, rating: 4.2, reviews: 89, stock: "in_stock" },
      { asin: "B0RXDYN006", title: "Harnais dressage", price: 28.50, bsr: 560, rating: 4.0, reviews: 134, stock: "in_stock" },
    ],
    alerts: [
      { rule: "自有库存缺货", level: "critical", detail: "B0RXOWN01 当前显示缺货" },
      { rule: "新增 1-3 星评论 × 2", level: "critical", detail: "近 24h 新增 2 条差评" },
    ],
  },
  {
    id: "mc4", name: "Bricolage DIY › Électricité", site: "FR",
    level: "normal", updated: "2026-08-05",
    self: [{ asin: "B0RXOWN02", title: "Prises connectées et intelligentes", price: 24.99, bsr: 1850, rating: 4.6, reviews: 312, stock: "in_stock" }],
    fixed: [
      { asin: "B0RXCOMP08", title: "Pack 4 prises WiFi", price: 32.00, bsr: 920, rating: 4.5, reviews: 845, stock: "in_stock" },
      { asin: "B0RXCOMP09", title: "Prise connectée Alexa", price: 19.99, bsr: 1230, rating: 4.4, reviews: 567, stock: "in_stock" },
    ],
    dynamic: [
      { asin: "B0RXDYN007", title: "Mini prise WiFi", price: 12.99, bsr: 2100, rating: 4.3, reviews: 234, stock: "in_stock" },
      { asin: "B0RXDYN008", title: "Prise extérieure étanche", price: 28.00, bsr: 1450, rating: 4.5, reviews: 156, stock: "in_stock" },
    ],
    alerts: [],
  },
];

// 从 Supabase 并行拉取 6 张表, 组装成 BRAND_SHELF / CAT_DETAIL
// 形状与旧硬编码一致, 货架/跨站组件无需改动
// 顶层: 新模型递归统计 (KK 2026-08-10, 必须放在顶层, 防 Vite mangle)
function tallyCatDeepV2(cat) {
  let sell = 0, idle = 0;
  const visit = (c) => {
    const d = CAT_DETAIL[c.id];
    if (d && d.products) for (let i = 0; i < d.products.length; i++) {
      const p = d.products[i];
      if (p.st === "selling") sell++;
      else if (p.st === "idle") idle++;
    }
    // cat 自身的 st 也计入 (KK 2026-08-10, 之前只算 products 漏了 cat 自身)
    if (c.st === "selling") sell++;
    else if (c.st === "idle") idle++;
    if (c.children) for (let j = 0; j < c.children.length; j++) visit(c.children[j]);
  };
  visit(cat);
  return { sell, idle };
}

// 子类目排序: 在售 → 在调研 → 还没动 → 不做 (KK 2026-08-10)
const CAT_ST_ORDER = { selling: 0, idle: 1, ready: 2, skip: 3, researched_skip: 3 };
const sortCatsBySt = (cats) => {
  const arr = [...(cats || [])];
  arr.sort((a, b) => (CAT_ST_ORDER[a.st] !== undefined ? CAT_ST_ORDER[a.st] : 1) - (CAT_ST_ORDER[b.st] !== undefined ? CAT_ST_ORDER[b.st] : 1) || (a.sort_order || 0) - (b.sort_order || 0));
  return arr;
};

async function fetchShelfData() {
  const [br, gr, ca, le, pr, su] = await Promise.all([
    supabase.from("brands").select("*").order("sort_order"),
    supabase.from("shelf_groups").select("*").order("sort_order"),
    supabase.from("shelf_cats").select("*").order("sort_order"),
    supabase.from("shelf_leaves").select("*").order("sort_order"),
    supabase.from("products").select("*").order("sort_order"),
    supabase.from("suppliers").select("*").order("sort_order"),
  ]);
  if (br.error) throw br.error;
  const brands = br.data || [];
  const groups = gr.data || [];
  const cats = ca.data || [];
  const leaves = le.data || [];
  const products = pr.data || [];
  const suppliers = su.data || [];

  const groupsByBrand = {};
  groups.forEach(g => { (groupsByBrand[g.brand_code] = groupsByBrand[g.brand_code] || []).push(g); });
  const catsByGroup = {};
  cats.forEach(c => { (catsByGroup[c.group_id] = catsByGroup[c.group_id] || []).push(c); });
  const leavesByCat = {};
  leaves.forEach(l => { (leavesByCat[l.cat_id] = leavesByCat[l.cat_id] || []).push(l); });
  const productsByLeaf = {};
  products.forEach(p => { (productsByLeaf[p.leaf_id] = productsByLeaf[p.leaf_id] || []).push(p); });
  // 产品直接挂 cat (新模型, KK 2026-08-10)
  const productsByCat = {};
  products.forEach(p => { if (p.cat_id) (productsByCat[p.cat_id] = productsByCat[p.cat_id] || []).push(p); });
  const suppliersByLeaf = {};
  suppliers.forEach(s => { (suppliersByLeaf[s.leaf_id] = suppliersByLeaf[s.leaf_id] || []).push(s); });

  const buildProducts = (leafId) => (productsByLeaf[leafId] || []).map(p => ({
    id: p.id, name: p.name, st: p.st || "idle", asin: p.asin || null,
    spu: p.spu || null,
    variant_count: p.variant_count || 0,
    variants: p.variants || [],
    variant_colors: p.variant_colors || [],
    variant_sizes: p.variant_sizes || [],
    phase: p.phase || null,
  }));
  const buildSuppliers = (leafId) => (suppliersByLeaf[leafId] || []).map(s => ({ id: s.id, factory: s.factory, contact: s.contact, products: s.main_products }));
  const buildLeaves = (catId) => (leavesByCat[catId] || []).map(l => ({ id: l.id, leaf: l.leaf_name, path: l.path, st: l.st || "idle", phase: l.phase || null, chatName: l.chat_name || null, chatUrl: l.chat_url || null, products: buildProducts(l.id), suppliers: buildSuppliers(l.id) }));

  // CAT_DETAIL: 三重 key 兼容旧 catDetail(name, group) 查找
  CAT_DETAIL = {};
  cats.forEach(c => {
    const g = groups.find(x => x.id === c.group_id);
    const gName = g ? g.name : "";
    const entry = { leaves: buildLeaves(c.id), products: (productsByCat[c.id] || []).map(p => ({ id: p.id, name: p.name, st: p.st || "idle", asin: p.asin || null, spu: p.spu || null, variant_count: p.variant_count || 0, variants: p.variants || [], variant_colors: p.variant_colors || [], variant_sizes: p.variant_sizes || [] })) };
    CAT_DETAIL[gName + " || " + c.name] = entry;
    CAT_DETAIL[c.id] = entry;
    if (!CAT_DETAIL[c.name]) CAT_DETAIL[c.name] = entry;
  });

  // BRAND_SHELF: flat 品牌把所有组的类目拍平进一个 __flat__ 组
  BRAND_SHELF = {};
  // cat 嵌套树: parent_cat_id → children
  const catsByParent = {};
  cats.forEach(c => {
    if (c.parent_cat_id) (catsByParent[c.parent_cat_id] = catsByParent[c.parent_cat_id] || []).push(c);
  });
  const buildCatTree = (parentId) => (catsByParent[parentId] || [])
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(c => ({
      id: c.id, name: c.name, st: c.st || "idle",
      phase: c.phase || null,
      chatName: c.chat_name || null, chatUrl: c.chat_url || null,
      children: buildCatTree(c.id),
    }));
  const mapRootCat = (c) => ({
    id: c.id, name: c.name, st: c.st || "idle",
    phase: c.phase || null,
    chatName: c.chat_name || null, chatUrl: c.chat_url || null,
    children: buildCatTree(c.id),
  });
  brands.forEach(b => {
    const bs = { store: b.store, fullName: b.full_name, flat: !!b.flat, groups: [] };
    const myGroups = groupsByBrand[b.code] || [];
    if (b.flat) {
      const allCats = myGroups.flatMap(g => (catsByGroup[g.id] || []).filter(c => !c.parent_cat_id).map(mapRootCat));
      bs.groups = [{ name: "__flat__", cats: allCats }];
    } else {
      bs.groups = myGroups.map(g => ({
        name: g.name,
        cats: (catsByGroup[g.id] || []).filter(c => !c.parent_cat_id).map(mapRootCat),
      }));
    }
    BRAND_SHELF[b.code] = bs;
  });

  // ID_NAME: 全量 id → 名称映射
  ID_NAME = {};
  cats.forEach(c => { const g = groups.find(x => x.id === c.group_id); ID_NAME[c.id] = { kind: "cat", name: c.name, path: (g ? g.name : "") + " / " + c.name }; });
  leaves.forEach(l => { ID_NAME[l.id] = { kind: "leaf", name: l.leaf_name, path: l.path || l.leaf_name, phase: l.phase || null, st: l.st || "idle" }; });
  products.forEach(p => { ID_NAME[p.id] = { kind: "product", name: p.name, path: p.name }; });

  // IDLE_LEAVES: 调研中的 leaf (st=idle), 按 phase 分组
  IDLE_LEAVES = leaves.filter(l => (l.st || "idle") === "idle").map(l => ({
    id: l.id,
    name: l.leaf_name,
    phase: l.phase || null,
    path: l.path || l.leaf_name,
    updatedAt: l.updated_at || null,
  }));
}
const SHELF_ST = {
  selling:  { label: "在售",     color: "#16A34A", bg: "#DCFCE7", fg: "#166534" },
  ready:    { label: "还没动",   color: "#64748B", bg: "#F1F5F9", fg: "#334155" },
  idle:     { label: "在调研",   color: "#2563EB", bg: "#DBEAFE", fg: "#1D4ED8" },
  skip:     { label: "不做",     color: "#DC2626", bg: "#FEE2E2", fg: "#991B1B" },
  researched_skip: { label: "不做", color: "#DC2626", bg: "#FEE2E2", fg: "#991B1B" },
};

// 交接框 ↔ 允许的类目状态 (KK 确认 2026-08-07: 状态与阶段必须一致, 否则报错)
//   h1 调研期间 / h2 链接制作 / h3 采购备货 → 只能 idle (还没动/开发中)
//   h4 进入可售 → 只能 selling (在售)
//   不在交接框 → 4 档自由 (货架老数据)
const BOX_ALLOWED_ST = {
  h1: ["idle"],
  h2: ["idle"],
  h3: ["idle"],
  h4: ["selling"],
};

// 调研阶段 (leaf 的 idle 细分): 1 拉数据 → 2 出报告 → 3 1688供应链 → 4 看样品
// 中文显示为 "在调研-拉数据" 等, 挂在 st=idle 的 leaf 上, phase 为空 = 笼统"在调研"
// 注: DB 里的 phase 键仍是 planning / pre_research / supplier / spec(不改键, 防历史数据丢), 只改显示名 — KK 2026-10-22
const LEAF_PHASE = {
  planning:    { label: "在调研-拉数据", color: "#d9a441" },
  pre_research:{ label: "在调研-出报告", color: "#d9a441" },
  supplier:    { label: "在调研-1688供应链", color: "#d9a441" },
  spec:        { label: "在调研-看样品", color: "#d9a441" },
};

// CAT_DETAIL 由 fetchShelfData() 填充 (见上)
function catDetail(name, groupName) {
  if (groupName) {
    const scoped = `${groupName} || ${name}`;
    if (CAT_DETAIL[scoped]) return CAT_DETAIL[scoped];
  }
  if (CAT_DETAIL[name]) return CAT_DETAIL[name];
  const key = Object.keys(CAT_DETAIL).find(k => !k.includes(" || ") && (name.startsWith(k) || name.includes(k)));
  return key ? CAT_DETAIL[key] : null;
}



const FUNNEL = [
  { key: "pending", label: "待分析" },
  { key: "analyzing", label: "分析中" },
  { key: "concluded", label: "已出结论" },
  { key: "launched", label: "已立项" },
];
const EXEC = [
  { key: "planning", label: "规划" },
  { key: "developing", label: "开发" },
  { key: "shipping", label: "在途" },
  { key: "live", label: "已上架" },
  { key: "tracking", label: "跟踪" },
];

const C = {
  bg: "#101418", panel: "#171d23", panel2: "#1e262e", line: "#2a333c",
  ink: "#e8edf2", sub: "#8b97a3", faint: "#5b6670",
  brand: "#4db6a4", // 主色 teal
  rec: "#4db6a4", watch: "#d9a441", drop: "#c05b52",
  fr: "#4db6a4", de: "#6f8fd0", uk: "#c08fd0",
};

const conclColor = (c) => c === "recommend" ? C.rec : c === "watch" ? C.watch : c === "drop" ? C.drop : C.faint;
const conclText = (c) => c === "recommend" ? "推荐" : c === "watch" ? "观望" : c === "drop" ? "放弃" : "—";
const statusText = (s) => (FUNNEL.find(f => f.key === s) || {}).label || s;
const execText = (s) => (EXEC.find(f => f.key === s) || {}).label || s;

// ---- 登录页 ----
function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) setErr(error.message);
    setBusy(false);
  };

  return (
    <div style={{ background: C.bg, color: C.ink, minHeight: "100vh", fontFamily: "'Inter',system-ui,sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 360, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 32 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>亚马逊精品系统</div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 28 }}>KinZon SAS · 登录</div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 5 }}>邮箱</div>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
            style={{ width: "100%", padding: "10px 12px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 13, outline: "none" }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 5 }}>密码</div>
          <input value={pw} onChange={e => setPw(e.target.value)} type="password" placeholder="••••••"
            onKeyDown={e => e.key === "Enter" && go()}
            style={{ width: "100%", padding: "10px 12px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 13, outline: "none" }} />
        </div>
        {err && <div style={{ fontSize: 12, color: "#c05b52", marginBottom: 14 }}>{err}</div>}
        <button onClick={go} disabled={busy}
          style={{ width: "100%", padding: "10px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "登录中…" : "登 录"}
        </button>
      </div>
    </div>
  );
}

// 页面级错误兜底: 捕获子组件渲染异常, 把报错显示出来而不是整页白屏
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error("[页面渲染出错]", err, info); }
  render() {
    if (this.state.err) {
      const e = this.state.err;
      return (
        <div style={{ background: C.panel, border: "1px solid #c05b52", borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e0857a", marginBottom: 6 }}>这个页面渲染出错了</div>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>
            把下面这段文字发给 KK 就能定位问题; 也可以先点「重试」。
          </div>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 11, color: C.ink, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, maxHeight: 260, overflow: "auto", margin: 0 }}>
            {String((e && (e.stack || e.message)) || e)}
          </pre>
          <button onClick={() => this.setState({ err: null })}
            style={{ marginTop: 12, padding: "6px 14px", background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined=loading, null=not logged in
  const [tab, setTab] = useState("overview");
  const [sel, setSel] = useState(null);
  const [selSku, setSelSku] = useState("s2");
  const [shelfReady, setShelfReady] = useState(false);
  const [shelfErr, setShelfErr] = useState(null);
  const [siteEvals, setSiteEvals] = useState([]);
  // 当前用户角色 (财务 Tab 仅 admin 可见)
  const [curRole, setCurRole] = useState(null);
  // 财务专员只有一个板块: 发货记录 → 办公室费用明细 (产品侧 Tab 全部隐藏) — KK 2026-09-18
  const FINANCE_TAB_KEYS = ["shipments", "inventory", "afterstock", "orderrecords", "purchase", "opsfee", "storeother", "ordersummary", "storemonthly", "finance", "officeexpense"];
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data && data.user) setCurRole(getUserRole(data.user.email || ""));
    });
  }, []);
  // 角色取回后, 若当前 Tab 不在该角色可见范围内 → 落到第一个可见 Tab
  useEffect(() => {
    if (curRole === "finance" && !FINANCE_TAB_KEYS.includes(tab)) setTab("shipments");
    // 仓储管理只有采购入库 + 发货记录 — 2026-11-23
    if (curRole === "warehouse" && !["purchase", "shipments"].includes(tab)) setTab("shipments");
  }, [curRole, tab]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // 登录后拉取货架数据 (拉到前显示加载态, 避免渲染空壳)
  useEffect(() => {
    if (!session) { setShelfReady(false); setShelfErr(null); return; }
    let on = true;
    setShelfErr(null);
    fetchShelfData()
      .then(() => { if (on) setShelfReady(true); })
      .catch(e => { if (on) setShelfErr(e); });
    return () => { on = false; };
  }, [session]);

  // 登录后拉取跨站评估数据 (总览看板用)
  useEffect(() => {
    if (!session) return;
    let on = true;
    supabase.from("site_evals").select("*").order("site")
      .then(({ data, error }) => { if (on && !error) setSiteEvals(data || []); })
      .catch(() => {});
    return () => { on = false; };
  }, [session]);

  // 加载中
  if (session === undefined) return (
    <div style={{ background: C.bg, color: C.sub, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',system-ui,sans-serif" }}>
      加载中…
    </div>
  );

  // 未登录 → 登录页
  if (!session) return <Login />;

  // 已登录但货架数据未就绪 → 加载/错误态
  if (shelfErr) return (
    <div style={{ background: C.bg, color: C.sub, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ color: C.drop }}>货架数据加载失败：{String(shelfErr.message || shelfErr)}</div>
      <button onClick={() => { setShelfErr(null); fetchShelfData().then(() => setShelfReady(true)).catch(e => setShelfErr(e)); }}
        style={{ fontSize: 12, color: C.ink, background: C.panel2, border: `1px solid ${C.line}`, padding: "6px 16px", borderRadius: 8, cursor: "pointer" }}>重试</button>
    </div>
  );
  if (!shelfReady) return (
    <div style={{ background: C.bg, color: C.sub, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',system-ui,sans-serif" }}>
      加载货架数据…
    </div>
  );

  return (
    <div style={{ background: C.bg, color: C.ink, minHeight: "100vh", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        .tab { padding:5px 8px; border-radius:6px; cursor:pointer; font-size:12px; letter-spacing:0; border:1px solid transparent; white-space:nowrap; }
        .tab:hover { background:${C.panel2}; }
        .cell:hover { background:${C.panel2}; }
        .prow:hover { background:${C.panel2}; cursor:pointer; }
      `}</style>

      {/* header */}
      <div style={{ borderBottom: `1px solid ${C.line}`, padding: "18px 28px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: ".01em" }}>亚马逊精品系统</div>
        <div style={{ fontSize: 12, color: C.sub }}>KinZon · FR / DE / UK</div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: C.faint }}>{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()}
            style={{ fontSize: 11, color: C.sub, background: "transparent", border: `1px solid ${C.line}`, padding: "3px 10px", borderRadius: 6, cursor: "pointer" }}>
            退出
          </button>
        </div>
      </div>

      {/* tabs — 紧凑单行 (KK 2026-09-18: 压缩间距, 尽量一行; flexWrap 仅作兜底) */}
      <div style={{ display: "flex", gap: 4, rowGap: 4, flexWrap: "wrap", padding: "12px 18px 0" }}>
        {[
          // 仓储管理: 只看采购入库 + 发货记录 — 2026-11-23 KK 定
          ...(curRole === "warehouse" ? [["purchase", "采购管理"], ["shipments", "发货记录"]] : [
          // 监控指标体系: 第一页 + 仅 KK 本人可见 (按邮箱锁, 其他 admin 也看不到) — KK 2026-11-23 定
          ...(session?.user?.email === KPI_OWNER_EMAIL ? [["kpi", "监控指标体系"]] : []),
          // 产品侧 Tab (类目/链接/监控): 财务专员不需要, 全部隐藏 — KK 2026-09-18
          ...(curRole === "finance" ? [] : [["shelf", "类目明细"], ["overview", "开发进度"], ["cross", "跨站点开发"], ["progress", "链接进度"], ["score", "链接评分"], ["track", "日级跟进"], ["asinlife", "ASIN"], ["adanalysis", "广告分析"]]),
          ["purchase", "采购管理"], ["shipments", "发货记录"], ["inventory", "库存统计"], ["afterstock", "售后库存"], ["orderrecords", "订单记录"],
          // 单品月度订单统计: 紧跟「订单记录」+ admin/黄丹/财务专员 — 2026-09-18 KK 定
          ...(["admin", "cd_procurement", "finance"].includes(curRole) ? [["ordersummary", "单品统计"]] : []),
          // 店铺运维费用: admin + 成都·供应链 + 成都·采购(黄丹) + 财务专员 + 成都·推广(诗琪) — 2026-10-20 KK 定
          ...(["admin", "cd_supplier", "cd_procurement", "finance", "cd_promotion"].includes(curRole) ? [["opsfee", "运维费用"]] : []),
          // 店铺其他费用: 全部成员 — 2026-09-17 KK 定
          ["storeother", "其他费用"],
          // 店铺月度核算: 仅管理层 (admin + 法国成员 fr + 成都采购 黄丹 + 财务专员) — KK 2026-09-16/18 定
          ...(["admin", "fr", "cd_procurement", "finance"].includes(curRole) ? [["storemonthly", "月度核算"]] : []),
          // 财务核算: admin + 成都采购(黄丹) + 财务专员 — 2026-09-18 KK 定
          ...(["admin", "cd_procurement", "finance"].includes(curRole) ? [["finance", "财务核算"]] : []),
          // 办公室费用明细: 可见 = admin(你) + fr(泺伊) + 黄丹 + 财务专员(夏蕾); 登记只有黄丹 — KK 2026-09-18 定
          ...(["admin", "fr", "cd_procurement", "finance"].includes(curRole) ? [["officeexpense", "办公室费用"]] : []),
          // 现金账: 只有 KK 本人可见 — 按邮箱锁, 其他 admin(bot) 看不到 — KK 2026-11-22 定
          ...(session?.user?.email === CASH_OWNER_EMAIL ? [["cashbook", "现金账"]] : [])
          ])
        ].map(([k, l]) => (
          <div key={k} className="tab" onClick={() => setTab(k)}
            style={{ background: tab === k ? C.panel : "transparent", border: tab === k ? `1px solid ${C.line}` : "1px solid transparent", color: tab === k ? C.ink : C.sub }}>
            {l}
          </div>
        ))}
      </div>

      <div style={{ padding: "20px 24px 60px" }}>
        {/* 页面级错误兜底: 任何页面渲染报错都不再白屏, 而是把原因显示出来 (便于排查) */}
        <ErrorBoundary key={tab}>
        {tab === "kpi" && <KpiDashboard />}
        {tab === "shelf" && <Shelf />}
        {tab === "overview" && <Overview siteEvals={siteEvals} onPick={(p) => { setSel(p); setTab("cross"); }} />}
        {tab === "cross" && <CrossSite sel={sel} setSel={setSel} />}
        {tab === "track" && <Track selSku={selSku} setSelSku={setSelSku} />}
        {tab === "progress" && <LinkProgress />}
        {tab === "purchase" && <Purchase />}
        {tab === "shipments" && <Shipments />}
        {tab === "inventory" && <InventoryStats />}
        {tab === "afterstock" && <AfterStock />}
        {tab === "orderrecords" && <OrderRecords />}
        {tab === "asinlife" && <AsinLifecycle />}
        {tab === "adanalysis" && <AdAnalysis />}
        {tab === "score" && <LinkScore />}
        {tab === "ordersummary" && <OrderSummary />}
        {tab === "opsfee" && <OpsFee />}
        {tab === "storeother" && <StoreOtherExpense />}
        {tab === "storemonthly" && <StoreMonthly />}
        {tab === "finance" && <Finance />}
        {tab === "officeexpense" && <OfficeExpense />}
        {tab === "cashbook" && <CashBook />}
        </ErrorBoundary>
      </div>
    </div>
  );
}

// ---------------- 开发进度: 调研阶段 + 作业交接 (可拖拽) ----------------
function Overview({ siteEvals, onPick }) {
  // 作业交接: monitor_handoff 数据 (leaf_id → {box_key, start_at})
  const [handoffs, setHandoffs] = useState([]);
  // 交接历史 log (时间统计用)
  const [handoffLog, setHandoffLog] = useState([]);
  const [dragId, setDragId] = useState(null);
  const [hoverBox, setHoverBox] = useState(null);
  // 当前用户 + 角色 (从 EMAIL_TO_ROLE 解析)
  const [currentEmail, setCurrentEmail] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data && data.user) setCurrentEmail(data.user.email || ""); });
  }, []);
  const userRole = getUserRole(currentEmail);
  const roleLabel = getRoleLabel(userRole);
  // admin / 法国成员 → 阶段转化分析可见
  const isAdmin = userRole === "admin";
  const isFullAccess = userRole === "admin" || userRole === "fr";
  const [openPhases, setOpenPhases] = useState({});
  // 调研 4 阶段框的拖拽高亮 (按 phase key 索引, 修复前误用 useState-in-map 导致 hooks 违规)
  const [phaseDrag, setPhaseDrag] = useState({});
  // 调研阶段顺序 (拖拽流转: planning → pre_research → supplier → spec)
  const PHASE_ORDER = ["planning", "pre_research", "supplier", "spec"];
  // 调研阶段进度 (leaf_id+phase → start_at) - 显示进入时间 + 持续时长
  const [progress, setProgress] = useState([]);
  const [tick2, setTick2] = useState(0); // 拖拽换 phase 后强制刷新
  // 阶段转化分析: 起止日期 + 转化统计
  const [fromDate, setFromDate] = useState("2026-07-01");
  const [toDate, setToDate] = useState("2026-08-07");
  // leaf → 一级类目 (group 名) - 用于聚合显示
  const [lToGroup, setLToGroup] = useState({});

  const loadHandoffs = async () => {
    const { data, error } = await supabase.from("monitor_handoff").select("*");
    if (!error) setHandoffs(data || []);
  };
  useEffect(() => {
    (async () => {
      const [{ data: ls }, { data: cs }, { data: gs }, { data: bs }] = await Promise.all([
        supabase.from("shelf_leaves").select("id, leaf_name, cat_id"),
        supabase.from("shelf_cats").select("id, name, group_id"),
        supabase.from("shelf_groups").select("id, name, brand_code"),
        supabase.from("brands").select("code, full_name"),
      ]);
      const gById = {}; (gs || []).forEach(g => gById[g.id] = g);
      const cById = {}; (cs || []).forEach(c => cById[c.id] = c);
      const bByCode = {}; (bs || []).forEach(b => bByCode[b.code] = b);
      const m = {};
      (ls || []).forEach(l => {
        const c = cById[l.cat_id];
        const g = c && gById[c.group_id];
        const b = g && bByCode[g.brand_code];
        m[l.id] = {
          group: g ? g.name : null,
          groupId: g ? g.id : null,
          brand: b ? (b.full_name || b.code) : null,
          cat: c ? c.name : null,
        };
      });
      setLToGroup(m);
    })();
  }, []);
  useEffect(() => { loadHandoffs(); }, []);

  // 拉取交接历史 log (用于 h2/h3 时间统计, 需要 KK 先建表 monitor_handoff_log)
  const loadHandoffLog = async () => {
    try {
      const { data, error } = await supabase.from("monitor_handoff_log").select("*").order("moved_at");
      if (error) { setHandoffLog([]); return; }
      setHandoffLog(data || []);
    } catch (e) {
      setHandoffLog([]);
    }
  };
  useEffect(() => { loadHandoffLog(); }, []);

  // 组装: 每个框按 brand 聚合 (一级类目), 数量为 leaf 总数
  const boxMap = useMemo(() => {
    const m = {};
    HANDOFF_BOXES.forEach(b => { m[b.id] = { total: 0, byGroup: {} }; });
    (handoffs || []).forEach(h => {
      const info = h.cat_id ? (ID_NAME[h.cat_id] || null) : (ID_NAME[h.leaf_id] || null);
      if (!info) return;
      // 旧 leaf: h1 只显示 phase=planning; 新 cat: 全部显示
      if (h.box_key === "h1" && !h.cat_id && info.phase !== "planning") return;
      const start = h.start_at ? new Date(h.start_at) : null;
      const dur = start ? ((Date.now() - start.getTime()) / 86400000) : null;
      const durText = dur == null ? "—" : (dur < 1 ? `${Math.max(1, Math.round(dur * 24))} 小时` : `${Math.floor(dur)} 天 ${Math.round((dur % 1) * 24)} 小时`);
      // cat 卡的 group: 用 ID_NAME 查 path 拼出大类名, 否则 "未分类"
      const catInfo = h.cat_id ? ID_NAME[h.cat_id] : null;
      const lg = h.cat_id ? { group: (catInfo && catInfo.path) ? catInfo.path.split("/")[0].trim() : "未分类" } : (lToGroup[h.leaf_id] || {});
      const group = lg.group || "未分类";
      if (!m[h.box_key].byGroup[group]) m[h.box_key].byGroup[group] = [];
      m[h.box_key].byGroup[group].push({
        leafId: h.leaf_id,
        catId: h.cat_id,
        name: info.name,
        start: start ? start.toLocaleDateString("zh-CN") : "—",
        duration: durText,
      });
      m[h.box_key].total++;
    });
    return m;
  }, [handoffs, lToGroup]);

  // 拖拽换框: 权限检查 + 一致性校验 + 写历史 log + 重置计时
  // 规则:
  //   h1 → h2: 仅 成都供应链 + admin/fr
  //   h2 → h3: 仅 成都链接 + admin/fr
  //   h3 → h4: 仅 成都推广 + admin/fr
  //   admin/fr: 任意方向; 拖出 h1 → 其他框 (非 h2) 移出流程并标 researched_skip
  //   一致性: 目标框要求的状态与类目当前状态必须匹配 (BOX_ALLOWED_ST), 否则报错
  const moveTo = async (itemId, targetBox, isCat) => {
    if (!itemId || !targetBox) return;
    const isCatItem = !!isCat;
    // 找当前 box
    const cur = (handoffs || []).find(h => isCatItem ? h.cat_id === itemId : h.leaf_id === itemId);
    const fromBox = cur ? cur.box_key : null;
    // 权限检查
    if (!canDrop(fromBox, targetBox, userRole)) {
      const fromTitle = fromBox ? (HANDOFF_BOXES.find(b => b.id === fromBox) || {}).title : "(无)";
      const toTitle = (HANDOFF_BOXES.find(b => b.id === targetBox) || {}).title || targetBox;
      alert(`无权操作：${roleLabel} 不能把类目从「${fromTitle}」拖到「${toTitle}」`);
      return;
    }
    const now = new Date().toISOString();
    const info2 = ID_NAME[itemId];
    // admin/fr 拖出 h1 (到非 h2 框) → 移出交接流程 + 标 researched_skip
    if (isFullAccess && fromBox === "h1" && targetBox !== "h2") {
      const ok = confirm(`放弃此调研：将 "${info2 ? info2.name : itemId}" 标记为「已调研不做」并移出交接流程？`);
      if (!ok) return;
      if (isCatItem) {
        await supabase.from("shelf_cats").update({ st: "researched_skip" }).eq("id", itemId);
        await supabase.from("monitor_handoff").delete().eq("cat_id", itemId);
      } else {
        await supabase.from("shelf_leaves").update({ st: "researched_skip", phase: null }).eq("id", itemId);
        await supabase.from("monitor_handoff").delete().eq("leaf_id", itemId);
      }
      try {
        await supabase.from("monitor_handoff_log").insert({
          leaf_id: isCatItem ? null : itemId, cat_id: isCatItem ? itemId : null,
          from_box: fromBox, to_box: null, moved_at: now,
          moved_by_email: currentEmail, note: "researched_skip",
        });
      } catch (e) { /* 表可能未建 */ }
      await Promise.all([loadHandoffs(), loadHandoffLog()]);
      try { await fetchShelfData(); } catch (e) {}
      return;
    }
    // 一致性校验: 目标框要求的状态与类目当前状态匹配 (KK: 不一致弹报错框)
    // cat 跳过校验: 拖到 h4 自动变在售, 拖到 h2/h3 自动在调研 (KK 2026-08-10)
    const curSt = info2 ? info2.st : null;
    const allowedSt = BOX_ALLOWED_ST[targetBox];
    if (!isCatItem && allowedSt && curSt && !allowedSt.includes(curSt)) {
      const boxTitle = (HANDOFF_BOXES.find(b => b.id === targetBox) || {}).title || targetBox;
      const stLabel = SHELF_ST[curSt] ? SHELF_ST[curSt].label : curSt;
      const needLabel = allowedSt.map(s => (SHELF_ST[s] || {}).label || s).join(" / ");
      alert(`状态不一致：该类目当前是「${stLabel}」，不能拖到「${boxTitle}」（此阶段要求「${needLabel}」）。\n请先在类目明细把状态改为「${needLabel}」（或由管理员操作）。`);
      return;
    }
    // 规则: 类目必须完成调研闭环(定款 spec) 才能从调研期间(h1)拖到作业交接 (KK 2026-08-10)
    if (isCatItem && fromBox === "h1" && targetBox !== "h1" && info2 && info2.phase !== "spec") {
      alert("该类目还在调研阶段，未到「看样品」，不能进入作业交接。请先在「在调研」4 阶段中拖到「看样品」后再交接。");
      return;
    }
    // 写主表
    const payload = isCatItem
      ? { cat_id: itemId, leaf_id: null, box_key: targetBox, start_at: now }
      : { leaf_id: itemId, box_key: targetBox, start_at: now };
    const { error } = await supabase.from("monitor_handoff").upsert(payload, { onConflict: isCatItem ? "cat_id" : "leaf_id" });
    if (error) { alert("保存失败: " + error.message); return; }
    // 联动: cat 拖到 h4 → 类目明细变在售; h2/h3 → 在调研 (KK 2026-08-10)
    if (isCatItem) {
      if (targetBox === "h4") await supabase.from("shelf_cats").update({ st: "selling" }).eq("id", itemId);
      else if (targetBox === "h2" || targetBox === "h3") await supabase.from("shelf_cats").update({ st: "idle" }).eq("id", itemId);
    }
    // 写历史 log
    try {
      await supabase.from("monitor_handoff_log").insert({
        leaf_id: isCatItem ? null : itemId,
        cat_id: isCatItem ? itemId : null,
        from_box: fromBox,
        to_box: targetBox,
        moved_at: now,
        moved_by_email: currentEmail,
      });
    } catch (e) { /* 表可能未建, 不影响主流程 */ }
    await Promise.all([loadHandoffs(), loadHandoffLog()]);
    try { await fetchShelfData(); } catch (e) {}
  };

  // 拖拽换调研阶段: 更新 shelf_leaves.phase + 记录 monitor_research_progress + 刷新
  // 权限: 默认全部登录用户可操作 (KK: 除交接拖拽外其他全开)
  const movePhase = async (itemId, targetPhase, isCat) => {
    if (!itemId || !targetPhase) return;
    if (isCat) { console.log("[movePhase] cat=", itemId, "→", targetPhase);
      // 类目: 更新 shelf_cats.phase (类目明细不显示 phase, 只影响开发进度)
      const { error: e1 } = await supabase.from("shelf_cats").update({ phase: targetPhase }).eq("id", itemId);
      if (e1) { alert("保存失败: " + e1.message); return; }
      await loadHandoffs();
      try { await fetchShelfData(); } catch (e) {}
      setTick2(t => t + 1);
      return;
    }
    const { error: e1 } = await supabase.from("shelf_leaves").update({ phase: targetPhase }).eq("id", itemId);
    if (e1) { alert("保存失败: " + e1.message); return; }
    try {
      const { error: e2 } = await supabase.from("monitor_research_progress")
        .upsert({ leaf_id: itemId, phase: targetPhase, start_at: new Date().toISOString() }, { onConflict: "leaf_id, phase" });
      if (e2) alert("进度记录失败(请确认已建表 monitor_research_progress): " + e2.message);
    } catch (err) {
      alert("进度记录失败(请确认已建表 monitor_research_progress): " + err.message);
    }
    // 刷新: 重新拉 progress + shelf 数据 + handoff, 触发界面重渲染
    const { data: p } = await supabase.from("monitor_research_progress").select("*");
    if (p) setProgress(p);
    await loadHandoffs();
    await fetchShelfData();
    setTick2(t => t + 1);
  };

  const resolve = (e) => {
    const info = ID_NAME[e.target_id];
    return info ? info.name : `${e.target_kind || ""}#${(e.target_id || "").slice(0, 8)}`;
  };

  // 调研 4 阶段按 brand (一级类目) 聚合, 默认折叠
  // 调研阶段进度: leaf_id+phase → start_at (供 phaseMap 显示持续时间)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("monitor_research_progress").select("*");
      setProgress(data || []);
    })();
  }, []);

  // 拖动源 box (用于视觉提示哪些目标框可放置)
  const dragFromBox = useMemo(() => {
    if (!dragId) return null;
    const h = (handoffs || []).find(x => dragId.isCat ? x.cat_id === dragId.id : x.leaf_id === dragId.id);
    return h ? h.box_key : null;
  }, [dragId, handoffs]);

  // 交接时间统计: h1 / h2 / h3 各自的时长分析
  //   - historical: 从 monitor_handoff_log 计算"曾在该框停留过"的时长
  //   - current: 当前在框中的项 + 累计时长
  //   - dist: 时长分布 (<3 / 3-7 / 7-14 / >=14 天)
  //   - byGroup: 按一级类目聚合 (平均时长)
  const handoffStats = useMemo(() => {
    const result = { h1: emptyBoxStat(), h2: emptyBoxStat(), h3: emptyBoxStat() };
    // 按 leaf_id 排序的 log
    const logsByLeaf = {};
    (handoffLog || []).forEach(l => {
      if (!logsByLeaf[l.leaf_id]) logsByLeaf[l.leaf_id] = [];
      logsByLeaf[l.leaf_id].push(l);
    });
    // 从 log 算历史停留时长
    const histDurs = { h1: [], h2: [], h3: [] };
    Object.entries(logsByLeaf).forEach(([leafId, logs]) => {
      for (let i = 1; i < logs.length; i++) {
        const cur = logs[i];
        const prev = logs[i - 1];
        const box = cur.from_box;
        if (!box || (box !== "h1" && box !== "h2" && box !== "h3")) continue;
        const dur = (new Date(cur.moved_at) - new Date(prev.moved_at)) / 86400000;
        if (dur < 0 || dur > 365) continue; // 异常数据
        const group = (lToGroup[leafId] || {}).group || "未分类";
        histDurs[box].push({ leafId, dur, group, source: "historical" });
      }
    });
    // 当前 in-box 累计 (从主表 start_at 到 now)
    const curDurs = { h1: [], h2: [], h3: [] };
    (handoffs || []).forEach(h => {
      if (!h.start_at) return;
      if (h.box_key !== "h1" && h.box_key !== "h2" && h.box_key !== "h3") return;
      const dur = (Date.now() - new Date(h.start_at).getTime()) / 86400000;
      const group = (lToGroup[h.leaf_id] || {}).group || "未分类";
      curDurs[h.box_key].push({ leafId: h.leaf_id, dur, group, source: "current" });
    });
    // 聚合
    ["h1", "h2", "h3"].forEach(boxId => {
      const all = [...histDurs[boxId], ...curDurs[boxId]];
      const byGroup = {};
      all.forEach(a => {
        if (!byGroup[a.group]) byGroup[a.group] = { count: 0, durs: [] };
        byGroup[a.group].count++;
        byGroup[a.group].durs.push(a.dur);
      });
      const durs = all.map(a => a.dur).sort((a, b) => a - b);
      const sum = durs.reduce((s, x) => s + x, 0);
      result[boxId] = {
        total: all.length,
        current: curDurs[boxId].length,
        historical: histDurs[boxId].length,
        avg: durs.length ? sum / durs.length : 0,
        median: durs.length ? durs[Math.floor(durs.length / 2)] : 0,
        max: durs.length ? durs[durs.length - 1] : 0,
        min: durs.length ? durs[0] : 0,
        dist: {
          lt3: all.filter(a => a.dur < 3).length,
          d3_7: all.filter(a => a.dur >= 3 && a.dur < 7).length,
          d7_14: all.filter(a => a.dur >= 7 && a.dur < 14).length,
          gte14: all.filter(a => a.dur >= 14).length,
        },
        byGroup,
      };
    });
    return result;
  }, [handoffs, handoffLog, lToGroup]);

  // 调研 4 阶段按 一级类目 (group) 聚合, 显示移动时间 + 持续时长
  const phaseMap = useMemo(() => {
    const m = {};
    Object.keys(LEAF_PHASE).forEach(k => { m[k] = { total: 0, byGroup: {} }; });
    (IDLE_LEAVES || []).forEach(l => {
      const k = l.phase || "未细分";
      if (!m[k]) m[k] = { total: 0, byGroup: {} };
      const group = lToGroup[l.id]?.group || "未分类";
      const prog = (progress || []).find(p => p.leaf_id === l.id && p.phase === k);
      const start = prog ? new Date(prog.start_at) : null;
      const dur = start ? ((Date.now() - start.getTime()) / 86400000) : null;
      const durText = dur == null ? "—" : (dur < 1 ? `${Math.max(1, Math.round(dur * 24))} 小时` : `${Math.floor(dur)} 天 ${Math.round((dur % 1) * 24)} 小时`);
      if (!m[k].byGroup[group]) m[k].byGroup[group] = [];
      m[k].byGroup[group].push({ ...l, isCat: false, enterAt: prog ? prog.start_at : null, duration: durText });
      m[k].total++;
    });
    // 类目 (st=idle 的 cat): 默认 phase=planning, group=大类名 (KK 2026-08-10)
    Object.entries(BRAND_SHELF).forEach(([b, info]) => {
      (info.groups || []).forEach(g => {
        const walk = (c) => {
          if (c.st === "idle") {
            const k = c.phase || "planning";
            if (!m[k]) m[k] = { total: 0, byGroup: {} };
            const group = (g.name && g.name !== "__flat__") ? g.name : ((info.fullName || b) + " / 未分类");
            if (!m[k].byGroup[group]) m[k].byGroup[group] = [];
            m[k].byGroup[group].push({ id: c.id, name: c.name, isCat: true, phase: k, enterAt: null, duration: "—" });
            m[k].total++;
          }
          (c.children || []).forEach(s => walk(s));
        };
        (g.cats || []).forEach(c => walk(c));
      });
    });
    return m;
  }, [lToGroup, progress, tick2, BRAND_SHELF]);

  // 阶段转化统计: 时间段内进入某 phase 的 leaf, 按最终 phase 分布
  const phaseTrans = useMemo(() => {
    const res = {};
    PHASE_ORDER.forEach(p => res[p] = { total: 0, dist: {} });
    if (!fromDate || !toDate) return res;
    const from = new Date(fromDate + "T00:00:00");
    const to = new Date(toDate + "T23:59:59");
    // leaf_id → 所有 phase 记录
    const byLeaf = {};
    (progress || []).forEach(p => {
      const st = new Date(p.start_at);
      if (st < from || st > to) return;
      if (!byLeaf[p.leaf_id]) byLeaf[p.leaf_id] = [];
      byLeaf[p.leaf_id].push(p.phase);
    });
    // 每个起点 phase: 时间段内进入该 phase 的 leaf, 最终 phase = 其所有记录中顺序最大的
    PHASE_ORDER.forEach(fromP => {
      Object.entries(byLeaf).forEach(([leafId, phases]) => {
        if (phases.includes(fromP)) {
          res[fromP].total++;
          const idxs = PHASE_ORDER.map((p, i) => phases.includes(p) ? i : -1).filter(i => i >= 0);
          const finalIdx = Math.max(...idxs);
          const finalP = PHASE_ORDER[finalIdx];
          res[fromP].dist[finalP] = (res[fromP].dist[finalP] || 0) + 1;
        }
      });
    });
    return res;
  }, [progress, fromDate, toDate]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>目前在调研的产品</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>按 4 个调研阶段分组 · 一级类目聚合 · 点开品牌查看具体 leaf</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: C.line, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
        {Object.entries(LEAF_PHASE).map(([k, v]) => {
          const data = phaseMap[k] || { total: 0, byBrand: {} };
          const isOpen = !!openPhases[k];
          const isPhaseDragging = !!phaseDrag[k];
          return (
            <div key={k}
              onDragOver={(e) => { e.preventDefault(); setPhaseDrag(s => ({ ...s, [k]: true })); }}
              onDragLeave={() => setPhaseDrag(s => ({ ...s, [k]: false }))}
              onDrop={(e) => { e.preventDefault(); setPhaseDrag(s => ({ ...s, [k]: false })); if (dragId) movePhase(dragId.id, k, dragId.isCat); }}
              style={{ background: C.panel, padding: "14px 12px", minHeight: 60, border: isPhaseDragging ? `2px dashed ${v.color}` : "2px solid transparent", borderRadius: 6 }}>
              <div onClick={() => setOpenPhases(s => ({ ...s, [k]: !s[k] }))}
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: v.color, display: "inline-block" }} />
                <span style={{ fontSize: 12, color: C.ink, fontWeight: 600 }}>{v.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: C.sub }}>{data.total}</span>
              </div>
              {isOpen && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {Object.entries(data.byGroup).sort((a, b) => b[1].length - a[1].length).map(([group, items]) => (
                    <details key={group} style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, padding: "5px 7px" }}>
                      <summary style={{ fontSize: 11, fontWeight: 600, color: C.ink, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{group}</span>
                        <span style={{ marginLeft: "auto", fontSize: 10, color: C.sub, fontWeight: 400 }}>{items.length}</span>
                      </summary>
                      <div style={{ marginTop: 5, paddingLeft: 6, borderLeft: `2px solid ${v.color}` }}>
                        {items.map(l => (
                          <div key={l.id} draggable
                            onDragStart={(e) => { e.dataTransfer.setData("text/plain", l.id); setDragId({ id: l.id, isCat: !!l.isCat }); }}
                            onDragEnd={() => setDragId(null)}
                            style={{ padding: "3px 0", fontSize: 12, cursor: "grab" }}>
                            <div style={{ color: C.ink }}>{l.name}{l.isCat && <span style={{ fontSize: 10, color: C.faint, marginLeft: 4 }}>· 类目</span>}</div>
                            <div style={{ fontSize: 10, color: C.faint, marginTop: 2, display: "flex", gap: 8 }}>
                              <span>{l.enterAt ? "入: " + new Date(l.enterAt).toLocaleDateString("zh-CN") : "入: —"}</span>
                              <span>· {l.duration}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 作业交接框: 5 个阶段 4 个交接点, 按品牌聚合 + 下拉查看具体 leaf */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>作业交接</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>5 个阶段 · 4 个交接节点 · 拖拽类目到目标框即交接并重新计时 · 一级类目聚合显示</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: C.faint }}>当前角色</span>
          <span style={{ fontSize: 12, color: C.ink, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
            background: (userRole === "admin" || userRole === "fr") ? `${C.brand}22` : (userRole ? `${C.line}` : "#3a3030"),
            border: `1px solid ${(userRole === "admin" || userRole === "fr") ? C.brand : (userRole ? C.line : "#5a3030")}` }}>
            {roleLabel}
          </span>
          {userRole && !isFullAccess && (
            <span style={{ fontSize: 10, color: C.faint }}>
              {userRole === "cd_supplier" && "(调研期间 → 链接制作)"}
              {userRole === "cd_link" && "(链接制作期间 → 采购备货)"}
              {userRole === "cd_promotion" && "(采购备货 → 进入可售)"}
            </span>
          )}
          {isFullAccess && <span style={{ fontSize: 10, color: C.faint }}>(全权限 · 拖出 h1 非 h2 自动标记为「已调研不做」)</span>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {HANDOFF_BOXES.map(box => {
          const data = boxMap[box.id] || { total: 0, byGroup: {} };
          const groupList = Object.entries(data.byGroup).sort((a, b) => b[1].length - a[1].length);
          // 权限计算
          const canDragFrom = canDrag(box.id, userRole);
          const isDragging = !!dragId;
          // 拖动时, 该框对当前用户来说是否是合法放置目标
          const dropAllowed = isDragging && dragFromBox !== box.id ? canDrop(dragFromBox, box.id, userRole) : true;
          const dropDenied = isDragging && dragFromBox !== box.id && !dropAllowed;
          // 边框 / 背景
          const borderColor = dropDenied ? "#c05b52"
            : hoverBox === box.id ? box.color
            : (isDragging && !canDragFrom) ? "#3a3030"  // 当前用户不能从这框拖, 整体置灰
            : C.line;
          return (
            <div key={box.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (!dragFromBox || dragFromBox === box.id) { setHoverBox(box.id); return; }
                if (canDrop(dragFromBox, box.id, userRole)) setHoverBox(box.id);
                else setHoverBox("__denied__");
              }}
              onDragLeave={() => setHoverBox(null)}
              onDrop={(e) => { e.preventDefault(); setHoverBox(null); if (dragId) moveTo(dragId.id, box.id, dragId.isCat); }}
              style={{ background: C.panel, border: `1px solid ${borderColor}`, borderRadius: 12, padding: "16px 18px", minHeight: 180, transition: "border .15s", opacity: (isDragging && !canDragFrom && !dropAllowed) ? 0.55 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: box.color, display: "inline-block" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{box.title}</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>{data.total} 项</span>
              </div>
              {box.sub && <div style={{ fontSize: 11, color: C.sub, marginBottom: 12 }}>{box.sub}</div>}
              {dropDenied && <div style={{ fontSize: 11, color: "#c05b52", marginBottom: 8 }}>⚠ {roleLabel} 无权放入此框</div>}
              {data.total ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {groupList.map(([group, items]) => (
                    <div key={group} style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 8px", marginBottom: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span>{group}</span>
                        <span style={{ marginLeft: "auto", fontSize: 10, color: C.sub, fontWeight: 400 }}>{items.length} 项</span>
                      </div>
                      <div style={{ paddingLeft: 8, borderLeft: `2px solid ${box.color}` }}>
                        {items.map((it, i) => (
                          <div key={it.catId || it.leafId} draggable={canDragFrom}
                            onDragStart={(e) => {
                              if (!canDragFrom) { e.preventDefault(); return; }
                              const did = it.catId || it.leafId;
                              e.dataTransfer.setData("text/plain", did);
                              setDragId({ id: did, isCat: !!it.catId });
                            }}
                            onDragEnd={() => setDragId(null)}
                            style={{ padding: "5px 0", borderTop: i ? `1px solid ${C.line}` : "none", fontSize: 12, cursor: canDragFrom ? "grab" : "not-allowed" }}>
                            <div style={{ color: canDragFrom ? C.ink : C.faint, fontWeight: 600 }}>{it.name}{it.catId && <span style={{ fontSize: 10, color: C.faint, marginLeft: 4 }}>· 类目</span>}{!canDragFrom && <span style={{ fontSize: 10, color: C.faint, marginLeft: 6 }}>🔒</span>}</div>
                            <div style={{ fontSize: 10, color: C.faint, marginTop: 2, display: "flex", gap: 8 }}>
                              <span>起: {it.start}</span>
                              <span>· 时长: {it.duration}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div style={{ fontSize: 11, color: C.faint }}>暂无交接中</div>}
            </div>
          );
        })}
      </div>

      {/* 交接时间统计: h1 / h2 / h3 各自时长分析 (历史 + 当前) */}
      <div style={{ marginTop: 28 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>交接时间统计</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            h1 / h2 / h3 框的时长分布 · 数据来自 monitor_handoff_log (历史) + monitor_handoff (当前) · KK 需先建 log 表
          </div>
        </div>
        {handoffLog.length === 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "14px 18px", fontSize: 12, color: C.faint, marginBottom: 12 }}>
            提示：monitor_handoff_log 表未建或暂无历史数据. 请在 Supabase SQL Editor 跑 <code style={{ background: C.panel2, padding: "1px 5px", borderRadius: 3, color: C.brand }}>sql/monitor_handoff_log.sql</code> 创建表, 之后所有交接移动会自动写 log.
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {["h1", "h2", "h3"].map(boxId => {
            const box = HANDOFF_BOXES.find(b => b.id === boxId);
            const s = handoffStats[boxId];
            const hasData = s.total > 0;
            const distPct = (n) => s.total ? Math.round((n / s.total) * 100) : 0;
            const grpList = Object.entries(s.byGroup).sort((a, b) => b[1].count - a[1].count);
            return (
              <div key={boxId} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px" }}>
                {/* 标题 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: box.color, display: "inline-block" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{box.title}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>共 {s.total} 项 (当前 {s.current} / 历史 {s.historical})</span>
                </div>

                {/* 概览: 平均/中位/最长 */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.sub }}>平均</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: hasData ? C.ink : C.faint, marginTop: 2 }}>{hasData ? fmtDays(s.avg) : "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: C.sub }}>中位</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: hasData ? C.ink : C.faint, marginTop: 2 }}>{hasData ? fmtDays(s.median) : "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: C.sub }}>最长 / 最短</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: hasData ? C.ink : C.faint, marginTop: 4 }}>{hasData ? `${fmtDays(s.max)} / ${fmtDays(s.min)}` : "—"}</div>
                  </div>
                </div>

                {/* 时长分布 */}
                <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, marginBottom: 6 }}>时长分布</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 14 }}>
                  {[
                    { k: "lt3", label: "< 3 天", c: "#2ecc71" },
                    { k: "d3_7", label: "3-7 天", c: "#3498db" },
                    { k: "d7_14", label: "7-14 天", c: "#d9a441" },
                    { k: "gte14", label: "≥ 14 天", c: "#c05b52" },
                  ].map(b => {
                    const n = s.dist[b.k];
                    return (
                      <div key={b.k} style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 10px" }}>
                        <div style={{ fontSize: 10, color: b.c, fontWeight: 600 }}>{b.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: n ? C.ink : C.faint, marginTop: 2 }}>{n}</div>
                        <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{distPct(n)}%</div>
                      </div>
                    );
                  })}
                </div>

                {/* 按一级类目 */}
                <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, marginBottom: 6 }}>按一级类目 (项数 · 平均时长)</div>
                {grpList.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {grpList.map(([g, info]) => {
                      const avg = info.durs.reduce((s, x) => s + x, 0) / info.durs.length;
                      return (
                        <div key={g} style={{ display: "flex", alignItems: "center", fontSize: 12, padding: "4px 8px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 4 }}>
                          <span style={{ color: C.ink, fontWeight: 600 }}>{g}</span>
                          <span style={{ marginLeft: 10, color: C.faint }}>{info.count} 项</span>
                          <span style={{ marginLeft: "auto", color: C.ink, fontWeight: 600 }}>{fmtDays(avg)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <div style={{ fontSize: 11, color: C.faint, padding: "6px 0" }}>暂无数据</div>}
              </div>
            );
          })}
        </div>
      </div>

      {isFullAccess && (
        <>
          {/* 阶段转化分析: 任意时间段内 状态转换统计 (仅 admin/法国 可见) */}
          <SectionTitle t="阶段转化分析" sub="统计任意时间段内进入某阶段, 并最终到达后续阶段的类目数量（仅管理员/法国可见）" />
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: C.sub }}>从</span>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }} />
          <span style={{ fontSize: 12, color: C.sub }}>到</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }} />
        </div>

        {/* 转化表: 行=起点阶段, 列=最终阶段 */}
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: `1.2fr repeat(${PHASE_ORDER.length + 1},1fr)`, background: "#1f3a68", fontSize: 11, color: "#fff", fontWeight: 600 }}>
            <div style={{ padding: "9px 12px" }}>起点阶段 (时间段内进入)</div>
            {PHASE_ORDER.map(p => <div key={p} style={{ padding: "9px 12px", textAlign: "center" }}>{LEAF_PHASE[p] ? LEAF_PHASE[p].label.replace("在调研-", "") : p}</div>)}
            <div style={{ padding: "9px 12px", textAlign: "center" }}>合计</div>
          </div>
          {PHASE_ORDER.map(fromP => {
            const row = phaseTrans[fromP] || { total: 0, dist: {} };
            return (
              <div key={fromP} style={{ display: "grid", gridTemplateColumns: `1.2fr repeat(${PHASE_ORDER.length + 1},1fr)`, borderTop: `1px solid ${C.line}`, fontSize: 12, background: C.panel }}>
                <div style={{ padding: "9px 12px", color: C.ink, fontWeight: 600 }}>
                  {LEAF_PHASE[fromP] ? LEAF_PHASE[fromP].label.replace("在调研-", "") : fromP}
                </div>
                {PHASE_ORDER.map(toP => (
                  <div key={toP} style={{ padding: "9px 12px", textAlign: "center", color: row.dist[toP] ? C.ink : C.sub, fontWeight: row.dist[toP] ? 700 : 500 }}>
                    {row.dist[toP] || "—"}
                  </div>
                ))}
                <div style={{ padding: "9px 12px", textAlign: "center", color: C.ink, fontWeight: 700, fontSize: 13 }}>{row.total || "—"}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 10 }}>
          例: 选中 2026-07-01 ~ 2026-07-31, 「拉数据」行 + 「看样品」列 = 7月进入拉数据且最终到达看样品的类目数
        </div>
      </div>
        </>
      )}
    </div>
  );
}

// ---------------- 产品跨站对比 ----------------
// 从货架聚合出可搜索的条目: 产品 + 末端类目
function collectSearchable() {
  const items = [];
  Object.keys(BRAND_SHELF).forEach(brandKey => {
    const brand = BRAND_SHELF[brandKey];
    if (brand.flat) return;
    brand.groups.forEach(g => {
      g.cats.forEach(c => {
        if (c.st === "skip") return;
        const detail = catDetail(c.name, g.name);
        if (!detail || !detail.leaves) return;
        detail.leaves.forEach(lf => {
          // 末端类目本身作为一条
          items.push({
            type: "leaf",
            name: lf.leaf,
            path: lf.path,
            brand: brand.fullName || brandKey,
            store: brand.store,
            group: g.name,
            parentCat: c.name,
            frStatus: lf.products && lf.products.some(p => p.st === "selling") ? "已立项" : (lf.st === "idle" ? "分析中" : "已出结论"),
            frConclusion: lf.products && lf.products.some(p => p.st === "selling") ? "recommend" : null,
            products: lf.products || [],
            suppliers: lf.suppliers || [],
          });
          // 每个产品也作为一条
          (lf.products || []).forEach(p => {
            items.push({
              type: "product",
              name: p.name,
              path: lf.path,
              leafName: lf.leaf,
              brand: brand.fullName || brandKey,
              store: brand.store,
              group: g.name,
              parentCat: c.name,
              frStatus: p.st === "selling" ? "已立项" : "分析中",
              frConclusion: p.st === "selling" ? "recommend" : null,
              productStatus: p.st,
              suppliers: lf.suppliers || [],
            });
          });
        });
      });
    });
  });
  return items;
}

function CrossSite({ sel, setSel }) {
  const [q, setQ] = useState("");
  const [siteMark, setSiteMark] = useState({}); // {itemIdx-site: 'analyzing'}
  const all = useMemo(() => collectSearchable(), []);
  const matches = q.trim()
    ? all.filter(i => i.name.toLowerCase().includes(q.toLowerCase()) || (i.leafName || "").toLowerCase().includes(q.toLowerCase()))
    : [];
  const [selIdx, setSelIdx] = useState(0);
  const item = matches[selIdx] || null;

  return (
    <div>
      <SectionTitle t="产品跨站对比" sub="搜索类目名或产品名 — 查看在 FR / DE / UK 三站的评估状态" />

      {/* 搜索框 */}
      <div style={{ marginBottom: 18 }}>
        <input value={q} onChange={(e) => { setQ(e.target.value); setSelIdx(0); }}
          placeholder="输入类目名或产品名，如 防吠项圈 / 电子围栏01 / 封口机..."
          style={{ width: "100%", padding: "11px 14px", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, color: C.ink, fontSize: 13, outline: "none" }} />
        {q.trim() && (
          <div style={{ marginTop: 4, fontSize: 11, color: C.sub }}>
            找到 {matches.length} 条 · 全库共 {all.length} 条可搜索
          </div>
        )}
      </div>

      {/* 匹配结果列表 (多条时显示) */}
      {matches.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
          {matches.slice(0, 10).map((m, i) => (
            <div key={i} onClick={() => setSelIdx(i)} style={{ padding: "6px 12px", fontSize: 12, borderRadius: 8, cursor: "pointer", border: `1px solid ${i === selIdx ? C.brand : C.line}`, background: i === selIdx ? C.panel2 : "transparent", color: i === selIdx ? C.ink : C.sub }}>
              {m.type === "product" ? "▪ " : "◆ "}{m.name}
            </div>
          ))}
          {matches.length > 10 && <div style={{ fontSize: 11, color: C.faint, padding: "6px 4px" }}>+{matches.length - 10} 条未显示，请细化关键词</div>}
        </div>
      )}

      {!q.trim() && (
        <div style={{ padding: 40, textAlign: "center", color: C.faint, fontSize: 13, border: `1px dashed ${C.line}`, borderRadius: 12 }}>
          输入关键词搜索。<br />
          共 {all.length} 条可搜索（{all.filter(x => x.type === "leaf").length} 个末端类目 + {all.filter(x => x.type === "product").length} 个产品）。
        </div>
      )}

      {q.trim() && !item && (
        <div style={{ padding: 40, textAlign: "center", color: C.faint, fontSize: 13, border: `1px dashed ${C.line}`, borderRadius: 12 }}>
          未找到匹配项
        </div>
      )}

      {item && (
        <>
          {/* 命中项概览 */}
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>{item.type === "product" ? "产品" : "末端类目"}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{item.name}</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{item.brand} · {item.store} · {item.group}</div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>{item.path}</div>
          </div>

          {/* 三站卡片 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
            {["FR", "DE", "UK"].map(site => {
              const isFR = site === "FR";
              const mark = siteMark[`${selIdx}-${site}`];
              const evaluated = isFR || mark;
              return (
                <div key={site} style={{ background: C.panel, border: `1px solid ${evaluated ? (isFR && item.frConclusion === "recommend" ? "#4db6a4" : C.line) : C.line}`, borderRadius: 12, padding: 16, minHeight: 180, opacity: evaluated ? 1 : 0.85 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, color: site === "FR" ? "#4db6a4" : site === "DE" ? "#6f8fd0" : "#c08fd0" }}>{site}</span>
                    {isFR && <span style={{ fontSize: 11, color: "#4db6a4" }}>在售/在调研</span>}
                    {!isFR && (mark ? <span style={{ fontSize: 11, color: C.sub }}>{mark === "analyzing" ? "分析中" : "已评估"}</span>
                      : <span style={{ fontSize: 11, color: C.faint }}>未评估</span>)}
                  </div>

                  {isFR ? (
                    <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.8 }}>
                      <div style={{ color: C.sub }}>状态</div>
                      <div>{item.frStatus}</div>
                      {item.type === "product" && (
                        <>
                          <div style={{ color: C.sub, marginTop: 8 }}>产品状态</div>
                          <div>{SHELF_ST[item.productStatus]?.label}</div>
                        </>
                      )}
                      {item.type === "leaf" && (
                        <>
                          <div style={{ color: C.sub, marginTop: 8 }}>产品数</div>
                          <div>{item.products.length}</div>
                        </>
                      )}
                    </div>
                  ) : mark ? (
                    <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.8, color: C.sub }}>
                      <div>已标记为「{mark === "analyzing" ? "分析中" : "已评估"}」</div>
                      <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>Demo：真库版此处显示具体评估内容</div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 20, fontSize: 12, color: C.faint, textAlign: "center" }}>
                      尚未在 {site} 站评估
                    </div>
                  )}

                  {!isFR && !mark && (
                    <button onClick={() => setSiteMark(s => ({ ...s, [`${selIdx}-${site}`]: "analyzing" }))}
                      style={{ marginTop: 14, width: "100%", padding: "7px", background: "transparent", border: `1px solid ${C.line}`, color: C.sub, borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
                      标记为分析中
                    </button>
                  )}
                  {!isFR && mark && (
                    <button onClick={() => setSiteMark(s => ({ ...s, [`${selIdx}-${site}`]: undefined }))}
                      style={{ marginTop: 14, width: "100%", padding: "7px", background: "transparent", border: `1px solid ${C.line}`, color: C.faint, borderRadius: 8, fontSize: 11, cursor: "pointer" }}>
                      取消标记
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- SKU 跟踪 ----------------
function Track({ selSku, setSelSku }) {
  const [openId, setOpenId] = useState(null);
  const [filterLevel, setFilterLevel] = useState("all"); // all | critical | warning | optimize | normal
  const [alertFilter, setAlertFilter] = useState(false); // 只看有警报的类目

  // 等级排序 + 过滤
  const order = { critical: 0, warning: 1, optimize: 2, normal: 3 };
  const visible = MONITOR_CATEGORIES
    .filter(c => filterLevel === "all" || c.level === filterLevel)
    .filter(c => !alertFilter || c.alerts.length > 0)
    .sort((a, b) => order[a.level] - order[b.level]);

  // 警报统计
  const tally = MONITOR_CATEGORIES.reduce((acc, c) => { acc[c.level]++; return acc; }, { critical: 0, warning: 0, optimize: 0, normal: 0 });

  // 表格配色 (仿截图 2)
  const H_BG = "#1f3a68", H_FG = "#ffffff";
  const ROW_A = "#f4f8fd", ROW_B = "#ffffff";
  const CELL_NUM = "#eaf2fb", CELL_RATING = "#fff3d6", CELL_PRICE = "#fff7e0", CELL_REV = "#eaf6ec";

  const AsinRow = ({ a, i, kind, self }) => {
    const rowBg = i % 2 === 0 ? ROW_A : ROW_B;
    const stockColor = a.stock === "out_of_stock" ? "#e74c3c" : a.stock === "low_stock" ? "#f4b400" : "#2ecc71";
    const stockText = a.stock === "out_of_stock" ? "缺货" : a.stock === "low_stock" ? "低库存" : "在售";
    return (
      <div key={a.asin} style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr 1fr 1fr 1fr 1fr 1fr 0.8fr",
        background: rowBg, fontSize: 12, color: "#172033", borderTop: i ? `1px solid #d9e1ec` : "none" }}>
        <div style={{ padding: "8px 12px" }}>
          <a href={`https://amazon.fr/dp/${a.asin}`} target="_blank" rel="noreferrer"
            style={{ color: "#0f5e9c", fontWeight: 600, textDecoration: "none" }}>
            {a.asin}
          </a>
          <div style={{ fontSize: 10, color: "#5f6b7a", marginTop: 2 }}>{a.title}</div>
        </div>
        <div style={{ padding: "8px 12px", color: "#5f6b7a" }}>
          <span style={{ padding: "1px 6px", borderRadius: 8, fontSize: 10,
            background: self ? "#eaf6ec" : kind === "fixed" ? "#fff3d6" : "#eaf2fb",
            color: self ? "#1a7a3a" : kind === "fixed" ? "#a06b00" : "#0f5e9c" }}>
            {self ? "自有" : kind === "fixed" ? "固定竞品" : "动态"}
          </span>
        </div>
        <div style={{ padding: "8px 12px", color: stockColor, fontWeight: 600 }}>{stockText}</div>
        <div style={{ padding: "8px 12px", background: CELL_PRICE, fontWeight: 600 }}>€{a.price}</div>
        <div style={{ padding: "8px 12px", background: CELL_NUM, fontWeight: 600 }}>#{a.bsr.toLocaleString()}</div>
        <div style={{ padding: "8px 12px", background: CELL_RATING, fontWeight: 600 }}>{a.rating}</div>
        <div style={{ padding: "8px 12px", background: CELL_REV, fontWeight: 600 }}>{a.reviews}</div>
        <div style={{ padding: "8px 12px", color: "#5f6b7a", fontSize: 11 }}>{kind === "dynamic" ? "—" : "—"}</div>
      </div>
    );
  };

  return (
    <div>
      <SectionTitle t="链接日级跟进" sub="按末端类目组织 · 四档警报等级 · 自有/固定竞品/动态竞品日级数据" />

      {/* 警报统计 + 过滤 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div onClick={() => setFilterLevel("all")}
          style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
            border: `1px solid ${filterLevel === "all" ? "#0f5e9c" : "#d9e1ec"}`,
            background: filterLevel === "all" ? "#0f5e9c" : "transparent", color: filterLevel === "all" ? "#fff" : "#172033" }}>
          全部 {MONITOR_CATEGORIES.length}
        </div>
        {Object.entries(ALERT_LEVEL).map(([k, v]) => (
          <div key={k} onClick={() => setFilterLevel(filterLevel === k ? "all" : k)}
            style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
              border: `1px solid ${filterLevel === k ? v.color : "#d9e1ec"}`,
              background: filterLevel === k ? `${v.color}22` : "transparent", color: v.color, fontWeight: 600 }}>
            {v.icon} {v.label} {tally[k]}
          </div>
        ))}
        <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5f6b7a", cursor: "pointer" }}>
          <input type="checkbox" checked={alertFilter} onChange={(e) => setAlertFilter(e.target.checked)} />
          只看有警报
        </label>
      </div>

      {/* 类目卡片列表 */}
      {visible.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#5f6b7a", fontSize: 13, border: "1px dashed #d9e1ec", borderRadius: 12 }}>
          当前筛选下没有监控类目
        </div>
      ) : visible.map(cat => {
        const lvl = ALERT_LEVEL[cat.level];
        const allAsins = [
          ...cat.self.map(a => ({ ...a, kind: "self" })),
          ...cat.fixed.map(a => ({ ...a, kind: "fixed" })),
          ...cat.dynamic.map(a => ({ ...a, kind: "dynamic" })),
        ];
        const selfStock = cat.self[0];
        const stockWarn = selfStock && selfStock.stock !== "in_stock";
        const isOpen = openId === cat.id;
        return (
          <div key={cat.id} style={{ background: "#fff", border: "1px solid #d9e1ec", borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
            {/* 卡片顶栏 */}
            <div onClick={() => setOpenId(isOpen ? null : cat.id)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer" }}>
              {/* 左侧等级色条 */}
              <div style={{ width: 6, alignSelf: "stretch", background: lvl.color, borderRadius: 3 }} />
              <div style={{ fontSize: 11, color: lvl.color, fontWeight: 700, minWidth: 60 }}>{lvl.icon} {lvl.label}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#172033" }}>{cat.name}</div>
                <div style={{ fontSize: 11, color: "#5f6b7a", marginTop: 2 }}>
                  {cat.site} · 自有 {cat.self.length} · 固定竞品 {cat.fixed.length} · 动态 {cat.dynamic.length}
                  {cat.alerts.length > 0 && <span style={{ marginLeft: 8, color: lvl.color }}>· {cat.alerts.length} 项预警</span>}
                </div>
              </div>
              {selfStock && (
                <div style={{ fontSize: 11, color: stockWarn ? "#e74c3c" : "#5f6b7a" }}>
                  自有: #{selfStock.bsr.toLocaleString()} · €{selfStock.price} · ★{selfStock.rating} · {selfStock.reviews}评论
                </div>
              )}
              <div style={{ fontSize: 11, color: "#5f6b7a" }}>更新 {cat.updated}</div>
            </div>

            {/* 预警条 */}
            {cat.alerts.length > 0 && (
              <div style={{ background: `${lvl.color}0d`, padding: "8px 18px", borderTop: "1px solid #d9e1ec", fontSize: 11 }}>
                {cat.alerts.map((a, i) => (
                  <div key={i} style={{ color: "#172033", marginBottom: 2 }}>
                    <span style={{ color: ALERT_LEVEL[a.level].color, fontWeight: 600 }}>{ALERT_LEVEL[a.level].icon} {a.rule}</span>
                    <span style={{ color: "#5f6b7a", marginLeft: 8 }}>· {a.detail}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 展开区: 核心数据表 */}
            {isOpen && (
              <div style={{ borderTop: "1px solid #d9e1ec" }}>
                <div style={{ background: H_BG, padding: "8px 16px", fontSize: 12, color: H_FG, fontWeight: 600 }}>
                  核心数据 · {allAsins.length} 个 ASIN (含 {cat.self.length} 自有 + {cat.fixed.length} 固定竞品 + {cat.dynamic.length} 动态)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr 1fr 1fr 1fr 1fr 1fr 0.8fr",
                  background: H_BG, fontSize: 11, color: H_FG, fontWeight: 600 }}>
                  {["ASIN / 标题", "角色", "库存", "价格", "BSR", "评分", "评论数", "较昨日"].map((h, i) => (
                    <div key={i} style={{ padding: "9px 12px", borderRight: i < 7 ? `1px solid #2c4a82` : "none" }}>{h}</div>
                  ))}
                </div>
                {allAsins.map((a, i) => <AsinRow key={a.asin} a={a} i={i} kind={a.kind} self={a.kind === "self"} />)}

                {/* 操作日志 */}
                <div style={{ background: "#f6f8fb", padding: "10px 16px", fontSize: 11, color: "#5f6b7a", borderTop: "1px solid #d9e1ec" }}>
                  <div style={{ fontWeight: 600, color: "#172033", marginBottom: 4 }}>操作日志</div>
                  <div>暂无处理记录 · 成都团队负责执行（选择动作 + 写备注）</div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------- 财务核算 (空骨架, 完整版含 4 大模块) ----------------
// TODO: 完整财务体系
//   1) 库存视角: 周转效率 / 库存天数 / 备货周期 / 滞销预警
//   2) 利润体系: 单品利润 / 末端类目毛利 / 平台费 / 税费 / 净利
//   3) 现金流体系: 月度流入流出 / 应收回款 / 应付账期
//   4) 资本占用 & 资金成本: 在途库存金额 / 资金占用 / 未来 90 天资金需求预测
// 数据来源建议:
//   - 采购成本: 手动录入 (新建表 finance_unit_cost)
//   - 售价 / 订单: 接 Amazon SP-API
//   - 平台费 / 广告费: 财务月度导入
// ---------------- 发货记录 ----------------
// 全员可见; 录入/编辑 = admin + 成都·供应链(cd_supplier) — KK 2026-09-18 锁死
// 例外: 财务专员(夏蕾)负责复核与双方确认; 成都·采购(黄丹)保留「运费已付」勾选
// 2026-11-20 KK 定: 「账单核对」环节取消(整列移除, DB 字段保留); 「运费已付」收走雪梅, 归 admin + 黄丹
// RLS 同步: sql/shipments_entry_lock.sql
function Shipments() {
  const [shipRole, setShipRole] = useState(null);
  const [myEmail, setMyEmail] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data && data.user) { setShipRole(getUserRole(data.user.email || "")); setMyEmail(data.user.email || ""); }
    });
  }, []);
  const isAdmin = shipRole === "admin";
  // 录入/编辑数据: admin + 成都·供应链(陈雪梅) + 仓储管理(谢福光) — 2026-11-23 加仓储
  const canEdit = shipRole === "admin" || shipRole === "cd_supplier" || shipRole === "warehouse";
  // 「运费已付」勾选: admin + 成都·采购(黄丹) + 财务(夏蕾) — 2026-11-20 KK 定, 收走雪梅
  const canCheck = shipRole === "admin" || shipRole === "cd_procurement" || shipRole === "finance";
  // 数据按角色收窄: 黄丹(采购)只看三家 — 2026-09-18 KK 定
  const myStores = (shipRole && ROLE_STORES[shipRole]) || null;

  // ===== 复核流程 (KK 2026-09-18 定 → 2026-11-02 升级为「双人确认」) =====
  // 1) 复核按批次, 「复核」列夏蕾(财务专员)直接点; KK(admin)也能点(兜底)
  // 2) 复核之后, 该批次「任何」数据改动(金额 + 非金额)都不能直接改
  //    → 必须走「申请修改 → 另一方签字」; 两个人固定是 夏蕾(财务) + 雪梅(供应链)
  //    → 若申请人在这两人之外(如 admin), 则夏蕾、雪梅两个人都要签
  const FINANCE_EMAIL  = "1416952931@qq.com";   // 财务专员 · 夏蕾
  const SUPPLIER_EMAIL = "2990206556@qq.com";   // 成都·供应链 · 陈雪梅
  const SIGNER_PAIR = [FINANCE_EMAIL, SUPPLIER_EMAIL];
  const canReview = shipRole === "finance" || shipRole === "admin";
  // 复核后锁定的字段 = 批次级 + 行级全部可编辑字段 (金额与非金额一律锁)
  const CHG_BATCH = [
    { k: "ship_date", l: "发货日期", ty: "date" },
    { k: "ship_warehouse", l: "发货仓库", ty: "text" },
    { k: "ship_batch", l: "发货批次", ty: "text" },
    { k: "logistics_provider", l: "物流商", ty: "text" },
    { k: "channel", l: "渠道", ty: "text" },
    { k: "freight", l: "头程", ty: "num" },
    { k: "misc_fee", l: "杂费", ty: "num" },
    { k: "duty", l: "关税", ty: "num" },
    { k: "insurance_fee", l: "保险费", ty: "num" },
  ];
  const CHG_ROW = [
    { k: "product_name", l: "名称", ty: "text" },
    { k: "asin", l: "ASIN", ty: "text" },
    { k: "qty", l: "数量", ty: "num" },
    { k: "purchase_price", l: "采购价", ty: "num" },
    { k: "goods_value", l: "货值", ty: "num" },
    { k: "share_fee", l: "分摊费", ty: "num" },
    { k: "landed_cost", l: "到仓价", ty: "num" },
    { k: "unit_price", l: "单价", ty: "num" },
    { k: "last_mile_no", l: "尾程单号", ty: "text" },
    { k: "listed_date", l: "上架日期", ty: "date" },
    { k: "listed_qty", l: "上架数量", ty: "num" },
    { k: "loss_qty", l: "损耗", ty: "num" },
    { k: "compensation_eur", l: "赔付", ty: "num" },
    { k: "loss_amount", l: "亏损", ty: "num" },
    { k: "insurance_no", l: "保险单号", ty: "text" },
    { k: "insured_amount", l: "投保金额", ty: "num" },
    { k: "note", l: "备注", ty: "text" },
  ];
  const LOCK_BATCH_FIELDS = CHG_BATCH.map(c => c.k);
  const LOCK_ROW_FIELDS = CHG_ROW.map(c => c.k);
  const LOCKED_STATUS = ["approved", "change_requested"];   // 这两种状态下所有数据字段都不能直接改
  // 谁能发起修改申请 = 能编辑的(admin/供应链) + 财务专员(夏蕾)
  const canPropose = canEdit || shipRole === "finance";
  // 我是「另一半」→ 单人签; 我在这两人之外(如 admin) → 两人都要签
  const otherSigner = (email) => (email === FINANCE_EMAIL ? SUPPLIER_EMAIL : email === SUPPLIER_EMAIL ? FINANCE_EMAIL : null);
  const nameOf = (email) => (email === FINANCE_EMAIL ? "夏蕾" : email === SUPPLIER_EMAIL ? "雪梅" : (String(email || "").split("@")[0] || "?"));

  const [rows, setRows] = useState([]);
  const [filterStore, setFilterStore] = useState("");
  const [filterBatch, setFilterBatch] = useState([]);     // 多选: 发货批次(可同时选几个)
  const [batchOpts, setBatchOpts] = useState([]);
  const [storeOpts, setStoreOpts] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    let q = supabase.from("shipments").select("*");
    if (myStores) q = q.in("store", myStores);
    if (filterStore) q = q.eq("store", filterStore);
    if (filterBatch.length) q = q.in("ship_batch", filterBatch);
    const { data, error } = await q.order("ship_date", { ascending: true }).limit(2000);
    if (error) { alert("读取失败(请先建表 shipments): " + error.message); return; }
    setRows(data || []);
    if (!loaded) {
      let qa = supabase.from("shipments").select("store, ship_batch, ship_date");
      if (myStores) qa = qa.in("store", myStores);
      const { data: all } = await qa;
      // 下拉固定用 6 家店 (OPS_FIXED_STORES 顺序) — 即使该店还没有发货记录也要能选到
      // (KK 2026-09-29: 屿阔 / 胤顺 之前因为没数据而下拉里看不到)
      const dataStores = [...new Set((all || []).map(r => r.store).filter(Boolean))];
      const base = myStores ? myStores.slice() : OPS_FIXED_STORES.slice();
      const st = [...base, ...dataStores.filter(s => !base.includes(s))];
      setStoreOpts(st);
      const m = {};
      (all || []).forEach(r => { if (r.ship_batch) m[r.ship_batch] = m[r.ship_batch] && m[r.ship_batch] > r.ship_date ? m[r.ship_batch] : (r.ship_date || ""); });
      setBatchOpts(Object.keys(m).sort((a, b) => String(m[b]).localeCompare(String(m[a]))));
      setLoaded(true);
    }
  };
  useEffect(() => { if (shipRole) load(); }, [shipRole]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!shipRole || !loaded) return;
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [filterStore, filterBatch]);

  // 勾选切换 (运费已付) · admin + 采购(黄丹)
  const toggleField = async (rowId, field, current) => {
    if (!canCheck) return;
    const { error } = await supabase.from("shipments").update({ [field]: !current }).eq("id", rowId);
    if (error) { alert("更新失败: " + error.message); return; }
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, [field]: !current } : r));
  };

  // —— 编辑记录 (admin/cd_promotion) ——
  const [editShip, setEditShip] = useState(null);   // { id } 或 null
  const [shipForm, setShipForm] = useState({});
  const SHIP_TEXT = ["store", "ship_warehouse", "ship_batch", "product_name", "asin", "logistics_provider", "channel", "last_mile_no", "insurance_no", "note"];
  const SHIP_DATE = ["ship_date", "listed_date"];
  const SHIP_NUM  = ["qty", "listed_qty", "loss_qty", "purchase_price", "goods_value", "share_fee", "landed_cost", "unit_price", "compensation_eur", "loss_amount", "insured_amount"];
  // 批次级字段(整批合并显示): 在编辑弹窗里只读, 改要到表格上点合并格 → 整批生效
  const SHIP_BATCH_FIELDS = ["ship_date", "ship_warehouse", "ship_batch", "freight", "misc_fee", "duty", "insurance_fee", "logistics_provider", "channel"];
  const SHIP_LABEL = {
    store: "店铺", ship_date: "发货日期", ship_warehouse: "发货仓库", ship_batch: "发货批次",
    product_name: "名称", asin: "ASIN", qty: "数量", purchase_price: "采购价", goods_value: "货值",
    total_value: "总值", freight: "头程", misc_fee: "杂费", duty: "关税", insurance_fee: "保险费",
    share_fee: "分摊费", landed_cost: "到仓价", logistics_provider: "物流商", channel: "渠道",
    unit_price: "单价", last_mile_no: "尾程单号", listed_date: "上架日期", listed_qty: "上架数量",
    loss_qty: "损耗", compensation_eur: "赔付(€)", loss_amount: "亏损", insurance_no: "保险单号",
    insured_amount: "投保金额", note: "备注",
  };
  const openEditShip = (row) => {
    const f = {};
    SHIP_TEXT.concat(SHIP_DATE).concat(SHIP_NUM).forEach(k => f[k] = row[k] != null ? String(row[k]) : "");
    setShipForm(f); setEditShip({ id: row.id });
  };
  const saveShip = async () => {
    if (!editShip) return;
    const g = batchOfRow(editShip.id);
    const locked = !!g && isLocked(g);
    // 已复核批次整行锁定 (KK 2026-11-02) —— 只能走「申请修改 + 双人签字」
    if (locked) { alert("该批次已复核, 整行数据已锁定。\n改动请在「复核」列点「申请修改」, 由 夏蕾 + 雪梅 双方签字后才生效。"); return; }
    const clean = {};
    SHIP_TEXT.concat(SHIP_DATE).concat(SHIP_NUM).forEach(k => {
      // 已复核批次的金额字段(数量/采购价/货值/分摊费/到仓价)不在这里改 —— 走「申请修改」
      if (locked && LOCK_ROW_FIELDS.includes(k)) return;
      const v = (shipForm[k] || "").trim();
      if (k === "product_name" && !v) { alert("名称必填"); return; }
      if (v === "") { clean[k] = null; return; }
      if (SHIP_DATE.includes(k)) { clean[k] = v; return; }
      if (SHIP_NUM.includes(k)) { clean[k] = Number(v); return; }
      clean[k] = v;
    });
    // 记「录入人」; 若该批已复核, 非金额字段的改动把它打回「待复核」
    Object.assign(clean, g ? ownerPatch(g) : { batch_owner: myEmail, batch_owner_at: new Date().toISOString() });
    const { error } = await writeShip(clean, [editShip.id]);
    if (error) { alert("保存失败: " + error.message); return; }
    setEditShip(null); load();
  };

  // —— 标记已上架: 写库存表 inventory (每条发货一条) ——
  const markListed = async (r) => {
    if (!canEdit) return;
    const gL = batchOfRow(r.id);
    if (gL && isLocked(gL)) {
      alert("该批次已复核, 上架日期/上架数量已锁定。\n请在「复核」列点「申请修改」, 由 夏蕾 + 雪梅 双方签字后才生效。");
      return;
    }
    const avail = Math.max(0, Number(r.qty || 0) - Number(r.loss_qty || 0));
    const today = new Date().toISOString().slice(0, 10);
    if (!confirm(`确认将「${r.product_name}」标记为已上架？\n\n上架数量 = 发货 ${r.qty} − 损耗 ${r.loss_qty || 0} = ${avail}\n上架日期 = ${today}（可之后编辑修改）`)) return;
    const rec = {
      store: r.store || null,
      ship_date: r.ship_date || null,
      ship_warehouse: r.ship_warehouse || null,
      ship_batch: r.ship_batch || null,
      asin: r.asin || null, product_name: r.product_name,
      listed_date: today, listed_qty: avail,
      landed_cost: r.landed_cost != null ? Number(r.landed_cost) : null,
    };
    const { error: e1 } = await supabase.from("inventory").upsert({ shipment_id: r.id, ...rec }, { onConflict: "shipment_id" });
    if (e1) { alert("写入库存失败(请先建表 inventory): " + e1.message); return; }
    const { error: e2 } = await supabase.from("shipments").update({ listed: true }).eq("id", r.id);
    if (e2) { alert("更新发货标记失败: " + e2.message); return; }
    load();
  };

  // —— 批次分组: 同一批次合并显示 (KK 2026-09-16) ——
  // 列类型: batch=批次级(整批合并成一格) / sum=自动算 / row=逐行
  const BCOLS = [
    { k: "ship_date", l: "发货日期", w: 85, t: "batch", ty: "text" },
    { k: "ship_warehouse", l: "发货仓库", w: 110, t: "batch", ty: "text" },
    { k: "ship_batch", l: "发货批次", w: 120, t: "batch", ty: "text" },
    { k: "review", l: "复核", w: 136, t: "batch", ty: "text" },   // 批次级: 复核状态 / 双人确认入口 (KK 2026-09-18)
    { k: "product_name", l: "名称", w: 130, t: "row" },
    { k: "asin", l: "ASIN", w: 100, t: "row" },
    { k: "qty", l: "数量", w: 60, t: "row" },
    { k: "purchase_price", l: "采购价", w: 80, t: "row" },
    { k: "goods_value", l: "货值", w: 80, t: "row" },
    { k: "total_value", l: "总值", w: 95, t: "sum" },
    { k: "freight", l: "头程", w: 80, t: "batch", ty: "num" },
    { k: "misc_fee", l: "杂费", w: 70, t: "batch", ty: "num" },
    { k: "duty", l: "关税", w: 70, t: "batch", ty: "num" },
    { k: "insurance_fee", l: "保险费", w: 70, t: "batch", ty: "num" },
    { k: "share_fee", l: "分摊费", w: 80, t: "row" },
    { k: "landed_cost", l: "到仓价", w: 85, t: "row" },
    { k: "logistics_provider", l: "物流商", w: 80, t: "batch", ty: "text" },
    { k: "channel", l: "渠道", w: 90, t: "batch", ty: "text" },
    { k: "unit_price", l: "单价", w: 60, t: "row" },
    { k: "last_mile_no", l: "尾程单号", w: 130, t: "row" },
    { k: "listed_date", l: "上架日期", w: 90, t: "row" },
    { k: "listed_qty", l: "上架数量", w: 80, t: "row" },
    { k: "loss_qty", l: "损耗", w: 60, t: "row" },
    { k: "compensation_eur", l: "赔付", w: 70, t: "row" },
    { k: "loss_amount", l: "亏损", w: 70, t: "row" },
    { k: "insurance_no", l: "保险单号", w: 90, t: "row" },
    { k: "insured_amount", l: "投保金额", w: 90, t: "row" },
    { k: "days", l: "累计天数", w: 80, t: "row" },
    { k: "freight_paid", l: "运费已付", w: 70, t: "row" },
    { k: "note", l: "备注", w: 90, t: "row" },
    { k: "ops", l: "操作", w: 90, t: "row" },
  ];
  const GRID_T = BCOLS.map(c => `${c.w}px`).join(" ");
  const colIdx = (k) => BCOLS.findIndex(c => c.k === k) + 1;
  const BATCH_COLS = BCOLS.filter(c => c.t === "batch");
  const SUM_COLS = BCOLS.filter(c => c.t === "sum");
  const ROW_COLS = BCOLS.filter(c => c.t === "row");

  // 批次分组 (ship_batch 为空则继承上一个非空批次; 完全没有批次的单行独立成组)
  const batches = useMemo(() => {
    const list = [], map = {};
    let lastBatch = null;
    rows.forEach(r => {
      let key;
      if (r.ship_batch) { lastBatch = r.ship_batch; key = r.ship_batch; }
      else key = lastBatch || `__single_${r.id}`;
      if (!map[key]) { map[key] = { key, rows: [] }; list.push(map[key]); }
      map[key].rows.push(r);
    });
    list.forEach((g, i) => {
      g.color = BATCH_PALETTE[i % BATCH_PALETTE.length];
      g.total = g.rows.reduce((s, r) => s + Number(r.goods_value || 0), 0);   // 总值 = Σ货值
    });
    return list;
  }, [rows]);

  // 批次级字段取整批第一个非空值
  const batchVal = (g, k) => {
    const hit = g.rows.find(r => r[k] !== null && r[k] !== undefined && r[k] !== "");
    return hit ? hit[k] : null;
  };

  // ===== 复核状态读取 / 动作 =====
  const revOf = (g) => {
    const r0 = g.rows[0] || {};
    return {
      status: r0.review_status || "pending",
      by: r0.reviewed_by || "",
      at: r0.reviewed_at || "",
      owner: r0.batch_owner || "",
      req: r0.change_req || null,
    };
  };
  const isLocked = (g) => LOCKED_STATUS.includes(revOf(g).status);
  const lockBatchField = (g, k) => isLocked(g) && LOCK_BATCH_FIELDS.includes(k);
  const lockRowField = (g, k) => isLocked(g) && LOCK_ROW_FIELDS.includes(k);
  // —— 双人签字: 一笔申请需要谁签、还差谁 ——
  const reqApprovers = (req) => {
    if (!req) return [];
    if (Array.isArray(req.approvers) && req.approvers.length) return req.approvers;
    if (req.approver) return [req.approver];      // 兼容旧数据(单人同意)
    return [];
  };
  const reqSigned   = (req) => (req && req.signed) || {};
  const reqRemaining = (req) => reqApprovers(req).filter(e => !reqSigned(req)[e]);
  const iAmApprover  = (req) => !!myEmail && reqApprovers(req).includes(myEmail);
  const batchOfRow = (rowId) => batches.find(g => g.rows.some(r => r.id === rowId)) || null;
  const fmtAt = (s) => (s ? String(s).slice(5, 16).replace("T", " ") : "");
  // 若还没跑 sql/shipments_review.sql (列不存在), 自动剥掉复核列重试一次 —— 保证普通录入不被卡住
  const REVIEW_KEYS = ["review_status", "reviewed_by", "reviewed_at", "batch_owner", "batch_owner_at", "change_req"];
  const writeShip = async (patch, ids) => {
    let res = await supabase.from("shipments").update(patch).in("id", ids);
    if (res.error && /column|schema cache|does not exist/i.test(res.error.message || "")) {
      const p2 = { ...patch };
      REVIEW_KEYS.forEach(k => delete p2[k]);
      if (Object.keys(p2).length) res = await supabase.from("shipments").update(p2).in("id", ids);
      if (!res.error) console.warn("shipments 缺复核列, 本次已跳过复核字段。请跑 sql/shipments_review.sql 启用复核流程");
    }
    return res;
  };
  // 写整批 (复核相关字段)
  const patchBatch = async (g, patch) => {
    const ids = g.rows.map(r => r.id);
    const { error } = await supabase.from("shipments").update(patch).in("id", ids);
    if (error) { alert("操作失败: " + error.message + "\n(若提示列不存在, 请先在 Supabase 跑 sql/shipments_review.sql)"); return false; }
    setRows(prev => prev.map(r => ids.includes(r.id) ? { ...r, ...patch } : r));
    return true;
  };
  // 夏蕾点「复核」
  const doReview = async (g) => {
    if (!canReview) return;
    if (!confirm(`确认复核批次「${batchVal(g, "ship_batch") || "(无批次)"}」的 ${g.rows.length} 行?\n\n复核后该批次整行数据锁定, 任何改动都要「夏蕾 + 雪梅」双人签字才能写入。`)) return;
    await patchBatch(g, {
      review_status: "approved",
      reviewed_by: myEmail,
      reviewed_at: new Date().toISOString(),
      change_req: null,
    });
  };
  // 记「录入人」= 最后提交该批改动的人; 非金额字段变动时把该批打回「待复核」
  const ownerPatch = (g) => {
    const rev = revOf(g);
    const patch = { batch_owner: myEmail, batch_owner_at: new Date().toISOString() };
    if (rev.status !== "pending") { patch.review_status = "pending"; patch.reviewed_by = null; patch.reviewed_at = null; patch.change_req = null; }
    return patch;
  };

  // —— 修改申请 (已复核批次要改任何数据时) ——
  // 2026-11-02 KK 定: 复核后「整行数据」都要双人确认 —— 夏蕾 + 雪梅
  const [chgOpen, setChgOpen] = useState(null);        // 批次分组
  const [chgForm, setChgForm] = useState({ batch: {}, rows: {} });
  const [chgBusy, setChgBusy] = useState(false);
  const openChange = (g) => {
    if (!canPropose) return;
    const rev = revOf(g);
    if (rev.req) { alert("该批次已有一笔待签字的修改申请, 处理完再发起"); return; }
    const batch = {}, rws = {};
    CHG_BATCH.forEach(c => { const v = batchVal(g, c.k); batch[c.k] = v === null || v === undefined ? "" : String(v); });
    g.rows.forEach(r => {
      const o = {};
      CHG_ROW.forEach(c => { o[c.k] = r[c.k] === null || r[c.k] === undefined ? "" : String(r[c.k]); });
      rws[r.id] = o;
    });
    setChgForm({ batch, rows: rws });
    setChgOpen(g);
  };
  // 我要发起 → 需要谁签
  const approversFor = () => { const o = otherSigner(myEmail); return o ? [o] : SIGNER_PAIR.slice(); };
  const submitChange = async () => {
    if (!chgOpen) return;
    const approvers = approversFor();
    if (approvers.includes(myEmail)) { alert("「另一方」是你自己, 无法双人确认"); return; }
    if (!approvers.length) { alert("无法确定签字人"); return; }
    // 只提交真正变化的字段
    const fields = {}, rowEdits = {};
    let badNum = "";
    CHG_BATCH.forEach(c => {
      const nv = String(chgForm.batch[c.k] ?? "").trim();
      const ov = batchVal(chgOpen, c.k);
      const ovs = ov === null || ov === undefined ? "" : String(ov);
      if (nv === ovs) return;
      if (c.ty === "num" && nv !== "" && isNaN(Number(nv))) { badNum = c.l; return; }
      fields[c.k] = nv === "" ? null : (c.ty === "num" ? Number(nv) : nv);
    });
    if (badNum) { alert(`「${badNum}」必须是数字`); return; }
    chgOpen.rows.forEach(r => {
      const o = chgForm.rows[r.id] || {};
      const diff = {};
      CHG_ROW.forEach(c => {
        const nv = String(o[c.k] ?? "").trim();
        const ovs = r[c.k] === null || r[c.k] === undefined ? "" : String(r[c.k]);
        if (nv === ovs) return;
        if (c.ty === "num" && nv !== "" && isNaN(Number(nv))) { badNum = c.l; return; }
        diff[c.k] = nv === "" ? null : (c.ty === "num" ? Number(nv) : nv);
      });
      if (Object.keys(diff).length) rowEdits[r.id] = diff;
    });
    if (badNum) { alert(`「${badNum}」必须是数字`); return; }
    if (!Object.keys(fields).length && !Object.keys(rowEdits).length) { alert("没有任何改动"); return; }
    setChgBusy(true);
    const req = { by: myEmail, at: new Date().toISOString(), approvers, signed: {}, fields, rows: rowEdits };
    const ok = await patchBatch(chgOpen, { review_status: "change_requested", change_req: req });
    setChgBusy(false);
    if (ok) {
      setChgOpen(null);
      alert(`修改申请已提交。\n需 ${approvers.map(nameOf).join(" + ")} 签字后才写入。`);
    }
  };
  // 签字 → 全部签完才真正入库
  const signChange = async (g) => {
    const req = revOf(g).req;
    if (!req || !iAmApprover(req)) return;
    const signed = { ...reqSigned(req), [myEmail]: new Date().toISOString() };
    const next = { ...req, signed };
    const remain = reqApprovers(next).filter(e => !signed[e]);
    if (remain.length) {
      if (!confirm(`签字确认「${nameOf(req.by)}」的修改?\n还差 ${remain.map(nameOf).join(" + ")} 签字才写入。`)) return;
      await patchBatch(g, { change_req: next });
      return;
    }
    if (!confirm(`签字确认「${nameOf(req.by)}」的修改?\n你是最后一位, 签完立即写入该批次。`)) return;
    let errMsg = "";
    for (const [k, v] of Object.entries(req.fields || {})) {
      const { error } = await supabase.from("shipments").update({ [k]: v }).in("id", g.rows.map(r => r.id));
      if (error) { errMsg = error.message; break; }
    }
    if (!errMsg) for (const [rowId, diff] of Object.entries(req.rows || {})) {
      const { error } = await supabase.from("shipments").update(diff).eq("id", rowId);
      if (error) { errMsg = error.message; break; }
    }
    if (errMsg) { alert("写入失败: " + errMsg); return; }
    await patchBatch(g, { review_status: "approved", reviewed_at: new Date().toISOString(), change_req: null });
    load();
  };
  // 拒绝 → 改动作废, 保留原值, 该批回到「已复核」
  const rejectChange = async (g) => {
    const req = revOf(g).req;
    if (!req || !iAmApprover(req)) return;
    if (!confirm(`拒绝「${nameOf(req.by)}」的修改申请? 该批保持原值, 回到「已复核」。`)) return;
    await patchBatch(g, { review_status: "approved", change_req: null });
  };
  // —— 批次级录入: 点合并格 → 输入 → 失焦入待提交 → 底部确认提交 → 输密码 → 整批写库 ——
  const [bEditKey, setBEditKey] = useState(null);
  const [bVal, setBVal] = useState("");
  const [bPending, setBPending] = useState({});
  const [bPwdOpen, setBPwdOpen] = useState(false);
  const [bPwd, setBPwd] = useState("");
  const [bPwdErr, setBPwdErr] = useState("");
  const bPendingCount = Object.keys(bPending).length;
  const openBatchCell = (g, c) => {
    // 已复核/待签字批次的任意字段: 不能直接改 → 走「申请修改」
    if (lockBatchField(g, c.k)) { if (canPropose) openChange(g); return; }
    if (!canEdit) return;
    const v = batchVal(g, c.k);
    setBVal(v === null ? "" : String(v));
    setBEditKey(`${g.key}|${c.k}`);
  };
  const commitBatchCell = (g, c) => {
    const key = `${g.key}|${c.k}`;
    if (bEditKey !== key) return;
    const raw = bVal.trim();
    const oldV = batchVal(g, c.k);
    const val = raw === "" ? null : (c.ty === "num" ? Number(raw) : raw);
    if (c.ty === "num" && raw !== "" && isNaN(Number(raw))) { alert("必须是数字"); setBEditKey(null); return; }
    const same = (val === null && (oldV === null || oldV === undefined)) || String(val) === String(oldV === null ? "" : oldV);
    setBEditKey(null);
    if (same) { setBPending(p => { const n = { ...p }; delete n[key]; return n; }); return; }
    setBPending(p => ({ ...p, [key]: { key, groupKey: g.key, field: c.k, label: c.l, val, oldV, ty: c.ty, ids: g.rows.map(r => r.id), batchName: batchVal(g, "ship_batch") || "(无批次)" } }));
  };
  const writeBatchAll = async () => {
    const list = Object.values(bPending);
    if (!list.length) return;
    let errMsg = "";
    const done = [];
    // 按批次聚合: 一次 update 写整批 (字段 + 录入人; 非金额字段改动会把该批打回「待复核」)
    const byGroup = {};
    list.forEach(it => { (byGroup[it.groupKey] = byGroup[it.groupKey] || []).push(it); });
    for (const [gkey, items] of Object.entries(byGroup)) {
      const g = batches.find(x => x.key === gkey);
      if (!g) continue;
      const patch = {};
      items.forEach(it => { patch[it.field] = it.val; });
      // 记录入人 (已复核批次不会走到这里 —— 走了「申请修改」双签通道)
      Object.assign(patch, ownerPatch(g));
      const ids = items[0].ids;
      const { error } = await writeShip(patch, ids);
      if (error) { errMsg = error.message; continue; }
      done.push(...items);
      setRows(prev => prev.map(r => ids.includes(r.id) ? { ...r, ...patch } : r));
    }
    setBPending(p => { const n = { ...p }; done.forEach(o => delete n[o.key]); return n; });
    setBPwdOpen(false); setBPwd(""); setBPwdErr("");
    if (errMsg) alert("部分保存失败: " + errMsg);
  };
  const submitBatchAll = () => { if (!bPendingCount) return; setBPwd(""); setBPwdErr(""); setBPwdOpen(true); };
  const confirmBatchAll = () => {
    if (bPwd.trim() !== "852963") { setBPwdErr("密码不正确, 请重新输入"); return; }
    writeBatchAll();
  };
  const discardBatchAll = () => { setBPending({}); setBPwdOpen(false); setBPwd(""); setBPwdErr(""); };

  // —— 按货值占比摊分 (KK 2026-11-19): 批次级 头程/杂费/关税/保险 → 逐行到仓价 ——
  // 口径: 行到仓价 = (该行货值 + 该行按货值占比摊到的头程+杂费+关税+保险 + 该行分摊费) ÷ 该行数量
  const [spreadAsk, setSpreadAsk] = useState(null);
  const [spreadPwd, setSpreadPwd] = useState("");
  const [spreadErr, setSpreadErr] = useState("");
  const [spreadBusy, setSpreadBusy] = useState(false);

  const openSpread = (g) => {
    if (lockRowField(g, "landed_cost")) { if (canPropose) openChange(g); return; }
    const gF = Number(batchVal(g, "freight") || 0);
    const gM = Number(batchVal(g, "misc_fee") || 0);
    const gD = Number(batchVal(g, "duty") || 0);
    const gI = Number(batchVal(g, "insurance_fee") || 0);
    if (gF + gM + gD + gI <= 0) { alert("该批次还没填「头程 / 杂费 / 关税 / 保险费」，先在批次头填了再摊。"); return; }
    const base = g.rows.map(r => ({ r, goods: Number(r.goods_value) || (Number(r.qty || 0) * Number(r.purchase_price || 0)) }));
    const totalGoods = base.reduce((a, x) => a + x.goods, 0);
    if (totalGoods <= 0) { alert("该批次各行都缺「货值」（也没有 采购价×数量 可兜底），没法按货值摊。"); return; }
    const plan = base.map(({ r, goods }) => {
      const w = goods / totalGoods;
      const f = +(gF * w).toFixed(2), m = +(gM * w).toFixed(2), d = +(gD * w).toFixed(2), i = +(gI * w).toFixed(2);
      const qty = Number(r.qty || 0);
      const landed = qty > 0 ? +(((goods + f + m + d + i + Number(r.share_fee || 0)) / qty).toFixed(2)) : null;
      return { id: r.id, name: r.product_name, qty, goods: +goods.toFixed(2), f, m, d, i, landed, pct: +(w * 100).toFixed(1) };
    });
    setSpreadPwd(""); setSpreadErr("");
    setSpreadAsk({ groupKey: g.key, name: batchVal(g, "ship_batch") || "(无批次号)", plan, gF, gM, gD, gI, totalGoods });
  };

  const applySpread = async () => {
    if (spreadPwd.trim() !== "852963") { setSpreadErr("密码不正确, 请重新输入"); return; }
    const p = spreadAsk;
    if (!p) return;
    setSpreadBusy(true);
    let bad = "";
    const written = [];
    for (const it of p.plan) {
      if (it.landed == null) continue;
      const { error } = await supabase.from("shipments").update({ landed_cost: it.landed }).eq("id", it.id);
      if (error) { bad = error.message; break; }
      written.push(it);
    }
    if (written.length) setRows(prev => prev.map(r => { const hit = written.find(w => w.id === r.id); return hit ? { ...r, landed_cost: hit.landed } : r; }));
    setSpreadBusy(false);
    if (bad) { setSpreadErr("写入失败: " + bad + (written.length ? `（已成功 ${written.length} 行）` : "")); return; }
    setSpreadAsk(null);
    setSpreadPwd("");
  };

  // 待我处理: 财务专员待复核的批次 + 等我签字的修改申请 (KK 2026-09-18 / 2026-11-02)
  const isMyTodo = (g) => {
    const rev = revOf(g);
    if (canReview && rev.status === "pending") return true;
    return rev.status === "change_requested" && iAmApprover(rev.req);
  };
  const myTodoCount = batches.filter(isMyTodo).length;
  const [onlyMine, setOnlyMine] = useState(false);
  const shownBatches = onlyMine ? batches.filter(isMyTodo) : batches;

  // 汇总: 各店铺发货数 + 数量合计 + 到仓成本
  const summary = useMemo(() => {
    const byStore = {};
    rows.forEach(r => {
      if (!byStore[r.store]) byStore[r.store] = { count: 0, qty: 0, cost: 0 };
      byStore[r.store].count++;
      byStore[r.store].qty += Number(r.qty || 0);
      byStore[r.store].cost += Number(r.landed_cost || 0) * Number(r.qty || 0);
    });
    return byStore;
  }, [rows]);

  // 未补字段警告 (推给成都推广, 打开看板即见):
  //   65 天规则 (红): 发货>65天 缺 上架日期/上架数量/损耗/赔付/亏损
  //   14 天规则 (黄): 发货>14天 缺 头程/杂费/关税/保险费/分摊费/到仓价/物流商/渠道/单价/尾程单号
  const FIELDS_65 = ["listed_date", "listed_qty", "loss_qty", "compensation_eur", "loss_amount"];
  const FIELDS_14 = ["freight", "misc_fee", "duty", "insurance_fee", "share_fee", "landed_cost", "logistics_provider", "channel", "unit_price", "last_mile_no"];
  const checkOverdue = useMemo(() => {
    const today = Date.now();
    const r65 = [], r14 = [];
    rows.forEach(r => {
      if (!r.ship_date) return;
      const days = (today - new Date(r.ship_date).getTime()) / 86400000;
      if (days > 65) {
        const missing = FIELDS_65.filter(f => f === "listed_date" ? !r[f] : (r[f] == null || r[f] === ""));
        if (missing.length) r65.push({ row: r, days: Math.floor(days), missing });
      }
      if (days > 14) {
        const missing = FIELDS_14.filter(f => {
          if (["logistics_provider", "channel", "last_mile_no"].includes(f)) return !r[f];
          return r[f] == null || r[f] === "";
        });
        if (missing.length) r14.push({ row: r, days: Math.floor(days), missing });
      }
    });
    return { r65, r14 };
  }, [rows]);

  if (shipRole === null) return <div style={{ color: C.faint, padding: 40 }}>加载中…</div>;

  // 编辑弹窗里: 若该行所属批次已复核 → 金额字段只读, 提示走「申请修改」
  const gEdit = editShip ? batchOfRow(editShip.id) : null;
  const lockEdit = !!gEdit && isLocked(gEdit);

  return (
    <div>
      {/* 顶部 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>发货记录</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            按批次分组 · 批次级字段(日期/仓库/批次/头程/杂费/关税/保险费/物流商/渠道)整批合并, 点格子即改整批 · 总值=Σ货值(自动) · 金额¥ · 全员可见 · {canEdit ? "成都推广/供应链/采购/管理员可更新" : "只读"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: C.faint }}>数据更新于</span>
          <span style={{ fontSize: 12, color: C.ink, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: C.panel, border: `1px solid ${C.line}` }}>尚未录入</span>
        </div>
      </div>

      {/* 筛选: 店铺 */}
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: C.sub }}>店铺:</span>
          <select value={filterStore} onChange={e => setFilterStore(e.target.value)}
            style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }}>
            <option value="">全部店铺</option>
            {storeOpts.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ fontSize: 12, color: C.sub }}>发货批次:</span>
          <MultiSelect label="批次" options={batchOpts} value={filterBatch} onChange={setFilterBatch} width={280} allText="全部批次" />
          {(filterStore || filterBatch.length > 0) && (
            <span onClick={() => { setFilterStore(""); setFilterBatch([]); }}
              style={{ fontSize: 12, color: C.brand, cursor: "pointer", fontWeight: 600 }}>重置</span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>
            {rows.length} 条{filterBatch.length ? ` · 已选 ${filterBatch.length} 个批次` : ""} · 共 {batches.length} 批
          </span>
          {/* 待我处理: 待复核(夏蕾) / 待我同意(任何人都可能) */}
          {(myTodoCount > 0 || onlyMine) && (
            <span onClick={() => setOnlyMine(v => !v)} title="只看需要我处理的批次"
              style={{
                fontSize: 11, fontWeight: 600, cursor: "pointer", borderRadius: 6, padding: "4px 10px",
                border: `1px solid ${myTodoCount ? "#d9a441" : C.line}`,
                background: onlyMine ? "#d9a44118" : "transparent",
                color: myTodoCount ? "#d9a441" : C.faint,
              }}>
              待我处理 {myTodoCount}{onlyMine ? " · 只看这些" : ""}
            </span>
          )}
        </div>
      </div>

      {/* 汇总: 各店铺 */}
      {Object.keys(summary).length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 14 }}>
          {Object.entries(summary).map(([s, v]) => (
            <div key={s} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: C.sub }}>{s}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginTop: 2 }}>{v.count} 条 · {v.qty} 件</div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>到仓成本 ¥{v.cost.toFixed(2)}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* 未上架货值 (KK 2026-09-20): 只统计还没标记「已上架」的行 */}
      {rows.length > 0 && (() => {
        const un = rows.filter(r => !r.listed);
        const unAmt = un.reduce((a, r) => a + Number(r.goods_value || 0), 0);
        const unQty = un.reduce((a, r) => a + Number(r.qty || 0), 0);
        const allAmt = rows.reduce((a, r) => a + Number(r.goods_value || 0), 0);
        const pct = allAmt > 0 ? (unAmt / allAmt * 100).toFixed(1) : "—";
        const byStore = {};
        un.forEach(r => { byStore[r.store] = (byStore[r.store] || 0) + Number(r.goods_value || 0); });
        return (
          <div style={{ background: C.panel, border: "1px solid #d9a441", borderRadius: 8, padding: "12px 16px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, color: C.sub }}>未上架货值 · 未标记「已上架」的行</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#d9a441", marginTop: 2 }}>¥{unAmt.toFixed(2)}</div>
              </div>
              <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.9 }}>
                <div><b>{un.length}</b> 条 · <b>{unQty}</b> 件 未上架</div>
                <div style={{ fontSize: 11, color: C.faint }}>占全部货值 {pct}%（全部 ¥{allAmt.toFixed(2)}）</div>
              </div>
              <div style={{ marginLeft: "auto", fontSize: 11, color: C.faint, textAlign: "right", lineHeight: 1.9 }}>
                {Object.entries(byStore).length ? (
                  Object.entries(byStore).sort((a, b) => b[1] - a[1]).map(([st, amt]) => (
                    <div key={st}>{st} ¥{amt.toFixed(2)}</div>
                  ))
                ) : <div>全部已上架 ✅</div>}
              </div>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: C.faint }}>
              口径：行上没有点「↑上架」（= 还没写入库存）的，按「货值」累加；点了「✓已上架」后自动从本口径扣除。
            </div>
          </div>
        );
      })()}

      {/* 未补字段警告条 (仅 admin/cd_promotion 可见) */}
      {canEdit && checkOverdue.r65.length > 0 && (
        <div style={{ background: "#c05b5222", border: "1px solid #c05b52", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#c05b52" }}>
          🔴 <b>{checkOverdue.r65.length} 条</b>发货已超 65 天, 缺上架字段 (上架日期/上架数量/损耗/赔付/亏损), 需成都推广尽快补全
        </div>
      )}
      {canEdit && checkOverdue.r14.length > 0 && (
        <div style={{ background: "#d9a44122", border: "1px solid #d9a441", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#d9a441" }}>
          🟡 <b>{checkOverdue.r14.length} 条</b>发货已超 14 天, 缺费用/物流字段 (头程/杂费/关税/保险费/分摊费/到仓价/物流商/渠道/单价/尾程单号), 需成都推广尽快补全
        </div>
      )}

      {/* 表格: 按批次分组, 批次级列整批合并显示一个值 */}
      {batches.length ? (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "auto" }}>
          <div style={{ minWidth: 2488, padding: "0 6px 4px" }}>
            <div style={{ display: "grid", gridTemplateColumns: GRID_T, background: "#1f3a68", fontSize: 10, color: "#fff", fontWeight: 600, position: "sticky", top: 0, zIndex: 2, margin: "0 -6px" }}>
              {BCOLS.map(c => (
                <div key={c.k} title={c.t === "batch" ? "批次级字段: 点合并格按批次修改" : (c.t === "sum" ? "自动 = 本批次各行货值之和" : "")}
                  style={{ padding: "8px 6px", borderRight: `1px solid #2a4a78` }}>
                  {c.l}{c.t === "sum" && <span style={{ fontWeight: 400, color: "#9FE1CB" }}> 自动</span>}
                </div>
              ))}
            </div>
            {shownBatches.map(g => {
              const N = g.rows.length;
              // 逐行告警 (超 65 天缺上架字段 / 超 14 天缺费用物流字段)
              const rowWarn = g.rows.map(r => {
                const o65 = checkOverdue.r65.find(o => o.row.id === r.id);
                const o14 = checkOverdue.r14.find(o => o.row.id === r.id);
                return o65 ? { ...o65, color: "#c05b52" } : (o14 ? { ...o14, color: "#d9a441" } : null);
              });
              const anyWarn = rowWarn.find(Boolean);
              const blockColor = anyWarn ? anyWarn.color : null;
              return (
                <div key={g.key} style={{
                  display: "grid", gridTemplateColumns: GRID_T,
                  gridTemplateRows: `repeat(${N}, minmax(34px, auto))`,
                  margin: "0 0 6px 0",
                  background: blockColor ? `${blockColor}26` : `${g.color}22`,
                  border: `1px solid ${blockColor || g.color}`,
                  borderLeft: `4px solid ${blockColor || g.color}`,
                  borderRadius: 4,
                }}>
                  {/* 批次级列: 跨整批 */}
                  {BATCH_COLS.map(c => {
                    // 「复核」列: 夏蕾直接点复核; 复核后改动要 夏蕾+雪梅 双签 (KK 2026-11-02)
                    if (c.k === "review") {
                      const rev = revOf(g);
                      const req = rev.req;
                      const remain = req ? reqRemaining(req) : [];
                      const signedList = req ? reqApprovers(req).filter(e => reqSigned(req)[e]) : [];
                      const canSign = !!req && iAmApprover(req) && remain.includes(myEmail);
                      const btn = { fontSize: 10, padding: "2px 8px", borderRadius: 5, cursor: "pointer", border: "1px solid", background: "transparent" };
                      return (
                        <div key={c.k} style={{
                          gridColumn: colIdx(c.k), gridRow: `span ${N}`, padding: "6px 8px",
                          borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column",
                          gap: 4, justifyContent: "center", alignItems: "flex-start",
                          background: rev.status === "approved" ? "#4db6a40d" : rev.status === "change_requested" ? "#d9a4410d" : "transparent",
                        }}>
                          {rev.status === "pending" && (
                            <>
                              <span style={{ fontSize: 11, color: C.sub }}>待复核</span>
                              {canReview ? (
                                <button onClick={(e) => { e.stopPropagation(); doReview(g); }}
                                  title="财务专员复核该批次 · 复核后任何数据改动都要 夏蕾 + 雪梅 双人签字"
                                  style={{ ...btn, borderColor: "#4db6a4", color: "#4db6a4", fontWeight: 700 }}>点此复核</button>
                              ) : (
                                <span style={{ fontSize: 10, color: C.faint }}>等夏蕾复核</span>
                              )}
                            </>
                          )}
                          {rev.status === "approved" && (
                            <>
                              <span style={{ fontSize: 11, color: "#4db6a4", fontWeight: 600 }}>✓ 已复核</span>
                              <span style={{ fontSize: 10, color: C.faint }}>{nameOf(rev.by)} {fmtAt(rev.at)}</span>
                              <span style={{ fontSize: 9, color: C.faint, lineHeight: 1.4 }}>🔒 改动需 夏蕾 + 雪梅 双签</span>
                              {canPropose && (
                                <button onClick={(e) => { e.stopPropagation(); openChange(g); }} style={{ ...btn, borderColor: C.line, color: C.sub }}>申请修改</button>
                              )}
                            </>
                          )}
                          {rev.status === "change_requested" && req && (
                            <>
                              <span style={{ fontSize: 11, color: "#d9a441", fontWeight: 700 }}>待签字</span>
                              <span style={{ fontSize: 10, color: C.faint, lineHeight: 1.45 }}>
                                {nameOf(req.by)} 申请<br />
                                已签 {signedList.length ? signedList.map(nameOf).join("、") : "无"}
                                {remain.length ? ` · 差 ${remain.map(nameOf).join("、")}` : ""}
                              </span>
                              {canSign ? (
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button onClick={(e) => { e.stopPropagation(); signChange(g); }} style={{ ...btn, borderColor: "#4db6a4", color: "#4db6a4", fontWeight: 700 }}>
                                    {remain.length > 1 ? "签字" : "签字生效"}
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); rejectChange(g); }} style={{ ...btn, borderColor: "#c05b52", color: "#e0857a" }}>拒绝</button>
                                </div>
                              ) : (
                                <span style={{ fontSize: 10, color: C.faint }}>等 {remain.map(nameOf).join("、") || "对方"} 签字</span>
                              )}
                            </>
                          )}
                        </div>
                      );
                    }
                    const key = `${g.key}|${c.k}`;
                    const editing = bEditKey === key;
                    const v = batchVal(g, c.k);
                    const changed = !!bPending[key];
                    const locked = lockBatchField(g, c.k);
                    return (
                      <div key={c.k}
                        onClick={() => !editing && openBatchCell(g, c)}
                        title={!canEdit ? "" : (editing ? "" : (locked ? "已复核 · 点这里发起修改申请(需对方同意)" : "点一下按整批修改"))}
                        style={{
                          gridColumn: colIdx(c.k), gridRow: `span ${N}`,
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "6px", borderRight: `1px solid ${C.line}`,
                          cursor: canEdit && !editing ? "pointer" : "default",
                          background: changed ? "#d9a44118" : (locked ? "#5b667010" : "transparent"),
                          boxShadow: changed ? "inset 0 0 0 1px #d9a441" : "none",
                          fontSize: c.k === "ship_batch" ? 10 : 11, color: c.k === "ship_batch" ? C.sub : (locked ? C.sub : C.ink),
                          fontFamily: "inherit", textAlign: "left", overflow: "hidden",
                        }}>
                        {editing ? (
                          <input autoFocus value={bVal}
                            onChange={e => setBVal(e.target.value)}
                            onBlur={() => commitBatchCell(g, c)}
                            onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setBEditKey(null); } }}
                            style={{ width: "100%", padding: "5px 6px", background: C.bg, border: `1px solid ${C.brand}`, borderRadius: 5, color: C.ink, fontSize: 11, outline: "none" }} />
                        ) : (
                          <>
                            {locked && <span title="已复核" style={{ fontSize: 10, color: "#d9a441" }}>🔒</span>}
                            {v === null || v === undefined || v === "" ? <span style={{ color: C.faint }}>—</span> : String(v)}
                            {c.k === "freight" && canEdit && (
                              <span
                                onClick={e => { e.stopPropagation(); openSpread(g); }}
                                title="按货值占比把 头程+杂费+关税+保险 摊到每行，自动算出「到仓价」"
                                style={{ marginLeft: "auto", flexShrink: 0, fontSize: 9, padding: "1px 5px", borderRadius: 4, border: `1px solid ${locked ? C.faint : C.brand}66`, color: locked ? C.faint : C.brand, cursor: "pointer", fontWeight: 700, lineHeight: 1.4 }}>摊</span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                  {/* 自动列: 总值 = Σ货值 */}
                  {SUM_COLS.map(c => (
                    <div key={c.k} style={{
                      gridColumn: colIdx(c.k), gridRow: `span ${N}`, display: "flex", alignItems: "center",
                      padding: "6px", borderRight: `1px solid ${C.line}`, fontWeight: 700, color: C.brand, fontSize: 12,
                    }}>
                      {g.total ? g.total.toFixed(2) : "—"}
                    </div>
                  ))}
                  {/* 逐行列 */}
                  {g.rows.map((r, ri) => {
                    const warn = rowWarn[ri];
                    const cumDays = r.ship_date ? Math.floor((Date.now() - new Date(r.ship_date).getTime()) / 86400000) : null;
                    const cell = (k) => ({
                      gridColumn: colIdx(k), gridRow: ri + 1, padding: "6px",
                      borderRight: `1px solid ${C.line}`, borderTop: ri ? `1px solid ${C.line}` : "none",
                      fontSize: 11, color: C.ink, display: "flex", alignItems: "center", overflow: "hidden",
                      whiteSpace: "nowrap", textOverflow: "ellipsis",
                      // 已复核批次的金额列: 变暗 + 提示需双人确认 (KK 2026-09-18)
                      ...(lockRowField(g, k) ? { opacity: 0.55, background: "#5b667010" } : {}),
                    });
                    return ROW_COLS.map(c => {
                      if (c.k === "product_name") return (
                        <div key={r.id + c.k} style={{ ...cell(c.k), fontWeight: 600, background: warn ? `${warn.color}18` : "transparent" }}>
                          {warn && canEdit && <span title={`已过 ${warn.days} 天, 待填: ${warn.missing.join(", ")}`} style={{ color: warn.color, fontWeight: 700, marginRight: 4, cursor: "help" }}>⚠</span>}
                          {r.product_name}
                        </div>
                      );
                      if (c.k === "asin") return <div key={r.id + c.k} style={{ ...cell(c.k), color: C.sub }}>{r.asin || "—"}</div>;
                      if (c.k === "qty") return <div key={r.id + c.k} style={{ ...cell(c.k), fontWeight: 600 }}>{r.qty}</div>;
                      if (c.k === "purchase_price") return <div key={r.id + c.k} style={cell(c.k)}>{r.purchase_price ? "¥" + Number(r.purchase_price).toFixed(2) : "—"}</div>;
                      if (c.k === "goods_value") return <div key={r.id + c.k} style={cell(c.k)}>{r.goods_value || "—"}</div>;
                      if (c.k === "share_fee") return <div key={r.id + c.k} style={cell(c.k)}>{r.share_fee || "—"}</div>;
                      if (c.k === "landed_cost") return <div key={r.id + c.k} style={{ ...cell(c.k), color: C.brand, fontWeight: 600 }}>{r.landed_cost ? "¥" + Number(r.landed_cost).toFixed(2) : "—"}</div>;
                      if (c.k === "unit_price") return <div key={r.id + c.k} style={cell(c.k)}>{r.unit_price ? "¥" + Number(r.unit_price).toFixed(2) : "—"}</div>;
                      if (c.k === "last_mile_no") return <div key={r.id + c.k} style={{ ...cell(c.k), color: C.faint, fontSize: 10 }}>{r.last_mile_no || "—"}</div>;
                      if (c.k === "listed_date") return <div key={r.id + c.k} style={cell(c.k)}>{r.listed_date || "—"}</div>;
                      if (c.k === "listed_qty") return <div key={r.id + c.k} style={cell(c.k)}>{r.listed_qty || "—"}</div>;
                      if (c.k === "loss_qty") return <div key={r.id + c.k} style={{ ...cell(c.k), color: C.drop }}>{r.loss_qty || "—"}</div>;
                      if (c.k === "compensation_eur") return <div key={r.id + c.k} style={cell(c.k)}>{r.compensation_eur ? "¥" + Number(r.compensation_eur).toFixed(2) : "—"}</div>;
                      if (c.k === "loss_amount") return <div key={r.id + c.k} style={{ ...cell(c.k), color: C.drop }}>{r.loss_amount ? "¥" + Number(r.loss_amount).toFixed(2) : "—"}</div>;
                      if (c.k === "insurance_no") return <div key={r.id + c.k} style={{ ...cell(c.k), color: C.faint, fontSize: 10 }}>{r.insurance_no || "—"}</div>;
                      if (c.k === "insured_amount") return <div key={r.id + c.k} style={cell(c.k)}>{r.insured_amount ? "¥" + Number(r.insured_amount).toFixed(2) : "—"}</div>;
                      if (c.k === "days") return <div key={r.id + c.k} style={{ ...cell(c.k), fontWeight: 600, color: cumDays > 65 ? "#c05b52" : cumDays > 14 ? "#d9a441" : C.ink }}>{cumDays != null ? `${cumDays}天` : "—"}</div>;
                      if (c.k === "freight_paid") return (
                        <div key={r.id + c.k} style={{ ...cell(c.k), justifyContent: "center", fontWeight: 600, color: r.freight_paid ? "#4db6a4" : C.drop, cursor: canCheck ? "pointer" : "default", opacity: canCheck ? 1 : 0.6 }}
                          onClick={canCheck ? () => toggleField(r.id, "freight_paid", r.freight_paid) : undefined}>
                          {r.freight_paid ? "✓ 已付" : "✗ 未付"}
                        </div>
                      );
                      if (c.k === "note") return <div key={r.id + c.k} style={{ ...cell(c.k), color: C.faint, fontSize: 10 }}>{r.note || "—"}</div>;
                      if (c.k === "ops") return (
                        <div key={r.id + c.k} style={{ ...cell(c.k), justifyContent: "center", whiteSpace: "nowrap" }}>
                          {canEdit && !r.listed && (
                            <span onClick={() => markListed(r)} title="标记已上架 → 写入库存"
                              style={{ color: "#5DCAA5", cursor: "pointer", fontWeight: 600, fontSize: 11, marginRight: 6 }}>↑上架</span>
                          )}
                          {canEdit && r.listed && (
                            <span title="已写入库存" style={{ color: "#4db6a4", fontWeight: 600, fontSize: 11, marginRight: 6 }}>✓已上架</span>
                          )}
                          {canEdit && (
                            <span onClick={() => openEditShip(r)} style={{ color: C.brand, cursor: "pointer", fontWeight: 600, fontSize: 11 }}>✎</span>
                          )}
                        </div>
                      );
                      return <div key={r.id + c.k} style={cell(c.k)}>—</div>;
                    });
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ padding: 30, textAlign: "center", color: C.faint, fontSize: 12, border: `1px dashed ${C.line}`, borderRadius: 8 }}>
          暂无发货记录 · Excel 导入: node scripts/import-shipments.mjs {"<文件>"} --store=店铺名
        </div>
      )}

      {/* 按货值摊分: 预览 + 密码确认 (KK 2026-11-19) */}
      {spreadAsk && (
        <div onClick={() => !spreadBusy && setSpreadAsk(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.62)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 123 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: "min(1000px, 95vw)", maxHeight: "88vh", overflow: "auto", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "0 18px 50px rgba(0,0,0,.4)" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>按货值占比摊分 → 到仓价</div>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>
                  批次 <b style={{ color: C.sub }}>{spreadAsk.name}</b> · 批货值 ¥{spreadAsk.totalGoods.toFixed(2)}
                  {" · "}头程 {spreadAsk.gF} / 杂费 {spreadAsk.gM} / 关税 {spreadAsk.gD} / 保险 {spreadAsk.gI}
                </div>
              </div>
              <span onClick={() => !spreadBusy && setSpreadAsk(null)} style={{ marginLeft: "auto", cursor: "pointer", color: C.faint, fontSize: 14 }}>✕</span>
            </div>

            <div style={{ padding: "12px 18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(160px,1.6fr) 56px 92px 56px 84px 76px 76px 76px 92px", background: "#1f3a68", fontSize: 10.5, color: "#fff", fontWeight: 600, borderRadius: 6 }}>
                {["产品", "数量", "货值", "占比", "摊头程", "摊杂费", "摊关税", "摊保险", "到仓价"].map((h, hi) => (
                  <div key={h} style={{ padding: "7px 8px", textAlign: hi === 0 || hi === 3 ? "left" : "right", borderRight: hi < 8 ? "1px solid #2a4a78" : "none" }}>{h}</div>
                ))}
              </div>
              {spreadAsk.plan.map((p, i) => (
                <div key={p.id} style={{ display: "grid", gridTemplateColumns: "minmax(160px,1.6fr) 56px 92px 56px 84px 76px 76px 76px 92px", fontSize: 11.5, color: C.ink, borderTop: `1px solid ${C.line}`, background: i % 2 ? C.bg : "transparent" }}>
                  <div style={{ padding: "6px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderRight: `1px solid ${C.line}` }}>{p.name || "—"}</div>
                  <div style={{ padding: "6px 8px", textAlign: "right", borderRight: `1px solid ${C.line}` }}>{p.qty}</div>
                  <div style={{ padding: "6px 8px", textAlign: "right", borderRight: `1px solid ${C.line}` }}>{p.goods.toFixed(2)}</div>
                  <div style={{ padding: "6px 8px", textAlign: "left", color: C.sub, borderRight: `1px solid ${C.line}` }}>{p.pct}%</div>
                  <div style={{ padding: "6px 8px", textAlign: "right", color: C.sub, borderRight: `1px solid ${C.line}` }}>{p.f.toFixed(2)}</div>
                  <div style={{ padding: "6px 8px", textAlign: "right", color: C.sub, borderRight: `1px solid ${C.line}` }}>{p.m.toFixed(2)}</div>
                  <div style={{ padding: "6px 8px", textAlign: "right", color: C.sub, borderRight: `1px solid ${C.line}` }}>{p.d.toFixed(2)}</div>
                  <div style={{ padding: "6px 8px", textAlign: "right", color: C.sub, borderRight: `1px solid ${C.line}` }}>{p.i.toFixed(2)}</div>
                  <div style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: C.brand }}>
                    {p.landed == null ? "—" : "¥" + p.landed.toFixed(2)}
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 10, fontSize: 10.5, color: C.faint, lineHeight: 1.6 }}>
                公式：到仓价 =（该行货值 + 按货值占比摊到的 头程/杂费/关税/保险 + 该行分摊费）÷ 该行数量。写库只改「到仓价」这一列。
              </div>

              <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: C.sub }}>确认密码</span>
                <input type="password" value={spreadPwd} autoFocus
                  onChange={e => { setSpreadPwd(e.target.value); setSpreadErr(""); }}
                  onKeyDown={e => { if (e.key === "Enter" && !spreadBusy) applySpread(); }}
                  placeholder="输入密码后写入"
                  style={{ width: 180, padding: "7px 10px", background: C.bg, border: `1px solid ${spreadErr ? C.drop : C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, outline: "none" }} />
                {spreadErr && <span style={{ fontSize: 11.5, color: C.drop }}>{spreadErr}</span>}
              </div>
            </div>

            <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setSpreadAsk(null)} disabled={spreadBusy}
                style={{ padding: "8px 18px", background: "transparent", border: `1px solid ${C.line}`, borderRadius: 7, color: C.sub, fontSize: 12.5, cursor: "pointer" }}>取消</button>
              <button onClick={applySpread} disabled={spreadBusy}
                style={{ padding: "8px 20px", background: C.brand, border: "none", borderRadius: 7, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: spreadBusy ? "default" : "pointer", opacity: spreadBusy ? 0.6 : 1 }}>
                {spreadBusy ? "写入中…" : `确认写入 ${spreadAsk.plan.filter(p => p.landed != null).length} 行`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批次级改动: 待提交浮条 + 密码确认 */}
      {bPendingCount > 0 && !bPwdOpen && (
        <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 26, zIndex: 110, background: C.panel, border: "1px solid #d9a441", boxShadow: "0 10px 30px rgba(0,0,0,.28)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 12, color: C.ink }}>
            批次级改动 <b style={{ color: C.brand, fontSize: 14 }}>{bPendingCount}</b> 项 · 尚未入库, 点右侧确认提交(需密码)
          </span>
          <button onClick={discardBatchAll} style={{ padding: "6px 12px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 12, cursor: "pointer" }}>撤销全部</button>
          <button onClick={submitBatchAll} style={{ padding: "6px 16px", background: C.brand, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>确认提交</button>
        </div>
      )}
      {bPwdOpen && (
        <div onClick={() => { setBPwdOpen(false); setBPwd(""); setBPwdErr(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 121 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, width: 460, maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>确认提交 {bPendingCount} 项批次级改动</div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 14 }}>核对无误后输入密码, 一次性写入该批次的所有行</div>
            <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 14 }}>
              <div style={{ display: "flex", color: C.sub, fontSize: 11, paddingBottom: 6, borderBottom: `1px solid ${C.line}` }}>
                <span style={{ width: 80 }}>字段</span>
                <span style={{ flex: 1 }}>批次</span>
                <span style={{ textAlign: "right" }}>原值 → 新值</span>
              </div>
              {Object.values(bPending).map(it => (
                <div key={it.key} style={{ display: "flex", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.line}` }}>
                  <span style={{ width: 80, color: C.ink }}>{it.label}</span>
                  <span style={{ flex: 1, color: C.sub, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.batchName}</span>
                  <span style={{ textAlign: "right" }}>
                    <span style={{ color: C.faint }}>{it.oldV === null || it.oldV === undefined || it.oldV === "" ? "—" : String(it.oldV)}</span>
                    <span style={{ margin: "0 6px", color: C.faint }}>→</span>
                    <span style={{ color: C.brand, fontWeight: 700 }}>{it.val === null || it.val === "" ? "清空" : String(it.val)}</span>
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>确认密码</div>
            <input type="password" value={bPwd} autoFocus
              onChange={e => { setBPwd(e.target.value); setBPwdErr(""); }}
              onKeyDown={e => { if (e.key === "Enter") confirmBatchAll(); if (e.key === "Escape") { setBPwdOpen(false); setBPwd(""); setBPwdErr(""); } }}
              placeholder="输入密码"
              style={{ width: "100%", padding: "9px 12px", background: C.bg, border: `1px solid ${bPwdErr ? "#c05b52" : C.line}`, borderRadius: 6, color: C.ink, fontSize: 14, marginBottom: 6 }} />
            {bPwdErr && <div style={{ fontSize: 11, color: "#c05b52", marginBottom: 6 }}>{bPwdErr}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => { setBPwdOpen(false); setBPwd(""); setBPwdErr(""); }} style={{ flex: 1, padding: "9px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>返回继续改</button>
              <button onClick={confirmBatchAll} style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>确认提交</button>
            </div>
          </div>
        </div>
      )}

      {/* 修改申请弹窗: 已复核批次的金额字段要改 → 提交申请, 等对方同意才入库 */}
      {chgOpen && (
        <div onClick={() => setChgOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 122 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, width: 720, maxHeight: "86vh", overflow: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              发起修改申请 · 批次「{batchVal(chgOpen, "ship_batch") || "(无批次)"}」
            </div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 14, lineHeight: 1.7 }}>
              该批次已复核, <b>整行数据</b>（金额 + 名称/ASIN/上架等）的改动都要<b>双人确认</b>才生效。<br />
              提交后需 <b style={{ color: C.brand }}>{approversFor().map(nameOf).join(" + ")}</b> 签字; 全部签完才写入, 任一方拒绝则本次改动作废。<br />
              只填需要改的字段, <b>空着 = 不变</b>; 要清空某个值, 请在该格里手动删成空白并告诉我。
            </div>

            <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>批次级字段 (整批生效)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
              {CHG_BATCH.map(c => (
                <div key={c.k}>
                  <div style={{ fontSize: 11, color: C.faint, marginBottom: 4 }}>
                    {c.l}
                    <span style={{ marginLeft: 4, color: C.faint }}>(现 {(() => { const v = batchVal(chgOpen, c.k); return v === null || v === undefined || v === "" ? "—" : String(v); })()})</span>
                  </div>
                  <input value={chgForm.batch[c.k] ?? ""} inputMode={c.ty === "num" ? "decimal" : undefined} type={c.ty === "date" ? "date" : undefined}
                    onChange={e => setChgForm(s => ({ ...s, batch: { ...s.batch, [c.k]: e.target.value } }))}
                    style={{ width: "100%", padding: "7px 9px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, outline: "none" }} />
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>行级字段 (按行生效)</div>
            <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px" }}>
              {chgOpen.rows.map((r, ri) => (
                <div key={r.id} style={{ paddingBottom: ri ? 10 : 0, marginBottom: ri ? 10 : 0, borderBottom: ri ? `1px solid ${C.line}` : "none" }}>
                  <div style={{ fontSize: 11, color: C.sub, marginBottom: 6 }}>
                    #{ri + 1} {r.product_name || "—"} <span style={{ color: C.faint }}>{r.asin || ""}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
                    {CHG_ROW.map(c => (
                      <div key={c.k}>
                        <div style={{ fontSize: 10, color: C.faint, marginBottom: 3 }}>{c.l}</div>
                        <input value={(chgForm.rows[r.id] || {})[c.k] ?? ""} inputMode={c.ty === "num" ? "decimal" : undefined} type={c.ty === "date" ? "date" : undefined}
                          onChange={e => setChgForm(s => ({ ...s, rows: { ...s.rows, [r.id]: { ...(s.rows[r.id] || {}), [c.k]: e.target.value } } }))}
                          style={{ width: "100%", padding: "5px 7px", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 5, color: C.ink, fontSize: 11, outline: "none" }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setChgOpen(null)} disabled={chgBusy}
                style={{ flex: 1, padding: "9px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                取消
              </button>
              <button onClick={submitChange} disabled={chgBusy}
                style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: chgBusy ? "wait" : "pointer", fontWeight: 600, opacity: chgBusy ? 0.6 : 1 }}>
                {chgBusy ? "提交中…" : "提交修改申请"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {editShip && (
        <div onClick={() => setEditShip(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, width: 620, maxHeight: "85vh", overflow: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>编辑发货记录</div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 14 }}>带 * 为必填 · 数值留空会清空 · 保存后表格即时更新 · 灰色虚线框 = 批次级字段(表格上点合并格改, 整批生效)</div>
            {lockEdit && (
              <div style={{ background: "#d9a44118", border: "1px solid #d9a441", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 11, color: "#d9a441", lineHeight: 1.7 }}>
                ⚠️ 该批次<b>已复核</b>: 整行数据（含金额与名称/ASIN/上架等）<b>全部锁定</b>，此处只能查看。<br />
                要改就在下方点「发起修改申请」，由 <b>夏蕾 + 雪梅</b> 双方签字后才写入。
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {SHIP_TEXT.concat(SHIP_DATE).concat(SHIP_NUM).map(k => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>
                    {SHIP_LABEL[k] || k}{k === "product_name" || k === "qty" ? " *" : ""}
                    {SHIP_BATCH_FIELDS.includes(k) && <span style={{ marginLeft: 4, fontSize: 10, color: C.faint }}>(批次级)</span>}
                  </div>
                  {SHIP_BATCH_FIELDS.includes(k) ? (
                    <input value={shipForm[k] || ""} disabled title="批次级字段: 请在表格上点合并格修改, 整批生效"
                      style={{ width: "100%", padding: "7px 9px", background: C.bg, border: `1px dashed ${C.line}`, borderRadius: 6, color: C.faint, fontSize: 12, outline: "none" }} />
                  ) : lockEdit ? (
                    <input value={shipForm[k] || ""} disabled title="该批次已复核: 整行锁定, 改动需 夏蕾 + 雪梅 双签"
                      style={{ width: "100%", padding: "7px 9px", background: C.bg, border: `1px dashed #d9a441`, borderRadius: 6, color: C.sub, fontSize: 12, outline: "none" }} />
                  ) : SHIP_DATE.includes(k) ? (
                    <input type="date" value={shipForm[k] || ""} onChange={(e) => setShipForm(s => ({ ...s, [k]: e.target.value }))}
                      style={{ width: "100%", padding: "7px 9px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, outline: "none" }} />
                  ) : (
                    <input value={shipForm[k] || ""} onChange={(e) => setShipForm(s => ({ ...s, [k]: e.target.value }))}
                      placeholder={SHIP_LABEL[k] || k}
                      style={{ width: "100%", padding: "7px 9px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, outline: "none" }} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button onClick={() => setEditShip(null)}
                style={{ flex: 1, padding: "9px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                取消
              </button>
              {lockEdit ? (
                <button onClick={() => { const g0 = gEdit; setEditShip(null); if (canPropose && g0) openChange(g0); }} disabled={!canPropose}
                  style={{ flex: 1, padding: "9px", background: canPropose ? "#d9a441" : C.line, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: canPropose ? "pointer" : "not-allowed", fontWeight: 600 }}>
                  发起修改申请
                </button>
              ) : (
                <button onClick={saveShip}
                  style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                  保存修改
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- 链接制作进度 (空骨架, 待 KK 定义维度) ----------------
function LinkProgress() {
  const [rows, setRows] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [roleLabel, setRoleLabel] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data && data.user) {
        const r = getUserRole(data.user.email || "");
        setRoleLabel(getRoleLabel(r));
        setCanEdit(r === "fr" || r === "cd_link" || r === "admin");
      }
    });
    loadRows();
  }, []);
  const loadRows = () => {
    supabase.from("link_progress").select("*").order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setRows(data); })
      .catch(e => console.error("LinkProgress fetch err:", e));
  };
  const cols = [
    { key: "product_name",   label: "产品" },
    { key: "receive_date",   label: "接收日期" },
    { key: "asin",           label: "asin" },
    { key: "country",        label: "国家", kind: "country" },
    { key: "sku",            label: "确定sku" },
    { key: "title",          label: "标题" },
    { key: "five_points",    label: "五点" },
    { key: "kit_image",      label: "套图" },
    { key: "a_plus",         label: "a+" },
    { key: "video",          label: "视频" },
    { key: "qa",             label: "q&a" },
    { key: "fba_conversion", label: "fba转化" },
    { key: "deliver_date",   label: "交付日期" },
  ];
  const COUNTRIES = ["", "FR", "DE", "UK", "IT", "ES", "NL", "PL", "SE"];
  // 编辑弹窗状态
  const [editRow, setEditRow] = useState(null);   // null 或 { id, form }
  const [form, setForm] = useState({});
  const openEdit = (row) => {
    const f = {};
    cols.forEach(c => f[c.key] = row ? (row[c.key] || "") : "");
    setForm(f); setEditRow(row ? { id: row.id } : { id: null });
  };
  const saveRow = async () => {
    const clean = {};
    cols.forEach(c => clean[c.key] = (form[c.key] || "").trim() || null);
    if (!clean.product_name) { alert("产品名必填"); return; }
    if (editRow.id) {
      const { error } = await supabase.from("link_progress").update(clean).eq("id", editRow.id);
      if (error) { alert("保存失败: " + error.message); return; }
    } else {
      const { error } = await supabase.from("link_progress").insert(clean);
      if (error) { alert("保存失败: " + error.message); return; }
    }
    setEditRow(null); loadRows();
  };
  const delRow = async (id) => {
    if (!confirm("确认删除该记录？")) return;
    const { error } = await supabase.from("link_progress").delete().eq("id", id);
    if (error) { alert("删除失败: " + error.message); return; }
    loadRows();
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>链接制作进度</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            链接制作各阶段跟踪 · 11 列 · {canEdit ? "法国/成都链接 可编辑" : "只读（法国/成都链接可编辑）"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.faint }}>当前角色: {roleLabel || "未登录"}</span>
          <span style={{ fontSize: 11, color: C.faint }}>共 {rows.length} 行</span>
          {canEdit && (
            <button onClick={() => openEdit(null)}
              style={{ padding: "6px 14px", background: C.brand, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              + 新增记录
            </button>
          )}
        </div>
      </div>
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.bg }}>
              {cols.map(c => (
                <th key={c.key} style={{ padding: "10px 8px", textAlign: "left", fontWeight: 600, color: C.ink, borderBottom: `1px solid ${C.line}`, minWidth: 110 }}>
                  {c.label}
                </th>
              ))}
              {canEdit && <th style={{ padding: "10px 8px", borderBottom: `1px solid ${C.line}`, width: 90 }}>操作</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length + (canEdit ? 1 : 0)} style={{ padding: 40, textAlign: "center", color: C.faint, fontStyle: "italic" }}>
                  暂无数据 · 等待录入
                </td>
              </tr>
            ) : rows.map(r => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                {cols.map(c => (
                  <td key={c.key} style={{ padding: "10px 8px", color: C.sub }}>
                    {r[c.key] || "—"}
                  </td>
                ))}
                {canEdit && (
                  <td style={{ padding: "10px 8px" }}>
                    <span onClick={() => openEdit(r)} style={{ color: C.brand, cursor: "pointer", fontSize: 11, marginRight: 8 }}>编辑</span>
                    <span onClick={() => delRow(r.id)} style={{ color: "#ff9090", cursor: "pointer", fontSize: 11 }}>删除</span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 新增/编辑 弹窗 */}
      {editRow && (
        <div onClick={() => setEditRow(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, width: 560, maxHeight: "85vh", overflow: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{editRow.id ? "编辑记录" : "新增记录"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {cols.map(c => (
                <div key={c.key}>
                  <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>{c.label}</div>
                  {c.key.endsWith("_date") ? (
                    <input type="date" value={form[c.key] || ""} onChange={(e) => setForm(s => ({ ...s, [c.key]: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, outline: "none" }} />
                  ) : c.kind === "country" ? (
                    <select value={form[c.key] || ""} onChange={(e) => setForm(s => ({ ...s, [c.key]: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, outline: "none" }}>
                      {COUNTRIES.map(x => <option key={x} value={x}>{x || "选择国家"}</option>)}
                    </select>
                  ) : (
                    <input value={form[c.key] || ""} onChange={(e) => setForm(s => ({ ...s, [c.key]: e.target.value }))}
                      placeholder={c.label}
                      style={{ width: "100%", padding: "8px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, outline: "none" }} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setEditRow(null)}
                style={{ flex: 1, padding: "9px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                取消
              </button>
              <button onClick={saveRow}
                style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- 库存统计 (空骨架, 待 KK 提供维度与数据源) ----------------
// 多选下拉筛选器 (可同时选多个值; 同字段内 OR, 跨字段 AND)
function MultiSelect({ label, options, value, onChange, width = 230, allText }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const kws = q.trim().toLowerCase();
  const shown = kws ? options.filter(o => String(o).toLowerCase().includes(kws)) : options;
  const toggle = (o) => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o]);
  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6, minWidth: 120, maxWidth: width,
          padding: "5px 10px", background: C.bg, borderRadius: 6, fontSize: 12, cursor: "pointer",
          border: `1px solid ${value.length ? C.brand : C.line}`, color: value.length ? C.ink : C.sub,
        }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value.length === 0 ? (allText || `全部${label}`) : `${label} (${value.length})${value.length === 1 ? "：" + value[0] : ""}`}
        </span>
        <span style={{ marginLeft: "auto", color: C.faint, fontSize: 10 }}>▼</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, width, maxHeight: 320, display: "flex", flexDirection: "column", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, zIndex: 40, boxShadow: "0 10px 30px rgba(0,0,0,.4)" }}>
          <div style={{ padding: 6, borderBottom: `1px solid ${C.line}` }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索选项…" autoFocus
              style={{ width: "100%", padding: "5px 8px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 5, color: C.ink, fontSize: 12, outline: "none" }} />
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 4 }}>
            {shown.map(o => (
              <label key={o} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 7px", borderRadius: 5, cursor: "pointer", fontSize: 12, color: C.ink }}>
                <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} style={{ cursor: "pointer" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o || "(空)"}</span>
              </label>
            ))}
            {!shown.length && <div style={{ padding: 10, color: C.faint, fontSize: 11, textAlign: "center" }}>无匹配选项</div>}
          </div>
          <div style={{ display: "flex", gap: 8, padding: 6, borderTop: `1px solid ${C.line}` }}>
            <button onClick={() => onChange([])} style={{ flex: 1, padding: "5px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 5, fontSize: 11, cursor: "pointer" }}>清空</button>
            <button onClick={() => setOpen(false)} style={{ flex: 1, padding: "5px", background: C.brand, color: "#fff", border: "none", borderRadius: 5, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>完成</button>
          </div>
        </div>
      )}
    </div>
  );
}

function InventoryStats() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [invRole, setInvRole] = useState(null);
  const [edInv, setEdInv] = useState(null);       // { id } 编辑库存行
  const [invForm, setInvForm] = useState({});
  const [edCost, setEdCost] = useState(null);     // { id, field, val } 表格内直改 到仓价/FBC标准费
  const [fbcTip, setFbcTip] = useState("");       // 标准 FBC 费保存后的轻提示
  const [fbcBatch, setFbcBatch] = useState(null); // 批量维护标准 FBC 费的弹窗数据
  const costEscRef = useRef(false);               // Esc 取消标记(避免 blur 又存一次)
  const [filterStore, setFilterStore] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("amazon");   // 默认亚马逊, 保持现有使用习惯不变
  const [storeOpts, setStoreOpts] = useState(["飞鸟","野趣","俊业","乾霖","屿阔","胤顺"]);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data && data.user) setInvRole(getUserRole(data.user.email || ""));
    });
  }, []);
  // 可编辑: admin + 成都推广 + 成都供应链(陈雪梅) + 成都采购(黄丹) — 2026-09-18 KK 定
  const canEditInv = invRole === "admin" || invRole === "cd_promotion" || invRole === "cd_supplier" || invRole === "cd_procurement" || invRole === "finance";
  // 款式 / SKU / 到仓价 的更改权只给 雪梅(cd_supplier) + 诗琪(cd_promotion) + admin — KK 2026-11-25 定
  // ⚠️ 授权范围只到「平台仓同步库存」(Cdiscount/ManoMano), 亚马逊发货批次生成的记录不在此列
  const canEditNameSku = ["admin", "cd_supplier", "cd_promotion"].includes(invRole);
  // 数据按角色收窄: 黄丹(采购)只看三家 — 2026-09-18 KK 定
  const myStores = (invRole && ROLE_STORES[invRole]) || null;
  // 收窄角色(黄丹)只给亚马逊, Cdiscount/ManoMano 一律不给看 — KK 2026-11-25 定
  const platView = myStores ? "amazon" : filterPlatform;
  // 平台仓同步(非亚马逊): 当前库存为 0 的 SKU 不展示 — KK 2026-11-25 定
  const baseRows = useMemo(
    () => platView === "amazon" ? rows : rows.filter(r => Number(r.stock_qty ?? r.listed_qty ?? 0) > 0),
    [rows, platView]
  );
  const load = () => {
    let q = supabase.from("inventory").select("*").eq("platform", platView).order("ship_date", { ascending: true });
    if (myStores) q = q.in("store", myStores);
    if (filterStore) q = q.eq("store", filterStore);
    q.then(({ data, error }) => {
      if (error) { setErr(error.message); setRows([]); return; }
      setRows(data || []); setErr("");
      // 拉当前平台的 store 去重: 亚马逊合并 KK 写死的 6 家, 其他平台用库里实际出现过的
      let qa = supabase.from("inventory").select("store").eq("platform", platView);
      qa.then(({ data: all }) => {
        const fromDb = [...new Set((all || []).map(r => r.store).filter(Boolean))];
        if (platView !== "amazon") { setStoreOpts(fromDb.sort()); return; }
        setStoreOpts(() => {
          const merged = myStores ? [...new Set([...myStores, ...fromDb.filter(s => myStores.includes(s))])] : [...new Set([...ALL_STORES, ...fromDb])];
          return merged.sort();
        });
      });
    });
  };
  useEffect(() => { if (invRole) load(); }, [invRole]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (invRole) load(); }, [filterStore, filterPlatform]);
  // 筛选: 仓库 / 发货批次 / 款式 / ASIN —— 均为**多选下拉**(同字段内 OR, 跨字段 AND)
  const [fWh, setFWh] = useState([]);
  const [fBatch, setFBatch] = useState([]);
  const [fStyle, setFStyle] = useState([]);
  const [fAsin, setFAsin] = useState([]);
  const [fAge, setFAge] = useState(0);        // 库龄筛选: 0=不限 / 30 / 60 / 90 / 180 天
  const optsOf = (key, sortDesc) => {
    const s = [...new Set(baseRows.map(r => r[key]).filter(v => v !== null && v !== undefined && v !== ""))];
    return sortDesc ? s.sort((a, b) => String(b).localeCompare(String(a))) : s.sort((a, b) => String(a).localeCompare(String(b)));
  };
  const whOpts = useMemo(() => optsOf("ship_warehouse"), [baseRows]);
  const styleOpts = useMemo(() => optsOf("product_name"), [baseRows]);
  // 亚马逊看 asin, 其他平台看卖家 SKU
  const isAmazon = platView === "amazon";
  const skuOf = (r) => isAmazon ? r.asin : (r.sku || r.asin);
  const skuHead = isAmazon ? "ASIN" : "SKU";
  // 平台库存(Cdiscount/ManoMano)专属授权: 只有雪梅/诗琪/admin 能改 款式 / SKU / 到仓价
  const canEditPlat = !isAmazon && canEditNameSku;
  const PLAT_EDIT_KEYS = ["product_name", "asin", "sku", "landed_cost"];
  const asinOpts = useMemo(() => {
    const s = [...new Set(baseRows.map(r => isAmazon ? r.asin : (r.sku || r.asin)).filter(v => v !== null && v !== undefined && v !== ""))];
    return s.sort((a, b) => String(a).localeCompare(String(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRows, platView]);
  // 批次按发货时间倒序, 最近的在上面
  const batchOpts = useMemo(() => {
    const m = {};
    baseRows.forEach(r => { if (r.ship_batch) m[r.ship_batch] = m[r.ship_batch] && m[r.ship_batch] > r.ship_date ? m[r.ship_batch] : (r.ship_date || ""); });
    return Object.keys(m).sort((a, b) => String(m[b]).localeCompare(String(m[a])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRows]);
  const hit = (sel, v) => sel.length === 0 || sel.includes(v);
  const view = useMemo(() => baseRows.filter(r => {
    if (!(hit(fWh, r.ship_warehouse) && hit(fBatch, r.ship_batch) && hit(fStyle, r.product_name) && hit(fAsin, isAmazon ? r.asin : (r.sku || r.asin)))) return false;
    if (fAge > 0) {                                   // 滞销: 还有库存 且 库龄 > N 天
      if (!(Number(r.stock_qty ?? r.listed_qty ?? 0) > 0)) return false;
      const a = ageDays(r);
      if (a === null || a <= fAge) return false;
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [baseRows, fWh, fBatch, fStyle, fAsin, fAge]);
  const hasFilter = !!(fWh.length || fBatch.length || fStyle.length || fAsin.length || fAge > 0);
  // 非亚马逊平台被隐藏的零库存行数 (仅用于提示)
  const zeroHidden = rows.filter(r => !(Number(r.stock_qty ?? r.listed_qty ?? 0) > 0)).length;
  const resetInvFilter = () => { setFWh([]); setFBatch([]); setFStyle([]); setFAsin([]); setFAge(0); };
  // 导出当前筛选结果为 CSV (Excel 可直接打开)
  const exportInvCsv = () => {
    const esc = (v) => {
      const s = (v === null || v === undefined) ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ["店铺", "仓库", "发货批次", "款式", skuHead, "货发日期", "上架日期", "库龄(天)", "在仓天数", "上架天数", "上架数量", "当前库存", "到仓价", "库存金额", "售完时间"];
    const body = view.map(r => [
      r.store, r.ship_warehouse, r.ship_batch, r.product_name, skuOf(r), r.ship_date, r.listed_date,
      ageDays(r), daysBetween(r.ship_date, new Date().toISOString().slice(0, 10)), daysBetween(r.listed_date, new Date().toISOString().slice(0, 10)),
      r.listed_qty, stockOf(r), r.landed_cost,
      (stockOf(r) && r.landed_cost) ? (stockOf(r) * Number(r.landed_cost)).toFixed(2) : "",
      r.sold_date,
    ].map(esc).join(","));
    const csv = "\ufeff" + [head.join(","), ...body].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `库存明细_${fAge > 0 ? "超" + fAge + "天_" : ""}${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
  };
  const openEditInv = (r) => {
    const f = {
      store: r.store || "", ship_date: r.ship_date || "", ship_warehouse: r.ship_warehouse || "",
      ship_batch: r.ship_batch || "", product_name: r.product_name || "", asin: r.asin || "", sku: r.sku || "",
      listed_qty: r.listed_qty != null ? String(r.listed_qty) : "",
      stock_qty: r.stock_qty != null ? String(r.stock_qty) : "",
      landed_cost: r.landed_cost != null ? String(r.landed_cost) : "",
      purchase_date: r.purchase_date || "", listed_date: r.listed_date || "", sold_date: r.sold_date || "",
    };
    setInvForm(f); setEdInv({ id: r.id });
  };
  const saveInv = async () => {
    if (!edInv) return;
    const allowed = new Set(INV_FIELDS.map(f => f.k));
    const clean = {};
    Object.entries(invForm).forEach(([k, v]) => {
      if (!allowed.has(k)) return;                                  // 只写当前弹窗里出现的字段
      if (!isAmazon && !canEditNameSku && PLAT_EDIT_KEYS.includes(k)) return;  // 平台库存: 款式/SKU/到仓价 无权限不落库
      const s = (v || "").trim();
      if (s === "") { clean[k] = null; return; }
      if (["listed_qty", "stock_qty"].includes(k)) { clean[k] = parseInt(s, 10); return; }
      if (["landed_cost"].includes(k)) { clean[k] = Number(s); return; }
      clean[k] = s;
    });
    const { error } = await supabase.from("inventory").update(clean).eq("id", edInv.id);
    if (error) { alert("保存失败: " + error.message); return; }
    setEdInv(null); load();
  };
  // 表格内直改单元格: 到仓价 / 标准FBC费 (回车/失焦保存, Esc 取消) — KK 2026-11-25
  const saveCostCell = async (id, field, raw) => {
    const label = field === "fbc_fee_std" ? "标准 FBC 费用" : "到仓价";
    const s = String(raw ?? "").trim();
    if (s !== "" && !isFinite(Number(s))) { alert(label + "格式不对, 请填数字"); return; }
    const num = s === "" ? null : Number(s);
    const old = rows.find(r => r.id === id);
    const oldNum = old && old[field] != null ? Number(old[field]) : null;
    if (oldNum === num) return;                       // 没改动就不写库
    // RLS 无权限时会返回 200 + 空数组, 必须用 select 校验真的改到
    const { data, error } = await supabase.from("inventory").update({ [field]: num }).eq("id", id).select("id");
    if (error) { alert("保存失败: " + error.message); return; }
    if (!data || !data.length) { alert("保存失败: 数据库未返回该行(权限不足或记录不存在)"); return; }
    setRows(rs => rs.map(r => (r.id === id ? { ...r, [field]: num } : r)));
    if (field === "fbc_fee_std") setFbcTip("已保存 · 订单记录里的预估 FBC 会在下次同步时按新标准重算");
  };
  // 打开标准费维护窗：先查该平台各 SKU 的已售件数（order_records.plat_sku），有订单的排前面并高亮
  const openFbcBatch = async () => {
    let sold = {};
    try {
      const { data } = await supabase.from("order_records")
        .select("plat_sku,qty,refund").eq("platform", platView).limit(5000);
      (data || []).forEach(r => {
        if (String(r.refund || "") === "是" || !r.plat_sku) return;
        sold[r.plat_sku] = (sold[r.plat_sku] || 0) + Number(r.qty || 1);
      });
    } catch (e) { /* 无订单权限或表为空 → 全部按 0 处理 */ }
    const list = baseRows.map(r => ({
      sku: r.sku, name: r.product_name, stock: stockOf(r),
      val: r.fbc_fee_std != null ? String(r.fbc_fee_std) : "",
      sold: sold[r.sku] || 0,
    }));
    list.sort((a, b) => (b.sold - a.sold) || String(a.sku).localeCompare(String(b.sku)));
    setFbcBatch(list);
  };
  // 批量维护标准 FBC 费：一次填完整平台的 SKU，避免一格一格点
  const saveFbcBatch = async () => {
    if (!fbcBatch) return;
    const todo = fbcBatch.filter(x => String(x.val).trim() !== "" && isFinite(Number(x.val)));
    if (!todo.length) { setFbcBatch(null); return; }
    let ok = 0; const fail = [];
    for (const it of todo) {
      const num = Number(it.val);
      const row = rows.find(r => r.sku === it.sku);
      if (row && row.fbc_fee_std != null && Number(row.fbc_fee_std) === num) { ok++; continue; }
      const { data, error } = await supabase.from("inventory").update({ fbc_fee_std: num })
        .eq("platform", platView).eq("sku", it.sku).select("id");
      if (error) { fail.push(it.sku + " " + error.message); continue; }
      if (!data || !data.length) { fail.push(it.sku + " 无权限"); continue; }
      ok++;
    }
    setRows(rs => rs.map(r => {
      const hit = todo.find(x => x.sku === r.sku);
      return hit ? { ...r, fbc_fee_std: Number(hit.val) } : r;
    }));
    setFbcBatch(null);
    setFbcTip(`已保存 ${ok} 个 SKU 的标准 FBC 费${fail.length ? "，失败 " + fail.length + " 个：" + fail.slice(0, 3).join("; ") : ""}`);
  };
  const totalQty = view.reduce((s, r) => s + Number(r.listed_qty || 0), 0);
  const totalStock = view.reduce((s, r) => s + Number(r.stock_qty ?? r.listed_qty ?? 0), 0);
  const totalAmount = view.reduce((s, r) => s + Number(r.stock_qty ?? r.listed_qty ?? 0) * Number(r.landed_cost || 0), 0);
  const daysBetween = (a, b) => {
    if (!a || !b) return null;
    const ms = new Date(b).getTime() - new Date(a).getTime();
    return Math.round(ms / 86400000);
  };
  // 库龄: 有上架日期按「上架 → 今天」, 没有则按「发货 → 今天」(滞销筛选用)
  const ageDays = (r) => {
    const base = r.listed_date || r.ship_date;
    if (!base) return null;
    const d = new Date(base);
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  };
  const stockOf = (r) => Number(r.stock_qty ?? r.listed_qty ?? 0);
  const INV_FIELDS = [
    { k: "ship_date", l: "货发日期", t: "date" }, { k: "ship_warehouse", l: "仓库" },
    { k: "ship_batch", l: "原始批次" }, { k: "product_name", l: "款式" },
    { k: isAmazon ? "asin" : "sku", l: skuHead }, { k: "listed_qty", l: "上架数量", t: "num" },
    { k: "stock_qty", l: "库存数量", t: "num" }, { k: "landed_cost", l: "到仓价", t: "num" },
    { k: "purchase_date", l: "采购时间", t: "date" }, { k: "listed_date", l: "上架时间", t: "date" },
    { k: "sold_date", l: "售完时间", t: "date" },
  ];
  const COLS = [
    { k: "ship_date",      l: "货发日期" },
    { k: "ship_warehouse", l: "仓库" },
    { k: "ship_batch",     l: "原始批次" },
    { k: "product_name",   l: "款式" },
    { k: "asin",           l: skuHead, disp: r => isAmazon ? r.asin : (r.sku || r.asin) },
    { k: "listed_qty",     l: "上架数量", bold: true },
    { k: "stock_qty",      l: "库存数量", bold: true },
    // 非亚马逊平台：FBC 仓库 7 状态明细（可用/占用/锁定/争议/退货/在途/移除），只显示非零项
    ...(isAmazon ? [] : [{
      k: "fbc_detail", l: "FBC明细",
      calc: r => {
        const parts = [
          ["可用", r.qty_available], ["占用", r.qty_allocated], ["锁定", r.qty_blocked],
          ["争议", r.qty_litigation], ["退货", r.qty_return],
          ["在途", r.qty_logistic_operations], ["移除", r.qty_removal],
        ].filter(([, v]) => Number(v) > 0).map(([l, v]) => l + v);
        return parts.length ? parts.join(" · ") : null;
      },
    }]),
    { k: "age_days",       l: "库龄(天)", calc: r => ageDays(r) },
    { k: "landed_cost",    l: "到仓价", fmt: "money" },
    // 非亚马逊平台：标准 FBC 配送费(EUR/件)，运营手填 → 订单按 SKU 自动带入 (KK 2026-11-25)
    ...(isAmazon ? [] : [{ k: "fbc_fee_std", l: "FBC标准费", fmt: "eur" }]),
    { k: "purchase_date",  l: "采购时间" },
    { k: "ship_date_disp", l: "发货时间", disp: r => r.ship_date },
    { k: "prep_days",      l: "准备周期", calc: r => daysBetween(r.purchase_date, r.ship_date) },
    { k: "listed_date",    l: "上架时间" },
    { k: "logistics_days", l: "物流周期", calc: r => daysBetween(r.ship_date, r.listed_date) },
    { k: "sold_date",      l: "售完时间" },
    { k: "sales_days",     l: "销售周期", calc: r => daysBetween(r.listed_date, r.sold_date) },
    { k: "total_days",     l: "全局期次", calc: r => daysBetween(r.ship_date, r.sold_date) },
    { k: "cycle_rate",     l: "全周次率", calc: r => {
        const total = daysBetween(r.ship_date, r.sold_date);
        const sales = daysBetween(r.listed_date, r.sold_date);
        if (!total || total <= 0) return null;
        return Math.round((sales || 0) / total * 100) + "%";
      }
    },
  ];
  const fmt = (col, v, r) => {
    if (col.calc) v = col.calc(r);
    if (col.disp) v = col.disp(r);
    if (v == null || v === "") return "—";
    if (col.fmt === "money" && v != null) return "¥" + Number(v).toFixed(2);
    if (col.fmt === "eur" && v != null) return "€" + Number(v).toFixed(2);
    return v;
  };
  // —— 批次分组显示 (KK 2026-09-16): 每个批次一块底色+描边, 批次级列整批合并 ——
  // 批次级合并只留「原始批次」一列; 仓库/货发日期改为逐行显示 — KK 2026-11-25 定
  const INV_BATCH_KEYS = ["ship_batch"];
  const INV_BATCH_COLS = COLS.filter(c => INV_BATCH_KEYS.includes(c.k));
  const INV_ROW_COLS = COLS.filter(c => !INV_BATCH_KEYS.includes(c.k));
  // 列宽：非亚马逊多一列「FBC明细」
  const W_INV = isAmazon
    ? [100, 100, 100, 130, 130, 90, 90, 95, 100, 100, 100, 90, 100, 90, 100, 90, 90, 90, 70]
    : [100, 100, 100, 130, 130, 90, 90, 180, 95, 100, 100, 100, 100, 90, 100, 90, 100, 90, 90, 90, 70];
  const GRID_INV = (canEditInv ? W_INV : W_INV.slice(0, W_INV.length - 1)).map(w => `${w}px`).join(" ");
  const colIdxInv = (k) => COLS.findIndex(c => c.k === k) + 1;
  const invBatches = useMemo(() => {
    // 非亚马逊平台没有发货批次概念, 整表一块即可 (否则每行一个彩块, 视觉灾难)
    if (platView !== "amazon") {
      return view.length ? [{ key: `__${platView}__`, rows: view, color: C.line }] : [];
    }
    const list = [], map = {};
    let lastBatch = null;
    view.forEach(r => {
      let key;
      if (r.ship_batch) { lastBatch = r.ship_batch; key = r.ship_batch; }
      else key = lastBatch || `__single_${r.id}`;
      if (!map[key]) { map[key] = { key, rows: [] }; list.push(map[key]); }
      map[key].rows.push(r);
    });
    list.forEach((g, i) => { g.color = BATCH_PALETTE[i % BATCH_PALETTE.length]; });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, filterPlatform]);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>库存记录</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            {isAmazon
              ? "发货记录标记「已上架」自动生成 · 按批次分块(每批一块底色+描边, 原始批次整批合并一格, 仓库/货发日期逐行) · 可按 仓库/发货批次/款式/ASIN 筛选"
              : `${PLATFORM_LABEL[platView]} 店铺库存(平台仓同步) · 款式/SKU/到仓价 由雪梅·诗琪维护: 点格子直接改(到仓价回车保存) · 其他字段点行末「✎ 改」`}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: C.faint }}>
            {hasFilter ? "筛选后" : "共"} {view.length} 条 · {isAmazon ? "上架合计" : "库存合计"} {totalQty} 件 · 当前库存 {totalStock}
            {!isAmazon && zeroHidden > 0 && ` · 已隐藏 ${zeroHidden} 个零库存 SKU`}
          </span>
        </div>
      </div>
      {err && <div style={{ background: "#c05b5222", border: "1px solid #c05b52", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#c05b52" }}>
        读取失败(请先建表 inventory): {err}
      </div>}

      {/* 筛选: 店铺 + 仓库/发货批次/款式/ASIN */}
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* 收窄角色(黄丹)只给亚马逊, 平台下拉不显示 — KK 2026-11-25 定 */}
          {!myStores && <>
          <span style={{ fontSize: 12, color: C.sub }}>平台:</span>
          <select value={filterPlatform}
            onChange={e => { setFilterPlatform(e.target.value); setFilterStore(""); resetInvFilter(); }}
            style={{ padding: "5px 10px", background: C.bg, border: `1px solid ${filterPlatform !== "amazon" ? C.brand : C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, fontWeight: filterPlatform !== "amazon" ? 700 : 400 }}>
            {PLATFORMS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          </>}

          <span style={{ fontSize: 12, color: C.sub }}>店铺:</span>
          <select value={filterStore} onChange={e => setFilterStore(e.target.value)}
            style={{ padding: "5px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }}>
            <option value="">全部店铺</option>
            {storeOpts.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <span style={{ fontSize: 12, color: C.sub, marginLeft: 6 }}>仓库:</span>
          <MultiSelect label="仓库" options={whOpts} value={fWh} onChange={setFWh} width={200} />

          <span style={{ fontSize: 12, color: C.sub }}>发货批次:</span>
          <MultiSelect label="批次" options={batchOpts} value={fBatch} onChange={setFBatch} width={260} allText="全部批次" />

          <span style={{ fontSize: 12, color: C.sub }}>款式:</span>
          <MultiSelect label="款式" options={styleOpts} value={fStyle} onChange={setFStyle} width={240} />

          <span style={{ fontSize: 12, color: C.sub }}>{skuHead}:</span>
          <MultiSelect label={skuHead} options={asinOpts} value={fAsin} onChange={setFAsin} width={240} />

          <span style={{ fontSize: 12, color: C.sub }} title="库龄 = 上架日期到今天(无上架日期则从发货日期算); 只统计仍有库存的行">库龄:</span>
          <select value={fAge} onChange={e => setFAge(Number(e.target.value))}
            style={{ padding: "5px 10px", background: C.bg, border: `1px solid ${fAge ? C.drop : C.line}`, borderRadius: 6, color: fAge ? C.ink : C.sub, fontSize: 12 }}>
            <option value={0}>不限</option>
            <option value={30}>库存超 30 天</option>
            <option value={60}>库存超 60 天</option>
            <option value={90}>库存超 90 天</option>
            <option value={180}>库存超 180 天</option>
          </select>

          {hasFilter && (
            <span onClick={resetInvFilter} style={{ fontSize: 12, color: C.brand, cursor: "pointer", fontWeight: 600 }}>重置</span>
          )}

          {!isAmazon && canEditPlat && (
            <button onClick={openFbcBatch}
              title="为每个 SKU 填标准 FBC 配送费(欧元/件) — 订单记录会按此自动带入预估，月底再用实际扣款覆盖"
              style={{ marginLeft: "auto", padding: "6px 14px", background: C.panel2, color: C.brand, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>
              € FBC标准费
            </button>
          )}
          <button onClick={exportInvCsv} title="把当前筛选结果导出成 Excel 可打开的 CSV"
            style={{ marginLeft: (!isAmazon && canEditPlat) ? 0 : "auto", padding: "6px 14px", background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
            ↓ 导出明细 ({view.length})
          </button>
          <span style={{ fontSize: 11, color: C.faint }}>
            {hasFilter ? `筛选出 ${view.length} / ${rows.length} 条` : `共 ${rows.length} 条`}
          </span>
          <span style={{ fontSize: 12, color: C.brand, fontWeight: 700, padding: "3px 12px", borderRadius: 6, background: C.panel2, border: `1px solid ${C.line}` }}>
            库存金额 ¥{totalAmount.toFixed(2)}
          </span>
        </div>
      </div>

      {fbcTip && (
        <div style={{ background: C.panel2, border: `1px solid ${C.brand}`, borderRadius: 8, padding: "8px 14px", marginBottom: 10, fontSize: 12, color: C.brand, display: "flex", alignItems: "center" }}>
          {fbcTip}
          <span onClick={() => setFbcTip("")} style={{ marginLeft: "auto", cursor: "pointer", color: C.sub }}>✕</span>
        </div>
      )}

      {view.length ? (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "auto" }}>
          <div style={{ minWidth: canEditInv ? 1890 : 1810, padding: "0 6px 4px" }}>
            <div style={{ display: "grid", gridTemplateColumns: GRID_INV, background: "#1f3a68", fontSize: 11, color: "#fff", fontWeight: 600, position: "sticky", top: 0, zIndex: 2, margin: "0 -6px" }}>
              {COLS.map(c => (
                <div key={c.k} style={{ padding: "9px 8px", borderRight: `1px solid #2a4a78` }}>
                  {c.l}{INV_BATCH_KEYS.includes(c.k) && <span style={{ fontWeight: 400, color: "#9FE1CB" }}> 批</span>}
                </div>
              ))}
              {canEditInv && <div style={{ padding: "9px 8px" }}>操作</div>}
            </div>
            {invBatches.map(g => {
              const N = g.rows.length;
              return (
                <div key={g.key} style={{
                  display: "grid", gridTemplateColumns: GRID_INV,
                  gridTemplateRows: `repeat(${N}, minmax(34px, auto))`,
                  margin: "0 0 6px 0",
                  background: `${g.color}22`, border: `1px solid ${g.color}`, borderLeft: `4px solid ${g.color}`, borderRadius: 4,
                  fontSize: 11,
                }}>
                  {/* 批次级列: 发货日期 / 仓库 / 发货批次 (整批合并显示一个值) */}
                  {INV_BATCH_COLS.map(c => {
                    const hit = g.rows.find(r => r[c.k] !== null && r[c.k] !== undefined && r[c.k] !== "");
                    return (
                      <div key={c.k} style={{
                        gridColumn: colIdxInv(c.k), gridRow: `span ${N}`, display: "flex", alignItems: "center",
                        padding: "8px", borderRight: `1px solid ${C.line}`, color: C.ink, fontWeight: 600,
                        overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                      }}>
                        {hit ? String(hit[c.k]) : "—"}
                      </div>
                    );
                  })}
                  {/* 逐行列 */}
                  {g.rows.map((r, ri) => {
                    const cell = (k) => ({
                      gridColumn: colIdxInv(k), gridRow: ri + 1, padding: "8px",
                      borderRight: `1px solid ${C.line}`, borderTop: ri ? `1px solid ${C.line}` : "none",
                      color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    });
                    return (<div key={r.id} style={{ display: "contents" }}>
                    {INV_ROW_COLS.map(c => {
                      const v = fmt(c, r[c.k], r);
                      const isAge = c.k === "age_days";
                      const ageN = isAge ? Number(v) : null;
                      const isCost = c.k === "landed_cost";
                      const isFbc  = c.k === "fbc_fee_std";
                      const editingCost = (isCost || isFbc) && !!edCost && edCost.id === r.id && edCost.field === c.k;
                      // 平台库存(非亚马逊)专属: 款式 / SKU 格子可直接点开改 — 仅雪梅/诗琪/admin
                      const clickEdit = canEditPlat && (c.k === "product_name" || c.k === "asin");
                      // 到仓价 / 标准FBC费: 点格子直接填 — 同样只在平台库存里开放给 雪梅/诗琪/admin
                      const clickCost = (isCost || isFbc) && canEditPlat && !editingCost;
                      const canClick = clickEdit || clickCost;
                      const tip = clickEdit ? "点击修改款式 / SKU"
                        : isCost && clickCost ? "到仓价 = 成本价(人民币)，点格子直接改 (回车保存 / Esc 取消)"
                        : isFbc && clickCost ? "标准 FBC 配送费(欧元/件) — 订单按 SKU 自动带入，点格子直接改 (回车保存 / Esc 取消)"
                        : undefined;
                      return (
                        <div key={r.id + c.k}
                          onClick={clickEdit ? () => openEditInv(r)
                            : clickCost ? () => setEdCost({ id: r.id, field: c.k, val: r[c.k] != null ? String(r[c.k]) : "" })
                            : undefined}
                          title={tip}
                          style={{
                          ...cell(c.k), fontWeight: (c.bold || isAge) ? 600 : 400,
                          color: isAge ? (ageN > 90 ? "#e0857a" : ageN > 60 ? C.watch : C.ink) : (isFbc && v !== "—" ? C.brand : C.ink),
                          cursor: canClick ? "pointer" : "default",
                          textDecoration: clickEdit ? "underline dotted rgba(77,182,164,.55)" : "none",
                        }}>
                          {editingCost ? (
                            <input autoFocus type="number" step="0.01" value={edCost.val}
                              onClick={e => e.stopPropagation()}
                              onChange={e => { const val = e.target.value; setEdCost(s => ({ ...s, val })); }}
                              onBlur={() => {
                                if (costEscRef.current) { costEscRef.current = false; return; }
                                const t = edCost; setEdCost(null); saveCostCell(t.id, t.field, t.val);
                              }}
                              onKeyDown={e => {
                                if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
                                if (e.key === "Escape") { costEscRef.current = true; setEdCost(null); }
                              }}
                              style={{ width: "100%", padding: "1px 4px", background: C.bg, border: `1px solid ${C.brand}`, borderRadius: 4, color: C.ink, fontSize: 11, outline: "none" }} />
                          ) : (<>
                            {v}
                            {clickCost && <span style={{ color: C.brand, fontWeight: 600, marginLeft: 3, opacity: .8 }}>✎</span>}
                          </>)}
                        </div>
                      );
                    })}
                    {/* 平台表: 每行一个 ✎, 不用滚到最右找批次按钮 */}
                    {canEditInv && !isAmazon && (
                      <div key={r.id + "__op"} style={{ gridColumn: COLS.length + 1, gridRow: ri + 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "8px", borderTop: ri ? `1px solid ${C.line}` : "none" }}>
                        <span onClick={() => openEditInv(r)} title="修改该行"
                          style={{ color: C.brand, cursor: "pointer", fontWeight: 600, fontSize: 12 }}>✎ 改</span>
                      </div>
                    )}
                    </div>);
                  })}
                  {/* 亚马逊: 操作列整批一个, 点 ✎ 改该批次第一行的记录 */}
                  {canEditInv && isAmazon && (
                    <div style={{ gridColumn: COLS.length + 1, gridRow: `span ${N}`, display: "flex", alignItems: "center", justifyContent: "center", padding: "8px" }}>
                      <span onClick={() => openEditInv(g.rows[0])} title="编辑该批次记录"
                        style={{ color: C.brand, cursor: "pointer", fontWeight: 600, fontSize: 11 }}>✎</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ background: C.panel, border: `1px dashed ${C.line}`, borderRadius: 12, padding: 50, textAlign: "center", color: C.faint, fontSize: 13 }}>
          {rows.length
            ? (baseRows.length ? "没有符合筛选条件的记录 · 点「重置」看全部"
                               : `${PLATFORM_LABEL[platView]} 当前库存全为 0（${rows.length} 个 SKU 已隐藏），等平台同步补货后再看`)
            : isAmazon ? "暂无库存 · 去「发货记录」里点某条发货的「↑上架」自动生成库存记录"
            : `${PLATFORM_LABEL[platView]} 暂无库存数据 · 等平台同步写入后自动出现`}
        </div>
      )}

      {/* 批量维护标准 FBC 配送费 — 每 SKU 一个欧元标准值 */}
      {fbcBatch && (
        <div onClick={() => setFbcBatch(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20, width: 620, maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>标准 FBC 配送费</div>
              <div style={{ fontSize: 11, color: C.sub }}>欧元 / 件 · {PLATFORM_LABEL[platView]} · 共 {fbcBatch.length} 个 SKU</div>
            </div>
            <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.7, marginBottom: 12 }}>
              填每个 SKU 在平台仓发货的<b>标准运费</b>。有订单的排在前面并标绿（已售列），先填这些即可让订单毛利立刻有数；
              订单记录按 SKU 自动带这个数算毛利（标记为预估），月底运营回传平台实际扣款后，再用实际值覆盖。
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: C.sub }}>一键填全部:</span>
              <input id="fbcAll" type="number" step="0.01" placeholder="€"
                style={{ width: 90, padding: "5px 8px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, outline: "none" }} />
              <button onClick={() => {
                  const el = document.getElementById("fbcAll");
                  const v = el && el.value;
                  if (v === "" || v == null || !isFinite(Number(v))) return;
                  setFbcBatch(list => list.map(x => ({ ...x, val: String(v) })));
                  el.value = "";
                }}
                style={{ padding: "5px 12px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>应用到全部</button>
              <span style={{ fontSize: 11, color: C.faint }}>（填完再个别改）</span>
            </div>

            <div style={{ flex: 1, overflow: "auto", border: `1px solid ${C.line}`, borderRadius: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 64px 64px 100px", background: "#1f3a68", fontSize: 11, color: "#fff", fontWeight: 600, position: "sticky", top: 0 }}>
                <div style={{ padding: "8px" }}>SKU</div>
                <div style={{ padding: "8px" }}>款式</div>
                <div style={{ padding: "8px", textAlign: "right" }}>在库</div>
                <div style={{ padding: "8px", textAlign: "right" }}>已售件</div>
                <div style={{ padding: "8px" }}>标准费 €</div>
              </div>
              {fbcBatch.map((it, i) => (
                <div key={it.sku} style={{ display: "grid", gridTemplateColumns: "150px 1fr 64px 64px 100px", fontSize: 11, borderTop: i ? `1px solid ${C.line}` : "none", background: it.sold > 0 ? "rgba(77,182,164,.07)" : (i % 2 ? C.bg : "transparent") }}>
                  <div style={{ padding: "6px 8px", color: it.sold > 0 ? C.brand : C.ink, fontFamily: "monospace", fontWeight: it.sold > 0 ? 600 : 400 }}>{it.sku}</div>
                  <div style={{ padding: "6px 8px", color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.name}>{it.name || "—"}</div>
                  <div style={{ padding: "6px 8px", textAlign: "right", color: C.ink }}>{it.stock}</div>
                  <div style={{ padding: "6px 8px", textAlign: "right", color: it.sold > 0 ? C.brand : C.faint, fontWeight: it.sold > 0 ? 600 : 400 }}>{it.sold || "—"}</div>
                  <div style={{ padding: "4px 8px" }}>
                    <input type="number" step="0.01" value={it.val}
                      onChange={e => { const val = e.target.value; setFbcBatch(list => list.map(x => x.sku === it.sku ? { ...x, val } : x)); }}
                      style={{ width: "100%", padding: "3px 6px", background: C.panel2, border: `1px solid ${it.val !== "" ? C.brand : C.line}`, borderRadius: 4, color: C.ink, fontSize: 11, outline: "none" }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <div style={{ fontSize: 11, color: C.faint, alignSelf: "center" }}>
                已填 {fbcBatch.filter(x => String(x.val).trim() !== "").length} / {fbcBatch.length}
                {fbcBatch.some(x => x.sold > 0) && (
                  <span style={{ color: C.brand, marginLeft: 8 }}>
                    · 有订单的已填 {fbcBatch.filter(x => x.sold > 0 && String(x.val).trim() !== "").length} / {fbcBatch.filter(x => x.sold > 0).length}
                  </span>
                )}
              </div>
              <button onClick={() => setFbcBatch(null)}
                style={{ marginLeft: "auto", padding: "7px 18px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.sub, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>取消</button>
              <button onClick={saveFbcBatch}
                style={{ padding: "7px 20px", background: C.brand, border: "none", borderRadius: 6, color: "#0b1116", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑库存弹窗 */}
      {edInv && (
        <div onClick={() => setEdInv(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, width: 560, maxHeight: "85vh", overflow: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>编辑库存记录</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {INV_FIELDS.map(f => {
                const locked = !isAmazon && !canEditNameSku && PLAT_EDIT_KEYS.includes(f.k);
                return (
                <div key={f.k}>
                  <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>
                    {f.l}{locked && <span style={{ color: C.faint }}>（仅雪梅/诗琪可改）</span>}
                  </div>
                  <input type={f.t === "date" ? "date" : f.t === "num" ? "number" : "text"} value={invForm[f.k] || ""}
                    readOnly={locked} disabled={locked}
                    onChange={(e) => setInvForm(s => ({ ...s, [f.k]: e.target.value }))}
                    style={{ width: "100%", padding: "7px 9px", background: locked ? C.bg : C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: locked ? C.faint : C.ink, fontSize: 12, outline: "none", cursor: locked ? "not-allowed" : "text" }} />
                </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 10 }}>
              到仓价 / 采购时间 / 售完时间 / 库存数量 可手填（表格里点到仓价格子也能直接改）；以后接订单后售完时间按批次自动更新
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => setEdInv(null)}
                style={{ flex: 1, padding: "9px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>取消</button>
              <button onClick={saveInv}
                style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>保存修改</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- 类目货架 (简版概览, 只读, 无展开产品) ----------------
function CatDash({ setProjectFor }) {
  const [openB, setOpenB] = useState({});
  const [openG, setOpenG] = useState({});
  const [openC, setOpenC] = useState({});
  

  // 大类/二级 cat 默认全部折叠 (重置历史 state)
  useEffect(() => { setOpenC({}); setOpenG({}); setOpenL({}); }, []);
  const [handoffMap, setHandoffMap] = useState({});
  const [shReady, setShReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await fetchShelfData();
        const { data } = await supabase.from("monitor_handoff").select("leaf_id, box_key");
        const m = {};
        (data || []).forEach(r => { m[r.leaf_id] = r.box_key; });
        setHandoffMap(m);
      } catch (e) { console.error("CatDash load err:", e); }
      setShReady(true);  // 无论成败都解锁, 不卡"加载中"
    })();
  }, []);

  if (!shReady && Object.keys(BRAND_SHELF).length === 0) return <div style={{ color: C.faint, padding: 40 }}>加载中…</div>;
  if (Object.keys(BRAND_SHELF).length === 0) return <div style={{ color: C.faint, padding: 40 }}>暂无货架数据, 检查 fetchShelfData</div>;

  // 递归算 cat (含子 cat) 的 chip 统计 (在售/在调研/已调研不做)
  const tallyCatDeep = (c) => {
    let sell = 0, idleP = 0, skip = 0;
    const collect = (catId) => {
      const d = CAT_DETAIL[catId];
      if (d && d.leaves) d.leaves.forEach(lf => {
        if (lf.st === "researched_skip") skip++;
        else if (lf.products && lf.products.some(p => p.st === "selling")) sell++;
        else if (lf.st === "idle" && (!lf.products || !lf.products.length)) idleP++;
      });
    };
    const walk = (cat) => {
      collect(cat.id);
      if (cat.children) cat.children.forEach(s => walk(s));
    };
    walk(c);
    return { sell, idleP, skip };
  };

  // 新模型递归统计: cat + 子 cat + 产品 (基于 cat_id, KK 2026-08-10)

  const PhaseTag = ({ lid }) => {
    const b = handoffMap[lid];
    if (!b) return null;
    const hc = HANDOFF_BOXES.find(x => x.id === b);
    if (!hc) return null;
    return <span style={{ fontSize: 10, color: hc.color, fontWeight: 600, marginLeft: 6 }}>· {hc.label}</span>;
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>类目货架</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            品牌 → 大类 → 类目 → 末端 · 实时状态 · 只读概览
          </div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>
          数据取自 Supabase · 实时
        </div>
      </div>

      {Object.entries(BRAND_SHELF).map(([b, info]) => {
        const bOpen = !!openB[b];
        return (
          <div key={b} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
            <div onClick={() => setOpenB(s => ({ ...s, [b]: !s[b] }))}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", cursor: "pointer", background: C.bg }}>
              <Caret open={bOpen} />
              <span style={{ width: 8, height: 8, borderRadius: 4, background: info.fullName ? SHELF_ST.idle.color : C.faint, display: "inline-block" }} />
              <span style={{ fontSize: 15, fontWeight: 700 }}>{info.fullName || b}</span>
              <span style={{ fontSize: 11, color: C.faint }}>{info.store}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: C.sub }}>
                {info.groups.length} 大类 · {info.groups.reduce((s, g) => s + (g.cats ? g.cats.length : 0), 0)} 类目
              </span>
            </div>
            {bOpen && info.groups.map((g, gi) => {
              const gkey = `${b}|${gi}`;
              const gOpen = !!openG[gkey];
              const allRootCats = sortCatsBySt((g.cats || []).filter(c => !c.children || c.children.length === 0));
              const nestedCats = sortCatsBySt((g.cats || []).filter(c => c.children && c.children.length > 0));
              const gTally = (g.cats || []).reduce((s, c) => {
                const t = tallyCatDeepV2(c);
                return { sell: s.sell + t.sell, idle: s.idle + t.idle };
              }, { sell: 0, idle: 0 });
              return (
                <div key={gkey} style={{ borderTop: `1px solid ${C.line}` }}>
                  <div onClick={() => { setOpenG(s => ({ ...s, [gkey]: !s[gkey] })); setOpenC(s => { const ns = {...s}; Object.keys(ns).forEach(k => { if (k.startsWith(gkey + "|")) delete ns[k]; }); return ns; }); }}
                    style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 16px 11px 34px", cursor: "pointer" }}>
                    <Caret open={gOpen} small />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</span>
                    <span style={{ marginLeft: "auto", display: "inline-flex", gap: 10, fontSize: 11 }}>
                      <span style={{ color: "#4db6a4", fontWeight: 600 }}>在售 {gTally.sell}</span>
                      <span style={{ color: C.sub }}>在调研 {gTally.idleP}</span>
                      <span style={{ color: C.faint }}>已调研不做 {gTally.skip}</span>
                    </span>
                  </div>
                  {gOpen && (
                    <div style={{ background: C.bg, borderTop: `1px solid ${C.line}`, padding: "10px 16px 14px 50px" }}>
                      {allRootCats.map((c, ci) => {
                        const ckey = `${gkey}|root${c.id}`;
                        const cOpen = !!openC[ckey];
                        const t = tallyCatDeep(c);
                        return (
                          <div key={ci} style={{ marginBottom: 6 }}>
                            <div onClick={() => setOpenC(s => {
                              const willOpen = !s[ckey];
                              const ns = { ...s };
                              Object.keys(ns).forEach(k => { if (k.startsWith(gkey + "|")) delete ns[k]; });
                              if (willOpen) ns[ckey] = true;
                              return ns;
                            })} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.ink }}>
                              <Caret open={cOpen} small />
                              <span style={{ fontWeight: 600 }}>{c.name}</span>
                              <span style={{ marginLeft: "auto", display: "inline-flex", gap: 10, fontSize: 11, alignItems: "center" }}>
                                <span style={{ color: "#4db6a4", fontWeight: 600 }}>在售 {t.sell}</span>
                                <span style={{ color: C.sub }}>在调研 {t.idleP}</span>
                                <span style={{ color: C.faint }}>已调研不做 {t.skip}</span>
                                <span onClick={(e) => { e.stopPropagation(); setProjectFor({ name: c.name, path: c.name, chatName: null }); }}
                                  style={{ color: C.brand, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                  · 进入分析 →
                                </span>
                              </span>
                            </div>
                            {cOpen && c.children && c.children.length > 0 && (
                              <div style={{ marginLeft: 28, marginTop: 4 }}>
                                {sortCatsBySt(c.children).map((sub, si) => {
                                  const st = tallyCatDeep(sub);
                                  return (
                                    <div key={si} style={{ fontSize: 11, color: C.sub, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                                      <span>· {sub.name}</span>
                                      <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, fontSize: 11, alignItems: "center" }}>
                                        <span style={{ color: "#4db6a4", fontWeight: 600 }}>在售 {st.sell}</span>
                                        <span style={{ color: C.sub }}>在调研 {st.idleP}</span>
                                        <span style={{ color: C.faint }}>已调研不做 {st.skip}</span>
                                        <span onClick={(e) => { e.stopPropagation(); setProjectFor({ name: sub.name, path: sub.name, chatName: null }); }}
                                          style={{ color: C.brand, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                          · 进入分析 →
                                        </span>
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {nestedCats.map((c, ci) => {
                        const ckey = `${gkey}|nest${c.id}`;
                        const cOpen = !!openC[ckey];
                        const t = tallyCatDeep(c);
                        return (
                          <div key={ci} style={{ marginBottom: 4 }}>
                            <div onClick={() => setOpenC(s => {
                              const willOpen = !s[ckey];
                              const ns = { ...s };
                              Object.keys(ns).forEach(k => { if (k.startsWith(gkey + "|")) delete ns[k]; });
                              if (willOpen) ns[ckey] = true;
                              return ns;
                            })} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.ink }}>
                              <Caret open={cOpen} small />
                              <span style={{ fontWeight: 600, marginLeft: 4 }}>{c.name}</span>
                              <span style={{ marginLeft: "auto", display: "inline-flex", gap: 10, fontSize: 11, alignItems: "center" }}>
                                <span style={{ color: "#4db6a4", fontWeight: 600 }}>在售 {t.sell}</span>
                                <span style={{ color: C.sub }}>在调研 {t.idleP}</span>
                                <span style={{ color: C.faint }}>已调研不做 {t.skip}</span>
                                <span onClick={(e) => { e.stopPropagation(); setProjectFor({ name: c.name, path: c.name, chatName: null }); }}
                                  style={{ color: C.brand, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                  · 进入分析 →
                                </span>
                              </span>
                            </div>
                            {cOpen && (
                              <div style={{ marginLeft: 32, marginTop: 4 }}>
                                {(c.children || []).map((sub, si) => {
                                  const st = tallyCatDeep(sub);
                                  return (
                                    <div key={si} style={{ fontSize: 11, color: C.sub, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                                      <span>· {sub.name}</span>
                                      <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, fontSize: 11, alignItems: "center" }}>
                                        <span style={{ color: "#4db6a4", fontWeight: 600 }}>在售 {st.sell}</span>
                                        <span style={{ color: C.sub }}>在调研 {st.idleP}</span>
                                        <span style={{ color: C.faint }}>已调研不做 {st.skip}</span>
                                        <span onClick={(e) => { e.stopPropagation(); setProjectFor({ name: sub.name, path: sub.name, chatName: null }); }}
                                          style={{ color: C.brand, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                          · 进入分析 →
                                        </span>
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---------------- 链接评分 ----------------
// 界面 v1 (2026-08-07 设计): 在售 ASIN 按品牌统计 → ASIN 卡片(评论数+星级) → 点开看全部评论
// 评论数据当前为演示 (mock), 后续接亚马逊评论 API 每日同步 (review_count/avg_rating/reviews明细)
// 未来: AI 评论分析区
function LinkScore() {
  // 数据: 在售 ASIN (products.st=selling 且有 asin) + 品牌关联
  const [items, setItems] = useState([]);   // { asin, name, brand, reviewCount, avgRating, stars, comments: [] }
  const [brandFilter, setBrandFilter] = useState("全部");
  const [asinKw, setAsinKw] = useState("");
  const [starFilter, setStarFilter] = useState("");
  const [selAsin, setSelAsin] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: prods }, { data: leaves }, { data: cats }, { data: groups }, { data: brands }] = await Promise.all([
        supabase.from("products").select("id, name, asin, st, leaf_id"),
        supabase.from("shelf_leaves").select("id, cat_id, leaf_name"),
        supabase.from("shelf_cats").select("id, group_id, name"),
        supabase.from("shelf_groups").select("id, brand_code, name"),
        supabase.from("brands").select("code, full_name"),
      ]);
      // 构建 leaf → brand 映射
      const catOf = {}; (cats || []).forEach(c => { catOf[c.id] = c; });
      const groupOf = {}; (groups || []).forEach(g => { groupOf[g.id] = g; });
      const brandName = {}; (brands || []).forEach(b => { brandName[b.code] = b.full_name || b.code; });
      const brandOfLeaf = {};
      (leaves || []).forEach(l => {
        const cat = catOf[l.cat_id];
        const grp = cat ? groupOf[cat.group_id] : null;
        brandOfLeaf[l.id] = grp ? (brandName[grp.brand_code] || grp.brand_code) : "未归属";
      });
      // 在售 ASIN
      const list = (prods || [])
        .filter(p => p.st === "selling" && p.asin)
        .map(p => ({ asin: p.asin, name: p.name, brand: brandOfLeaf[p.leaf_id] || "未归属" }));
      // 评论数据: 演示 mock (待接亚马逊评论 API)
      const MOCK_REVIEWS = [
        { title: "非常好用, 强烈推荐", rating: 5, date: "2026-08-02", user: "Jean M.", content: "产品质量超出预期, 做工扎实, 用起来很顺手。已经推荐给朋友了。", images: 2, video: false },
        { title: "不错, 但有一点小瑕疵", rating: 4, date: "2026-07-28", user: "Sophie L.", content: "整体满意, 就是包装稍微有点简陋, 其他都很好。", images: 0, video: false },
        { title: "运输有点慢, 产品还行", rating: 3, date: "2026-07-19", user: "Marc D.", content: "等了挺久才收到, 产品本身还行, 性价比可以。", images: 1, video: false },
        { title: "视频开箱测评", rating: 5, date: "2026-07-10", user: "Camille R.", content: "录了个开箱视频, 整体体验很好, 大家可以看看视频再决定。", images: 0, video: true },
        { title: "不太满意, 有点失望", rating: 2, date: "2026-06-30", user: "Pierre T.", content: "用了两周出现了一点问题, 售后处理也比较慢。", images: 0, video: false },
      ];
      // 每个 ASIN 随机生成演示评论 (同一批)
      const withReviews = list.map((it, i) => {
        const count = [3, 5, 8, 12, 24, 40][i % 6];
        const avg = [4.2, 4.6, 3.8, 4.9, 4.1, 3.5][i % 6];
        return { ...it, reviewCount: count, avgRating: avg, comments: MOCK_REVIEWS.slice(0, (i % 3) + 2) };
      });
      setItems(withReviews);
      setLoaded(true);
      if (withReviews.length) setSelAsin(withReviews[0].asin);
    })();
  }, []);

  // 品牌统计
  const brandCounts = useMemo(() => {
    const m = {};
    items.forEach(it => { m[it.brand] = (m[it.brand] || 0) + 1; });
    return m;
  }, [items]);

  // 筛选后的列表
  const filtered = useMemo(() => {
    let l = items;
    if (brandFilter !== "全部") l = l.filter(it => it.brand === brandFilter);
    if (asinKw.trim()) l = l.filter(it => it.asin.toUpperCase().includes(asinKw.trim().toUpperCase()));
    if (starFilter) l = l.filter(it => Math.round(it.avgRating) === Number(starFilter));
    return [...l].sort((a, b) => b.reviewCount - a.reviewCount);
  }, [items, brandFilter, asinKw, starFilter]);

  const sel = items.find(it => it.asin === selAsin) || filtered[0];
  const stars = (n) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

  // 最近 7 天差评 (演示数据, 待接亚马逊评论 API)
  const RECENT_BAD = [
    { asin: "B0GLWV84HC", brand: "kila", date: "2026-08-05", rating: 1, user: "Marc D.", title: "完全不能用, 浪费钱", content: "买了一个月就坏了, 客服也不理人, 非常失望。", images: 2, video: false },
    { asin: "B0RXOWN01", brand: "woof", date: "2026-08-04", rating: 2, user: "Sophie L.", title: "差评, 不建议买", content: "和图片差异很大, 做工粗糙, 用起来体验差。", images: 1, video: false },
    { asin: "B0MLUUFD", brand: "Vercoryx", date: "2026-08-02", rating: 1, user: "Pierre T.", title: "运输损坏 + 质量差", content: "包装完全没保护, 到手外壳碎了, 退货也麻烦。", images: 3, video: true },
  ];

  return (
    <div>
      {/* 顶部 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>链接评分</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            在售 ASIN 评论监控 · 评论数据每日同步亚马逊 API (当前演示数据) · 未来 AI 分析
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: C.faint }}>数据更新于</span>
          <span style={{ fontSize: 12, color: C.faint, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: C.panel, border: `1px solid ${C.line}` }}>待接 API</span>
        </div>
      </div>

      {/* 评论预警: 最近 7 天差评集中 */}
      <div style={{ background: "#c05b5222", border: "1px solid #c05b52", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14 }}>🔴</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#c05b52" }}>评论预警 · 最近 7 天差评 ({RECENT_BAD.length} 条)</span>
          <span style={{ fontSize: 10, color: C.faint, marginLeft: "auto" }}>演示数据 · 待接亚马逊评论 API</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
          {RECENT_BAD.map((r, i) => (
            <div key={i} style={{ background: C.panel, border: "1px solid #c05b5244", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#0d1216", background: C.brand, borderRadius: 4, padding: "2px 6px", fontWeight: 700 }}>{r.brand}</span>
                <span style={{ fontSize: 11, fontFamily: "monospace", color: C.ink, fontWeight: 600 }}>{r.asin}</span>
                <span style={{ fontSize: 12, color: "#d9756f", letterSpacing: 1, marginLeft: "auto" }}>{"★".repeat(r.rating) + "☆".repeat(5 - r.rating)}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{r.title}</div>
              <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5, marginBottom: 8 }}>{r.content}</div>
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                {r.images > 0 && Array.from({ length: r.images }).map((_, j) => (
                  <div key={j} style={{ width: 28, height: 28, borderRadius: 4, background: C.bg, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>🖼</div>
                ))}
                {r.video && <div style={{ width: 56, height: 28, borderRadius: 4, background: "#1f3a68", border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>▶ 视频</div>}
              </div>
              <div style={{ fontSize: 10, color: C.faint }}>{r.date} · {r.user}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 品牌 chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {["全部", ...Object.keys(brandCounts).sort()].map(b => (
          <div key={b} onClick={() => setBrandFilter(b)}
            style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", background: brandFilter === b ? C.brand : C.panel, color: brandFilter === b ? "#0d1216" : C.ink, border: `1px solid ${brandFilter === b ? C.brand : C.line}`, fontWeight: 600 }}>
            {b} {b !== "全部" && <span style={{ opacity: .7 }}>{brandCounts[b]}</span>}
          </div>
        ))}
      </div>

      {/* 筛选行 */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <input value={asinKw} onChange={e => setAsinKw(e.target.value)} placeholder="ASIN 搜索"
          style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, width: 180 }} />
        <select value={starFilter} onChange={e => setStarFilter(e.target.value)}
          style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }}>
          <option value="">全部星级</option>
          {[5, 4, 3, 2, 1].map(s => <option key={s} value={s}>{s} 星</option>)}
        </select>
        <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>{filtered.length} 个在售 ASIN</span>
      </div>

      {/* 主体: 左 ASIN 列表 + 右评论详情 */}
      <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 14, alignItems: "start" }}>
        {/* 左: ASIN 列表 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "72vh", overflow: "auto", paddingRight: 4 }}>
          {filtered.length ? filtered.map(it => (
            <div key={it.asin} onClick={() => setSelAsin(it.asin)}
              style={{ background: selAsin === it.asin ? `${C.brand}18` : C.panel, border: `1px solid ${selAsin === it.asin ? C.brand : C.line}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: "#0d1216", background: C.brand, borderRadius: 4, padding: "2px 6px", fontWeight: 700 }}>{it.brand}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: "monospace" }}>{it.asin}</span>
                <span style={{ fontSize: 11, color: C.sub, marginLeft: "auto" }}>{it.name}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                <span style={{ fontSize: 13, color: "#d9a441", letterSpacing: 1 }}>{stars(it.avgRating)}</span>
                <span style={{ fontSize: 11, color: C.ink, fontWeight: 600 }}>{it.avgRating.toFixed(1)}</span>
                <span style={{ fontSize: 11, color: C.faint, marginLeft: "auto" }}>{it.reviewCount} 条评论</span>
              </div>
            </div>
          )) : (
            <div style={{ padding: 30, textAlign: "center", color: C.faint, fontSize: 12, border: `1px dashed ${C.line}`, borderRadius: 8 }}>没有匹配的在售 ASIN</div>
          )}
        </div>

        {/* 右: 评论详情 */}
        {sel && (
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "18px 20px" }}>
            {/* 概览 */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, paddingBottom: 14, borderBottom: `1px solid ${C.line}` }}>
              <div style={{ textAlign: "center", minWidth: 70 }}>
                <div style={{ fontSize: 34, fontWeight: 800, color: C.ink }}>{sel.avgRating.toFixed(1)}</div>
                <div style={{ fontSize: 12, color: "#d9a441", letterSpacing: 1 }}>{stars(sel.avgRating)}</div>
                <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{sel.reviewCount} 条</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: "monospace" }}>{sel.asin}</div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{sel.brand} · {sel.name}</div>
                {/* 星级分布 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 10 }}>
                  {[5, 4, 3, 2, 1].map(s => {
                    const pct = s === 5 ? 70 : s === 4 ? 18 : s === 3 ? 7 : s === 2 ? 3 : 2;
                    return (
                      <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: C.sub }}>
                        <span style={{ width: 20 }}>{s}★</span>
                        <div style={{ flex: 1, height: 6, background: C.bg, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: pct + "%", height: "100%", background: "#d9a441" }} />
                        </div>
                        <span style={{ width: 30, textAlign: "right", color: C.faint }}>{Math.round(sel.reviewCount * pct / 100)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <span style={{ fontSize: 10, color: C.faint, alignSelf: "flex-start" }}>演示数据 · 待接 API</span>
            </div>

            {/* 评论列表 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14, maxHeight: "52vh", overflow: "auto" }}>
              {sel.comments.map((c, i) => (
                <div key={i} style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 12, background: C.brand, color: "#0d1216", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {c.user[0]}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{c.user}</span>
                    <span style={{ fontSize: 11, color: "#d9a441" }}>{stars(c.rating)}</span>
                    <span style={{ fontSize: 10, color: C.faint, marginLeft: "auto" }}>{c.date}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>{c.content}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    {c.images > 0 && Array.from({ length: c.images }).map((_, j) => (
                      <div key={j} style={{ width: 48, height: 48, borderRadius: 6, background: C.panel2, border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🖼</div>
                    ))}
                    {c.video && (
                      <div style={{ width: 84, height: 48, borderRadius: 6, background: "#1f3a68", border: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff" }}>▶ 视频</div>
                    )}
                  </div>
                </div>
              ))}
              {!sel.comments.length && (
                <div style={{ padding: 24, textAlign: "center", color: C.faint, fontSize: 12 }}>暂无评论</div>
              )}
            </div>

            {/* AI 分析占位 */}
            <div style={{ marginTop: 14, background: `${C.brand}0d`, border: `1px dashed ${C.brand}`, borderRadius: 10, padding: "12px 14px", fontSize: 12, color: C.sub }}>
              🤖 <b style={{ color: C.ink }}>AI 评论分析</b> · 待接入 — 未来自动总结: 好评点 / 差评原因 / 改进建议 / 竞品对比
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- 海外仓售后库存 (可录入台账) ----------------
// Tab: KK 2026-09-21 新增; 三区块版面: KK 2026-09-23 定, 顺序固定
// 2026-10-14 KK 定: 开放编辑权 = 陈雪梅(cd_supplier) + admin(KK) + fr(龙泺伊); 其余角色只读
// 2026-10-14 KK 给字段, 并明确 **三个区块用同一套要素**:
//   日期 / 移除订单编号 / 产品名称 / ASIN / 移除数量 / 已收到数量 / 发货追踪编码
//   (ASIN 一列为 KK 2026-10-14 17:2x 追加, 位置在「产品名称」之后, 三区块同样)
// 表: after_stock (sql/create_after_stock.sql), 三区块共用一张表, 用 kind 区分
// 每个区块自带列定义 (cols), cols=null 表示字段未定 → 用 AS_FALLBACK_COLS
const AS_FALLBACK_COLS = [
  { k: "rec_date", l: "日期", w: 150, t: "date" },
  { k: "store",    l: "店铺", w: 120, t: "sel" },
  { k: "sku",      l: "SKU",  w: 150 },
  { k: "product",  l: "品名", w: "minmax(180px,1fr)" },
  { k: "qty",      l: "数量", w: 100, t: "num" },
  { k: "note",     l: "备注", w: "minmax(160px,1fr)" },
];
// 三区块共用同一套列 (KK 2026-10-14 16:52 定)
const AS_MAIN_COLS = [
  { k: "rec_date",        l: "日期",         w: 150, t: "date" },
  { k: "remove_order_no", l: "移除订单编号", w: 190 },
  { k: "product",         l: "产品名称",     w: "minmax(200px,1fr)" },
  { k: "asin",            l: "ASIN",         w: 130 },
  { k: "remove_qty",      l: "移除数量",     w: 110, t: "num" },
  { k: "received_qty",    l: "已收到数量",   w: 120, t: "num" },
  { k: "tracking_no",     l: "发货追踪编码", w: 180 },
];
const AS_BLOCKS = [
  { key: "amz_return",  label: "亚马逊退回海外仓记录", cols: AS_MAIN_COLS },
  { key: "wh_receipt",  label: "海外仓签收记录", cols: AS_MAIN_COLS },
  { key: "wh_saleable", label: "筛选可售库存，不可售丢弃库存记录", cols: AS_MAIN_COLS },
];
// kind 别名表 —— 2026-10-15 修: 库里曾有 114 行 kind='removal' (外部导入写成),
// 三个区块都认不出来 → 顶部显示「共 114 条」但区块里一条都不显示。
// 这里把历史/外部写法统一归到对应区块, 页面照常显示, 保存时自动改写成标准 kind。
const AS_KIND_TO_BLOCK = {
  amz_return: "amz_return", removal: "amz_return", amz_removal: "amz_return", return: "amz_return", returns: "amz_return",
  wh_receipt: "wh_receipt", receipt: "wh_receipt", wh_sign: "wh_receipt", sign: "wh_receipt",
  wh_saleable: "wh_saleable", saleable: "wh_saleable", unsaleable: "wh_saleable", disposal: "wh_saleable", discard: "wh_saleable",
};
// 表里所有可选列 (顺序固定, 供 payload 拼装); AS_NUM_KEYS = 需要转数字的列
const AS_KEYS = ["rec_date", "remove_order_no", "product", "asin", "remove_qty", "received_qty", "tracking_no", "store", "sku", "qty", "note"];
const AS_NUM_KEYS = ["remove_qty", "received_qty", "qty"];
// 库里另有 saleable_qty / unsaleable_qty / disposal 三列 (2026-10-14 曾为区块③拟), 现不用, 留作备用
const asColsOf = (kind) => ((AS_BLOCKS.find(b => b.key === kind) || {}).cols) || AS_FALLBACK_COLS;
const asGridOf = (cols) => ["56px", ...cols.map(c => (typeof c.w === "number" ? `${c.w}px` : c.w)), "70px"].join(" ");
const asMinW = (cols) => 56 + 70 + cols.reduce((s, c) => s + (typeof c.w === "number" ? c.w : 200), 0);

function AfterStock() {
  const cur = new Date();
  const today = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
  const [list, setList] = useState([]);
  const [dirty, setDirty] = useState({});
  const [removed, setRemoved] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [role, setRole] = useState(null);
  const [roleReady, setRoleReady] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [storeF, setStoreF] = useState("");   // 顶部店铺下拉: "" = 全部店铺
  const PWD = "852963";

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data && data.user) setRole(getUserRole(data.user.email || ""));
    }).catch(() => {}).finally(() => setRoleReady(true));
  }, []);
  // 写权限白名单 (⚠️ 必须写在 role 的 useState 之后, 否则 TDZ 报错 → 整页白屏)
  const canEdit = ["admin", "fr", "cd_supplier"].includes(role || "");
  const STORES = OPS_FIXED_STORES;

  const load = () => {
    supabase.from("after_stock").select("*")
      .order("rec_date", { ascending: false }).order("id", { ascending: false }).limit(3000)
      .then(({ data, error }) => {
        if (error) { setErr(error.message); setList([]); }
        else {
          setErr("");
          setList((data || []).map(r => {
            const blk = AS_KIND_TO_BLOCK[r.kind] || (r.kind || "amz_return");
            const o = { key: `id:${r.id}`, id: r.id, kind: blk, blk };
            for (const k of AS_KEYS) {
              const v = r[k];
              o[k] = (v === null || v === undefined) ? "" : (AS_NUM_KEYS.includes(k) ? Number(v) : v);
            }
            return o;
          }));
        }
        setLoaded(true);
      });
  };
  useEffect(() => {
    if (!roleReady) return;
    setDirty({}); setRemoved([]); setList([]); setLoaded(false); load();
  }, [roleReady]);

  const setField = (key, field, v) => {
    setList(p => p.map(r => (r.key === key ? { ...r, [field]: v } : r)));
    setDirty(p => ({ ...p, [key]: true }));
  };
  const addRow = (kind) => {
    const key = `new:${Date.now()}`;
    const o = { key, id: null, kind, blk: kind };
    for (const k of AS_KEYS) o[k] = "";
    o.rec_date = today;                       // 新增行默认填今天, 其余留空
    o.store = storeF || "";                   // 顶部选了具体店铺 → 新行自动归属该店铺
    setList(p => [...p, o]);
    setDirty(p => ({ ...p, [key]: true }));
  };
  const delRow = (r) => {
    if (r.id) setRemoved(p => [...p, r.id]);
    setList(p => p.filter(x => x.key !== r.key));
    setDirty(p => { const n = { ...p }; delete n[r.key]; return n; });
  };

  const dirtyRows = list.filter(r => dirty[r.key]);
  const pendingUpd = dirtyRows.filter(r => r.id);
  const pendingNew = dirtyRows.filter(r => !r.id && AS_KEYS.some(k => k !== "rec_date" && String(r[k] ?? "").trim() !== ""));
  const pendingCount = pendingUpd.length + pendingNew.length + removed.length;
  // 库里存在但 kind 不在三个区块内的行 (历史/外部导入造成) → 单独提示, 避免「显示总数却看不到」
  const orphanRows = list.filter(r => !AS_BLOCKS.some(b => b.key === r.blk));

  const payloadOf = (r) => {
    const o = { kind: r.kind };
    for (const k of AS_KEYS) {
      const raw = r[k];
      o[k] = AS_NUM_KEYS.includes(k)
        ? (String(raw ?? "").trim() === "" ? null : Number(raw))
        : (String(raw ?? "").trim() || null);
    }
    return o;
  };

  const submitAll = () => {
    const all = [...pendingUpd, ...pendingNew];
    const badDate = all.find(r => String(r.rec_date ?? "").trim() === "");
    const badNum = all.find(r => AS_NUM_KEYS.some(k => String(r[k] ?? "").trim() !== "" && isNaN(Number(r[k]))));
    if (badDate) { alert("有行的「日期」为空, 请补全"); return; }
    if (badNum) { alert("数量列必须是数字"); return; }
    setPwdOpen(true);
  };
  const discardAll = () => { setDirty({}); setRemoved([]); setPwdOpen(false); setPwd(""); setPwdErr(""); load(); };
  const confirmSubmit = async () => {
    if (pwd !== PWD) { setPwdErr("密码不正确"); return; }
    setSaving(true);
    let errMsg = "";
    if (removed.length) {
      const { error } = await supabase.from("after_stock").delete().in("id", removed);
      if (error) errMsg = error.message;
    }
    if (!errMsg) for (const r of pendingUpd) {
      const { error } = await supabase.from("after_stock").update(payloadOf(r)).eq("id", r.id);
      if (error) { errMsg = error.message; break; }
    }
    if (!errMsg) for (const r of pendingNew) {
      const { error } = await supabase.from("after_stock").insert(payloadOf(r));
      if (error) { errMsg = error.message; break; }
    }
    setSaving(false); setPwdOpen(false); setPwd(""); setPwdErr("");
    if (errMsg) { alert("保存失败(请先在 Supabase 跑 sql/create_after_stock.sql): " + errMsg); return; }
    setDirty({}); setRemoved([]);
    load();
  };

  const th = { padding: "10px 12px", fontSize: 12, color: "#fff", fontWeight: 600, borderRight: "1px solid #2a4a78" };
  const cellInput = { width: "100%", padding: "6px 8px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, outline: "none", colorScheme: "dark" };
  const cellText = { padding: "10px 12px", fontSize: 12, color: C.ink, borderRight: `1px solid ${C.line}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  const colHead = (t, extra) => <div style={{ ...th, ...extra }}>{t}</div>;
  const cellBox = { padding: "4px 8px", borderRight: `1px solid ${C.line}` };
  // 按列类型出输入控件 (date=日期 / sel=店铺下拉 / num=数字 / 其他=文本)
  const inputFor = (c, r) => {
    if (c.t === "date") return <input type="date" value={r[c.k]} onChange={e => setField(r.key, c.k, e.target.value)} style={cellInput} />;
    if (c.t === "sel") {
      // c.opts 有值时用自定义选项 (如「处理方式」); 否则用店铺列表
      const opts = (c.opts && c.opts.length) ? c.opts : STORES;
      return (
        <select value={r[c.k]} onChange={e => setField(r.key, c.k, e.target.value)} style={cellInput}>
          <option value="">—</option>
          {opts.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      );
    }
    if (c.t === "num") return <input value={r[c.k]} onChange={e => setField(r.key, c.k, e.target.value)} onFocus={e => e.target.select()}
      placeholder="0" inputMode="decimal" style={{ ...cellInput, textAlign: "right", fontWeight: 600 }} />;
    return <input value={r[c.k]} onChange={e => setField(r.key, c.k, e.target.value)} placeholder={c.l} title={r[c.k]} style={cellInput} />;
  };
  // 只读展示
  const shown = (c, r) => {
    const v = r[c.k];
    if (String(v ?? "").trim() === "") return "—";
    return c.t === "num" ? Number(v) : v;
  };
  const sumOf = (rows, k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  // 提交确认框里的「该行内容」摘要
  const summaryOf = (r) => asColsOf(r.kind).filter(c => c.k !== "rec_date")
    .map(c => `${c.l} ${String(r[c.k] ?? "").trim() === "" ? "—" : r[c.k]}`).join(" · ");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>海外仓售后库存</div>
        <select value={storeF} onChange={e => setStoreF(e.target.value)} title="按店铺筛选"
          style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${storeF ? C.brand : C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, outline: "none", minWidth: 130, colorScheme: "dark", cursor: "pointer" }}>
          <option value="">全部店铺</option>
          {STORES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {storeF && <button onClick={() => setStoreF("")}
          style={{ padding: "5px 10px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 11, cursor: "pointer" }}>清除筛选</button>}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: C.faint }}>
            共 {list.length} 条 · 三区块显示 {list.length - orphanRows.length} 条{storeF ? ` · 当前店铺 ${list.filter(r => r.store === storeF).length} 条` : ""}
          </span>
          {canEdit && pendingCount > 0 && (
            <button onClick={submitAll}
              style={{ padding: "6px 14px", background: C.brand, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              确认提交（{pendingCount} 项待入库）
            </button>
          )}
          {canEdit
            ? <span style={{ fontSize: 11, color: C.faint }}>当前角色：{getRoleLabel(role) || role} · 可录入（改动先标橙，确认提交后输密码入库）</span>
            : <span style={{ fontSize: 11, color: "#e8c477" }}>只读模式 —— 当前账号「{getRoleLabel(role) || "未知角色"}」无录入权，所以要联系 KK 开权限</span>}
        </div>
      </div>

      {orphanRows.length > 0 && (
        <div style={{ background: "#d9a44122", border: "1px solid #d9a441", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#e8c477" }}>
          ⚠ 库里有 <b>{orphanRows.length}</b> 条的 kind 不属于三个区块（{Array.from(new Set(orphanRows.map(r => r.kind))).join("、")}）→ 已按别名归入区块①显示；
          如仍看不到，请联系 KK 用 SQL 统一 kind。
        </div>
      )}

      {err && (
        <div style={{ background: "#c05b5222", border: "1px solid #c05b52", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#c05b52" }}>
          读取失败(请先在 Supabase 跑 sql/create_after_stock.sql, 含末尾新增列的 ALTER): {err}
        </div>
      )}

      {(!loaded || !roleReady) && <div style={{ padding: 30, textAlign: "center", color: C.faint }}>加载中…</div>}

      {loaded && roleReady && AS_BLOCKS.map(b => {
        const cols = b.cols || AS_FALLBACK_COLS;
        const rows = list.filter(r => r.blk === b.key && (!storeF || r.store === storeF));
        const grid = asGridOf(cols);
        return (
          <div key={b.key} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
            <div style={{ padding: "11px 14px", background: "#1f3a68", color: "#fff", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>{b.label}</span>
              {!b.cols && <span style={{ fontSize: 10, color: "#c8d6ea", fontWeight: 400, border: "1px solid #4a6a9a", borderRadius: 4, padding: "1px 6px" }}>列待定</span>}
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#c8d6ea", fontWeight: 400 }}>{rows.length} 条</span>
              {canEdit && (
                <button onClick={() => addRow(b.key)}
                  style={{ padding: "4px 12px", background: C.brand, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  + 新增一行
                </button>
              )}
            </div>

            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: asMinW(cols) }}>
                <div style={{ display: "grid", gridTemplateColumns: grid, background: "#1f3a68" }}>
                  {colHead("#", { textAlign: "center" })}
                  {cols.map(c => colHead(c.l, c.t === "num" ? { textAlign: "right" } : null))}
                  {colHead("操作", { borderRight: "none", textAlign: "center" })}
                </div>

                {rows.map((r, i) => {
                  const pend = !!dirty[r.key];
                  const bgc = pend ? "#d9a44118" : (i % 2 ? C.bg : "transparent");
                  return (
                    <div key={r.key} style={{ display: "grid", gridTemplateColumns: grid, borderTop: `1px solid ${C.line}`, background: bgc }}>
                      <div style={{ padding: "10px 8px", fontSize: 11, color: C.faint, textAlign: "center", borderRight: `1px solid ${C.line}` }}>{i + 1}</div>
                      {canEdit ? (
                        <>
                          {cols.map(c => <div key={c.k} style={cellBox}>{inputFor(c, r)}</div>)}
                          <div style={{ padding: "4px 8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <button onClick={() => delRow(r)} title="删除此行 (提交后生效)"
                              style={{ padding: "4px 10px", background: "transparent", color: "#e0857a", border: "1px solid #c05b52", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>删除</button>
                          </div>
                        </>
                      ) : (
                        <>
                          {cols.map(c => (
                            <div key={c.k}
                              style={{ ...cellText, ...(c.t === "num" ? { textAlign: "right", fontWeight: 600, color: String(r[c.k] ?? "").trim() === "" ? C.faint : C.ink } : {}) }}
                              title={String(shown(c, r))}>{shown(c, r)}</div>
                          ))}
                          <div style={{ padding: "10px 8px", fontSize: 11, color: C.faint, textAlign: "center" }}>—</div>
                        </>
                      )}
                    </div>
                  );
                })}

                {rows.length === 0 && (
                  <div style={{ padding: "34px 20px", textAlign: "center", color: C.faint, fontSize: 13, borderTop: `1px solid ${C.line}` }}>
                    {storeF ? `「${storeF}」暂无记录` : "暂无记录"}{canEdit ? "，点右上「+ 新增一行」开始录入" : ""}
                  </div>
                )}

                {rows.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: grid, borderTop: `2px solid ${C.line}`, background: C.bg, fontSize: 12, fontWeight: 700 }}>
                    <div style={{ padding: "10px 8px" }} />
                    {cols.map((c, ci) => (
                      <div key={c.k} style={{ padding: "10px 12px", ...(c.t === "num" ? { textAlign: "right", color: C.brand } : {}) }}>
                        {ci === 0 ? <span style={{ color: C.brand }}>合计 · {rows.length} 条</span>
                          : (c.t === "num" ? sumOf(rows, c.k) : "")}
                      </div>
                    ))}
                    <div style={{ padding: "10px 8px" }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* 待提交浮条: 改动只缓存在页面, 点确认提交才输密码一次性入库 */}
      {pendingCount > 0 && !pwdOpen && (
        <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 26, zIndex: 110, background: C.panel, border: "1px solid #d9a441", boxShadow: "0 10px 30px rgba(0,0,0,.28)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 12, color: C.ink }}>
            本次已改 <b style={{ color: C.brand, fontSize: 14 }}>{pendingCount}</b> 项 · 尚未入库, 点右侧确认提交(需密码)
          </span>
          <button onClick={discardAll} style={{ padding: "6px 12px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 12, cursor: "pointer" }}>撤销全部</button>
          <button onClick={submitAll} style={{ padding: "6px 16px", background: C.brand, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>确认提交</button>
        </div>
      )}

      {/* 提交确认框: 列出全部改动 + 输密码 852963 */}
      {pwdOpen && (
        <div onClick={() => { setPwdOpen(false); setPwd(""); setPwdErr(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, width: 640, maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>确认提交 {pendingCount} 项改动</div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 14 }}>核对无误后输入密码, 一次性写入数据库</div>
            <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 14 }}>
              <div style={{ display: "flex", color: C.sub, fontSize: 11, paddingBottom: 6, borderBottom: `1px solid ${C.line}` }}>
                <span style={{ width: 52 }}>动作</span>
                <span style={{ width: 150 }}>区块</span>
                <span style={{ width: 92 }}>日期</span>
                <span style={{ flex: 1 }}>该行内容</span>
              </div>
              {removed.map(id => (
                <div key={`del-${id}`} style={{ display: "flex", padding: "5px 0", borderBottom: `1px solid ${C.line}`, color: "#e0857a" }}>
                  <span style={{ width: 52 }}>删除</span>
                  <span style={{ width: 150 }}>—</span>
                  <span style={{ width: 92 }}>—</span>
                  <span style={{ flex: 1 }}>已删除的一行 → 移除</span>
                </div>
              ))}
              {[...pendingUpd, ...pendingNew].map(r => (
                <div key={r.key} style={{ display: "flex", padding: "5px 0", borderBottom: `1px solid ${C.line}` }}>
                  <span style={{ width: 52, color: r.id ? C.sub : C.brand }}>{r.id ? "修改" : "新增"}</span>
                  <span style={{ width: 150, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(AS_BLOCKS.find(x => x.key === r.blk) || {}).label || "—"}</span>
                  <span style={{ width: 92, color: C.ink }}>{r.rec_date || "—"}</span>
                  <span style={{ flex: 1, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={summaryOf(r)}>{summaryOf(r)}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>确认密码</div>
            <input type="password" value={pwd} autoFocus
              onChange={e => { setPwd(e.target.value); setPwdErr(""); }}
              onKeyDown={e => { if (e.key === "Enter" && !saving) confirmSubmit(); if (e.key === "Escape") { setPwdOpen(false); setPwd(""); setPwdErr(""); } }}
              placeholder="输入密码"
              style={{ width: "100%", padding: "9px 12px", background: C.bg, border: `1px solid ${pwdErr ? "#c05b52" : C.line}`, borderRadius: 6, color: C.ink, fontSize: 14, marginBottom: 6 }} />
            {pwdErr && <div style={{ fontSize: 11, color: "#c05b52", marginBottom: 6 }}>{pwdErr}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => { setPwdOpen(false); setPwd(""); setPwdErr(""); }} style={{ flex: 1, padding: "9px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>返回继续改</button>
              <button onClick={confirmSubmit} disabled={saving} style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: saving ? "wait" : "pointer", fontWeight: 600, opacity: saving ? .7 : 1 }}>{saving ? "提交中…" : "确认提交"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- 单品月度订单统计 (空骨架, 待 KK 填充) ----------------
function OrderSummary() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>单品月度订单统计</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            单品 × 月维度的订单量统计 · 仅管理员可见 · 待 KK 确认口径与数据源
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span style={{ fontSize: 12, color: C.ink, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: C.panel, border: `1px solid ${C.line}` }}>尚未接入</span>
        </div>
      </div>
      <div style={{ background: C.panel, border: `1px dashed ${C.line}`, borderRadius: 12, padding: 60, textAlign: "center", color: C.faint, fontSize: 13 }}>
        单品月度订单统计 · 待 KK 确认口径 (单品×月订单量 / 同比环比 / 品牌维度) 与数据源 (SP-API)
      </div>
    </div>
  );
}

// ---------------- 订单记录 (按 KK 2026-09-17 Excel「订单统计」表头) ----------------
// 列: 序号 / 日期 / 订单号 / 地区 / 名字 / 产品 / sku / 到仓价 / 售价 / 到手营业额 / 折合 / 毛利润 / 毛利率 / 邮件 / 索评 / 退款
// 数据源: 表 order_records (Excel 导入: node scripts/import-orders.mjs <文件>)
function OrderRecords() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [fPlat, setFPlat] = useState("");      // 平台筛选: "" = 全部
  const [fStore, setFStore] = useState("");    // 店铺筛选: "" = 全部店铺
  const [fMonth, setFMonth] = useState("");    // 月份筛选: "" = 全部月份 (KK 2026-11-25: 全量订单跨两年, 要能按周期看)
  useEffect(() => {
    supabase.from("order_records").select("*")
      .order("order_date", { ascending: false }).limit(3000)
      .then(({ data, error }) => {
        if (error) { setErr(error.message); setRows([]); } else { setRows(data || []); setErr(""); }
        setLoaded(true);
      });
  }, []);
  // 平台 → 该平台下的店铺 (KK 2026-11-25: 三个平台, 店铺名按系统现有口径生成)
  // ManoMano 是飞鸟这个主体开的店 → 店铺名就叫「飞鸟」, 与亚马逊的飞鸟是两个平台的两家店
  const PLAT_STORES = { amazon: OPS_FIXED_STORES, cdiscount: ["梦想"], manomano: ["飞鸟"] };
  // KK 2026-11-25: 必须先选平台才出店铺, 不再混成一个总表
  const storeOpts = PLAT_STORES[fPlat] || [];
  // 同名店铺跨平台(如飞鸟同时有亚马逊店和 ManoMano 店) → 下拉里带平台名区分, 值仍是店铺名
  const storeLabel = (s) => {
    const dup = Object.entries(PLAT_STORES).some(([k, arr]) => k !== fPlat && arr.includes(s));
    return dup ? `${s}（${PLATFORM_LABEL[fPlat] || fPlat}）` : s;
  };
  const view = rows.filter(r => {
    const p = r.platform || "amazon";              // 老数据没有 platform, 一律视为亚马逊
    if (fPlat && p !== fPlat) return false;
    if (fStore && (r.store || "") !== fStore) return false;
    if (fMonth && String(r.order_date || "").slice(0, 7) !== fMonth) return false;
    return true;
  });
  // 可选月份（新的在前）；一个订单可能多行，订单数按 order_no 去重
  const monthOpts = Array.from(new Set(rows.map(r => String(r.order_date || "").slice(0, 7)).filter(Boolean))).sort().reverse();
  const nOrders = new Set(view.map(r => r.order_no || r.ext_ref)).size;
  const OC = [
    { k: "idx", l: "序号", w: 60 },
    { k: "order_date", l: "日期", w: 100 },
    { k: "order_no", l: "订单号", w: 175 },
    { k: "region", l: "地区", w: 70 },
    { k: "product", l: "产品", w: 150 },
    { k: "sku", l: "sku", w: 115 },
    { k: "qty", l: "数量", w: 60 },
    { k: "revenue_ttc", l: "售价(含税)", w: 96, t: "eur" },
    { k: "vat_amount", l: "VAT", w: 80, t: "eur" },
    { k: "revenue_ht", l: "去税收入", w: 96, t: "eur" },
    { k: "commission_amt", l: "佣金", w: 80, t: "eur" },
    { k: "service_fee", l: "处理费", w: 78, t: "eur" },
    { k: "fbc_fee", l: "FBC运费", w: 82, t: "eur" },
    { k: "eco_tax", l: "环保金", w: 78, t: "eur" },
    { k: "net_revenue", l: "到手", w: 84, t: "eur" },
    { k: "converted", l: "到手¥", w: 92, t: "money" },
    { k: "landed_cost", l: "到仓价¥", w: 92, t: "money" },
    { k: "gross_profit", l: "毛利¥", w: 92, t: "money", hl: true },
    { k: "gross_margin", l: "毛利率", w: 78, t: "pct" },
    { k: "refund", l: "退款", w: 62 },
    { k: "email_sent", l: "邮件", w: 62 },
    { k: "review_asked", l: "索评", w: 62 },
  ];
  const OC_GRID = OC.map(c => `${c.w}px`).join(" ");
  // 合计行要参与求和的列（单价 price 是单价，不求和）
  const OC_SUM = ["qty", "revenue_ttc", "vat_amount", "revenue_ht", "commission_amt", "service_fee", "fbc_fee", "eco_tax", "net_revenue", "converted", "landed_cost", "gross_profit"];
  const money = (v) => (v === null || v === undefined || v === "") ? "—" : "¥" + Number(v).toFixed(2);
  const eur = (v) => (v === null || v === undefined || v === "") ? "—" : "€" + Number(v).toFixed(2);
  // 客户姓名：优先收货人姓名，回退平台客户编号
  const custName = (r) => {
    const nm = [r.cust_last, r.cust_first].filter(Boolean).join(" ");
    return nm || r.customer || "—";
  };
  // 导出当前筛选下的客户明细（姓名/地址/联系方式），供营销或快递对单
  const exportCust = () => {
    const H = ["日期", "订单号", "客户", "公司", "地址1", "地址2", "地址3", "邮编", "城市", "国家", "电话", "邮箱", "自提点", "SKU", "数量"];
    const q = (v) => {
      const s = (v === null || v === undefined) ? "" : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const body = view.map(r => [
      r.order_date, r.order_no, custName(r), r.cust_company,
      r.ship_addr1, r.ship_addr2, r.ship_addr3, r.ship_postal, r.ship_city, r.ship_country,
      r.ship_phone, r.ship_email, r.pickup_name, r.sku, r.qty,
    ].map(q).join(","));
    const csv = "\ufeff" + [H.join(","), ...body].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `客户明细_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const cellOf = (c, r, i) => {
    if (c.k === "idx") return i + 1;
    // FBC 运费：按库存标准费预估的加 ≈，运营回传实际扣款的显示实值
    if (c.k === "fbc_fee") {
      if (r.fbc_fee === null || r.fbc_fee === undefined || r.fbc_fee === "") return "—";
      return eur(r.fbc_fee) + (r.fbc_src === "std" ? " ≈" : "");
    }
    const v = r[c.k];
    if (c.t === "money") return money(v);
    if (c.t === "eur") return eur(v);
    if (c.t === "pct") return (v === null || v === undefined || v === "") ? "—" : (Number(v) * 100).toFixed(2) + "%";
    return (v === null || v === undefined || v === "") ? "—" : v;
  };
  const sum = (k) => view.reduce((s, r) => s + Number(r[k] || 0), 0);
  const avgMargin = (() => {
    const ok = view.filter(r => r.gross_margin !== null && r.gross_margin !== undefined && r.gross_margin !== "");
    return ok.length ? ok.reduce((s, r) => s + Number(r.gross_margin), 0) / ok.length : null;
  })();
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>订单记录</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {/* 平台 / 店铺 筛选 — KK 2026-11-25 */}
          <span style={{ fontSize: 12, color: C.sub }}>平台:</span>
          <select value={fPlat} onChange={e => { setFPlat(e.target.value); setFStore(""); }}
            style={{ padding: "5px 10px", background: C.bg, border: `1px solid ${fPlat ? C.brand : C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, fontWeight: fPlat ? 700 : 400 }}>
            <option value="">全部平台</option>
            {PLATFORMS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <span style={{ fontSize: 12, color: C.sub }}>店铺:</span>
          <select value={fStore} onChange={e => setFStore(e.target.value)} disabled={!fPlat}
            title={fPlat ? "" : "请先选择平台"}
            style={{ padding: "5px 10px", background: C.bg, border: `1px solid ${fStore ? C.brand : C.line}`, borderRadius: 6, color: fPlat ? C.ink : C.faint, fontSize: 12, fontWeight: fStore ? 700 : 400, opacity: fPlat ? 1 : .55, cursor: fPlat ? "pointer" : "not-allowed" }}>
            <option value="">{fPlat ? "全部店铺" : "先选平台"}</option>
            {storeOpts.map(s => <option key={s} value={s}>{storeLabel(s)}</option>)}
          </select>
          <span style={{ fontSize: 12, color: C.sub }}>月份:</span>
          <select value={fMonth} onChange={e => setFMonth(e.target.value)}
            style={{ padding: "5px 10px", background: C.bg, border: `1px solid ${fMonth ? C.brand : C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, fontWeight: fMonth ? 700 : 400 }}>
            <option value="">全部月份</option>
            {monthOpts.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <span style={{ fontSize: 11, color: C.faint, marginLeft: 6 }}>共 {nOrders} 单</span>
          <button onClick={exportCust} disabled={!view.length}
            title="导出当前筛选下的客户姓名/地址/电话/邮箱"
            style={{ padding: "5px 11px", background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 6, color: view.length ? C.ink : C.faint, fontSize: 12, cursor: view.length ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            导出客户
          </button>
          <span style={{ fontSize: 12, color: C.brand, fontWeight: 700, padding: "3px 12px", borderRadius: 6, background: C.panel2, border: `1px solid ${C.line}` }}>
            毛利润合计 ¥{sum("gross_profit").toFixed(2)}
          </span>
          <span style={{ fontSize: 12, color: C.ink, fontWeight: 700, padding: "3px 12px", borderRadius: 6, background: C.panel2, border: `1px solid ${C.line}` }}>
            平均毛利率 {avgMargin === null ? "—" : (avgMargin * 100).toFixed(2) + "%"}
          </span>
        </div>
      </div>

      {err && (
        <div style={{ background: "#c05b5222", border: "1px solid #c05b52", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#c05b52" }}>
          读取失败(请先建表 order_records): {err}
        </div>
      )}

      {!loaded && <div style={{ padding: 30, textAlign: "center", color: C.faint }}>加载中…</div>}

      {loaded && view.length > 0 && (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "auto" }}>
          <div style={{ minWidth: 2082 }}>
            <div style={{ display: "grid", gridTemplateColumns: OC_GRID, background: "#1f3a68", fontSize: 11, color: "#fff", fontWeight: 600, position: "sticky", top: 0, zIndex: 3 }}>
              {OC.map(c => <div key={c.k} style={{ padding: "9px 8px", borderRight: `1px solid #2a4a78` }}>{c.l}</div>)}
            </div>
            {/* 统计行 —— 贴在表头下方，跟随平台/店铺筛选实时汇总 (KK 2026-11-25) */}
            <div style={{ display: "grid", gridTemplateColumns: OC_GRID, background: C.panel2, fontSize: 11, fontWeight: 700, borderBottom: `2px solid ${C.line}`, position: "sticky", top: 33, zIndex: 2 }}>
              {OC.map(c => {
                const bd = { borderRight: `1px solid ${C.line}` };
                if (c.k === "idx") return <div key={c.k} style={{ padding: "9px 8px", color: C.faint, ...bd }} />;
                if (c.k === "order_date") return <div key={c.k} style={{ padding: "9px 8px", color: C.brand, ...bd }}>统计</div>;
                if (c.k === "order_no") return <div key={c.k} style={{ padding: "9px 8px", color: C.sub, ...bd }}>{nOrders} 单</div>;
                if (c.k === "gross_margin") return <div key={c.k} style={{ padding: "9px 8px", textAlign: "right", color: C.ink, ...bd }}>{avgMargin === null ? "—" : (avgMargin * 100).toFixed(2) + "%"}</div>;
                if (OC_SUM.includes(c.k)) return <div key={c.k} style={{ padding: "9px 8px", textAlign: "right", color: c.hl ? C.brand : C.ink, ...bd }}>{c.t === "eur" ? eur(sum(c.k)) : money(sum(c.k))}</div>;
                return <div key={c.k} style={{ padding: "9px 8px", ...bd }} />;
              })}
            </div>
            {view.map((r, i) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: OC_GRID, borderTop: i ? `1px solid ${C.line}` : "none", fontSize: 11, background: i % 2 ? C.bg : "transparent", color: C.ink }}>
                {OC.map(c => (
                  <div key={c.k} title={cellOf(c, r, i) === "—" ? "" : String(cellOf(c, r, i))}
                    style={{
                      padding: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      borderRight: `1px solid ${C.line}`,
                      textAlign: ["idx", "order_date", "order_no", "region", "product", "sku", "email_sent", "review_asked", "refund"].includes(c.k) ? "left" : "right",
                      fontWeight: c.hl ? 600 : 400,
                      color: c.hl ? C.brand : (c.k === "idx" ? C.faint : C.ink),
                    }}>
                    {cellOf(c, r, i)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {loaded && view.length === 0 && !err && (
        <div style={{ background: C.panel, border: `1px dashed ${C.line}`, borderRadius: 12, padding: 50, textAlign: "center", color: C.faint, fontSize: 13, lineHeight: 1.9 }}>
          {rows.length === 0 ? <>
            暂无订单记录<br />
            <span style={{ fontSize: 12 }}>Excel 导入: node scripts/import-orders.mjs {"<文件>"}（表头按 Excel：日期/订单号/地区/名字/产品/sku/到仓价/售价/到手营业额/折合/毛利润/毛利率/邮件/索评/退款）</span>
          </> : <>
            当前筛选下没有订单<br />
            <span style={{ fontSize: 12 }}>库里共 {rows.length} 单，换一个平台或店铺再看</span>
          </>}
        </div>
      )}

    </div>
  );
}

// ---------------- ASIN 生命周期 ----------------
// KK 2026-09-18 定: 选一个 ASIN → 下面四个板块
//   ① 上架日期 · 当下排名   ② 关键词排名   ③ 广告数据   ④ 盈利情况
// 数据来源待接 SP-API, 当前只落结构 (表头 + 空态), 不做录入/不建表
function AsinLifecycle() {
  const [asin, setAsin] = useState("");
  const [store, setStore] = useState("");
  const [site, setSite] = useState("");
  const SITES = ["FR", "DE", "UK", "IT", "ES", "BE", "NL", "SE"];
  const inputStyle = { fontSize: 12, color: C.ink, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", outline: "none" };

  // 空板块骨架: 标题 + 字段表头 + 空态
  const Block = ({ idx, title, sub, cols, note, wide }) => (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${C.line}` }}>
        <span style={{ fontSize: 11, color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>{idx}</span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{title}</span>
        <span style={{ fontSize: 11, color: C.sub }}>{sub}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: C.sub, border: `1px solid ${C.line}`, borderRadius: 4, padding: "1px 6px" }}>尚未接入</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols.map(w => w.w).join(" "), background: "#1f3a68", minWidth: wide ? 1080 : 720 }}>
          {cols.map((c, i) => (
            <div key={i} style={{ padding: "8px 10px", fontSize: 11, color: "#fff", fontWeight: 600, whiteSpace: "nowrap" }}>{c.l}</div>
          ))}
        </div>
        <div style={{ padding: "30px 10px", textAlign: "center", color: C.faint, fontSize: 12, lineHeight: 1.9 }}>
          {note}<br />
          <span style={{ fontSize: 11 }}>字段结构已就绪 · 等 SP-API 凭证接入后自动取数</span>
        </div>
      </div>
    </div>
  );

  const BLOCKS = [
    {
      idx: "①", title: "上架日期 · 当下排名", sub: "每个 ASIN 一行", wide: true,
      cols: [
        { l: "ASIN", w: "150px" }, { l: "SKU", w: "120px" }, { l: "产品名 / 款式", w: "170px" },
        { l: "店铺", w: "80px" }, { l: "站点", w: "70px" }, { l: "上架日期", w: "100px" },
        { l: "在售天数", w: "85px" }, { l: "当前 BSR", w: "90px" }, { l: "上期 BSR", w: "90px" },
        { l: "排名变化", w: "85px" }, { l: "更新日期", w: "100px" },
      ],
      note: "在售天数 / 排名变化 由系统自动计算",
    },
    {
      idx: "②", title: "关键词排名", sub: "一个 ASIN 可有多行关键词", wide: true,
      cols: [
        { l: "关键词", w: "220px" }, { l: "自然排名", w: "90px" }, { l: "广告排名", w: "90px" },
        { l: "上期排名", w: "90px" }, { l: "变化", w: "80px" }, { l: "月搜索量", w: "100px" },
        { l: "统计日期", w: "100px" },
      ],
      note: "变化 = 上期排名 − 本期排名 (正数=上升)",
    },
    {
      idx: "③", title: "广告数据", sub: "按周 / 按月汇总", wide: true,
      cols: [
        { l: "统计周期", w: "110px" }, { l: "曝光量", w: "90px" }, { l: "点击量", w: "85px" },
        { l: "点击率", w: "80px" }, { l: "广告花费", w: "100px" }, { l: "广告订单量", w: "95px" },
        { l: "广告销售额", w: "105px" }, { l: "ACOS", w: "80px" }, { l: "CPC", w: "80px" },
      ],
      note: "点击率 / ACOS / CPC 由系统自动计算 (花费与销售额按站点币种)",
    },
    {
      idx: "④", title: "盈利情况", sub: "按站点币种", wide: true,
      cols: [
        { l: "售价", w: "90px" }, { l: "到仓成本", w: "95px" }, { l: "头程分摊", w: "95px" },
        { l: "亚马逊佣金", w: "105px" }, { l: "FBA 配送费", w: "105px" }, { l: "广告花费分摊", w: "105px" },
        { l: "毛利", w: "95px" }, { l: "毛利率", w: "85px" }, { l: "累计销量", w: "90px" },
        { l: "累计利润", w: "100px" },
      ],
      note: "毛利 = 售价 − 到仓成本 − 头程分摊 − 佣金 − FBA − 广告分摊; 累计利润 = 毛利 × 累计销量",
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>ASIN 生命周期</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            选一个 ASIN 看全周期: 上架与排名 · 关键词排名 · 广告数据 · 盈利情况
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span style={{ fontSize: 12, color: C.ink, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: C.panel, border: `1px solid ${C.line}` }}>结构就绪 · 待接 SP-API</span>
        </div>
      </div>

      {/* 顶部筛选: 选 ASIN / 店铺 / 站点 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: C.sub }}>ASIN</span>
        <input value={asin} onChange={e => setAsin(e.target.value.toUpperCase())} placeholder="例: B0FNWSZZH7"
          style={{ ...inputStyle, width: 190, fontFamily: "monospace", letterSpacing: ".03em" }} />
        <span style={{ fontSize: 12, color: C.sub, marginLeft: 4 }}>店铺</span>
        <select value={store} onChange={e => setStore(e.target.value)} style={{ ...inputStyle, width: 120 }}>
          <option value="">全部店铺</option>
          {OPS_FIXED_STORES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 12, color: C.sub, marginLeft: 4 }}>站点</span>
        <select value={site} onChange={e => setSite(e.target.value)} style={{ ...inputStyle, width: 110 }}>
          <option value="">全部站点</option>
          {SITES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>
          查询功能待数据接入后启用
        </span>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {BLOCKS.map(b => <Block key={b.idx} {...b} />)}
      </div>
    </div>
  );
}

// ---------------- 广告分析 (空骨架, 待 KK 提供内容) ----------------
function AdAnalysis() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>广告分析</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            广告花费 / 投产比 / 关键词表现分析 · 待 KK 确认口径与数据源
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span style={{ fontSize: 12, color: C.ink, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: C.panel, border: `1px solid ${C.line}` }}>尚未接入</span>
        </div>
      </div>
      <div style={{ background: C.panel, border: `1px dashed ${C.line}`, borderRadius: 12, padding: 60, textAlign: "center", color: C.faint, fontSize: 13 }}>
        广告分析 · 待 KK 提供内容 (字段 / 口径 / 数据源)
      </div>
    </div>
  );
}

// ---------------- 办公室费用明细 (KK 2026-09-17 格式: 日期 / 项目明细 / 费用) ----------------
// 表 office_expense (sql/create_office_expense.sql); 每月一张明细表(顶部选月份)
// 录入规则与运维费用/月度核算一致: 改动只进待提交队列 → 底部「确认提交」→ 输密码 → 一次性入库
// 权限 (KK 2026-09-18 定): 可见 = admin(你) + fr(泺伊) + cd_procurement(黄丹); 登记/编辑 = 只有黄丹(+admin兜底)
// RLS 同步: sql/office_expense_access.sql
// ==================== 现金账 (仅 kinzon.eu@gmail.com 可见 — KK 2026-11-22 定) ====================
const CASH_OWNER_EMAIL = "kinzon.eu@gmail.com";

// 真实现金流出科目
const CASH_OUT_CATS = ["采购货款", "国内运费", "采购税费", "头程运费", "目的国杂费", "关税", "保险费", "人工工资", "场地租金", "办公室费用", "店铺其他费用", "VAT 实缴", "平台服务费", "其他支出"];
// 真实现金流入科目
const CASH_IN_CATS = ["资本金", "平台回款", "其他流入"];

// 支付关卡: KK 2026-11-22 定 — 只有采购 / 物流 / 办公室 / 店铺费用 是真金白银
const CASH_GATES = [
  { cat: "采购", tbl: "purchase_payments", src: "采购管理 · 付款流水", note: "货款 + 国内运费 + 税费，按付款日归月" },
  { cat: "物流", tbl: "shipments(批次去重)", src: "发货记录 · 批次费用", note: "头程 + 杂费 + 关税 + 保险，按发货日归月" },
  { cat: "办公室费用", tbl: "office_expense", src: "办公室费用", note: "会计 / 招待 / 差旅 / 设备租赁" },
  { cat: "店铺其他费用", tbl: "store_other_expense", src: "其他费用", note: "美工 / 说明书 / 包装法 / 税务" },
];
// 固定支出: 金额刚性、可预测，默认不计入，可一键开关
const CASH_FIXED = [
  { cat: "人工工资", tbl: "store_monthly_costs(人工)", note: "含社保公积金公司承担部分" },
  { cat: "场地租金", tbl: "store_monthly_costs(场地)", note: "各店仓库 / 办公室租金" },
];
// 缺口: 真实现金支出但目前没有台账
const CASH_GAP = [
  { cat: "VAT 实缴", note: "按季申报实缴，暂无台账 — 需补" },
  { cat: "平台服务费", note: "年费 / 保证金 / 汇损手续费 — 需补" },
];
// 这些不是现金流出: 亚马逊从卖家账户余额里直接扣, 不掏现金 — 不进现金账
const CASH_EXCLUDED = ["平台佣金", "FBA 配送费", "订单 VAT", "仓储费", "广告费", "弃置费", "长期仓储", "店铺月租", "EPR 生产者延伸费", "服务订阅", "入库费", "优惠券", "退货费"];

function CashBook() {
  const cur = new Date();
  const today = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
  const [flows, setFlows] = useState([]);      // v_cashflow_monthly 月度现金流
  const [entries, setEntries] = useState([]);  // cash_entries 手动补录
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [inclFixed, setInclFixed] = useState(false); // 是否把人工/场地计入流出
  const [form, setForm] = useState(null);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [openGates, setOpenGates] = useState(false);
  const PWD = "852963";

  const load = () => {
    setLoading(true);
    Promise.all([
      supabase.from("v_cashflow_monthly").select("*").order("period", { ascending: false }).limit(36),
      supabase.from("cash_entries").select("*").order("entry_date", { ascending: false }).limit(200),
    ]).then(([f, e]) => {
      const bad = [f, e].find(x => x.error);
      if (bad) setErr(bad.error.message); else setErr("");
      setFlows(f.data || []);
      setEntries(e.data || []);
      setLoading(false);
    }).catch(ex => { setErr(String(ex)); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  // ---- 月度现金流计算 ----
  const ym = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
  const num = (v) => Number(v || 0);
  const thisMonth = flows.find(f => f.period === ym) || {};
  const yearFlows = flows.filter(f => String(f.period || "").startsWith(String(cur.getFullYear())));
  const sumYear = (k) => yearFlows.reduce((a, f) => a + num(f[k]), 0);
  // 当月口径: core_out 已含手动补录; 全流出再加人工+场地
  const mCoreOut = num(thisMonth.core_out);
  const mFixed = num(thisMonth.labor) + num(thisMonth.site);
  const mOut = mCoreOut + (inclFixed ? mFixed : 0);
  const mIn = num(thisMonth.total_in);
  const mNet = mIn - mOut;

  // 支付关卡已录金额(仅手动补录部分, 自动汇总的不重复显示)
  const byCat = {};
  entries.forEach(r => { if (r.direction === "out") byCat[r.category] = (byCat[r.category] || 0) + num(r.amount_cny); });

  const blank = () => ({ id: null, entry_date: today, direction: "out", category: CASH_OUT_CATS[0], amount_cny: "", ref_no: "", ref_note: "" });
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = () => {
    const f = form;
    if (!f.entry_date) return alert("请填日期");
    if (!f.amount_cny || Number(f.amount_cny) <= 0) return alert("金额必须大于 0");
    setPwd(""); setPwdErr(""); setPwdOpen(true);
  };
  const doSave = async () => {
    if (pwd !== PWD) { setPwdErr("密码不正确"); return; }
    setSaving(true);
    const f = form;
    const payload = {
      entry_date: f.entry_date,
      direction: f.direction,
      category: f.category,
      amount_cny: Number(f.amount_cny),
      ref_no: f.ref_no || null,
      ref_note: f.ref_note || null,
      source_table: "manual",
      auto: false,
      created_by: CASH_OWNER_EMAIL,
    };
    const { error } = f.id
      ? await supabase.from("cash_entries").update(payload).eq("id", f.id)
      : await supabase.from("cash_entries").insert(payload);
    setSaving(false);
    if (error) { setPwdErr(error.message); return; }
    setPwdOpen(false); setPwd(""); setForm(null); load();
  };
  const del = async (r) => {
    if (r.auto) return alert("这条是系统自动生成的，不能在这里删");
    if (!confirm(`删除这条记录？\n${r.entry_date} ${r.category} ¥${Number(r.amount_cny).toLocaleString()}`)) return;
    const { error } = await supabase.from("cash_entries").delete().eq("id", r.id);
    if (error) return alert(error.message);
    load();
  };

  const inp = { width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, padding: "7px 9px", fontSize: 12.5, outline: "none" };
  const lb = { display: "block", fontSize: 10.5, color: C.sub, marginBottom: 4 };
  const money = (n) => `¥${Number(n || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const card = (label, value, color, sub) => (
    <div style={{ flex: 1, minWidth: 150, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "13px 15px" }}>
      <div style={{ fontSize: 10.5, color: C.sub, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: color || C.ink, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>现金账</div>
        <span style={{ fontSize: 10.5, color: "#d9a441", border: "1px solid #5c4a1f", background: "#2a2113", borderRadius: 4, padding: "1px 6px" }}>仅你可见</span>
        <span style={{ fontSize: 11, color: C.faint }}>只算真金白银付出去的，不算平台余额扣减</span>
        <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.sub, cursor: "pointer", userSelect: "none" }}>
          <input type="checkbox" checked={inclFixed} onChange={e => setInclFixed(e.target.checked)} style={{ cursor: "pointer" }} />
          计入人工 / 场地
          <span style={{ fontSize: 10, color: C.faint }}>（固定支出，默认不含）</span>
        </label>
      </div>
      {err && <div style={{ margin: "10px 0", padding: "9px 12px", background: "#3a1d1d", border: "1px solid #6b2a2a", borderRadius: 8, color: "#f0a0a0", fontSize: 12 }}>{err}</div>}

      {/* 本月概览 */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0 14px" }}>
        {card("本月流出", money(mOut), "#e08a8a", inclFixed ? "含人工 / 场地" : "仅采购·物流·办公室·店铺")}
        {card("本月流入", money(mIn), "#4db6a4", "平台回款 + 手动")}
        {card("本月净额", money(mNet), mNet >= 0 ? "#4db6a4" : "#e08a8a", ym)}
        {card("年度累计流出", money(sumYear(inclFixed ? "total_out" : "core_out")), C.ink, `${yearFlows.length} 个月有记录`)}
      </div>

      {/* 月度现金流 */}
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "11px 15px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>月度现金流</span>
          <span style={{ fontSize: 10.5, color: C.faint }}>自动取自业务表 · 物流按批次去重</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "74px repeat(6, 1fr) 1fr 1fr", background: "#1f3a68", fontSize: 10.5, color: "#fff", fontWeight: 600 }}>
          {["月份", "采购", "物流", "办公室", "店铺其他", "人工", "场地", "合计流出", "净额"].map((h, i) => (
            <div key={h} style={{ padding: "8px", textAlign: i === 0 ? "left" : "right" }}>{h}</div>
          ))}
        </div>
        {loading ? (
          <div style={{ padding: 26, textAlign: "center", color: C.faint, fontSize: 12 }}>加载中…</div>
        ) : flows.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.faint, fontSize: 12 }}>还没有任何月度数据</div>
        ) : flows.map((f, i) => {
          const out = inclFixed ? num(f.total_out) : num(f.core_out);
          const net = num(f.total_in) - out;
          const isCur = f.period === ym;
          const fmt = (v) => num(v) ? num(v).toLocaleString("zh-CN", { maximumFractionDigits: 0 }) : "—";
          return (
            <div key={f.period} style={{ display: "grid", gridTemplateColumns: "74px repeat(6, 1fr) 1fr 1fr", fontSize: 11.5, background: isCur ? "#1d3a35" : (i % 2 ? "#1a2128" : "transparent"), borderTop: `1px solid ${C.line}`, alignItems: "center" }}>
              <div style={{ padding: "7px 8px", color: isCur ? "#4db6a4" : C.sub, fontWeight: isCur ? 700 : 400 }}>{f.period}</div>
              {[f.purchase, f.logistics, f.office, f.store_other, f.labor, f.site].map((v, j) => (
                <div key={j} style={{ padding: "7px 8px", textAlign: "right", color: (j >= 4 && !inclFixed) ? C.faint : C.ink }}>{fmt(v)}</div>
              ))}
              <div style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600, color: "#e08a8a" }}>{fmt(out)}</div>
              <div style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600, color: net >= 0 ? "#4db6a4" : "#e08a8a" }}>{fmt(net)}</div>
            </div>
          );
        })}
      </div>

      {/* 支付关卡 */}
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, marginBottom: 16 }}>
        <div onClick={() => setOpenGates(v => !v)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 15px", cursor: "pointer" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>支付关卡</span>
          <span style={{ fontSize: 10.5, color: C.faint }}>共 {CASH_GATES.length} 条现金流出路径 · 自动取自业务表，无需手工录</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.sub }}>{openGates ? "收起 ▲" : "展开 ▼"}</span>
        </div>
        {openGates && (
          <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 15px 14px" }}>
            <div style={{ fontSize: 10.5, color: "#4db6a4", fontWeight: 700, marginBottom: 7 }}>核心现金流出（你定的 4 类）</div>
            <div style={{ display: "grid", gridTemplateColumns: "96px 150px 1fr", gap: "6px 10px", fontSize: 11 }}>
              <div style={{ color: C.faint, fontWeight: 700 }}>科目</div>
              <div style={{ color: C.faint, fontWeight: 700 }}>数据来源表</div>
              <div style={{ color: C.faint, fontWeight: 700 }}>口径说明</div>
              {CASH_GATES.map(g => (
                <React.Fragment key={g.cat}>
                  <div style={{ color: C.ink, fontWeight: 600 }}>{g.cat}</div>
                  <div style={{ color: C.sub, fontFamily: "ui-monospace,monospace", fontSize: 10.5 }}>{g.tbl}</div>
                  <div style={{ color: C.faint }}>{g.note}</div>
                </React.Fragment>
              ))}
            </div>
            <div style={{ marginTop: 13 }}>
              <div style={{ fontSize: 10.5, color: C.sub, fontWeight: 700, marginBottom: 7 }}>固定支出（默认不计入，上方开关可打开）</div>
              <div style={{ display: "grid", gridTemplateColumns: "96px 150px 1fr", gap: "6px 10px", fontSize: 11 }}>
                {CASH_FIXED.map(g => (
                  <React.Fragment key={g.cat}>
                    <div style={{ color: C.ink, fontWeight: 600 }}>{g.cat}</div>
                    <div style={{ color: C.sub, fontFamily: "ui-monospace,monospace", fontSize: 10.5 }}>{g.tbl}</div>
                    <div style={{ color: C.faint }}>{g.note}</div>
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 13 }}>
              <div style={{ fontSize: 10.5, color: "#d9a441", fontWeight: 700, marginBottom: 7 }}>缺口（真实现金支出，但系统里还没有台账）</div>
              <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: "5px 10px", fontSize: 11 }}>
                {CASH_GAP.map(g => (
                  <React.Fragment key={g.cat}>
                    <div style={{ color: "#d9a441", fontWeight: 600 }}>{g.cat}</div>
                    <div style={{ color: C.faint }}>{g.note}</div>
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 700, marginBottom: 6 }}>不进现金账（亚马逊从卖家余额直接扣，不掏现金）</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {CASH_EXCLUDED.map(x => (
                  <span key={x} style={{ fontSize: 10.5, color: C.faint, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 4, padding: "2px 7px" }}>{x}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 流水 - 仅补录视图未覆盖的项 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>手动补录</span>
        <span style={{ fontSize: 10.5, color: C.faint }}>只补上面 4 类没覆盖的（如 VAT 实缴、平台年费），日常不需要在这里录</span>
        <button onClick={() => setForm(blank())} style={{ marginLeft: "auto", background: "#4db6a4", color: "#fff", border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ 记一笔</button>
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "92px 54px 1fr 130px 130px 1fr 54px", background: "#1f3a68", fontSize: 11, color: "#fff", fontWeight: 600 }}>
          {["日期", "方向", "科目", "金额", "单号", "备注 / 来源", ""].map((h, i) => (
            <div key={i} style={{ padding: "9px 10px", textAlign: [3].includes(i) ? "right" : "left" }}>{h}</div>
          ))}
        </div>
        {loading ? (
          <div style={{ padding: 26, textAlign: "center", color: C.faint, fontSize: 12 }}>加载中…</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.faint, fontSize: 12 }}>
            还没有现金流水 · 点右上「+ 记一笔」录第一条，或等系统从各业务表自动回填
          </div>
        ) : entries.map((r, i) => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "92px 54px 1fr 130px 130px 1fr 54px", fontSize: 12, background: i % 2 ? "#1a2128" : "transparent", borderTop: `1px solid ${C.line}`, alignItems: "center" }}>
            <div style={{ padding: "8px 10px", color: C.sub }}>{r.entry_date}</div>
            <div style={{ padding: "8px 10px" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: r.direction === "in" ? "#4db6a4" : "#e08a8a" }}>{r.direction === "in" ? "流入" : "流出"}</span>
            </div>
            <div style={{ padding: "8px 10px", color: C.ink }}>{r.category}</div>
            <div style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: r.direction === "in" ? "#4db6a4" : "#e08a8a" }}>
              {r.direction === "in" ? "+" : "−"}{Number(r.amount_cny || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ padding: "8px 10px", color: C.sub, fontFamily: "ui-monospace,monospace", fontSize: 10.5 }}>{r.ref_no || "—"}</div>
            <div style={{ padding: "8px 10px", color: C.faint, fontSize: 11 }}>
              {r.ref_note || "—"}
              {r.auto && <span style={{ marginLeft: 6, fontSize: 9.5, color: "#4db6a4", border: "1px solid #2d5f57", borderRadius: 3, padding: "0 4px" }}>自动</span>}
              {r.source_table && r.source_table !== "manual" && <span style={{ marginLeft: 6, fontSize: 9.5, color: C.faint }}>{r.source_table}</span>}
            </div>
            <div style={{ padding: "8px 10px", textAlign: "right" }}>
              {!r.auto && <span onClick={() => del(r)} style={{ cursor: "pointer", color: C.faint, fontSize: 11 }} title="删除">✕</span>}
            </div>
          </div>
        ))}
      </div>

      {/* 录入弹窗 */}
      {form && (
        <div onClick={() => setForm(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 14 }}>记一笔现金</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={lb}>日期 *</label><input type="date" value={form.entry_date} onChange={e => setF("entry_date", e.target.value)} style={inp} /></div>
              <div><label style={lb}>方向 *</label>
                <select value={form.direction} onChange={e => { const d = e.target.value; setForm(f => ({ ...f, direction: d, category: d === "in" ? CASH_IN_CATS[0] : CASH_OUT_CATS[0] })); }} style={inp}>
                  <option value="out">流出（花钱）</option>
                  <option value="in">流入（进钱）</option>
                </select>
              </div>
              <div><label style={lb}>科目 *</label>
                <select value={form.category} onChange={e => setF("category", e.target.value)} style={inp}>
                  {(form.direction === "in" ? CASH_IN_CATS : CASH_OUT_CATS).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><label style={lb}>金额（元）*</label><input type="number" step="0.01" value={form.amount_cny} onChange={e => setF("amount_cny", e.target.value)} placeholder="0.00" style={inp} /></div>
              <div><label style={lb}>单号 / 凭证</label><input value={form.ref_no} onChange={e => setF("ref_no", e.target.value)} placeholder="转账流水号、发票号" style={inp} /></div>
              <div><label style={lb}>备注</label><input value={form.ref_note} onChange={e => setF("ref_note", e.target.value)} placeholder="给谁、为什么" style={inp} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => setForm(null)} style={{ flex: 1, background: "transparent", border: `1px solid ${C.line}`, color: C.sub, borderRadius: 7, padding: "9px", fontSize: 12.5, cursor: "pointer" }}>取消</button>
              <button onClick={save} style={{ flex: 2, background: "#4db6a4", border: "none", color: "#fff", borderRadius: 7, padding: "9px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 密码确认 */}
      {pwdOpen && (
        <div onClick={() => setPwdOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 310 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 320, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>确认写入现金账</div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 14 }}>
              {form?.entry_date} · {form?.category} · ¥{form?.amount_cny}
            </div>
            <input type="password" value={pwd} onChange={e => { setPwd(e.target.value); setPwdErr(""); }} placeholder="输入密码" autoFocus
              onKeyDown={e => { if (e.key === "Enter") doSave(); }}
              style={{ ...inp, marginBottom: 8 }} />
            {pwdErr && <div style={{ fontSize: 11, color: "#e08a8a", marginBottom: 8 }}>{pwdErr}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => setPwdOpen(false)} style={{ flex: 1, background: "transparent", border: `1px solid ${C.line}`, color: C.sub, borderRadius: 7, padding: "8px", fontSize: 12, cursor: "pointer" }}>取消</button>
              <button onClick={doSave} disabled={saving} style={{ flex: 1, background: "#4db6a4", border: "none", color: "#fff", borderRadius: 7, padding: "8px", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "写入中…" : "确认"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OfficeExpense() {
  const cur = new Date();
  const YEARS = Array.from({ length: 6 }, (_, i) => cur.getFullYear() - 3 + i);
  const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const [ym, setYm] = useState(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
  const [list, setList] = useState([]);        // 当月明细 { key, id, date, item, amount }
  const [dirty, setDirty] = useState({});      // key -> true (有改动未提交)
  const [removed, setRemoved] = useState([]);  // 待删除的已有行 id
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [role, setRole] = useState(null);
  const [roleReady, setRoleReady] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const [saving, setSaving] = useState(false);
  const PWD = "852963";

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data && data.user) setRole(getUserRole(data.user.email || ""));
    }).catch(() => {}).finally(() => setRoleReady(true));
  }, []);
  const canEdit = role === "admin" || role === "cd_procurement";   // 登记只有黄丹(+admin兜底) — KK 2026-09-18 定

  const load = () => {
    const start = `${ym}-01`;
    const [yy, mm] = ym.split("-").map(Number);
    const end = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}-01`;
    supabase.from("office_expense").select("*").gte("exp_date", start).lt("exp_date", end).order("exp_date")
      .then(({ data, error }) => {
        if (error) { setErr(error.message); setList([]); }
        else {
          setErr("");
          setList((data || []).map(r => ({
            key: `id:${r.id}`, id: r.id, date: r.exp_date || "",
            region: r.region || "",
            item: r.item || "",
            amount: (r.amount === null || r.amount === undefined) ? "" : Number(r.amount),
          })));
        }
        setLoaded(true);
      });
  };
  useEffect(() => { setDirty({}); setRemoved([]); setList([]); setLoaded(false); load(); }, [ym]);

  const setField = (key, field, v) => {
    setList(p => p.map(r => (r.key === key ? { ...r, [field]: v } : r)));
    setDirty(p => ({ ...p, [key]: true }));
  };
  const addRow = () => {
    const today = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    const def = today.slice(0, 7) === ym ? today : `${ym}-01`;
    const key = `new:${Date.now()}`;
    setList(p => [...p, { key, id: null, date: def, region: "", item: "", amount: "" }]);
    setDirty(p => ({ ...p, [key]: true }));
  };
  const delRow = (r) => {
    if (r.id) setRemoved(p => [...p, r.id]);
    setList(p => p.filter(x => x.key !== r.key));
    setDirty(p => { const n = { ...p }; delete n[r.key]; return n; });
  };

  // 按「区域」归集: 中国块 → 法国块 → 未设置块 (KK 2026-09-19)
  const regionOf = (r) => (r.region === "中国" || r.region === "法国") ? r.region : "";
  const regionSum = (k) => list.filter(r => regionOf(r) === k).reduce((a, r) => a + Number(r.amount || 0), 0);
  const viewRows = (() => {
    const g = { "中国": [], "法国": [], "": [] };
    list.forEach(r => g[regionOf(r)].push(r));
    const out = [];
    let idx = 0;
    ["中国", "法国", ""].forEach(k => {
      const arr = g[k];
      if (!arr.length) return;
      out.push({ head: true, key: "head:" + k, label: k === "" ? "未设置区域" : k + "公司", count: arr.length, sum: arr.reduce((a, r) => a + Number(r.amount || 0), 0) });
      arr.forEach(r => out.push({ head: false, key: r.key, row: r, idx: ++idx }));
    });
    return out;
  })();

  const dirtyRows = list.filter(r => dirty[r.key]);
  const pendingUpd = dirtyRows.filter(r => r.id);
  const pendingNew = dirtyRows.filter(r => !r.id && (String(r.item).trim() !== "" || String(r.amount).trim() !== ""));
  const pendingCount = pendingUpd.length + pendingNew.length + removed.length;
  const totalSum = list.reduce((s, r) => s + Number(r.amount || 0), 0);

  const submitAll = () => {
    const all = [...pendingUpd, ...pendingNew];
    const bad = all.find(r => !r.date) || all.find(r => String(r.item).trim() === "") || all.find(r => String(r.amount).trim() !== "" && isNaN(Number(r.amount)));
    if (bad) {
      alert(!bad.date ? "有行的日期为空, 请补全" : String(bad.item).trim() === "" ? "有行的「项目明细」为空, 请补全" : "「费用」必须是数字");
      return;
    }
    setPwdOpen(true);
  };
  const discardAll = () => { setDirty({}); setRemoved([]); setPwdOpen(false); setPwd(""); setPwdErr(""); load(); };
  const confirmSubmit = async () => {
    if (pwd !== PWD) { setPwdErr("密码不正确"); return; }
    setSaving(true);
    let errMsg = "";
    if (removed.length) {
      const { error } = await supabase.from("office_expense").delete().in("id", removed);
      if (error) errMsg = error.message;
    }
    if (!errMsg) for (const r of pendingUpd) {
      const { error } = await saveRow({ exp_date: r.date, region: String(r.region || "").trim() || null, item: String(r.item).trim(), amount: Number(r.amount || 0) }, r.id);
      if (error) { errMsg = error.message; break; }
    }
    if (!errMsg) for (const r of pendingNew) {
      const { error } = await saveRow({ exp_date: r.date, region: String(r.region || "").trim() || null, item: String(r.item).trim(), amount: Number(r.amount || 0) }, null);
      if (error) { errMsg = error.message; break; }
    }
    setSaving(false); setPwdOpen(false); setPwd(""); setPwdErr("");
    if (errMsg) { alert("保存失败(请先在 Supabase 跑 sql/create_office_expense.sql): " + errMsg); return; }
    setDirty({}); setRemoved([]);
    load();
  };

  // 写单行: 若 region 列不存在(还没跑 sql/office_expense_region.sql), 自动剥掉 region 重试一次
  const saveRow = async (payload, id) => {
    let res = id ? await supabase.from("office_expense").update(payload).eq("id", id)
                 : await supabase.from("office_expense").insert(payload);
    if (res.error && /column|schema cache|does not exist/i.test(res.error.message || "")) {
      const rest = { ...payload }; delete rest.region;
      res = id ? await supabase.from("office_expense").update(rest).eq("id", id)
               : await supabase.from("office_expense").insert(rest);
      if (!res.error) console.warn("office_expense 缺 region 列, 本次跳过区域。请跑 sql/office_expense_region.sql");
    }
    return res;
  };

  const OEC_GRID = "56px 150px 92px minmax(300px, 1fr) 150px 70px";   // 区域列 KK 2026-09-19
  const th = { padding: "10px 12px", fontSize: 12, color: "#fff", fontWeight: 600, borderRight: "1px solid #2a4a78" };
  const cellInput = { width: "100%", padding: "6px 8px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, outline: "none", colorScheme: "dark" };
  const cellText = { padding: "10px 12px", fontSize: 12, color: C.ink, borderRight: `1px solid ${C.line}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>办公室费用明细</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            逐条明细 · 日期 / 区域(中国·法国) / 项目明细 / 费用(¥) · 每月独立 · {!canEdit ? "只读" : "改动改完点底部「确认提交」输密码入库"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {canEdit && (
            <button onClick={addRow} style={{ padding: "6px 14px", background: C.brand, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ 新增一行</button>
          )}
          <span style={{ fontSize: 11, color: C.faint }}>共 {list.length} 条</span>
          <span style={{ fontSize: 12, color: C.brand, fontWeight: 700, padding: "4px 12px", borderRadius: 6, background: C.panel2, border: `1px solid ${C.line}` }}>
            本月合计 ¥{totalSum.toFixed(2)}
          </span>
          <span style={{ fontSize: 11, color: C.sub, padding: "3px 10px", borderRadius: 6, background: C.panel, border: `1px solid ${C.line}` }} title="按「区域」列归集">
            中国公司 ¥{regionSum("中国").toFixed(2)} · 法国公司 ¥{regionSum("法国").toFixed(2)}
            {regionSum("") > 0 ? ` · 未设置 ¥${regionSum("").toFixed(2)}` : ""}
          </span>
          <span style={{ fontSize: 12, color: C.sub }}>月份:</span>
          <select value={ym.slice(0, 4)} onChange={e => { setYm(`${e.target.value}-${ym.slice(5, 7)}`); }}
            style={{ padding: "6px 12px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 12 }}>
            {YEARS.map(y => <option key={y} value={String(y)}>{y}年</option>)}
          </select>
          <select value={ym.slice(5, 7)} onChange={e => { setYm(`${ym.slice(0, 4)}-${e.target.value}`); }}
            style={{ padding: "6px 12px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 12 }}>
            {MONTHS.map(m => <option key={m} value={m}>{Number(m)}月</option>)}
          </select>
        </div>
      </div>

      {err && (
        <div style={{ background: "#c05b5222", border: "1px solid #c05b52", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#c05b52" }}>
          读取失败(请先在 Supabase 跑 sql/create_office_expense.sql): {err}
        </div>
      )}

      {(!loaded || !roleReady) && <div style={{ padding: 30, textAlign: "center", color: C.faint }}>加载中…</div>}

      {loaded && roleReady && (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "auto" }}>
          <div style={{ minWidth: 900 }}>
            <div style={{ display: "grid", gridTemplateColumns: OEC_GRID, background: "#1f3a68" }}>
              <div style={{ ...th, textAlign: "center" }}>#</div>
              <div style={th}>日期</div>
              <div style={th}>区域</div>
              <div style={th}>项目明细</div>
              <div style={{ ...th, textAlign: "right" }}>{ym} · 费用 ¥</div>
              <div style={{ ...th, borderRight: "none", textAlign: "center" }}>操作</div>
            </div>

            {viewRows.map((item) => {
              if (item.head) {
                return (
                  <div key={item.key} style={{ display: "grid", gridTemplateColumns: OEC_GRID, background: C.panel2, borderTop: `1px solid ${C.line}` }}>
                    <div style={{ gridColumn: "1 / -1", padding: "6px 12px", fontSize: 11, display: "flex", alignItems: "center", gap: 10, color: item.label === "未设置区域" ? C.faint : C.ink }}>
                      <b>{item.label}</b>
                      <span style={{ color: C.sub }}>{item.count} 条</span>
                      <span style={{ marginLeft: "auto", color: C.brand, fontWeight: 700 }}>小计 ¥{item.sum.toFixed(2)}</span>
                    </div>
                  </div>
                );
              }
              const r = item.row, i = item.idx - 1;
              const pend = !!dirty[r.key];
              const bgc = pend ? "#d9a44118" : (i % 2 ? C.bg : "transparent");
              return (
                <div key={r.key} style={{ display: "grid", gridTemplateColumns: OEC_GRID, borderTop: `1px solid ${C.line}`, background: bgc }}>
                  <div style={{ padding: "10px 8px", fontSize: 11, color: C.faint, textAlign: "center", borderRight: `1px solid ${C.line}` }}>{i + 1}</div>
                  {canEdit ? (
                    <>
                      <div style={{ padding: "4px 8px", borderRight: `1px solid ${C.line}` }}>
                        <input type="date" value={r.date} onChange={e => setField(r.key, "date", e.target.value)} style={cellInput} />
                      </div>
                        <div style={{ padding: "4px 8px", borderRight: `1px solid ${C.line}` }}>
                          <select value={r.region || ""} onChange={e => setField(r.key, "region", e.target.value)}
                            title="区域: 中国 / 法国" style={cellInput}>
                            <option value="">—</option>
                            <option value="中国">中国</option>
                            <option value="法国">法国</option>
                          </select>
                        </div>
                      <div style={{ padding: "4px 8px", borderRight: `1px solid ${C.line}` }}>
                        <input value={r.item} onChange={e => setField(r.key, "item", e.target.value)} placeholder="费用项目 / 明细说明"
                          title={r.item} style={cellInput} />
                      </div>
                      <div style={{ padding: "4px 8px", borderRight: `1px solid ${C.line}` }}>
                        <input value={r.amount} onChange={e => setField(r.key, "amount", e.target.value)} onFocus={e => e.target.select()}
                          placeholder="0.00" inputMode="decimal" title="人民币金额 (¥)"
                          style={{ ...cellInput, textAlign: "right", fontWeight: 600 }} />
                      </div>
                      <div style={{ padding: "4px 8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <button onClick={() => delRow(r)} title="删除此行 (提交后生效)"
                          style={{ padding: "4px 10px", background: "transparent", color: "#e0857a", border: "1px solid #c05b52", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>删除</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={cellText}>{r.date || "—"}</div>
                      <div style={{ ...cellText, color: r.region ? C.ink : C.faint }}>{r.region || "—"}</div>
                      <div style={{ ...cellText, color: r.item ? C.ink : C.faint }} title={r.item}>{r.item || "—"}</div>
                      <div style={{ ...cellText, textAlign: "right", fontWeight: 600, color: r.amount === "" ? C.faint : C.ink }}>{r.amount === "" ? "—" : Number(r.amount).toFixed(2)}</div>
                      <div style={{ padding: "10px 8px", fontSize: 11, color: C.faint, textAlign: "center" }}>—</div>
                    </>
                  )}
                </div>
              );
            })}

            {list.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: C.faint, fontSize: 13, borderTop: `1px solid ${C.line}` }}>
                {ym} 暂无办公室费用明细{canEdit ? "，点右上「+ 新增一行」开始录入" : ""}
              </div>
            )}

            {list.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: OEC_GRID, borderTop: `2px solid ${C.line}`, background: C.bg, fontSize: 12, fontWeight: 700 }}>
                <div style={{ padding: "10px 8px" }} />
                <div style={{ padding: "10px 12px", color: C.brand }}>合计</div>
                <div style={{ padding: "10px 12px" }} />
                <div style={{ padding: "10px 12px", color: C.faint, fontWeight: 400 }}>{ym} 共 {list.length} 条明细</div>
                <div style={{ padding: "10px 12px", textAlign: "right", color: C.brand }}>¥{totalSum.toFixed(2)}</div>
                <div style={{ padding: "10px 8px" }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 待提交浮条: 改动只缓存在页面, 点确认提交才输密码一次性入库 */}
      {pendingCount > 0 && !pwdOpen && (
        <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 26, zIndex: 110, background: C.panel, border: "1px solid #d9a441", boxShadow: "0 10px 30px rgba(0,0,0,.28)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 12, color: C.ink }}>
            本次已改 <b style={{ color: C.brand, fontSize: 14 }}>{pendingCount}</b> 项 · 尚未入库, 点右侧确认提交(需密码)
          </span>
          <button onClick={discardAll} style={{ padding: "6px 12px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 12, cursor: "pointer" }}>撤销全部</button>
          <button onClick={submitAll} style={{ padding: "6px 16px", background: C.brand, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>确认提交</button>
        </div>
      )}

      {/* 提交确认框: 列出全部改动 + 输密码 852963 */}
      {pwdOpen && (
        <div onClick={() => { setPwdOpen(false); setPwd(""); setPwdErr(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, width: 520, maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>确认提交 {pendingCount} 项改动</div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 14 }}>核对无误后输入密码, 一次性写入数据库</div>
            <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 14 }}>
              <div style={{ display: "flex", color: C.sub, fontSize: 11, paddingBottom: 6, borderBottom: `1px solid ${C.line}` }}>
                <span style={{ width: 52 }}>动作</span>
                <span style={{ width: 92 }}>日期</span>
                <span style={{ flex: 1 }}>项目明细</span>
                <span style={{ width: 110, textAlign: "right" }}>费用</span>
              </div>
              {removed.map(id => (
                <div key={`del-${id}`} style={{ display: "flex", padding: "5px 0", borderBottom: `1px solid ${C.line}`, color: "#e0857a" }}>
                  <span style={{ width: 52 }}>删除</span>
                  <span style={{ width: 92 }}>—</span>
                  <span style={{ flex: 1 }}>已删除的一行</span>
                  <span style={{ width: 110, textAlign: "right" }}>→ 移除</span>
                </div>
              ))}
              {[...pendingUpd, ...pendingNew].map(r => (
                <div key={r.key} style={{ display: "flex", padding: "5px 0", borderBottom: `1px solid ${C.line}` }}>
                  <span style={{ width: 52, color: r.id ? C.sub : C.brand }}>{r.id ? "修改" : "新增"}</span>
                  <span style={{ width: 92, color: C.ink }}>{r.date || "—"}</span>
                  <span style={{ flex: 1, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.item}>{r.item}</span>
                  <span style={{ width: 110, textAlign: "right", color: C.brand, fontWeight: 700 }}>¥{Number(r.amount || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>确认密码</div>
            <input type="password" value={pwd} autoFocus
              onChange={e => { setPwd(e.target.value); setPwdErr(""); }}
              onKeyDown={e => { if (e.key === "Enter" && !saving) confirmSubmit(); if (e.key === "Escape") { setPwdOpen(false); setPwd(""); setPwdErr(""); } }}
              placeholder="输入密码"
              style={{ width: "100%", padding: "9px 12px", background: C.bg, border: `1px solid ${pwdErr ? "#c05b52" : C.line}`, borderRadius: 6, color: C.ink, fontSize: 14, marginBottom: 6 }} />
            {pwdErr && <div style={{ fontSize: 11, color: "#c05b52", marginBottom: 6 }}>{pwdErr}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => { setPwdOpen(false); setPwd(""); setPwdErr(""); }} style={{ flex: 1, padding: "9px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>返回继续改</button>
              <button onClick={confirmSubmit} disabled={saving} style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: saving ? "wait" : "pointer", fontWeight: 600, opacity: saving ? .7 : 1 }}>{saving ? "提交中…" : "确认提交"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- 店铺其他费用 (KK 2026-09-17: 参照办公室费用明细格式 + 头部 6 店筛选栏) ----------------
// 表 store_other_expense (sql/create_store_other_expense.sql)
// 列: 日期 / 店铺 / 项目明细 / 费用(¥) · 每月一张明细表(顶部选月份) · 头部「分店」栏按 6 家店筛选分类
// 录入规则与办公室费用一致: 改动只进待提交队列 → 底部「确认提交」→ 输密码 → 一次性入库
// 权限: 可见 + 可写 = admin + 法国成员(fr) + 成都采购(黄丹, cd_procurement)
// ---------------- 采购管理 (purchase_*) — 2026-11-19 ----------------
// 链路: 供应商台账 → 采购单 → 付款流水 → 发货批次(货件号与 shipments 对齐)
// 付款状态用视图 pay_status_calc (由付款流水实时汇总); 收货状态是生成列, 不可手填
// 权限与 RLS 对齐: 采购单 admin/fr/黄丹/雪梅 · 付款 admin/fr/黄丹/夏蕾 · 批次 +诗琪 · 供应商 admin/fr/黄丹
const PUR_PAY_LABEL = { unpaid: "未付", partial: "部分付", paid: "已付清" };
const PUR_PAY_TONE = { unpaid: C.drop, partial: C.watch, paid: C.brand };
const PUR_RECV_LABEL = { pending: "未到货", partial: "部分到", received: "已收齐", diff: "有差异" };
const PUR_RECV_TONE = { pending: C.faint, partial: C.watch, received: C.brand, diff: C.drop };
const PUR_SUP_LABEL = { pending: "待审核", active: "合作中", disabled: "停用" };
const PUR_SUP_TONE = { pending: C.watch, active: C.brand, disabled: C.faint };
const PUR_CURRENCIES = ["CNY", "EUR", "USD", "PLN"];
const purNum = (v) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const purMoney = (v) => (v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function Purchase() {
  const d0 = new Date();
  const TODAY = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, "0")}-${String(d0.getDate()).padStart(2, "0")}`;
  const PWD = "852963";

  // ---- 角色 ----
  const [role, setRole] = useState(null);
  const [meEmail, setMeEmail] = useState("");
  const [roleReady, setRoleReady] = useState(false);
  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data }) => {
        if (data && data.user) {
          setRole(getUserRole(data.user.email || ""));
          setMeEmail(data.user.email || "");
        }
      })
      .catch(() => {})
      .finally(() => setRoleReady(true));
  }, []);
  // 采购三段式分工（2026-11-19 KK 定）：
  //   ① 程诗琪 cd_promotion  提采购需求（不填价）
  //   ② 陈雪梅 cd_supplier   下单（选供应商/定价/出单号/发货批次）
  //   ③ 夏蕾   finance       付款登记
  //   黄丹 cd_procurement 不进采购业务流程，只读
  const canPO = ["admin", "fr", "cd_promotion", "cd_supplier"].includes(role);
  const canPay = ["admin", "fr", "finance"].includes(role);
  const canBat = ["admin", "fr", "cd_supplier", "warehouse"].includes(role);  // 仓储可录入库批次
  const canSup = ["admin", "fr", "cd_supplier"].includes(role);
  const canDel = role === "admin" || role === "fr";
  const isRequester = role === "cd_promotion";   // 只提需求，价格/供应商一律不碰

  // ---- 数据 ----
  const [sub, setSub] = useState("po");          // po | supplier | price
  const [rows, setRows] = useState([]);          // v_purchase_overview
  const [supList, setSupList] = useState([]);    // purchase_suppliers
  const [priceList, setPriceList] = useState([]);// v_price_stats
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [storeF, setStoreF] = useState("");
  const [payF, setPayF] = useState("");
  const [recvF, setRecvF] = useState("");
  const [kw, setKw] = useState("");

  const [openId, setOpenId] = useState(null);
  const [pays, setPays] = useState({});
  const [bats, setBats] = useState({});

  const [form, setForm] = useState(null);        // 采购单弹窗
  const [supForm, setSupForm] = useState(null);  // 供应商弹窗
  const [payDraft, setPayDraft] = useState(null);
  const [batDraft, setBatDraft] = useState(null);

  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const [pwdTip, setPwdTip] = useState("");
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);

  const askPwd = (fn, tip) => { setPending({ fn }); setPwdTip(tip || "确认写入采购数据"); setPwd(""); setPwdErr(""); setPwdOpen(true); };
  const runPending = async () => {
    if (pwd !== PWD) { setPwdErr("密码不正确"); return; }
    const fn = pending && pending.fn;
    setSaving(true);
    try {
      if (fn) await fn();
      setPwdOpen(false); setPwd(""); setPwdErr(""); setPending(null);
    } catch (e) {
      setPwdErr("保存失败: " + String(e && e.message ? e.message : e));
    } finally { setSaving(false); }
  };

  const load = async () => {
    setLoading(true); setErr("");
    const [poR, supR] = await Promise.all([
      supabase.from("v_purchase_overview").select("*").order("order_date", { ascending: false, nullsFirst: false }).limit(1000),
      supabase.from("purchase_suppliers").select("*").order("name"),
    ]);
    if (poR.error) setErr(poR.error.message); else setRows(poR.data || []);
    if (!supR.error) setSupList(supR.data || []);
    else if (!poR.error) setErr(supR.error.message);
    setLoading(false);
  };
  useEffect(() => { if (roleReady) load(); }, [roleReady]);

  useEffect(() => {
    if (sub !== "price" || priceList.length) return;
    supabase.from("v_price_stats").select("*").order("times", { ascending: false }).limit(500)
      .then(({ data, error }) => { if (error) setErr(error.message); else setPriceList(data || []); });
  }, [sub]);

  const toggle = async (id) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!pays[id]) {
      const { data } = await supabase.from("purchase_payments").select("*").eq("purchase_id", id).order("pay_date");
      setPays(p => ({ ...p, [id]: data || [] }));
    }
    if (!bats[id]) {
      const { data } = await supabase.from("purchase_batches").select("*").eq("purchase_id", id).order("ship_date");
      setBats(p => ({ ...p, [id]: data || [] }));
    }
  };

  // ---- 采购单表单 ----
  const blankPO = () => ({
    id: null, po_no: "", order_date: TODAY, store: "", supplier: "", supplier_id: "",
    product_name: "", sku: "", asin: "", qty: "", unit_price: "", goods_amount: "",
    freight: "", tax_amount: "", total_amount: "", currency: "CNY",
    pay_terms: "", arrive_date: "", tracking_no: "", note: "",
  });
  const editPO = (r) => setForm({
    id: r.id, po_no: r.po_no || "", order_date: r.order_date || TODAY, store: r.store || "",
    supplier: r.supplier || "", supplier_id: r.supplier_id || "",
    product_name: r.product_name || "", sku: r.sku || "", asin: r.asin || "",
    qty: r.qty ?? "", unit_price: r.unit_price ?? "", goods_amount: r.goods_amount ?? "",
    freight: r.freight ?? "", tax_amount: r.tax_amount ?? "", total_amount: r.total_amount ?? "",
    currency: r.currency || "CNY", pay_terms: r.pay_terms || "",
    arrive_date: r.arrive_date || "", tracking_no: r.tracking_no || "", note: r.note || "",
  });
  const setF = (k, v) => setForm(f => {
    const n = { ...f, [k]: v };
    if (["qty", "unit_price", "freight", "tax_amount"].includes(k)) {
      const q = Number(n.qty) || 0, u = Number(n.unit_price) || 0;
      const goods = q > 0 && u >= 0 && String(n.qty) !== "" && String(n.unit_price) !== "" ? +(q * u).toFixed(2) : n.goods_amount;
      n.goods_amount = goods;
      n.total_amount = goods === "" || goods === null ? n.total_amount
        : +(Number(goods) + Number(n.freight || 0) + Number(n.tax_amount || 0)).toFixed(2);
    }
    return n;
  });

  const submitPO = () => {
    const f = form;
    if (!f.order_date) return alert(isRequester ? "请填需求日期" : "请填采购日期");
    if (!String(f.product_name).trim()) return alert("请填产品名称");
    if (!f.qty || Number(f.qty) <= 0) return alert("数量必须大于 0");
    // 需求方（cd_promotion）只写「要什么 / 要多少 / 哪个店」，
    // 价格类字段一律不进 payload —— insert 走默认 null，update 不覆盖雪梅已填的价
    const payload = isRequester ? {
      order_date: f.order_date,
      store: f.store || null,
      product_name: String(f.product_name).trim(),
      sku: f.sku || null,
      asin: f.asin || null,
      qty: Number(f.qty),
      arrive_date: f.arrive_date || null,
      note: f.note || null,
      requested_by: meEmail || null,
    } : {
      po_no: f.po_no ? String(f.po_no).trim() : null,
      order_date: f.order_date,
      store: f.store || null,
      supplier: f.supplier || null,
      supplier_id: f.supplier_id || null,
      product_name: String(f.product_name).trim(),
      sku: f.sku || null, asin: f.asin || null,
      qty: Number(f.qty),
      unit_price: purNum(f.unit_price), goods_amount: purNum(f.goods_amount),
      freight: purNum(f.freight), tax_amount: purNum(f.tax_amount), total_amount: purNum(f.total_amount),
      currency: f.currency || "CNY",
      pay_terms: f.pay_terms || null, arrive_date: f.arrive_date || null,
      tracking_no: f.tracking_no || null, note: f.note || null,
      requested_by: f.requested_by || meEmail || null,
    };
    askPwd(async () => {
      const { error } = f.id
        ? await supabase.from("purchase_records").update(payload).eq("id", f.id)
        : await supabase.from("purchase_records").insert(payload);
      if (error) throw error;
      setForm(null); await load();
    }, f.id ? "修改采购单" : (isRequester ? "提交采购需求" : "新增采购单"));
  };

  const deletePO = (r) => {
    if (!confirm(`删除采购单「${r.po_no || r.product_name}」？\n有付款流水或发货批次的单会被数据库拦住。`)) return;
    askPwd(async () => {
      const { error } = await supabase.from("purchase_records").delete().eq("id", r.id);
      if (error) throw new Error(error.message + "（请先删除该单的付款流水与发货批次）");
      await load();
    }, "删除采购单");
  };

  // ---- 付款 / 批次 ----
  const submitPay = () => {
    const d = payDraft;
    if (!d.pay_date) return alert("请填付款日期");
    if (!d.amount || Number(d.amount) <= 0) return alert("付款金额必须大于 0");
    askPwd(async () => {
      const { error } = await supabase.from("purchase_payments").insert({
        purchase_id: d.purchase_id, pay_date: d.pay_date, amount: Number(d.amount),
        channel: d.channel || null, payee: d.payee || null, note: d.note || null,
        operator: meEmail || null,
      });
      if (error) throw error;
      setPayDraft(null);
      const { data } = await supabase.from("purchase_payments").select("*").eq("purchase_id", d.purchase_id).order("pay_date");
      setPays(p => ({ ...p, [d.purchase_id]: data || [] }));
      await load();
    }, "登记付款");
  };
  const submitBat = () => {
    const d = batDraft;
    if (!String(d.ship_batch || "").trim()) return alert("请填货件号 / 批次号");
    if (!d.qty || Number(d.qty) <= 0) return alert("数量必须大于 0");
    askPwd(async () => {
      const { error } = await supabase.from("purchase_batches").insert({
        purchase_id: d.purchase_id, ship_batch: String(d.ship_batch).trim(), qty: Number(d.qty),
        store: d.store || null, ship_date: d.ship_date || null, tracking_no: d.tracking_no || null, note: d.note || null,
      });
      if (error) throw error;
      setBatDraft(null);
      const { data } = await supabase.from("purchase_batches").select("*").eq("purchase_id", d.purchase_id).order("ship_date");
      setBats(p => ({ ...p, [d.purchase_id]: data || [] }));
      await load();
    }, "关联发货批次");
  };
  const delPay = (pid, id) => {
    if (!confirm("删除这笔付款记录？")) return;
    askPwd(async () => {
      const { error } = await supabase.from("purchase_payments").delete().eq("id", id);
      if (error) throw error;
      const { data } = await supabase.from("purchase_payments").select("*").eq("purchase_id", pid).order("pay_date");
      setPays(p => ({ ...p, [pid]: data || [] }));
      await load();
    }, "删除付款记录");
  };
  const delBat = (pid, id) => {
    if (!confirm("删除这个发货批次关联？")) return;
    askPwd(async () => {
      const { error } = await supabase.from("purchase_batches").delete().eq("id", id);
      if (error) throw error;
      const { data } = await supabase.from("purchase_batches").select("*").eq("purchase_id", pid).order("ship_date");
      setBats(p => ({ ...p, [pid]: data || [] }));
      await load();
    }, "删除批次关联");
  };

  // ---- 供应商 ----
  // 供应商录入即生效 (KK 2026-11-20 定): 不再需要 admin 审核, 新建默认「合作中」
  const blankSup = () => ({ id: null, name: "", contact: "", phone: "", category: "", status: "active", pay_channel: "", account_name: "", account_no: "", bank: "", source: "", note: "" });
  const submitSup = () => {
    const f = supForm;
    if (!String(f.name || "").trim()) return alert("请填供应商名称");
    askPwd(async () => {
      if (f.id) {
        const { error } = await supabase.from("purchase_suppliers").update({
          name: String(f.name).trim(), contact: f.contact || null, phone: f.phone || null,
          category: f.category || null, status: f.status, pay_channel: f.pay_channel || null,
          account_name: f.account_name || null, account_no: f.account_no || null,
          bank: f.bank || null, source: f.source || null, note: f.note || null, updated_at: new Date().toISOString(),
        }).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("purchase_suppliers").insert({
          name: String(f.name).trim(), contact: f.contact || null, phone: f.phone || null,
          category: f.category || null, status: f.status, pay_channel: f.pay_channel || null,
          account_name: f.account_name || null, account_no: f.account_no || null,
          bank: f.bank || null, source: f.source || null, note: f.note || null,
        });
        if (error) throw error;
      }
      setSupForm(null); await load();
    }, f.id ? "修改供应商" : "新增供应商");
  };

  // ---- 筛选与统计 ----
  const view = rows.filter(r => {
    if (storeF && r.store !== storeF) return false;
    if (payF && (r.pay_status_calc || "unpaid") !== payF) return false;
    if (recvF && (r.receive_status || "pending") !== recvF) return false;
    if (kw) {
      const s = `${r.po_no || ""} ${r.product_name || ""} ${r.sku || ""} ${r.asin || ""} ${r.supplier || ""}`.toLowerCase();
      if (!s.includes(kw.toLowerCase())) return false;
    }
    return true;
  });
  const sumTotal = view.reduce((a, r) => a + Number(r.total_amount || 0), 0);
  const sumPaid = view.reduce((a, r) => a + Number(r.pay_sum || 0), 0);
  const sumQty = view.reduce((a, r) => a + Number(r.qty || 0), 0);
  const sumRecv = view.reduce((a, r) => a + Number(r.received_qty || 0), 0);
  // 需求已提、但雪梅还没下单（无供应商 / 无单价 / 无采购单号）
  const isOrdered = (r) => !!(r.supplier_id || r.supplier || r.po_no || Number(r.unit_price || 0) > 0);
  const underOrder = view.filter(r => !isOrdered(r)).length;
  // 需求方在「雪梅下单前」看不到任何金额，下单后才开放成本（KK 定的后段可见）
  const hideCost = (r) => isRequester && !isOrdered(r);

  // ---- 样式 ----
  const GRID = "34px 132px 96px 84px 122px minmax(200px, 1fr) 62px 86px 102px 116px 96px 56px 84px";
  const th = { padding: "9px 10px", fontSize: 11.5, color: "#fff", fontWeight: 600, borderRight: "1px solid #2a4a78", whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", fontSize: 12, color: C.ink, borderRight: `1px solid ${C.line}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  const inp = { width: "100%", padding: "6px 8px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, outline: "none", colorScheme: "dark" };
  const lb = { fontSize: 11, color: C.sub, marginBottom: 4, display: "block" };
  const btn = (bg, fg) => ({ padding: "6px 14px", background: bg, color: fg, border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" });
  const btnO = { padding: "5px 12px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 11.5, cursor: "pointer" };
  const card = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 14px" };
  const tag = (c) => ({ fontSize: 11, fontWeight: 700, color: c, background: c + "1f", border: `1px solid ${c}55`, borderRadius: 5, padding: "1px 7px", whiteSpace: "nowrap" });
  const modalBg = { position: "fixed", inset: 0, background: "#000a", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", zIndex: 90, overflow: "auto" };
  const modal = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, width: 860, maxWidth: "100%" };
  const storeOpts = (role && ROLE_STORES[role]) || OPS_FIXED_STORES;

  const subBtn = (k, l) => (
    <div onClick={() => setSub(k)} className="tab"
      style={{ background: sub === k ? C.panel2 : "transparent", border: `1px solid ${sub === k ? C.line : "transparent"}`, color: sub === k ? C.ink : C.sub, fontSize: 12, padding: "5px 12px" }}>
      {l}
    </div>
  );

  return (
    <div>
      {/* 头部 */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>采购管理</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            供应商台账 → 采购单 → 付款流水 → 发货批次 · 付款状态按流水实时汇总 · 收货状态由数量自动判定
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {subBtn("po", "采购单")}
          {/* 仓储管理只看入库, 隐藏供应商台账与价格基线 — 2026-11-23 */}
          {role !== "warehouse" && subBtn("supplier", "供应商台账")}
          {role !== "warehouse" && subBtn("price", "价格基线")}
          <span style={{ fontSize: 11, color: C.faint, marginLeft: 6 }}>
            {roleReady ? (sub === "po" ? (canPO ? (isRequester ? "可提需求" : "可录入") : canBat ? "可录入库批次" : "只读") : sub === "supplier" ? (canSup ? "可维护" : "只读") : "只读") : "…"}
          </span>
        </div>
      </div>

      {err && (
        <div style={{ background: "#c05b5222", border: "1px solid #c05b52", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#c05b52" }}>
          读取失败: {err}
        </div>
      )}

      {/* ============ 采购单 ============ */}
      {sub === "po" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            {canPO && <button onClick={() => setForm(blankPO())} style={btn(C.brand, "#fff")}>+ {isRequester ? "提采购需求" : "新建采购单"}</button>}
            <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜单号 / 产品 / SKU / ASIN / 供应商"
              style={{ ...inp, width: 260 }} />
            <select value={storeF} onChange={e => setStoreF(e.target.value)} style={{ ...inp, width: 110 }}>
              <option value="">全部店铺</option>
              {storeOpts.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={payF} onChange={e => setPayF(e.target.value)} style={{ ...inp, width: 110 }}>
              <option value="">全部付款</option>
              {Object.entries(PUR_PAY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={recvF} onChange={e => setRecvF(e.target.value)} style={{ ...inp, width: 110 }}>
              <option value="">全部收货</option>
              {Object.entries(PUR_RECV_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={() => { setKw(""); setStoreF(""); setPayF(""); setRecvF(""); }} style={btnO}>清空筛选</button>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {[
              ["采购单", `${view.length} 单`, C.ink],
              ["采购总额", `¥${purMoney(sumTotal)}`, C.ink],
              ["已付", `¥${purMoney(sumPaid)}`, C.brand],
              ["未付余额", `¥${purMoney(sumTotal - sumPaid)}`, sumTotal - sumPaid > 0 ? C.drop : C.faint],
              ["件数", `${sumQty} 件`, C.sub],
              ["已收", `${sumRecv} / ${sumQty}`, sumRecv < sumQty ? C.watch : C.brand],
              ["待下单", `${underOrder} 单`, underOrder > 0 ? C.watch : C.brand],
            ].map(([l, v, c]) => (
              <div key={l} style={{ ...card, padding: "7px 14px", minWidth: 104 }}>
                <div style={{ fontSize: 10.5, color: C.faint }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: c, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>

          {(loading || !roleReady) && <div style={{ padding: 30, textAlign: "center", color: C.faint }}>加载中…</div>}

          {!loading && roleReady && (
            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "auto" }}>
              <div style={{ minWidth: 1420 }}>
                <div style={{ display: "grid", gridTemplateColumns: GRID, background: "#1f3a68" }}>
                  <div style={{ ...th, textAlign: "center" }} />
                  <div style={th}>采购单号</div>
                  <div style={th}>采购日期</div>
                  <div style={th}>店铺</div>
                  <div style={th}>供应商</div>
                  <div style={th}>产品 / SKU</div>
                  <div style={{ ...th, textAlign: "right" }}>数量</div>
                  <div style={{ ...th, textAlign: "right" }}>单价</div>
                  <div style={{ ...th, textAlign: "right" }}>总额 ¥</div>
                  <div style={{ ...th, textAlign: "right" }}>已付 / 状态</div>
                  <div style={{ ...th, textAlign: "center" }}>收货</div>
                  <div style={{ ...th, textAlign: "center" }}>批次</div>
                  <div style={{ ...th, textAlign: "center", borderRight: "none" }}>操作</div>
                </div>

                {view.length === 0 && (
                  <div style={{ padding: "34px 20px", textAlign: "center", color: C.faint, fontSize: 12 }}>
                    还没有采购单{canPO ? ` · 点左上「+ ${isRequester ? "提采购需求" : "新建采购单"}」录入第一单` : ""}
                  </div>
                )}

                {view.map((r, i) => {
                  const pst = r.pay_status_calc || "unpaid";
                  const rst = r.receive_status || "pending";
                  const open = openId === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <div onClick={() => toggle(r.id)} className="prow"
                        style={{ display: "grid", gridTemplateColumns: GRID, borderTop: `1px solid ${C.line}`, background: open ? C.panel2 : (i % 2 ? C.bg : "transparent") }}>
                        <div style={{ ...td, textAlign: "center", color: C.faint, fontSize: 10 }}>{open ? "▾" : "▸"}</div>
                        <div style={{ ...td, color: C.brand, fontWeight: 600 }}>{r.po_no || "—"}</div>
                        <div style={{ ...td, color: C.sub }}>{r.order_date || "—"}</div>
                        <div style={{ ...td, color: C.sub }}>{r.store || "—"}</div>
                        <div style={{ ...td, color: C.sub }}>
                          {isOrdered(r) ? (r.supplier || "—")
                            : <span style={{ color: C.watch, fontSize: 11, fontWeight: 600 }}>待下单</span>}
                        </div>
                        <div style={{ ...td }}>
                          {r.product_name || "—"}
                          {r.sku ? <span style={{ color: C.faint, marginLeft: 6, fontSize: 11 }}>{r.sku}</span> : null}
                        </div>
                        <div style={{ ...td, textAlign: "right" }}>{r.qty ?? "—"}</div>
                        <div style={{ ...td, textAlign: "right", color: C.sub }}>
                          {hideCost(r) ? <span style={{ color: C.faint }}>—</span> : (<>
                            {purMoney(r.unit_price)}
                            {r.unit_cost != null && (
                              <div style={{ fontSize: 10, color: C.brand, marginTop: 1 }}>到仓 {purMoney(r.unit_cost)}</div>
                            )}
                          </>)}
                        </div>
                        <div style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                          {hideCost(r) ? <span style={{ color: C.faint }}>—</span> : purMoney(r.total_amount)}
                        </div>
                        <div style={{ ...td, textAlign: "right" }}>
                          <div style={{ fontSize: 11.5 }}>{purMoney(r.pay_sum)}</div>
                          <div style={{ marginTop: 2 }}><span style={tag(PUR_PAY_TONE[pst])}>{PUR_PAY_LABEL[pst] || pst}</span></div>
                        </div>
                        <div style={{ ...td, textAlign: "center" }}>
                          <span style={tag(PUR_RECV_TONE[rst])}>{PUR_RECV_LABEL[rst] || rst}</span>
                          <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>{r.received_qty ?? 0}/{r.qty ?? 0}{Number(r.damaged_qty) > 0 ? ` · 破损${r.damaged_qty}` : ""}</div>
                        </div>
                        <div style={{ ...td, textAlign: "center", color: r.batch_cnt ? C.ink : C.faint }}>{r.batch_cnt || 0}</div>
                        <div style={{ ...td, textAlign: "center", borderRight: "none" }} onClick={e => e.stopPropagation()}>
                          {canPO && <button onClick={() => editPO(r)} style={{ ...btnO, padding: "3px 8px" }}>改</button>}
                          {canDel && <button onClick={() => deletePO(r)} style={{ ...btnO, padding: "3px 8px", marginLeft: 4, color: C.drop, borderColor: C.drop + "66" }}>删</button>}
                          {!canPO && !canDel && <span style={{ fontSize: 11, color: C.faint }}>—</span>}
                        </div>
                      </div>

                      {open && (
                        <div style={{ borderTop: `1px solid ${C.line}`, background: "#12181d", padding: "12px 16px 16px" }}>
                          {/* 到深圳仓成本拆解（口径：货款+运费+税费 ÷ 数量，不含头程/佣金/包材） */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12, padding: "8px 12px", background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.brand }}>到深圳仓成本</span>
                            {hideCost(r) ? (
                              <span style={{ fontSize: 11.5, color: C.faint }}>雪梅下单定价后，这里会显示 货款 + 运费 + 税费 的拆解和单件成本</span>
                            ) : (<>
                              <span style={{ fontSize: 11.5, color: C.sub }}>货款 <b style={{ color: C.ink }}>¥{purMoney(r.goods_amount)}</b></span>
                              <span style={{ color: C.faint }}>+</span>
                              <span style={{ fontSize: 11.5, color: C.sub }}>运费 <b style={{ color: C.ink }}>¥{purMoney(r.freight)}</b></span>
                              <span style={{ color: C.faint }}>+</span>
                              <span style={{ fontSize: 11.5, color: C.sub }}>税费 <b style={{ color: C.ink }}>¥{purMoney(r.tax_amount)}</b></span>
                              <span style={{ color: C.faint }}>=</span>
                              <span style={{ fontSize: 11.5, color: C.sub }}>总成本 <b style={{ color: C.ink }}>¥{purMoney(r.total_amount)}</b></span>
                              <span style={{ color: C.faint }}>÷</span>
                              <span style={{ fontSize: 11.5, color: C.sub }}><b style={{ color: C.ink }}>{r.qty ?? 0}</b> 件</span>
                              <span style={{ color: C.faint }}>=</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: C.brand }}>单件 ¥{purMoney(r.unit_cost)}</span>
                              <span style={{ fontSize: 10.5, color: C.faint, marginLeft: 2 }}>（不含头程 / 佣金 / 包材）</span>
                            </>)}
                          </div>
                          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                            {/* 付款流水 */}
                            <div style={{ flex: "1 1 420px", minWidth: 360 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>付款流水</span>
                                <span style={{ fontSize: 11, color: C.faint }}>
                                  已付 ¥{purMoney(r.pay_sum)} / 应付 ¥{purMoney(r.total_amount)}
                                </span>
                                {canPay && !payDraft && (
                                  <button onClick={() => setPayDraft({ purchase_id: r.id, pay_date: TODAY, amount: "", channel: "", payee: r.supplier || "", note: "" })}
                                    style={{ ...btnO, marginLeft: "auto", color: C.brand, borderColor: C.brand + "66" }}>+ 记一笔</button>
                                )}
                              </div>
                              <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "92px 1fr 92px 90px 26px", background: C.panel2, borderBottom: `1px solid ${C.line}` }}>
                                  {["日期", "渠道 / 收款方", "金额", "备注", ""].map((h, ii) => (
                                    <div key={ii} style={{ padding: "6px 9px", fontSize: 11, color: C.sub }}>{h}</div>
                                  ))}
                                </div>
                                {(pays[r.id] || []).length === 0 && (
                                  <div style={{ padding: "12px 10px", fontSize: 11.5, color: C.faint }}>暂无付款记录</div>
                                )}
                                {(pays[r.id] || []).map(p => (
                                  <div key={p.id} style={{ display: "grid", gridTemplateColumns: "92px 1fr 92px 90px 26px", borderTop: `1px solid ${C.line}`, alignItems: "center" }}>
                                    <div style={{ padding: "6px 9px", fontSize: 11.5, color: C.sub }}>{p.pay_date}</div>
                                    <div style={{ padding: "6px 9px", fontSize: 11.5 }}>
                                      {p.channel || "—"}{p.payee ? <span style={{ color: C.faint }}> · {p.payee}</span> : null}
                                    </div>
                                    <div style={{ padding: "6px 9px", fontSize: 11.5, textAlign: "right", color: C.brand }}>¥{purMoney(p.amount)}</div>
                                    <div style={{ padding: "6px 9px", fontSize: 11, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.note || ""}</div>
                                    <div style={{ textAlign: "center" }}>
                                      {canPay && <span onClick={() => delPay(r.id, p.id)} title="删除"
                                        style={{ cursor: "pointer", color: C.faint, fontSize: 12 }}>×</span>}
                                    </div>
                                  </div>
                                ))}
                                {payDraft && payDraft.purchase_id === r.id && (
                                  <div style={{ borderTop: `1px solid ${C.line}`, padding: 9, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.4fr", gap: 6, background: C.panel2 }}>
                                    <input type="date" value={payDraft.pay_date} onChange={e => setPayDraft(d => ({ ...d, pay_date: e.target.value }))} style={inp} />
                                    <input type="number" step="0.01" placeholder="金额" value={payDraft.amount} onChange={e => setPayDraft(d => ({ ...d, amount: e.target.value }))} style={inp} />
                                    <input placeholder="渠道(对公/微信…)" value={payDraft.channel} onChange={e => setPayDraft(d => ({ ...d, channel: e.target.value }))} style={inp} />
                                    <input placeholder="收款方" value={payDraft.payee} onChange={e => setPayDraft(d => ({ ...d, payee: e.target.value }))} style={inp} />
                                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                      <button onClick={() => setPayDraft(null)} style={btnO}>取消</button>
                                      <button onClick={submitPay} style={btn(C.brand, "#fff")}>保存付款</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 发货批次 */}
                            <div style={{ flex: "1 1 380px", minWidth: 330 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>发货批次</span>
                                <span style={{ fontSize: 11, color: C.faint }}>货件号与「发货记录」对齐</span>
                                {canBat && !batDraft && (
                                  <button onClick={() => setBatDraft({ purchase_id: r.id, ship_batch: "", qty: r.qty || "", store: r.store || "", ship_date: "", tracking_no: "" })}
                                    style={{ ...btnO, marginLeft: "auto", color: C.brand, borderColor: C.brand + "66" }}>+ 关联批次</button>
                                )}
                              </div>
                              <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 92px 26px", background: C.panel2, borderBottom: `1px solid ${C.line}` }}>
                                  {["货件号", "数量", "发货日", ""].map((h, ii) => (
                                    <div key={ii} style={{ padding: "6px 9px", fontSize: 11, color: C.sub }}>{h}</div>
                                  ))}
                                </div>
                                {(bats[r.id] || []).length === 0 && (
                                  <div style={{ padding: "12px 10px", fontSize: 11.5, color: C.faint }}>暂未关联发货批次</div>
                                )}
                                {(bats[r.id] || []).map(b => (
                                  <div key={b.id} style={{ display: "grid", gridTemplateColumns: "1fr 56px 92px 26px", borderTop: `1px solid ${C.line}`, alignItems: "center" }}>
                                    <div style={{ padding: "6px 9px", fontSize: 11.5, color: C.brand, overflow: "hidden", textOverflow: "ellipsis" }}>{b.ship_batch}{b.tracking_no ? <span style={{ color: C.faint }}> · {b.tracking_no}</span> : null}</div>
                                    <div style={{ padding: "6px 9px", fontSize: 11.5 }}>{b.qty}</div>
                                    <div style={{ padding: "6px 9px", fontSize: 11.5, color: C.sub }}>{b.ship_date || "—"}</div>
                                    <div style={{ textAlign: "center" }}>
                                      {canBat && <span onClick={() => delBat(r.id, b.id)} style={{ cursor: "pointer", color: C.faint, fontSize: 12 }}>×</span>}
                                    </div>
                                  </div>
                                ))}
                                {batDraft && batDraft.purchase_id === r.id && (
                                  <div style={{ borderTop: `1px solid ${C.line}`, padding: 9, display: "grid", gridTemplateColumns: "1.4fr 60px 1fr 1fr", gap: 6, background: C.panel2 }}>
                                    <input placeholder="货件号 FBA15…" value={batDraft.ship_batch} onChange={e => setBatDraft(d => ({ ...d, ship_batch: e.target.value }))} style={inp} />
                                    <input type="number" placeholder="数量" value={batDraft.qty} onChange={e => setBatDraft(d => ({ ...d, qty: e.target.value }))} style={inp} />
                                    <input type="date" value={batDraft.ship_date} onChange={e => setBatDraft(d => ({ ...d, ship_date: e.target.value }))} style={inp} />
                                    <input placeholder="追踪号" value={batDraft.tracking_no} onChange={e => setBatDraft(d => ({ ...d, tracking_no: e.target.value }))} style={inp} />
                                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                      <button onClick={() => setBatDraft(null)} style={btnO}>取消</button>
                                      <button onClick={submitBat} style={btn(C.brand, "#fff")}>保存批次</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 11, color: C.faint }}>
                            <span>币种 {r.currency || "CNY"}</span>
                            <span>货款 {purMoney(r.goods_amount)} · 运费 {purMoney(r.freight)} · 税费 {purMoney(r.tax_amount)}</span>
                            {r.pay_terms ? <span>付款条件 {r.pay_terms}</span> : null}
                            {r.arrive_date ? <span>预计到货 {r.arrive_date}</span> : null}
                            {r.note ? <span>备注 {r.note}</span> : null}
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ============ 供应商台账 ============ */}
      {sub === "supplier" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            {canSup && <button onClick={() => setSupForm(blankSup())} style={btn(C.brand, "#fff")}>+ 新增供应商</button>}
            <span style={{ fontSize: 11.5, color: C.faint }}>
              共 {supList.length} 家 · 只有「合作中」的供应商允许下单 · 收款账号首次录入即锁定，变更会留痕
            </span>
          </div>
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "auto" }}>
            <div style={{ minWidth: 1140 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(180px,1.2fr) 84px 130px minmax(110px,0.8fr) minmax(220px,1.5fr) minmax(120px,0.9fr) 84px", background: "#1f3a68" }}>
                {["供应商名称", "状态", "联系人 / 电话", "类别", "收款账号 / 开户行", "来源 / 备注", "操作"].map((h, ii, arr) => (
                  <div key={h} style={{ ...th, borderRight: ii === arr.length - 1 ? "none" : th.borderRight }}>{h}</div>
                ))}
              </div>
              {supList.length === 0 && <div style={{ padding: "30px 20px", textAlign: "center", color: C.faint, fontSize: 12 }}>还没有供应商{canSup ? " · 点左上「+ 新增供应商」" : ""}</div>}
              {supList.map((s, i) => (
                <div key={s.id} style={{ display: "grid", gridTemplateColumns: "minmax(180px,1.2fr) 84px 130px minmax(110px,0.8fr) minmax(220px,1.5fr) minmax(120px,0.9fr) 84px", borderTop: `1px solid ${C.line}`, background: i % 2 ? C.bg : "transparent" }}>
                  <div style={td}>{s.name}</div>
                  <div style={{ ...td, textAlign: "center" }}><span style={tag(PUR_SUP_TONE[s.status] || C.faint)}>{PUR_SUP_LABEL[s.status] || s.status}</span></div>
                  <div style={{ ...td, color: C.sub }}>{s.contact || "—"}{s.phone ? <div style={{ fontSize: 10.5, color: C.faint }}>{s.phone}</div> : null}</div>
                  <div style={{ ...td, color: C.sub }}>{s.category || "—"}</div>
                  <div style={{ ...td, color: C.sub }}>
                    {s.account_name || s.account_no ? `${s.account_name || ""} ${s.account_no || ""}`.trim() : "—"}
                    {s.bank ? <div style={{ fontSize: 10.5, color: C.faint }}>{s.bank}</div> : null}
                  </div>
                  <div style={{ ...td, color: C.faint, fontSize: 11 }}>{s.source || ""}{s.note ? <div>{s.note}</div> : null}{!s.source && !s.note ? "—" : null}</div>
                  <div style={{ ...td, textAlign: "center", borderRight: "none" }}>
                    {canSup ? <button onClick={() => setSupForm({ ...blankSup(), ...s })} style={{ ...btnO, padding: "3px 8px" }}>改</button>
                      : <span style={{ fontSize: 11, color: C.faint }}>—</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ============ 价格基线 ============ */}
      {sub === "price" && (
        <>
          <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 10 }}>
            按 SKU（无 SKU 时按产品名）汇总历史采购单价 · 偏差 = (最新价 − 均价) ÷ 均价 · |偏差| &gt; 10% 标色提示（只提示，不拦截）
          </div>
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "auto" }}>
            <div style={{ minWidth: 980 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(200px,1.4fr) minmax(160px,1fr) 64px 100px 92px 92px 100px 96px 88px", background: "#1f3a68" }}>
                {["SKU / 产品", "产品名", "次数", "均价", "最低", "最高", "最新价", "最新日期", "偏差"].map((h, ii, arr) => (
                  <div key={h} style={{ ...th, textAlign: ii >= 2 ? "right" : "left", borderRight: ii === arr.length - 1 ? "none" : th.borderRight }}>{h}</div>
                ))}
              </div>
              {priceList.length === 0 && <div style={{ padding: "30px 20px", textAlign: "center", color: C.faint, fontSize: 12 }}>暂无采购价格数据（录入采购单后自动汇总）</div>}
              {priceList.map((p, i) => {
                const dev = p.dev_pct === null || p.dev_pct === undefined ? null : Number(p.dev_pct);
                const tone = dev === null ? C.sub : Math.abs(dev) > 10 ? (dev > 0 ? C.drop : C.watch) : C.ink;
                return (
                  <div key={p.pkey} style={{ display: "grid", gridTemplateColumns: "minmax(200px,1.4fr) minmax(160px,1fr) 64px 100px 92px 92px 100px 96px 88px", borderTop: `1px solid ${C.line}`, background: i % 2 ? C.bg : "transparent" }}>
                    <div style={{ ...td, color: C.brand }}>{p.sku || p.pkey}</div>
                    <div style={{ ...td, color: C.sub }}>{p.product_name || "—"}</div>
                    <div style={{ ...td, textAlign: "right", color: C.sub }}>{p.times}</div>
                    <div style={{ ...td, textAlign: "right" }}>{purMoney(p.avg_price)}</div>
                    <div style={{ ...td, textAlign: "right", color: C.faint }}>{purMoney(p.min_price)}</div>
                    <div style={{ ...td, textAlign: "right", color: C.faint }}>{purMoney(p.max_price)}</div>
                    <div style={{ ...td, textAlign: "right", fontWeight: 600 }}>{purMoney(p.last_price)}</div>
                    <div style={{ ...td, textAlign: "right", color: C.sub, fontSize: 11 }}>{p.last_date || "—"}</div>
                    <div style={{ ...td, textAlign: "right", color: tone, fontWeight: 700, borderRight: "none" }}>{dev === null ? "—" : `${dev > 0 ? "+" : ""}${dev.toFixed(2)}%`}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ============ 采购单弹窗 ============ */}
      {form && (
        <div style={modalBg} onClick={() => setForm(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                {form.id ? (isRequester ? "修改采购需求" : "修改采购单") : (isRequester ? "提交采购需求" : "新建采购单")}
              </div>
              <div style={{ marginLeft: "auto", cursor: "pointer", color: C.faint }} onClick={() => setForm(null)}>✕</div>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ fontSize: 11, color: C.brand, fontWeight: 700, marginBottom: 8 }}>归谁 / 买什么</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {!isRequester && <div><label style={lb}>采购单号</label><input value={form.po_no} onChange={e => setF("po_no", e.target.value)} placeholder="PO-20261119-01" style={inp} /></div>}
                <div><label style={lb}>{isRequester ? "需求日期 *" : "采购日期 *"}</label><input type="date" value={form.order_date} onChange={e => setF("order_date", e.target.value)} style={inp} /></div>
                <div><label style={lb}>店铺</label>
                  <select value={form.store} onChange={e => setF("store", e.target.value)} style={inp}>
                    <option value="">未指定</option>
                    {storeOpts.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {!isRequester && <div><label style={lb}>供应商</label>
                  <select value={form.supplier_id || ""} onChange={e => {
                    const id = e.target.value;
                    const hit = supList.find(x => x.id === id);
                    setForm(f => ({ ...f, supplier_id: id, supplier: hit ? hit.name : f.supplier }));
                  }} style={inp}>
                    <option value="">未指定</option>
                    {supList.filter(s => s.status === "active" || s.id === form.supplier_id).map(s => (
                      <option key={s.id} value={s.id}>{s.name}{s.status !== "active" ? `（${PUR_SUP_LABEL[s.status] || s.status}）` : ""}</option>
                    ))}
                  </select>
                </div>}
                <div><label style={lb}>产品名称 *</label><input value={form.product_name} onChange={e => setF("product_name", e.target.value)} style={inp} /></div>
                <div><label style={lb}>SKU</label><input value={form.sku} onChange={e => setF("sku", e.target.value)} style={inp} /></div>
                <div><label style={lb}>ASIN</label><input value={form.asin} onChange={e => setF("asin", e.target.value)} style={inp} /></div>
                <div><label style={lb}>数量 *</label><input type="number" value={form.qty} onChange={e => setF("qty", e.target.value)} style={inp} /></div>
                <div><label style={lb}>单价</label><input type="number" step="0.01" value={form.unit_price} onChange={e => setF("unit_price", e.target.value)} style={inp} /></div>
              </div>

              {!isRequester && (<>
                <div style={{ fontSize: 11, color: C.brand, fontWeight: 700, margin: "16px 0 8px" }}>多少钱 <span style={{ color: C.faint, fontWeight: 400 }}>（由雪梅下单时填）</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                  <div><label style={lb}>货款（自动）</label><input type="number" step="0.01" value={form.goods_amount} onChange={e => setF("goods_amount", e.target.value)} style={inp} /></div>
                  <div><label style={lb}>运费</label><input type="number" step="0.01" value={form.freight} onChange={e => setF("freight", e.target.value)} style={inp} /></div>
                  <div><label style={lb}>税费</label><input type="number" step="0.01" value={form.tax_amount} onChange={e => setF("tax_amount", e.target.value)} style={inp} /></div>
                  <div><label style={lb}>总额（自动）</label><input type="number" step="0.01" value={form.total_amount} onChange={e => setF("total_amount", e.target.value)} style={inp} /></div>
                  <div><label style={lb}>币种</label>
                    <select value={form.currency} onChange={e => setF("currency", e.target.value)} style={inp}>
                      {PUR_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </>)}

              <div style={{ fontSize: 11, color: C.brand, fontWeight: 700, margin: "16px 0 8px" }}>到货 / 备注</div>
              <div style={{ display: "grid", gridTemplateColumns: isRequester ? "repeat(3, 1fr)" : "repeat(4, 1fr)", gap: 10 }}>
                {!isRequester && <div><label style={lb}>付款条件</label><input value={form.pay_terms} onChange={e => setF("pay_terms", e.target.value)} placeholder="全款 / 30% 定金" style={inp} /></div>}
                <div><label style={lb}>预计到货</label><input type="date" value={form.arrive_date} onChange={e => setF("arrive_date", e.target.value)} style={inp} /></div>
                {!isRequester && <div><label style={lb}>追踪号</label><input value={form.tracking_no} onChange={e => setF("tracking_no", e.target.value)} style={inp} /></div>}
                <div><label style={lb}>备注</label><input value={form.note} onChange={e => setF("note", e.target.value)} style={inp} /></div>
              </div>

              <div style={{ marginTop: 12, fontSize: 11, color: C.faint }}>
                {isRequester
                  ? "只填要什么、要多少、哪个店 —— 提交后由雪梅下单定价、夏蕾付款，价格不归你填。"
                  : "收货状态不用填：录入收货数量后系统自动判定（未到 / 部分到 / 已收齐 / 有差异）。"}
              </div>
            </div>
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setForm(null)} style={btnO}>取消</button>
              <button onClick={submitPO} style={btn(C.brand, "#fff")}>{form.id ? "保存修改" : "保存采购单"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ 供应商弹窗 ============ */}
      {supForm && (
        <div style={modalBg} onClick={() => setSupForm(null)}>
          <div style={{ ...modal, width: 720 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center" }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{supForm.id ? "修改供应商" : "新增供应商"}</div>
              <div style={{ marginLeft: "auto", cursor: "pointer", color: C.faint }} onClick={() => setSupForm(null)}>✕</div>
            </div>
            <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <div><label style={lb}>名称 *</label><input value={supForm.name} onChange={e => setSupForm(f => ({ ...f, name: e.target.value }))} style={inp} /></div>
              <div><label style={lb}>状态</label>
                <select value={supForm.status} onChange={e => setSupForm(f => ({ ...f, status: e.target.value }))} style={inp}>
                  {Object.entries(PUR_SUP_LABEL).filter(([k]) => k !== "pending" || supForm.status === "pending").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label style={lb}>类别</label><input value={supForm.category || ""} onChange={e => setSupForm(f => ({ ...f, category: e.target.value }))} placeholder="包材 / 五金 / 电子" style={inp} /></div>
              <div><label style={lb}>联系人</label><input value={supForm.contact || ""} onChange={e => setSupForm(f => ({ ...f, contact: e.target.value }))} style={inp} /></div>
              <div><label style={lb}>电话</label><input value={supForm.phone || ""} onChange={e => setSupForm(f => ({ ...f, phone: e.target.value }))} style={inp} /></div>
              <div><label style={lb}>来源</label><input value={supForm.source || ""} onChange={e => setSupForm(f => ({ ...f, source: e.target.value }))} placeholder="1688 / 展会 / 介绍" style={inp} /></div>
              <div><label style={lb}>收款户名</label><input value={supForm.account_name || ""} onChange={e => setSupForm(f => ({ ...f, account_name: e.target.value }))} style={inp} /></div>
              <div><label style={lb}>收款账号</label><input value={supForm.account_no || ""} onChange={e => setSupForm(f => ({ ...f, account_no: e.target.value }))} style={inp} /></div>
              <div><label style={lb}>开户行</label><input value={supForm.bank || ""} onChange={e => setSupForm(f => ({ ...f, bank: e.target.value }))} style={inp} /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={lb}>备注</label><input value={supForm.note || ""} onChange={e => setSupForm(f => ({ ...f, note: e.target.value }))} style={inp} /></div>
              <div style={{ gridColumn: "1 / -1", fontSize: 11, color: C.watch, background: C.watch + "14", border: `1px solid ${C.watch}44`, borderRadius: 6, padding: "8px 10px" }}>
                收款账号改动会被记录：先录对的，后续任何人改动都会追加到 account_changes 留痕。下单前请核对户名与账号一致。
              </div>
            </div>
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setSupForm(null)} style={btnO}>取消</button>
              <button onClick={submitSup} style={btn(C.brand, "#fff")}>{supForm.id ? "保存修改" : "保存供应商"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ 密码确认 ============ */}
      {pwdOpen && (
        <div style={modalBg} onClick={() => { setPwdOpen(false); setPwdErr(""); }}>
          <div style={{ ...modal, width: 380 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.line}`, fontSize: 13.5, fontWeight: 700 }}>{pwdTip}</div>
            <div style={{ padding: 18 }}>
              <label style={lb}>请输入确认密码</label>
              <input type="password" value={pwd} autoFocus onChange={e => setPwd(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") runPending(); }}
                style={inp} placeholder="6 位密码" />
              {pwdErr && <div style={{ marginTop: 8, fontSize: 11.5, color: C.drop }}>{pwdErr}</div>}
            </div>
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setPwdOpen(false); setPwd(""); setPwdErr(""); setPending(null); }} style={btnO}>取消</button>
              <button onClick={runPending} disabled={saving} style={{ ...btn(C.brand, "#fff"), opacity: saving ? .6 : 1 }}>{saving ? "保存中…" : "确认"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StoreOtherExpense() {
  const cur = new Date();
  const YEARS = Array.from({ length: 6 }, (_, i) => cur.getFullYear() - 3 + i);
  const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const [ym, setYm] = useState(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
  const [storeFilter, setStoreFilter] = useState("");       // "" = 全部店铺
  const [list, setList] = useState([]);                     // 当月明细 { key, id, date, store, item, amount }
  const [dirty, setDirty] = useState({});
  const [removed, setRemoved] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [role, setRole] = useState(null);
  const [roleReady, setRoleReady] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const [saving, setSaving] = useState(false);
  const PWD = "852963";

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data && data.user) setRole(getUserRole(data.user.email || ""));
    }).catch(() => {}).finally(() => setRoleReady(true));
  }, []);
  const canEdit = !!role;   // 全部成员可写 — KK 2026-09-17 定
  // ⚠️ 必须放在 role 的 useState 声明之后 (否则 TDZ: Cannot access 'role' before initialization → 整页白屏)
  const STORES = (role && ROLE_STORES[role]) || OPS_FIXED_STORES;   // 黄丹(采购)只见三家 — KK 2026-09-18
  const myStores = (role && ROLE_STORES[role]) || null;

  const load = () => {
    const start = `${ym}-01`;
    const [yy, mm] = ym.split("-").map(Number);
    const end = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}-01`;
    let q = supabase.from("store_other_expense").select("*").gte("exp_date", start).lt("exp_date", end);
    if (myStores) q = q.in("store", myStores);
    q.order("exp_date")
      .then(({ data, error }) => {
        if (error) { setErr(error.message); setList([]); }
        else {
          setErr("");
          setList((data || []).map(r => ({
            key: `id:${r.id}`, id: r.id, date: r.exp_date || "", store: r.store || "",
            item: r.item || "",
            amount: (r.amount === null || r.amount === undefined) ? "" : Number(r.amount),
          })));
        }
        setLoaded(true);
      });
  };
  // 角色取回后才拉数 (黄丹只会拉到三家, 不闪现其他店) — KK 2026-09-18
  useEffect(() => {
    if (!roleReady) return;
    setDirty({}); setRemoved([]); setList([]); setLoaded(false); load();
  }, [ym, roleReady]);

  const setField = (key, field, v) => {
    setList(p => p.map(r => (r.key === key ? { ...r, [field]: v } : r)));
    setDirty(p => ({ ...p, [key]: true }));
  };
  const addRow = () => {
    const today = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    const def = today.slice(0, 7) === ym ? today : `${ym}-01`;
    const key = `new:${Date.now()}`;
    // 新增行默认带上当前筛选的分店; 若为「全部店铺」则默认第一家
    setList(p => [...p, { key, id: null, date: def, store: storeFilter || STORES[0], item: "", amount: "" }]);
    setDirty(p => ({ ...p, [key]: true }));
  };
  const delRow = (r) => {
    if (r.id) setRemoved(p => [...p, r.id]);
    setList(p => p.filter(x => x.key !== r.key));
    setDirty(p => { const n = { ...p }; delete n[r.key]; return n; });
  };

  // 视图 (按分店筛选) · 待提交统计 (全局, 不受筛选影响)
  const view = storeFilter ? list.filter(r => r.store === storeFilter) : list;
  const viewSum = view.reduce((s, r) => s + Number(r.amount || 0), 0);
  const dirtyRows = list.filter(r => dirty[r.key]);
  const pendingUpd = dirtyRows.filter(r => r.id);
  const pendingNew = dirtyRows.filter(r => !r.id && (String(r.item).trim() !== "" || String(r.amount).trim() !== ""));
  const pendingCount = pendingUpd.length + pendingNew.length + removed.length;
  // 按店铺小计 (「全部店铺」时展示分类汇总)
  const byStore = STORES.map(s => ({ s, sum: list.filter(r => r.store === s).reduce((a, r) => a + Number(r.amount || 0), 0) }));

  const submitAll = () => {
    const all = [...pendingUpd, ...pendingNew];
    const bad = all.find(r => !r.date) || all.find(r => !String(r.store || "").trim()) || all.find(r => String(r.item).trim() === "") || all.find(r => String(r.amount).trim() !== "" && isNaN(Number(r.amount)));
    if (bad) {
      alert(!bad.date ? "有行的日期为空, 请补全"
        : !String(bad.store || "").trim() ? "有行的「店铺」为空, 请选择店铺"
          : String(bad.item).trim() === "" ? "有行的「项目明细」为空, 请补全"
            : "「费用」必须是数字");
      return;
    }
    setPwdOpen(true);
  };
  const discardAll = () => { setDirty({}); setRemoved([]); setPwdOpen(false); setPwd(""); setPwdErr(""); load(); };
  const confirmSubmit = async () => {
    if (pwd !== PWD) { setPwdErr("密码不正确"); return; }
    setSaving(true);
    let errMsg = "";
    if (removed.length) {
      const { error } = await supabase.from("store_other_expense").delete().in("id", removed);
      if (error) errMsg = error.message;
    }
    if (!errMsg) for (const r of pendingUpd) {
      const { error } = await supabase.from("store_other_expense")
        .update({ exp_date: r.date, store: String(r.store).trim(), item: String(r.item).trim(), amount: Number(r.amount || 0) })
        .eq("id", r.id);
      if (error) { errMsg = error.message; break; }
    }
    if (!errMsg) for (const r of pendingNew) {
      const { error } = await supabase.from("store_other_expense")
        .insert({ exp_date: r.date, store: String(r.store).trim(), item: String(r.item).trim(), amount: Number(r.amount || 0) });
      if (error) { errMsg = error.message; break; }
    }
    setSaving(false); setPwdOpen(false); setPwd(""); setPwdErr("");
    if (errMsg) { alert("保存失败(请先在 Supabase 跑 sql/create_store_other_expense.sql): " + errMsg); return; }
    setDirty({}); setRemoved([]);
    load();
  };

  const SOC_GRID = "56px 158px 126px minmax(260px, 1fr) 158px 70px";
  const th = { padding: "10px 12px", fontSize: 12, color: "#fff", fontWeight: 600, borderRight: "1px solid #2a4a78" };
  const cellInput = { width: "100%", padding: "6px 8px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, outline: "none", colorScheme: "dark" };
  const cellText = { padding: "10px 12px", fontSize: 12, color: C.ink, borderRight: `1px solid ${C.line}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  const selStyle = { padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, colorScheme: "dark" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>店铺其他费用</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            按店铺逐条明细 · 日期 / 店铺 / 项目明细 / 费用(¥) · 每月独立 · {!canEdit ? "只读" : "改动改完点底部「确认提交」输密码入库"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {canEdit && (
            <button onClick={addRow} style={{ padding: "6px 14px", background: C.brand, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ 新增一行</button>
          )}
          <span style={{ fontSize: 11, color: C.faint }}>共 {view.length} 条</span>
          <span style={{ fontSize: 12, color: C.brand, fontWeight: 700, padding: "4px 12px", borderRadius: 6, background: C.panel2, border: `1px solid ${C.line}` }}>
            {storeFilter || "全部店铺"} 合计 ¥{viewSum.toFixed(2)}
          </span>
          {/* 分店栏: 按 6 家店筛选分类 */}
          <span style={{ fontSize: 12, color: C.sub }}>分店:</span>
          <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)} style={selStyle}>
            <option value="">全部店铺</option>
            {STORES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ fontSize: 12, color: C.sub }}>月份:</span>
          <select value={ym.slice(0, 4)} onChange={e => { setYm(`${e.target.value}-${ym.slice(5, 7)}`); }}
            style={{ padding: "6px 12px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 12 }}>
            {YEARS.map(y => <option key={y} value={String(y)}>{y}年</option>)}
          </select>
          <select value={ym.slice(5, 7)} onChange={e => { setYm(`${ym.slice(0, 4)}-${e.target.value}`); }}
            style={{ padding: "6px 12px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 12 }}>
            {MONTHS.map(m => <option key={m} value={m}>{Number(m)}月</option>)}
          </select>
        </div>
      </div>

      {err && (
        <div style={{ background: "#c05b5222", border: "1px solid #c05b52", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#c05b52" }}>
          读取失败(请先在 Supabase 跑 sql/create_store_other_expense.sql): {err}
        </div>
      )}

      {(!loaded || !roleReady) && <div style={{ padding: 30, textAlign: "center", color: C.faint }}>加载中…</div>}

      {/* 全部店铺视图: 6 家分店小计一览 */}
      {loaded && roleReady && !storeFilter && list.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {byStore.map(b => (
            <div key={b.s} style={{ fontSize: 11, color: C.sub, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 12px" }}>
              {b.s} <b style={{ color: b.sum ? C.brand : C.faint, marginLeft: 4 }}>¥{b.sum.toFixed(2)}</b>
            </div>
          ))}
        </div>
      )}

      {loaded && roleReady && (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "auto" }}>
          <div style={{ minWidth: 900 }}>
            <div style={{ display: "grid", gridTemplateColumns: SOC_GRID, background: "#1f3a68" }}>
              <div style={{ ...th, textAlign: "center" }}>#</div>
              <div style={th}>日期</div>
              <div style={th}>店铺</div>
              <div style={th}>项目明细</div>
              <div style={{ ...th, textAlign: "right" }}>{ym} · 费用 ¥</div>
              <div style={{ ...th, borderRight: "none", textAlign: "center" }}>操作</div>
            </div>

            {view.map((r, i) => {
              const pend = !!dirty[r.key];
              const bgc = pend ? "#d9a44118" : (i % 2 ? C.bg : "transparent");
              return (
                <div key={r.key} style={{ display: "grid", gridTemplateColumns: SOC_GRID, borderTop: `1px solid ${C.line}`, background: bgc }}>
                  <div style={{ padding: "10px 8px", fontSize: 11, color: C.faint, textAlign: "center", borderRight: `1px solid ${C.line}` }}>{i + 1}</div>
                  {canEdit ? (
                    <>
                      <div style={{ padding: "4px 8px", borderRight: `1px solid ${C.line}` }}>
                        <input type="date" value={r.date} onChange={e => setField(r.key, "date", e.target.value)} style={cellInput} />
                      </div>
                      <div style={{ padding: "4px 8px", borderRight: `1px solid ${C.line}` }}>
                        <select value={r.store} onChange={e => setField(r.key, "store", e.target.value)} style={cellInput}>
                          {STORES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div style={{ padding: "4px 8px", borderRight: `1px solid ${C.line}` }}>
                        <input value={r.item} onChange={e => setField(r.key, "item", e.target.value)} placeholder="费用项目 / 明细说明"
                          title={r.item} style={cellInput} />
                      </div>
                      <div style={{ padding: "4px 8px", borderRight: `1px solid ${C.line}` }}>
                        <input value={r.amount} onChange={e => setField(r.key, "amount", e.target.value)} onFocus={e => e.target.select()}
                          placeholder="0.00" inputMode="decimal" title="人民币金额 (¥)"
                          style={{ ...cellInput, textAlign: "right", fontWeight: 600 }} />
                      </div>
                      <div style={{ padding: "4px 8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <button onClick={() => delRow(r)} title="删除此行 (提交后生效)"
                          style={{ padding: "4px 10px", background: "transparent", color: "#e0857a", border: "1px solid #c05b52", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>删除</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={cellText}>{r.date || "—"}</div>
                      <div style={{ ...cellText, fontWeight: 600 }}>{r.store || "—"}</div>
                      <div style={{ ...cellText, color: r.item ? C.ink : C.faint }} title={r.item}>{r.item || "—"}</div>
                      <div style={{ ...cellText, textAlign: "right", fontWeight: 600, color: r.amount === "" ? C.faint : C.ink }}>{r.amount === "" ? "—" : Number(r.amount).toFixed(2)}</div>
                      <div style={{ padding: "10px 8px", fontSize: 11, color: C.faint, textAlign: "center" }}>—</div>
                    </>
                  )}
                </div>
              );
            })}

            {view.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: C.faint, fontSize: 13, borderTop: `1px solid ${C.line}` }}>
                {ym} {storeFilter ? `${storeFilter} ` : ""}暂无店铺其他费用{canEdit ? "，点右上「+ 新增一行」开始录入" : ""}
              </div>
            )}

            {view.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: SOC_GRID, borderTop: `2px solid ${C.line}`, background: C.bg, fontSize: 12, fontWeight: 700 }}>
                <div style={{ padding: "10px 8px" }} />
                <div style={{ padding: "10px 12px", color: C.brand }}>合计</div>
                <div style={{ padding: "10px 12px", color: C.sub, fontWeight: 400 }}>{storeFilter || "全部店铺"}</div>
                <div style={{ padding: "10px 12px", color: C.faint, fontWeight: 400 }}>{ym} 共 {view.length} 条明细</div>
                <div style={{ padding: "10px 12px", textAlign: "right", color: C.brand }}>¥{viewSum.toFixed(2)}</div>
                <div style={{ padding: "10px 8px" }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 待提交浮条: 改动只缓存在页面, 点确认提交才输密码一次性入库 */}
      {pendingCount > 0 && !pwdOpen && (
        <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 26, zIndex: 110, background: C.panel, border: "1px solid #d9a441", boxShadow: "0 10px 30px rgba(0,0,0,.28)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 12, color: C.ink }}>
            本次已改 <b style={{ color: C.brand, fontSize: 14 }}>{pendingCount}</b> 项 · 尚未入库, 点右侧确认提交(需密码)
          </span>
          <button onClick={discardAll} style={{ padding: "6px 12px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 12, cursor: "pointer" }}>撤销全部</button>
          <button onClick={submitAll} style={{ padding: "6px 16px", background: C.brand, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>确认提交</button>
        </div>
      )}

      {/* 提交确认框: 列出全部改动 + 输密码 852963 */}
      {pwdOpen && (
        <div onClick={() => { setPwdOpen(false); setPwd(""); setPwdErr(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, width: 560, maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>确认提交 {pendingCount} 项改动</div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 14 }}>核对无误后输入密码, 一次性写入数据库</div>
            <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 14 }}>
              <div style={{ display: "flex", color: C.sub, fontSize: 11, paddingBottom: 6, borderBottom: `1px solid ${C.line}` }}>
                <span style={{ width: 52 }}>动作</span>
                <span style={{ width: 92 }}>日期</span>
                <span style={{ width: 60 }}>店铺</span>
                <span style={{ flex: 1 }}>项目明细</span>
                <span style={{ width: 100, textAlign: "right" }}>费用</span>
              </div>
              {removed.map(id => (
                <div key={`del-${id}`} style={{ display: "flex", padding: "5px 0", borderBottom: `1px solid ${C.line}`, color: "#e0857a" }}>
                  <span style={{ width: 52 }}>删除</span>
                  <span style={{ width: 92 }}>—</span>
                  <span style={{ width: 60 }}>—</span>
                  <span style={{ flex: 1 }}>已删除的一行</span>
                  <span style={{ width: 100, textAlign: "right" }}>→ 移除</span>
                </div>
              ))}
              {[...pendingUpd, ...pendingNew].map(r => (
                <div key={r.key} style={{ display: "flex", padding: "5px 0", borderBottom: `1px solid ${C.line}` }}>
                  <span style={{ width: 52, color: r.id ? C.sub : C.brand }}>{r.id ? "修改" : "新增"}</span>
                  <span style={{ width: 92, color: C.ink }}>{r.date || "—"}</span>
                  <span style={{ width: 60, color: C.ink }}>{r.store || "—"}</span>
                  <span style={{ flex: 1, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.item}>{r.item}</span>
                  <span style={{ width: 100, textAlign: "right", color: C.brand, fontWeight: 700 }}>¥{Number(r.amount || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>确认密码</div>
            <input type="password" value={pwd} autoFocus
              onChange={e => { setPwd(e.target.value); setPwdErr(""); }}
              onKeyDown={e => { if (e.key === "Enter" && !saving) confirmSubmit(); if (e.key === "Escape") { setPwdOpen(false); setPwd(""); setPwdErr(""); } }}
              placeholder="输入密码"
              style={{ width: "100%", padding: "9px 12px", background: C.bg, border: `1px solid ${pwdErr ? "#c05b52" : C.line}`, borderRadius: 6, color: C.ink, fontSize: 14, marginBottom: 6 }} />
            {pwdErr && <div style={{ fontSize: 11, color: "#c05b52", marginBottom: 6 }}>{pwdErr}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => { setPwdOpen(false); setPwd(""); setPwdErr(""); }} style={{ flex: 1, padding: "9px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>返回继续改</button>
              <button onClick={confirmSubmit} disabled={saving} style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: saving ? "wait" : "pointer", fontWeight: 600, opacity: saving ? .7 : 1 }}>{saving ? "提交中…" : "确认提交"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- 店铺运维费用 / 店铺月度核算 共用常量 ----------------
// 站点列 = 欧元(€); 「月固定」类别 = 人民币(¥), 不区分国家(站点)
const OPS_SITES = ["FR", "DE", "UK", "ES", "IT", "SE", "BE", "NL"];
const OPS_MONTHLY_SITE = "月固定";
const OPS_MONTHLY_CATS = { "网络IP费用": 88 };
const OPS_CATS = ["网络IP费用", "广告", "仓储", "长期仓储", "erp", "服务订阅", "优惠券", "弃置费用", "生产者延伸费", "店铺月租", "入库费用", "亚马逊物流客户退货费(非服装和非鞋类)"];
// 店铺口径常量 (OPS_FIXED_STORES / SHARE_GROUP / ALL_STORES / ROLE_STORES) 已提到文件顶部统一定义
const OPS_SITE_CATS = OPS_CATS.filter(c => OPS_MONTHLY_CATS[c] === undefined);
// 三家共享场地费的「默认值」= ¥3800/月。
// 2026-09-27 起场地放开手填: 没单独录过的月份按这个默认值计, 录了就以录的为准 (KK 定)
const SHARED_SITE_FEE = 3800;
// 批次配色 (发货记录 / 库存记录 共用): 每个批次一块底色, 循环取色
const BATCH_PALETTE = ["#4db6a4", "#6f8fd0", "#c08fd0", "#d9a441", "#d9756f", "#7fb069", "#b57edc", "#5b9bd5"];

// 本月汇率输入 (店铺运维费用 / 店铺月度核算 共用)
// 规则: 汇率按月各自记录(表 fx_rates); 改动后失焦 → 弹框输密码 → 才写库
function RateField({ month, canEdit, pwd, onRate }) {
  const [rate, setRate] = useState(8.0);
  const [saved, setSaved] = useState(8.0);
  const [src, setSrc] = useState("default");     // own=本月已设 / inherit=沿用历史 / default=默认
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  // 取本月汇率: 优先本月记录; 没有则取「不晚于本月的最近一条」(时间上最接近的历史汇率);
  // 再也没有就用默认 8.0。绝不使用全局缓存 —— 否则改一个月会串到所有月份 (KK 2026-09-16 踩坑)
  useEffect(() => {
    let on = true;
    (async () => {
      const { data: cur } = await supabase.from("fx_rates").select("rate").eq("month", month).maybeSingle();
      let v = null, s = "default";
      if (cur && cur.rate) { v = Number(cur.rate); s = "own"; }
      else {
        const { data: prev } = await supabase.from("fx_rates").select("rate")
          .lte("month", month).order("month", { ascending: false }).limit(1);
        if (prev && prev.length) { v = Number(prev[0].rate); s = "inherit"; } else { v = 8.0; s = "default"; }
      }
      if (!on) return;
      setRate(v); setSaved(v); setSrc(s); onRate(v);
    })();
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);
  const change = (v) => { setRate(v); onRate(Number(v) || 0); };
  const request = () => {
    if (!canEdit) return;
    const num = Number(rate);
    if (!num || num <= 0) { setRate(saved); onRate(saved); return; }
    if (num === saved) return;
    setPin(""); setErr(""); setOpen(true);
  };
  const confirm = async () => {
    if (pin.trim() !== pwd) { setErr("密码不正确, 请重新输入"); return; }
    const num = Number(rate);
    const { error } = await supabase.from("fx_rates").upsert({ month, rate: num }, { onConflict: "month" });
    if (error) { setErr("保存失败(请先在 Supabase 建表 fx_rates): " + error.message); return; }
    setSaved(num); setSrc("own"); setOpen(false); setPin(""); setErr("");
  };
  const cancel = () => { setRate(saved); onRate(saved); setOpen(false); setPin(""); setErr(""); };
  return (
    <>
      <span style={{ fontSize: 12, color: C.sub, marginLeft: 4 }} title={canEdit ? "本月汇率, 改完点空白处 → 输密码确认" : "汇率由管理层维护, 只读"}>本月汇率 €→¥:</span>
      <input type="number" step="0.01" min="0" value={rate} disabled={!canEdit}
        onChange={e => change(e.target.value)} onBlur={request}
        style={{ width: 64, padding: "5px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: canEdit ? C.ink : C.faint, fontSize: 12 }} />
      {src !== "own" && (
        <span title={src === "inherit" ? "本月还没单独设汇率, 暂时沿用之前月份的汇率; 改一次即可锁定本月" : "数据库里还没有汇率记录(请先跑 fx_rates 建表 SQL), 现用默认 8.0"}
          style={{ fontSize: 10, color: src === "inherit" ? C.watch : C.drop, border: `1px solid ${src === "inherit" ? C.watch : C.drop}`, borderRadius: 4, padding: "1px 5px" }}>
          {src === "inherit" ? "沿用历史·未锁定" : "未设·默认8.0"}
        </span>
      )}
      {open && (
        <div onClick={cancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 130 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, width: 380 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>确认修改本月汇率</div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 14 }}>{month.slice(0, 7)} · 只影响本月, 历史月份的汇率不受影响</div>
            <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, marginBottom: 14, display: "flex", alignItems: "center" }}>
              <span style={{ color: C.sub, width: 72 }}>汇率 €→¥</span>
              <span style={{ color: C.faint }}>{saved}</span>
              <span style={{ margin: "0 8px", color: C.faint }}>→</span>
              <span style={{ color: C.brand, fontWeight: 700, fontSize: 14 }}>{Number(rate) || 0}</span>
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>确认密码</div>
            <input type="password" value={pin} autoFocus
              onChange={e => { setPin(e.target.value); setErr(""); }}
              onKeyDown={e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") cancel(); }}
              placeholder="输入密码"
              style={{ width: "100%", padding: "9px 12px", background: C.bg, border: `1px solid ${err ? "#c05b52" : C.line}`, borderRadius: 6, color: C.ink, fontSize: 14, marginBottom: 6 }} />
            {err && <div style={{ fontSize: 11, color: "#c05b52", marginBottom: 6 }}>{err}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={cancel} style={{ flex: 1, padding: "9px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>取消</button>
              <button onClick={confirm} style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>确认修改</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------- 店铺运维费用 ----------------
// 维度: 月份 × 店铺 × 站点 × 费用类别 → 金额
// 店铺筛选: 不选=全部店铺汇总(只读) / 选具体店铺=该店铺数据(可编辑)
function OpsFee() {
  // 平台维度 (KK 2026-11-25): 亚马逊 = 六店多站点; Cdiscount = 梦想店, 费用口径=回款单服务费;
  // ManoMano = 飞鸟主体开的店(与亚马逊飞鸟是两个平台的两家店)
  const PLAT_SITES = { amazon: OPS_SITES, cdiscount: ["CDiscount France"], manomano: ["ManoMano FR"] };
  const PLAT_STORES_OPS = { amazon: ALL_STORES, cdiscount: ["梦想"], manomano: ["飞鸟"] };
  const [plat, setPlat] = useState("amazon");
  const SITES = PLAT_SITES[plat] || OPS_SITES;
  const MONTHLY_SITE = OPS_MONTHLY_SITE;
  const MONTHLY_CATS = OPS_MONTHLY_CATS;
  const CATS = plat === "amazon" ? OPS_CATS
    : ["平台服务费", "广告", "仓储", "长期仓储", "服务订阅", "店铺月租", "入库费用", "弃置费用", "生产者延伸费", "优惠券"];
  const cur = new Date();
  const YEARS = Array.from({ length: 6 }, (_, i) => cur.getFullYear() - 3 + i);   // 前3年 ~ 后2年
  const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const [month, setMonth] = useState(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-01`);
  const [rows, setRows] = useState([]);
  const [filterStore, setFilterStore] = useState("飞鸟");                  // "" = 全部店铺汇总(只读)
  const [storeOpts, setStoreOpts] = useState(PLAT_STORES_OPS.amazon);
  const [loaded, setLoaded] = useState(false);
  const [opsRole, setOpsRole] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data && data.user) setOpsRole(getUserRole(data.user.email || ""));
    });
  }, []);
  // 可录入: admin + 成都·供应链 + 成都·采购(黄丹) + 财务专员 + 成都·推广(诗琪, 2026-10-20)
  const canEdit = opsRole === "admin" || opsRole === "cd_supplier" || opsRole === "cd_procurement" || opsRole === "finance" || opsRole === "cd_promotion";
  // 数据按角色收窄: 黄丹(采购)只看三家 — 2026-09-18 KK 定
  const myStores = (opsRole && ROLE_STORES[opsRole]) || null;
  const load = () => {
    let q = supabase.from("opsfee_monthly").select("*").eq("month", month).eq("platform", plat).order("site, category");
    if (myStores) q = q.in("store", myStores);
    q.then(({ data, error }) => {
        if (error) { alert("读取失败(请先建表 opsfee_monthly): " + error.message); setRows([]); return; }
        setRows(data || []); setLoaded(true);
        // 店铺清单按平台给: 亚马逊六店(收窄角色只给三家) / Cdiscount=梦想 / ManoMano=飞鸟
        const base = PLAT_STORES_OPS[plat] || ALL_STORES;
        setStoreOpts(() => (myStores ? base.filter(s => myStores.includes(s)) : base.slice()));
      });
  };
  // 角色取回后才拉数 (黄丹只取三家, 不闪现其他店) — KK 2026-09-18
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (opsRole) load(); }, [month, opsRole, plat]);
  // 不选店铺 = 全部店铺汇总(只读); 选店铺 = 该店铺数据(单元格直接输入)
  const getVal = (site, category) => {
    const m = rows.filter(x => x.site === site && x.category === category);
    if (!filterStore) return m.reduce((s, x) => s + Number(x.amount || 0), 0);
    const r = m.find(x => x.store === filterStore);
    return r ? Number(r.amount || 0) : 0;
  };
  const isMonthly = (cat) => MONTHLY_CATS[cat] !== undefined;
  // 月固定费用取值: 有记录用记录, 没记录用默认值 (每店铺每月一份)
  const monthlyVal = (cat) => {
    const rs = rows.filter(x => x.category === cat && x.site === MONTHLY_SITE);
    if (!filterStore) return rs.length ? rs.reduce((s, x) => s + Number(x.amount || 0), 0) : MONTHLY_CATS[cat];
    const r = rs.find(x => x.store === filterStore);
    return r ? Number(r.amount || 0) : MONTHLY_CATS[cat];
  };
  const total = (category) => isMonthly(category) ? monthlyVal(category) : SITES.reduce((s, site) => s + getVal(site, category), 0);
  const SITE_CATS = CATS.filter(c => !isMonthly(c));        // 参加站点合计的类别
  const totalSite = (site) => SITE_CATS.reduce((s, cat) => s + getVal(site, cat), 0);
  // —— 币种核算 ——
  // 站点里录的都是欧元(€); 网络IP费用等"月固定"类别直接是人民币(¥), 不参与汇率折算
  // 汇率按「月」各自记录 (表 fx_rates) 且改动需密码: 见 <RateField />
  const [rate, setRate] = useState(8.0);
  const canEditRate = ["admin", "fr", "cd_procurement", "finance"].includes(opsRole);
  const eurTotal = SITE_CATS.reduce((s, c) => s + total(c), 0);                   // 欧元合计
  const monthlyRmb = CATS.filter(isMonthly).reduce((s, c) => s + monthlyVal(c), 0); // 月固定(人民币)小计
  const rmbTotal = eurTotal * rate + monthlyRmb;                                  // 月度核算费用(¥)
  const toRmb = (cat) => isMonthly(cat) ? monthlyVal(cat) : total(cat) * rate;
  const canEditCell = canEdit && !!filterStore;      // 汇总视图只读, 选店铺后直接录入
  const OPS_PWD = "852963";                          // 批量提交时的二次校验密码 (防手误误改)
  // 规则 (2026-09-14 KK 定):
  //   单项改动 → 4 秒后自动落库, 不弹框不输密码
  //   多项改动 → 底部浮条「确认提交」→ 一次性输密码校验 → 一起落库
  const [drafts, setDrafts] = useState({});          // 正在输入的值 (key = site|category)
  const [pendingMap, setPendingMap] = useState({});  // 待落库改动 key → { site, category, amount, oldV, existingId, store }
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const pendingList = Object.values(pendingMap);
  const pendingCount = pendingList.length;
  const setDraft = (site, category, v) => setDrafts(p => ({ ...p, [`${site}|${category}`]: v }));
  const clearDraft = (site, category) => setDrafts(p => { const n = { ...p }; delete n[`${site}|${category}`]; return n; });
  const dropPending = (keys) => setPendingMap(p => { const n = { ...p }; keys.forEach(k => delete n[k]); return n; });
  // 失焦/回车 → 记入待提交队列 (不立刻写库)
  const requestCell = (site, category) => {
    const key = `${site}|${category}`;
    const raw = drafts[key];
    if (raw === undefined || !canEditCell) return;
    const existing = rows.find(x => x.site === site && x.category === category && x.store === filterStore);
    const oldV = existing ? Number(existing.amount || 0) : 0;
    const amount = raw.trim() === "" ? 0 : Number(raw);
    if (isNaN(amount)) { alert("金额必须是数字"); setDraft(site, category, oldV ? String(oldV) : ""); return; }
    if (existing && oldV === amount) { clearDraft(site, category); dropPending([key]); return; }   // 值没变
    if (!existing && raw.trim() === "") { clearDraft(site, category); dropPending([key]); return; } // 空值新建
    setPendingMap(p => ({ ...p, [key]: { key, site, category, amount, oldV, existingId: existing ? existing.id : null, store: filterStore, month } }));
  };
  // 真正落库 (单项自动 / 批量密码校验后)
  const writeAll = async () => {
    const list = Object.values(pendingMap);
    if (!list.length) return;
    const done = [], added = [];
    let errMsg = "";
    for (const it of list) {
      if (it.existingId) {
        const { error } = await supabase.from("opsfee_monthly").update({ amount: it.amount }).eq("id", it.existingId);
        if (error) { errMsg = error.message; continue; }
        done.push(it);
      } else {
        const { data, error } = await supabase.from("opsfee_monthly")
          .insert({ month: it.month || month, platform: plat, store: it.store, site: it.site, category: it.category, amount: it.amount }).select().single();
        if (error) { errMsg = error.message; continue; }
        if (data) added.push(data);
        done.push(it);
      }
    }
    if (done.length) {
      const upd = {};
      done.forEach(o => { if (o.existingId) upd[o.existingId] = o.amount; });
      setRows(prev => [...prev.map(r => (r.id in upd ? { ...r, amount: upd[r.id] } : r)), ...added]);
      setDrafts(p => { const n = { ...p }; done.forEach(o => delete n[`${o.site}|${o.category}`]); return n; });
      dropPending(done.map(o => o.key));
    }
    setPwdOpen(false); setPwd(""); setPwdErr("");
    if (errMsg) alert("部分保存失败: " + errMsg);
  };
  // 切换店铺/月份: 有未提交改动先拦住 (必须先提交或撤销, 不能带着未提交改动跳走)
  useEffect(() => { setDrafts({}); }, [filterStore, month]);
  const guardSwitch = () => {
    const n = pendingCount;
    if (n > 0) {
      alert(`还有 ${n} 项改动未提交。\n请先点底部「确认提交」输密码写入数据库, 或点「撤销全部」放弃改动。`);
      return false;
    }
    return true;
  };
  const submitAll = () => {
    if (!pendingCount) return;
    setPwd(""); setPwdErr(""); setPwdOpen(true);            // 不论改 1 项还是多项, 提交都要输密码
  };
  const confirmBatch = () => {
    if (pwd.trim() !== OPS_PWD) { setPwdErr("密码不正确, 请重新输入"); return; }
    writeAll();
  };
  const discardAll = () => { setPendingMap({}); setDrafts({}); setPwdOpen(false); setPwd(""); setPwdErr(""); };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>店铺运维费用</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            月份 × 店铺 × 站点 × 费用类别 · 站点金额=欧元 € · 网络IP等月固定=人民币 ¥ · 右侧自动折算人民币 · 改完点底部「确认提交」输密码入库 · {
              !canEdit ? "只读"
                : filterStore ? `当前店铺「${filterStore}」可直接录`
                  : "全部店铺汇总(只读) · 选一个店铺即可录入"
            }
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.sub }}>平台:</span>
          <select value={plat} onChange={e => {
              if (!guardSwitch()) return;
              const np = e.target.value;
              setPlat(np);
              const first = (PLAT_STORES_OPS[np] || [])[0] || "";
              setFilterStore(first);
            }}
            style={{ padding: "5px 10px", background: C.bg, border: `1px solid ${plat !== "amazon" ? C.brand : C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, fontWeight: plat !== "amazon" ? 700 : 400 }}>
            <option value="amazon">亚马逊</option>
            <option value="cdiscount">Cdiscount</option>
            <option value="manomano">ManoMano</option>
          </select>
          <span style={{ fontSize: 12, color: C.sub }}>店铺:</span>
          <select value={filterStore} onChange={e => { if (!guardSwitch()) return; setFilterStore(e.target.value); }}
            style={{ padding: "5px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }}>
            <option value="">全部店铺(汇总)</option>
            {storeOpts.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ fontSize: 12, color: C.sub }}>月份:</span>
          <select value={month.slice(0, 4)} onChange={e => { if (!guardSwitch()) return; setMonth(`${e.target.value}-${month.slice(5, 7)}-01`); }}
            style={{ padding: "5px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }}>
            {YEARS.map(y => <option key={y} value={String(y)}>{y}年</option>)}
          </select>
          <select value={month.slice(5, 7)} onChange={e => { if (!guardSwitch()) return; setMonth(`${month.slice(0, 4)}-${e.target.value}-01`); }}
            style={{ padding: "5px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }}>
            {MONTHS.map(m => <option key={m} value={m}>{Number(m)}月</option>)}
          </select>
          <RateField month={month} canEdit={canEditRate} pwd={OPS_PWD} onRate={setRate} />
        </div>
      </div>
      {!loaded && <div style={{ padding: 30, textAlign: "center", color: C.faint }}>加载中…</div>}
      {loaded && (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "auto" }}>
          <div style={{ minWidth: 1420 }}>
            <div style={{ display: "grid", gridTemplateColumns: `250px repeat(${SITES.length}, 110px) 130px 130px`, background: "#1f3a68", fontSize: 12, color: "#fff", fontWeight: 600 }}>
              <div style={{ padding: "10px 12px", borderRight: `1px solid #2a4a78` }}>
                {month.slice(0, 7)} · {filterStore || "全部店铺"}
              </div>
              {SITES.map(s => <div key={s} style={{ padding: "10px 8px", textAlign: "right", borderRight: `1px solid #2a4a78` }}>{s}</div>)}
              <div style={{ padding: "10px 12px", textAlign: "right", borderRight: `1px solid #2a4a78` }}>合计 €</div>
              <div style={{ padding: "10px 12px", textAlign: "right" }}>折算人民币 ¥</div>
            </div>
            {CATS.map(cat => (
              isMonthly(cat) ? (() => {                       // 月固定费用行: 不区分站点, 只在合计列录入
                const v = monthlyVal(cat);
                const k = `${MONTHLY_SITE}|${cat}`;
                return (
                  <div key={cat} style={{ display: "grid", gridTemplateColumns: `250px repeat(${SITES.length}, 110px) 130px 130px`, borderTop: `1px solid ${C.line}`, fontSize: 12, background: "rgba(127,119,221,.10)" }}>
                    <div style={{ padding: "10px 12px", fontWeight: 600, color: C.ink }}>
                      {cat}
                      <span style={{ marginLeft: 6, fontSize: 10, color: "#CECBF6", border: "1px solid #534AB7", background: "rgba(127,119,221,.18)", borderRadius: 4, padding: "1px 5px" }}>月固定 · 不分国家</span>
                    </div>
                    {SITES.map(site => (
                      <div key={site} style={{ padding: "8px 10px", textAlign: "right", color: C.faint }}>—</div>
                    ))}
                    <div style={{ padding: "8px 12px", textAlign: "right", color: C.faint }}>—</div>
                    <div style={{ padding: "3px 8px" }}>
                      {canEditCell ? (
                        <input
                          value={drafts[k] !== undefined ? drafts[k] : (v ? String(v) : "")}
                          onChange={e => setDraft(MONTHLY_SITE, cat, e.target.value)}
                          onFocus={e => e.target.select()}
                          onBlur={() => requestCell(MONTHLY_SITE, cat)}
                          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                          placeholder="—" inputMode="decimal" title="人民币金额 (¥)"
                          style={{ width: "100%", padding: "5px 8px", textAlign: "right", background: pendingMap[k] ? "#d9a44118" : C.bg, border: `1px solid ${pendingMap[k] ? "#d9a441" : C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, fontWeight: 600, outline: "none" }} />
                      ) : (
                        <div style={{ padding: "5px 4px", textAlign: "right", fontWeight: 700, color: v ? C.ink : C.faint }}>{v ? v.toFixed(2) : "—"}</div>
                      )}
                    </div>
                  </div>
                );
              })() : (
              <div key={cat} style={{ display: "grid", gridTemplateColumns: `250px repeat(${SITES.length}, 110px) 130px 130px`, borderTop: `1px solid ${C.line}`, fontSize: 12 }}>
                <div style={{ padding: "10px 12px", fontWeight: 600, color: C.ink, background: C.bg }}>{cat}</div>
                {SITES.map(site => {
                  const v = getVal(site, cat);
                  const k = `${site}|${cat}`;
                  if (!canEditCell) {                       // 汇总视图 / 无权限 → 纯文本
                    return (
                      <div key={site} style={{ padding: "8px 10px", textAlign: "right", fontWeight: v ? 600 : 400, color: v ? C.ink : C.faint }}>
                        {v ? v.toFixed(2) : "—"}
                      </div>
                    );
                  }
                  return (
                    <div key={site} style={{ padding: "3px 5px" }}>
                      <input
                        value={drafts[k] !== undefined ? drafts[k] : (v ? String(v) : "")}
                        onChange={e => setDraft(site, cat, e.target.value)}
                        onFocus={e => e.target.select()}
                        onBlur={() => requestCell(site, cat)}
                        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        placeholder="—" inputMode="decimal"
                        style={{ width: "100%", padding: "5px 8px", textAlign: "right", background: pendingMap[k] ? "#d9a44118" : C.bg, border: `1px solid ${pendingMap[k] ? "#d9a441" : C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, fontWeight: v ? 600 : 400, outline: "none" }} />
                    </div>
                  );
                })}
                <div style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: C.brand, background: C.bg, borderRight: `1px solid ${C.line}` }}>
                  {total(cat).toFixed(2)}
                </div>
                <div style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#5DCAA5", background: "rgba(15,110,86,.15)" }}>
                  ¥{toRmb(cat).toFixed(2)}
                </div>
              </div>
              )
            ))}
            <div style={{ display: "grid", gridTemplateColumns: `250px repeat(${SITES.length}, 110px) 130px 130px`, borderTop: `2px solid ${C.line}`, background: C.bg, fontSize: 12 }}>
              <div style={{ padding: "10px 12px", fontWeight: 700, color: C.brand }}>站点合计</div>
              {SITES.map(site => (
                <div key={site} style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: C.brand }}>
                  {totalSite(site).toFixed(2)}
                </div>
              ))}
              <div style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: C.brand, borderRight: `1px solid ${C.line}` }}>
                {eurTotal.toFixed(2)}
              </div>
              <div style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#fff", background: "#0F6E56" }}>
                ¥{rmbTotal.toFixed(2)}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `250px repeat(${SITES.length}, 110px) 130px 130px`, borderTop: `1px solid ${C.line}`, background: C.panel, fontSize: 11 }}>
              <div style={{ padding: "8px 12px", color: C.faint }}>说明</div>
              <div style={{ gridColumn: `span ${SITES.length + 1}`, padding: "8px 12px", color: C.faint }}>
                站点金额均为欧元(€) · 本月汇率 €→¥ = {rate} · 月度核算费用 ¥ = (欧元合计 {eurTotal.toFixed(2)} × {rate}) + 网络IP等月固定 ¥{monthlyRmb.toFixed(2)}
              </div>
              <div style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#5DCAA5" }}>¥{rmbTotal.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* 待提交浮条: 改动只缓存在页面, 点确认提交才输密码一次性入库 */}
      {pendingCount > 0 && !pwdOpen && (
        <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 26, zIndex: 110, background: C.panel, border: `1px solid #d9a441`, boxShadow: "0 10px 30px rgba(0,0,0,.28)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 12, color: C.ink }}>
            本次已改 <b style={{ color: C.brand, fontSize: 14 }}>{pendingCount}</b> 项 · 尚未入库, 点右侧确认提交(需密码)
          </span>
          <button onClick={discardAll} style={{ padding: "6px 12px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 12, cursor: "pointer" }}>撤销全部</button>
          <button onClick={submitAll} style={{ padding: "6px 16px", background: C.brand, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>确认提交</button>
        </div>
      )}

      {/* 提交确认框: 列出全部改动 + 输密码 852963 */}
      {pwdOpen && (
        <div onClick={() => { setPwdOpen(false); setPwd(""); setPwdErr(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, width: 460, maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>确认提交 {pendingCount} 项改动</div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 14 }}>核对无误后输入密码, 一次性写入数据库</div>
            <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 14 }}>
              <div style={{ display: "flex", color: C.sub, fontSize: 11, paddingBottom: 6, borderBottom: `1px solid ${C.line}` }}>
                <span style={{ width: 100 }}>费用类别</span>
                <span style={{ width: 70 }}>站点</span>
                <span style={{ flex: 1, textAlign: "right" }}>原值 → 新值</span>
              </div>
              {pendingList.map(it => (
                <div key={it.key} style={{ display: "flex", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.line}` }}>
                  <span style={{ width: 100, color: C.ink }}>{it.category}</span>
                  <span style={{ width: 70, color: C.sub }}>{it.site}</span>
                  <span style={{ flex: 1, textAlign: "right" }}>
                    <span style={{ color: C.faint }}>{it.oldV ? it.oldV.toFixed(2) : "—"}</span>
                    <span style={{ margin: "0 6px", color: C.faint }}>→</span>
                    <span style={{ color: C.brand, fontWeight: 700 }}>{it.amount.toFixed(2)} €</span>
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>确认密码</div>
            <input type="password" value={pwd} autoFocus
              onChange={e => { setPwd(e.target.value); setPwdErr(""); }}
              onKeyDown={e => { if (e.key === "Enter") confirmBatch(); if (e.key === "Escape") { setPwdOpen(false); setPwd(""); setPwdErr(""); } }}
              placeholder="输入密码"
              style={{ width: "100%", padding: "9px 12px", background: C.bg, border: `1px solid ${pwdErr ? "#c05b52" : C.line}`, borderRadius: 6, color: C.ink, fontSize: 14, marginBottom: 6 }} />
            {pwdErr && <div style={{ fontSize: 11, color: "#c05b52", marginBottom: 6 }}>{pwdErr}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => { setPwdOpen(false); setPwd(""); setPwdErr(""); }} style={{ flex: 1, padding: "9px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>返回继续改</button>
              <button onClick={confirmBatch} style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>确认提交</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- 店铺月度核算 ----------------
// 口径 (KK 2026-09-16 定):
//   单位 = 人民币 ¥; 每个月独立一张表 (顶部选月份)
//   各项成本 = 店铺运维费用 (自动: 欧元合计 × 汇率 + 月固定¥)
//   人工 = 直接取人力系统(锁定只读); 场地 / 其他 = 手工录入 (表 store_monthly_costs) — KK 2026-09-27
//   店铺利润 = 收入 − 各项成本 − 店铺其他费用 ; 净利润 = 店铺利润 − 人工 − 场地 − 其他 (自动)
// 录入规则与店铺运维费用一致: 改动先缓存 → 底部「确认提交」→ 输密码 852963 → 一次性入库
// 权限: 管理层 = admin + 法国成员(fr) + 成都采购(黄丹, cd_procurement), 读写都只给这三个角色
function StoreMonthly() {
  const cur = new Date();
  const YEARS = Array.from({ length: 6 }, (_, i) => cur.getFullYear() - 3 + i);
  const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  // —— 三家共享人工/场地 (KK 2026-09-17) ——
  // 飞鸟/野趣/屿阔 三家共用人工+场地: 只在「三家合计」列填一次, 三家合计利润里只扣一次
  // 「其他」(办公室费用明细) 改成自动从「办公室费用明细」Tab 汇总当月 office_expense 合计 (KK 2026-09-17)
  // 注: SHARE_GROUP / ALL_STORES / ROLE_STORES 已提到文件顶部统一定义
  const SHARE_ITEMS = ["人工", "场地", "其他"];   // 其他=办公室费用明细, 三家合并格里只读显示
  const SHARE_STORE = "__shared__";        // 共享费用在 store_monthly_costs 里的存放键 (仅人工/场地写入)
  // 科目 (KK 2026-09-17 定):
  //   店铺利润 = 收入 − 各项成本 − 店铺其他费用
  //   净利润   = 店铺利润 − 人工 − 场地 − 办公室费用明细
  // 注意: k = 数据库里的 item 键(保持不动, 历史数据不丢); l = 显示名
  const ROWS = [
    { k: "收入", type: "manual", lockAdmin: true },   // 只有 admin 可改 — KK 2026-09-19
    { k: "各项成本", type: "auto" },
    { k: "店铺其他费用", type: "storeother" },   // 自动汇总 store_other_expense 按店 (KK 2026-09-17 选 A 联动)
    { k: "店铺利润", type: "calc" },
    { k: "人工", type: "manual" },
    { k: "场地", type: "manual" },
    { k: "其他", l: "办公室费用明细", type: "manual" },
    { k: "净利润", type: "net" },
  ];
  const MANUAL = ROWS.filter(r => r.type === "manual").map(r => r.k);
  const PWD = "852963";

  const [month, setMonth] = useState(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-01`);
  // 汇率按「月」各自记录 (表 fx_rates) 且改动需密码: 见 <RateField />
  const [rate, setRate] = useState(8.0);
  const [opsRows, setOpsRows] = useState([]);       // 店铺运维费用 (当月)
  const [costRows, setCostRows] = useState([]);     // 手工录入 (当月)
  const [officeRows, setOfficeRows] = useState([]); // 办公室费用明细 (当月, 取合计填入「其他」行)
  const [otherRows, setOtherRows] = useState([]);   // 店铺其他费用明细 (当月, 按店汇总填入「店铺其他费用」行)
  const [hrLabor, setHrLabor] = useState(null);     // 「人工」= 人力系统当月总人力成本 (直接取数, 锁定不可手填) — KK 2026-09-27
  const [loaded, setLoaded] = useState(false);
  const [role, setRole] = useState(null);
  const [roleReady, setRoleReady] = useState(false);   // 角色未取回前不渲染表格, 防止越权店铺闪现
  // 可见店铺 (按角色收窄) + 三店共享开关 + 表格模板
  const STORES = (role && ROLE_STORES[role]) || ALL_STORES;
  const shareOn = SHARE_GROUP.every(s => STORES.includes(s));
  const GRID = `220px repeat(${STORES.length}, 1fr)`;
  const [drafts, setDrafts] = useState({});
  const [pendingMap, setPendingMap] = useState({});
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const pendingCount = Object.keys(pendingMap).length;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data && data.user) setRole(getUserRole(data.user.email || ""));
    }).catch(() => {}).finally(() => setRoleReady(true));
  }, []);
  // 仅管理层: admin + 法国成员 fr + 成都采购(黄丹) — KK 2026-09-16 定
  // 可写: admin(你) + 成都采购(黄丹) + 财务专员(夏蕾) —— 法国成员(泺伊)只读 — KK 2026-09-18 定
  const canEdit = role === "admin" || role === "cd_procurement" || role === "finance";
  const canEditRate = canEdit;
  // 「收入」只有 admin(KK) 可改, 其他角色一律只读 — KK 2026-09-19 定
  const canEditIncome = role === "admin";

  const load = () => {
    setLoaded(false);
    const [yy, mm] = month.slice(0, 7).split("-").map(Number);
    const offStart = `${month.slice(0, 7)}-01`;
    const offEnd = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}-01`;
    // 数据按角色收窄: 黄丹(采购)只取三家的行 (store_monthly_costs 还需带上共享键 __shared__) — KK 2026-09-18
    const sc = (role && ROLE_STORES[role]) || null;
    const scoped = (q, withShared) => sc ? q.in("store", withShared ? [...sc, SHARE_STORE] : sc) : q;
    Promise.all([
      scoped(supabase.from("opsfee_monthly").select("*").eq("month", month)),
      scoped(supabase.from("store_monthly_costs").select("*").eq("month", month), true),
      supabase.from("office_expense").select("amount,region").gte("exp_date", offStart).lt("exp_date", offEnd),
      scoped(supabase.from("store_other_expense").select("store, amount").gte("exp_date", offStart).lt("exp_date", offEnd)),
    ]).then(([a, b, c, d]) => {
      if (a.error) alert("读取运维费用失败: " + a.error.message);
      if (b.error) alert("读取手工录入失败(请先建表 store_monthly_costs): " + b.error.message);
      if (c.error) console.warn("读取办公室费用明细失败(请跑 sql/create_office_expense.sql): " + c.error.message);
      if (d.error) console.warn("读取店铺其他费用失败(请跑 sql/create_store_other_expense.sql): " + d.error.message);
      setOpsRows(a.data || []); setCostRows(b.data || []); setOtherRows(d.data || []); setLoaded(true);
      // 办公室费用: 带 region 取; 若 region 列还没建 (sql/office_expense_region.sql 未跑) → 退回只取 amount
      if (c.error && /column|schema cache|does not exist/i.test(c.error.message || "")) {
        supabase.from("office_expense").select("amount").gte("exp_date", offStart).lt("exp_date", offEnd)
          .then(({ data, error }) => {
            if (error) console.warn("读取办公室费用明细失败: " + error.message);
            setOfficeRows(data || []);
          });
      } else {
        setOfficeRows(c.data || []);
      }
    });
  };
  useEffect(() => { if (role !== null) load(); }, [month, role]);

  // 「人工」= 直接取人力系统的当月总人力成本 (public.hr_labor_cost, 口径 = 人力面板底部「总人力成本」)
  //   取不到数(函数还没建 / 没权限) → 退回库里旧值, 前端一律只读, 谁都不能手填 — KK 2026-09-27
  useEffect(() => {
    let alive = true;
    setHrLabor(null);
    supabase.rpc("hr_labor_cost", { p_period: month.slice(0, 7) }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { console.warn("读取人力系统人工失败(需先跑 打通运营系统_人工取数.sql): " + error.message); setHrLabor(null); return; }
      setHrLabor(data === null || data === undefined ? null : Number(data));
    });
    return () => { alive = false; };
  }, [month]);

  // 「各项成本」= 运维费用: 欧元合计 × 汇率 + 月固定¥ (该店铺当月完全没数据则记 0)
  const opsCost = (store) => {
    if (!opsRows.some(r => r.store === store)) return 0;
    // 只统计运维费用页面定义的标准类别 (OPS_CATS) —— 历史遗留的变体类别名不计入, 防虚增 (KK 2026-09-19)
    const eur = opsRows.filter(r => r.store === store && OPS_CATS.includes(r.category) && !Object.prototype.hasOwnProperty.call(OPS_MONTHLY_CATS, r.category))
      .reduce((s, x) => s + Number(x.amount || 0), 0);
    const fixed = Object.entries(OPS_MONTHLY_CATS).reduce((s, [cat, def]) => {
      const rs = opsRows.filter(r => r.store === store && r.category === cat && r.site === OPS_MONTHLY_SITE);
      return s + (rs.length ? rs.reduce((a, x) => a + Number(x.amount || 0), 0) : def);
    }, 0);
    return eur * rate + fixed;
  };
  // 手工录入值 (null = 还没录)
  // 「其他」(办公室费用明细) = 当月 office_expense 合计 (自动汇总, 三家合计利润里扣一次)
  const officeTotal = officeRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  // 按区域归集 (KK 2026-09-19): 中国公司 / 法国公司 / 未设置
  const offRegion = (k) => officeRows.filter(r => (r.region || "") === k).reduce((a, r) => a + Number(r.amount || 0), 0);
  const offCN = offRegion("中国"), offFR = offRegion("法国");
  const offNA = officeTotal - offCN - offFR;
  // 「店铺其他费用」= 当月 store_other_expense 按店合计 (自动汇总, 各店利润里扣各自的)
  const storeOtherTotal = (store) => otherRows.filter(r => r.store === store).reduce((s, r) => s + Number(r.amount || 0), 0);
  const manVal = (store, item) => {
    const r = costRows.find(x => x.store === store && x.item === item);
    return r ? Number(r.amount || 0) : null;
  };
  const manNum = (store, item) => { const v = manVal(store, item); return v === null ? 0 : v; };
  const shopProfit = (store) => manNum(store, "收入") - opsCost(store) - storeOtherTotal(store);
  const netOf = (store) => shopProfit(store) - manNum(store, "人工") - manNum(store, "场地") - (SHARE_GROUP.includes(store) && shareOn ? 0 : manNum(store, "其他"));
  // 三家共享「人工」= 人力系统当月总人力成本 (锁定只读); 取不到数时退回库里旧值, 再退回 0 — KK 2026-09-27
  const laborShared = () => (hrLabor !== null ? hrLabor : manNum(SHARE_STORE, "人工"));
  // 三家共享「场地」= 可手填; 没单独录过的月份按默认 ¥3,800 计 (历史月份金额因此一分不变) — KK 2026-09-27 放开
  const siteShared = () => { const v = manVal(SHARE_STORE, "场地"); return v === null ? SHARED_SITE_FEE : Number(v); };
  // 三家共享组的合计净利润 = 三家店铺利润合计 − 共享人工 − 共享场地 − 当月办公室费用明细合计 (自动汇总)
  const shareIncomeEntered = () => SHARE_GROUP.some(st => incomeEntered(st));
  const shareGroupProfit = () => SHARE_GROUP.reduce((s, st) => s + shopProfit(st), 0)
    - laborShared() - siteShared()
    - officeTotal;
  const incomeEntered = (store) => manVal(store, "收入") !== null;

  // —— 录入: 同店铺运维费用 (缓存 → 确认提交 → 密码 → 入库) ——
  const setDraft = (store, item, v) => setDrafts(p => ({ ...p, [`${store}|${item}`]: v }));
  const clearDraft = (store, item) => setDrafts(p => { const n = { ...p }; delete n[`${store}|${item}`]; return n; });
  const dropPending = (keys) => setPendingMap(p => { const n = { ...p }; keys.forEach(k => delete n[k]); return n; });
  const requestCell = (store, item) => {
    const key = `${store}|${item}`;
    const raw = drafts[key];
    if (raw === undefined || !canEdit) return;
    const existing = costRows.find(x => x.store === store && x.item === item);
    const oldV = existing ? Number(existing.amount || 0) : 0;
    const amount = raw.trim() === "" ? 0 : Number(raw);
    if (isNaN(amount)) { alert("金额必须是数字"); setDraft(store, item, oldV ? String(oldV) : ""); return; }
    if (existing && oldV === amount) { clearDraft(store, item); dropPending([key]); return; }
    if (!existing && raw.trim() === "") { clearDraft(store, item); dropPending([key]); return; }
    setPendingMap(p => ({ ...p, [key]: { key, store, item, amount, oldV, existingId: existing ? existing.id : null, month } }));
  };
  const writeAll = async () => {
    const list = Object.values(pendingMap);
    if (!list.length) return;
    const done = [], added = [];
    let errMsg = "";
    for (const it of list) {
      if (it.existingId) {
        const { error } = await supabase.from("store_monthly_costs").update({ amount: it.amount }).eq("id", it.existingId);
        if (error) { errMsg = error.message; continue; }
      } else {
        const { data, error } = await supabase.from("store_monthly_costs")
          .insert({ month: it.month || month, store: it.store, item: it.item, amount: it.amount }).select().single();
        if (error) { errMsg = error.message; continue; }
        if (data) added.push(data);
      }
      done.push(it);
    }
    if (done.length) {
      const upd = {};
      done.forEach(o => { if (o.existingId) upd[o.existingId] = o.amount; });
      setCostRows(prev => [...prev.map(r => (r.id in upd ? { ...r, amount: upd[r.id] } : r)), ...added]);
      setDrafts(p => { const n = { ...p }; done.forEach(o => delete n[`${o.store}|${o.item}`]); return n; });
      dropPending(done.map(o => o.key));
    }
    setPwdOpen(false); setPwd(""); setPwdErr("");
    if (errMsg) alert("部分保存失败: " + errMsg);
  };
  const guardSwitch = () => {
    if (pendingCount > 0) {
      alert(`还有 ${pendingCount} 项改动未提交。\n请先点底部「确认提交」输密码写入数据库, 或点「撤销全部」放弃改动。`);
      return false;
    }
    return true;
  };
  const submitAll = () => { if (!pendingCount) return; setPwd(""); setPwdErr(""); setPwdOpen(true); };
  const confirmBatch = () => {
    if (pwd.trim() !== PWD) { setPwdErr("密码不正确, 请重新输入"); return; }
    writeAll();
  };
  const discardAll = () => { setPendingMap({}); setDrafts({}); setPwdOpen(false); setPwd(""); setPwdErr(""); };

  const th = { padding: "10px 12px", fontSize: 12, color: "#fff", fontWeight: 600, textAlign: "right" };
  const td = { padding: "6px 10px", fontSize: 12, textAlign: "right" };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>店铺月度核算</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            每月独立一张 · 单位：人民币 ¥ · 店铺利润 = 收入−各项成本−店铺其他费用 · 净利润 = 店铺利润−人工−场地−办公室费用明细 · {month.slice(0, 7)} 办公室费用明细汇总 ¥{officeTotal.toFixed(2)} {officeRows.length ? `(${officeRows.length} 条)` : "(尚无明细)"}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.sub }}>月份:</span>
          <select value={month.slice(0, 4)} onChange={e => { if (!guardSwitch()) return; setMonth(`${e.target.value}-${month.slice(5, 7)}-01`); }}
            style={{ padding: "5px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }}>
            {YEARS.map(y => <option key={y} value={String(y)}>{y}年</option>)}
          </select>
          <select value={month.slice(5, 7)} onChange={e => { if (!guardSwitch()) return; setMonth(`${month.slice(0, 4)}-${e.target.value}-01`); }}
            style={{ padding: "5px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }}>
            {MONTHS.map(m => <option key={m} value={m}>{Number(m)}月</option>)}
          </select>
          <RateField month={month} canEdit={canEditRate} pwd={PWD} onRate={setRate} />
        </div>
      </div>

      {(!loaded || !roleReady) && <div style={{ padding: 30, textAlign: "center", color: C.faint }}>加载中…</div>}

      {loaded && roleReady && (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "auto" }}>
          <div style={{ minWidth: 900 }}>
            <div style={{ display: "grid", gridTemplateColumns: GRID, background: "#1f3a68" }}>
              <div style={{ ...th, textAlign: "left" }}>{month.slice(0, 7)} · 项目 (¥)</div>
              {STORES.map(s => (
                <div key={s} style={{ ...th, ...(shareOn && SHARE_GROUP.includes(s) ? { background: "#2a4a78" } : {}) }}
                  title={shareOn && SHARE_GROUP.includes(s) ? `${SHARE_GROUP.join(" / ")} 三家: 人工/场地 共享(只扣一次), 办公室费用明细 = 当月明细页合计, 净利润按三家合计` : undefined}>
                  {s}
                </div>
              ))}
            </div>
            {ROWS.map((row, i) => {
              const isAuto = row.type === "auto";
              const isCalc = row.type === "calc";
              const isNet = row.type === "net";
              const isShared = SHARE_ITEMS.includes(row.k);
              const merged = shareOn && (isShared || isNet);      // 这三家上合并成一格
              const MERGE_SPAN = SHARE_GROUP.length;
              const firstIdx = STORES.findIndex(s => SHARE_GROUP.includes(s));
              return (
                <div key={row.k} style={{ display: "grid", gridTemplateColumns: GRID, borderTop: i ? `1px solid ${C.line}` : "none", background: isNet ? "rgba(77,182,164,.10)" : (isCalc ? "rgba(77,182,164,.05)" : (i % 2 ? C.bg : "transparent")) }}>
                  <div style={{ ...td, textAlign: "left", fontWeight: 600, color: (isNet || isCalc) ? C.brand : C.ink }}>
                    {row.l || row.k}
                    {isAuto && <span style={{ marginLeft: 6, fontSize: 10, color: C.sub, border: `1px solid ${C.line}`, borderRadius: 4, padding: "1px 5px" }}>自动·运维费用</span>}
                    {row.lockAdmin && <span style={{ marginLeft: 6, fontSize: 10, color: C.sub, border: `1px solid ${C.line}`, borderRadius: 4, padding: "1px 5px" }} title="仅 admin(KK) 可修改, 其他角色只读">仅 admin 可改</span>}
                    {isCalc && <span style={{ marginLeft: 6, fontSize: 10, color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 4, padding: "1px 5px" }} title="收入 − 各项成本 − 店铺其他费用">自动计算</span>}
                    {row.type === "storeother" && <span style={{ marginLeft: 6, fontSize: 10, color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 4, padding: "1px 5px" }} title="由「店铺其他费用」Tab 当月按店合计自动填入, 这里只读, 改去明细页维护">自动·明细页</span>}
                    {isNet && <span style={{ marginLeft: 6, fontSize: 10, color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 4, padding: "1px 5px" }} title={`${SHARE_GROUP.join("/")} 三家合计: 店铺利润合计 − 共享人工 − 共享场地 − 当月办公室费用明细合计; 其余店铺各自 = 店铺利润 − 人工 − 场地 − 办公室费用明细`}>自动计算</span>}
                    {shareOn && isShared && row.k !== "其他" && <span style={{ marginLeft: 6, fontSize: 10, color: "#CECBF6", border: "1px solid #534AB7", background: "rgba(127,119,221,.18)", borderRadius: 4, padding: "1px 5px" }}>三家共享·只扣一次</span>}
                    {shareOn && row.k === "其他" && <span style={{ marginLeft: 6, fontSize: 10, color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 4, padding: "1px 5px" }} title="由「办公室费用明细」Tab 自动汇总, 不可手填">自动·明细页</span>}
                  </div>
                  {STORES.map((st, idx) => {
                    const k = `${st}|${row.k}`;
                    // 三家合并格 (只渲染一次, 横跨三家列)
                    if (merged && SHARE_GROUP.includes(st)) {
                      if (idx !== firstIdx) return null;
                      const sk = `${SHARE_STORE}|${row.k}`;
                      const style = { gridColumn: `${idx + 2} / ${idx + 2 + MERGE_SPAN}`, borderRight: `1px solid ${C.line}`, background: "rgba(127,119,221,.10)" };
                      if (isNet) {                                    // 三家合计净利润
                        const blank = !shareIncomeEntered();
                        const v = shareGroupProfit();
                        return (
                          <div key="merged" style={{ ...style, ...td, padding: "12px 10px", fontWeight: 700, background: "rgba(77,182,164,.10)", color: blank ? C.faint : (v >= 0 ? C.brand : "#e0857a") }}>
                            {blank ? "—" : v.toFixed(2)}
                          </div>
                        );
                      }
                      // 「人工」= 人力系统取数, 锁定只读 (本页谁都改不了) — KK 2026-09-27
                      if (row.k === "人工") {
                        const lv = laborShared();
                        return (
                          <div key="merged" style={{ ...style, ...td, padding: "10px 10px", fontWeight: lv ? 700 : 400, color: lv ? C.ink : C.faint }}>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              {lv ? "¥" + lv.toFixed(2) : "—"}
                              <span style={{ marginLeft: 8, fontSize: 10, color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 4, padding: "1px 5px" }}
                                title="人工由「人力系统」自动取数 = 成都团队当月总人力成本(应发 + 公司社保 + 公司公积金); 这里只读, 数据在人力面板维护">自动·人力系统</span>
                            </div>
                          </div>
                        );
                      }
                      const v = manVal(SHARE_STORE, row.k);            // 场地: 共享输入
                      if (!canEdit) {                                  // 只读角色: 同样显示生效值(没录过 = 默认 3,800)
                        const ro = row.k === "场地" ? siteShared() : v;
                        return <div key="merged" style={{ ...style, ...td, padding: "12px 10px", fontWeight: ro ? 600 : 400, color: ro ? C.ink : C.faint }}>{ro === null ? "—" : ro.toFixed(2)}</div>;
                      }
                      // 场地 在三家合并格内填一次 (人工已在上面只读返回)
                      if (row.k === "其他") {                                // 办公室费用明细 = 当月 office_expense 合计 (自动汇总, 只读)
                        return (
                          <div key="merged" style={{ ...style, ...td, padding: "10px 10px", fontWeight: officeTotal ? 700 : 400, color: officeTotal ? C.ink : C.faint }}>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              {officeTotal ? "¥" + officeTotal.toFixed(2) : "—"}
                              <span style={{ marginLeft: 8, fontSize: 10, color: C.brand, border: `1px solid ${C.brand}`, borderRadius: 4, padding: "1px 5px" }}
                                title="由「办公室费用明细」Tab 当月合计自动填入, 这里只读, 改去明细页维护">自动·明细页</span>
                            </div>
                            {(offCN > 0 || offFR > 0 || offNA > 0) && (
                              <div style={{ fontSize: 10, fontWeight: 400, color: C.sub, marginTop: 3 }} title="按「办公室费用明细」的「区域」列归集">
                                法国公司 ¥{offFR.toFixed(2)} · 中国公司 ¥{offCN.toFixed(2)}{offNA > 0 ? ` · 未设置 ¥${offNA.toFixed(2)}` : ""}
                              </div>
                            )}
                          </div>
                        );
                      }
                      // 场地: 没单独录过的月份预填默认 3,800 (改了就以改的为准)
                      const shownV = row.k === "场地" ? siteShared() : v;
                      return (
                        <div key="merged" style={{ ...style, padding: "4px 8px" }}>
                          <input
                            value={drafts[sk] !== undefined ? drafts[sk] : (shownV === null ? "" : String(shownV))}
                            onChange={e => setDraft(SHARE_STORE, row.k, e.target.value)}
                            onFocus={e => e.target.select()}
                            onBlur={() => requestCell(SHARE_STORE, row.k)}
                            onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                            placeholder={`${SHARE_GROUP.join("/")} 三家共享, 填一次`} inputMode="decimal"
                            title={row.k === "场地"
                              ? "三家共享场地费: 没录过的月份默认 ¥3,800/月, 可以直接改 (KK 2026-09-27 放开手填)"
                              : "三家共用的这笔费用: 填一次, 三家合计利润里只扣一次"}
                            style={{ width: "100%", padding: "6px 8px", textAlign: "right", background: pendingMap[sk] ? "#d9a44118" : C.bg, border: `1px solid ${pendingMap[sk] ? "#d9a441" : "#534AB7"}`, borderRadius: 6, color: C.ink, fontSize: 12, fontWeight: pendingMap[sk] ? 600 : 400, outline: "none" }} />
                        </div>
                      );
                    }
                    if (isAuto) {
                      const v = opsCost(st);
                      return <div key={st} style={{ ...td, padding: "12px 10px", color: v ? C.ink : C.faint, fontWeight: v ? 600 : 400 }}>{v ? v.toFixed(2) : "—"}</div>;
                    }
                    if (row.type === "storeother") {            // 店铺其他费用 = 当月 store_other_expense 按店合计 (自动, 只读)
                      const v = storeOtherTotal(st);
                      // 没录入的月份一律按 0 显示 — 全部店铺全部月份 (KK 2026-09-19)
                      return (
                        <div key={st} style={{ ...td, padding: "12px 10px", fontWeight: v ? 600 : 400, color: v ? C.ink : C.sub }}
                          title={v ? "由「店铺其他费用」Tab 当月按店合计自动填入" : "该月没有明细记录 → 按 0 计"}>
                          ¥{v.toFixed(2)}
                        </div>
                      );
                    }
                    if (isCalc || isNet) {
                      const ok = incomeEntered(st);
                      const v = isNet ? netOf(st) : shopProfit(st);
                      return <div key={st} style={{ ...td, padding: "12px 10px", fontWeight: 700, color: !ok ? C.faint : (v >= 0 ? C.ink : "#e0857a") }}>{ok ? v.toFixed(2) : "—"}</div>;
                    }
                    const v = manVal(st, row.k);
                    // 场地已放开: 走下面的通用输入框, 按店各填 (KK 2026-09-27)
                    const rowEditable = canEdit && (!row.lockAdmin || canEditIncome);
                    if (!rowEditable) {
                      return <div key={st} style={{ ...td, padding: "12px 10px", fontWeight: v ? 600 : 400, color: v ? C.ink : C.faint }} title={row.lockAdmin ? "收入仅 admin(KK) 可修改" : ""}>{v === null ? "—" : v.toFixed(2)}</div>;
                    }
                    return (
                      <div key={st} style={{ padding: "4px 8px" }}>
                        <input
                          value={drafts[k] !== undefined ? drafts[k] : (v === null ? "" : String(v))}
                          onChange={e => setDraft(st, row.k, e.target.value)}
                          onFocus={e => e.target.select()}
                          onBlur={() => requestCell(st, row.k)}
                          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                          placeholder="—" inputMode="decimal"
                          style={{ width: "100%", padding: "6px 8px", textAlign: "right", background: pendingMap[k] ? "#d9a44118" : C.bg, border: `1px solid ${pendingMap[k] ? "#d9a441" : C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, fontWeight: pendingMap[k] ? 600 : 400, outline: "none" }} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: C.faint, lineHeight: 1.8 }}>
        · <b>各项成本</b> 自动取自「店铺运维费用」当月数据 (欧元合计 × 汇率 + 月固定¥), 不用手填<br />
        · <b>收入</b> 按店铺手工录入<br />
        · <b>店铺其他费用</b> 由「店铺其他费用」Tab 当月按店合计自动填入 (只读, 改去明细页维护)<br />
        · <b>人工</b> 由「人力系统」自动取数(成都团队当月总人力成本 = 应发 + 公司社保 + 公司公积金), <b>锁定不可手填</b>, 其余店铺仍按店手填 · <b>场地</b> {SHARE_GROUP.join("/")} 三家共享 <b>可手填</b>(没录过的月份按默认 ¥3,800 计), 三家合并成一格填一次, 不重复扣<br />
        · <b>办公室费用明细</b> 由「办公室费用明细」Tab 自动汇总当月 office_expense 合计, 三家合并格里只读显示(非 share 店铺仍可按店手填)<br />
        · 单店 <b>店铺利润</b> = 收入 − 各项成本 − 店铺其他费用<br />
        · <b>净利润</b>: {SHARE_GROUP.join("/")} = 三家店铺利润合计 − 共享人工 − 共享场地 − 当月办公室费用明细合计; 其余店铺各自 = 店铺利润 − 人工 − 场地 − 办公室费用明细<br />
        · 收入的长期来源待定 (后续可接订单数据), 现在先手工填
      </div>

      {pendingCount > 0 && !pwdOpen && (
        <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 26, zIndex: 110, background: C.panel, border: "1px solid #d9a441", boxShadow: "0 10px 30px rgba(0,0,0,.28)", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 12, color: C.ink }}>
            本次已改 <b style={{ color: C.brand, fontSize: 14 }}>{pendingCount}</b> 项 · 尚未入库, 点右侧确认提交(需密码)
          </span>
          <button onClick={discardAll} style={{ padding: "6px 12px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 12, cursor: "pointer" }}>撤销全部</button>
          <button onClick={submitAll} style={{ padding: "6px 16px", background: C.brand, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>确认提交</button>
        </div>
      )}

      {pwdOpen && (
        <div onClick={() => { setPwdOpen(false); setPwd(""); setPwdErr(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, width: 460, maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>确认提交 {pendingCount} 项改动</div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 14 }}>核对无误后输入密码, 一次性写入数据库</div>
            <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 14 }}>
              <div style={{ display: "flex", color: C.sub, fontSize: 11, paddingBottom: 6, borderBottom: `1px solid ${C.line}` }}>
                <span style={{ width: 90 }}>项目</span>
                <span style={{ width: 90 }}>店铺</span>
                <span style={{ flex: 1, textAlign: "right" }}>原值 → 新值</span>
              </div>
              {Object.values(pendingMap).map(it => (
                <div key={it.key} style={{ display: "flex", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.line}` }}>
                  <span style={{ width: 90, color: C.ink }}>{it.item}</span>
                  <span style={{ width: 90, color: C.sub }}>{it.store}</span>
                  <span style={{ flex: 1, textAlign: "right" }}>
                    <span style={{ color: C.faint }}>{it.oldV ? it.oldV.toFixed(2) : "—"}</span>
                    <span style={{ margin: "0 6px", color: C.faint }}>→</span>
                    <span style={{ color: C.brand, fontWeight: 700 }}>{it.amount.toFixed(2)}</span>
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>确认密码</div>
            <input type="password" value={pwd} autoFocus
              onChange={e => { setPwd(e.target.value); setPwdErr(""); }}
              onKeyDown={e => { if (e.key === "Enter") confirmBatch(); if (e.key === "Escape") { setPwdOpen(false); setPwd(""); setPwdErr(""); } }}
              placeholder="输入密码"
              style={{ width: "100%", padding: "9px 12px", background: C.bg, border: `1px solid ${pwdErr ? "#c05b52" : C.line}`, borderRadius: 6, color: C.ink, fontSize: 14, marginBottom: 6 }} />
            {pwdErr && <div style={{ fontSize: 11, color: "#c05b52", marginBottom: 6 }}>{pwdErr}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => { setPwdOpen(false); setPwd(""); setPwdErr(""); }} style={{ flex: 1, padding: "9px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>返回继续改</button>
              <button onClick={confirmBatch} style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>确认提交</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- 财务核算 ----------------
// 完整财务体系 4 大模块 (分阶段落地):
//   ① 订单量与营业额 (本期) - 已完成
//   ② 库存视角: 周转效率 / 库存天数 / 备货周期 / 滞销预警
//   ③ 利润体系: 单品利润 / 末端类目毛利 / 平台费 / 税费 / 净利
//   ④ 现金流体系 + 资本占用: 流入流出 / 应收回款 / 资金占用 / 90 天资金需求预测
// 权限: 仅 admin 可见可读写 (Tab 已在 App 层过滤, 此处兜底)
function Finance() {
  const [finRole, setFinRole] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data && data.user) setFinRole(getUserRole(data.user.email || ""));
    });
  }, []);
  // 可见/可查: admin + 成都采购(黄丹) — 2026-09-18 KK 定
  const isAdmin = finRole === "admin" || finRole === "cd_procurement" || finRole === "finance";
  // 数据按角色收窄: 黄丹(采购)只见三家 (飞鸟/野趣/屿阔) — 2026-09-18 KK 定
  const myStores = (finRole && ROLE_STORES[finRole]) || null;

  // ---- ① 订单量与营业额 ----
  const [rows, setRows] = useState([]);
  const [fDate1, setFDate1] = useState("");       // 起
  const [fDate2, setFDate2] = useState("");       // 止
  const [fStore, setFStore] = useState("");       // 店铺
  const [fSite, setFSite] = useState("");         // 站点
  const [fAsin, setFAsin] = useState("");         // ASIN
  // 店铺下拉: 固定用当前 6 家店铺 (OPS_FIXED_STORES) — KK 2026-09-17
  // 「财务核算」的 store 口径 = 店铺 (不是品牌), 与发货/库存/运维/月度核算 统一为中文店名, 不再从库里去重
  const storeOpts = myStores || OPS_FIXED_STORES;   // 黄丹只见三家, 下拉同步收窄
  const [siteOpts, setSiteOpts] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const loadSales = async () => {
    let q = supabase.from("finance_daily_sales").select("*");
    if (myStores) q = q.in("store", myStores);
    if (fDate1) q = q.gte("sale_date", fDate1);
    if (fDate2) q = q.lte("sale_date", fDate2);
    if (fStore) q = q.eq("store", fStore);
    if (fSite) q = q.eq("site", fSite);
    if (fAsin.trim()) q = q.ilike("asin", `%${fAsin.trim().toUpperCase()}%`);
    const { data, error } = await q.order("sale_date", { ascending: false }).limit(2000);
    if (error) { alert("读取失败(请先建表 finance_daily_sales): " + error.message); return; }
    setRows(data || []);
    // 首次加载时填充站点下拉 (店铺下拉固定用 OPS_FIXED_STORES)
    if (!loaded) {
      const { data: all } = await supabase.from("finance_daily_sales").select("site");
      const si = [...new Set((all || []).map(r => r.site).filter(Boolean))].sort();
      setSiteOpts(si); setLoaded(true);
    }
  };
  useEffect(() => { if (isAdmin) loadSales(); }, [isAdmin]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isAdmin && loaded) loadSales(); }, [fDate1, fDate2, fStore, fSite, fAsin]);

  const totQty = rows.reduce((s, r) => s + (r.order_qty || 0), 0);
  const totRev = rows.reduce((s, r) => s + Number(r.revenue || 0), 0);

  // ---- ④ 现金流 ----
  const [cfRows, setCfRows] = useState([]);
  const [cfD1, setCfD1] = useState("");       // 起
  const [cfD2, setCfD2] = useState("");       // 止
  const [cfStore, setCfStore] = useState(""); // 店铺
  const [cfChannel, setCfChannel] = useState(""); // 渠道
  const cfStoreOpts = storeOpts;   // 同上: 固定 6 家中文店铺 (黄丹只见三家)
  const [cfChannelOpts, setCfChannelOpts] = useState([]);
  const [cfLoaded, setCfLoaded] = useState(false);

  const loadCashflow = async () => {
    let q = supabase.from("finance_cashflow").select("*");
    if (myStores) q = q.in("store", myStores);
    if (cfD1) q = q.gte("tx_date", cfD1);
    if (cfD2) q = q.lte("tx_date", cfD2);
    if (cfStore) q = q.eq("store", cfStore);
    if (cfChannel) q = q.eq("channel", cfChannel);
    const { data, error } = await q.order("tx_date", { ascending: false }).limit(3000);
    if (error) { alert("读取失败(请先建表 finance_cashflow): " + error.message); return; }
    setCfRows(data || []);
    // 首次加载时填充渠道下拉 (店铺下拉固定用 OPS_FIXED_STORES)
    if (!cfLoaded) {
      const { data: all } = await supabase.from("finance_cashflow").select("channel");
      const ch = [...new Set((all || []).map(r => r.channel).filter(Boolean))].sort();
      setCfChannelOpts(ch); setCfLoaded(true);
    }
  };
  useEffect(() => { if (isAdmin) loadCashflow(); }, [isAdmin]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isAdmin && cfLoaded) loadCashflow(); }, [cfD1, cfD2, cfStore, cfChannel]);

  // 现金流汇总: 按币种分组 (流入/流出/净额)
  const cfByCur = useMemo(() => {
    const m = {};
    cfRows.forEach(r => {
      const c = r.currency || "CNY";
      if (!m[c]) m[c] = { income: 0, expense: 0 };
      if (r.type === "income") m[c].income += Number(r.amount || 0);
      else m[c].expense += Number(r.amount || 0);
    });
    return m;
  }, [cfRows]);

  // ⑤ 资本占用 & 资金成本: 拉 shipments 计算
  const [shipRows, setShipRows] = useState([]);
  useEffect(() => {
    if (!isAdmin) return;
    let q = supabase.from("shipments").select("store, ship_date, landed_cost, qty");
    if (myStores) q = q.in("store", myStores);
    q.then(({ data }) => setShipRows(data || []));
  }, [isAdmin]);

  const capitalUsage = useMemo(() => {
    const today = Date.now();
    let totalCost = 0, weightedDays = 0;
    const byStore = {};
    shipRows.forEach(r => {
      if (!r.ship_date || !r.landed_cost) return;
      const cost = Number(r.landed_cost) * Number(r.qty || 0);
      const days = (today - new Date(r.ship_date).getTime()) / 86400000;
      const safeDays = days > 0 ? days : 0;
      totalCost += cost;
      weightedDays += cost * safeDays;
      const st = r.store || "未分类";
      if (!byStore[st]) byStore[st] = { cost: 0, weighted: 0, count: 0 };
      byStore[st].cost += cost;
      byStore[st].weighted += cost * safeDays;
      byStore[st].count += 1;
    });
    const avgDays = totalCost > 0 ? weightedDays / totalCost : 0;
    const annualCost = totalCost * avgDays * 0.12 / 365;  // 12% 年化
    return { totalCost, avgDays, annualCost, byStore };
  }, [shipRows]);

  // 非 admin: 兜底拦截
  if (finRole !== null && !isAdmin) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: C.faint, fontSize: 13, border: `1px dashed ${C.line}`, borderRadius: 12 }}>
        财务核算仅管理员可见
      </div>
    );
  }
  if (finRole === null) return <div style={{ color: C.faint, padding: 40 }}>加载中…</div>;

  return (
    <div>
      {/* 顶部 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>财务核算</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            运营的财务视角透视：订单营业额 / 库存 / 利润 / 现金流 / 资本占用 · 仅管理员可见
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: C.faint }}>数据更新于</span>
          <span style={{ fontSize: 12, color: C.ink, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: C.panel, border: `1px solid ${C.line}` }}>
            今日数据待录入
          </span>
        </div>
      </div>

      {/* ① 订单量与营业额 */}
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "18px 20px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>① 订单量与营业额</span>
          <span style={{ fontSize: 10, color: C.brand, padding: "2px 8px", borderRadius: 10, border: `1px solid ${C.brand}` }}>已启用</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>{rows.length} 行</span>
        </div>

        {/* 筛选器: 日期 / 店铺 / 站点 / ASIN */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <input type="date" value={fDate1} onChange={e => setFDate1(e.target.value)}
            style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }} />
          <span style={{ fontSize: 12, color: C.sub }}>至</span>
          <input type="date" value={fDate2} onChange={e => setFDate2(e.target.value)}
            style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }} />
          <select value={fStore} onChange={e => setFStore(e.target.value)}
            style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }}>
            <option value="">全部店铺</option>
            {storeOpts.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={fSite} onChange={e => setFSite(e.target.value)}
            style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }}>
            <option value="">全部站点</option>
            {siteOpts.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={fAsin} onChange={e => setFAsin(e.target.value)} placeholder="ASIN 搜索"
            style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12, width: 150 }} />
        </div>

        {/* 汇总 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.sub }}>总订单量</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.ink, marginTop: 2 }}>{totQty.toLocaleString()}</div>
          </div>
          <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.sub }}>总营业额 (EUR)</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.brand, marginTop: 2 }}>€{totRev.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          </div>
          <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.sub }}>客单价 (EUR)</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.ink, marginTop: 2 }}>
              {totQty ? "€" + (totRev / totQty).toFixed(2) : "—"}
            </div>
          </div>
        </div>

        {/* 明细表 */}
        {rows.length ? (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr .8fr .6fr 1.2fr .8fr .9fr", background: "#1f3a68", fontSize: 11, color: "#fff", fontWeight: 600 }}>
              {["日期", "店铺", "站点", "ASIN / 产品", "订单量", "营业额"].map(h => (
                <div key={h} style={{ padding: "8px 12px" }}>{h}</div>
              ))}
            </div>
            {rows.map((r, i) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr .8fr .6fr 1.2fr .8fr .9fr", borderTop: i ? `1px solid ${C.line}` : "none", fontSize: 12, background: i % 2 ? C.bg : "transparent", color: C.ink }}>
                <div style={{ padding: "7px 12px" }}>{r.sale_date}</div>
                <div style={{ padding: "7px 12px" }}>{r.store}</div>
                <div style={{ padding: "7px 12px", color: C.sub }}>{r.site}</div>
                <div style={{ padding: "7px 12px" }}>
                  <span style={{ fontWeight: 600 }}>{r.asin}</span>
                  {r.product_name && <span style={{ color: C.faint, marginLeft: 6, fontSize: 11 }}>{r.product_name}</span>}
                </div>
                <div style={{ padding: "7px 12px" }}>{r.order_qty}</div>
                <div style={{ padding: "7px 12px", color: C.brand, fontWeight: 600 }}>€{Number(r.revenue || 0).toFixed(2)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 30, textAlign: "center", color: C.faint, fontSize: 12, border: `1px dashed ${C.line}`, borderRadius: 8 }}>
            暂无数据 · 每天数据由 KK 提供给 WorkBuddy 写入 finance_daily_sales 表
          </div>
        )}
      </div>

      {/* ④ 现金流 */}
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "18px 20px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>④ 现金流</span>
          <span style={{ fontSize: 10, color: C.brand, padding: "2px 8px", borderRadius: 10, border: `1px solid ${C.brand}` }}>已启用</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>{cfRows.length} 行 · 每周账单导入</span>
        </div>

        {/* 筛选: 日期 / 店铺 / 渠道 */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <input type="date" value={cfD1} onChange={e => setCfD1(e.target.value)}
            style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }} />
          <span style={{ fontSize: 12, color: C.sub }}>至</span>
          <input type="date" value={cfD2} onChange={e => setCfD2(e.target.value)}
            style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }} />
          <select value={cfStore} onChange={e => setCfStore(e.target.value)}
            style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }}>
            <option value="">全部店铺</option>
            {cfStoreOpts.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={cfChannel} onChange={e => setCfChannel(e.target.value)}
            style={{ padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, color: C.ink, fontSize: 12 }}>
            <option value="">全部渠道</option>
            {cfChannelOpts.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* 汇总: 按币种分组 */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {Object.keys(cfByCur).length ? Object.entries(cfByCur).map(([cur, v]) => (
            <div key={cur} style={{ display: "flex", gap: 10, flex: 1, minWidth: 260 }}>
              <div style={{ flex: 1, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: C.sub }}>总流入 ({cur})</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.brand, marginTop: 2 }}>+{v.income.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
              </div>
              <div style={{ flex: 1, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: C.sub }}>总流出 ({cur})</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.drop, marginTop: 2 }}>-{v.expense.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
              </div>
              <div style={{ flex: 1, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: C.sub }}>净额 ({cur})</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: (v.income - v.expense) >= 0 ? C.ink : C.drop, marginTop: 2 }}>
                  {(v.income - v.expense).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          )) : (
            <div style={{ width: "100%", padding: 16, textAlign: "center", color: C.faint, fontSize: 12 }}>暂无现金流数据</div>
          )}
        </div>

        {/* 明细表 */}
        {cfRows.length ? (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr .9fr .8fr .7fr 1fr .7fr 1.6fr", background: "#1f3a68", fontSize: 11, color: "#fff", fontWeight: 600 }}>
              {["日期", "店铺", "渠道", "类型", "金额", "币种", "备注"].map(h => (
                <div key={h} style={{ padding: "8px 12px" }}>{h}</div>
              ))}
            </div>
            {cfRows.map((r, i) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr .9fr .8fr .7fr 1fr .7fr 1.6fr", borderTop: i ? `1px solid ${C.line}` : "none", fontSize: 12, background: i % 2 ? C.bg : "transparent", color: C.ink }}>
                <div style={{ padding: "7px 12px" }}>{r.tx_date}</div>
                <div style={{ padding: "7px 12px" }}>{r.store}</div>
                <div style={{ padding: "7px 12px", color: C.sub }}>{r.channel}</div>
                <div style={{ padding: "7px 12px", color: r.type === "income" ? C.brand : C.drop, fontWeight: 600 }}>
                  {r.type === "income" ? "流入" : "流出"}
                </div>
                <div style={{ padding: "7px 12px", fontWeight: 600 }}>{Number(r.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                <div style={{ padding: "7px 12px", color: C.sub }}>{r.currency}</div>
                <div style={{ padding: "7px 12px", color: C.faint, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.note || "—"}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: 24, textAlign: "center", color: C.faint, fontSize: 12, border: `1px dashed ${C.line}`, borderRadius: 8 }}>
            暂无数据 · 每周账单 Excel 导入 finance_cashflow 表
          </div>
        )}
      </div>

      {/* ⑤ 资本占用 & 资金成本 */}
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "18px 20px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>⑤ 资本占用 & 资金成本</span>
          <span style={{ fontSize: 10, color: C.brand, padding: "2px 8px", borderRadius: 10, border: `1px solid ${C.brand}` }}>已启用</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>公式: 成本 × 持有天数 × 年化 12% / 365</span>
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 14 }}>
          库存金额(到仓价×数量)/ 资金占用 / 未来 90 天资金需求预测 · 资金需求待日级分析 + 库存完善后接入
        </div>

        {/* 3 个核心数字 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.sub }}>资本占用 (库存金额)</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.ink, marginTop: 2 }}>¥{capitalUsage.totalCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>在途 ¥0 (暂无在途表)</div>
          </div>
          <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.sub }}>资金成本 (年化 12%)</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.drop, marginTop: 2 }}>¥{capitalUsage.annualCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>平均持有 {capitalUsage.avgDays.toFixed(1)} 天</div>
          </div>
          <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.sub }}>90 天资金需求预测</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.faint, marginTop: 2 }}>待接入</div>
            <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>需日级分析 + 库存周转</div>
          </div>
        </div>

        {/* 店铺维度明细 */}
        {Object.keys(capitalUsage.byStore).length ? (
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 0.8fr", background: "#1f3a68", fontSize: 11, color: "#fff", fontWeight: 600 }}>
              {["店铺", "成本金额", "持有天加权", "平均持有", "记录数"].map(h => (
                <div key={h} style={{ padding: "8px 12px" }}>{h}</div>
              ))}
            </div>
            {Object.entries(capitalUsage.byStore).map(([st, v], i) => {
              const avg = v.cost > 0 ? v.weighted / v.cost : 0;
              return (
                <div key={st} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 0.8fr", borderTop: i ? `1px solid ${C.line}` : "none", fontSize: 12, background: i % 2 ? C.bg : "transparent", color: C.ink }}>
                  <div style={{ padding: "7px 12px", fontWeight: 600 }}>{st}</div>
                  <div style={{ padding: "7px 12px" }}>¥{v.cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                  <div style={{ padding: "7px 12px", color: C.sub }}>¥{v.weighted.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  <div style={{ padding: "7px 12px" }}>{avg.toFixed(1)} 天</div>
                  <div style={{ padding: "7px 12px", color: C.faint }}>{v.count}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: 18, textAlign: "center", color: C.faint, fontSize: 12, border: `1px dashed ${C.line}`, borderRadius: 8 }}>
            暂无发货记录数据 · 等发货记录录入后自动计算
          </div>
        )}
      </div>

      {/* ②③ 待建模块占位 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {[
          { t: "② 库存视角", d: "周转效率 / 库存天数 / 备货周期 / 滞销预警", ds: "products.st × FBA 库存 × 销售速率（需 SP-API）" },
          { t: "③ 利润体系", d: "单品利润 / 末端类目毛利 / 平台费 / 税费 / 净利", ds: "采购成本（finance_unit_cost）+ 售价（SP-API）+ 平台费 / 广告 / VAT" },
        ].map(m => (
          <div key={m.t} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{m.t}</span>
              <span style={{ fontSize: 10, color: C.faint, marginLeft: "auto", padding: "2px 8px", borderRadius: 10, border: `1px solid ${C.line}` }}>待建设</span>
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>{m.d}</div>
            <div style={{ fontSize: 11, color: C.faint }}>{m.ds}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- 品牌货架 (三层展开: 品牌 → 大类 → 类目) ----------------
function Shelf() {
  const [shelfErr, setShelfErr] = useState(null);
  useEffect(() => {
    (async () => {
      try { await fetchShelfData(); }
      catch (e) { console.error("Shelf fetch err:", e); setShelfErr(String(e)); }
    })();
  }, []);
  const brands = Object.keys(BRAND_SHELF);
  // 改状态权限: 按拖拽权限框住 (KK: 货架改状态与进度拖拽同权限)
  //   sFull (admin/fr) 全改; 角色只能改自己负责阶段的 leaf/product 状态
  const [shelfEmail, setShelfEmail] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data && data.user) setShelfEmail(data.user.email || ""); });
  }, []);
  const sRole = getUserRole(shelfEmail);
  const sFull = sRole === "admin" || sRole === "fr";
  // 类目(cat)改状态: admin/fr 全开; 成都·供应链(雪梅 cd_supplier) 也开放 — KK 2026-10-23
  const sCatSt = sFull || sRole === "cd_supplier";
  const sMyBoxes = sRole === "cd_supplier" ? ["h1"]
    : sRole === "cd_link" ? ["h2"]
    : sRole === "cd_promotion" ? ["h3", "h4"] : [];
  const canEditSt = (leafId) => sFull || sMyBoxes.includes(handoffMap[leafId]);
  // 一致性校验: 状态必须匹配当前阶段 (BOX_ALLOWED_ST)
  const checkStBox = (leafId, newSt) => {
    const box = handoffMap[leafId];
    if (!box) return null; // 不在交接框, 4 档自由
    const allowed = BOX_ALLOWED_ST[box];
    if (allowed && !allowed.includes(newSt)) {
      const boxTitle = (HANDOFF_BOXES.find(b => b.id === box) || {}).title || box;
      const stLabel = SHELF_ST[newSt] ? SHELF_ST[newSt].label : newSt;
      return `状态不一致：该类目当前在「${boxTitle}」，此阶段只允许「${allowed.map(s => SHELF_ST[s].label).join(" / ")}」，不能标为「${stLabel}」。\n请先在开发进度里把它拖到正确阶段（或由管理员操作）。`;
    }
    return null;
  };
  const [openB, setOpenB] = useState({});      // 展开的品牌
  const [openG, setOpenG] = useState({});      // 展开的大类, key = brand|groupIdx
  const [openC, setOpenC] = useState({});      // 展开的类目, key = brand|groupIdx|catIdx
  const [filterC, setFilterC] = useState({});  // 每个类目的筛选: undefined|'selling'|'idle'
  const [openL, setOpenL] = useState({});      // 展开的末端类目, key = ckey|leafIdx
  const [openPV, setOpenPV] = useState({});    // 展开的产品变体, key = productId
  const [projectFor, setProjectFor] = useState(null); // 跳转 Project 弹窗
  // 交接状态: leaf_id → box_key (供 leaf 行显示阶段标签, 与开发进度拖拽同步)
  const [handoffMap, setHandoffMap] = useState({});
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("monitor_handoff").select("leaf_id, box_key");
      if (!error) {
        const m = {};
        (data || []).forEach(h => { m[h.leaf_id] = h.box_key; });
        setHandoffMap(m);
      }
    })();
  }, []);

  const countCats = (groups) => {
    const n = { total: 0, selling: 0, idle: 0, skip: 0, researched_skip: 0 };
    groups.forEach(g => g.cats.forEach(c => { n.total++; if (n[c.st] !== undefined) n[c.st]++; }));
    return n;
  };

  // 聚合某 cat 数组的在售 + 在调研数 (基于 CAT_DETAIL 查 leaves/products 的 st)
  const tallyScope = (catsArr) => {
    const n = { sell: 0, idle: 0 };
    for (const c of catsArr) {
      const d = CAT_DETAIL[c.name] || CAT_DETAIL[c.name + " || " + c.name];
      if (!d) continue;
      if (d.leaves) {
        for (const l of d.leaves) {
          if (l.st === "idle" && (!l.products || !l.products.length)) n.idle++;
          for (const p of (l.products || [])) {
            if (p.st === "selling") n.sell++;
            else if (p.st === "idle") n.idle++;
          }
        }
      } else if (d.products) {
        for (const p of d.products) {
          if (p.st === "selling") n.sell++;
          else if (p.st === "idle") n.idle++;
        }
      }
    }
    return n;
  };

  // —— 编辑功能 (P0) ——
  const [edit, setEdit] = useState(null);       // { type, table, id, st, label } 改状态弹窗
  const [addProd, setAddProd] = useState(null); // { leafId } 加产品弹窗
  const [prodName, setProdName] = useState("");
  const [prodAsin, setProdAsin] = useState("");
  const [addSup, setAddSup] = useState(null);   // { leafId } 加供应商弹窗
  const [supFactory, setSupFactory] = useState("");
  const [supContact, setSupContact] = useState("");
  const [supMain, setSupMain] = useState("");
  const [addLeaf, setAddLeaf] = useState(null); // { catId, catName } 加末端类目弹窗
  const [leafName, setLeafName] = useState("");
  const [leafPath, setLeafPath] = useState("");
  const [tick, setTick] = useState(0);

  const refreshShelf = async () => {
    await fetchShelfData();
    setTick(t => t + 1);
  };

  const saveSt = async (newSt) => {
    if (!edit) return;
    // 权限: 改状态按拖拽权限框住 (只能改自己负责阶段的)
    if (edit.type === "leaf" && !canEditSt(edit.id)) {
      alert("无权操作：你只能修改自己负责阶段（拖拽范围内）的类目状态"); return;
    }
    if (edit.type === "product" && edit.leafId && !canEditSt(edit.leafId)) {
      alert("无权操作：你只能修改自己负责阶段（拖拽范围内）的产品状态"); return;
    }
    // 一致性: 新状态必须匹配当前阶段 (BOX_ALLOWED_ST)
    const boxLeafId = edit.type === "leaf" ? edit.id : (edit.type === "product" ? edit.leafId : null);
    if (boxLeafId) {
      const msg = checkStBox(boxLeafId, newSt);
      if (msg) { alert(msg); return; }
    }
    // leaf 离开 idle 状态时清掉 phase, 避免残留
    const payload = edit.type === "leaf" && newSt !== "idle" ? { st: newSt, phase: null } : { st: newSt };
    const { error } = await supabase.from(edit.table).update(payload).eq("id", edit.id);
    if (error) { alert("保存失败: " + error.message); return; }
    // 自动入框: cat 状态改为 idle 时, 同步加进 monitor_handoff h1 框 (KK 2026-08-10)
    if (edit.type === "cat" && newSt === "idle") {
      await supabase.from("monitor_handoff").insert({
        cat_id: edit.id,
        box_key: "h1",
        start_at: new Date().toISOString(),
      });
    }
    // 自动出框: cat 改为不做时, 从两个闭环消失 (KK 2026-08-10)
    if (edit.type === "cat" && (newSt === "skip" || newSt === "researched_skip")) {
      await supabase.from("monitor_handoff").delete().eq("cat_id", edit.id);
    }
    setEdit(null);
    await refreshShelf();
  };

  // 保存调研阶段 (仅 leaf 的 idle 细分): 同时把 st 置为 idle, phase 写入
  const savePhase = async (phase) => {
    if (!edit) return;
    const { error } = await supabase.from("shelf_leaves").update({ st: "idle", phase }).eq("id", edit.id);
    if (error) { alert("保存失败: " + error.message); return; }
    setEdit(null);
    await refreshShelf();
  };

  // 清除调研阶段 (回到笼统"在调研")
  const clearPhase = async () => {
    if (!edit) return;
    const { error } = await supabase.from("shelf_leaves").update({ phase: null }).eq("id", edit.id);
    if (error) { alert("保存失败: " + error.message); return; }
    setEdit(null);
    await refreshShelf();
  };

  // 行内下拉直接保存 (接受 leafId, 不依赖 edit state)
  const savePhaseFor = async (leafId, phase) => {
    const { error } = await supabase.from("shelf_leaves").update({ st: "idle", phase }).eq("id", leafId);
    if (error) { alert("保存失败: " + error.message); return; }
    await refreshShelf();
  };
  const clearPhaseFor = async (leafId) => {
    const { error } = await supabase.from("shelf_leaves").update({ phase: null }).eq("id", leafId);
    if (error) { alert("保存失败: " + error.message); return; }
    await refreshShelf();
  };

  const submitAddProduct = async () => {
    if (!addProd) return;
    if (!prodName.trim()) { alert("产品名不能为空"); return; }
    const { error } = await supabase.from("products").insert({
      leaf_id: addProd.leafId,
      name: prodName.trim(),
      asin: prodAsin.trim() || null,
      st: "idle",
      amazon_site: "FR",
    });
    if (error) { alert("添加失败: " + error.message); return; }
    setAddProd(null); setProdName(""); setProdAsin("");
    await refreshShelf();
  };

  const submitAddSupplier = async () => {
    if (!addSup) return;
    if (!supFactory.trim()) { alert("工厂名不能为空"); return; }
    const { error } = await supabase.from("suppliers").insert({
      leaf_id: addSup.leafId,
      factory: supFactory.trim(),
      contact: supContact.trim() || null,
      main_products: supMain.trim() || null,
    });
    if (error) { alert("添加失败: " + error.message); return; }
    setAddSup(null); setSupFactory(""); setSupContact(""); setSupMain("");
    await refreshShelf();
  };

  // 加末端类目 (leaf): leaf_name 必填, path 可空
  const submitAddLeaf = async () => {
    if (!addLeaf) return;
    if (!leafName.trim()) { alert("末端类目名不能为空"); return; }
    const { data, error } = await supabase.from("shelf_leaves").insert({
      cat_id: addLeaf.catId,
      leaf_name: leafName.trim(),
      path: leafPath.trim() || null,
      st: "ready",
    }).select().single();
    if (error) { alert("添加失败: " + error.message); return; }
    // 仅 phase=planning 的 leaf 才同步进 h1 框 (拉数据阶段)
    if (data && data.id && data.phase === "planning") {
      await supabase.from("monitor_handoff").upsert({
        leaf_id: data.id,
        box_key: "h1",
        start_at: new Date().toISOString(),
      }, { onConflict: "leaf_id" });
    }
    setAddLeaf(null); setLeafName(""); setLeafPath("");
    await refreshShelf();
  };

  // 状态点: 默认仅 sFull (admin/fr) 可点; 传入 enabled 可放开到"本阶段负责人"
  const stDot = (s, onClick, extra, enabled) => {
    const can = enabled === undefined ? sFull : enabled;
    return (
      <span onClick={can ? onClick : undefined}
        style={{ width: 8, height: 8, borderRadius: 2, background: SHELF_ST[s] ? SHELF_ST[s].color : C.faint, display: "inline-block", cursor: can ? "pointer" : "default", opacity: can ? 1 : 0.45, ...(extra || {}) }}
        title={can ? "点击修改状态" : "仅管理员/法国或本阶段负责人可修改"} />
    );
  };

  // 子类目递归渲染 (cat 嵌套: Transport et voyages > Accessoires voiture > leaves)
  const renderCatTree = (children, parentKey, depth) => children && children.length ? sortCatsBySt(children).map((sub, si) => {
    const subKey = `${parentKey}|sub${si}`;
    const subOpen = !!openC[subKey];
    const subDetail = catDetail(sub.name);  // 单参数查找 (不依赖 g, 避免 ReferenceError)
    const pad = 58 + depth * 18;
    return (
      <div key={si} style={{ borderTop: si ? `1px solid ${C.line}` : "none" }}>
        <div onClick={() => setOpenC(s => ({ ...s, [subKey]: !s[subKey] }))}
          style={{ display: "flex", alignItems: "center", gap: 9, padding: `10px 16px 10px ${pad}px`, cursor: "pointer", background: C.panel2 }}>
          <Caret open={subOpen} small />
          {stDot(sub.st, (e) => { e.stopPropagation(); setEdit({ type: "cat", table: "shelf_cats", id: sub.id, st: sub.st, label: sub.name }); }, null, sCatSt)}
          <span style={{ fontSize: 13, color: C.ink }}>{sub.name}</span>
          {(sub.st === "skip" || sub.st === "researched_skip") && (<span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "#dc2626", color: "#fff", marginLeft: 8 }}>不做</span>)}
          <span style={{ marginLeft: "auto", fontSize: 11, display: "inline-flex", gap: 10 }}>
            {(() => {
              const t = tallyCatDeepV2(sub);
              return (
                <>
                  <span style={{ color: "#4db6a4", fontWeight: 600 }}>在售 {t.sell}</span>
                  <span style={{ color: C.sub }}>在调研 {t.idle}</span>
                </>
              );
            })()}
          </span>
        </div>
        {subOpen && (
          <div style={{ background: C.bg, borderTop: `1px solid ${C.line}` }}>
            {sub.children && sub.children.length > 0 && renderCatTree(sub.children, subKey, depth + 1)}
            {subDetail && subDetail.products && subDetail.products.length > 0 ? (
              <div style={{ padding: `8px 16px 14px ${pad + 24}px`, background: C.panel }}>
                <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, letterSpacing: ".04em", marginBottom: 4 }}>产品</div>
                {subDetail.products.map((p) => renderProductRow(p, sub.id))}
              </div>
            ) : (!sub.children || sub.children.length === 0) && (
              <div style={{ padding: `10px 16px 10px ${pad + 24}px`, fontSize: 11, color: C.faint }}>暂无产品</div>
            )}
            <div onClick={(e) => { e.stopPropagation(); setAddProd({ catId: sub.id }); }}
              style={{ fontSize: 11, color: C.brand, cursor: "pointer", padding: "5px 16px 8px " + (pad + 24) + "px" }}>
              + 新增产品
            </div>
          </div>
        )}
      </div>
    );
  }) : null;

  // 产品行渲染 (含变体下拉) · 复用 shownProducts 分支和 detail 分支
  const renderProductRow = (p, leafId) => {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const pOpen = !!openPV[p.id];
    const canEditThis = canEditSt(leafId);
    return (
      <div key={p.id} style={{ fontSize: 12, padding: "6px 0", color: C.ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {variants.length > 0 && (
            <span onClick={(e) => { e.stopPropagation(); setOpenPV(st => ({ ...st, [p.id]: !st[p.id] })); }}
              style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", color: C.sub }}>
              <Caret open={pOpen} small />
            </span>
          )}
          <span onClick={canEditThis ? (e) => { e.stopPropagation(); setEdit({ type: "product", table: "products", id: p.id, st: p.st, label: p.name, leafId }); } : undefined}
            style={{ width: 6, height: 6, borderRadius: 2, background: SHELF_ST[p.st] ? SHELF_ST[p.st].color : C.faint, display: "inline-block", cursor: canEditThis ? "pointer" : "default", opacity: canEditThis ? 1 : 0.45 }}
            title={canEditThis ? "点击修改状态" : "仅管理员/法国或本阶段负责人可修改"} />
          {p.name}
          <span style={{ color: C.faint, fontSize: 11 }}>· {SHELF_ST[p.st] ? SHELF_ST[p.st].label : p.st}</span>
          {variants.length > 0 ? (
            <span style={{ color: C.faint, fontSize: 11 }}>
              · {p.spu && <>SPU: <span style={{ fontFamily: "monospace" }}>{p.spu}</span> · </>}
              {variants.length}个变体
            </span>
          ) : (
            p.asin && (
              <a href={`https://amazon.fr/dp/${p.asin}`} target="_blank" rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: C.brand, fontSize: 11, textDecoration: "none" }}>
                · ASIN <span style={{ fontFamily: "monospace" }}>{p.asin}</span>
              </a>
            )
          )}
        </div>
        {/* 变体下拉 (默认全部展开) */}
        {variants.length > 0 && (
          <div style={{ marginLeft: 28, marginTop: 6, padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 11, color: C.sub }}>
            {variants.map((v, vi) => (
              <div key={vi} style={{ display: "flex", alignItems: "center", gap: 12, padding: "3px 0" }}>
                {v.color && (
                  <span style={{ display: "inline-flex", alignItems: "center", minWidth: 50 }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: (p.variant_colors || []).find(c => c.name === v.color)?.hex || "#888", marginRight: 4, border: `1px solid ${C.line}` }} />
                    {v.color}
                  </span>
                )}
                {v.size && <span style={{ fontFamily: "monospace", minWidth: 24 }}>{v.size}</span>}
                {v.asin ? (
                  <a href={`https://amazon.fr/dp/${v.asin}`} target="_blank" rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: C.brand, textDecoration: "none", fontFamily: "monospace" }}>
                    {v.asin}
                  </a>
                ) : <span style={{ color: C.faint, fontStyle: "italic" }}>ASIN 待填</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
{false && (<>
            <SectionTitle t="品牌货架" sub="品牌 → 大类 → 类目，逐层点开。在售 / 还没动 / 不做 / 已调研不做" />

      {/* 图例 */}
      <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
        {Array.from(new Map(Object.entries(SHELF_ST).map(([k, v]) => [v.label, [k, v]])).values()).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.sub }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: v.color, display: "inline-block" }} />{v.label}
          </div>
        ))}
      </div>
      </>)}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {brands.map(b => {
          const info = BRAND_SHELF[b];
          const n = countCats(info.groups);
          const isOpen = !!openB[b];
          return (
            <div key={b} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
              {/* 品牌行 */}
              <div onClick={() => setOpenB(s => ({ ...s, [b]: !s[b] }))}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", cursor: "pointer" }}>
                <Caret open={isOpen} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>{info.fullName || b}</span>
                <span style={{ fontSize: 11, color: C.faint }}>{info.store}</span>
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ color: C.sub }}>
                    {info.flat ? `${n.total} 类目` : `${info.groups.length} 大类 · ${n.total} 二级类目`}
                  </span>
                  {(() => {
                    const t = tallyScope(info.flat ? info.groups[0].cats : info.groups.flatMap(g => g.cats));
                    return (
                      <>
                        <span style={{ color: SHELF_ST.selling.color, fontWeight: 600 }}>在售 {t.sell}</span>
                        <span style={{ color: C.sub }}>在调研 {t.idle}</span>
                      </>
                    );
                  })()}
                </span>
              </div>

              {/* 大类层 (flat 品牌: 类目竖向单列排列, 每行一项) */}
              {isOpen && info.flat && (
                <div style={{ borderTop: `1px solid ${C.line}` }}>
                  {info.groups[0].cats.map((c, ci) => {
                    return (
                      <div key={ci} style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 16px 11px 34px", borderTop: ci ? `1px solid ${C.line}` : "none" }}>
                        {stDot(c.st, (e) => { e.stopPropagation(); setEdit({ type: "cat", table: "shelf_cats", id: c.id, st: c.st, label: c.name }); }, null, sCatSt)}
                        <span style={{ fontSize: 13, color: C.ink }}>{c.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {isOpen && !info.flat && (
                <div style={{ borderTop: `1px solid ${C.line}` }}>
                  {info.groups.map((g, gi) => {
                    const gkey = `${b}|${gi}`;
                    const gOpen = !!openG[gkey];
                    const gn = { selling: 0, ready: 0, idle: 0, skip: 0 };
                    g.cats.forEach(c => gn[c.st]++);
                    return (
                      <div key={gi} style={{ borderTop: gi ? `1px solid ${C.line}` : "none" }}>
                        <div onClick={() => { setOpenG(s => ({ ...s, [gkey]: !s[gkey] })); setOpenC(s => { const ns = {...s}; Object.keys(ns).forEach(k => { if (k.startsWith(gkey + "|")) delete ns[k]; }); return ns; }); }}
                          style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 16px 11px 34px", cursor: "pointer", background: C.panel2 }}>
                          <Caret open={gOpen} small />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</span>
                          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                            <span style={{ color: C.faint }}>{g.cats.length} 项</span>
                            {(() => {
                              const t = tallyScope(g.cats);
                              return (
                                <>
                                  <span style={{ color: SHELF_ST.selling.color, fontWeight: 600 }}>在售 {t.sell}</span>
                                  <span style={{ color: C.sub }}>在调研 {t.idle}</span>
                                </>
                              );
                            })()}
                          </span>
                        </div>
                        {/* 类目层 (竖向单列, 可点开看 产品/供应商) */}
                        {gOpen && (
                          g.cats.length ? (
                            <div>
                              {sortCatsBySt(g.cats).map((c, ci) => {
                                // 根 cat (parent_cat_id = NULL): 自动展开其 children, 隐藏名字行 (避免与大类名重复)
                                if (c.parent_cat_id === null || c.parent_cat_id === undefined) {
                                  return c.children && c.children.length > 0 ? (
                                    <div key={ci} style={{ background: C.bg, borderTop: `1px solid ${C.line}` }}>
                                            {sortCatsBySt(c.children).map((sub, si) => {
                                        try { return renderCatTree([sub], `${gkey}|root${ci}`, 1); } catch (e) { console.error("root cat nested err:", e); return null; }
                                      })}
                                    </div>
                                  ) : null;
                                }
                                if (c.st === "skip" || c.st === "researched_skip") {
                                  return (
                                    <div key={ci} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 10px 58px", borderTop: `1px solid ${C.line}` }}>
                                      <span style={{ fontSize: 13, color: C.faint }}>{c.name}</span>
                                      <span style={{ marginLeft: "auto", padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: "#5a3030", color: "#ff9090", border: "1px solid #7a4040" }}>
                                        不做
                                      </span>
                                    </div>
                                  );
                                }
                                const ckey = `${gkey}|${c.id}`;
                                const cOpen = !!openC[ckey];
                                const detail = catDetail(c.name, g.name);
                                return (
                                  <div key={ci} style={{ borderTop: `1px solid ${C.line}` }}>
                                    <div onClick={() => setOpenC(st => {
                                      const willOpen = !st[ckey];
                                      const ns = { ...st };
                                      Object.keys(ns).forEach(k => { if (k.startsWith(gkey + "|")) delete ns[k]; });
                                      if (willOpen) ns[ckey] = true;
                                      return ns;
                                    })}
                                      style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 16px 10px 58px", cursor: "pointer" }}>
                                      <Caret open={cOpen} small />
                                      {stDot(c.st, (e) => { e.stopPropagation(); setEdit({ type: "cat", table: "shelf_cats", id: c.id, st: c.st, label: c.name }); }, null, sCatSt)}
                                      <span style={{ fontSize: 13, color: C.ink }}>{c.name}</span>
                                      <span onClick={(e) => {
                                          e.stopPropagation();
                                          if (c.chatUrl) { window.open(c.chatUrl, "_blank", "noopener,noreferrer"); return; }
                                          setProjectFor({ name: c.name, path: `${g.name} › ${c.name}`, chatName: c.chatName });
                                        }}
                                        style={{ fontSize: 11, color: C.brand, cursor: "pointer", marginLeft: 6 }}>
                                        · 进入分析 →
                                      </span>
                                      {(() => {
                                        const prods = detail ? (detail.leaves ? detail.leaves.flatMap(l => l.products) : (detail.products || [])) : [];
                                        const leaves = detail && detail.leaves ? detail.leaves : [];
                                        const researchLeaves = leaves.filter(l => l.st === "idle" && (!l.products || !l.products.length)).length;
                                        const doneSkipLeaves = leaves.filter(l => l.st === "researched_skip").length;
                                        const sell = prods.filter(p => p.st === "selling").length;
                                        const res = prods.filter(p => p.st === "idle").length + researchLeaves;
                                        if (!prods.length && !researchLeaves && !doneSkipLeaves) return null;
                                        const cur = filterC[ckey];
                                        const toggle = (v, e) => { e.stopPropagation(); setFilterC(st => ({ ...st, [ckey]: st[ckey] === v ? undefined : v })); if (!openC[ckey]) setOpenC(st => ({ ...st, [ckey]: true })); };
                                        const chip = (active, color) => ({ cursor: "pointer", padding: "1px 7px", borderRadius: 10, border: `1px solid ${active ? color : "transparent"}`, background: active ? `${color}22` : "transparent", color });
                                        return (
                                          <span style={{ marginLeft: "auto", fontSize: 11, display: "flex", gap: 4 }}>
                                            <span onClick={(e) => toggle("selling", e)} style={chip(cur === "selling", SHELF_ST.selling.color)}>在售 {sell}</span>
                                            <span onClick={(e) => toggle("idle", e)} style={chip(cur === "idle", C.sub)}>在调研 {res}</span>
                                            <span onClick={(e) => toggle("researched_skip", e)} style={chip(cur === "researched_skip", C.faint)}>已调研不做 {doneSkipLeaves}</span>
                                          </span>
                                        );
                                      })()}
                                    </div>
                                    {cOpen && (
                                      <div style={{ background: C.bg, borderTop: `1px solid ${C.line}` }}>
                                        {/* 子类目 (cat 嵌套, 包 try-catch 防止渲染报错) */}
                                        {c.children && c.children.length > 0 && (() => {
                                          try { return renderCatTree(c.children, ckey, 1); } catch (e) { console.error("cat nested render err:", e); return null; }
                                        })()}
                                        {detail && detail.products && detail.products.length > 0 ? (
                                          <div style={{ padding: '6px 16px 14px 82px', background: C.panel }}>
                                            <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, letterSpacing: '.04em', marginBottom: 4 }}>产品</div>
                                            {detail.products.map((p) => renderProductRow(p, c.id))}
                                          </div>
                                        ) : (
                                          <div style={{ padding: '8px 16px 14px 82px', fontSize: 12, color: C.faint }}>暂无产品</div>
                                        )}
                                        <div onClick={(e) => { e.stopPropagation(); setAddProd({ catId: c.id }); }}
                                          style={{ fontSize: 11, color: C.brand, cursor: 'pointer', padding: '5px 16px 10px 82px' }}>
                                          + 新增产品
                                        </div>: (
                                          <div style={{ padding: "10px 16px 14px 82px" }}>
                                            {/* 顶部统计: 产品 · 变体 · 供应商 */}
                                            <div style={{ display: "flex", gap: 14, fontSize: 11, color: C.sub, marginBottom: 8, padding: "6px 8px", background: C.bg, borderRadius: 6 }}>
                                              <span>产品 <b style={{ color: C.ink }}>{detail ? detail.products.length : 0}</b></span>
                                              <span>变体 <b style={{ color: C.ink }}>{detail ? detail.products.reduce((s, p) => s + (p.variant_count || 0), 0) : 0}</b></span>
                                              <span>供应商 <b style={{ color: C.ink }}>{detail ? detail.suppliers.length : 0}</b></span>
                                            </div>
                                            <Branch title="产品">
                                              {detail && detail.products.length ? detail.products.map((p, pi) => {
                                                const variants = Array.isArray(p.variants) ? p.variants : [];
                                                const pOpen = !!openPV[p.id];
                                                return (
                                                  <div key={pi} style={{ fontSize: 12, padding: "6px 0", color: C.ink }}>
                                                    {/* 主行: 状态点 + 产品名 + 状态词 + (有变体: SPU·N变体 / 无变体: ASIN) */}
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                      {variants.length > 0 && (
                                                        <span onClick={(e) => { e.stopPropagation(); setOpenPV(st => ({ ...st, [p.id]: !st[p.id] })); }}
                                                          style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", color: C.sub }}>
                                                          <Caret open={pOpen} small />
                                                        </span>
                                                      )}
                                                      <span onClick={(e) => { e.stopPropagation(); setEdit({ type: "product", table: "products", id: p.id, st: p.st, label: p.name }); }}
                                                        style={{ width: 6, height: 6, borderRadius: 2, background: SHELF_ST[p.st] ? SHELF_ST[p.st].color : C.faint, display: "inline-block", cursor: "pointer" }}
                                                        title="点击修改状态" />{p.name}
                                                      <span style={{ color: C.faint, fontSize: 11 }}>· {SHELF_ST[p.st].label}</span>
                                                      {variants.length > 0 ? (
                                                        <span style={{ color: C.faint, fontSize: 11 }}>
                                                          · {p.spu && <>SPU: <span style={{ fontFamily: "monospace" }}>{p.spu}</span> · </>}
                                                          {variants.length}个变体
                                                        </span>
                                                      ) : (
                                                        p.asin && (
                                                          <a href={`https://amazon.fr/dp/${p.asin}`} target="_blank" rel="noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            style={{ color: C.brand, fontSize: 11, textDecoration: "none" }}>
                                                            · ASIN <span style={{ fontFamily: "monospace" }}>{p.asin}</span>
                                                          </a>
                                                        )
                                                      )}
                                                    </div>
                                                    {/* 变体下拉: 默认全部展开 (KK 2026-08-08 反馈默认展开可见) */}
                                                    {variants.length > 0 && (
                                                      <div style={{ marginLeft: 28, marginTop: 6, padding: "6px 10px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 11, color: C.sub }}>
                                                        {variants.map((v, vi) => (
                                                          <div key={vi} style={{ display: "flex", alignItems: "center", gap: 12, padding: "3px 0" }}>
                                                            {v.color && (
                                                              <span style={{ display: "inline-flex", alignItems: "center", minWidth: 50 }}>
                                                                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: (p.variant_colors || []).find(c => c.name === v.color)?.hex || "#888", marginRight: 4, border: `1px solid ${C.line}` }} />
                                                                {v.color}
                                                              </span>
                                                            )}
                                                            {v.size && <span style={{ fontFamily: "monospace", minWidth: 24 }}>{v.size}</span>}
                                                            {v.asin ? (
                                                              <a href={`https://amazon.fr/dp/${v.asin}`} target="_blank" rel="noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{ color: C.brand, textDecoration: "none", fontFamily: "monospace" }}>
                                                                {v.asin}
                                                              </a>
                                                            ) : <span style={{ color: C.faint, fontStyle: "italic" }}>ASIN 待填</span>}
                                                          </div>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              }) : <Empty t="暂无产品" />}
                                              <div onClick={(e) => { e.stopPropagation(); setAddProd({ leafId: lf.id }); }}
                                                style={{ fontSize: 11, color: C.brand, cursor: "pointer", padding: "5px 0", marginTop: 2 }}>
                                                + 新增产品
                                              </div>
                                              {/* 供应商: 叶端共享, 显示在产品列表后 (按 KK 2026-08-08 模板) */}
                                              {detail && detail.suppliers.length ? detail.suppliers.map((sp, si) => (
                                                <div key={si} style={{ fontSize: 12, padding: "5px 0", lineHeight: 1.6 }}>
                                                  <span style={{ color: C.ink, fontWeight: 600 }}>{sp.factory}</span>
                                                  <span style={{ color: C.sub }}> · {sp.contact}</span>
                                                  <div style={{ color: C.faint, fontSize: 11 }}>主要产品：{sp.products}</div>
                                                </div>
                                              )) : null}
                                              {/* 规则未定, 暂不显示新增供应商按钮 */}
                                            </Branch>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: C.faint, padding: "10px 16px 14px 58px", borderTop: `1px solid ${C.line}` }}>待录入</div>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 改状态浮层 */}
      {edit && (
        <div onClick={() => setEdit(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, width: 400, maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>修改状态</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{edit.label}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Array.from(new Map(Object.entries(SHELF_ST).map(([k, v]) => [v.label, [k, v]])).values()).map(([k, v]) => (
                <div key={k} onClick={() => saveSt(k)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${edit.st === k ? v.color : C.line}`, background: edit.st === k ? `${v.color}22` : "transparent", color: C.ink, fontSize: 13 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: v.color, display: "inline-block" }} />
                  {v.label}
                  {edit.st === k && <span style={{ marginLeft: "auto", fontSize: 11, color: v.color }}>当前</span>}
                </div>
              ))}
            </div>
            {edit.type === "leaf" && edit.st === "idle" && (
              <>
                <div style={{ fontSize: 11, color: C.sub, margin: "14px 0 8px", fontWeight: 600 }}>在调研细分阶段</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {Object.entries(LEAF_PHASE).map(([k, v]) => (
                    <div key={k} onClick={() => savePhase(k)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                        border: `1px solid ${edit.phase === k ? v.color : C.line}`, background: edit.phase === k ? `${v.color}22` : "transparent", color: C.ink, fontSize: 13 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: v.color, display: "inline-block" }} />
                      {v.label}
                      {edit.phase === k && <span style={{ marginLeft: "auto", fontSize: 11, color: v.color }}>当前</span>}
                    </div>
                  ))}
                  {edit.phase && (
                    <div onClick={clearPhase}
                      style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.line}`, color: C.faint, fontSize: 12, textAlign: "center" }}>
                      清除阶段（回到笼统"在调研"）
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 新增产品表单 */}
      {addProd && (
        <div onClick={() => setAddProd(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, width: 420 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>新增产品</div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 12 }}>产品名必填 · ASIN 可留空（上架后填）</div>
            <input value={prodName} onChange={(e) => setProdName(e.target.value)} placeholder="产品名（如 封口机01）"
              style={{ width: "100%", padding: "9px 12px", marginBottom: 10, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 13, outline: "none" }} />
            <input value={prodAsin} onChange={(e) => setProdAsin(e.target.value)} placeholder="ASIN（如 B0GLWV84HC）"
              style={{ width: "100%", padding: "9px 12px", marginBottom: 16, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 13, outline: "none" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setAddProd(null)}
                style={{ flex: 1, padding: "9px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                取消
              </button>
              <button onClick={submitAddProduct}
                style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新增供应商表单 */}
      {addSup && (
        <div onClick={() => setAddSup(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, width: 420 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>新增供应商</div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 12 }}>工厂名必填 · 联系人/主要产品可留空</div>
            <input value={supFactory} onChange={(e) => setSupFactory(e.target.value)} placeholder="工厂名（如 深圳XX电子）"
              style={{ width: "100%", padding: "9px 12px", marginBottom: 10, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 13, outline: "none" }} />
            <input value={supContact} onChange={(e) => setSupContact(e.target.value)} placeholder="联系人（如 王经理）"
              style={{ width: "100%", padding: "9px 12px", marginBottom: 10, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 13, outline: "none" }} />
            <input value={supMain} onChange={(e) => setSupMain(e.target.value)} placeholder="主要产品（如 封口机/真空泵）"
              style={{ width: "100%", padding: "9px 12px", marginBottom: 16, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 13, outline: "none" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setAddSup(null)}
                style={{ flex: 1, padding: "9px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                取消
              </button>
              <button onClick={submitAddSupplier}
                style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新增末端类目表单 */}
      {addLeaf && (
        <div onClick={() => setAddLeaf(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 22, width: 440 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>新增末端类目</div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 12 }}>所属二级类目：{addLeaf.catName}</div>
            <input value={leafName} onChange={(e) => setLeafName(e.target.value)} placeholder="末端类目名（如 Housses de rangement sous vide）"
              style={{ width: "100%", padding: "9px 12px", marginBottom: 10, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 13, outline: "none" }} />
            <input value={leafPath} onChange={(e) => setLeafPath(e.target.value)} placeholder="完整路径（可留空，如 Cuisine et Maison › ...）"
              style={{ width: "100%", padding: "9px 12px", marginBottom: 16, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 13, outline: "none" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setAddLeaf(null)}
                style={{ flex: 1, padding: "9px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                取消
              </button>
              <button onClick={submitAddLeaf}
                style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 跳转持续分析(Project) 弹窗 */}
      {projectFor && (
        <div onClick={() => setProjectFor(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 24, width: 460 }}>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>持续分析 · 类目 Project</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{projectFor.name}</div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 18 }}>{projectFor.path}</div>
            {projectFor.chatName ? (
              <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: 14, marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>当前对应 · Claude Code 对话</div>
                <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>{projectFor.chatName}</div>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>
                  这个类目当前在 Claude Code 里跟踪。请在终端 <code style={{ background: C.panel2, padding: "1px 5px", borderRadius: 3, color: C.brand }}>claude</code> 里恢复此对话继续。<br />
                  将来迁到 Claude 网页版 Project 后，这里会变成可点跳转链接。
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.7, marginBottom: 18 }}>
                尚未关联持续分析对话。将来这里可以关联一个 Claude 网页版 Project，做持续的市场跟踪、竞品分析、供应商沟通记录，团队共享。
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setProjectFor(null)}
                style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Caret({ open, small }) {
  return <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", color: C.sub, fontSize: small ? 10 : 12, width: 12 }}>▶</span>;
}
function Branch({ title, children }) {
  return (
    <div style={{ marginTop: 8, borderLeft: `2px solid ${C.line}`, paddingLeft: 12 }}>
      <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, letterSpacing: ".04em", marginBottom: 2 }}>{title}</div>
      {children}
    </div>
  );
}
function Empty({ t }) {
  return <div style={{ fontSize: 12, color: C.faint, padding: "4px 0" }}>{t}</div>;
}

// ---------- small bits ----------
function SectionTitle({ t, sub }) {
  return <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 14, fontWeight: 700 }}>{t}</div>
    {sub && <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>{sub}</div>}
  </div>;
}
function Pill({ color, text }) {
  return <span style={{ fontSize: 11, color, border: `1px solid ${color}55`, background: `${color}18`, padding: "2px 8px", borderRadius: 20 }}>{text}</span>;
}
function Stat({ label, value, accent }) {
  return <div>
    <div style={{ fontSize: 11, color: C.sub }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: accent || C.ink, marginTop: 2 }}>{value}</div>
  </div>;
}
const btn = (C) => ({ marginTop: 12, width: "100%", padding: "8px", background: "transparent", border: `1px solid ${C.line}`, color: C.sub, borderRadius: 8, fontSize: 12, cursor: "pointer" });

// ================= 监控指标体系 (仅 KK 本人可见) — 2026-11-23 KK 定 =================
// 五个数: 毛利润 / 毛利润率 / 资本占用 / 月度净现金流 / 超 90 天库存比例
// 口径与《西欧项目_集团监控体系_20261122.md》一致: 营收未税, 毛利润含广告、不含场地人工
const KPI_OWNER_EMAIL = "kinzon.eu@gmail.com";
// 资本占用不设上限 (KK 2026-11-23: "资本占用这个数额没有上限") → 只记录金额, 不判灯
const fmtWan = (n) => "¥" + (Number(n || 0) / 10000).toFixed(1) + " 万";
const fmtPct = (n) => (Number(n || 0)).toFixed(1) + "%";

function KpiCard({ label, value, unit, sub, status, note, calibre }) {
  const col = status === "green" ? C.rec : status === "amber" ? C.watch : status === "red" ? C.drop : status === "info" ? C.brand : C.faint;
  const stText = status === "green" ? "绿" : status === "amber" ? "黄" : status === "red" ? "红" : status === "info" ? "记录" : "缺数据";
  return (
    <div style={{ background: C.panel, border: `1px solid ${status === "none" ? C.drop + "55" : C.line}`, borderRadius: 12, padding: "14px 16px", flex: "1 1 172px", minWidth: 172 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 12, color: C.sub }}>{label}</div>
        <Pill color={col} text={stText} />
      </div>
      <div style={{ fontSize: 23, fontWeight: 700, color: status === "none" ? C.faint : col, marginTop: 6 }}>
        {value}{unit ? <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 2 }}>{unit}</span> : null}
      </div>
      {sub && <div style={{ fontSize: 13, fontWeight: 600, color: status === "none" ? C.faint : col, marginTop: 1, opacity: 0.85 }}>{sub}</div>}
      {note && <div style={{ fontSize: 11, color: status === "none" ? C.drop : C.sub, marginTop: 7, lineHeight: 1.55 }}>{note}</div>}
      {calibre && <div style={{ fontSize: 11, color: C.faint, marginTop: 4, lineHeight: 1.5 }}>{calibre}</div>}
    </div>
  );
}

function KpiDashboard() {
  const [inv, setInv] = useState([]);
  const [ship, setShip] = useState([]);
  const [pur, setPur] = useState([]);
  const [flow, setFlow] = useState({ pay: [], op: [], office: [], other: [], rec: [] });
  const [cnt, setCnt] = useState({ smc: null, rec: null, orders: null });
  const [smc, setSmc] = useState([]);
  const [cf, setCf] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let on = true;
    const countOf = (t) => supabase.from(t).select("id", { count: "exact", head: true })
      .then(({ count, error }) => (error ? -1 : (count || 0))).catch(() => -1);
    Promise.all([
      supabase.from("inventory").select("store,product_name,asin,ship_date,landed_cost,stock_qty,listed_qty").limit(5000),
      supabase.from("shipments").select("store,product_name,ship_date,qty,landed_cost,goods_value,listed").limit(5000),
      supabase.from("store_monthly_costs").select("month,store,item,amount").limit(3000),
      countOf("recoveries"),
      countOf("order_records"),
      supabase.from("v_cashflow_monthly").select("period,total_in,total_out,recovery,net_core,net_all").order("period", { ascending: false }).limit(6),
      supabase.from("purchase_records").select("store,product_name,qty,total_amount,paid_amount,pay_status,receive_status").limit(2000),
      supabase.from("purchase_payments").select("amount,pay_date").limit(1000),
      supabase.from("opsfee_monthly").select("amount,month,category").limit(3000),
      supabase.from("office_expense").select("amount,month,exp_date").limit(1000),
      supabase.from("store_other_expense").select("amount,month,exp_date,store,category").limit(1000),
      supabase.from("recoveries").select("amount_cny,recv_date").limit(3000),
    ]).then(([a, b, c1, c2, c3, dv, pr, pp, op, of, ot, rc]) => {
      if (!on) return;
      if (a.error) setErr(a.error.message);
      setInv(a.data || []);
      setShip(b.data || []);
      setPur(pr && !pr.error && pr.data ? pr.data : []);
      setFlow({
        pay: pp && !pp.error ? (pp.data || []) : [],
        op: op && !op.error ? (op.data || []) : [],
        office: of && !of.error ? (of.data || []) : [],
        other: ot && !ot.error ? (ot.data || []) : [],
        rec: rc && !rc.error ? (rc.data || []) : [],
      });
      const smcRows = c1 && !c1.error && Array.isArray(c1.data) ? c1.data : [];
      setSmc(smcRows);
      setCnt({ smc: smcRows.length, rec: c2, orders: c3 });
      setCf(dv && !dv.error && dv.data ? dv.data : []);
      setLoading(false);
    }).catch((e) => { if (on) { setErr(String(e.message || e)); setLoading(false); } });
    return () => { on = false; };
  }, []);

  const stockOf = (r) => Number(r.stock_qty ?? r.listed_qty ?? 0);
  const ageOf = (r) => (r.ship_date ? Math.floor((Date.now() - new Date(r.ship_date + "T00:00:00").getTime()) / 86400000) : null);

  const agg = useMemo(() => {
    const st = {};
    let qty = 0, val = 0, o90qty = 0, o90val = 0, noDate = 0;
    inv.forEach((r) => {
      const q = stockOf(r), v = q * Number(r.landed_cost || 0), s = r.store || "未知";
      qty += q; val += v;
      if (!st[s]) st[s] = { qty: 0, val: 0, o90val: 0, o90qty: 0, sku: 0 };
      st[s].qty += q; st[s].val += v; if (q > 0) st[s].sku += 1;
      const a = ageOf(r);
      if (a === null) noDate += 1;
      else if (a > 90) { o90qty += q; o90val += v; st[s].o90val += v; st[s].o90qty += q; }
    });
    const inTransit = (ship || []).filter((r) => !r.listed);
    const tQty = inTransit.reduce((s, r) => s + Number(r.qty || 0), 0);
    const tVal = inTransit.reduce((s, r) => s + Number(r.qty || 0) * Number(r.landed_cost || 0), 0);
    // 采购已付但未收货入库: 钱已经出去了, 但 inventory / shipments 里都没有 → 属于存货占用, 之前漏算
    const preRows = (pur || []).filter((r) => r.pay_status === "paid" && r.receive_status !== "received");
    const preVal = preRows.reduce((s, r) => s + Number(r.paid_amount || r.total_amount || 0), 0);
    const preQty = preRows.reduce((s, r) => s + Number(r.qty || 0), 0);
    return {
      qty, val, o90qty, o90val, noDate,
      o90pct: val ? (o90val / val) * 100 : 0,
      stores: st,
      transitQty: tQty, transitVal: tVal, transitRows: inTransit.length,
      preQty, preVal, preRows: preRows.length,
      cap: val + tVal + preVal,
    };
  }, [inv, ship, pur]);

  // 现金口径（KK 2026-11-23 要求）：累计投入 = 付出去的现金；净投入 = 累计投入 − 累计回款
  // 注意：采购付款与"存货"不能相加（同一笔钱，一次是付款、一次是货），本式只用付款，不用存货
  const cash = useMemo(() => {
    const sum = (rows, k = "amount") => (rows || []).reduce((t, r) => t + Number(r[k] || 0), 0);
    const pay = sum(flow.pay), op = sum(flow.op), office = sum(flow.office), other = sum(flow.other);
    const out = pay + op + office + other;
    const inflow = sum(flow.rec, "amount_cny");
    return { pay, op, office, other, out, inflow, net: out - inflow, recRows: (flow.rec || []).length, payRows: (flow.pay || []).length };
  }, [flow]);

  // 月度还原（KK 2026-11-23）: 数据来自 store_monthly_costs(收入/人工/场地) + opsfee_monthly(平台费) + store_other_expense + office_expense
  // 口径提醒: opsfee_monthly 只含平台费(广告/仓储/月租/弃置等), 不含采购/头程/佣金/VAT/退货 → 本表算出的"店铺利润"是"销售额 − 平台费", 高于真实毛利
  const monthly = useMemo(() => {
    const M = {};
    const put = (k) => (M[k] = M[k] || { income: 0, labor: 0, site: 0, smcOther: 0, opsfee: 0, otherExp: 0, office: 0 });
    const mk = (r) => (r.month ? String(r.month).slice(0, 7) : String(r.exp_date || "").slice(0, 7));
    (smc || []).forEach((r) => {
      const k = mk(r); if (!k) return;
      const o = put(k);
      if (r.item === "收入") o.income += Number(r.amount || 0);
      else if (r.item === "人工") o.labor += Number(r.amount || 0);
      else if (r.item === "场地") o.site += Number(r.amount || 0);
      else o.smcOther += Number(r.amount || 0);
    });
    (flow.op || []).forEach((r) => { const k = mk(r); if (k) put(k).opsfee += Number(r.amount || 0); });
    (flow.other || []).forEach((r) => { const k = mk(r); if (k) put(k).otherExp += Number(r.amount || 0); });
    (flow.office || []).forEach((r) => { const k = mk(r); if (k) put(k).office += Number(r.amount || 0); });
    const rows = Object.keys(M).sort().map((k) => {
      const o = M[k];
      const profit = o.income - o.opsfee - o.otherExp - o.smcOther;
      const net = profit - o.labor - o.site - o.office;
      return { month: k, ...o, profit, net, margin: o.income ? (profit / o.income) * 100 : null };
    });
    // 最近一个"收入 > 0"的月份 = 唯一可信月
    const last = [...rows].reverse().find((r) => r.income > 0) || null;
    // 最近一个"人工 ≥ 2 万"的月份（判断人力是否录全）
    const lastLaborFull = [...rows].reverse().find((r) => r.labor >= 20000) || null;
    return { rows, last, lastLaborFull };
  }, [smc, flow]);


  const capStatus = "info";   // 资本占用不设上限, 只记录 (KK 2026-11-23)
  const cfLatest = (cf && cf.length) ? (cf.find((r) => Number(r.total_in) > 0) || cf[0]) : null;
  const o90Status = agg.o90pct > 15 ? "red" : agg.o90pct > 10 ? "amber" : "green";
  const lm = monthly.last;                       // 最近可信月
  const incomeGapFrom = "2026-09";               // 收入自 9 月起未录
  const laborGapFrom = "2026-10";                // 共享人工自 10 月起未分摊
  const missingRevenue = !lm;
  const missingCash = cnt.rec === 0;
  const hasIncomeGap = !!lm && lm.month < incomeGapFrom;

  if (loading) return <div style={{ fontSize: 12, color: C.sub }}>正在计算五个数…</div>;

  return (
    <div>
      <SectionTitle t="监控指标体系" sub={"集团只看五个数 · 毛利润 / 毛利润率 / 资本占用 / 月度净现金流 / 超 90 天库存比例 · 数据时点 " + new Date().toLocaleString("zh-CN", { hour12: false })} />
      {err && <div style={{ fontSize: 12, color: C.drop, marginBottom: 10 }}>读取失败: {err}</div>}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <KpiCard label="毛利润" value={lm ? fmtWan(lm.profit) : "—"} status={lm ? "info" : "none"}
          sub={lm ? lm.month + " 口径未完整" : undefined}
          note={lm
            ? "＝ 销售额 − 平台费(广告/仓储/月租/弃置) − 店铺其他｜⚠️ 采购·头程·佣金·VAT·退货 未入账 → 此数偏高，暂不判灯"
            : "1–8 月有数，9 月起收入未录"}
          calibre="绿 ≥6.7 万 / 红 <3.34 万（口径补齐后才生效）" />
        <KpiCard label="毛利润率" value={lm && lm.margin !== null ? fmtPct(lm.margin) : "—"} status={lm ? "info" : "none"}
          sub={lm ? lm.month : undefined}
          note={lm ? "同口径，偏高｜分母＝销售额，真实分母应为未税营收" : "无收入即无率"}
          calibre="绿 ≥15% / 红 <12%（口径补齐后才生效）" />
        <KpiCard label="资本占用" value={fmtWan(agg.cap)} status={capStatus}
          note={"存货 " + fmtWan(agg.val + agg.transitVal) + " ＋ 采购已付未入库 " + fmtWan(agg.preVal)}
          calibre="纯存货口径 = 在仓 + 在途未上架 + 已付未收货｜不含应收/储备金｜不设上限，只记录" />
        <KpiCard label="月度净现金流" value={cfLatest ? fmtWan(cfLatest.net_all) : "—"}
          status={!cfLatest ? "none" : Number(cfLatest.net_all) >= 0 ? "green" : "red"}
          note={cfLatest
            ? cfLatest.period + " 回款 " + fmtWan(cfLatest.total_in) + " − 支出 " + fmtWan(cfLatest.total_out) + (cnt.rec === 0 ? " · 回款表仍为空" : "")
            : "缺回款：recoveries " + (cnt.rec ?? "?") + " 条 → v_cashflow_monthly 只有支出、无收入"}
          calibre="= 当月回款 − 采购付现 − 物流 − 人工 − 场地 − 其他" />
        <KpiCard label="超 90 天库存" value={fmtWan(agg.o90val)} sub={"占在仓 " + fmtPct(agg.o90pct) + " · " + agg.o90qty + " 件"} status={o90Status}
          note={"超 90 天 ¥" + Math.round(agg.o90val).toLocaleString() + " ÷ 在仓 ¥" + Math.round(agg.val).toLocaleString() + "（按 ship_date 起算）"}
          calibre="金额做判定，比例看趋势｜比例↓但金额↑ = 新货稀释老货 → 判黄" />
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>资本占用构成（纯存货口径）</div>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <Stat label={"在仓存货（" + agg.qty + " 件）"} value={fmtWan(agg.val)} />
          <Stat label={"在途 / 未上架（" + agg.transitQty + " 件 · " + agg.transitRows + " 条）"} value={fmtWan(agg.transitVal)} />
          <Stat label={"采购已付未入库（" + agg.preQty + " 件 · " + agg.preRows + " 单）"} value={fmtWan(agg.preVal)} accent={agg.preVal > 0 ? C.watch : undefined} />
          <Stat label="资本占用合计" value={fmtWan(agg.cap)} accent={C.brand} />
          <Stat label="单件平均占用" value={"¥" + Math.round(agg.cap / Math.max(agg.qty + agg.transitQty + agg.preQty, 1))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", fontSize: 11, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.line}`, lineHeight: 1.7 }}>
          <div style={{ color: C.rec, fontWeight: 700 }}>已计入</div>
          <div style={{ color: C.sub }}>
            ① 在仓存货 = inventory.stock_qty × landed_cost<br />
            ② 在途未上架 = shipments(listed=false).qty × landed_cost<br />
            ③ 采购已付未入库 = purchase_records(已付 且 未收货).paid_amount
          </div>
          <div style={{ color: C.drop, fontWeight: 700 }}>未计入</div>
          <div style={{ color: C.sub }}>
            ① 应收账款（已售未回款）—— 缺订单/结算数据，recoveries 仅收录到账<br />
            ② 平台储备金 / 冻结资金 —— Amazon 结算周期内留存<br />
            ③ 应付账款 —— 现为全款先付，无账期，≈ 0<br />
            ④ 现金 —— 未投出去的钱，不算占用
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>
          资本占用不设上限，只作为记录值与回报率分母。金额变大本身不是坏事（备货增加会推高它）；
          判据是资本回报率 = 年化毛利润 ÷ 资本占用。注意：仅存货口径会低估占用、推高回报率，接入应收后才准。
        </div>
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>现金口径：累计投入 − 累计回款</div>
          <div style={{ fontSize: 11, color: C.faint }}>钱投进去多少、收回多少、还剩多少没回来</div>
        </div>
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginTop: 10 }}>
          <Stat label="累计投入（已付现金）" value={fmtWan(cash.out)} />
          <Stat label="累计回款" value={fmtWan(cash.inflow)} accent={cash.inflow > 0 ? C.rec : C.faint} />
          <Stat label="净投入（还压着）" value={fmtWan(cash.net)} accent={C.brand} />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 10 }}>
          <thead>
            <tr style={{ color: C.sub, textAlign: "right" }}>
              <th style={{ textAlign: "left", padding: "5px 8px", fontWeight: 500 }}>支出项</th>
              <th style={{ padding: "5px 8px", fontWeight: 500 }}>金额</th>
              <th style={{ padding: "5px 8px", fontWeight: 500 }}>条数</th>
              <th style={{ padding: "5px 8px", fontWeight: 500 }}>数据区间</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["采购付款", cash.pay, cash.payRows, "仅 11 月，历史未录 ⚠️"],
              ["平台 / 运维费", cash.op, (flow.op || []).length, "2025-01 ~ 2026-10"],
              ["办公费用", cash.office, (flow.office || []).length, "2026-01 ~ 2026-11"],
              ["店铺其他", cash.other, (flow.other || []).length, "VAT/美工/说明书等"],
            ].map(([n, v, c, r], i) => (
              <tr key={i} style={{ borderTop: `1px solid ${C.line}`, textAlign: "right" }}>
                <td style={{ textAlign: "left", padding: "6px 8px" }}>{n}</td>
                <td style={{ padding: "6px 8px" }}>{fmtWan(v)}</td>
                <td style={{ padding: "6px 8px", color: C.sub }}>{c}</td>
                <td style={{ padding: "6px 8px", color: C.faint, textAlign: "left" }}>{r}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: C.drop, marginTop: 9, lineHeight: 1.75 }}>
          ⚠️ 这个数现在还不能用于决策，四处断点（按缺口金额排序）：<br />
          ① <b>历史采购付款未录</b> —— 存货 {fmtWan(agg.cap)}，付款记录只有 {fmtWan(cash.pay)}（仅 11 月），差额全在「已付未入账」<br />
          ② <b>收入自 2026-09 起未录</b> —— store_monthly_costs 共 {cnt.smc ?? "?"} 条，1–8 月月均 ¥7.5 万，9 月起为 0<br />
          ③ <b>共享人工自 2026-10 起未分摊</b> —— 1–9 月月均 ¥2.3 万（含共享），10 月起只剩俊业+乾霖 ¥8,600，月缺约 ¥2.3 万<br />
          ④ <b>回款表被 RLS 锁定</b> —— recoveries {cash.recRows} 条；后端账号实测 INSERT 返回 403，乾霖 53 笔进不来
        </div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 6, lineHeight: 1.6 }}>
          口径说明：采购付款与「存货」不能相加 —— 同一笔钱，付出去时算付款、到仓后算存货，加两次就是重复。
          所以本式只用支出流水，不掺存货；存货是「钱变成了什么形态」，用上面那个面板看。
        </div>
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14, overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>月度还原（销售额 − 平台费 = 店铺利润）</div>
          <div style={{ fontSize: 11, color: C.faint }}>store_monthly_costs（收入/人工/场地）＋ opsfee_monthly（平台费）＋ 店铺其他 ＋ 办公</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: C.sub, textAlign: "right" }}>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500 }}>月份</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>收入</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>平台费</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>店铺其他</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>店铺利润</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>利润率</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>人工</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>场地</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>办公</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>净利</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>状态</th>
            </tr>
          </thead>
          <tbody>
            {monthly.rows.map((r) => {
              const noIncome = r.income <= 0;
              const laborShort = r.income > 0 && r.labor > 0 && r.labor < 20000;
              const dim = { color: noIncome ? C.faint : C.ink };
              return (
                <tr key={r.month} style={{ borderTop: `1px solid ${C.line}`, textAlign: "right", ...dim }}>
                  <td style={{ textAlign: "left", padding: "6px 8px" }}>{r.month}</td>
                  <td style={{ padding: "6px 8px" }}>{Math.round(r.income).toLocaleString()}</td>
                  <td style={{ padding: "6px 8px", color: C.sub }}>{Math.round(r.opsfee).toLocaleString()}</td>
                  <td style={{ padding: "6px 8px", color: C.sub }}>{Math.round(r.otherExp + r.smcOther).toLocaleString()}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 600, color: noIncome ? C.faint : r.profit >= 0 ? C.rec : C.drop }}>
                    {noIncome ? "—" : Math.round(r.profit).toLocaleString()}
                  </td>
                  <td style={{ padding: "6px 8px", color: r.margin === null ? C.faint : r.margin >= 15 ? C.rec : r.margin >= 12 ? C.watch : C.drop }}>
                    {r.margin === null ? "—" : fmtPct(r.margin)}
                  </td>
                  <td style={{ padding: "6px 8px", color: laborShort ? C.watch : C.sub }}>{Math.round(r.labor).toLocaleString()}</td>
                  <td style={{ padding: "6px 8px", color: C.sub }}>{Math.round(r.site).toLocaleString()}</td>
                  <td style={{ padding: "6px 8px", color: C.sub }}>{Math.round(r.office).toLocaleString()}</td>
                  <td style={{ padding: "6px 8px", color: noIncome ? C.faint : r.net >= 0 ? C.rec : C.drop }}>
                    {noIncome ? "—" : Math.round(r.net).toLocaleString()}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "left", fontSize: 11 }}>
                    {noIncome ? <span style={{ color: C.drop }}>收入未录</span>
                      : laborShort ? <span style={{ color: C.watch }}>人工未录全</span>
                        : <span style={{ color: C.rec }}>完整</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: C.drop, marginTop: 9, lineHeight: 1.7 }}>
          ⚠️ 口径缺口：本表「平台费」只含广告/仓储/月租/弃置/入库等平台实扣，<b>不含采购成本、头程、佣金、VAT、退货</b> →
          所以「店铺利润」是「销售额 − 平台费」，<b>比真实毛利高一个采购成本的量级</b>，不能直接当毛利用、也不能直接拿去判灯。
          补齐这 5 项，这张表才成为完整的月度损益表。
        </div>
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.brand}55`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.brand }}>等式：把账闭成一个环（2026-11 起建基线）</div>
          <div style={{ fontSize: 11, color: C.faint }}>KK 2026-11-23：历史缺口不追求一次补齐，从本月起只做当期，逐月把缺口迭代掉</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
          <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>现金侧（钱）</div>
            <div style={{ fontSize: 12, lineHeight: 2, fontFamily: "monospace" }}>
              期初缺口 <span style={{ float: "right" }}>{fmtWan(Math.max(agg.cap - cash.net, 0))}</span><br />
              ＋ 本期流出 <span style={{ float: "right" }}>{fmtWan(cash.out)}</span><br />
              − 本期回款 <span style={{ float: "right", color: cash.inflow > 0 ? C.rec : C.drop }}>{fmtWan(cash.inflow)}</span><br />
              <span style={{ borderTop: `1px solid ${C.line}`, display: "block", paddingTop: 4 }}>
                ＝ 期末占用 <span style={{ float: "right", fontWeight: 700, color: C.brand }}>{fmtWan(Math.max(agg.cap - cash.net, 0) + cash.net)}</span>
              </span>
            </div>
          </div>
          <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>实务侧（货）</div>
            <div style={{ fontSize: 12, lineHeight: 2, fontFamily: "monospace" }}>
              在仓 <span style={{ float: "right" }}>{fmtWan(agg.val)}</span><br />
              ＋ 在途未上架 <span style={{ float: "right" }}>{fmtWan(agg.transitVal)}</span><br />
              ＋ 已付未入库 <span style={{ float: "right" }}>{fmtWan(agg.preVal)}</span><br />
              <span style={{ borderTop: `1px solid ${C.line}`, display: "block", paddingTop: 4 }}>
                ＝ 资本占用 <span style={{ float: "right", fontWeight: 700, color: C.brand }}>{fmtWan(agg.cap)}</span>
              </span>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, marginTop: 12, padding: "10px 12px", background: C.drop + "12", border: `1px solid ${C.drop}44`, borderRadius: 8, lineHeight: 1.75 }}>
          <b style={{ color: C.drop }}>两边对不上 = 历史缺口：</b>
          现金侧期末 {fmtWan(Math.max(agg.cap - cash.net, 0) + cash.net)} vs 实务侧资本占用 {fmtWan(agg.cap)}，
          差 <b style={{ color: C.drop }}>{fmtWan(Math.abs(agg.cap - (Math.max(agg.cap - cash.net, 0) + cash.net)))}</b>。
          这个差额就是「货已经买了、钱付了、但付款流水没进系统」的部分 —— 它是期初缺口，不是错误；
          从 11 月起每月补记当期付款与回款，缺口只会被利润和回款单向压降，不会自己扩大。
        </div>
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14, overflowX: "auto" }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>分店拆解（只注释，不改灯）</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: C.sub, textAlign: "right" }}>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500 }}>店铺</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>件数</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>在仓货值</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>超 90 天货值</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>占比</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>判定</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(agg.stores).sort((a, b) => b[1].val - a[1].val).map(([s, b]) => {
              const pct = b.val ? (b.o90val / b.val) * 100 : 0;
              const c = pct > 15 ? C.drop : pct > 10 ? C.watch : C.rec;
              return (
                <tr key={s} style={{ borderTop: `1px solid ${C.line}`, textAlign: "right" }}>
                  <td style={{ textAlign: "left", padding: "7px 8px" }}>{s}</td>
                  <td style={{ padding: "7px 8px", color: C.sub }}>{b.qty}</td>
                  <td style={{ padding: "7px 8px" }}>{fmtWan(b.val)}</td>
                  <td style={{ padding: "7px 8px", color: C.sub }}>{fmtWan(b.o90val)}</td>
                  <td style={{ padding: "7px 8px", color: c, fontWeight: 600 }}>{fmtPct(pct)}</td>
                  <td style={{ padding: "7px 8px" }}><Pill color={c} text={pct > 15 ? "红" : pct > 10 ? "黄" : "绿"} /></td>
                </tr>
              );
            })}
            <tr style={{ borderTop: `1px solid ${C.line}`, textAlign: "right", fontWeight: 700 }}>
              <td style={{ textAlign: "left", padding: "8px" }}>合计</td>
              <td style={{ padding: "8px" }}>{agg.qty}</td>
              <td style={{ padding: "8px" }}>{fmtWan(agg.val)}</td>
              <td style={{ padding: "8px" }}>{fmtWan(agg.o90val)}</td>
              <td style={{ padding: "8px", color: o90Status === "red" ? C.drop : C.watch }}>{fmtPct(agg.o90pct)}</td>
              <td style={{ padding: "8px" }}><Pill color={o90Status === "red" ? C.drop : o90Status === "amber" ? C.watch : C.rec} text={o90Status === "red" ? "红" : o90Status === "amber" ? "黄" : "绿"} /></td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>
          库龄以「发货日 ship_date」起算，只计当前库存件数（stock_qty × 落地成本）。与「库存统计」页的货值口径一致。
          注：历史上 24.4% 那组是「死货 + 库龄预警」口径（另含无销判定），与本页的纯 90 天库龄口径不同，两个数不能直接比。
        </div>
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.drop}55`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: C.drop }}>还缺什么（按对结论的影响排序）</div>
        <div style={{ fontSize: 11, color: C.sub, marginBottom: 10 }}>
          人工与场地<b style={{ color: C.rec }}>本来就录了</b>（store_monthly_costs 共 {cnt.smc ?? "?"} 条，覆盖 1–12 月）——
          真正缺的是「收入从 9 月起断」「共享人工从 10 月起断」和「采购成本类 5 项从未入账」。
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: C.sub, textAlign: "left" }}>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>缺的数</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>落在哪张表</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>现状</th>
              <th style={{ padding: "6px 8px", fontWeight: 500 }}>谁能补</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["采购 / 头程 / 佣金 / VAT / 退货", "opsfee_monthly 无这 5 类", "从未入账 → 毛利算不准", "SP-API Settlement 或周报导入"],
              ["2026-09 起 营收", "store_monthly_costs item=收入", "1–8 月有，9–12 月为 0", "夏蕾 / 财务专员"],
              ["2026-10 起 共享人工", "store_monthly_costs item=人工 store=__shared__", "1–9 月有，10 月起为 0", "夏蕾"],
              ["历史采购付款", "purchase_payments", "仅 11 月有，之前空", "夏蕾（从本月起，历史不追）"],
              ["平台回款", "recoveries", "0 条（RLS 锁给 owner，后端 403）", "授权后由 AI 自动导入"],
            ].map((r) => (
              <tr key={r[0]} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: "7px 8px" }}>{r[0]}</td>
                <td style={{ padding: "7px 8px", color: C.sub, fontFamily: "monospace" }}>{r[1]}</td>
                <td style={{ padding: "7px 8px", color: C.drop }}>{r[2]}</td>
                <td style={{ padding: "7px 8px", color: C.sub }}>{r[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {missingRevenue && <div style={{ fontSize: 11, color: C.watch, marginTop: 10 }}>⚠️ 一个月的收入都没有 → 毛利润、毛利润率、以及依赖它的提成与季度利润奖，全部悬空。</div>}
        {missingCash && <div style={{ fontSize: 11, color: C.watch, marginTop: 4 }}>⚠️ 回款一条都没有 → 月度净现金流只有支出、没有进项，net_all 全为负，不可用于判断。</div>}
      </div>
    </div>
  );
}

// build trigger 1786350204773

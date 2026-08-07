import React, { useState, useMemo, useEffect } from "react";
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
};
// 邮箱 → 角色
const EMAIL_TO_ROLE = {
  "kinzon.eu@gmail.com":  "admin",          // KK
  "qianlin20222@163.com": "fr",             // 法国成员 (2026-08-07 确认, 全权限)
  "503279601@qq.com":     "cd_promotion",   // 成都·推广 (已确认)
  "2386332469@qq.com":    "cd_link",        // 成都·链接 (2026-08-07 确认)
  "2990206556@qq.com":    "cd_supplier",    // 成都·供应链 (2026-08-07 确认)
  // "915126059@qq.com": "?",               // 此前误映射为法国, 实际不是, 用途待 KK 确认
};
const getUserRole = (email) => EMAIL_TO_ROLE[email] || null;
const getRoleLabel = (role) => (ROLE_PERMISSIONS[role] && ROLE_PERMISSIONS[role].label) || (role ? "未授权" : "未登录");

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
  const suppliersByLeaf = {};
  suppliers.forEach(s => { (suppliersByLeaf[s.leaf_id] = suppliersByLeaf[s.leaf_id] || []).push(s); });

  const buildProducts = (leafId) => (productsByLeaf[leafId] || []).map(p => ({ id: p.id, name: p.name, st: p.st || "idle", asin: p.asin || null }));
  const buildSuppliers = (leafId) => (suppliersByLeaf[leafId] || []).map(s => ({ id: s.id, factory: s.factory, contact: s.contact, products: s.main_products }));
  const buildLeaves = (catId) => (leavesByCat[catId] || []).map(l => ({ id: l.id, leaf: l.leaf_name, path: l.path, st: l.st || "idle", phase: l.phase || null, chatName: l.chat_name || null, chatUrl: l.chat_url || null, products: buildProducts(l.id), suppliers: buildSuppliers(l.id) }));

  // CAT_DETAIL: 三重 key 兼容旧 catDetail(name, group) 查找
  CAT_DETAIL = {};
  cats.forEach(c => {
    const g = groups.find(x => x.id === c.group_id);
    const gName = g ? g.name : "";
    const entry = { leaves: buildLeaves(c.id) };
    CAT_DETAIL[gName + " || " + c.name] = entry;
    CAT_DETAIL[c.id] = entry;
    if (!CAT_DETAIL[c.name]) CAT_DETAIL[c.name] = entry;
  });

  // BRAND_SHELF: flat 品牌把所有组的类目拍平进一个 __flat__ 组
  BRAND_SHELF = {};
  brands.forEach(b => {
    const bs = { store: b.store, fullName: b.full_name, flat: !!b.flat, groups: [] };
    const myGroups = groupsByBrand[b.code] || [];
    if (b.flat) {
      const allCats = myGroups.flatMap(g => (catsByGroup[g.id] || []).map(c => ({ id: c.id, name: c.name, st: c.st || "idle", chatName: c.chat_name || null })));
      bs.groups = [{ name: "__flat__", cats: allCats }];
    } else {
      bs.groups = myGroups.map(g => ({
        name: g.name,
        cats: (catsByGroup[g.id] || []).map(c => ({ id: c.id, name: c.name, st: c.st || "idle", chatName: c.chat_name || null, chatUrl: c.chat_url || null })),
      }));
    }
    BRAND_SHELF[b.code] = bs;
  });

  // ID_NAME: 全量 id → 名称映射
  ID_NAME = {};
  cats.forEach(c => { ID_NAME[c.id] = { kind: "cat", name: c.name, path: c.name }; });
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
  selling:         { label: "在售", color: "#4db6a4" },
  idle:            { label: "还没动", color: "#5b6670" },
  skip:            { label: "不做", color: "#7a5b52" },
  researched_skip: { label: "已调研不做", color: "#7a5b52" },
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

// 调研阶段 (leaf 的 idle 细分): 1 立项 → 2 前置调研 → 3 挖掘供应商 → 4 定款
// 中文显示为 "在调研-立项" 等, 挂在 st=idle 的 leaf 上, phase 为空 = 笼统"在调研"
const LEAF_PHASE = {
  planning:    { label: "在调研-立项", color: "#d9a441" },
  pre_research:{ label: "在调研-前置调研", color: "#d9a441" },
  supplier:    { label: "在调研-挖掘供应商", color: "#d9a441" },
  spec:        { label: "在调研-定款", color: "#d9a441" },
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
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data && data.user) setCurRole(getUserRole(data.user.email || ""));
    });
  }, []);

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
        .tab { padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px; letter-spacing:.02em; border:1px solid transparent; }
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

      {/* tabs */}
      <div style={{ display: "flex", gap: 6, padding: "14px 24px 0" }}>
        {[["overview", "开发进度"], ["shelf", "类目明细"], ["cross", "存量产品跨站点开发"], ["track", "链接日级跟进"], ["shipments", "发货记录"], ["inventory", "库存统计"], ["score", "链接评分"], ...(curRole === "admin" ? [["finance", "财务核算"]] : [])].map(([k, l]) => (
          <div key={k} className="tab" onClick={() => setTab(k)}
            style={{ background: tab === k ? C.panel : "transparent", border: tab === k ? `1px solid ${C.line}` : "1px solid transparent", color: tab === k ? C.ink : C.sub }}>
            {l}
          </div>
        ))}
      </div>

      <div style={{ padding: "20px 24px 60px" }}>
        {tab === "overview" && <Overview siteEvals={siteEvals} onPick={(p) => { setSel(p); setTab("cross"); }} />}
        {tab === "shelf" && <Shelf />}
        {tab === "cross" && <CrossSite sel={sel} setSel={setSel} />}
        {tab === "track" && <Track selSku={selSku} setSelSku={setSelSku} />}
        {tab === "shipments" && <Shipments />}
        {tab === "inventory" && <InventoryStats />}
        {tab === "score" && <LinkScore />}
        {tab === "finance" && <Finance />}
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
      const info = ID_NAME[h.leaf_id];
      if (!info || info.kind !== "leaf") return;
      // h1 框只显示 phase=planning (立项期间语义); 其他框接收任意 phase
      if (h.box_key === "h1" && info.phase !== "planning") return;
      const start = h.start_at ? new Date(h.start_at) : null;
      const dur = start ? ((Date.now() - start.getTime()) / 86400000) : null;
      const durText = dur == null ? "—" : (dur < 1 ? `${Math.max(1, Math.round(dur * 24))} 小时` : `${Math.floor(dur)} 天 ${Math.round((dur % 1) * 24)} 小时`);
      const lg = lToGroup[h.leaf_id] || {};
      const group = lg.group || "未分类";
      if (!m[h.box_key].byGroup[group]) m[h.box_key].byGroup[group] = [];
      m[h.box_key].byGroup[group].push({
        leafId: h.leaf_id,
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
  const moveTo = async (leafId, targetBox) => {
    if (!leafId || !targetBox) return;
    // 找当前 box
    const cur = (handoffs || []).find(h => h.leaf_id === leafId);
    const fromBox = cur ? cur.box_key : null;
    // 权限检查
    if (!canDrop(fromBox, targetBox, userRole)) {
      const fromTitle = fromBox ? (HANDOFF_BOXES.find(b => b.id === fromBox) || {}).title : "(无)";
      const toTitle = (HANDOFF_BOXES.find(b => b.id === targetBox) || {}).title || targetBox;
      alert(`无权操作：${roleLabel} 不能把类目从「${fromTitle}」拖到「${toTitle}」`);
      return;
    }
    const now = new Date().toISOString();
    const info2 = ID_NAME[leafId];
    // admin/fr 拖出 h1 (到非 h2 框) → 移出交接流程 + 标 researched_skip
    if (isFullAccess && fromBox === "h1" && targetBox !== "h2") {
      const ok = confirm(`放弃此调研：将 "${info2 ? info2.name : leafId}" 标记为「已调研不做」并移出交接流程？`);
      if (!ok) return;
      const { error: e1 } = await supabase.from("shelf_leaves").update({ st: "researched_skip", phase: null }).eq("id", leafId);
      if (e1) { alert("标记失败: " + e1.message); return; }
      await supabase.from("monitor_handoff").delete().eq("leaf_id", leafId);
      try {
        await supabase.from("monitor_handoff_log").insert({
          leaf_id: leafId, from_box: fromBox, to_box: null, moved_at: now,
          moved_by_email: currentEmail, note: "researched_skip",
        });
      } catch (e) { /* 表可能未建 */ }
      await Promise.all([loadHandoffs(), loadHandoffLog()]);
      try { await fetchShelfData(); } catch (e) {}
      return;
    }
    // 一致性校验: 目标框要求的状态与类目当前状态匹配 (KK: 不一致弹报错框)
    const curSt = info2 ? info2.st : null;
    const allowedSt = BOX_ALLOWED_ST[targetBox];
    if (allowedSt && curSt && !allowedSt.includes(curSt)) {
      const boxTitle = (HANDOFF_BOXES.find(b => b.id === targetBox) || {}).title || targetBox;
      const stLabel = SHELF_ST[curSt] ? SHELF_ST[curSt].label : curSt;
      const needLabel = allowedSt.map(s => (SHELF_ST[s] || {}).label || s).join(" / ");
      alert(`状态不一致：该类目当前是「${stLabel}」，不能拖到「${boxTitle}」（此阶段要求「${needLabel}」）。\n请先在类目明细把状态改为「${needLabel}」（或由管理员操作）。`);
      return;
    }
    // 写主表
    const { error } = await supabase.from("monitor_handoff")
      .upsert({ leaf_id: leafId, box_key: targetBox, start_at: now }, { onConflict: "leaf_id" });
    if (error) { alert("保存失败: " + error.message); return; }
    // 写历史 log (KK 需先建表 monitor_handoff_log; 建表前静默失败)
    try {
      await supabase.from("monitor_handoff_log").insert({
        leaf_id: leafId,
        from_box: fromBox,
        to_box: targetBox,
        moved_at: now,
        moved_by_email: currentEmail,
      });
    } catch (e) { /* 表可能未建, 不影响主流程 */ }
    await Promise.all([loadHandoffs(), loadHandoffLog()]);
  };

  // 拖拽换调研阶段: 更新 shelf_leaves.phase + 记录 monitor_research_progress + 刷新
  // 权限: 默认全部登录用户可操作 (KK: 除交接拖拽外其他全开)
  const movePhase = async (leafId, targetPhase) => {
    if (!leafId || !targetPhase) return;
    const { error: e1 } = await supabase.from("shelf_leaves").update({ phase: targetPhase }).eq("id", leafId);
    if (e1) { alert("保存失败: " + e1.message); return; }
    try {
      const { error: e2 } = await supabase.from("monitor_research_progress")
        .upsert({ leaf_id: leafId, phase: targetPhase, start_at: new Date().toISOString() }, { onConflict: "leaf_id, phase" });
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
    const h = (handoffs || []).find(x => x.leaf_id === dragId);
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
      m[k].byGroup[group].push({ ...l, enterAt: prog ? prog.start_at : null, duration: durText });
      m[k].total++;
    });
    return m;
  }, [lToGroup, progress, tick2]);

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
          const [phaseDrag, setPhaseDrag] = useState(false);
          return (
            <div key={k}
              onDragOver={(e) => { e.preventDefault(); setPhaseDrag(true); }}
              onDragLeave={() => setPhaseDrag(false)}
              onDrop={(e) => { e.preventDefault(); setPhaseDrag(false); if (dragId) movePhase(dragId, k); }}
              style={{ background: C.panel, padding: "14px 12px", minHeight: 60, border: phaseDrag ? `2px dashed ${v.color}` : "2px solid transparent", borderRadius: 6 }}>
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
                            onDragStart={(e) => { e.dataTransfer.setData("text/plain", l.id); setDragId(l.id); }}
                            onDragEnd={() => setDragId(null)}
                            style={{ padding: "3px 0", fontSize: 12, cursor: "grab" }}>
                            <div style={{ color: C.ink }}>{l.name}</div>
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
              onDrop={(e) => { e.preventDefault(); setHoverBox(null); if (dragId) moveTo(dragId, box.id); }}
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
                    <details key={group} style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 8px" }}>
                      <summary style={{ fontSize: 12, fontWeight: 600, color: C.ink, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                        <span>{group}</span>
                        <span style={{ marginLeft: "auto", fontSize: 10, color: C.sub, fontWeight: 400 }}>{items.length} 项</span>
                      </summary>
                      <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: `2px solid ${box.color}` }}>
                        {items.map((it, i) => (
                          <div key={it.leafId} draggable={canDragFrom}
                            onDragStart={(e) => {
                              if (!canDragFrom) { e.preventDefault(); return; }
                              e.dataTransfer.setData("text/plain", it.leafId); setDragId(it.leafId);
                            }}
                            onDragEnd={() => setDragId(null)}
                            style={{ padding: "5px 0", borderTop: i ? `1px solid ${C.line}` : "none", fontSize: 12, cursor: canDragFrom ? "grab" : "not-allowed" }}>
                            <div style={{ color: canDragFrom ? C.ink : C.faint, fontWeight: 600 }}>{it.name}{!canDragFrom && <span style={{ fontSize: 10, color: C.faint, marginLeft: 6 }}>🔒</span>}</div>
                            <div style={{ fontSize: 10, color: C.faint, marginTop: 2, display: "flex", gap: 8 }}>
                              <span>起: {it.start}</span>
                              <span>· 时长: {it.duration}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
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
          例: 选中 2026-07-01 ~ 2026-07-31, 「立项」行 + 「定款」列 = 7月进入立项且最终到达定款的类目数
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
// 全员可见; 仅 admin / cd_promotion(成都推广) 可更新 (RLS 同步)
function Shipments() {
  const [shipRole, setShipRole] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data && data.user) setShipRole(getUserRole(data.user.email || ""));
    });
  }, []);
  const isAdmin = shipRole === "admin";
  const canEdit = shipRole === "admin" || shipRole === "cd_promotion";

  const [rows, setRows] = useState([]);
  const [filterStore, setFilterStore] = useState("");
  const [storeOpts, setStoreOpts] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    let q = supabase.from("shipments").select("*");
    if (filterStore) q = q.eq("store", filterStore);
    const { data, error } = await q.order("ship_date", { ascending: true }).limit(2000);
    if (error) { alert("读取失败(请先建表 shipments): " + error.message); return; }
    setRows(data || []);
    if (!loaded) {
      const { data: all } = await supabase.from("shipments").select("store");
      const st = [...new Set((all || []).map(r => r.store).filter(Boolean))].sort();
      setStoreOpts(st); setLoaded(true);
    }
  };
  useEffect(() => { if (shipRole) load(); }, [shipRole]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (shipRole && loaded) load(); }, [filterStore]);

  // 批次着色: 同一批次 (ship_batch 为空继承上一个非空) 同色, 不同批次不同颜色
  const batchColorOf = useMemo(() => {
    const PALETTE = ["#4db6a4", "#6f8fd0", "#c08fd0", "#d9a441", "#d9756f", "#7fb069", "#b57edc", "#5b9bd5"];
    const sorted = [...rows].sort((a, b) => new Date(a.ship_date) - new Date(b.ship_date));
    const colorOf = {};
    let idx = -1, lastBatch = null;
    sorted.forEach(r => {
      if (r.ship_batch && r.ship_batch !== lastBatch) { idx++; lastBatch = r.ship_batch; }
      colorOf[r.id] = PALETTE[Math.max(0, idx) % PALETTE.length];
    });
    return colorOf;
  }, [rows]);

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
        const missing = FIELDS_65.filter(f => f === "listed_date" ? !r[f] : (r[f] == null || Number(r[f]) === 0));
        if (missing.length) r65.push({ row: r, days: Math.floor(days), missing });
      }
      if (days > 14) {
        const missing = FIELDS_14.filter(f => {
          if (["logistics_provider", "channel", "last_mile_no"].includes(f)) return !r[f];
          return r[f] == null || Number(r[f]) === 0;
        });
        if (missing.length) r14.push({ row: r, days: Math.floor(days), missing });
      }
    });
    return { r65, r14 };
  }, [rows]);

  if (shipRole === null) return <div style={{ color: C.faint, padding: 40 }}>加载中…</div>;

  return (
    <div>
      {/* 顶部 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>发货记录</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            按店铺筛选 · 26 列(按 Excel) · 金额单位人民币(¥) · 日期降序 · 批次同色区分 · 全员可见 · {canEdit ? "成都推广/管理员可更新" : "只读"}
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
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>{rows.length} 条</span>
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

      {/* 表格: 26 列太宽, 横向滚动 */}
      {rows.length ? (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "auto" }}>
          <div style={{ minWidth: 2000 }}>
            <div style={{ display: "grid", gridTemplateColumns: "85px 110px 120px 130px 100px 60px 80px 80px 80px 80px 70px 70px 70px 80px 80px 80px 90px 60px 130px 90px 80px 60px 70px 70px 90px 90px 90px", background: "#1f3a68", fontSize: 10, color: "#fff", fontWeight: 600, position: "sticky", top: 0 }}>
              {["发货日期", "发货仓库", "发货批次", "名称", "ASIN", "数量", "采购价", "货值", "总值", "头程", "杂费", "关税", "保险费", "分摊费", "到仓价", "物流商", "渠道", "单价", "尾程单号", "上架日期", "上架数量", "损耗", "赔付", "亏损", "保险单号", "投保金额", "备注"].map(h => (
                <div key={h} style={{ padding: "8px 6px", borderRight: `1px solid #2a4a78` }}>{h}</div>
              ))}
            </div>
            {rows.map((r, i) => {
              const bColor = batchColorOf[r.id];
              const o65 = checkOverdue.r65.find(o => o.row.id === r.id);
              const o14 = checkOverdue.r14.find(o => o.row.id === r.id);
              const warn = o65 || o14;
              const warnColor = o65 ? "#c05b52" : "#d9a441";
              return (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "85px 110px 120px 130px 100px 60px 80px 80px 80px 80px 70px 70px 70px 80px 80px 80px 90px 60px 130px 90px 80px 60px 70px 70px 90px 90px 90px", borderTop: i ? `1px solid ${C.line}` : "none", fontSize: 11, background: warn ? `${warnColor}22` : (bColor ? `${bColor}1f` : (i % 2 ? C.bg : "transparent")), color: C.ink, borderLeft: warn ? `3px solid ${warnColor}` : (bColor ? `3px solid ${bColor}` : "3px solid transparent") }}>
                <div style={{ padding: "6px", position: "relative" }}>
                  {r.ship_date}
                  {warn && canEdit && <span title={`已过 ${warn.days} 天, 待填: ${warn.missing.join(", ")}`} style={{ marginLeft: 4, color: warnColor, fontWeight: 700, cursor: "help" }}>⚠</span>}
                </div>
                <div style={{ padding: "6px" }}>{r.ship_warehouse || "—"}</div>
                <div style={{ padding: "6px", color: C.sub, fontSize: 10 }}>{r.ship_batch || "—"}</div>
                <div style={{ padding: "6px", fontWeight: 600 }}>{r.product_name}</div>
                <div style={{ padding: "6px", color: C.sub }}>{r.asin || "—"}</div>
                <div style={{ padding: "6px", fontWeight: 600 }}>{r.qty}</div>
                <div style={{ padding: "6px" }}>{r.purchase_price ? "¥" + Number(r.purchase_price).toFixed(2) : "—"}</div>
                <div style={{ padding: "6px" }}>{r.goods_value || "—"}</div>
                <div style={{ padding: "6px" }}>{r.total_value || "—"}</div>
                <div style={{ padding: "6px" }}>{r.freight || "—"}</div>
                <div style={{ padding: "6px" }}>{r.misc_fee || "—"}</div>
                <div style={{ padding: "6px" }}>{r.duty || "—"}</div>
                <div style={{ padding: "6px" }}>{r.insurance_fee || "—"}</div>
                <div style={{ padding: "6px" }}>{r.share_fee || "—"}</div>
                <div style={{ padding: "6px", color: C.brand, fontWeight: 600 }}>{r.landed_cost ? "¥" + Number(r.landed_cost).toFixed(2) : "—"}</div>
                <div style={{ padding: "6px" }}>{r.logistics_provider || "—"}</div>
                <div style={{ padding: "6px", color: C.sub }}>{r.channel || "—"}</div>
                <div style={{ padding: "6px" }}>{r.unit_price ? "¥" + Number(r.unit_price).toFixed(2) : "—"}</div>
                <div style={{ padding: "6px", color: C.faint, fontSize: 10 }}>{r.last_mile_no || "—"}</div>
                <div style={{ padding: "6px" }}>{r.listed_date || "—"}</div>
                <div style={{ padding: "6px" }}>{r.listed_qty || "—"}</div>
                <div style={{ padding: "6px", color: C.drop }}>{r.loss_qty || "—"}</div>
                <div style={{ padding: "6px" }}>{r.compensation_eur ? "¥" + Number(r.compensation_eur).toFixed(2) : "—"}</div>
                <div style={{ padding: "6px", color: C.drop }}>{r.loss_amount ? "¥" + Number(r.loss_amount).toFixed(2) : "—"}</div>
                <div style={{ padding: "6px", color: C.faint, fontSize: 10 }}>{r.insurance_no || "—"}</div>
                <div style={{ padding: "6px" }}>{r.insured_amount ? "¥" + Number(r.insured_amount).toFixed(2) : "—"}</div>
                <div style={{ padding: "6px", color: C.faint, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.note || "—"}</div>
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
    </div>
  );
}

// ---------------- 库存统计 (空骨架, 待 KK 提供维度与数据源) ----------------
function InventoryStats() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>库存统计</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            各店铺 / 类目 / ASIN 维度的库存数据 · 全员可见 · 待 KK 提供维度与数据源
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span style={{ fontSize: 12, color: C.ink, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: C.panel, border: `1px solid ${C.line}` }}>尚未接入</span>
        </div>
      </div>
      <div style={{ background: C.panel, border: `1px dashed ${C.line}`, borderRadius: 12, padding: 60, textAlign: "center", color: C.faint, fontSize: 13 }}>
        库存统计模块 · 待 KK 确认维度 (店铺/类目/ASIN) 与数据源 (SP-API 库存/采购记录)
      </div>
    </div>
  );
}

// ---------------- 链接评分 (空骨架, 待 KK 提供评分维度和数据源) ----------------
function LinkScore() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>链接评分</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>
            在售 ASIN 健康度评分 · 全员可见 · 待 KK 提供评分维度和数据源
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span style={{ fontSize: 12, color: C.ink, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: C.panel, border: `1px solid ${C.line}` }}>尚未接入</span>
        </div>
      </div>
      <div style={{ background: C.panel, border: `1px dashed ${C.line}`, borderRadius: 12, padding: 60, textAlign: "center", color: C.faint, fontSize: 13 }}>
        链接评分模块 · 待 KK 确认评分维度 (订单/BSR/评价/库存等) 与数据源
      </div>
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
  const isAdmin = finRole === "admin";

  // ---- ① 订单量与营业额 ----
  const [rows, setRows] = useState([]);
  const [fDate1, setFDate1] = useState("");       // 起
  const [fDate2, setFDate2] = useState("");       // 止
  const [fStore, setFStore] = useState("");       // 店铺
  const [fSite, setFSite] = useState("");         // 站点
  const [fAsin, setFAsin] = useState("");         // ASIN
  const [storeOpts, setStoreOpts] = useState([]);
  const [siteOpts, setSiteOpts] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const loadSales = async () => {
    let q = supabase.from("finance_daily_sales").select("*");
    if (fDate1) q = q.gte("sale_date", fDate1);
    if (fDate2) q = q.lte("sale_date", fDate2);
    if (fStore) q = q.eq("store", fStore);
    if (fSite) q = q.eq("site", fSite);
    if (fAsin.trim()) q = q.ilike("asin", `%${fAsin.trim().toUpperCase()}%`);
    const { data, error } = await q.order("sale_date", { ascending: false }).limit(2000);
    if (error) { alert("读取失败(请先建表 finance_daily_sales): " + error.message); return; }
    setRows(data || []);
    // 首次加载时填充筛选下拉
    if (!loaded) {
      const { data: all } = await supabase.from("finance_daily_sales").select("store, site");
      const st = [...new Set((all || []).map(r => r.store).filter(Boolean))].sort();
      const si = [...new Set((all || []).map(r => r.site).filter(Boolean))].sort();
      setStoreOpts(st); setSiteOpts(si); setLoaded(true);
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
  const [cfStoreOpts, setCfStoreOpts] = useState([]);
  const [cfChannelOpts, setCfChannelOpts] = useState([]);
  const [cfLoaded, setCfLoaded] = useState(false);

  const loadCashflow = async () => {
    let q = supabase.from("finance_cashflow").select("*");
    if (cfD1) q = q.gte("tx_date", cfD1);
    if (cfD2) q = q.lte("tx_date", cfD2);
    if (cfStore) q = q.eq("store", cfStore);
    if (cfChannel) q = q.eq("channel", cfChannel);
    const { data, error } = await q.order("tx_date", { ascending: false }).limit(3000);
    if (error) { alert("读取失败(请先建表 finance_cashflow): " + error.message); return; }
    setCfRows(data || []);
    if (!cfLoaded) {
      const { data: all } = await supabase.from("finance_cashflow").select("store, channel");
      const st = [...new Set((all || []).map(r => r.store).filter(Boolean))].sort();
      const ch = [...new Set((all || []).map(r => r.channel).filter(Boolean))].sort();
      setCfStoreOpts(st); setCfChannelOpts(ch); setCfLoaded(true);
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

      {/* ②③⑤ 待建模块占位 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {[
          { t: "② 库存视角", d: "周转效率 / 库存天数 / 备货周期 / 滞销预警", ds: "products.st × FBA 库存 × 销售速率（需 SP-API）" },
          { t: "③ 利润体系", d: "单品利润 / 末端类目毛利 / 平台费 / 税费 / 净利", ds: "采购成本（finance_unit_cost）+ 售价（SP-API）+ 平台费 / 广告 / VAT" },
          { t: "⑤ 资本占用 & 资金成本", d: "在途库存金额 / 资金占用 / 未来 90 天资金需求预测", ds: "库存金额 + 采购订单 + 30/60/90 天滚动预测" },
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
  const brands = Object.keys(BRAND_SHELF);
  // 改状态权限: 按拖拽权限框住 (KK: 货架改状态与进度拖拽同权限)
  //   sFull (admin/fr) 全改; 角色只能改自己负责阶段的 leaf/product 状态
  const [shelfEmail, setShelfEmail] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data && data.user) setShelfEmail(data.user.email || ""); });
  }, []);
  const sRole = getUserRole(shelfEmail);
  const sFull = sRole === "admin" || sRole === "fr";
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
      st: "idle",
    }).select().single();
    if (error) { alert("添加失败: " + error.message); return; }
    // 仅 phase=planning 的 leaf 才同步进 h1 框 (立项期间)
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

  return (
    <div>
      <SectionTitle t="品牌货架" sub="品牌 → 大类 → 类目，逐层点开。在售 / 还没动 / 不做 / 已调研不做" />

      {/* 图例 */}
      <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
        {Object.entries(SHELF_ST).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.sub }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: v.color, display: "inline-block" }} />{v.label}
          </div>
        ))}
      </div>

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
                        {stDot(c.st, (e) => { e.stopPropagation(); setEdit({ type: "cat", table: "shelf_cats", id: c.id, st: c.st, label: c.name }); })}
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
                        <div onClick={() => setOpenG(s => ({ ...s, [gkey]: !s[gkey] }))}
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
                              {g.cats.map((c, ci) => {
                                if (c.st === "skip" || c.st === "researched_skip") {
                                  return (
                                    <div key={ci} style={{ display: "flex", alignItems: "center", padding: "10px 16px 10px 58px", borderTop: `1px solid ${C.line}` }}>
                                      <span style={{ fontSize: 13, color: C.faint }}>{c.name} - 不做</span>
                                    </div>
                                  );
                                }
                                const ckey = `${gkey}|${ci}`;
                                const cOpen = !!openC[ckey];
                                const detail = catDetail(c.name, g.name);
                                return (
                                  <div key={ci} style={{ borderTop: `1px solid ${C.line}` }}>
                                    <div onClick={() => setOpenC(st => ({ ...st, [ckey]: !st[ckey] }))}
                                      style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 16px 10px 58px", cursor: "pointer" }}>
                                      <Caret open={cOpen} small />
                                      {stDot(c.st, (e) => { e.stopPropagation(); setEdit({ type: "cat", table: "shelf_cats", id: c.id, st: c.st, label: c.name }); })}
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
                                        {detail && detail.leaves ? (
                                          <React.Fragment>
                                          {detail.leaves.filter(lf => {
                                            const f = filterC[ckey];
                                            if (!f) return true;
                                            if (f === "selling") return lf.products.some(p => p.st === "selling");
                                            if (f === "researched_skip") return lf.st === "researched_skip";
                                            return (lf.st === "idle" && (!lf.products || !lf.products.length)) || lf.products.some(p => p.st === "idle");
                                          }).map((lf, li) => {
                                            const f = filterC[ckey];
                                            const shownProducts = f === "selling" ? lf.products.filter(p => p.st === "selling")
                                              : f === "idle" ? lf.products.filter(p => p.st === "idle") : lf.products;
                                            const lkey = `${ckey}|${li}`;
                                            const lOpen = !!openL[lkey];
                                            return (
                                              <div key={li} style={{ borderTop: li ? `1px solid ${C.line}` : "none" }}>
                                                {/* 末端类目行 */}
                                                <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 16px 10px 82px" }}>
                                                  <span onClick={() => setOpenL(st => ({ ...st, [lkey]: !st[lkey] }))} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 9 }}>
                                                    <Caret open={lOpen} small />
                                                    {stDot(lf.st === "idle" && lf.phase ? lf.phase : lf.st,
                                                      (e) => { e.stopPropagation(); setEdit({ type: "leaf", table: "shelf_leaves", id: lf.id, st: lf.st, phase: lf.phase, label: lf.leaf }); }, undefined, canEditSt(lf.id))}
                                                  </span>
                                                  <span onClick={() => setProjectFor({ name: lf.leaf, path: lf.path, chatName: lf.chatName })} style={{ fontSize: 13, color: C.ink, fontWeight: 600, cursor: "pointer", textDecoration: "underline dotted", textDecorationColor: C.faint, textUnderlineOffset: 3 }}>
                                                    {lf.leaf}
                                                  </span>
                                                  {(() => {
                                                    const hbox = handoffMap[lf.id];
                                                    if (hbox && HANDOFF_STEP_LABEL[hbox]) {
                                                      const hc = HANDOFF_BOXES.find(b => b.id === hbox);
                                                      return (
                                                        <span style={{ fontSize: 11, color: hc ? hc.color : C.brand, fontWeight: 600 }}>
                                                          · {HANDOFF_STEP_LABEL[hbox]}
                                                        </span>
                                                      );
                                                    }
                                                    return null;
                                                  })()}
                                                  {lf.st === "idle" && (!lf.products || !lf.products.length) && !handoffMap[lf.id] && (
                                                    <select
                                                      value={lf.phase || ""}
                                                      onChange={(e) => {
                                                        e.stopPropagation();
                                                        const v = e.target.value;
                                                        if (v) savePhaseFor(lf.id, v); else clearPhaseFor(lf.id);
                                                      }}
                                                      onClick={(e) => e.stopPropagation()}
                                                      style={{ fontSize: 11, padding: "2px 6px", background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 4, color: C.ink, cursor: "pointer", outline: "none" }}>
                                                      <option value="">未细分</option>
                                                      {Object.entries(LEAF_PHASE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                                    </select>
                                                  )}
                                                  {lf.st === "researched_skip" && (
                                                    <span style={{ fontSize: 11, color: C.faint }}>· 已调研不做</span>
                                                  )}
                                                  <span style={{ marginLeft: "auto", fontSize: 11, color: C.brand, cursor: "pointer" }}
                                                    onClick={() => {
                                                      if (lf.chatUrl) { window.open(lf.chatUrl, "_blank", "noopener,noreferrer"); return; }
                                                      setProjectFor({ name: lf.leaf, path: lf.path, chatName: lf.chatName });
                                                    }}>
                                                    进入分析 →
                                                  </span>
                                                </div>
                                                <div style={{ fontSize: 11, color: C.faint, padding: "0 16px 8px 116px" }}>{lf.path}</div>
                                                {/* 末端点开后显示 产品 / 供应商 */}
                                                {lOpen && (
                                                  <div style={{ padding: "4px 16px 14px 116px", background: C.panel }}>
                                                    <Branch title="产品">
                                                      {shownProducts.length ? shownProducts.map((p, pi) => (
                                                        <div key={pi} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "5px 0", color: C.ink }}>
                                                          <span onClick={canEditSt(lf.id) ? (e) => { e.stopPropagation(); setEdit({ type: "product", table: "products", id: p.id, st: p.st, label: p.name, leafId: lf.id }); } : undefined}
                                                            style={{ width: 6, height: 6, borderRadius: 2, background: SHELF_ST[p.st] ? SHELF_ST[p.st].color : C.faint, display: "inline-block", cursor: canEditSt(lf.id) ? "pointer" : "default", opacity: canEditSt(lf.id) ? 1 : 0.45 }}
                                                            title={canEditSt(lf.id) ? "点击修改状态" : "仅管理员/法国或本阶段负责人可修改"} />{p.name}
                                                          <span style={{ color: C.faint, fontSize: 11 }}>· {SHELF_ST[p.st].label}</span>
                                                          {p.asin && (
                                                            <a href={`https://amazon.fr/dp/${p.asin}`} target="_blank" rel="noreferrer"
                                                              onClick={(e) => e.stopPropagation()}
                                                              style={{ color: C.brand, fontSize: 11, textDecoration: "none" }}>
                                                              · {p.asin}
                                                            </a>
                                                          )}
                                                        </div>
                                                      )) : <Empty t="暂无产品" />}
                                                      <div onClick={(e) => { e.stopPropagation(); setAddProd({ leafId: lf.id }); }}
                                                        style={{ fontSize: 11, color: C.brand, cursor: "pointer", padding: "5px 0", marginTop: 2 }}>
                                                        + 新增产品
                                                      </div>
                                                    </Branch>
                                                    <Branch title="供应商">
                                                      {lf.suppliers.length ? lf.suppliers.map((sp, si) => (
                                                        <div key={si} style={{ fontSize: 12, padding: "5px 0", lineHeight: 1.6 }}>
                                                          <span style={{ color: C.ink, fontWeight: 600 }}>{sp.factory}</span>
                                                          <span style={{ color: C.sub }}> · {sp.contact}</span>
                                                          <div style={{ color: C.faint, fontSize: 11 }}>主要产品：{sp.products}</div>
                                                        </div>
                                                      )) : <Empty t="暂无供应商" />}
                                                      <div onClick={(e) => { e.stopPropagation(); setAddSup({ leafId: lf.id }); }}
                                                        style={{ fontSize: 11, color: C.brand, cursor: "pointer", padding: "5px 0", marginTop: 2 }}>
                                                        + 新增供应商
                                                      </div>
                                                    </Branch>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        <div onClick={(e) => { e.stopPropagation(); setAddLeaf({ catId: c.id, catName: c.name }); }}
                                          style={{ fontSize: 11, color: C.brand, cursor: "pointer", padding: "8px 16px 10px 82px" }}>
                                          + 新增末端类目
                                        </div>
                                          </React.Fragment>
                                        ) : (
                                          <div style={{ padding: "10px 16px 14px 82px" }}>
                                            <Branch title="产品">
                                              {detail && detail.products.length ? detail.products.map((p, pi) => (
                                                <div key={pi} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "5px 0", color: C.ink }}>
                                                  <span onClick={(e) => { e.stopPropagation(); setEdit({ type: "product", table: "products", id: p.id, st: p.st, label: p.name }); }}
                                                    style={{ width: 6, height: 6, borderRadius: 2, background: SHELF_ST[p.st] ? SHELF_ST[p.st].color : C.faint, display: "inline-block", cursor: "pointer" }}
                                                    title="点击修改状态" />{p.name}
                                                  <span style={{ color: C.faint, fontSize: 11 }}>· {SHELF_ST[p.st].label}</span>
                                                </div>
                                              )) : <Empty t="暂无产品" />}
                                            </Branch>
                                            <Branch title="供应商">
                                              {detail && detail.suppliers.length ? detail.suppliers.map((sp, si) => (
                                                <div key={si} style={{ fontSize: 12, padding: "5px 0", lineHeight: 1.6 }}>
                                                  <span style={{ color: C.ink, fontWeight: 600 }}>{sp.factory}</span>
                                                  <span style={{ color: C.sub }}> · {sp.contact}</span>
                                                  <div style={{ color: C.faint, fontSize: 11 }}>主要产品：{sp.products}</div>
                                                </div>
                                              )) : <Empty t="暂无供应商" />}
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
              {Object.entries(SHELF_ST).map(([k, v]) => (
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

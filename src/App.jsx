import React, { useState, useMemo, useEffect } from "react";
import { supabase } from "./lib/supabase";

// =============================================================
// 选品全链路看板 · DEMO (假数据) —— 三视图: 总览 / 产品跨站 / SKU跟踪
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
  const buildLeaves = (catId) => (leavesByCat[catId] || []).map(l => ({ id: l.id, leaf: l.leaf_name, path: l.path, st: l.st || "idle", chatName: l.chat_name || null, products: buildProducts(l.id), suppliers: buildSuppliers(l.id) }));

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
}
const SHELF_ST = {
  selling:         { label: "在售", color: "#4db6a4" },
  idle:            { label: "还没动", color: "#5b6670" },
  skip:            { label: "不做", color: "#7a5b52" },
  researched_skip: { label: "已调研不做", color: "#7a5b52" },
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
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>选品全链路看板</div>
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
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: ".01em" }}>选品全链路看板</div>
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
        {[["overview", "总览看板"], ["shelf", "品牌货架"], ["cross", "产品跨站"], ["track", "SKU 跟踪"]].map(([k, l]) => (
          <div key={k} className="tab" onClick={() => setTab(k)}
            style={{ background: tab === k ? C.panel : "transparent", border: tab === k ? `1px solid ${C.line}` : "1px solid transparent", color: tab === k ? C.ink : C.sub }}>
            {l}
          </div>
        ))}
      </div>

      <div style={{ padding: "20px 24px 60px" }}>
        {tab === "overview" && <Overview onPick={(p) => { setSel(p); setTab("cross"); }} />}
        {tab === "shelf" && <Shelf />}
        {tab === "cross" && <CrossSite sel={sel} setSel={setSel} />}
        {tab === "track" && <Track selSku={selSku} setSelSku={setSelSku} />}
      </div>
    </div>
  );
}

// ---------------- 总览: 站点 × 漏斗状态 矩阵 ----------------
function Overview({ onPick }) {
  const matrix = useMemo(() => {
    const m = {};
    SITES.forEach(s => { m[s] = {}; FUNNEL.forEach(f => m[s][f.key] = []); });
    PRODUCTS.forEach(p => SITES.forEach(s => {
      const e = p.eval[s]; if (e) m[s][e.status].push(p);
    }));
    return m;
  }, []);

  return (
    <div>
      <SectionTitle t="漏斗总览" sub="每格 = 该站点处于该状态的类目数量，点击类目跳转跨站对比" />
      <div style={{ display: "grid", gridTemplateColumns: `72px repeat(${FUNNEL.length},1fr)`, gap: 1, background: C.line, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ background: C.panel }} />
        {FUNNEL.map(f => (
          <div key={f.key} style={{ background: C.panel, padding: "10px 12px", fontSize: 12, color: C.sub, fontWeight: 600 }}>{f.label}</div>
        ))}
        {SITES.map(s => (
          <React.Fragment key={s}>
            <div style={{ background: C.panel, padding: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: C[s.toLowerCase()] }}>{s}</div>
            {FUNNEL.map(f => (
              <div key={f.key} className="cell" style={{ background: C.panel, padding: "10px 12px", minHeight: 78 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: matrix[s][f.key].length ? C.ink : C.faint }}>{matrix[s][f.key].length}</div>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {matrix[s][f.key].map(p => (
                    <div key={p.id} onClick={() => onPick(p)} style={{ fontSize: 11, color: C.sub, cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 2 }}>{p.name}</div>
                  ))}
                </div>
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>

      <div style={{ marginTop: 28 }}>
        <SectionTitle t="全部产品" sub="按产品看它在各站点的评估结论" />
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr .7fr repeat(3,.8fr)", background: C.panel, fontSize: 11, color: C.sub, fontWeight: 600 }}>
            {["产品", "品牌", "FR", "DE", "UK"].map((h, i) => <div key={i} style={{ padding: "10px 14px" }}>{h}</div>)}
          </div>
          {PRODUCTS.map(p => (
            <div key={p.id} className="prow" onClick={() => onPick(p)} style={{ display: "grid", gridTemplateColumns: "1.6fr .7fr repeat(3,.8fr)", borderTop: `1px solid ${C.line}`, fontSize: 12, background: C.panel }}>
              <div style={{ padding: "12px 14px" }}>{p.name}<div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{p.code}</div></div>
              <div style={{ padding: "12px 14px", color: C.sub }}>{p.brand}</div>
              {SITES.map(s => {
                const e = p.eval[s];
                return <div key={s} style={{ padding: "12px 14px" }}>
                  {e ? <Pill color={conclColor(e.concl)} text={e.concl ? conclText(e.concl) : statusText(e.status)} /> : <span style={{ color: C.faint }}>—</span>}
                </div>;
              })}
            </div>
          ))}
        </div>
      </div>
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
  const liveSkus = PRODUCTS.flatMap(p => p.skus.filter(s => s.exec === "live").map(s => ({ ...s, pname: p.name })));
  const data = TRACKING[selSku] || [];
  const cur = liveSkus.find(s => s.id === selSku);

  const maxBsr = Math.max(...data.map(d => d.bsr), 1);
  const minBsr = Math.min(...data.map(d => d.bsr), 0);
  const W = 640, H = 200, pad = 30;
  const x = (i) => pad + (i * (W - 2 * pad)) / (data.length - 1);
  const y = (v) => pad + ((v - minBsr) / (maxBsr - minBsr || 1)) * (H - 2 * pad); // BSR 越小越好, 高位=差

  return (
    <div>
      <SectionTitle t="SKU 跟踪" sub="已上架 SKU 的 BSR / 评分 / 评论趋势（BSR 越低越好）" />
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {liveSkus.map(s => (
          <div key={s.id} onClick={() => setSelSku(s.id)} style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", border: `1px solid ${s.id === selSku ? C.brand : C.line}`, background: s.id === selSku ? C.panel2 : "transparent", color: s.id === selSku ? C.ink : C.sub }}>{s.code} <span style={{ color: C.faint }}>· {s.site}</span></div>
        ))}
      </div>

      {cur && (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{cur.code}</div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>{cur.pname} · {cur.site} · ASIN {cur.asin}</div>
            </div>
            <button style={btn(C)} onClick={() => alert("Demo：真库版会触发 BSR 抓取 skill，写入 sku_tracking")}>拉取最新 BSR</button>
          </div>

          {data.length ? (
            <>
              <div style={{ display: "flex", gap: 20, margin: "18px 0" }}>
                <Stat label="最新 BSR" value={`#${data[data.length - 1].bsr}`} accent={C.brand} />
                <Stat label="评分" value={data[data.length - 1].rating} />
                <Stat label="评论数" value={data[data.length - 1].rev} />
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
                <polyline fill="none" stroke={C.brand} strokeWidth="2"
                  points={data.map((d, i) => `${x(i)},${y(d.bsr)}`).join(" ")} />
                {data.map((d, i) => (
                  <g key={i}>
                    <circle cx={x(i)} cy={y(d.bsr)} r="3.5" fill={C.brand} />
                    <text x={x(i)} y={H - 8} fontSize="10" fill={C.faint} textAnchor="middle">{d.d}</text>
                  </g>
                ))}
              </svg>
            </>
          ) : <div style={{ fontSize: 12, color: C.faint, marginTop: 16 }}>暂无跟踪数据</div>}
        </div>
      )}
    </div>
  );
}

// ---------------- 品牌货架 (三层展开: 品牌 → 大类 → 类目) ----------------
function Shelf() {
  const brands = Object.keys(BRAND_SHELF);
  const [openB, setOpenB] = useState({});      // 展开的品牌
  const [openG, setOpenG] = useState({});      // 展开的大类, key = brand|groupIdx
  const [openC, setOpenC] = useState({});      // 展开的类目, key = brand|groupIdx|catIdx
  const [filterC, setFilterC] = useState({});  // 每个类目的筛选: undefined|'selling'|'idle'
  const [openL, setOpenL] = useState({});      // 展开的末端类目, key = ckey|leafIdx
  const [projectFor, setProjectFor] = useState(null); // 跳转 Project 弹窗

  const countCats = (groups) => {
    const n = { total: 0, selling: 0, idle: 0, skip: 0, researched_skip: 0 };
    groups.forEach(g => g.cats.forEach(c => { n.total++; if (n[c.st] !== undefined) n[c.st]++; }));
    return n;
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
                <span style={{ marginLeft: "auto", fontSize: 12, color: C.sub }}>
                  {info.flat ? `${n.total} 类目` : `${info.groups.length} 大类 · ${n.total} 二级类目`}
                </span>
              </div>

              {/* 大类层 (flat 品牌: 类目竖向单列排列, 每行一项) */}
              {isOpen && info.flat && (
                <div style={{ borderTop: `1px solid ${C.line}` }}>
                  {info.groups[0].cats.map((c, ci) => {
                    const s = SHELF_ST[c.st];
                    return (
                      <div key={ci} style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 16px 11px 34px", borderTop: ci ? `1px solid ${C.line}` : "none" }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
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
                          <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>{g.cats.length} 项</span>
                        </div>
                        {/* 类目层 (竖向单列, 可点开看 产品/供应商) */}
                        {gOpen && (
                          g.cats.length ? (
                            <div>
                              {g.cats.map((c, ci) => {
                                const s = SHELF_ST[c.st];
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
                                      <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
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
                                          detail.leaves.filter(lf => {
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
                                            const leafDot = lf.products.some(p => p.st === "selling") ? SHELF_ST.selling.color : (lf.st === "idle" || !lf.products.length ? C.sub : SHELF_ST.selling.color);
                                            return (
                                              <div key={li} style={{ borderTop: li ? `1px solid ${C.line}` : "none" }}>
                                                {/* 末端类目行 */}
                                                <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 16px 10px 82px" }}>
                                                  <span onClick={() => setOpenL(st => ({ ...st, [lkey]: !st[lkey] }))} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 9 }}>
                                                    <Caret open={lOpen} small />
                                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: leafDot }} />
                                                  </span>
                                                  <span onClick={() => setProjectFor({ name: lf.leaf, path: lf.path, chatName: lf.chatName })} style={{ fontSize: 13, color: C.ink, fontWeight: 600, cursor: "pointer", textDecoration: "underline dotted", textDecorationColor: C.faint, textUnderlineOffset: 3 }}>
                                                    {lf.leaf}
                                                  </span>
                                                  {lf.st === "idle" && (!lf.products || !lf.products.length) && (
                                                    <span style={{ fontSize: 11, color: C.faint }}>· 在调研</span>
                                                  )}
                                                  {lf.st === "researched_skip" && (
                                                    <span style={{ fontSize: 11, color: C.faint }}>· 已调研不做</span>
                                                  )}
                                                  <span style={{ marginLeft: "auto", fontSize: 11, color: C.brand, cursor: "pointer" }}
                                                    onClick={() => setProjectFor({ name: lf.leaf, path: lf.path, chatName: lf.chatName })}>
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
                                                          <span style={{ width: 6, height: 6, borderRadius: 2, background: SHELF_ST[p.st].color }} />{p.name}
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
                                                    </Branch>
                                                    <Branch title="供应商">
                                                      {lf.suppliers.length ? lf.suppliers.map((sp, si) => (
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
                                            );
                                          })
                                        ) : (
                                          <div style={{ padding: "10px 16px 14px 82px" }}>
                                            <Branch title="产品">
                                              {detail && detail.products.length ? detail.products.map((p, pi) => (
                                                <div key={pi} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "5px 0", color: C.ink }}>
                                                  <span style={{ width: 6, height: 6, borderRadius: 2, background: SHELF_ST[p.st].color }} />{p.name}
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

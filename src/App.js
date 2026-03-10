import React, { useState, useRef, useEffect } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend } from "chart.js";
import { Bar, Line, Pie } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend);

const ACCENT    = "#FF7F00";
const ACCENT_DIM = "#e06e00";
const BG       = "#1a1a1a";
const SURFACE  = "#242424";
const SURFACE2 = "#2e2e2e";
const BORDER   = "#3a3a3a";
const TEXT     = "#f0f0f0";
const MUTED    = "#aaaaaa";
const COLORS = [
  "#4C9BE8","#A78BFA","#34D399","#F87171","#FBBF24",
  "#60A5FA","#F472B6","#2DD4BF","#FB923C","#818CF8"
];

// ── Anthropic API ─────────────────────────────────────────────────────────────
const callClaude = async (messages, system, maxTokens = 1000) => {
  const res = await fetch("https://technochat-server-production.up.railway.app/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, system, messages }),
  });
  const data = await res.json();
  return data.content.map(b => b.text || "").join("");
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const parseData = (data) => data.map(row => {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) { out[k] = null; continue; }
    if (typeof v === "number") { out[k] = v; continue; }
    const s = String(v).trim();
    if (s === "" || /^\d{4}-\d{2}/.test(s) || s.length > 20) { out[k] = v; continue; }
    const n = Number(s.replace(/,/g, ""));
    out[k] = !isNaN(n) ? n : v;
  }
  return out;
});

const isAmountCol = (col) => /amount|revenue|price|total|sales|value/i.test(col);
const isQtyCol    = (col) => /qty|quantity|count|orders|units/i.test(col);

const formatLabel = (val) => {
  if (!val || typeof val !== "string") return String(val ?? "");
  const m = val.match(/^(\d{4})-(\d{2})/);
  if (m) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(m[2])-1]} ${m[1]}`;
  }
  return val;
};

const makeTooltip = (yCol) => ({
  backgroundColor: SURFACE2,
  borderColor: BORDER,
  borderWidth: 1,
  titleColor: TEXT,
  bodyColor: MUTED,
  padding: 10,
  callbacks: {
    title: (items) => items[0]?.label || "",
    label: (ctx) => {
      const v = ctx.parsed.y ?? ctx.parsed;
      if (typeof v !== "number") return ` ${v}`;
      if (isAmountCol(yCol)) return ` Rs.${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
      if (isQtyCol(yCol))    return ` ${v.toLocaleString("en-IN")} units`;
      return ` ${v.toLocaleString("en-IN")}`;
    }
  }
});

const chartDefaults = (yCol) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { display: false },
    tooltip: makeTooltip(yCol),
  },
  scales: {
    x: { ticks: { color: MUTED, font: { size: 11 } }, grid: { color: BORDER } },
    y: { ticks: { color: MUTED, font: { size: 11 }, callback: v => isAmountCol(yCol) ? `Rs.${v.toLocaleString("en-IN")}` : v.toLocaleString("en-IN") }, grid: { color: BORDER } }
  }
});

// ── Key Metrics Cards ────────────────────────────────────────────────────────
const KeyMetrics = ({ data, title }) => {
  if (!data?.length) return null;
  const row = data[0];
  const entries = Object.entries(row).filter(([,v]) => v !== null && v !== undefined);
  return (
    <div>
      <p style={{ color:"#888", fontSize:11, letterSpacing:1.2, textTransform:"uppercase", marginBottom:12 }}>{title}</p>
      <div style={{ display:"flex", flexWrap:"wrap", gap:12 }}>
        {entries.map(([k, v], i) => {
          const isAmt = isAmountCol(k);
          const isQty = isQtyCol(k);
          const num   = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g,""));
          const formatted = !isNaN(num)
            ? isAmt ? `Rs.${num.toLocaleString("en-IN", { maximumFractionDigits:2 })}` : num.toLocaleString("en-IN")
            : String(v);
          const label = isQty ? `${formatted} units` : formatted;
          return (
            <div key={k} style={{
              background: SURFACE2, border: `1px solid ${BORDER}`,
              borderTop: `3px solid ${COLORS[i % COLORS.length]}`,
              borderRadius: 10, padding: "14px 18px", minWidth: 150, flex: "1 1 140px"
            }}>
              <p style={{ color: MUTED, fontSize: 11, margin:"0 0 6px", textTransform:"uppercase", letterSpacing:0.8 }}>
                {k.replace(/_/g," ")}
              </p>
              <p style={{ color: TEXT, fontSize: 22, fontWeight: 700, margin: 0, fontFamily:"monospace" }}>
                {label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Chart Renderer ────────────────────────────────────────────────────────────
const ChartRenderer = ({ config, data }) => {
  if (!config || !data?.length) return null;
  const { chart_type, x_axis, y_axis, title } = config;
  const labels  = data.map(r => formatLabel(String(r[x_axis] ?? "")));
  const values  = data.map(r => Number(r[y_axis]) || 0);
  const bgColors = data.map((_, i) => COLORS[i % COLORS.length]);

  if (chart_type === "bar") {
    const horiz = data.length > 6;
    const sorted = horiz
      ? [...data].sort((a,b) => (Number(a[y_axis])||0) - (Number(b[y_axis])||0))
      : [...data].sort((a,b) => (Number(b[y_axis])||0) - (Number(a[y_axis])||0));
    const sLabels = sorted.map(r => formatLabel(String(r[x_axis] ?? "")));
    const sValues = sorted.map(r => Number(r[y_axis]) || 0);
    const base = chartDefaults(y_axis);
    const horizTooltip = {
      ...base.plugins.tooltip,
      callbacks: {
        title: (items) => items[0]?.label || "",
        label: (ctx) => {
          const v = ctx.parsed.x ?? ctx.parsed.y;
          if (typeof v !== "number") return ` ${v}`;
          if (isAmountCol(y_axis)) return ` Rs.${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
          if (isQtyCol(y_axis))    return ` ${v.toLocaleString("en-IN")} units`;
          return ` ${v.toLocaleString("en-IN")}`;
        }
      }
    };
    const opts = {
      ...base,
      indexAxis: horiz ? "y" : "x",
      plugins: { ...base.plugins, tooltip: horiz ? horizTooltip : base.plugins.tooltip },
      scales: horiz ? {
        x: { ticks: { color: MUTED, font:{size:11}, callback: v => isAmountCol(y_axis) ? `Rs.${v.toLocaleString("en-IN")}` : v.toLocaleString("en-IN") }, grid: { color: BORDER } },
        y: { ticks: { color: MUTED, font:{size:11} }, grid: { color: "#111" } }
      } : base.scales
    };
    return (
      <div>
        <p style={{ color:"#ccc", fontSize:12, marginBottom:8 }}>{title}</p>
        <div style={{ height: horiz ? Math.max(280, sorted.length * 36) : 300 }}>
          <Bar data={{ labels: sLabels, datasets:[{ data: sValues, backgroundColor: bgColors, borderRadius: 4 }] }} options={opts} />
        </div>
      </div>
    );
  }

  if (chart_type === "line") {
    const opts = chartDefaults(y_axis);
    return (
      <div>
        <p style={{ color:"#ccc", fontSize:12, marginBottom:8 }}>{title}</p>
        <div style={{ height: 300 }}>
          <Line data={{ labels, datasets:[{ data: values, borderColor: "#4C9BE8", backgroundColor: "#4C9BE833", pointBackgroundColor: "#4C9BE8", pointRadius: 4, tension: 0.3, fill: true }] }} options={opts} />
        </div>
      </div>
    );
  }

  if (chart_type === "pie") {
    const opts = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: true, position: "right", labels: { color: MUTED, font: { size: 11 } } },
        tooltip: { backgroundColor: SURFACE2, borderColor: BORDER, borderWidth: 1, titleColor: TEXT, bodyColor: MUTED,
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString("en-IN")} (${ctx.dataset.data.reduce((a,b)=>a+b,0) > 0 ? ((ctx.parsed / ctx.dataset.data.reduce((a,b)=>a+b,0))*100).toFixed(1) : 0}%)` }
        }
      }
    };
    return (
      <div>
        <p style={{ color:"#ccc", fontSize:12, marginBottom:8 }}>{title}</p>
        <div style={{ height: 300 }}>
          <Pie data={{ labels, datasets:[{ data: values, backgroundColor: bgColors, borderWidth: 0 }] }} options={opts} />
        </div>
      </div>
    );
  }

  if (chart_type === "number") {
    const num = values[0] || 0;
    return (
      <div style={{ textAlign:"center", padding:"32px 0" }}>
        <p style={{ color:"#888", fontSize:12, marginBottom:8 }}>{title}</p>
        <p style={{ fontSize:52, fontWeight:800, color:ACCENT, fontFamily:"monospace", margin:0 }}>
          {num.toLocaleString("en-IN")}
        </p>
      </div>
    );
  }

  return null;
};

// ── Download CSV ─────────────────────────────────────────────────────────────
const downloadCSV = (data, filename = "export.csv") => {
  if (!data?.length) return;
  const cols = Object.keys(data[0]);
  const escape = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };
  const header = cols.join(",");
  const rows   = data.map(row => cols.map(c => escape(row[c])).join(","));
  const csv    = [header, ...rows].join("\n");
  const blob   = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// ── Data Table ────────────────────────────────────────────────────────────────
const DataTable = ({ data, filename }) => {
  if (!data?.length) return null;
  const cols   = Object.keys(data[0]);
  const parsed = parseData(data);
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:6 }}>
        <button
          onClick={() => downloadCSV(parsed, filename || "data.csv")}
          style={{ background:"none", border:`1px solid ${BORDER}`, borderRadius:6,
            color:MUTED, fontSize:11, padding:"3px 10px", cursor:"pointer",
            display:"flex", alignItems:"center", gap:5, transition:"all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor=ACCENT; e.currentTarget.style.color=ACCENT; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor=BORDER; e.currentTarget.style.color=MUTED; }}>
          ↓ Download CSV
        </button>
      </div>
      <div style={{ overflowX:"auto", maxHeight:260, overflowY:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c} style={{ padding:"7px 12px", textAlign:"left", color:ACCENT,
                  borderBottom:`1px solid ${BORDER}`, whiteSpace:"nowrap",
                  position:"sticky", top:0, background:SURFACE }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.map((row, i) => (
              <tr key={i} style={{ borderBottom:`1px solid #141414` }}>
                {cols.map(c => (
                  <td key={c} style={{ padding:"6px 12px", color:"#ccc", whiteSpace:"nowrap" }}>
                    {row[c] === null || row[c] === undefined ? "—"
                      : typeof row[c] === "number" && isAmountCol(c)
                        ? `Rs.${row[c].toLocaleString("en-IN", { maximumFractionDigits:2 })}`
                      : typeof row[c] === "number" && isQtyCol(c)
                        ? row[c].toLocaleString("en-IN")
                      : typeof row[c] === "number"
                        ? row[c].toLocaleString("en-IN", { maximumFractionDigits:2 })
                      : typeof row[c] === "string" && /^\d{4}-\d{2}/.test(row[c])
                        ? formatLabel(row[c])
                      : String(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Suggested questions ───────────────────────────────────────────────────────
const SUGGESTED = [
  "Which distributor has the highest revenue?",
  "Show revenue by product category",
  "Which style sold the most quantity?",
  "Revenue breakdown by province",
  "Which retailer placed the highest orders?",
  "Show revenue by payment mode",
  "Which platform drives more revenue?",
  "Top 5 styles by revenue",
];

const SCHEMA = `
You have access to TWO tables in a PostgreSQL database (Supabase):

1. orders — each row is one line item (order + variant)
   - order_id (int): one order has MULTIPLE rows (one per product/variant)
   - order_date, dispatch_date, delivered_date (timestamp)
   - customer_id (text), retailer_name (text)
   - style (text): alphanumeric code like 'BR45' — NEVER convert to numeric
   - variant_id (text), product_id (text)
   - size (text): e.g. 'XL', '9-10Y'
   - quantity (int)
   - distributor (text)
   - line_item_amount (numeric): USE THIS for revenue
   - total_amount (numeric): DO NOT SUM — same across all rows of same order_id
   - mode (text): payment mode
   - city (text), province (text), ts_pincode (text)
   - platform (text): 'android', 'iphone', 'web'

2. products — one row per variant
   - product_id (text), variant_id (text), style (text)
   - product_title (text), size (text), price (numeric)
   - launch_date (timestamp)
   - category_level_1, category_level_2, category_level_3 (text)

RULES:
REVENUE CALCULATION — CRITICAL, follow exactly:
- DEFAULT revenue: use SUM(DISTINCT total_amount per order) = SUM(total_amount) over unique order_ids
  Correct pattern: SELECT SUM(t.total_amount) FROM (SELECT DISTINCT order_id, total_amount FROM orders ...) t
  This avoids double-counting since total_amount repeats for every line item of the same order
- STYLE-based analysis ONLY: use SUM(line_item_amount) — this correctly splits revenue by style/variant
  Use this when the query groups by style, product_title, variant_id, category, or size
- NEVER do a plain SUM(total_amount) across all rows — always deduplicate by order_id first
- style is alphanumeric — never cast to numeric
- Amounts are in INR (Indian Rupees)
- JOIN orders with products ON orders.product_id = products.product_id when categories needed
- SELECT queries only — never INSERT, UPDATE, DELETE, DROP
- Order by main metric DESC unless asked otherwise
- Limit to 20 rows unless asked for more
- For monthly/cohort analysis: use TO_CHAR(order_date, 'Mon YYYY') AS month for readable labels, order by MIN(order_date) ASC
`;

// ── Logo ──────────────────────────────────────────────────────────────────────
const Logo = () => (
  <div style={{ width:36, height:36, borderRadius:8, overflow:"hidden", flexShrink:0,
    border:`1px solid ${BORDER}`, background:SURFACE2,
    display:"flex", alignItems:"center", justifyContent:"center" }}>
    <img src="/logo.png" alt="TechnoChat"
      style={{ width:"100%", height:"100%", objectFit:"cover" }}
      onError={e => { e.target.style.display="none"; e.target.parentNode.innerHTML='<span style="color:#FF7F00;font-size:18px;font-weight:800">T</span>'; }} />
  </div>
);

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expanded, setExpanded]       = useState({});
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  const toggle = (id, key) => setExpanded(p => ({ ...p, [`${id}_${key}`]: !p[`${id}_${key}`] }));

  const buildHistory = (hist) => hist.flatMap(t => [
    { role:"user", content: t.question },
    { role:"assistant", content:
      `Result (${t.data?.length||0} rows):\n${JSON.stringify(t.data?.slice(0,5)||[])}` +
      (t.insight ? `\nInsight: ${t.insight}` : "")
    }
  ]);

  const resolveQuestion = async (q, hist) => {
    if (!hist.length) return q;
    const msgs = [...buildHistory(hist), { role:"user", content:`Rewrite as self-contained question: ${q}` }];
    return callClaude(msgs, `Resolve follow-up questions into self-contained ones.\n${SCHEMA}\nReturn ONLY the rewritten question.`, 200);
  };

  const generateSQL = async (q, hist) => {
    const msgs = [...buildHistory(hist), { role:"user", content: q }];
    const raw = await callClaude(msgs,
      `You are a PostgreSQL expert. Generate a single SELECT query.\n${SCHEMA}\nReturn ONLY SQL. No explanation. No markdown. No semicolons.`, 800);
    return raw.replace(/```sql\n?/gi,"").replace(/```\n?/g,"").replace(/;$/,"").trim();
  };

  const classifyViz = async (q, data) => {
    const cols = Object.keys(data[0] || {});
    const numericCols = cols.filter(c => data.some(r => typeof r[c] === "number"));
    const textCols    = cols.filter(c => !numericCols.includes(c));

    // ── Hard rules (no AI needed) ──────────────────────────────────────────────
    // Single row → key metrics cards
    if (data.length === 1) {
      return { chart_type: "metrics", title: q };
    }
    // 3+ numeric columns → table gives better picture
    if (numericCols.length >= 3) {
      return { chart_type: "table", title: q };
    }
    // Queries about orders/details/list with id/date columns → table
    const hasIdOrDate = cols.some(c => /order_id|id|date|style|sku|variant/i.test(c));
    if (hasIdOrDate && cols.length >= 3) {
      return { chart_type: "table", title: q };
    }
    // Exactly 2 cols and both text → table
    if (cols.length === 2 && numericCols.length === 0) {
      return { chart_type: "table", title: q };
    }

    // ── AI decides for ambiguous cases ────────────────────────────────────────
    const raw = await callClaude(
      [{ role:"user", content:
        `QUESTION: ${q}
COLUMNS: ${cols.join(", ")}
NUMERIC COLUMNS: ${numericCols.join(", ") || "none"}
SAMPLE: ${JSON.stringify(data.slice(0,3))}
ROWS: ${data.length}

Return ONLY valid JSON (no markdown):
{"chart_type":"bar|line|pie|number|table","x_axis":"col_name","y_axis":"col_name","title":"short title"}

DECISION RULES — pick the FIRST matching rule:
1. table  → 3+ columns with mix of text and multiple numbers (e.g. distributor + revenue + qty + orders)
2. table  → results about specific orders, products, styles with multiple attributes
3. table  → cohort/pivot/cross-tab style data
4. table  → top-N list where user wants to see full detail (name + multiple metrics)
5. line   → x_axis is a month/date/time column
6. pie    → showing share/proportion/% breakdown with 6 or fewer categories
7. bar    → any single category vs single numeric value — this is the DEFAULT
8. number → exactly 1 row and 1 numeric column (a single KPI)

IMPORTANT: Choose table when showing multiple metrics per entity gives more value than a single-metric chart.` }],
      "Data visualization expert. Return only valid JSON.", 300);
    try {
      const parsed = JSON.parse(raw.replace(/```json/gi,"").replace(/```/g,"").trim());
      // Safety: if y_axis col has no numeric data, force table
      if (parsed.chart_type !== "table" && parsed.chart_type !== "metrics" && parsed.y_axis) {
        const hasNum = data.some(r => typeof r[parsed.y_axis] === "number");
        if (!hasNum) parsed.chart_type = "table";
      }
      return parsed;
    } catch {
      return { chart_type:"bar", x_axis:cols[0], y_axis:numericCols[0]||cols[1]||cols[0], title:q };
    }
  };

  const generateInsight = async (q, data, hist) => {
    const msgs = [...buildHistory(hist), { role:"user", content:
      `Question: ${q}\nData:\n${JSON.stringify(data.slice(0,10))}\n\nWrite a 2-3 sentence business insight with specific numbers in Indian Rupees (use Rs. prefix). No bullets. No dollar signs.`
    }];
    return callClaude(msgs, "Senior business analyst. Concise specific insights. Reference previous context if relevant.", 250);
  };

  const executeSQL = async (sql) => {
    const res = await fetch("https://technochat-server-production.up.railway.app/api/query", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ sql }),
    });
    if (!res.ok) throw new Error(`SQL failed: ${await res.text()}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  };

  const handleSend = async (question) => {
    if (!question.trim() || loading) return;
    setInput("");
    setLoading(true);
    const id = Date.now();
    try {
      const resolved   = await resolveQuestion(question, messages);
      const sql        = await generateSQL(resolved, messages);
      const rawData    = await executeSQL(sql);
      const parsedData = parseData(rawData || []);
      const vizConfig  = parsedData.length ? await classifyViz(resolved, parsedData) : null;
      const insight    = parsedData.length ? await generateInsight(resolved, parsedData, messages) : "";
      console.log("[vizConfig]", vizConfig);
      console.log("[sample]", parsedData.slice(0,2));
      setMessages(p => [...p, { id, question, resolved, sql, data:parsedData, vizConfig, insight, error:null }]);
    } catch (err) {
      console.error("[error]", err);
      setMessages(p => [...p, { id, question, resolved:question, sql:"", data:[], vizConfig:null, insight:"", error:err.message }]);
    }
    setLoading(false);
  };

  const S = {
    app:       { display:"flex", height:"100vh", background:BG, fontFamily:"'DM Sans','Helvetica Neue',sans-serif", color:TEXT, overflow:"hidden" },
    sidebar:   { width:sidebarOpen?240:0, minWidth:sidebarOpen?240:0, background:SURFACE, borderRight:`1px solid ${BORDER}`, overflow:"hidden", transition:"all 0.3s ease", display:"flex", flexDirection:"column", flexShrink:0 },
    sidebarInner: { padding:"20px 16px", overflowY:"auto", flex:1 },
    main:      { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
    header:    { padding:"0 20px", height:56, borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:12, background:SURFACE, flexShrink:0 },
    chatArea:  { flex:1, overflowY:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:20 },
    inputArea: { padding:"14px 24px", borderTop:`1px solid ${BORDER}`, background:SURFACE, display:"flex", gap:10, alignItems:"flex-end", flexShrink:0 },
    userBubble:{ alignSelf:"flex-end", background:`${ACCENT}18`, border:`1px solid ${ACCENT}33`, borderRadius:"16px 16px 4px 16px", padding:"10px 14px", maxWidth:"70%", fontSize:14 },
    card:      { background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:12, padding:18 },
    expandBtn: { background:"none", border:`1px solid ${BORDER}`, borderRadius:6, color:"#ccc", fontSize:12, padding:"4px 10px", cursor:"pointer", marginRight:0, marginTop:0, transition:"all 0.15s" },
    sendBtn:   { background:ACCENT, color:"#000", border:"none", borderRadius:10, padding:"11px 18px", fontWeight:700, cursor:"pointer", fontSize:14, flexShrink:0, transition:"background 0.2s" },
    input:     { flex:1, background:SURFACE2, border:`1px solid ${BORDER}`, borderRadius:10, color:TEXT, padding:"11px 14px", fontSize:14, resize:"none", outline:"none", fontFamily:"inherit" },
    chip:      { display:"inline-block", background:SURFACE2, border:`1px solid ${BORDER}`, borderRadius:16, color:"#ccc", fontSize:12, padding:"5px 13px", cursor:"pointer", transition:"all 0.15s", marginRight:7, marginBottom:7 },
    sectionLabel: { color:"#888", fontSize:11, letterSpacing:1.5, textTransform:"uppercase", marginBottom:10, marginTop:0 },
  };

  return (
    <div style={S.app}>

      {/* Sidebar */}
      <div style={S.sidebar}>
        <div style={S.sidebarInner}>
          <p style={S.sectionLabel}>Tables</p>
          {["orders","products"].map(t => (
            <div key={t} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:9,
              padding:"8px 10px", background:SURFACE2, borderRadius:8, border:`1px solid ${BORDER}` }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:ACCENT, flexShrink:0 }} />
              <span style={{ color:"#ddd", fontSize:13 }}>{t}</span>
            </div>
          ))}

          <p style={{ ...S.sectionLabel, marginTop:22 }}>Recent queries</p>
          {messages.length === 0 && <p style={{ color:"#666", fontSize:12 }}>No queries yet</p>}
          {messages.slice().reverse().slice(0,8).map(m => (
            <div key={m.id} onClick={() => handleSend(m.question)}
              style={{ padding:"7px 10px", borderRadius:7, marginBottom:5, cursor:"pointer", border:`1px solid transparent`, transition:"all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background=SURFACE2; e.currentTarget.style.borderColor=BORDER; }}
              onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.borderColor="transparent"; }}>
              <p style={{ color:"#ccc", fontSize:12, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={m.question}>
                ↩ {m.question}
              </p>
            </div>
          ))}

          {messages.length > 0 && (
            <button onClick={() => setMessages([])}
              style={{ marginTop:16, width:"100%", background:"none", border:`1px solid ${BORDER}`,
                borderRadius:7, color:"#ccc", padding:"7px", cursor:"pointer", fontSize:12 }}
              onMouseEnter={e => { e.target.style.borderColor=ACCENT; e.target.style.color=ACCENT; }}
              onMouseLeave={e => { e.target.style.borderColor=BORDER; e.target.style.color="#ccc"; }}>
              Clear conversation
            </button>
          )}
        </div>
      </div>

      {/* Main */}
      <div style={S.main}>
        <div style={S.header}>
          <button onClick={() => setSidebarOpen(o => !o)}
            style={{ background:"none", border:"none", color:"#ccc", cursor:"pointer", fontSize:16, padding:4, lineHeight:1 }}>☰</button>
          <span style={{ fontWeight:800, fontSize:18, letterSpacing:-0.5 }}>
            <span style={{ color:ACCENT }}>Techno</span>
            <span style={{ color:"#ffffff" }}>Chat</span>
          </span>
          <div style={{ flex:1 }} />
          <Logo />
        </div>

        <div style={S.chatArea}>
          {messages.length === 0 && !loading && (
            <div style={{ margin:"auto", maxWidth:560 }}>
              <p style={{ color:"#888", fontSize:11, letterSpacing:1.5, textTransform:"uppercase", marginBottom:14 }}>Suggested</p>
              {SUGGESTED.map((s,i) => (
                <span key={i} style={S.chip} onClick={() => handleSend(s)}
                  onMouseEnter={e => { e.target.style.borderColor=ACCENT; e.target.style.color=ACCENT; }}
                  onMouseLeave={e => { e.target.style.borderColor=BORDER; e.target.style.color="#ccc"; }}>
                  {s}
                </span>
              ))}
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ display:"flex", justifyContent:"flex-end" }}>
                <div style={S.userBubble}>
                  <p style={{ margin:0 }}>{msg.question}</p>
                  {msg.resolved !== msg.question && (
                    <p style={{ margin:"5px 0 0", color:"#888", fontSize:12 }}>🔍 Interpreted as: <em>{msg.resolved}</em></p>
                  )}
                </div>
              </div>

              <div style={S.card}>
                {msg.error ? (
                  <div style={{ color:"#FF6B6B", fontSize:13 }}>❌ {msg.error}</div>
                ) : (
                  <>
                    {msg.data?.length > 0 && (
                      <div style={{ marginBottom:14 }}>
                        {msg.vizConfig?.chart_type === "metrics"
                          ? <KeyMetrics data={msg.data} title={msg.vizConfig.title} />
                          : msg.vizConfig?.chart_type === "table" || !msg.vizConfig
                            ? <DataTable data={msg.data} filename={`${msg.question.slice(0,30).replace(/[^a-z0-9]/gi,"_")}.csv`} />
                            : <ChartRenderer config={msg.vizConfig} data={msg.data} />
                        }
                      </div>
                    )}

                    {msg.insight && (
                      <div style={{ background:SURFACE2, borderLeft:`3px solid ${ACCENT}`,
                        borderRadius:"0 8px 8px 0", padding:"10px 14px", color:"#ccc",
                        fontSize:13, lineHeight:1.6, marginBottom:10 }}>
                        {msg.insight}
                      </div>
                    )}

                    <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:10 }}>
                      {[["table","Data table"],["sql","SQL"]].map(([key,label]) => (
                        <button key={key} style={S.expandBtn}
                          onClick={() => toggle(msg.id, key)}
                          onMouseEnter={e => { e.target.style.borderColor=ACCENT; e.target.style.color=ACCENT; }}
                          onMouseLeave={e => { e.target.style.borderColor=BORDER; e.target.style.color="#ccc"; }}>
                          {expanded[`${msg.id}_${key}`] ? `▲ Hide ${label}` : `▼ ${label}`}
                        </button>
                      ))}
                      {msg.data?.length > 0 && (
                        <button
                          style={{ ...S.expandBtn, marginTop:0, color:"#34D399", borderColor:"#34D399" }}
                          onClick={() => downloadCSV(msg.data, `${msg.question.slice(0,30).replace(/[^a-z0-9]/gi,"_")}.csv`)}
                          onMouseEnter={e => { e.target.style.background="#34D39920"; }}
                          onMouseLeave={e => { e.target.style.background="none"; }}>
                          ↓ Download CSV
                        </button>
                      )}
                    </div>

                    {expanded[`${msg.id}_table`] && <div style={{ marginTop:10 }}><DataTable data={msg.data} filename={`${msg.question.slice(0,30).replace(/[^a-z0-9]/gi,"_")}.csv`} /></div>}
                    {expanded[`${msg.id}_sql`] && (
                      <pre style={{ marginTop:10, background:"#1e1e1e", border:`1px solid ${BORDER}`,
                        borderRadius:8, padding:14, fontSize:12, color:ACCENT,
                        overflowX:"auto", whiteSpace:"pre-wrap", margin:"10px 0 0" }}>
                        {msg.sql}
                      </pre>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display:"flex", gap:6, alignItems:"center", paddingLeft:4 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:7, height:7, borderRadius:"50%", background:ACCENT,
                  animation:"pulse 1.2s ease-in-out infinite", animationDelay:`${i*0.2}s` }} />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={S.inputArea}>
          <textarea style={S.input} rows={1}
            placeholder="Ask anything about your sales data..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
          />
          <button style={{ ...S.sendBtn, opacity:loading?0.5:1 }}
            onClick={() => handleSend(input)} disabled={loading}
            onMouseEnter={e => { if (!loading) e.target.style.background=ACCENT_DIM; }}
            onMouseLeave={e => { e.target.style.background=ACCENT; }}>
            Send
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.2)} }
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#222;border-radius:4px}
        textarea{line-height:1.5}
      `}</style>
    </div>
  );
}

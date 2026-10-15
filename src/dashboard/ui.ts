// Self-contained dashboard HTML: inline CSS and JavaScript (allowed by a per-response CSP nonce), no external requests.
// Layout: left sidebar + hash-routed views. The client script builds every node with DOM APIs (textContent), never innerHTML.
import { escapeHtml } from "../oauth";

const CSS = String.raw`:root{color-scheme:dark;--bg:#14161a;--side:#1a1d23;--panel:#1f232a;--panel2:#272c35;--line:#2c323c;--text:#e9ecf0;--muted:#8b93a0;--teal:#2dd4bf;--purple:#a78bfa;--good:#34d399;--warn:#f0b35e;--bad:#fb7185;--deep:#7c6af0;--light:#4cc9b0;--rem:#c4a7ff;--awake:#f0a35e}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:inherit;text-decoration:none}
.app{display:flex;min-height:100%}
.side{width:230px;flex:none;background:var(--side);border-right:1px solid var(--line);padding:18px 12px;display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:10px;font-size:1.25rem;font-weight:700;padding:4px 10px 18px;letter-spacing:.02em}
.brand .logo{width:28px;height:28px;border-radius:9px;background:linear-gradient(135deg,var(--teal),var(--purple));display:grid;place-items:center;color:#10131a;font-weight:800;font-size:.95rem}
nav.menu{display:flex;flex-direction:column;gap:3px;flex:1}
nav.menu a{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:11px;color:var(--muted)}
nav.menu a:hover{background:var(--panel);color:var(--text)}
nav.menu a.active{background:linear-gradient(90deg,rgba(45,212,191,.18),rgba(167,139,250,.12));color:var(--text);box-shadow:inset 3px 0 0 var(--teal)}
nav.menu a.active svg{color:var(--teal)}
svg.ico{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.side form{margin:0}
.logout{width:100%;display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:11px;background:none;border:0;color:var(--muted);font:inherit;cursor:pointer;text-align:left}
.logout:hover{background:var(--panel);color:var(--bad)}
.content{flex:1;min-width:0;display:flex;flex-direction:column}
.topbar{display:flex;align-items:center;gap:12px;padding:16px clamp(14px,2vw,32px) 6px}
.topbar h1{font-size:1.35rem;margin:0;flex:1}
.hamb{display:none;background:var(--panel);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:7px;cursor:pointer}
#view{padding:10px clamp(14px,2vw,32px) 36px;width:100%;max-width:none;min-width:0}
.scrim{display:none}
button,select,input{font:inherit;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:7px 13px}
button{cursor:pointer}button:hover{border-color:var(--teal)}
button.on{background:var(--teal);border-color:var(--teal);color:#0d1514;font-weight:600}
.seg{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(clamp(200px,16vw,280px),1fr));gap:14px;margin:8px 0 16px}
.card,.panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px}
.card{min-height:112px}
.card.click{cursor:pointer}.card.click:hover{border-color:var(--teal)}
.panel{margin:0 0 16px}
.panel h2{font-size:1rem;margin:0 0 10px;font-weight:600}
.label{color:var(--muted);font-size:.74rem;text-transform:uppercase;letter-spacing:.06em}
.big{font-size:1.85rem;font-weight:650;margin:3px 0;line-height:1.15}
.unit{font-size:.9rem;color:var(--muted);font-weight:400}
.sub{color:var(--muted);font-size:.85rem}
.empty{color:var(--muted);padding:16px 4px;font-style:italic}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:16px}
.panel{min-width:0}
.chartwrap{position:relative}
svg.chart{width:100%;height:auto;display:block;touch-action:manipulation;overflow:visible}
svg.chart text{fill:var(--muted);font-size:10px}
.tip{position:absolute;pointer-events:none;background:#0c0e11;border:1px solid var(--line);border-radius:8px;padding:5px 9px;font-size:.78rem;white-space:nowrap;transform:translate(-50%,-125%);z-index:3}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:.8rem;color:var(--muted);margin-top:6px}
table{width:100%;border-collapse:collapse;font-size:.9rem}
th,td{text-align:left;padding:8px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:500;font-size:.74rem;text-transform:uppercase;letter-spacing:.04em}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.tablewrap{overflow-x:auto}
.badge{display:inline-block;border-radius:999px;padding:1px 9px;font-size:.75rem;border:1px solid var(--line);color:var(--muted)}
.badge.ok{color:var(--good);border-color:var(--good)}.badge.bad{color:var(--bad);border-color:var(--bad)}.badge.warn{color:var(--warn);border-color:var(--warn)}
a.badge:hover{border-color:var(--teal);color:var(--text)}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.unknown{color:var(--warn)}
.hidden{display:none}
.err{color:var(--bad)}
.tabs{display:flex;gap:6px;margin-bottom:12px}
.tabs a{padding:7px 14px;border-radius:10px;background:var(--panel2);color:var(--muted);border:1px solid var(--line)}
.tabs a.active{background:var(--teal);border-color:var(--teal);color:#0d1514;font-weight:600}
.split{display:grid;grid-template-columns:minmax(300px,clamp(300px,26vw,460px)) minmax(0,1fr);gap:16px;align-items:start}
.wlist{display:flex;flex-direction:column;gap:6px;max-height:calc(100vh - 240px);overflow-y:auto;padding:10px 2px 10px 0}
.wrow{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:12px;background:var(--panel);border:1px solid var(--line)}
.wrow:hover{border-color:var(--teal)}
.wrow.sel{border-color:var(--teal);background:linear-gradient(90deg,rgba(45,212,191,.14),rgba(167,139,250,.08))}
.wrow .t{font-weight:600}.wrow .r{text-align:right;color:var(--muted);font-size:.85rem;white-space:nowrap}
.back{display:none;margin-bottom:10px;color:var(--teal)}
.login{max-width:23rem;margin:14vh auto 0;padding:0 14px}
.login .panel{padding:22px}.login input{width:100%;margin:6px 0 14px}.login button{width:100%;background:var(--teal);border-color:var(--teal);color:#0d1514;font-weight:600}
@media (max-width:820px){
.side{position:fixed;left:0;top:0;z-index:20;transform:translateX(-102%);transition:transform .2s ease;box-shadow:0 0 30px rgba(0,0,0,.5)}
.side.open{transform:none}
.scrim.open{display:block;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10}
.hamb{display:inline-flex}
.topbar{padding:12px 14px 4px;flex-wrap:wrap}.topbar h1{font-size:1.15rem}
#view{padding:8px 14px 30px}
.split{grid-template-columns:1fr}
.split.has-detail .wlist-pane{display:none}
.split:not(.has-detail) .wdetail{display:none}
.back{display:inline-block}
.wlist{max-height:none}
.grid2{grid-template-columns:1fr}
}`;

// NOTE: keep this script free of backticks and "${": it lives in a template literal.
export const DASHBOARD_JS = String.raw`(function () {
  "use strict";
  var TZ = "UTC";
  var SVGNS = "http://www.w3.org/2000/svg";
  var state = { days: 30, wk: { type: "", items: [], total: 0, types: [], loaded: false }, chargeDate: "" };
  var navToken = 0;
  var RANGE_VIEWS = { sleep: 1, activity: 1, charge: 1, weight: 1 };
  var TITLES = { overview: "Overview", sleep: "Sleep", activity: "Activity", charge: "Hybrid Charge", workouts: "Workouts", weight: "Weight", sync: "Sync" };

  // ---- DOM helpers (text is always set through textContent) --------------------------------------------------------------------------
  function append(el, kids) {
    if (kids === null || kids === undefined || kids === false) return;
    if (!Array.isArray(kids)) kids = [kids];
    kids.forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) append(el, c);
      else el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
    });
  }
  function setProps(el, props) {
    if (!props) return;
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") el.setAttribute("class", v);
      else if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    });
  }
  function h(tag, props, kids) { var el = document.createElement(tag); setProps(el, props); append(el, kids); return el; }
  function s(tag, props, kids) { var el = document.createElementNS(SVGNS, tag); setProps(el, props); append(el, kids); return el; }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function $(id) { return document.getElementById(id); }
  function empty(text) { return h("div", { class: "empty", text: text }); }

  // ---- formatting ---------------------------------------------------------------------------------------------------
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function fmtInt(v) { return isNum(v) ? Math.round(v).toLocaleString("en-US") : "-"; }
  function fmt1(v) { return isNum(v) ? (Math.round(v * 10) / 10).toLocaleString("en-US") : "-"; }
  function fmtDur(sec) {
    if (!isNum(sec)) return "-";
    var m = Math.round(sec / 60), hh = Math.floor(m / 60), mm = m % 60;
    return hh > 0 ? hh + "h " + (mm < 10 ? "0" : "") + mm + "m" : mm + "m";
  }
  function fmtKm(m) { return isNum(m) && m > 0 ? (m / 1000).toFixed(2) + " km" : "-"; }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function shortDate(d) { if (!d || d.length < 10) return d || "-"; return parseInt(d.slice(8, 10), 10) + " " + MONTHS[parseInt(d.slice(5, 7), 10) - 1]; }
  function fmtZone(iso, opts) {
    try { return new Intl.DateTimeFormat("en-GB", Object.assign({ timeZone: TZ }, opts)).format(new Date(iso)); } catch (e) { return String(iso); }
  }
  function localTime(iso) { return iso ? fmtZone(iso, { hour: "2-digit", minute: "2-digit", hour12: false }) : "-"; }
  function localDateTime(iso) { return iso ? fmtZone(iso, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "-"; }
  function typeBadge(w) {
    if (!w || !w.type_confidence) return null;
    return h("span", { class: "badge warn", title: "Sport name is a guess from Zepp type number " + (w.zepp_type === undefined || w.zepp_type === null ? "" : w.zepp_type) + " (" + w.type_confidence + ")", text: "inferred" });
  }
  function typeName(t) { if (!t) return "-"; var x = String(t).replace(/_/g, " "); return x.charAt(0).toUpperCase() + x.slice(1); }
  function dateList(start, end) {
    var out = [], d = new Date(start + "T00:00:00Z"), last = new Date(end + "T00:00:00Z");
    while (d <= last && out.length < 400) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); }
    return out;
  }
  function avg(list) { var v = list.filter(isNum); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; }
  function numbers(list) { return list.filter(isNum); }
  function byKey(list, key) { var m = {}; (list || []).forEach(function (r) { m[r[key]] = r; }); return m; }

  // ---- API ----------------------------------------------------------------------------------------------------------
  function api(path) {
    return fetch("/dashboard/api/" + path, { credentials: "same-origin", headers: { accept: "application/json" } }).then(function (r) {
      if (r.status === 401) { window.location.href = "/dashboard/login"; throw new Error("Signed out"); }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) { if (j && j.timezone) TZ = j.timezone; return j; });
  }

  // ---- charts (inline SVG, tap or hover for a tooltip) --------------------------------------------------------------
  function niceStep(raw) {
    var pow = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / pow;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  }
  // opts: { kind: "bar"|"line", points: [{label, v, segs:[{v,color}], tip}], color, fmt, mean, emptyText, zero }
  function chart(opts) {
    var pts = opts.points || [], vals = numbers(pts.map(function (p) { return p.v; }));
    if (!vals.length) return empty(opts.emptyText || "No data in this range");
    var H = 220, L = 44, R = 8, T = 12, B = 24, n = pts.length;
    var wrap = h("div", { "class": "chartwrap" });
    var tip = h("div", { "class": "tip hidden" });
    wrap.appendChild(tip);
    var curW = 0;
    // The viewBox always equals the rendered pixel width, so text and strokes keep their size and only the plot area grows.
    function draw(W) {
    curW = W;
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (opts.kind === "bar" || opts.zero) lo = Math.min(0, lo);
    var step = niceStep(Math.max((hi - lo) / 4, 0.0001));
    var ymin = Math.floor(lo / step) * step, ymax = Math.ceil(hi / step) * step;
    if (ymax === ymin) ymax = ymin + step;
    var iw = W - L - R, ih = H - T - B;
    function X(i) { return L + (i + 0.5) * iw / n; }
    function Y(v) { return T + ih - (v - ymin) / (ymax - ymin) * ih; }
    var fmt = opts.fmt || fmtInt, color = opts.color || "var(--teal)";
    var svg = s("svg", { "class": "chart", viewBox: "0 0 " + W + " " + H, role: "img", preserveAspectRatio: "xMidYMid meet" });
    for (var t = ymin; t <= ymax + step / 2; t += step) {
      svg.appendChild(s("line", { x1: L, x2: W - R, y1: Y(t), y2: Y(t), stroke: "currentColor", "stroke-opacity": "0.1" }));
      svg.appendChild(s("text", { x: L - 5, y: Y(t) + 3, "text-anchor": "end", text: fmt(t) }));
    }
    var ticks = Math.min(n, Math.max(2, Math.min(12, Math.floor(iw / 110))));
    for (var k = 0; k < ticks; k++) {
      var idx = ticks === 1 ? 0 : Math.round(k * (n - 1) / (ticks - 1));
      svg.appendChild(s("text", { x: X(idx), y: H - 7, "text-anchor": "middle", text: pts[idx].label }));
    }
    if (opts.kind === "bar") {
      var bw = Math.max(1, iw / n * 0.7);
      pts.forEach(function (p, i) {
        if (!isNum(p.v)) return;
        var segs = p.segs && p.segs.length ? p.segs : [{ v: p.v, color: color }], base = 0;
        segs.forEach(function (sg) {
          var y0 = Y(base), y1 = Y(base + sg.v);
          svg.appendChild(s("rect", { x: X(i) - bw / 2, y: Math.min(y0, y1), width: bw, height: Math.max(0, Math.abs(y0 - y1)), rx: n <= 100 ? 2 : 0, fill: sg.color }));
          base += sg.v;
        });
      });
    } else {
      var d = "", pen = false;
      pts.forEach(function (p, i) {
        if (!isNum(p.v)) { pen = false; return; }
        d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.v).toFixed(1) + " ";
        pen = true;
      });
      svg.appendChild(s("path", { d: d, fill: "none", stroke: color, "stroke-width": "2.2", "stroke-linejoin": "round", "stroke-linecap": "round" }));
      if (n <= 60) pts.forEach(function (p, i) { if (isNum(p.v)) svg.appendChild(s("circle", { cx: X(i), cy: Y(p.v), r: 2.8, fill: color })); });
    }
    if (isNum(opts.mean)) {
      svg.appendChild(s("line", { x1: L, x2: W - R, y1: Y(opts.mean), y2: Y(opts.mean), stroke: "var(--purple)", "stroke-dasharray": "4 3", "stroke-opacity": "0.9" }));
      svg.appendChild(s("text", { x: W - R - 2, y: Y(opts.mean) - 3, "text-anchor": "end", text: "avg " + fmt(opts.mean) }));
    }
    var old = wrap.querySelector("svg.chart");
    if (old) wrap.removeChild(old);
    tip.classList.add("hidden");
    wrap.insertBefore(svg, tip);
    function show(i) {
      var p = pts[i];
      tip.textContent = p.tip || (p.label + ": " + fmt(p.v));
      tip.style.left = (X(i) / W * 100) + "%";
      tip.style.top = (Y(p.v) / H * 100) + "%";
      tip.classList.remove("hidden");
    }
    pts.forEach(function (p, i) {
      if (!isNum(p.v)) return;
      var hit = s("rect", { x: X(i) - iw / n / 2, y: T, width: iw / n, height: ih, fill: "transparent" });
      hit.addEventListener("pointerenter", function () { show(i); });
      hit.addEventListener("pointerdown", function () { show(i); });
      hit.addEventListener("click", function () { show(i); });
      svg.appendChild(hit);
    });
    svg.addEventListener("pointerleave", function (ev) { if (ev.pointerType === "mouse") tip.classList.add("hidden"); });
    }
    draw(640);
    function fit() {
      var w = Math.round(wrap.clientWidth);
      if (w >= 240 && w !== curW) draw(Math.min(w, 3000));
    }
    if (typeof ResizeObserver === "function") new ResizeObserver(fit).observe(wrap);
    else {
      var onResize = function () { if (!wrap.isConnected) window.removeEventListener("resize", onResize); else fit(); };
      window.addEventListener("resize", onResize);
    }
    return wrap;
  }
  function legend(items) {
    return h("div", { class: "legend" }, items.map(function (i) {
      return h("span", null, [s("svg", { width: 10, height: 10, viewBox: "0 0 10 10" }, s("circle", { cx: 5, cy: 5, r: 5, fill: i.color })), " " + i.name]);
    }));
  }
  var STAGE_COLORS = { deep: "var(--deep)", light: "var(--light)", rem: "var(--rem)", awake: "var(--awake)" };
  var STAGE_LEGEND = [{ name: "deep", color: STAGE_COLORS.deep }, { name: "light", color: STAGE_COLORS.light }, { name: "REM", color: STAGE_COLORS.rem }, { name: "awake", color: STAGE_COLORS.awake }];
  function stackBar(stageS) {
    if (!stageS) return null;
    var order = ["deep", "light", "rem", "awake"], total = 0;
    order.forEach(function (k) { total += stageS[k] || 0; });
    if (!total) return null;
    var x = 0, svg = s("svg", { viewBox: "0 0 200 8", width: "100%", height: 8, role: "img", preserveAspectRatio: "none" });
    order.forEach(function (k) {
      var w = (stageS[k] || 0) / total * 200;
      if (w > 0) svg.appendChild(s("rect", { x: x, y: 0, width: w, height: 8, fill: STAGE_COLORS[k] }, s("title", { text: k + " " + fmtDur(stageS[k]) })));
      x += w;
    });
    return svg;
  }

  // ---- shared building blocks ---------------------------------------------------------------------------------------
  function card(label, big, unit, sub, extra, onclick) {
    return h("div", { class: "card" + (onclick ? " click" : ""), onclick: onclick || null, tabindex: onclick ? "0" : null }, [
      h("div", { class: "label", text: label }),
      h("div", { class: "big" }, [big, unit ? h("span", { class: "unit", text: " " + unit }) : null]),
      h("div", { class: "sub" }, sub), extra || null
    ]);
  }
  function emptyCard(label, text) { return h("div", { class: "card" }, [h("div", { class: "label", text: label }), h("div", { class: "empty", text: text })]); }
  function panel(title, kids) { return h("section", { class: "panel" }, [title ? h("h2", { text: title }) : null, kids]); }
  function when(date, today) { return date && date !== today ? "latest " + shortDate(date) : date ? "today" : ""; }
  function table(heads, rows, numCols) {
    numCols = numCols || [];
    var thead = h("thead", null, h("tr", null, heads.map(function (x, i) { return h("th", { class: numCols.indexOf(i) >= 0 ? "n" : null, text: x }); })));
    var tbody = h("tbody", null, rows.map(function (r) {
      return h("tr", null, r.map(function (c, i) { return h("td", { class: numCols.indexOf(i) >= 0 ? "n" : null }, c === null || c === undefined ? "-" : c); }));
    }));
    return h("div", { class: "tablewrap" }, h("table", null, [thead, tbody]));
  }
  function stepsPoints(t, days) {
    var by = byKey(t.daily, "date");
    return days.map(function (dt) { var r = by[dt]; var v = r && isNum(r.steps) && r.steps > 0 ? r.steps : null; return { label: shortDate(dt), v: v, tip: shortDate(dt) + ": " + fmtInt(v) + " steps" }; });
  }
  function sleepPoints(t, days) {
    var by = byKey(t.sleep, "sleep_date");
    return days.map(function (dt) {
      var r = by[dt]; if (!r) return { label: shortDate(dt), v: null };
      var hrs = r.duration_s / 3600, segs = null;
      if (r.stage_s) {
        segs = ["deep", "light", "rem", "awake"].map(function (k) { return { v: (r.stage_s[k] || 0) / 3600, color: STAGE_COLORS[k] }; }).filter(function (x) { return x.v > 0; });
        var sum = segs.reduce(function (a, b) { return a + b.v; }, 0);
        if (sum > hrs * 1.02 || sum < hrs * 0.5) segs = null;
      }
      return { label: shortDate(dt), v: hrs, segs: segs, tip: shortDate(dt) + ": " + fmtDur(r.duration_s) + (isNum(r.score) ? " (score " + fmtInt(r.score) + ")" : "") };
    });
  }
  function sleepChart(t, days) {
    var pts = sleepPoints(t, days);
    return [chart({ kind: "bar", points: pts, fmt: fmt1, mean: avg(pts.map(function (p) { return p.v; })), emptyText: "No sleep data in this range" }), legend(STAGE_LEGEND), h("div", { class: "sub", text: "Hours asleep per night" })];
  }
  function chargePoints(t, days) {
    var by = byKey(t.charge, "date");
    return days.map(function (dt) {
      var r = by[dt]; if (!r) return { label: shortDate(dt), v: null };
      return { label: shortDate(dt), v: r.avg, tip: shortDate(dt) + ": avg " + fmtInt(r.avg) + ", min " + fmtInt(r.min) + ", max " + fmtInt(r.max) + ", end " + fmtInt(r.last) };
    });
  }
  function rangeNote(t) { return h("div", { class: "sub", text: shortDate(t.start) + " to " + shortDate(t.end) }); }

  // ---- views --------------------------------------------------------------------------------------------------------
  function syncLine(st) {
    if (!st.available) return h("div", { class: "sub", text: "Local database not available yet" });
    var last = st.last_run, ok = st.last_success && st.last_success.finished_at;
    var ageH = ok ? (Date.parse(st.now) - Date.parse(ok)) / 3600000 : null;
    var stale = ageH !== null && ageH > 36;
    var badge = !last ? h("span", { class: "badge", text: "never synced" })
      : last.ok ? h("span", { class: "badge " + (stale ? "warn" : "ok"), text: stale ? "stale" : "ok" })
      : last.status === "running" ? h("span", { class: "badge warn", text: "running" })
      : h("span", { class: "badge bad", text: "failed" + (last.error_kind ? " (" + last.error_kind + ")" : "") });
    return h("div", { class: "sub" }, ["Sync ", badge, ok ? " last success " + localDateTime(ok) : " no successful sync yet", st.sync && st.sync.next_run_at ? " | next " + localDateTime(st.sync.next_run_at) : ""]);
  }

  function viewOverview(box, token) {
    return Promise.all([api("overview"), api("trends?days=30"), api("status")]).then(function (res) {
      if (token !== navToken) return;
      var o = res[0], t = res[1], st = res[2];
      clear(box);
      if (!o.available) { box.appendChild(panel("", empty("The local database is not available yet. The first sync creates it."))); return; }
      var d = o.daily, sl = o.sleep, c = o.charge, w = o.workout, hr = o.resting_hr, cards = h("div", { class: "cards" });
      cards.appendChild(d && isNum(d.steps) ? card("Steps", fmtInt(d.steps), "", when(d.date, o.today) + " | " + fmtKm(d.distance_m) + " | " + fmtInt(d.active_calories_kcal) + " kcal", null, function () { go("activity"); }) : emptyCard("Steps", "No step data yet"));
      cards.appendChild(sl ? card("Sleep", fmtDur(sl.duration_s), "", (isNum(sl.score) ? "score " + fmtInt(sl.score) + " | " : "") + localTime(sl.started_at) + " - " + localTime(sl.ended_at) + " | " + shortDate(sl.sleep_date), stackBar(sl.stage_s), function () { go("sleep"); }) : emptyCard("Sleep", "No sleep data yet"));
      cards.appendChild(hr && isNum(hr.resting_hr_bpm) ? card("Resting HR", fmtInt(hr.resting_hr_bpm), "bpm", when(hr.date, o.today), null, function () { go("activity"); }) : emptyCard("Resting HR", "No heart-rate data"));
      if (c && isNum(c.last)) {
        var gauge = s("svg", { viewBox: "0 0 100 6", width: "100%", height: 6, preserveAspectRatio: "none", role: "img" }, [
          s("rect", { x: 0, y: 0, width: 100, height: 6, rx: 3, fill: "var(--line)" }),
          s("rect", { x: 0, y: 0, width: Math.max(0, Math.min(100, c.last)), height: 6, rx: 3, fill: "var(--teal)" })]);
        cards.appendChild(card("Hybrid Charge", fmtInt(c.last), "/ 100", when(c.date, o.today) + " | avg " + fmtInt(c.avg) + ", " + fmtInt(c.min) + " - " + fmtInt(c.max), gauge, function () { go("charge"); }));
      } else cards.appendChild(emptyCard("Hybrid Charge", "No Hybrid Charge data"));
      box.appendChild(cards);
      box.appendChild(w ? card("Last workout", typeName(w.activity_type), "", shortDate(w.started_date) + " " + localTime(w.started_at) + " | " + fmtDur(w.duration_s) + (isNum(w.distance_m) && w.distance_m > 0 ? " | " + fmtKm(w.distance_m) : ""), typeBadge(w), function () { go("workouts/" + encodeURIComponent(w.workout_id)); }) : emptyCard("Last workout", "No workouts yet"));
      var days = dateList(t.start, t.end), sp = stepsPoints(t, days);
      box.appendChild(h("div", { class: "grid2" }, [
        panel("Steps, last 30 days", chart({ kind: "bar", points: sp, mean: avg(sp.map(function (p) { return p.v; })), emptyText: "No step data in this range" })),
        panel("Sleep, last 30 days", sleepChart(t, days))
      ]));
      box.appendChild(panel("", syncLine(st)));
    });
  }

  function viewSleep(box, token) {
    return api("trends?days=" + state.days).then(function (t) {
      if (token !== navToken) return;
      clear(box);
      if (!t.available) { box.appendChild(panel("", empty("No data yet"))); return; }
      var days = dateList(t.start, t.end), nights = t.sleep || [], durs = nights.map(function (n) { return n.duration_s; });
      var scores = numbers(nights.map(function (n) { return n.score; }));
      box.appendChild(h("div", { class: "cards" }, [
        card("Average sleep", fmtDur(avg(durs)), "", nights.length + " nights"),
        card("Average score", fmtInt(avg(scores)), "", scores.length + " scored nights"),
        card("Longest night", durs.length ? fmtDur(Math.max.apply(null, durs)) : "-", "", ""),
        card("Shortest night", durs.length ? fmtDur(Math.min.apply(null, durs)) : "-", "", "")
      ]));
      box.appendChild(panel("Sleep per night", [sleepChart(t, days), rangeNote(t)]));
      var rows = nights.slice(-14).reverse().map(function (n) {
        var st = n.stage_s || {};
        return [shortDate(n.sleep_date), fmtDur(n.duration_s), fmtInt(n.score), fmtDur(st.deep), fmtDur(st.light), fmtDur(st.rem), fmtDur(st.awake)];
      });
      box.appendChild(panel("Recent nights", rows.length ? table(["Night", "Total", "Score", "Deep", "Light", "REM", "Awake"], rows, [1, 2, 3, 4, 5, 6]) : empty("No sleep data in this range")));
    });
  }

  function viewActivity(box, token) {
    return api("trends?days=" + state.days).then(function (t) {
      if (token !== navToken) return;
      clear(box);
      if (!t.available) { box.appendChild(panel("", empty("No data yet"))); return; }
      var days = dateList(t.start, t.end), sp = stepsPoints(t, days), by = byKey(t.daily, "date");
      var stepVals = numbers(sp.map(function (p) { return p.v; }));
      box.appendChild(h("div", { class: "cards" }, [
        card("Average steps", fmtInt(avg(stepVals)), "", stepVals.length + " days with data"),
        card("Best day", stepVals.length ? fmtInt(Math.max.apply(null, stepVals)) : "-", "steps", ""),
        card("Average distance", fmtKm(avg((t.daily || []).map(function (r) { return r.distance_m; }))), "", ""),
        card("Average resting HR", fmtInt(avg((t.daily || []).map(function (r) { return r.resting_hr_bpm; }))), "bpm", "")
      ]));
      box.appendChild(panel("Steps per day", [chart({ kind: "bar", points: sp, mean: avg(stepVals), emptyText: "No step data in this range" }), rangeNote(t)]));
      var cal = days.map(function (dt) { var r = by[dt]; var v = r && isNum(r.active_calories_kcal) && r.active_calories_kcal > 0 ? r.active_calories_kcal : null; return { label: shortDate(dt), v: v, tip: shortDate(dt) + ": " + fmtInt(v) + " kcal" }; });
      var rhr = days.map(function (dt) { var r = by[dt]; var v = r && isNum(r.resting_hr_bpm) ? r.resting_hr_bpm : null; return { label: shortDate(dt), v: v, tip: shortDate(dt) + ": " + fmtInt(v) + " bpm" }; });
      box.appendChild(h("div", { class: "grid2" }, [
        panel("Active calories", chart({ kind: "bar", points: cal, color: "var(--purple)", emptyText: "No calorie data in this range" })),
        panel("Resting heart rate", chart({ kind: "line", points: rhr, color: "var(--purple)", emptyText: "No resting heart-rate data in this range" }))
      ]));
      var rows = (t.daily || []).slice(-14).reverse().map(function (r) { return [shortDate(r.date), fmtInt(r.steps), fmtKm(r.distance_m), fmtInt(r.active_calories_kcal), fmtInt(r.resting_hr_bpm)]; });
      box.appendChild(panel("Recent days", rows.length ? table(["Day", "Steps", "Distance", "kcal", "Resting HR"], rows, [1, 2, 3, 4]) : empty("No data in this range")));
    });
  }

  function viewCharge(box, token) {
    return api("trends?days=" + state.days).then(function (t) {
      if (token !== navToken) return;
      clear(box);
      if (!t.available) { box.appendChild(panel("", empty("No data yet"))); return; }
      var days = dateList(t.start, t.end), list = t.charge || [], pts = chargePoints(t, days);
      var lastDay = list.length ? list[list.length - 1] : null;
      box.appendChild(h("div", { class: "cards" }, [
        card("Average charge", fmtInt(avg(list.map(function (r) { return r.avg; }))), "/ 100", list.length + " days with data"),
        card("Latest end of day", lastDay ? fmtInt(lastDay.last) : "-", "/ 100", lastDay ? shortDate(lastDay.date) : ""),
        card("Lowest", list.length ? fmtInt(Math.min.apply(null, list.map(function (r) { return r.min; }))) : "-", "", ""),
        card("Highest", list.length ? fmtInt(Math.max.apply(null, list.map(function (r) { return r.max; }))) : "-", "", "")
      ]));
      box.appendChild(panel("Daily average", [chart({ kind: "line", points: pts, zero: true, emptyText: "No Hybrid Charge data in this range" }), h("div", { class: "sub", text: "Tap or hover a point for min, max and end of day. " + shortDate(t.start) + " to " + shortDate(t.end) })]));
      var dayBox = h("div");
      var input = h("input", { type: "date", value: state.chargeDate || (lastDay ? lastDay.date : "") });
      function loadDay() {
        clear(dayBox);
        var date = input.value;
        if (!date) { dayBox.appendChild(empty("No Hybrid Charge data")); return; }
        api("charge?days=" + state.days + "&date=" + encodeURIComponent(date)).then(function (c) {
          if (token !== navToken) return;
          clear(dayBox);
          var p = (c.samples || []).map(function (r) { var lab = localTime(new Date(r.t).toISOString()); return { label: lab, v: r.total, tip: lab + ": " + fmtInt(r.total) + " (mental " + fmt1(r.mental) + ", physical " + fmt1(r.physical) + ")" }; });
          dayBox.appendChild(chart({ kind: "line", points: p, zero: true, emptyText: "No samples on " + date }));
          if (c.insights && c.insights.length) dayBox.appendChild(h("div", { class: "sub", text: c.insights.length + " insight event(s) recorded this day" }));
        }).catch(function (e) { clear(dayBox); dayBox.appendChild(h("div", { class: "empty err", text: "Could not load: " + e.message })); });
      }
      input.addEventListener("change", function () { state.chargeDate = input.value; loadDay(); });
      box.appendChild(panel("One day", [h("div", { class: "seg" }, [h("span", { class: "sub", text: "Day" }), input]), dayBox]));
      loadDay();
      var rows = list.slice(-14).reverse().map(function (r) { return [shortDate(r.date), fmtInt(r.avg), fmtInt(r.min), fmtInt(r.max), fmtInt(r.last), fmtInt(r.samples)]; });
      box.appendChild(panel("Recent days", rows.length ? table(["Day", "Avg", "Min", "Max", "End", "Samples"], rows, [1, 2, 3, 4, 5]) : empty("No data in this range")));
    });
  }

  function viewWeight(box, token) {
    var days = Math.max(state.days, 90);
    return api("weight?days=" + days).then(function (w) {
      if (token !== navToken) return;
      clear(box);
      var recs = w.records || [];
      if (!recs.length) { box.appendChild(panel("", empty("No weigh-ins in this range"))); return; }
      var latest = recs[recs.length - 1], first = recs[0], diff = latest.weight_kg - first.weight_kg;
      box.appendChild(h("div", { class: "cards" }, [
        card("Latest", fmt1(latest.weight_kg), "kg", shortDate(latest.date) + (isNum(latest.bmi) ? " | BMI " + fmt1(latest.bmi) : "")),
        card("Change", (diff > 0 ? "+" : "") + fmt1(diff), "kg", "since " + shortDate(first.date)),
        card("Weigh-ins", fmtInt(recs.length), "", "last " + days + " days")
      ]));
      var pts = recs.map(function (r) { return { label: shortDate(r.date), v: r.weight_kg, tip: shortDate(r.date) + " " + localTime(r.measured_at) + ": " + fmt1(r.weight_kg) + " kg" }; });
      box.appendChild(panel("Weight", chart({ kind: "line", points: pts, fmt: fmt1, color: "var(--purple)" })));
      box.appendChild(panel("History", table(["Date", "Time", "Weight", "BMI"], recs.slice(-20).reverse().map(function (r) { return [shortDate(r.date), localTime(r.measured_at), fmt1(r.weight_kg) + " kg", fmt1(r.bmi)]; }), [2, 3])));
    });
  }

  function viewSync(box, token) {
    return api("status").then(function (st) {
      if (token !== navToken) return;
      clear(box);
      if (!st.available) { box.appendChild(panel("", empty("Local database not available yet"))); return; }
      box.appendChild(panel("Status", [syncLine(st),
        st.last_run ? h("div", { class: "sub", text: "Last run " + localDateTime(st.last_run.started_at) + " (" + st.last_run.trigger + ", " + shortDate(st.last_run.range_start) + " to " + shortDate(st.last_run.range_end) + ")" }) : null]));
      box.appendChild(panel("Coverage", table(["Data", "Rows", "First", "Last"], st.coverage.map(function (c) { return [c.table.replace(/_/g, " "), fmtInt(c.rows), c.first ? shortDate(c.first) + " " + c.first.slice(0, 4) : "-", c.last ? shortDate(c.last) + " " + c.last.slice(0, 4) : "-"]; }), [1])));
      box.appendChild(panel("Recent runs", (st.recent_runs || []).length ? table(["Started", "Trigger", "Result"], st.recent_runs.map(function (r) {
        return [localDateTime(r.started_at), r.trigger, h("span", { class: "badge " + (r.ok ? "ok" : r.status === "running" ? "warn" : "bad"), text: r.ok ? "ok" : r.status + (r.error_kind ? " (" + r.error_kind + ")" : "") })];
      })) : empty("No sync runs yet")));
      box.appendChild(h("div", { class: "sub", text: "Strength sets " + fmtInt(st.strength_sets) + " | charge insights " + fmtInt(st.charge_insights) + " | schema v" + st.schema_version + " | database " + (isNum(st.db_bytes) ? (st.db_bytes / 1048576).toFixed(1) + " MB" : "-") + " | times in " + TZ }));
    });
  }

  // ---- workouts: list / detail layout, with an Exercises tab ---------------------------------------------------------
  function exerciseCell(name, known, id) {
    return known ? name : h("span", { class: "unknown mono", title: "Unmapped exercise id " + id }, name);
  }
  function loadWorkoutPage() {
    var wk = state.wk;
    var q = "workouts?limit=25&offset=" + wk.items.length + (wk.type ? "&type=" + encodeURIComponent(wk.type) : "");
    return api(q).then(function (r) {
      wk.items = wk.items.concat(r.workouts || []); wk.total = r.total; wk.types = r.types || wk.types || []; wk.loaded = true;
    });
  }
  function workoutRow(w, selId) {
    return h("a", { class: "wrow" + (w.workout_id === selId ? " sel" : ""), href: "#/workouts/" + encodeURIComponent(w.workout_id) }, [
      h("div", null, [h("div", { class: "t" }, [typeName(w.activity_type), " ", typeBadge(w)]), h("div", { class: "sub", text: shortDate(w.started_date) + " " + localTime(w.started_at) + (w.strength_sets > 0 ? " | " + w.strength_sets + " sets" : "") })]),
      h("div", { class: "r" }, [h("div", { text: fmtDur(w.duration_s) }), h("div", { text: fmtKm(w.distance_m) })])
    ]);
  }
  function renderDetail(pane, id, token) {
    clear(pane); pane.appendChild(empty("Loading..."));
    return api("workouts/" + encodeURIComponent(id)).then(function (r) {
      if (token !== navToken) return;
      clear(pane);
      var w = r.workout;
      pane.appendChild(h("a", { class: "back", href: "#/workouts" }, "< All workouts"));
      pane.appendChild(h("div", { class: "cards" }, [
        card("Type", typeName(w.activity_type), "", shortDate(w.started_date) + " " + localTime(w.started_at) + " - " + localTime(w.ended_at), typeBadge(w)),
        card("Duration", fmtDur(w.duration_s), "", isNum(w.distance_m) && w.distance_m > 0 ? fmtKm(w.distance_m) : ""),
        card("Heart rate", fmtInt(w.avg_hr_bpm), "bpm avg", "max " + fmtInt(w.max_hr_bpm)),
        card("Energy", fmtInt(w.calories_kcal), "kcal", isNum(w.training_load) ? "load " + fmtInt(w.training_load) : "")
      ]));
      if (r.sets && r.sets.length) {
        var volume = 0; r.sets.forEach(function (x) { if (isNum(x.weight_kg) && x.weight_kg > 0 && isNum(x.reps)) volume += x.weight_kg * x.reps; });
        pane.appendChild(panel("Sets: " + r.sets.length + ", volume " + fmtInt(volume) + " kg", table(["#", "Exercise", "Reps", "Weight", "Time", "Avg HR"], r.sets.map(function (x) {
          return [fmtInt(x.set_no + 1), exerciseCell(x.exercise, x.known, x.action_type), fmtInt(x.reps), isNum(x.weight_kg) && x.weight_kg > 0 ? fmt1(x.weight_kg) + " kg" : "bodyweight", fmtDur(x.duration_s), fmtInt(x.avg_hr_bpm)];
        }), [0, 2, 3, 4, 5])));
      } else if (/strength/.test(String(w.activity_type))) {
        pane.appendChild(panel("", empty("No strength sets stored for this workout")));
      }
    }).catch(function (e) { if (token === navToken) { clear(pane); pane.appendChild(h("div", { class: "empty err", text: "Could not load: " + e.message })); } });
  }
  function exercisesTab(box, token) {
    return api("exercises").then(function (r) {
      if (token !== navToken) return;
      var list = r.exercises || [];
      if (!list.length) { box.appendChild(panel("", empty("No strength sets stored yet"))); return; }
      var note = r.unknown_count ? h("p", { class: "sub" }, [h("span", { class: "badge warn", text: r.unknown_count + " unmapped" }), " Add these ids to ", h("code", { text: "src/zepp/strength-exercises.ts" }), " after checking them in the Zepp app. Open the example workout to see where each was logged."]) : h("p", { class: "sub", text: "Every exercise id has a name." });
      var fromCatalog = list.filter(function (e) { return e.source === "catalog"; }).length;
      var srcNote = h("p", { class: "sub", text: fromCatalog ? fromCatalog + " name(s) come from the Gadgetbridge catalog and are unverified. Override any wrong one in src/zepp/strength-exercises.ts." : "" });
      box.appendChild(panel("Exercise ids", [note, srcNote, table(["Id", "Name", "Source", "Sets", "Workouts", "Last seen", "Avg reps", "Max kg", "Example"], list.map(function (e) {
        return [String(e.action_type), exerciseCell(e.name, e.known, e.action_type), h("span", { class: "badge " + (e.source === "owner" ? "ok" : e.source === "catalog" ? "" : "warn"), text: e.source || "unknown" }), fmtInt(e.sets), fmtInt(e.workouts), shortDate(e.last_date), fmt1(e.avg_reps), isNum(e.max_weight_kg) && e.max_weight_kg > 0 ? fmt1(e.max_weight_kg) : "-",
          h("a", { href: "#/workouts/" + encodeURIComponent(e.example_workout_id), class: "badge", text: "Open" })];
      }), [0, 3, 4, 6, 7])]));
    });
  }
  function viewWorkouts(box, token, rest) {
    var tabs = h("div", { class: "tabs" }, [
      h("a", { href: "#/workouts", class: rest !== "exercises" ? "active" : "", text: "Workouts" }),
      h("a", { href: "#/workouts/exercises", class: rest === "exercises" ? "active" : "", text: "Exercises" })
    ]);
    clear(box); box.appendChild(tabs);
    if (rest === "exercises") return exercisesTab(box, token);
    var wk = state.wk, split = h("div", { class: "split" + (rest ? " has-detail" : "") });
    var listPane = h("div", { class: "wlist-pane" }), detailPane = h("div", { class: "wdetail" });
    split.appendChild(listPane); split.appendChild(detailPane); box.appendChild(split);
    function paintList() {
      clear(listPane);
      var options = [h("option", { value: "", text: "All types" })].concat((wk.types || []).map(function (t) { return h("option", { value: t.type, text: typeName(t.type) + " (" + t.n + ")", selected: t.type === wk.type ? "selected" : null }); }));
      var sel = h("select", { "aria-label": "Workout type" }, options);
      sel.addEventListener("change", function () { wk.type = sel.value; wk.items = []; wk.loaded = false; viewWorkouts(box, token, rest); });
      listPane.appendChild(h("div", { class: "seg" }, [sel, h("span", { class: "sub", text: wk.items.length + " of " + wk.total })]));
      if (!wk.items.length) { listPane.appendChild(empty("No workouts yet")); return; }
      listPane.appendChild(h("div", { class: "wlist" }, wk.items.map(function (w) { return workoutRow(w, rest); })));
      if (wk.items.length < wk.total) listPane.appendChild(h("button", { text: "Load more", onclick: function () { loadWorkoutPage().then(paintList); } }));
    }
    var listReady = wk.loaded ? Promise.resolve() : loadWorkoutPage();
    var detail;
    if (rest) detail = renderDetail(detailPane, rest, token);
    else { detailPane.appendChild(empty("Select a workout to see its details")); detail = Promise.resolve(); }
    return Promise.all([listReady.then(function () { if (token === navToken) paintList(); }), detail]);
  }

  // ---- router -------------------------------------------------------------------------------------------------------
  function go(r) { window.location.hash = "#/" + r; }
  function parseRoute() {
    var raw = window.location.hash.replace(/^#\/?/, ""), i = raw.indexOf("/");
    var view = i < 0 ? raw : raw.slice(0, i), rest = i < 0 ? "" : raw.slice(i + 1);
    try { rest = decodeURIComponent(rest); } catch (e) { rest = ""; }
    if (!TITLES[view]) view = "overview";
    return { view: view, rest: rest };
  }
  function renderRange(view) {
    var bar = $("rangebar"); clear(bar);
    if (!RANGE_VIEWS[view]) return;
    [30, 90, 180, 365].forEach(function (d) {
      bar.appendChild(h("button", { "class": d === state.days ? "on" : "", text: d + " days", onclick: function () { state.days = d; route(); } }));
    });
  }
  function closeMenu() { $("sidebar").classList.remove("open"); $("scrim").classList.remove("open"); }
  function route() {
    var r = parseRoute(), token = ++navToken, box = $("view");
    document.title = TITLES[r.view] + " | Zepp";
    $("title").textContent = TITLES[r.view];
    Array.prototype.forEach.call(document.querySelectorAll("nav.menu a"), function (a) { a.classList.toggle("active", a.getAttribute("data-route") === r.view); });
    closeMenu();
    renderRange(r.view);
    clear(box); box.appendChild(empty("Loading..."));
    var views = { overview: viewOverview, sleep: viewSleep, activity: viewActivity, charge: viewCharge, workouts: viewWorkouts, weight: viewWeight, sync: viewSync };
    var p;
    try { p = views[r.view](box, token, r.rest); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).catch(function (e) {
      if (token !== navToken) return;
      clear(box); box.appendChild(h("div", { class: "empty err", text: "Could not load: " + (e && e.message ? e.message : "error") }));
    });
  }
  function init() {
    $("menu").addEventListener("click", function () { $("sidebar").classList.toggle("open"); $("scrim").classList.toggle("open"); });
    $("scrim").addEventListener("click", closeMenu);
    window.addEventListener("hashchange", route);
    route();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();`;

const HEAD = (nonce: string, title: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="dark"><title>${escapeHtml(title)}</title>` +
  `<style nonce="${escapeHtml(nonce)}">${CSS}</style></head>`;

/** Simple 24x24 line icons (stroke paths). */
const ICONS = {
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  sleep: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  charge: "M13 2 3 14h9l-1 8 10-12h-9z",
  workouts: "M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11",
  weight: "M12 3a4 4 0 0 0-4 4h8a4 4 0 0 0-4-4zM5 7h14l1 13H4z",
  sync: "M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2M21 4v5h-5M3 20v-5h5",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  menu: "M3 6h18M3 12h18M3 18h18"
} as const;

/** Sidebar entries, in order. There is deliberately no separate Strength entry: strength lives inside Workouts. */
export const NAV_ITEMS: ReadonlyArray<{ route: keyof typeof ICONS; label: string }> = [
  { route: "overview", label: "Overview" },
  { route: "sleep", label: "Sleep" },
  { route: "activity", label: "Activity" },
  { route: "charge", label: "Hybrid Charge" },
  { route: "workouts", label: "Workouts" },
  { route: "weight", label: "Weight" },
  { route: "sync", label: "Sync" }
];

const icon = (name: keyof typeof ICONS) =>
  `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;

export function renderLoginHtml(opts: { nonce: string; csrf: string; error?: string; locked?: boolean }): string {
  return `${HEAD(opts.nonce, "Zepp - sign in")}<body><main class="login"><div class="panel">` +
    `<h1>Zepp</h1><p class="sub">Read-only view of your synced Zepp data.</p>` +
    (opts.error ? `<p class="err" role="alert">${escapeHtml(opts.error)}</p>` : "") +
    `<form method="post" action="/dashboard/login" autocomplete="off">` +
    `<input type="hidden" name="csrf" value="${escapeHtml(opts.csrf)}">` +
    `<label class="label" for="pw">Owner password</label>` +
    `<input id="pw" type="password" name="password" required autofocus autocomplete="current-password"${opts.locked ? " disabled" : ""}>` +
    `<button type="submit"${opts.locked ? " disabled" : ""}>Sign in</button></form></div></main></body></html>`;
}

export function renderDashboardHtml(nonce: string): string {
  const n = escapeHtml(nonce);
  const nav = NAV_ITEMS.map(i => `<a href="#/${i.route}" data-route="${i.route}">${icon(i.route)}<span>${i.label}</span></a>`).join("");
  return `${HEAD(nonce, "Zepp")}<body><div class="app">` +
    `<aside id="sidebar" class="side"><div class="brand"><span class="logo">Z</span><span>Zepp</span></div>` +
    `<nav class="menu" aria-label="Sections">${nav}</nav>` +
    `<form method="post" action="/dashboard/logout"><button type="submit" class="logout">${icon("logout")}<span>Log out</span></button></form></aside>` +
    `<div id="scrim" class="scrim"></div>` +
    `<div class="content"><header class="topbar"><button id="menu" type="button" class="hamb" aria-label="Open menu">${icon("menu")}</button>` +
    `<h1 id="title">Overview</h1><div id="rangebar" class="seg"></div></header>` +
    `<main id="view"><div class="empty">Loading...</div></main></div></div>` +
    `<script nonce="${n}">${DASHBOARD_JS}</script></body></html>`;
}
// Self-contained dashboard HTML: inline CSS and JavaScript (allowed by a per-response CSP nonce), no external requests.
// The client script builds every node with DOM APIs (textContent), never innerHTML.
import { escapeHtml } from "../oauth";

const CSS = String.raw`:root{color-scheme:dark light;--bg:#0f1419;--panel:#1a212a;--panel2:#222b36;--line:#2d3744;--text:#e6edf3;--muted:#8b98a7;--accent:#2f81f7;--good:#3fb950;--warn:#d29922;--bad:#ff7b72;--c1:#2f81f7;--c2:#a371f7;--c3:#3fb950;--c4:#f0883e;--deep:#5b6ee1;--light:#8fa8ff;--rem:#c084fc;--awake:#f0883e}
@media (prefers-color-scheme:light){:root{--bg:#f4f6f8;--panel:#fff;--panel2:#eef1f5;--line:#d5dce4;--text:#1b2430;--muted:#5d6b7a;--accent:#1f6feb;--bad:#cf222e;--good:#1a7f37;--warn:#9a6700}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:12px}
header.top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:8px 0 12px}
h1{font-size:1.25rem;margin:0}h2{font-size:1.05rem;margin:0 0 10px}h3{font-size:.95rem;margin:14px 0 6px}
.bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
button,select,input{font:inherit;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:6px 12px}
button{cursor:pointer}button:hover{border-color:var(--accent)}button.on{background:var(--accent);border-color:var(--accent);color:#fff}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;margin:0 0 12px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px;min-height:104px}
.card.click{cursor:pointer}.card.click:hover{border-color:var(--accent)}
.label{color:var(--muted);font-size:.78rem;text-transform:uppercase;letter-spacing:.04em}
.big{font-size:1.7rem;font-weight:650;margin:2px 0}.unit{font-size:.9rem;color:var(--muted);font-weight:400}
.sub{color:var(--muted);font-size:.85rem}
.empty{color:var(--muted);padding:14px 4px;font-style:italic}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
svg.chart{width:100%;height:auto;display:block}
svg text{fill:var(--muted);font-size:10px}
.legend{display:flex;gap:12px;flex-wrap:wrap;font-size:.8rem;color:var(--muted);margin-top:4px}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px}
table{width:100%;border-collapse:collapse;font-size:.9rem}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:500;font-size:.78rem;text-transform:uppercase}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
tr.click{cursor:pointer}tr.click:hover td{background:var(--panel2)}
.tablewrap{overflow-x:auto}
.badge{display:inline-block;border-radius:999px;padding:1px 8px;font-size:.75rem;border:1px solid var(--line);color:var(--muted)}
.badge.ok{color:var(--good);border-color:var(--good)}.badge.bad{color:var(--bad);border-color:var(--bad)}.badge.warn{color:var(--warn);border-color:var(--warn)}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.unknown{color:var(--warn)}
.hidden{display:none}
footer{color:var(--muted);font-size:.85rem}
footer .panel{margin-top:4px}
.err{color:var(--bad)}
.login{max-width:22rem;margin:14vh auto 0;padding:0 14px}
.login .panel{padding:20px}.login input{width:100%;margin:6px 0 14px}.login button{width:100%;background:var(--accent);border-color:var(--accent);color:#fff}`;

// NOTE: keep this script free of backticks and "${": it lives in a template literal.
export const DASHBOARD_JS = String.raw`(function () {
  "use strict";
  var TZ = "UTC";
  var state = { days: 30, workoutType: "", offset: 0, shown: [], total: 0 };
  var SVGNS = "http://www.w3.org/2000/svg";

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
  function put(id, node) { var el = $(id); clear(el); append(el, node); }

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
  function typeName(t) { if (!t) return "-"; var x = String(t).replace(/_/g, " "); return x.charAt(0).toUpperCase() + x.slice(1); }
  function dateList(start, end) {
    var out = [], d = new Date(start + "T00:00:00Z"), last = new Date(end + "T00:00:00Z");
    while (d <= last && out.length < 400) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); }
    return out;
  }
  function avg(list) { var v = list.filter(isNum); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; }

  // ---- API ----------------------------------------------------------------------------------------------------------
  function api(path) {
    return fetch("/dashboard/api/" + path, { credentials: "same-origin", headers: { accept: "application/json" } }).then(function (r) {
      if (r.status === 401) { window.location.href = "/dashboard/login"; throw new Error("Signed out"); }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  function guard(id, promise) {
    return promise.catch(function (e) { put(id, h("div", { class: "empty err", text: "Could not load: " + (e && e.message ? e.message : "error") })); });
  }
  function empty(text) { return h("div", { class: "empty", text: text }); }

  // ---- charts (inline SVG) ------------------------------------------------------------------------------------------
  function niceStep(raw) {
    var pow = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / pow;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  }
  // opts: { kind: "bar"|"line", points: [{label, v, segs:[{v,color,name}], tip}], color, fmt, mean, emptyText, zero }
  function chart(opts) {
    var pts = opts.points || [], vals = [];
    pts.forEach(function (p) { if (isNum(p.v)) vals.push(p.v); });
    if (!vals.length) return empty(opts.emptyText || "No data in this range");
    var W = 640, H = 210, L = 44, R = 8, T = 10, B = 24, n = pts.length;
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (opts.kind === "bar" || opts.zero) lo = Math.min(0, lo);
    var step = niceStep(Math.max((hi - lo) / 4, 0.0001));
    var ymin = Math.floor(lo / step) * step, ymax = Math.ceil(hi / step) * step;
    if (ymax === ymin) ymax = ymin + step;
    var iw = W - L - R, ih = H - T - B;
    function X(i) { return L + (i + 0.5) * iw / n; }
    function Y(v) { return T + ih - (v - ymin) / (ymax - ymin) * ih; }
    var fmt = opts.fmt || fmtInt;
    var svg = s("svg", { "class": "chart", viewBox: "0 0 " + W + " " + H, role: "img", preserveAspectRatio: "xMidYMid meet" });
    for (var t = ymin; t <= ymax + step / 2; t += step) {
      svg.appendChild(s("line", { x1: L, x2: W - R, y1: Y(t), y2: Y(t), stroke: "currentColor", "stroke-opacity": "0.12" }));
      svg.appendChild(s("text", { x: L - 5, y: Y(t) + 3, "text-anchor": "end", text: fmt(t) }));
    }
    var ticks = Math.min(5, n);
    for (var k = 0; k < ticks; k++) {
      var idx = ticks === 1 ? 0 : Math.round(k * (n - 1) / (ticks - 1));
      svg.appendChild(s("text", { x: X(idx), y: H - 7, "text-anchor": "middle", text: pts[idx].label }));
    }
    if (opts.kind === "bar") {
      var bw = Math.max(1, iw / n * 0.72);
      pts.forEach(function (p, i) {
        if (!isNum(p.v)) return;
        var segs = p.segs && p.segs.length ? p.segs : [{ v: p.v, color: opts.color || "var(--c1)" }];
        var base = 0, g = s("g");
        segs.forEach(function (sg) {
          var y0 = Y(base), y1 = Y(base + sg.v);
          g.appendChild(s("rect", { x: X(i) - bw / 2, y: Math.min(y0, y1), width: bw, height: Math.max(0, Math.abs(y0 - y1)), fill: sg.color }));
          base += sg.v;
        });
        g.appendChild(s("title", { text: p.tip || (p.label + ": " + fmt(p.v)) }));
        svg.appendChild(g);
      });
    } else {
      var d = "", pen = false;
      pts.forEach(function (p, i) {
        if (!isNum(p.v)) { pen = false; return; }
        d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.v).toFixed(1) + " ";
        pen = true;
      });
      svg.appendChild(s("path", { d: d, fill: "none", stroke: opts.color || "var(--c1)", "stroke-width": "2", "stroke-linejoin": "round" }));
      if (n <= 60) {
        pts.forEach(function (p, i) {
          if (!isNum(p.v)) return;
          svg.appendChild(s("circle", { cx: X(i), cy: Y(p.v), r: 2.6, fill: opts.color || "var(--c1)" }, s("title", { text: p.tip || (p.label + ": " + fmt(p.v)) })));
        });
      }
    }
    if (isNum(opts.mean)) {
      svg.appendChild(s("line", { x1: L, x2: W - R, y1: Y(opts.mean), y2: Y(opts.mean), stroke: "var(--warn)", "stroke-dasharray": "4 3", "stroke-opacity": "0.9" }));
      svg.appendChild(s("text", { x: W - R - 2, y: Y(opts.mean) - 3, "text-anchor": "end", text: "avg " + fmt(opts.mean) }));
    }
    return svg;
  }
  function legend(items) {
    return h("div", { class: "legend" }, items.map(function (i) {
      return h("span", null, [s("svg", { width: 10, height: 10, viewBox: "0 0 10 10" }, s("circle", { cx: 5, cy: 5, r: 5, fill: i.color })), " " + i.name]);
    }));
  }
  function stackBar(stageS) {
    if (!stageS) return null;
    var order = [["deep", "var(--deep)"], ["light", "var(--light)"], ["rem", "var(--rem)"], ["awake", "var(--awake)"]];
    var total = 0; order.forEach(function (o) { total += stageS[o[0]] || 0; });
    if (!total) return null;
    var x = 0, svg = s("svg", { viewBox: "0 0 200 8", width: "100%", height: 8, role: "img", preserveAspectRatio: "none" });
    order.forEach(function (o) {
      var w = (stageS[o[0]] || 0) / total * 200;
      if (w > 0) svg.appendChild(s("rect", { x: x, y: 0, width: w, height: 8, fill: o[1] }, s("title", { text: o[0] + " " + fmtDur(stageS[o[0]]) })));
      x += w;
    });
    return svg;
  }

  // ---- overview cards -----------------------------------------------------------------------------------------------
  function card(label, big, unit, sub, extra, onclick) {
    return h("div", { class: "card" + (onclick ? " click" : ""), onclick: onclick || null, tabindex: onclick ? "0" : null }, [
      h("div", { class: "label", text: label }),
      h("div", { class: "big" }, [big, unit ? h("span", { class: "unit", text: " " + unit }) : null]),
      h("div", { class: "sub" }, sub), extra || null
    ]);
  }
  function emptyCard(label, text) { return h("div", { class: "card" }, [h("div", { class: "label", text: label }), h("div", { class: "empty", text: text })]); }
  function when(date, today) { return date && date !== today ? "latest " + shortDate(date) : date ? "today" : ""; }

  function renderOverview(o) {
    if (o.timezone) TZ = o.timezone;
    var el = $("cards"); clear(el);
    if (!o.available) { el.appendChild(h("div", { class: "panel empty", text: "The local database is not available yet. The first sync creates it." })); return; }
    var d = o.daily, sl = o.sleep, c = o.charge, w = o.workout, wt = o.weight, bp = o.blood_pressure, hr = o.resting_hr;
    el.appendChild(d && isNum(d.steps) ? card("Steps", fmtInt(d.steps), "", [when(d.date, o.today) + " | " + fmtKm(d.distance_m) + " | " + fmtInt(d.active_calories_kcal) + " kcal"]) : emptyCard("Steps", "No step data yet"));
    el.appendChild(sl ? card("Sleep", fmtDur(sl.duration_s), "", [(isNum(sl.score) ? "score " + fmtInt(sl.score) + " | " : "") + localTime(sl.started_at) + " - " + localTime(sl.ended_at) + " | " + shortDate(sl.sleep_date)], stackBar(sl.stage_s)) : emptyCard("Sleep", "No sleep data yet"));
    el.appendChild(hr && isNum(hr.resting_hr_bpm) ? card("Resting HR", fmtInt(hr.resting_hr_bpm), "bpm", [when(hr.date, o.today)]) : emptyCard("Resting HR", "No heart-rate data"));
    if (c && isNum(c.last)) {
      var gauge = s("svg", { viewBox: "0 0 100 6", width: "100%", height: 6, preserveAspectRatio: "none", role: "img" }, [
        s("rect", { x: 0, y: 0, width: 100, height: 6, rx: 3, fill: "var(--line)" }),
        s("rect", { x: 0, y: 0, width: Math.max(0, Math.min(100, c.last)), height: 6, rx: 3, fill: "var(--c3)" })]);
      el.appendChild(card("Hybrid Charge", fmtInt(c.last), "/ 100", [when(c.date, o.today) + " | avg " + fmtInt(c.avg) + ", " + fmtInt(c.min) + " - " + fmtInt(c.max)], gauge));
    } else el.appendChild(emptyCard("Hybrid Charge", "No Hybrid Charge data"));
    el.appendChild(w ? card("Last workout", typeName(w.activity_type), "", [shortDate(w.started_date) + " | " + fmtDur(w.duration_s) + (isNum(w.distance_m) && w.distance_m > 0 ? " | " + fmtKm(w.distance_m) : "")], null, function () { openDetail(w.workout_id); }) : emptyCard("Last workout", "No workouts yet"));
    el.appendChild(wt ? card("Weight", fmt1(wt.weight_kg), "kg", [shortDate(wt.date) + (isNum(wt.bmi) ? " | BMI " + fmt1(wt.bmi) : "")]) : emptyCard("Weight", "No weigh-ins"));
    el.appendChild(bp ? card("Blood pressure", fmtInt(bp.systolic_mmhg) + "/" + fmtInt(bp.diastolic_mmhg), "mmHg", [shortDate(bp.date) + (isNum(bp.pulse_bpm) ? " | pulse " + fmtInt(bp.pulse_bpm) : "")]) : emptyCard("Blood pressure", "No blood pressure readings"));
  }

  // ---- trends -------------------------------------------------------------------------------------------------------
  function renderTrends(t) {
    if (t.timezone) TZ = t.timezone;
    if (!t.available) { ["steps", "sleep", "rhr", "charge", "weight-chart"].forEach(function (id) { put(id, empty("No data yet")); }); return; }
    var days = dateList(t.start, t.end);
    var dailyBy = {}; t.daily.forEach(function (r) { dailyBy[r.date] = r; });
    var steps = days.map(function (dt) { var r = dailyBy[dt]; var v = r && isNum(r.steps) && r.steps > 0 ? r.steps : null; return { label: shortDate(dt), v: v, tip: shortDate(dt) + ": " + fmtInt(v) + " steps" }; });
    put("steps", [chart({ kind: "bar", points: steps, color: "var(--c1)", mean: avg(steps.map(function (p) { return p.v; })), emptyText: "No step data in this range" })]);

    var sleepBy = {}; t.sleep.forEach(function (r) { sleepBy[r.sleep_date] = r; });
    var stageColors = { deep: "var(--deep)", light: "var(--light)", rem: "var(--rem)", awake: "var(--awake)" };
    var sleep = days.map(function (dt) {
      var r = sleepBy[dt]; if (!r) return { label: shortDate(dt), v: null };
      var hrs = r.duration_s / 3600, segs = null;
      if (r.stage_s) {
        segs = ["deep", "light", "rem", "awake"].map(function (k) { return { v: (r.stage_s[k] || 0) / 3600, color: stageColors[k], name: k }; }).filter(function (x) { return x.v > 0; });
        var sum = segs.reduce(function (a, b) { return a + b.v; }, 0);
        if (sum > hrs * 1.02 || sum < hrs * 0.5) segs = null;
      }
      return { label: shortDate(dt), v: hrs, segs: segs, tip: shortDate(dt) + ": " + fmtDur(r.duration_s) + (isNum(r.score) ? " (score " + fmtInt(r.score) + ")" : "") };
    });
    put("sleep", [chart({ kind: "bar", points: sleep, fmt: fmt1, mean: avg(sleep.map(function (p) { return p.v; })), emptyText: "No sleep data in this range" }),
      legend([{ name: "deep", color: stageColors.deep }, { name: "light", color: stageColors.light }, { name: "REM", color: stageColors.rem }, { name: "awake", color: stageColors.awake }]),
      h("div", { class: "sub", text: "Hours asleep per night" })]);

    var rhr = days.map(function (dt) { var r = dailyBy[dt]; var v = r && isNum(r.resting_hr_bpm) ? r.resting_hr_bpm : null; return { label: shortDate(dt), v: v, tip: shortDate(dt) + ": " + fmtInt(v) + " bpm" }; });
    put("rhr", chart({ kind: "line", points: rhr, color: "var(--c4)", emptyText: "No resting heart-rate data in this range" }));

    var chargeBy = {}; t.charge.forEach(function (r) { chargeBy[r.date] = r; });
    var charge = days.map(function (dt) {
      var r = chargeBy[dt]; if (!r) return { label: shortDate(dt), v: null };
      return { label: shortDate(dt), v: r.avg, tip: shortDate(dt) + ": avg " + fmtInt(r.avg) + ", min " + fmtInt(r.min) + ", max " + fmtInt(r.max) + ", end " + fmtInt(r.last) };
    });
    put("charge", [chart({ kind: "line", points: charge, color: "var(--c3)", zero: true, emptyText: "No Hybrid Charge data in this range" }), h("div", { class: "sub", text: "Daily average (hover a point for min, max and end-of-day)" })]);

    var bpNode = $("bp");
    clear(bpNode);
    if (t.blood_pressure && t.blood_pressure.length) {
      bpNode.appendChild(h("h3", { text: "Blood pressure" }));
      bpNode.appendChild(table(["Date", "Time", "Sys/Dia", "Pulse"], t.blood_pressure.slice(-15).reverse().map(function (r) { return [shortDate(r.date), localTime(r.measured_at), fmtInt(r.systolic_mmhg) + "/" + fmtInt(r.diastolic_mmhg), fmtInt(r.pulse_bpm)]; }), [2, 3]));
    }
    var stress = $("stress"); clear(stress);
    if (t.stress && t.stress.length) {
      stress.appendChild(h("h3", { text: "Stress / emotion events (daily average)" }));
      stress.appendChild(table(["Date", "Source", "Average", "Events"], t.stress.slice(-15).reverse().map(function (r) { return [shortDate(r.date), r.source, fmt1(r.avg), fmtInt(r.n)]; }), [2, 3]));
    }
  }

  function table(heads, rows, numCols, onRow) {
    numCols = numCols || [];
    var thead = h("thead", null, h("tr", null, heads.map(function (x, i) { return h("th", { class: numCols.indexOf(i) >= 0 ? "n" : null, text: x }); })));
    var tbody = h("tbody", null, rows.map(function (r, ri) {
      var cells = r.cells || r;
      var tr = h("tr", { class: onRow ? "click" : null, tabindex: onRow ? "0" : null, onclick: onRow ? function () { onRow(ri); } : null },
        cells.map(function (c, i) { return h("td", { class: numCols.indexOf(i) >= 0 ? "n" : null }, c === null || c === undefined ? "-" : c); }));
      return tr;
    }));
    return h("div", { class: "tablewrap" }, h("table", null, [thead, tbody]));
  }

  // ---- charge intraday ----------------------------------------------------------------------------------------------
  function loadCharge(date) {
    return api("charge?days=" + state.days + (date ? "&date=" + encodeURIComponent(date) : "")).then(function (c) {
      if (c.timezone) TZ = c.timezone;
      var input = $("charge-date");
      var list = (c.days_data || []);
      if (!date && list.length) { date = list[list.length - 1].date; input.value = date; return loadCharge(date); }
      if (!date) { put("charge-day", empty("No Hybrid Charge data")); return; }
      var pts = (c.samples || []).map(function (r) { var lab = localTime(new Date(r.t).toISOString()); return { label: lab, v: r.total, tip: lab + ": " + fmtInt(r.total) + " (mental " + fmt1(r.mental) + ", physical " + fmt1(r.physical) + ")" }; });
      var kids = [chart({ kind: "line", points: pts, color: "var(--c3)", zero: true, emptyText: "No samples on " + date })];
      if (c.insights && c.insights.length) kids.push(h("div", { class: "sub", text: c.insights.length + " insight event(s) recorded this day" }));
      put("charge-day", kids);
    });
  }

  // ---- weight -------------------------------------------------------------------------------------------------------
  function renderWeight(w) {
    if (w.timezone) TZ = w.timezone;
    var recs = w.records || [];
    if (!recs.length) { put("weight-chart", empty("No weigh-ins in this range")); put("weight-table", null); return; }
    var pts = recs.map(function (r) { return { label: shortDate(r.date), v: r.weight_kg, tip: shortDate(r.date) + " " + localTime(r.measured_at) + ": " + fmt1(r.weight_kg) + " kg" }; });
    put("weight-chart", chart({ kind: "line", points: pts, fmt: fmt1, color: "var(--c2)" }));
    put("weight-table", table(["Date", "Time", "Weight", "BMI"], recs.slice(-15).reverse().map(function (r) { return [shortDate(r.date), localTime(r.measured_at), fmt1(r.weight_kg) + " kg", fmt1(r.bmi)]; }), [2, 3]));
  }

  // ---- workouts -----------------------------------------------------------------------------------------------------
  function loadWorkouts(reset) {
    if (reset) { state.offset = 0; state.shown = []; }
    var q = "workouts?limit=25&offset=" + state.offset + (state.workoutType ? "&type=" + encodeURIComponent(state.workoutType) : "");
    return api(q).then(function (r) {
      if (r.timezone) TZ = r.timezone;
      state.total = r.total;
      state.shown = state.shown.concat(r.workouts || []);
      state.offset = state.shown.length;
      var sel = $("wtype");
      if (sel.options.length <= 1 && r.types) r.types.forEach(function (t) { sel.appendChild(h("option", { value: t.type, text: typeName(t.type) + " (" + t.n + ")" })); });
      var box = $("workouts-body"); clear(box);
      if (!state.shown.length) { box.appendChild(empty("No workouts yet")); $("more").classList.add("hidden"); return; }
      box.appendChild(table(["Date", "Type", "Duration", "Distance", "kcal", "Avg HR", ""], state.shown.map(function (w) {
        return [shortDate(w.started_date) + " " + localTime(w.started_at), typeName(w.activity_type), fmtDur(w.duration_s), fmtKm(w.distance_m), fmtInt(w.calories_kcal), fmtInt(w.avg_hr_bpm), w.strength_sets > 0 ? h("span", { class: "badge", text: w.strength_sets + " sets" }) : null];
      }), [2, 3, 4, 5], function (i) { openDetail(state.shown[i].workout_id); }));
      $("more").classList.toggle("hidden", state.shown.length >= state.total);
      $("workouts-count").textContent = state.shown.length + " of " + state.total;
    });
  }

  function exerciseCell(name, known, id) {
    return known ? name : h("span", { class: "unknown mono", title: "Unmapped exercise id " + id }, name);
  }
  function openDetail(id) {
    var panel = $("detail"); panel.classList.remove("hidden");
    put("detail-body", empty("Loading..."));
    panel.scrollIntoView({ block: "start" });
    api("workouts/" + encodeURIComponent(id)).then(function (r) {
      if (r.timezone) TZ = r.timezone;
      var w = r.workout, kids = [];
      kids.push(h("div", { class: "cards" }, [
        card("Type", typeName(w.activity_type), "", [shortDate(w.started_date) + " " + localTime(w.started_at) + " - " + localTime(w.ended_at)]),
        card("Duration", fmtDur(w.duration_s), "", [isNum(w.distance_m) && w.distance_m > 0 ? fmtKm(w.distance_m) : ""]),
        card("Heart rate", fmtInt(w.avg_hr_bpm), "bpm avg", ["max " + fmtInt(w.max_hr_bpm)]),
        card("Energy", fmtInt(w.calories_kcal), "kcal", [isNum(w.training_load) ? "load " + fmtInt(w.training_load) : ""])
      ]));
      if (r.sets && r.sets.length) {
        var volume = 0; r.sets.forEach(function (x) { if (isNum(x.weight_kg) && x.weight_kg > 0 && isNum(x.reps)) volume += x.weight_kg * x.reps; });
        kids.push(h("h3", { text: "Strength sets (" + r.sets.length + ", volume " + fmtInt(volume) + " kg)" }));
        kids.push(table(["#", "Exercise", "Reps", "Weight", "Time", "Avg HR"], r.sets.map(function (x) {
          return [fmtInt(x.set_no + 1), exerciseCell(x.exercise, x.known, x.action_type), fmtInt(x.reps), isNum(x.weight_kg) && x.weight_kg > 0 ? fmt1(x.weight_kg) + " kg" : "bodyweight", fmtDur(x.duration_s), fmtInt(x.avg_hr_bpm)];
        }), [0, 2, 3, 4, 5]));
      } else if (w.activity_type === "strength_training" || w.activity_type === "strength") {
        kids.push(empty("No strength sets stored for this workout"));
      }
      put("detail-body", kids);
    }).catch(function (e) { put("detail-body", h("div", { class: "empty err", text: "Could not load: " + e.message })); });
  }

  // ---- exercises ----------------------------------------------------------------------------------------------------
  function renderExercises(r) {
    var list = r.exercises || [];
    if (!list.length) { put("exercises-body", empty("No strength sets stored yet")); return; }
    var note = r.unknown_count ? h("p", { class: "sub" }, [h("span", { class: "badge warn", text: r.unknown_count + " unmapped" }), " Add these ids to ", h("code", { text: "src/zepp/strength-exercises.ts" }), " after checking them in the Zepp app. The example workout shows where each was logged."]) : h("p", { class: "sub", text: "Every exercise id has a name." });
    put("exercises-body", [note, table(["Id", "Name", "Sets", "Workouts", "Last seen", "Avg reps", "Max kg", "Example"], list.map(function (e) {
      return [String(e.action_type), exerciseCell(e.name, e.known, e.action_type), fmtInt(e.sets), fmtInt(e.workouts), shortDate(e.last_date), fmt1(e.avg_reps), isNum(e.max_weight_kg) && e.max_weight_kg > 0 ? fmt1(e.max_weight_kg) : "-",
        h("button", { onclick: function () { openDetail(e.example_workout_id); }, text: "Open" })];
    }), [0, 2, 3, 5, 6]), h("div", { class: "sub", text: "Unmapped ids appear as unknown_<id>; hint columns (reps, weight) help identify the exercise." })]);
  }

  // ---- sync status footer -------------------------------------------------------------------------------------------
  function renderStatus(st) {
    if (st.timezone) TZ = st.timezone;
    if (!st.available) { put("status-body", empty("Local database not available yet")); return; }
    var last = st.last_run, ok = st.last_success, kids = [];
    var okAt = ok && ok.finished_at ? ok.finished_at : null;
    var ageH = okAt ? (Date.parse(st.now) - Date.parse(okAt)) / 3600000 : null;
    var badge = !last ? h("span", { class: "badge", text: "never synced" })
      : last.ok ? h("span", { class: "badge " + (ageH !== null && ageH > 36 ? "warn" : "ok"), text: ageH !== null && ageH > 36 ? "ok, but stale" : "ok" })
      : last.status === "running" ? h("span", { class: "badge warn", text: "running" })
      : h("span", { class: "badge bad", text: "failed" + (last.error_kind ? " (" + last.error_kind + ")" : "") });
    kids.push(h("div", null, ["Last sync: ", badge, " ", okAt ? "last success " + localDateTime(okAt) : "no successful sync yet",
      last ? " | last run " + localDateTime(last.started_at) + " (" + last.trigger + ", " + shortDate(last.range_start) + " to " + shortDate(last.range_end) + ")" : "",
      st.sync && st.sync.next_run_at ? " | next " + localDateTime(st.sync.next_run_at) : ""]));
    kids.push(table(["Data", "Rows", "First", "Last"], st.coverage.map(function (c) { return [c.table.replace(/_/g, " "), fmtInt(c.rows), c.first ? shortDate(c.first) + " " + c.first.slice(0, 4) : "-", c.last ? shortDate(c.last) + " " + c.last.slice(0, 4) : "-"]; }), [1]));
    kids.push(h("div", { class: "sub", text: "Strength sets " + fmtInt(st.strength_sets) + " | charge insights " + fmtInt(st.charge_insights) + " | schema v" + st.schema_version + " | database " + (isNum(st.db_bytes) ? (st.db_bytes / 1048576).toFixed(1) + " MB" : "-") + " | times in " + TZ }));
    put("status-body", kids);
  }

  // ---- wiring -------------------------------------------------------------------------------------------------------
  function loadTrendsAndWeight() {
    return Promise.all([
      guard("steps", api("trends?days=" + state.days).then(renderTrends)),
      guard("weight-chart", api("weight?days=" + Math.max(state.days, 90)).then(renderWeight)),
      guard("charge-day", loadCharge($("charge-date").value || ""))
    ]);
  }
  function init() {
    [30, 90, 180].forEach(function (d) {
      $("range").appendChild(h("button", { "data-days": d, class: d === state.days ? "on" : "", text: d + " days", onclick: function (ev) {
        state.days = d;
        Array.prototype.forEach.call($("range").children, function (b) { b.classList.toggle("on", b === ev.currentTarget); });
        $("charge-date").value = "";
        loadTrendsAndWeight();
      } }));
    });
    $("wtype").addEventListener("change", function (ev) { state.workoutType = ev.target.value; guard("workouts-body", loadWorkouts(true)); });
    $("more").addEventListener("click", function () { guard("workouts-body", loadWorkouts(false)); });
    $("charge-date").addEventListener("change", function (ev) { guard("charge-day", loadCharge(ev.target.value)); });
    $("detail-close").addEventListener("click", function () { $("detail").classList.add("hidden"); });
    guard("cards", api("overview").then(renderOverview));
    loadTrendsAndWeight();
    guard("workouts-body", loadWorkouts(true));
    guard("exercises-body", api("exercises").then(renderExercises));
    guard("status-body", api("status").then(renderStatus));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();`;

const HEAD = (nonce: string, title: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="dark light"><title>${escapeHtml(title)}</title>` +
  `<style nonce="${escapeHtml(nonce)}">${CSS}</style></head>`;

export function renderLoginHtml(opts: { nonce: string; csrf: string; error?: string; locked?: boolean }): string {
  return `${HEAD(opts.nonce, "Zepp dashboard - sign in")}<body><main class="login"><div class="panel">` +
    `<h1>Zepp dashboard</h1><p class="sub">Read-only view of your synced Zepp data.</p>` +
    (opts.error ? `<p class="err" role="alert">${escapeHtml(opts.error)}</p>` : "") +
    `<form method="post" action="/dashboard/login" autocomplete="off">` +
    `<input type="hidden" name="csrf" value="${escapeHtml(opts.csrf)}">` +
    `<label class="label" for="pw">Owner password</label>` +
    `<input id="pw" type="password" name="password" required autofocus autocomplete="current-password"${opts.locked ? " disabled" : ""}>` +
    `<button type="submit"${opts.locked ? " disabled" : ""}>Sign in</button></form></div></main></body></html>`;
}

export function renderDashboardHtml(nonce: string): string {
  const n = escapeHtml(nonce);
  return `${HEAD(nonce, "Zepp dashboard")}<body><main>` +
    `<header class="top"><h1>Zepp dashboard</h1><div class="bar"><div id="range" class="bar" role="group" aria-label="Range"></div>` +
    `<form method="post" action="/dashboard/logout"><button type="submit">Log out</button></form></div></header>` +
    `<section id="detail" class="panel hidden"><div class="bar"><h2>Workout</h2><button id="detail-close" type="button">Close</button></div><div id="detail-body"></div></section>` +
    `<div id="cards" class="cards"><div class="empty">Loading...</div></div>` +
    `<div class="grid2">` +
    `<section class="panel"><h2>Steps</h2><div id="steps"><div class="empty">Loading...</div></div></section>` +
    `<section class="panel"><h2>Sleep</h2><div id="sleep"></div></section>` +
    `<section class="panel"><h2>Resting heart rate</h2><div id="rhr"></div></section>` +
    `<section class="panel"><h2>Hybrid Charge</h2><div id="charge"></div></section>` +
    `</div>` +
    `<section class="panel"><h2>Hybrid Charge, one day</h2><div class="bar"><label class="sub" for="charge-date">Day</label><input id="charge-date" type="date"></div><div id="charge-day"></div></section>` +
    `<section class="panel"><h2>Weight</h2><div id="weight-chart"></div><div id="weight-table"></div></section>` +
    `<section class="panel"><h2>Workouts <span id="workouts-count" class="sub"></span></h2><div class="bar"><label class="sub" for="wtype">Type</label>` +
    `<select id="wtype"><option value="">All types</option></select></div><div id="workouts-body"><div class="empty">Loading...</div></div>` +
    `<div class="bar"><button id="more" type="button" class="hidden">Load more</button></div></section>` +
    `<section class="panel"><h2>Strength exercises</h2><div id="exercises-body"></div></section>` +
    `<div id="bp"></div><div id="stress"></div>` +
    `<footer><section class="panel"><h2>Sync status</h2><div id="status-body"></div></section></footer>` +
    `</main><script nonce="${n}">${DASHBOARD_JS}</script></body></html>`;
}
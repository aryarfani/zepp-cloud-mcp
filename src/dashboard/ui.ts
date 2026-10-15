// Self-contained dashboard HTML: inline CSS and JavaScript (allowed by a per-response CSP nonce), no external requests.
// Layout: left sidebar + hash-routed views. The client script builds every node with DOM APIs (textContent), never innerHTML.
import { escapeHtml } from "../oauth";

const CSS = String.raw`:root{color-scheme:dark;--bg:#0a0c11;--side:#0d1016;--panel:#12161e;--panel2:#181d27;--panel3:#1e2431;--line:#212836;--line2:#2d3648;--text:#e8ecf3;--muted:#8b94a7;--faint:#5b6479;--teal:#2dd4bf;--purple:#a78bfa;--violet:#a78bfa;--coral:#fb7185;--blue:#60a5fa;--cyan:#22d3ee;--good:#34d399;--warn:#f5b25e;--bad:#fb7185;--deep:#7c6af0;--light:#4cc9b0;--rem:#c4a7ff;--awake:#f0a35e;--r:14px;--r-sm:10px;--side-w:236px;--shadow:0 1px 0 rgba(255,255,255,.03) inset,0 10px 28px -14px rgba(0,0,0,.7);--grad:linear-gradient(135deg,#2dd4bf,#a78bfa);--ease:cubic-bezier(.2,.7,.2,1)}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:radial-gradient(1100px 520px at 88% -12%,rgba(45,212,191,.075),transparent 60%),radial-gradient(900px 520px at -5% 0,rgba(167,139,250,.07),transparent 55%),var(--bg);background-attachment:fixed;color:var(--text);font:14.5px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
h1,h2,p{margin:0}
:focus-visible{outline:2px solid var(--teal);outline-offset:2px;border-radius:8px}
::selection{background:rgba(45,212,191,.3)}
.app{display:flex;min-height:100%}
.side{width:var(--side-w);flex:none;background:linear-gradient(180deg,rgba(255,255,255,.015),transparent 30%),var(--side);border-right:1px solid var(--line);padding:14px 10px;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;height:100dvh;transition:width .22s var(--ease);z-index:5}
.brand{display:flex;align-items:center;gap:10px;font-size:1.1rem;font-weight:650;padding:4px 6px 16px;letter-spacing:.01em;min-height:52px}
.brand .bname{flex:1;white-space:nowrap}
.brand .logo{width:30px;height:30px;flex:none;border-radius:10px;background:var(--grad);display:grid;place-items:center;color:#0a0d12;font-weight:800;font-size:.95rem;box-shadow:0 6px 18px -6px rgba(45,212,191,.6)}
.collapse{flex:none;width:28px;height:28px;padding:0;display:grid;place-items:center;border-radius:9px;background:var(--panel2);border:1px solid var(--line);color:var(--muted);cursor:pointer;transition:transform .22s var(--ease),color .15s,border-color .15s}
.collapse:hover{color:var(--text);border-color:var(--line2)}
.collapse svg{width:16px;height:16px}
nav.menu{display:flex;flex-direction:column;gap:2px;flex:1}
nav.menu a{position:relative;display:flex;align-items:center;gap:12px;padding:9px 11px;border-radius:10px;color:var(--muted);transition:background .15s,color .15s;white-space:nowrap}
nav.menu a:hover{background:var(--panel2);color:var(--text)}
nav.menu a.active{background:linear-gradient(90deg,rgba(45,212,191,.16),rgba(167,139,250,.08));color:var(--text);box-shadow:inset 0 0 0 1px rgba(45,212,191,.22)}
nav.menu a.active svg{color:var(--teal)}
svg.ico{width:19px;height:19px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.side form{margin:0}
.logout{width:100%;display:flex;align-items:center;gap:12px;padding:9px 11px;border-radius:10px;background:none;border:0;color:var(--muted);font:inherit;cursor:pointer;text-align:left;white-space:nowrap}
.logout:hover{background:var(--panel2);color:var(--bad);border-color:transparent}
.content{flex:1;min-width:0;display:flex;flex-direction:column}
.topbar{display:flex;align-items:flex-end;gap:14px;padding:22px clamp(14px,2vw,32px) 10px}
.topbar .ttl{flex:1;min-width:0}
.topbar h1{font-size:1.5rem;font-weight:650;letter-spacing:-.015em;line-height:1.2}
.subtitle{color:var(--muted);font-size:.88rem;margin-top:2px}
.hamb{display:none;background:var(--panel2);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:7px;cursor:pointer}
#view{padding:8px clamp(14px,2vw,32px) 40px;width:100%;max-width:none;min-width:0}
.scrim{display:none}
button,select,input{font:inherit;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:var(--r-sm);padding:7px 13px;transition:border-color .15s,background .15s,color .15s,box-shadow .15s}
button{cursor:pointer}button:hover{border-color:var(--line2);background:var(--panel3)}
input:hover,select:hover{border-color:var(--line2)}
input:focus-visible,select:focus-visible{outline:none;border-color:var(--teal);box-shadow:0 0 0 3px rgba(45,212,191,.18)}
button.on{background:var(--grad);border-color:transparent;color:#071210;font-weight:650}
.seg{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.seg button{border-radius:999px;padding:5px 13px;font-size:.84rem}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(clamp(190px,15vw,270px),1fr));gap:12px;margin:6px 0 14px}
.card,.panel{background:linear-gradient(180deg,rgba(255,255,255,.02),transparent 60%),var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px;box-shadow:var(--shadow)}
.card{min-height:104px;transition:transform .18s var(--ease),border-color .18s,box-shadow .18s}
.card.click{cursor:pointer}.card.click:hover{border-color:rgba(45,212,191,.5);transform:translateY(-2px);box-shadow:0 14px 30px -16px rgba(45,212,191,.35)}
.panel{margin:0 0 14px}
.panel h2{font-size:.95rem;margin:0 0 12px;font-weight:600;letter-spacing:-.005em}
.label{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.07em;font-weight:550}
.label svg{width:15px;height:15px;stroke-width:1.9;color:var(--teal)}
.big{font-size:1.75rem;font-weight:650;margin:5px 0 2px;line-height:1.15;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.unit{font-size:.85rem;color:var(--muted);font-weight:450;letter-spacing:0}
.sub{color:var(--muted);font-size:.84rem}
.empty{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;color:var(--muted);padding:26px 10px}
.empty svg{width:28px;height:28px;stroke-width:1.5;color:var(--faint)}
.empty.err{color:var(--bad)}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:14px}
.panel{min-width:0}
.chartwrap{position:relative}
svg.chart{width:100%;height:auto;display:block;touch-action:manipulation;overflow:visible}
svg.chart text{fill:var(--faint);font-size:10px}
.tip{position:absolute;pointer-events:none;background:rgba(10,12,17,.94);border:1px solid var(--line2);border-radius:9px;padding:5px 10px;font-size:.78rem;white-space:nowrap;transform:translate(-50%,-125%);z-index:3;box-shadow:0 8px 20px -8px rgba(0,0,0,.8)}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:.8rem;color:var(--muted);margin-top:8px}
table{width:100%;border-collapse:collapse;font-size:.88rem}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
tbody tr{transition:background .12s}tbody tr:hover{background:rgba(255,255,255,.025)}
tbody tr:last-child td{border-bottom:0}
th{color:var(--muted);font-weight:550;font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;position:sticky;top:0;background:var(--panel)}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.tablewrap{overflow-x:auto}
.pbar{display:inline-block;width:56px;margin-right:8px;vertical-align:middle}
.pbar svg{display:block;width:100%;height:5px}
.badge{display:inline-block;border-radius:999px;padding:1px 9px;font-size:.72rem;border:1px solid var(--line2);color:var(--muted);line-height:1.55}
.badge.tiny{padding:0 6px;font-size:.62rem;line-height:1.5;text-transform:uppercase;letter-spacing:.04em}
.badge.ok{color:var(--good);border-color:rgba(52,211,153,.5)}.badge.bad{color:var(--bad);border-color:rgba(251,113,133,.5)}.badge.warn{color:var(--warn);border-color:rgba(245,178,94,.5)}
a.badge:hover{border-color:var(--teal);color:var(--text)}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.unknown{color:var(--warn)}
.hidden{display:none}
.err{color:var(--bad)}
.sk{border-radius:10px;background:linear-gradient(90deg,var(--panel) 0%,var(--panel2) 40%,var(--panel) 80%);background-size:220% 100%;animation:shimmer 1.4s linear infinite}
@keyframes shimmer{from{background-position:120% 0}to{background-position:-120% 0}}
.skel .cards{margin-top:6px}
.skel .sk.c{height:104px;border-radius:var(--r)}.skel .sk.p{height:230px;border-radius:var(--r)}.skel .sk.l{height:14px;margin:8px 0}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.split{display:grid;grid-template-columns:minmax(300px,clamp(300px,25vw,430px)) minmax(0,1fr);gap:14px;align-items:start}
.wlist-pane{display:flex;flex-direction:column;min-height:0;min-width:0;background:linear-gradient(180deg,rgba(255,255,255,.02),transparent 40%),var(--panel);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:10px 8px 4px 10px}
.wfilter{display:flex;gap:8px;padding:0 2px 8px 0;align-items:stretch}
.wsearch-wrap{flex:1;min-width:0}
.wsearch{width:100%;padding:8px 12px 8px 34px;background:var(--panel2);border-radius:11px}
.wsearch-wrap{position:relative}
.wsearch-wrap svg{position:absolute;left:11px;top:50%;margin-top:-8px;width:16px;height:16px;color:var(--faint);pointer-events:none}
.wtype-wrap{position:relative;flex:none;width:132px}
.wtype{width:100%;appearance:none;-webkit-appearance:none;padding:8px 28px 8px 11px;background:var(--panel2);border-radius:11px;color:var(--text);font:inherit;font-size:.84rem;text-overflow:ellipsis;cursor:pointer}
.wtype option{background:#12161d;color:var(--text)}
.wtype-wrap svg{position:absolute;right:9px;top:50%;margin-top:-7px;width:14px;height:14px;color:var(--faint);pointer-events:none;transform:rotate(-90deg)}
.wmeta{padding:0 4px 6px 2px;font-size:.78rem}
.wlist{flex:1;min-height:0;display:flex;flex-direction:column;gap:2px;overflow-y:auto;position:relative;padding:0 4px 8px 0;overscroll-behavior:contain;scrollbar-width:thin}
.wdetail{min-width:0;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding-right:4px;scrollbar-width:thin}
.wend{flex:none;text-align:center;padding:10px 0;min-height:38px;font-size:.8rem}
.content.fit{height:100vh;height:100dvh;overflow:hidden}
.content.fit #view{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;padding-bottom:16px}
.content.fit .split{flex:1;min-height:0;grid-template-rows:minmax(0,1fr);align-items:stretch}
.sico{flex:none;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:var(--c,#8b94a7);background:rgba(255,255,255,.06);background:color-mix(in srgb,var(--c,#8b94a7) 15%,transparent)}
.sico svg{width:17px;height:17px}
.sico.lg{width:46px;height:46px;border-radius:13px}.sico.lg svg{width:25px;height:25px}
.f-run{--c:#34d399}.f-walk{--c:#a78bfa}.f-bike{--c:#60a5fa}.f-swim{--c:#22d3ee}.f-str{--c:#fb7185}.f-tm{--c:#2dd4bf}.f-gen{--c:#f5b25e}
.wrow{flex:none;display:flex;align-items:center;gap:10px;padding:6px 8px;min-height:46px;border-radius:11px;border:1px solid transparent;transition:background .12s,border-color .12s}
.wrow:hover{background:var(--panel2)}
.wrow.sel{background:linear-gradient(90deg,rgba(45,212,191,.14),rgba(167,139,250,.07));border-color:rgba(45,212,191,.4)}
.wmain{flex:1;min-width:0}
.wrow .t{font-weight:580;font-size:.88rem;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wrow .sub{font-size:.74rem;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wrow .r{text-align:right;color:var(--muted);font-size:.78rem;white-space:nowrap;line-height:1.3;font-variant-numeric:tabular-nums}
.wrow .r .pv{color:var(--text);font-weight:650;font-size:.9rem}
.wrow .r .sv{font-size:.72rem;color:var(--faint)}
.hero{display:flex;align-items:center;gap:14px;padding:16px 18px;margin-bottom:12px;border-radius:var(--r);border:1px solid var(--line2);background:radial-gradient(520px 160px at 100% 0,rgba(45,212,191,.18),transparent 70%),radial-gradient(420px 160px at 0 100%,rgba(167,139,250,.14),transparent 70%),var(--panel);box-shadow:var(--shadow)}
.hero .htxt{flex:1;min-width:0}
.hero h2{font-size:1.25rem;font-weight:650;letter-spacing:-.015em;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.hero .sub{margin-top:2px}
.back{display:none;margin-bottom:10px;color:var(--teal)}
.wa{margin-top:2px}
.wdetail .cards{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.zones{display:flex;flex-direction:column;gap:11px;padding-top:4px}
.zrow{display:grid;grid-template-columns:minmax(84px,110px) minmax(0,1fr) minmax(86px,120px);gap:10px;align-items:center;font-size:.8rem}
.zrow .n{text-align:right;font-variant-numeric:tabular-nums}
.mapbox{position:relative;height:clamp(260px,42vh,440px);border-radius:12px;overflow:hidden;background:#0b0e14;border:1px solid var(--line);touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}
.mapbox.drag{cursor:grabbing}
.mapbox.plain{background:radial-gradient(600px 300px at 30% 20%,rgba(45,212,191,.08),transparent 70%),linear-gradient(180deg,#0b0e14,#0e121a)}
.mapbox:focus-visible{outline-offset:-2px}
.maptiles{position:absolute;inset:0;filter:invert(.92) hue-rotate(180deg) saturate(.7) brightness(.85) contrast(.95)}
.maptiles img{position:absolute;width:256px;height:256px;max-width:none;display:block;-webkit-user-drag:none}
svg.route{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}
.mapctl{position:absolute;top:10px;right:10px;display:flex;flex-direction:column;gap:6px;z-index:2}
.mapctl button{width:30px;height:30px;padding:0;display:grid;place-items:center;font-size:1.05rem;line-height:1;background:rgba(18,22,30,.88);backdrop-filter:blur(4px)}
.mapattr{position:absolute;right:0;bottom:0;z-index:2;font-size:.68rem;padding:2px 7px;background:rgba(10,12,17,.78);color:var(--muted);border-top-left-radius:8px}
.mapattr a{color:var(--text);text-decoration:underline}
.mapnote{position:absolute;left:10px;bottom:8px;z-index:2;font-size:.72rem;color:var(--muted);background:rgba(10,12,17,.78);padding:2px 8px;border-radius:8px}
.maphead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.maphead h2{margin:0}
.maphead button{padding:3px 11px;font-size:.78rem;border-radius:999px}
.login{max-width:23rem;margin:14vh auto 0;padding:0 14px}
.login .panel{padding:24px}.login h1{font-size:1.4rem;margin-bottom:4px}.login input{width:100%;margin:6px 0 14px}.login button{width:100%;background:var(--grad);border-color:transparent;color:#071210;font-weight:650;padding:9px}
@media (min-width:821px){
.app.collapsed{--side-w:64px}
.app.collapsed .side{padding:14px 8px;overflow:visible}
.app.collapsed .side span,.app.collapsed .brand .bname{display:none}
.app.collapsed .brand{flex-direction:column;gap:12px;padding:4px 0 14px;align-items:center}
.app.collapsed .collapse{transform:rotate(180deg)}
.app.collapsed nav.menu a,.app.collapsed .logout{justify-content:center;padding:10px 0}
.app.collapsed nav.menu a:hover::after,.app.collapsed nav.menu a:focus-visible::after,.app.collapsed .logout:hover::after{content:attr(data-tip);position:absolute;left:calc(100% + 12px);top:50%;transform:translateY(-50%);background:rgba(10,12,17,.96);border:1px solid var(--line2);color:var(--text);font-size:.8rem;padding:4px 10px;border-radius:8px;white-space:nowrap;pointer-events:none;box-shadow:0 8px 20px -8px rgba(0,0,0,.8);z-index:30}
.logout{position:relative}
}
@media (max-width:820px){
.side{position:fixed;left:0;top:0;z-index:20;width:240px;transform:translateX(-102%);transition:transform .2s ease;box-shadow:0 0 30px rgba(0,0,0,.5)}
.side.open{transform:none}
.collapse{display:none}
.scrim.open{display:block;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10}
.hamb{display:inline-flex}
.topbar{padding:14px 14px 6px;flex-wrap:wrap;align-items:center}.topbar h1{font-size:1.2rem}
#view{padding:8px 14px 30px}
.split{grid-template-columns:1fr}
.split.has-detail .wlist-pane{display:none}
.split:not(.has-detail) .wdetail{display:none}
.back{display:inline-block}
.grid2{grid-template-columns:1fr}
.mapbox{height:300px}
}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}}`;

// NOTE: keep this script free of backticks and "${": it lives in a template literal.
export const DASHBOARD_JS = String.raw`(function () {
  "use strict";
  var TZ = "UTC";
  var SVGNS = "http://www.w3.org/2000/svg";
  var state = { days: 30, wk: { type: "", q: "", items: [], total: 0, types: [], loaded: false, scrollTop: 0 }, chargeDate: "", wkUi: null };
  var navToken = 0;
  var gradSeq = 0;
  var RANGE_VIEWS = { sleep: 1, activity: 1, charge: 1, weight: 1 };
  var TITLES = { overview: "Overview", sleep: "Sleep", activity: "Activity", charge: "Hybrid Charge", workouts: "Workouts", exercises: "Exercises", weight: "Weight", sync: "Sync" };
  var SUBTITLES = { overview: "Today at a glance", sleep: "Nightly duration, stages and score", activity: "Steps, calories and resting heart rate", charge: "Hybrid Charge energy level", workouts: "Browse and analyze your workouts", exercises: "Strength exercise ids, names and usage", weight: "Weigh-ins and trend", sync: "Local database and sync health" };

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
  var ICO = {
    inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z",
    search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3",
    clock: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7v5l3 2",
    route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7",
    heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z",
    flame: "M12 22c4 0 7-2.7 7-6.5 0-3-2-5-3.5-6.5C14.5 7.8 14 6 14 4c-3 1.5-5.5 4.5-5.5 8-1-.7-1.5-1.8-1.5-3C5 11 5 13 5 15.5 5 19.3 8 22 12 22z",
    gauge: "M12 14l4-4M3.5 17a9 9 0 1 1 17 0",
    bolt: "M13 2 3 14h9l-1 8 10-12h-9z",
    mountain: "M3 19l6-10 4 6 2-3 6 7z",
    pulse: "M22 12h-4l-3 9L9 3l-3 9H2",
    moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
    steps: "M7 21c-2 0-3-1.5-3-3 0-2 1-3 3-3s3 1 3 3-1 3-3 3zM17 13c-2 0-3-1.5-3-3 0-2 1-6 3-6s3 4 3 6-1 3-3 3z",
    scale: "M12 3a4 4 0 0 0-4 4h8a4 4 0 0 0-4-4zM5 7h14l1 13H4z",
    run: "M14 2.5a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM10.5 9.5l3-1.5 2.5 3 3 .5M13.5 8l-1.5 5 3 2.5.5 5M12 13l-3 2-2.5 4",
    walk: "M13.5 2.5a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM13 8l-2 4.5 2.5 2.5V21M11 12.5l-3 1.5M13.5 9l3 2.5 2 .5M13.8 15L11.5 21",
    bike: "M6 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM6 16.5l4-7.5h5l3 7.5M10 9l2 7.5M9 6h3",
    swim: "M3 18c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0M3 13.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0M16 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM6 11l4-3.5 3 2 3 2",
    dumbbell: "M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11",
    chevron: "M15 18l-6-6 6-6"
  };
  function ico(name, cls) {
    var svg = s("svg", { "class": "ico" + (cls ? " " + cls : ""), viewBox: "0 0 24 24", "aria-hidden": "true" });
    svg.appendChild(s("path", { d: ICO[name] || ICO.pulse }));
    return svg;
  }
  // Sport families give each workout a colour and an icon (running, walking/hiking, cycling, swimming, strength, treadmill/indoor, other).
  function sportFamily(t) {
    t = String(t || "");
    if (/strength|lifting|weight/.test(t)) return "str";
    if (/swim/.test(t)) return "swim";
    if (/cycl|bik|ride/.test(t)) return "bike";
    if (/treadmill|indoor|elliptical|rowing|gym/.test(t)) return "tm";
    if (/hik|trek|walk|climb|mount/.test(t)) return "walk";
    if (/run|jog/.test(t)) return "run";
    return "gen";
  }
  var FAMILY_ICON = { str: "dumbbell", swim: "swim", bike: "bike", tm: "gauge", walk: "walk", run: "run", gen: "pulse" };
  function sportIconName(t) { var f = sportFamily(t); return f === "walk" && /hik|trek|climb|mount/.test(String(t || "")) ? "mountain" : FAMILY_ICON[f]; }
  function sportIcon(t, cls) { return ico(sportIconName(t), cls); }
  function sportChip(t, big) { return h("span", { "class": "sico f-" + sportFamily(t) + (big ? " lg" : ""), "aria-hidden": "true" }, sportIcon(t)); }
  function empty(text, icon) { return h("div", { "class": "empty" }, [ico(icon || "inbox"), h("span", { text: text })]); }
  function skeleton() {
    var cards = h("div", { "class": "cards" }, [h("div", { "class": "sk c" }), h("div", { "class": "sk c" }), h("div", { "class": "sk c" }), h("div", { "class": "sk c" })]);
    return h("div", { "class": "skel", "aria-busy": "true" }, [h("span", { "class": "sr", text: "Loading..." }), cards, h("div", { "class": "sk p" })]);
  }
  function skelPanel() { return h("div", { "class": "skel", "aria-busy": "true" }, [h("span", { "class": "sr", text: "Loading..." }), h("div", { "class": "sk p" })]); }
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
  function typeBadge(w, tiny) {
    if (!w || !w.type_confidence) return null;
    return h("span", { "class": "badge warn" + (tiny ? " tiny" : ""), title: "Sport name is a guess from Zepp type number " + (w.zepp_type === undefined || w.zepp_type === null ? "" : w.zepp_type) + " (" + w.type_confidence + ")", text: "inferred" });
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
  function pickStep(steps, raw) { for (var i = 0; i < steps.length; i++) if (steps[i] >= raw) return steps[i]; return steps[steps.length - 1] * Math.ceil(raw / steps[steps.length - 1]); }
  // opts: { invert, steps, kind: "bar"|"line", points: [{label, v, segs:[{v,color}], tip}], color, fmt, mean, emptyText, zero }
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
    var step = opts.steps ? pickStep(opts.steps, (hi - lo) / 4) : niceStep(Math.max((hi - lo) / 4, 0.0001));
    var ymin = Math.floor(lo / step) * step, ymax = Math.ceil(hi / step) * step;
    if (ymax === ymin) ymax = ymin + step;
    var iw = W - L - R, ih = H - T - B;
    function X(i) { return L + (i + 0.5) * iw / n; }
    function Y(v) { var f = (v - ymin) / (ymax - ymin); return opts.invert ? T + f * ih : T + ih - f * ih; }
    var fmt = opts.fmt || fmtInt, color = opts.color || "var(--teal)";
    var svg = s("svg", { "class": "chart", viewBox: "0 0 " + W + " " + H, role: "img", preserveAspectRatio: "xMidYMid meet" });
    var gid = "cg" + (++gradSeq), fillRef = "url(#" + gid + ")", barRef = "url(#" + gid + "b)";
    svg.appendChild(s("defs", null, [
      s("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, [s("stop", { offset: "0%", "stop-color": color, "stop-opacity": "0.34" }), s("stop", { offset: "100%", "stop-color": color, "stop-opacity": "0.02" })]),
      s("linearGradient", { id: gid + "b", x1: 0, y1: 0, x2: 0, y2: 1 }, [s("stop", { offset: "0%", "stop-color": color, "stop-opacity": "0.95" }), s("stop", { offset: "100%", "stop-color": color, "stop-opacity": "0.5" })])
    ]));
    var guide = opts.kind === "bar" ? null : s("line", { y1: T, y2: T + ih, stroke: "currentColor", "stroke-opacity": "0.3", "stroke-dasharray": "3 3", "class": "hidden" });
    if (guide) svg.appendChild(guide);
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
          svg.appendChild(s("rect", { x: X(i) - bw / 2, y: Math.min(y0, y1), width: bw, height: Math.max(0, Math.abs(y0 - y1)), rx: n <= 100 ? 2 : 0, fill: (p.segs && p.segs.length) ? sg.color : barRef }));
          base += sg.v;
        });
      });
    } else {
      var d = "", pen = false, seg = [], base = T + ih;
      function closeArea() {
        if (seg.length > 1) {
          var a = "M" + seg[0][0].toFixed(1) + " " + base.toFixed(1);
          seg.forEach(function (c) { a += " L" + c[0].toFixed(1) + " " + c[1].toFixed(1); });
          a += " L" + seg[seg.length - 1][0].toFixed(1) + " " + base.toFixed(1) + " Z";
          svg.appendChild(s("path", { d: a, fill: fillRef, stroke: "none" }));
        }
        seg = [];
      }
      pts.forEach(function (p, i) {
        if (!isNum(p.v)) { pen = false; closeArea(); return; }
        d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.v).toFixed(1) + " ";
        seg.push([X(i), Y(p.v)]);
        pen = true;
      });
      closeArea();
      svg.appendChild(s("path", { d: d, fill: "none", stroke: color, "stroke-width": "2", "stroke-linejoin": "round", "stroke-linecap": "round" }));
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
      if (guide) { guide.setAttribute("x1", X(i)); guide.setAttribute("x2", X(i)); guide.classList.remove("hidden"); }
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
    svg.addEventListener("pointerleave", function (ev) { if (ev.pointerType === "mouse") { tip.classList.add("hidden"); if (guide) guide.classList.add("hidden"); } });
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
  var LABEL_ICONS = [[/step/i, "steps"], [/sleep|night/i, "moon"], [/resting|heart|^avg hr/i, "heart"], [/charge|power|end of day/i, "bolt"], [/weigh|bmi|^change$|^latest$/i, "scale"], [/calor|energy/i, "flame"], [/distance/i, "route"], [/duration/i, "clock"], [/pace|speed/i, "gauge"], [/cadence/i, "steps"], [/elevation/i, "mountain"], [/training|load|workout|score|best|lowest|highest|longest|shortest|average/i, "pulse"]];
  function labelIcon(label) {
    for (var i = 0; i < LABEL_ICONS.length; i++) if (LABEL_ICONS[i][0].test(label)) return ico(LABEL_ICONS[i][1]);
    return null;
  }
  function card(label, big, unit, sub, extra, onclick, iconEl) {
    var ic = iconEl === undefined ? labelIcon(label) : iconEl;
    return h("div", { class: "card" + (onclick ? " click" : ""), onclick: onclick || null, tabindex: onclick ? "0" : null }, [
      h("div", { class: "label" }, [ic, h("span", { text: label })]),
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
      box.appendChild(w ? card("Last workout", typeName(w.activity_type), "", shortDate(w.started_date) + " " + localTime(w.started_at) + " | " + fmtDur(w.duration_s) + (isNum(w.distance_m) && w.distance_m > 0 ? " | " + fmtKm(w.distance_m) : "") + paceSub(w), typeBadge(w), function () { go("workouts/" + encodeURIComponent(w.workout_id)); }, sportChip(w.activity_type)) : emptyCard("Last workout", "No workouts yet"));
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

  // ---- workouts: list / detail layout; exercises have their own page ---------------------------------------------------------
  function exerciseCell(name, known, id) {
    return known ? name : h("span", { class: "unknown mono", title: "Unmapped exercise id " + id }, name);
  }
  function workoutRow(w, selId) {
    var hasDist = isNum(w.distance_m) && w.distance_m > 0, hasSets = w.strength_sets > 0;
    // right side: primary value on top (distance, or sets for strength), duration underneath; duration alone when there is neither
    var right = hasDist ? [h("div", { class: "pv", text: fmtKm(w.distance_m) }), h("div", { class: "sv", text: fmtDur(w.duration_s) })]
      : hasSets ? [h("div", { class: "pv", text: w.strength_sets + (w.strength_sets === 1 ? " set" : " sets") }), h("div", { class: "sv", text: fmtDur(w.duration_s) })]
      : [h("div", { class: "pv", text: fmtDur(w.duration_s) })];
    return h("a", { class: "wrow" + (w.workout_id === selId ? " sel" : ""), href: "#/workouts/" + encodeURIComponent(w.workout_id), onclick: function () { if (state.wkUi) state.wkUi.skipScroll = true; } }, [
      sportChip(w.activity_type),
      h("div", { class: "wmain" }, [
        h("div", { class: "t" }, [typeName(w.activity_type), " ", typeBadge(w, true)]),
        h("div", { class: "sub", text: shortDate(w.started_date) + " \u00b7 " + localTime(w.started_at) })
      ]),
      h("div", { class: "r" }, right)
    ]);
  }
  function renderDetail(pane, id, token) {
    clear(pane); pane.appendChild(skeleton());
    return api("workouts/" + encodeURIComponent(id)).then(function (r) {
      if (token !== navToken) return;
      clear(pane);
      var w = r.workout;
      pane.appendChild(h("a", { class: "back", href: "#/workouts" }, "< All workouts"));
      pane.appendChild(h("div", { class: "hero" }, [sportChip(w.activity_type, true), h("div", { class: "htxt" }, [
        h("h2", null, [typeName(w.activity_type), typeBadge(w, true)]),
        h("div", { class: "sub", text: shortDate(w.started_date) + " " + String(w.started_date || "").slice(0, 4) + " \u00b7 " + localTime(w.started_at) + " - " + localTime(w.ended_at) })
      ])]));
      var tiles = [];
      if (isNum(w.distance_m) && w.distance_m > 0) tiles.push(card("Distance", (w.distance_m / 1000).toFixed(2), "km", ""));
      tiles.push(card("Duration", fmtDur(w.duration_s), "", ""));
      tiles.push(card("Heart rate", fmtInt(w.avg_hr_bpm), "bpm avg", "max " + fmtInt(w.max_hr_bpm)));
      tiles.push(card("Energy", fmtInt(w.calories_kcal), "kcal", isNum(w.training_load) ? "load " + fmtInt(w.training_load) : ""));
      pane.appendChild(h("div", { class: "cards stats" }, tiles));
      var strengthWorkout = w.zepp_type === 52 || /strength/.test(String(w.activity_type));
      if (!strengthWorkout) pane.appendChild(renderAnalysis(w, id, token));
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
  // ---- running / walking / cycling detail (pace, heart rate, elevation, splits, route) ------------------------------------------------
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function fmtClock(sec) {
    if (!isNum(sec)) return "-";
    var r = Math.round(sec), hh = Math.floor(r / 3600), mm = Math.floor((r % 3600) / 60), ss = r % 60;
    return hh > 0 ? hh + ":" + pad2(mm) + ":" + pad2(ss) : mm + ":" + pad2(ss);
  }
  function fmtPace(sec) { return isNum(sec) && sec > 0 ? fmtClock(sec) : "-"; }
  function isSpeedSport(t) { return /cycl|bik|ride/.test(String(t || "")); }
  function paceSub(w) {
    if (!w || !isNum(w.distance_m) || w.distance_m < 100 || !isNum(w.duration_s) || w.duration_s <= 0) return "";
    if (isSpeedSport(w.activity_type)) return " | " + fmt1(w.distance_m / w.duration_s * 3.6) + " km/h";
    if (/run|walk|hik|trek|jog/.test(String(w.activity_type || ""))) return " | " + fmtPace(w.duration_s / w.distance_m * 1000) + "/km";
    return "";
  }
  var ANALYSIS_MSG = {
    no_detail: "Zepp has no detailed data (pace, heart rate, route) for this workout.",
    rate_limited: "Too many detail requests just now. Try again in a few minutes.",
    upstream_error: "Zepp did not return the detail right now. Try again in a few minutes.",
    not_synced: "Detail for this workout is not synced yet. The next daily sync will fetch it.",
    no_credentials: "Detail is not available because the server has no Zepp connection configured."
  };
  function analysisCards(w, sm) {
    var cards = [], speed = isSpeedSport(w.activity_type);
    if (!/swim/.test(String(w.activity_type || "")) && (isNum(sm.avg_pace_s_km) || isNum(sm.best_pace_s_km))) {
      if (speed) {
        cards.push(card("Speed", isNum(sm.avg_pace_s_km) ? fmt1(3600 / sm.avg_pace_s_km) : "-", "km/h avg", isNum(sm.best_pace_s_km) ? "best " + fmt1(3600 / sm.best_pace_s_km) + " km/h" : ""));
      } else {
        cards.push(card("Pace", fmtPace(sm.avg_pace_s_km), "/km avg", isNum(sm.best_pace_s_km) ? "best " + fmtPace(sm.best_pace_s_km) + " /km" : ""));
      }
    }
    if (isNum(sm.avg_cadence_spm)) {
      var cs = [];
      if (isNum(sm.max_cadence_spm)) cs.push("max " + fmtInt(sm.max_cadence_spm));
      if (isNum(sm.steps)) cs.push(fmtInt(sm.steps) + " steps");
      if (isNum(sm.stride_cm)) cs.push(fmtInt(sm.stride_cm) + " cm stride");
      cards.push(card("Cadence", fmtInt(sm.avg_cadence_spm), "spm avg", cs.join(" | ")));
    }
    if (isNum(sm.ascent_m) || isNum(sm.max_altitude_m)) {
      var es = [];
      if (isNum(sm.descent_m)) es.push(fmtInt(sm.descent_m) + " m descent");
      if (isNum(sm.min_altitude_m) && isNum(sm.max_altitude_m)) es.push(fmtInt(sm.min_altitude_m) + " to " + fmtInt(sm.max_altitude_m) + " m");
      cards.push(card("Elevation", fmtInt(sm.ascent_m), "m ascent", es.join(" | ")));
    }
    if (isNum(sm.training_load) || isNum(sm.aerobic_te) || isNum(sm.vo2max)) {
      var ts = [];
      if (isNum(sm.aerobic_te)) ts.push("aerobic TE " + fmt1(sm.aerobic_te));
      if (isNum(sm.anaerobic_te) && sm.anaerobic_te > 0) ts.push("anaerobic " + fmt1(sm.anaerobic_te));
      if (isNum(sm.vo2max)) ts.push("VO2max " + fmtInt(sm.vo2max));
      cards.push(card("Training", isNum(sm.training_load) ? fmtInt(sm.training_load) : "-", "load", ts.join(" | ")));
    }
    if (isNum(sm.avg_power_w)) cards.push(card("Power", fmtInt(sm.avg_power_w), "W avg", isNum(sm.max_power_w) ? "max " + fmtInt(sm.max_power_w) + " W" : ""));
    return cards;
  }
  function seriesPoints(se, key, conv, cap) {
    return se.t.map(function (t, i) {
      var d = se.dist_m[i], v = se[key][i];
      v = isNum(v) ? (conv ? conv(v) : v) : null;
      if (isNum(v) && isNum(cap) && v > cap) v = null;
      return { label: isNum(d) && d > 0 ? (d / 1000).toFixed(1) + " km" : fmtClock(t), v: v,
        tip: fmtClock(t) + (isNum(d) && d > 0 ? " | " + (d / 1000).toFixed(2) + " km" : "") + " | " + (isNum(v) ? (key === "pace_s_km" && !conv ? fmtPace(v) + " /km" : key === "pace_s_km" ? fmt1(v) + " km/h" : key === "hr_bpm" ? fmtInt(v) + " bpm" : fmtInt(v) + " m") : "-") };
    });
  }
  var PACE_STEPS = [5, 10, 15, 30, 60, 120, 300];
  var ZONE_COLORS = ["#5b8def", "#37c6a0", "#f2c14e", "#f2884b", "#e5484d", "#b15de5"];
  function zonePanel(zones) {
    var total = 0;
    zones.forEach(function (z) { total += z.seconds; });
    if (!total) return null;
    return panel("Heart-rate zones", h("div", { class: "zones" }, zones.map(function (z, i) {
      var pct = z.seconds / total * 100, label = i === 0 ? "up to " + z.upper_bpm : z.lower_bpm + " to " + z.upper_bpm;
      var bar = s("svg", { viewBox: "0 0 100 10", width: "100%", height: 10, preserveAspectRatio: "none", role: "img" }, [
        s("rect", { x: 0, y: 0, width: 100, height: 10, rx: 2, fill: "currentColor", "fill-opacity": "0.08" }),
        pct > 0 ? s("rect", { x: 0, y: 0, width: Math.max(0.8, pct), height: 10, rx: 2, fill: ZONE_COLORS[i % ZONE_COLORS.length] }) : null
      ]);
      return h("div", { class: "zrow" }, [h("span", { class: "sub", text: label + " bpm" }), bar, h("span", { class: "n", text: fmtClock(z.seconds) + " (" + Math.round(pct) + "%)" })]);
    })));
  }
  function splitsPanel(splits, speed) {
    if (!splits || !splits.length) return null;
    var fastest = null;
    splits.forEach(function (x) { if (!x.partial && (fastest === null || x.pace_s_km < fastest)) fastest = x.pace_s_km; });
    var rows = splits.map(function (x) {
      var pace = speed ? fmt1(3600 / x.pace_s_km) + " km/h" : fmtPace(x.pace_s_km) + " /km";
      var share = fastest && x.pace_s_km > 0 ? Math.max(0.2, Math.min(1, fastest / x.pace_s_km)) : 0;
      var bar = h("span", { "class": "pbar" }, s("svg", { viewBox: "0 0 100 6", preserveAspectRatio: "none", "aria-hidden": "true" }, [
        s("rect", { x: 0, y: 0, width: 100, height: 6, rx: 3, fill: "currentColor", "fill-opacity": "0.1" }),
        s("rect", { x: 0, y: 0, width: (share * 100).toFixed(0), height: 6, rx: 3, fill: "var(--teal)", "fill-opacity": x.partial ? "0.5" : "0.9" })]));
      return [x.partial ? (x.distance_m / 1000).toFixed(2) + " km" : String(x.km), fmtClock(x.time_s), h("span", null, [bar, x.pace_s_km === fastest ? h("strong", { text: pace }) : pace]), isNum(x.avg_hr_bpm) ? fmtInt(x.avg_hr_bpm) : null, isNum(x.cadence_spm) ? fmtInt(x.cadence_spm) : null];
    });
    return panel("Splits", table(["Km", "Time", speed ? "Speed" : "Pace", "Avg HR", "Cadence"], rows, [0, 1, 2, 3, 4]));
  }
  // ---- route map: a small slippy map over OpenStreetMap raster tiles, with the track drawn as an SVG overlay -----------------------
  // Tiles are plain <img> elements loaded only for the opened workout (tile.openstreetmap.org, the only external host the CSP allows).
  // If tiles cannot load (offline, blocked, or the user switched the map off) the same overlay is shown as a plain GPS track.
  var TILE_BASE = "https://tile.openstreetmap.org/";
  var MAP_PREF = "zepp.map";
  var MAP_MIN_ZOOM = 3, MAP_MAX_ZOOM = 18, MAP_MAX_TILES = 48;
  function mapEnabled() { try { return window.localStorage.getItem(MAP_PREF) !== "off"; } catch (e) { return true; } }
  function setMapEnabled(on) { try { window.localStorage.setItem(MAP_PREF, on ? "on" : "off"); } catch (e) { /* storage unavailable */ } }
  function mapWorld(z) { return 256 * Math.pow(2, z); }
  function mapX(lon, z) { return (lon + 180) / 360 * mapWorld(z); }
  function mapY(lat, z) {
    var r = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * mapWorld(z);
  }
  function routePanel(route) {
    if (!route || !route.points || route.points.length < 2) return null;
    var pts = route.points, b = route.bbox;
    var box = h("div", { "class": "mapbox", role: "group", "aria-label": "Route map", tabindex: "0" });
    var tiles = h("div", { "class": "maptiles" });
    var casing = s("path", { fill: "none", stroke: "#05070b", "stroke-opacity": "0.7", "stroke-width": "6.5", "stroke-linejoin": "round", "stroke-linecap": "round" });
    var line = s("path", { fill: "none", stroke: "var(--teal)", "stroke-width": "3.5", "stroke-linejoin": "round", "stroke-linecap": "round" });
    var startDot = s("circle", { r: 6.5, fill: "var(--good)", stroke: "#05070b", "stroke-width": "2" }, s("title", { text: "Start" }));
    var endDot = s("circle", { r: 6.5, fill: "var(--bad)", stroke: "#05070b", "stroke-width": "2" }, s("title", { text: "End" }));
    var svg = s("svg", { "class": "route", role: "img", "aria-label": "Route track", preserveAspectRatio: "none" }, [casing, line, startDot, endDot]);
    var note = h("div", { "class": "mapnote hidden" });
    var attr = h("div", { "class": "mapattr" }, ["\u00a9 ", h("a", { href: "https://www.openstreetmap.org/copyright", target: "_blank", rel: "noopener noreferrer", text: "OpenStreetMap" }), " contributors"]);
    var m = { z: 3, cx: 0, cy: 0, W: 600, H: 320, tiles: mapEnabled(), loaded: 0, errors: 0, sized: false, cache: {}, raf: 0 };
    if (typeof navigator !== "undefined" && navigator.onLine === false) m.tiles = false;

    function fitView() {
      m.W = box.clientWidth || m.W; m.H = box.clientHeight || m.H;
      var pad = 36, z, w, hh;
      for (z = 16; z > MAP_MIN_ZOOM; z--) {
        w = mapX(b[3], z) - mapX(b[1], z); hh = mapY(b[0], z) - mapY(b[2], z);
        if (w <= m.W - 2 * pad && hh <= m.H - 2 * pad) break;
      }
      m.z = z; m.cx = (mapX(b[1], z) + mapX(b[3], z)) / 2; m.cy = (mapY(b[0], z) + mapY(b[2], z)) / 2;
    }
    function showNote(text) { note.textContent = text || ""; note.classList.toggle("hidden", !text); }
    function clearTiles() { m.cache = {}; clear(tiles); }
    function tilesFailed() { m.tiles = false; clearTiles(); box.classList.add("plain"); showNote("Map tiles unavailable. Showing the plain GPS track."); attr.classList.add("hidden"); }
    function makeTile(z, wx, ty, key) {
      var img = h("img", { alt: "", width: 256, height: 256, decoding: "async", referrerpolicy: "origin", draggable: "false", src: TILE_BASE + z + "/" + wx + "/" + ty + ".png" });
      img.addEventListener("load", function () { m.loaded++; });
      img.addEventListener("error", function () { m.errors++; if (m.loaded === 0 && m.errors >= 3 && m.tiles) tilesFailed(); });
      return img;
    }
    function render() {
      m.raf = 0;
      m.W = box.clientWidth || m.W; m.H = box.clientHeight || m.H;
      var z = m.z, x0 = m.cx - m.W / 2, y0 = m.cy - m.H / 2, n = Math.pow(2, z);
      svg.setAttribute("viewBox", "0 0 " + m.W + " " + m.H);
      var d = pts.map(function (p, i) { return (i ? "L" : "M") + (mapX(p[1], z) - x0).toFixed(1) + " " + (mapY(p[0], z) - y0).toFixed(1); }).join(" ");
      casing.setAttribute("d", d); line.setAttribute("d", d);
      var a = pts[0], e = pts[pts.length - 1];
      startDot.setAttribute("cx", (mapX(a[1], z) - x0).toFixed(1)); startDot.setAttribute("cy", (mapY(a[0], z) - y0).toFixed(1));
      endDot.setAttribute("cx", (mapX(e[1], z) - x0).toFixed(1)); endDot.setAttribute("cy", (mapY(e[0], z) - y0).toFixed(1));
      if (!m.tiles) return;
      var tx0 = Math.floor(x0 / 256), tx1 = Math.floor((x0 + m.W) / 256), ty0 = Math.max(0, Math.floor(y0 / 256)), ty1 = Math.min(n - 1, Math.floor((y0 + m.H) / 256));
      var rowsN = Math.max(1, ty1 - ty0 + 1);
      if ((tx1 - tx0 + 1) * rowsN > MAP_MAX_TILES) tx1 = tx0 + Math.floor(MAP_MAX_TILES / rowsN) - 1;
      var want = {}, tx, ty;
      for (ty = ty0; ty <= ty1; ty++) {
        for (tx = tx0; tx <= tx1; tx++) {
          var wx = ((tx % n) + n) % n, key = z + "/" + tx + "/" + ty;
          want[key] = true;
          var img = m.cache[key];
          if (!img) { img = makeTile(z, wx, ty, key); m.cache[key] = img; tiles.appendChild(img); }
          img.style.left = Math.round(tx * 256 - x0) + "px"; img.style.top = Math.round(ty * 256 - y0) + "px";
        }
      }
      Object.keys(m.cache).forEach(function (k) { if (!want[k]) { if (m.cache[k].parentNode) m.cache[k].parentNode.removeChild(m.cache[k]); delete m.cache[k]; } });
    }
    function schedule() {
      if (m.raf) return;
      if (typeof requestAnimationFrame === "function") m.raf = requestAnimationFrame(render); else render();
    }
    function zoomBy(dz) {
      var z = Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, m.z + dz));
      if (z === m.z) return;
      var k = Math.pow(2, z - m.z); m.z = z; m.cx *= k; m.cy *= k; render();
    }
    function panBy(dx, dy) {
      m.cx += dx; m.cy = Math.max(0, Math.min(mapWorld(m.z), m.cy + dy)); schedule();
    }
    function ctlButton(text, label, fn) { return h("button", { type: "button", "aria-label": label, title: label, text: text, onclick: fn }); }
    var ctl = h("div", { "class": "mapctl" }, [
      ctlButton("+", "Zoom in", function () { zoomBy(1); }),
      ctlButton("\u2212", "Zoom out", function () { zoomBy(-1); }),
      ctlButton("\u25ce", "Fit route", function () { fitView(); render(); })
    ]);
    // drag to pan
    var drag = null;
    box.addEventListener("pointerdown", function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest(".mapctl,.mapattr")) return;
      drag = { x: ev.clientX, y: ev.clientY }; box.classList.add("drag");
      try { box.setPointerCapture(ev.pointerId); } catch (e) { /* not supported */ }
    });
    box.addEventListener("pointermove", function (ev) {
      if (!drag) return;
      panBy(drag.x - ev.clientX, drag.y - ev.clientY); drag.x = ev.clientX; drag.y = ev.clientY;
    });
    function endDrag() { drag = null; box.classList.remove("drag"); }
    box.addEventListener("pointerup", endDrag); box.addEventListener("pointercancel", endDrag);
    box.addEventListener("dblclick", function () { zoomBy(1); });
    box.addEventListener("keydown", function (ev) {
      var k = ev.key;
      if (k === "+" || k === "=") zoomBy(1); else if (k === "-") zoomBy(-1);
      else if (k === "ArrowLeft") panBy(-60, 0); else if (k === "ArrowRight") panBy(60, 0);
      else if (k === "ArrowUp") panBy(0, -60); else if (k === "ArrowDown") panBy(0, 60);
      else return;
      ev.preventDefault();
    });

    box.appendChild(tiles); box.appendChild(svg); box.appendChild(ctl); box.appendChild(note); box.appendChild(attr);
    function applyMode() {
      box.classList.toggle("plain", !m.tiles);
      attr.classList.toggle("hidden", !m.tiles);
      showNote(m.tiles ? "" : (mapEnabled() ? "Offline. Showing the plain GPS track." : "Plain GPS track (map tiles are off)."));
    }
    var toggle = h("button", { type: "button", "aria-pressed": m.tiles ? "true" : "false", text: m.tiles ? "Hide map" : "Show map", onclick: function () {
      var on = !mapEnabled(); setMapEnabled(on);
      m.tiles = on && !(typeof navigator !== "undefined" && navigator.onLine === false); m.loaded = 0; m.errors = 0;
      clearTiles(); toggle.textContent = on ? "Hide map" : "Show map"; toggle.setAttribute("aria-pressed", on ? "true" : "false");
      applyMode(); render();
    } });
    applyMode(); fitView(); render();
    function firstSize() { if (!m.sized && box.clientWidth) { m.sized = true; fitView(); } render(); }
    if (typeof ResizeObserver === "function") {
      var ro = new ResizeObserver(function () { if (!box.isConnected) { ro.disconnect(); return; } firstSize(); });
      ro.observe(box);
    } else setTimeout(firstSize, 0);
    return panel(null, [
      h("div", { "class": "maphead" }, [h("h2", { text: "Route" }), toggle]),
      box,
      h("p", { "class": "sub", text: "Map data \u00a9 OpenStreetMap contributors. Tiles load from tile.openstreetmap.org for this workout only, so that server sees the area you view. North is up. Green is the start, red the finish." })
    ]);
  }
  function analysisView(w, a) {
    var sm = a.summary || {}, se = a.series, speed = isSpeedSport(w.activity_type), out = [];
    var cards = analysisCards(w, sm);
    if (cards.length) out.push(h("div", { class: "cards" }, cards));
    var grid1 = [], grid2 = [];
    if (se && se.t && se.t.length) {
      var hasPace = numbers(se.pace_s_km).length, hasHr = numbers(se.hr_bpm).length, hasAlt = numbers(se.alt_m).length;
      if (hasPace && !/swim/.test(String(w.activity_type || ""))) {
        var cap = isNum(sm.avg_pace_s_km) ? sm.avg_pace_s_km * 2.2 : 1200;
        if (speed) grid1.push(panel("Speed", chart({ kind: "line", points: seriesPoints(se, "pace_s_km", function (p) { return 3600 / p; }), fmt: function (v) { return fmt1(v); }, mean: isNum(sm.avg_pace_s_km) ? 3600 / sm.avg_pace_s_km : null, color: "var(--teal)", emptyText: "No speed data" })));
        else grid1.push(panel("Pace (min/km, faster is higher)", chart({ kind: "line", points: seriesPoints(se, "pace_s_km", null, cap), fmt: fmtPace, invert: true, steps: PACE_STEPS, mean: sm.avg_pace_s_km, color: "var(--teal)", emptyText: "No pace data" })));
      }
      if (hasHr) grid1.push(panel("Heart rate (bpm)", chart({ kind: "line", points: seriesPoints(se, "hr_bpm"), fmt: fmtInt, mean: sm.avg_hr_bpm, color: "var(--bad)", emptyText: "No heart-rate data" })));
      if (hasAlt) grid2.push(panel("Elevation (m)", chart({ kind: "line", points: seriesPoints(se, "alt_m"), fmt: fmtInt, color: "var(--purple)", emptyText: "No elevation data" })));
    }
    var zp = a.zones && a.zones.length ? zonePanel(a.zones) : null;
    if (zp) grid2.push(zp);
    if (grid1.length) out.push(h("div", { class: "grid2" }, grid1));
    if (grid2.length) out.push(h("div", { class: "grid2" }, grid2));
    var grid3 = [splitsPanel(a.splits, speed), routePanel(a.route)].filter(Boolean);
    if (grid3.length) out.push(h("div", { class: "grid2" }, grid3));
    if (!out.length) out.push(panel("", empty(ANALYSIS_MSG.no_detail)));
    else if (!a.route) out.push(h("p", { class: "sub", text: "No GPS track was recorded, so there is no route." }));
    return h("div", null, out);
  }
  function renderAnalysis(w, id, token) {
    var box = h("div", { class: "wa" }, skelPanel());
    api("workouts/" + encodeURIComponent(id) + "/analysis").then(function (r) {
      if (token !== navToken) return;
      clear(box);
      if (!r || r.status !== "ok" || !r.analysis) { box.appendChild(panel("", empty(ANALYSIS_MSG[r && r.reason] || "No detailed data for this workout."))); return; }
      box.appendChild(analysisView(w, r.analysis));
    }).catch(function (e) { if (token === navToken) { clear(box); box.appendChild(panel("", h("div", { class: "empty err", text: "Could not load workout data: " + e.message }))); } });
    return box;
  }
  function viewExercises(box, token) {
    return api("exercises").then(function (r) {
      if (token !== navToken) return;
      clear(box);
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
  // The list is built once per visit. Opening a workout (hash change inside #/workouts) only updates the highlight and the
  // detail pane (ui.select); the list keeps its loaded pages and scroll position. Pages load through an IntersectionObserver
  // on a sentinel at the end of the list's own scroll container, with a Load more button only when the API is missing.
  // Search and the sport dropdown reset the list through the API (type and q parameters).
  function viewWorkouts(box, token, rest) {
    clear(box);
    state.wkUi = null;
    var wk = state.wk, hasIO = typeof IntersectionObserver === "function";
    var ui = { box: box, gen: 0, loading: false, done: false, failed: false, rows: {}, selId: "", skipScroll: false, observer: null, sel: null };
    ui.split = h("div", { class: "split" });
    ui.listPane = h("div", { class: "wlist-pane" });
    ui.detailPane = h("div", { class: "wdetail" });
    ui.list = h("div", { class: "wlist" });
    ui.end = h("div", { class: "wend sub" });
    ui.count = h("span", { class: "sub" });
    ui.split.appendChild(ui.listPane); ui.split.appendChild(ui.detailPane); box.appendChild(ui.split);
    state.wkUi = ui;

    function fetchPage(offset, type, q) {
      return api("workouts?limit=25&offset=" + offset + (type ? "&type=" + encodeURIComponent(type) : "") + (q ? "&q=" + encodeURIComponent(q) : ""));
    }
    function setCount() { ui.count.textContent = wk.items.length + " of " + wk.total; }
    function setEnd() {
      clear(ui.end);
      if (ui.failed) { ui.end.appendChild(h("button", { text: "Could not load more. Retry", onclick: function () { ui.failed = false; loadMore(); } })); return; }
      if (ui.loading) { ui.end.textContent = "Loading..."; return; }
      if (!wk.items.length) { ui.end.textContent = wk.type || wk.q ? "No workouts match" : "No workouts yet"; return; }
      if (ui.done) { ui.end.textContent = "End of list"; return; }
      if (!hasIO) ui.end.appendChild(h("button", { text: "Load more", onclick: function () { loadMore(); } }));
    }
    function appendRows(items) {
      items.forEach(function (w) {
        var row = workoutRow(w, ui.selId);
        ui.rows[w.workout_id] = row;
        ui.list.insertBefore(row, ui.end);
      });
    }
    function recheck() {
      if (!ui.observer) return;
      ui.observer.unobserve(ui.end);
      if (!ui.done && !ui.failed) ui.observer.observe(ui.end); // re-observing reports the current state again, so a short list keeps filling
    }
    function loadMore() {
      if (state.wkUi !== ui || ui.loading || ui.done) return Promise.resolve();
      ui.loading = true; ui.failed = false; setEnd();
      var gen = ui.gen;
      return fetchPage(wk.items.length, wk.type, wk.q).then(function (r) {
        if (gen !== ui.gen || state.wkUi !== ui) return;
        ui.loading = false;
        var fresh = (r.workouts || []).filter(function (w) { return !ui.rows[w.workout_id]; });
        wk.items = wk.items.concat(fresh); wk.total = r.total; wk.types = r.types || wk.types || []; wk.loaded = true;
        ui.done = !fresh.length || wk.items.length >= wk.total;
        appendRows(fresh); setCount(); setEnd(); recheck();
      }).catch(function () {
        if (gen !== ui.gen || state.wkUi !== ui) return;
        ui.loading = false; ui.failed = true; setEnd();
      });
    }
    function paintChips() {
      if (ui.sel) ui.sel.value = wk.type || "";
    }
    function resetList(type, q) {
      ui.gen++; ui.loading = false; ui.done = false; ui.failed = false;
      wk.type = type; if (q !== undefined) wk.q = q;
      wk.items = []; wk.total = 0; wk.scrollTop = 0;
      Array.prototype.slice.call(ui.list.querySelectorAll(".wrow")).forEach(function (el) { ui.list.removeChild(el); });
      ui.rows = {}; ui.list.scrollTop = 0; setCount(); setEnd(); paintChips();
      return loadMore();
    }
    function ensureVisible(row) {
      var sc = ui.list, top = row.offsetTop, bottom = top + row.offsetHeight;
      if (top < sc.scrollTop) sc.scrollTop = Math.max(0, top - 8);
      else if (bottom > sc.scrollTop + sc.clientHeight) sc.scrollTop = bottom - sc.clientHeight + 8;
    }
    ui.select = function (id) {
      var prev = ui.selId; ui.selId = id;
      if (prev && ui.rows[prev]) ui.rows[prev].classList.remove("sel");
      if (id && ui.rows[id]) { ui.rows[id].classList.add("sel"); if (!ui.skipScroll) ensureVisible(ui.rows[id]); }
      ui.skipScroll = false;
      var wasDetail = ui.split.classList.contains("has-detail");
      ui.split.classList.toggle("has-detail", !!id);
      // a list that was hidden (stacked mobile layout) loses its scroll offset: put it back
      if (!id && wasDetail) ui.list.scrollTop = wk.scrollTop || 0;
      ui.detailPane.scrollTop = 0;
      if (!id) { clear(ui.detailPane); ui.detailPane.appendChild(empty("Select a workout to see its details", "pulse")); return Promise.resolve(); }
      return renderDetail(ui.detailPane, id, ++navToken);
    };

    function paintList() {
      clear(ui.listPane);
      var total = 0; (wk.types || []).forEach(function (t) { total += t.n; });
      var opts = [h("option", { value: "", text: "All sports (" + total + ")" })].concat((wk.types || []).map(function (t) { return h("option", { value: t.type, text: typeName(t.type) + " (" + t.n + ")" }); }));
      var sel = h("select", { "class": "wtype", "aria-label": "Filter by sport" }, opts);
      ui.sel = sel;
      sel.addEventListener("change", function () { if ((wk.type || "") !== sel.value) resetList(sel.value); });
      var typeWrap = h("div", { "class": "wtype-wrap" }, [sel, ico("chevron")]);
      var input = h("input", { type: "search", "class": "wsearch", "aria-label": "Search workouts", placeholder: "Search workouts", title: "Search by sport, date or month", value: wk.q || "", autocomplete: "off", maxlength: "60" });
      var timer = 0;
      input.addEventListener("input", function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () { timer = 0; if (state.wkUi === ui && (input.value.trim() !== (wk.q || ""))) resetList(wk.type, input.value.trim()); }, 300);
      });
      ui.listPane.appendChild(h("div", { "class": "wfilter" }, [h("div", { "class": "wsearch-wrap" }, [ico("search"), input]), typeWrap]));
      ui.listPane.appendChild(h("div", { "class": "seg wmeta" }, [ui.count]));
      ui.listPane.appendChild(ui.list);
      ui.list.appendChild(ui.end);
      appendRows(wk.items);
      ui.done = wk.items.length >= wk.total;
      setCount(); setEnd(); paintChips();
      ui.list.addEventListener("scroll", function () { wk.scrollTop = ui.list.scrollTop; });
      if (wk.scrollTop) ui.list.scrollTop = wk.scrollTop;
      if (ui.selId && ui.rows[ui.selId]) ensureVisible(ui.rows[ui.selId]);
      if (hasIO) {
        ui.observer = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) if (entries[i].isIntersecting) { loadMore(); break; }
        }, { root: ui.list, rootMargin: "0px 0px 240px 0px" });
        if (!ui.done) ui.observer.observe(ui.end);
      }
    }
    ui.selId = rest;
    var listReady = wk.loaded ? Promise.resolve() : fetchPage(0, wk.type, wk.q).then(function (r) {
      wk.items = r.workouts || []; wk.total = r.total; wk.types = r.types || []; wk.loaded = true;
    });
    var detail;
    if (rest) { ui.split.classList.add("has-detail"); detail = renderDetail(ui.detailPane, rest, token); }
    else { ui.detailPane.appendChild(empty("Select a workout to see its details", "pulse")); detail = Promise.resolve(); }
    return Promise.all([listReady.then(function () { if (token === navToken && state.wkUi === ui) paintList(); }), detail]);
  }

  // ---- router -------------------------------------------------------------------------------------------------------
  function go(r) { window.location.hash = "#/" + r; }
  function parseRoute() {
    var raw = window.location.hash.replace(/^#\/?/, ""), i = raw.indexOf("/");
    var view = i < 0 ? raw : raw.slice(0, i), rest = i < 0 ? "" : raw.slice(i + 1);
    try { rest = decodeURIComponent(rest); } catch (e) { rest = ""; }
    if (!TITLES[view]) view = "overview";
    if (view === "workouts" && rest === "exercises") { view = "exercises"; rest = ""; }
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
    if (/^#\/workouts\/exercises\/?$/.test(window.location.hash)) { try { window.history.replaceState(null, "", "#/exercises"); } catch (e) { /* keep the old hash, parseRoute maps it */ } }
    var r = parseRoute(), box = $("view");
    document.title = TITLES[r.view] + " | Zepp";
    $("title").textContent = TITLES[r.view];
    $("subtitle").textContent = SUBTITLES[r.view] || "";
    Array.prototype.forEach.call(document.querySelectorAll("nav.menu a"), function (a) { a.classList.toggle("active", a.getAttribute("data-route") === r.view); });
    closeMenu();
    renderRange(r.view);
    // Opening another workout must not rebuild the list: only the highlight and the detail pane change.
    var live = state.wkUi;
    if (r.view === "workouts" && live && live.box === box && box.contains(live.split)) {
      return Promise.resolve(live.select(r.rest)).catch(function () {});
    }
    var token = ++navToken;
    if (live && live.observer) live.observer.disconnect();
    state.wkUi = null;
    $("content").classList.toggle("fit", r.view === "workouts");
    clear(box); box.appendChild(skeleton());
    var views = { overview: viewOverview, sleep: viewSleep, activity: viewActivity, charge: viewCharge, workouts: viewWorkouts, exercises: viewExercises, weight: viewWeight, sync: viewSync };
    var p;
    try { p = views[r.view](box, token, r.rest); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).catch(function (e) {
      if (token !== navToken) return;
      clear(box); box.appendChild(h("div", { class: "empty err", text: "Could not load: " + (e && e.message ? e.message : "error") }));
    });
  }
  function sidebarCollapsed() { try { return window.localStorage.getItem("zepp.sidebar") === "collapsed"; } catch (e) { return false; } }
  function applySidebar(collapsed) {
    var btn = $("collapse");
    $("app").classList.toggle("collapsed", collapsed);
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    var label = collapsed ? "Expand sidebar" : "Collapse sidebar";
    btn.setAttribute("aria-label", label); btn.setAttribute("title", label);
  }
  function init() {
    applySidebar(sidebarCollapsed());
    $("collapse").addEventListener("click", function () {
      var next = !$("app").classList.contains("collapsed");
      applySidebar(next);
      try { window.localStorage.setItem("zepp.sidebar", next ? "collapsed" : "expanded"); } catch (e) { /* storage unavailable */ }
    });
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
  exercises: "M9 3h6a1 1 0 0 1 1 1v2H8V4a1 1 0 0 1 1-1zM8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M8.5 11.5l1.2 1.2 2.1-2.4M8.5 16.5l1.2 1.2 2.1-2.4M14.5 12h2.5M14.5 17h2.5",
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
  { route: "exercises", label: "Exercises" },
  { route: "weight", label: "Weight" },
  { route: "sync", label: "Sync" }
];

const CHEVRON = "M15 18l-6-6 6-6";
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
  const nav = NAV_ITEMS.map(i => `<a href="#/${i.route}" data-route="${i.route}" data-tip="${i.label}" title="${i.label}" aria-label="${i.label}">${icon(i.route)}<span>${i.label}</span></a>`).join("");
  return `${HEAD(nonce, "Zepp")}<body><div id="app" class="app">` +
    `<aside id="sidebar" class="side"><div class="brand"><span class="logo">Z</span><span class="bname">Zepp</span>` +
    `<button id="collapse" type="button" class="collapse" aria-label="Collapse sidebar" title="Collapse sidebar" aria-expanded="true" aria-controls="sidebar"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${CHEVRON}"/></svg></button></div>` +
    `<nav class="menu" aria-label="Sections">${nav}</nav>` +
    `<form method="post" action="/dashboard/logout"><button type="submit" class="logout" data-tip="Log out" title="Log out" aria-label="Log out">${icon("logout")}<span>Log out</span></button></form></aside>` +
    `<div id="scrim" class="scrim"></div>` +
    `<div id="content" class="content"><header class="topbar"><button id="menu" type="button" class="hamb" aria-label="Open menu">${icon("menu")}</button>` +
    `<div class="ttl"><h1 id="title">Overview</h1><p id="subtitle" class="subtitle"></p></div><div id="rangebar" class="seg"></div></header>` +
    `<main id="view"><div class="skel" aria-busy="true"><span class="sr">Loading...</span><div class="cards"><div class="sk c"></div><div class="sk c"></div><div class="sk c"></div><div class="sk c"></div></div><div class="sk p"></div></div></main></div></div>` +
    `<script nonce="${n}">${DASHBOARD_JS}</script></body></html>`;
}
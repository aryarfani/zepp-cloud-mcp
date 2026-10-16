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
nav.menu a.syncing svg{color:var(--teal);animation:navspin 1.1s linear infinite}
nav.menu a.syncing{animation:navglow 2.2s ease-in-out infinite}
.app.collapsed nav.menu a.syncing{animation:none}
@keyframes navspin{to{transform:rotate(360deg)}}
@keyframes navglow{0%,100%{box-shadow:0 0 6px 0 rgba(45,212,191,.1),inset 0 0 0 1px rgba(45,212,191,.16)}50%{box-shadow:0 0 16px 2px rgba(45,212,191,.3),inset 0 0 0 1px rgba(45,212,191,.38)}}
@media (prefers-reduced-motion:reduce){nav.menu a.syncing,.app.collapsed nav.menu a.syncing{animation:none;box-shadow:0 0 12px 1px rgba(45,212,191,.24),inset 0 0 0 1px rgba(45,212,191,.32)}nav.menu a.syncing svg{animation:none}}
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
.hidden{display:none!important}
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
.wtype-wrap{position:relative;flex:none;width:178px}
.wtype{display:flex;align-items:center;gap:8px;width:100%;height:100%;padding:5px 9px 5px 6px;background:var(--panel2);border-radius:11px;color:var(--text);font:inherit;font-size:.84rem;cursor:pointer;text-align:left}
.wdd-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wtype .dd-chev,.wopt .ck{flex:none;width:14px;height:14px}
.wtype .dd-chev{color:var(--faint);transform:rotate(-90deg);transition:transform .15s}
.wtype[aria-expanded=true] .dd-chev{transform:rotate(90deg)}
.wtype .sico,.wopt .sico{width:26px;height:26px;border-radius:50%}
.wtype .sico svg,.wopt .sico svg{width:15px;height:15px}
.sico.neutral{--c:#9aa4b8}
.wmenu{position:absolute;right:0;top:calc(100% + 6px);width:272px;max-width:calc(100vw - 28px);z-index:40;background:#12161d;border:1px solid var(--line2);border-radius:14px;box-shadow:0 18px 40px rgba(0,0,0,.55);padding:8px}
.wmenu[hidden]{display:none}
.wdd-search{display:block;width:100%;margin:0 0 6px;padding:8px 11px;border-radius:9px;font-size:.84rem}
.wdd-list{max-height:min(340px,52vh);overflow:auto}
.wopt{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:10px;cursor:pointer;font-size:.86rem}
.wopt.act,.wopt:hover{background:rgba(45,212,191,.13)}
.wopt .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wopt .cnt{font-size:.72rem;color:var(--muted);background:rgba(255,255,255,.07);padding:1px 8px;border-radius:999px;font-variant-numeric:tabular-nums}
.wopt .ck{color:var(--teal);visibility:hidden}.wopt.on .ck{visibility:visible}.wopt.on .nm{font-weight:600}
.wdd-none{padding:10px 8px;color:var(--faint);font-size:.82rem}
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
.wrow{flex:none;display:flex;align-items:center;gap:12px;padding:9px 12px;min-height:84px;border-radius:11px;border:1px solid transparent;transition:background .12s,border-color .12s}
.wrow:hover{background:var(--panel2)}
.wrow:focus-visible{outline:none;border-color:var(--line2);background:var(--panel2)}
.wrow.sel,.wrow.sel:focus-visible{background:linear-gradient(90deg,rgba(45,212,191,.14),rgba(167,139,250,.07));border-color:rgba(45,212,191,.4)}
.wmain{flex:1;min-width:0}
.wrow .t{font-weight:580;font-size:.88rem;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wrow .sub{font-size:.74rem;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wrow .r{text-align:right;color:var(--muted);font-size:.78rem;white-space:nowrap;line-height:1.3;font-variant-numeric:tabular-nums}
.wrow .r.lead{display:flex;align-items:center;justify-content:flex-end;gap:9px}
.wrow .r .rt{text-align:right}
.rthumb{flex:none;width:64px;height:64px;border-radius:14px;background:#0b0e14;border:1px solid var(--line)}
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
.mapnote{position:absolute;left:10px;top:46px;z-index:2;font-size:.72rem;color:var(--muted);background:rgba(10,12,17,.78);padding:2px 8px;border-radius:8px}
.mappill{position:absolute;left:10px;top:10px;z-index:2;display:inline-flex;align-items:center;gap:6px;padding:5px 12px 5px 9px;border-radius:999px;font-size:.8rem;font-weight:600;color:var(--text);background:rgba(18,22,30,.9);border:1px solid var(--line2);backdrop-filter:blur(4px);pointer-events:none}
.mappill svg{width:15px;height:15px;color:var(--teal)}
.mapbar{position:absolute;top:10px;right:50px;z-index:3;display:flex;align-items:center;gap:6px}
.maptoggle,.expbtn{padding:4px 12px;font-size:.78rem;border-radius:999px;background:rgba(18,22,30,.9);backdrop-filter:blur(4px)}
.expwrap{position:relative}
.expbtn{display:inline-flex;align-items:center;gap:6px}
.expbtn svg{width:14px;height:14px;color:var(--teal)}
.expbtn .dd-chev{width:12px;height:12px;color:var(--faint);transform:rotate(-90deg);transition:transform .15s}
.expbtn[aria-expanded=true] .dd-chev{transform:rotate(90deg)}
.expmenu{position:absolute;right:0;top:calc(100% + 6px);min-width:170px;background:#12161d;border:1px solid var(--line2);border-radius:12px;box-shadow:0 18px 40px rgba(0,0,0,.55);padding:6px}
.expmenu.hidden{display:none}
.expitem{display:block;padding:8px 10px;border-radius:8px;font-size:.84rem;color:var(--text);text-decoration:none;cursor:pointer}
.expitem:hover,.expitem:focus{background:rgba(45,212,191,.13);outline:none}
.expnote{padding:2px 10px 6px;font-size:.7rem;color:var(--muted);line-height:1.35}
.watchpill{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border-radius:999px;font-size:.8rem;color:var(--muted);background:var(--panel2);border:1px solid var(--line);margin:0 0 12px}
.watchpill svg{width:14px;height:14px;color:var(--teal)}
.planstrip{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px}
.plan{flex:none;min-width:130px;max-width:200px;padding:9px 12px;border-radius:12px;background:var(--panel2);border:1px solid var(--line)}
.plan .d{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.plan .t{margin-top:3px;font-weight:600;font-size:.88rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hint{font-size:.78rem;color:var(--muted);margin:8px 2px 0;line-height:1.45}
.maplegend{position:absolute;left:10px;bottom:10px;z-index:2;padding:6px 10px 7px;border-radius:10px;background:rgba(10,12,17,.82);border:1px solid var(--line);font-size:.68rem;color:var(--muted);min-width:132px;pointer-events:none}
.maplegend .bar{height:6px;border-radius:3px;margin:4px 0 3px;background:linear-gradient(90deg,#f97316,#eab308,#22c55e)}
.maplegend .ends{display:flex;justify-content:space-between}
.bm{display:block;width:100%;height:auto}
.bm path{stroke-linejoin:round}
.bm .bo path,.bm path.bo,.bm g.bo path{fill:#fff;stroke:#fff;stroke-width:2.8}
.bm .b path{fill:#c9ccd3;stroke:none}
.bm .m-n,.bm .m-p,.bm .m-s{stroke:#fff;stroke-width:1.2}
.bm .m-n{fill:#c9ccd3}
.bm .m-p{fill:#e8362f}
.bm .m-s{fill:#f7a600}
.bm-sm{width:66px;height:66px;flex:none}
.bm-sm .bo path{stroke-width:5}
.bm-sm .m-n,.bm-sm .m-p,.bm-sm .m-s{stroke-width:2.4}
.bm-card h2{text-transform:uppercase;letter-spacing:.04em}
.bm-card .bm-body{display:flex;gap:28px;align-items:center;flex-wrap:wrap;justify-content:center}
.bm-fig{flex:0 1 460px;min-width:260px}
.bm-fig .bm{max-height:420px}
.bm-lbl{display:flex;justify-content:space-around;margin-top:2px;font-size:.72rem;color:var(--faint);letter-spacing:.08em;text-transform:uppercase}
.bm-lists{flex:1 1 200px;min-width:190px;display:flex;flex-direction:column;gap:16px}
.bm-lt{display:flex;align-items:center;gap:8px}
.bm-list .sub{margin:3px 0 0 20px;font-size:.82rem}
.dot{flex:none;width:12px;height:12px;border-radius:50%;display:inline-block}
.dot.p{background:#e8362f}.dot.s{background:#f7a600}.dot.n{background:#c9ccd3}
.bm-legend{display:flex;flex-wrap:wrap;gap:8px 22px;justify-content:center;margin:12px 0 4px;font-size:.82rem;color:var(--muted)}
.bm-key{display:inline-flex;align-items:center;gap:8px}
.bm-note{margin:8px 0 0;padding:10px 12px;font-size:.78rem;line-height:1.4;color:var(--muted);background:var(--panel2);border:1px solid var(--line);border-radius:10px}
.syncctl{width:100%;margin:0 0 14px;padding-bottom:12px;border-bottom:1px solid var(--line)}
.synctop{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.syncbtn{display:inline-flex;align-items:center;gap:8px;padding:9px 18px;border-radius:999px;font-weight:650}
.syncbtn.primary{background:var(--grad);border-color:transparent;color:#071210}
.syncbtn.primary:hover:not(:disabled){filter:brightness(1.08);background:var(--grad)}
.syncbtn:disabled{cursor:progress;opacity:.82}
.syncbtn svg{width:16px;height:16px}
.syncbtn .spin{display:none;width:15px;height:15px;border:2px solid rgba(7,18,16,.3);border-top-color:#071210;border-radius:50%;animation:spin .8s linear infinite}
.syncbtn.busy svg{display:none}.syncbtn.busy .spin{display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}
.pbar{width:100%;max-width:520px;height:6px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:12px;position:relative}
.pbar .fill{height:100%;width:0;border-radius:3px;background:var(--grad);transition:width .3s}
.pbar.ind .fill{position:absolute;width:35%;animation:indet 1.3s ease-in-out infinite}
@keyframes indet{0%{left:-35%}100%{left:100%}}
.stepper{display:flex;list-style:none;margin:18px 0 6px;padding:0}
.stepper .step{flex:1 1 0;min-width:0;position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.stepper .step::before{content:"";position:absolute;top:12px;right:50%;width:100%;height:2px;background:var(--line2)}
.stepper .step:first-child::before{display:none}
.stepper .step.done::before,.stepper .step.cur::before{background:var(--good)}
.sdot{position:relative;z-index:1;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--panel2);border:2px solid var(--line2);color:var(--faint);font-size:.7rem;font-weight:650}
.sdot svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:3}
.step.done .sdot{background:var(--good);border-color:var(--good);color:#071210}
.step.cur .sdot{background:#3b82f6;border-color:#3b82f6;color:#fff;animation:stepPulse 1.5s ease-out infinite}
@keyframes stepPulse{0%{box-shadow:0 0 0 0 rgba(59,130,246,.55)}100%{box-shadow:0 0 0 10px rgba(59,130,246,0)}}
.slbl{font-size:.7rem;line-height:1.25;color:var(--faint);overflow-wrap:anywhere;padding:0 2px}
.step.done .slbl{color:var(--muted)}.step.cur .slbl{color:var(--text);font-weight:600}
.stepline{margin-top:12px;font-weight:600;font-size:.9rem}
.stepsub,.steplast{margin-top:2px}
@media (max-width:700px){.stepper{margin-bottom:34px}.stepper .slbl{display:none}.stepper .step.cur .slbl{display:block;position:absolute;top:34px;left:50%;transform:translateX(-50%);white-space:nowrap}.stepper .step:first-child.cur .slbl{left:0;transform:none}.stepper .step:last-child.cur .slbl{left:auto;right:0;transform:none}}
@media (prefers-reduced-motion:reduce){.step.cur .sdot{animation:none}}
.synmsg{margin-top:10px;font-size:.84rem;min-height:1.2em}
.synmsg.ok{color:var(--good)}.synmsg.bad{color:var(--bad)}
@media (prefers-reduced-motion:reduce){.syncbtn .spin,.pbar.ind .fill{animation-duration:3s}}
.mapcard{padding:10px 10px 8px}
.mapcard .mapbox{height:clamp(300px,46vh,460px)}
.mapcard .sub{margin:8px 4px 0;font-size:.72rem}
.rstats{margin:12px 0 14px}
.rstats .big{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.rstats .big .v{font-size:2.3rem;font-weight:700;letter-spacing:-.02em;line-height:1.05;font-variant-numeric:tabular-nums}
.rstats .big .u{color:var(--muted);font-size:1rem}
.rstats .when{margin:2px 0 12px}
.rstats .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
.rstats .it{padding:9px 11px;border-radius:11px;background:var(--panel2);border:1px solid var(--line)}
.rstats .it .l{display:flex;align-items:center;gap:6px;font-size:.68rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.rstats .it .l svg{width:13px;height:13px;color:var(--teal)}
.rstats .it .v{font-size:1.2rem;font-weight:650;margin-top:3px;font-variant-numeric:tabular-nums}
.rstats .it .v small{font-size:.74rem;font-weight:500;color:var(--muted);margin-left:3px}
.rstats .it .x{font-size:.72rem;color:var(--faint);margin-top:1px}
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
  var RANGE_VIEWS = { sleep: 1, recovery: 1, activity: 1, charge: 1, weight: 1 };
  var TITLES = { overview: "Overview", sleep: "Sleep", recovery: "Recovery", training: "Training", activity: "Activity", charge: "Hybrid Charge", workouts: "Workouts", exercises: "Exercises", weight: "Weight", sync: "Sync" };
  var SUBTITLES = { overview: "Today at a glance", sleep: "Nightly duration, stages and score", recovery: "HRV, resting heart rate, readiness and SpO2", training: "Weekly volume and what is planned", activity: "Steps, calories and resting heart rate", charge: "Hybrid Charge energy level", workouts: "Browse and analyze your workouts", exercises: "Strength exercise ids, names and usage", weight: "Weigh-ins and trend", sync: "Local database and sync health" };

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
    chevron: "M15 18l-6-6 6-6",
    check: "M5 12.5l4.5 4.5L19 7.5",
    refresh: "M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5",
    download: "M12 3v12M7 11l5 5 5-5M4 20h16",
    calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
    watch: "M9 3h6l1 4H8zM9 21h6l1-4H8zM7 7h10v10H7zM12 10v2.5l1.8 1",
    grid: "M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z"
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
    }).then(function (j) { if (j && j.timezone) TZ = j.timezone; if (path === "status") watchObserve(j); return j; });
  }

  // ---- sync watch: the sidebar "Sync" item animates on every page while a sync is running ---------------------------------------------
  // It piggybacks on /dashboard/api/status (every status read, from any page, updates it) and adds one light check on load, on each
  // route change and after "Sync now"; while a run is in progress it re-checks every ~3 s, otherwise only a slow check (tab visible) so a
  // scheduled run that starts while another page is open is picked up.
  var WATCH_BUSY_MS = 3000, WATCH_IDLE_MS = 45000, WATCH_MIN_GAP_MS = 2500;
  var watch = { running: false, timer: 0, last: 0 };
  function watchNav() { return document.querySelector('nav.menu a[data-route="sync"]'); }
  function watchApply(running) {
    watch.running = running;
    var a = watchNav();
    if (a) {
      a.classList.toggle("syncing", running);
      var label = running ? "Sync (running)" : "Sync";
      a.setAttribute("aria-label", label); a.setAttribute("title", label); a.setAttribute("data-tip", label);
    }
  }
  function watchSchedule() {
    if (watch.timer) clearTimeout(watch.timer);
    watch.timer = setTimeout(watchCheck, watch.running ? WATCH_BUSY_MS : WATCH_IDLE_MS);
  }
  function watchObserve(j) {
    watch.last = Date.now();
    watchApply(!!(j && j.sync && j.sync.running));
    watchSchedule();
  }
  function watchCheck() {
    watch.timer = 0;
    if (document.hidden && !watch.running) { watchSchedule(); return; }
    var gap = Date.now() - watch.last;
    if (gap < WATCH_MIN_GAP_MS) { watch.timer = setTimeout(watchCheck, WATCH_MIN_GAP_MS - gap); return; } // another status read just happened
    api("status").catch(function () { watchSchedule(); });
  }
  /** Check now (load, route change, after Sync now); skipped when the status was read a moment ago. */
  function watchKick(force) {
    if (!force && Date.now() - watch.last < WATCH_MIN_GAP_MS) return;
    if (watch.timer) { clearTimeout(watch.timer); watch.timer = 0; }
    api("status").catch(function () { watchSchedule(); });
  }

  /** POST to a dashboard mutation route with the per-session CSRF token. Resolves { status, body }; a 401 sends the user to the login page. */
  function apiPost(path) {
    var app = $("app"), csrf = app ? app.getAttribute("data-csrf") || "" : "";
    return fetch("/dashboard/api/" + path, { method: "POST", credentials: "same-origin", headers: { accept: "application/json", "x-csrf-token": csrf } }).then(function (r) {
      if (r.status === 401) { window.location.href = "/dashboard/login"; throw new Error("Signed out"); }
      return r.json().catch(function () { return {}; }).then(function (body) { return { status: r.status, body: body }; });
    });
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


  // ---- recovery -----------------------------------------------------------------------------------------------------
  function viewRecovery(box, token) {
    return api("recovery?days=" + state.days).then(function (r) {
      if (token !== navToken) return;
      clear(box);
      if (!r.available) { box.appendChild(panel("", empty("No data yet"))); return; }
      var sm = r.summary || {}, series = r.series || [], days = dateList(r.start, r.end), by = byKey(series, "date");
      var cards = [];
      cards.push(isNum(sm.avg_hrv_ms) ? card("Avg HRV", fmtInt(sm.avg_hrv_ms), "ms", sm.hrv_days + (sm.hrv_days === 1 ? " night" : " nights"), null, null, ico("pulse")) : emptyCard("Avg HRV", "No HRV data in this range"));
      cards.push(isNum(sm.avg_resting_hr_bpm) ? card("Resting HR", fmtInt(sm.avg_resting_hr_bpm), "bpm", "average over " + sm.resting_hr_days + (sm.resting_hr_days === 1 ? " day" : " days"), null, null, ico("heart")) : emptyCard("Resting HR", "No resting heart rate in this range"));
      var lr = sm.latest_readiness;
      cards.push(lr && isNum(lr.value) ? card("Readiness", fmtInt(lr.value), "/ 100", "latest " + shortDate(lr.date) + (isNum(sm.avg_readiness) ? " | avg " + fmtInt(sm.avg_readiness) : ""), null, null, ico("bolt")) : emptyCard("Readiness", "No readiness score in this range"));
      cards.push(isNum(sm.spo2_dips_total) ? card("SpO2 dips", fmtInt(sm.spo2_dips_total), sm.spo2_dips_total === 1 ? "dip" : "dips", sm.spo2_nights + " nights with data" + (isNum(sm.spo2_low) ? " | lowest " + fmtInt(sm.spo2_low) + "%" : "") + (isNum(sm.avg_odi) ? " | ODI " + fmt1(sm.avg_odi) + "/h" : ""), null, null, ico("moon")) : emptyCard("SpO2 dips", "No SpO2 dip data in this range"));
      box.appendChild(h("div", { "class": "cards" }, cards));
      if (!series.length) { box.appendChild(panel("", empty("No recovery data stored for this range yet. It is filled by the sync."))); return; }
      var hrvPts = days.map(function (d) { var x = by[d]; var v = x && isNum(x.hrv_ms) ? x.hrv_ms : null; return { label: shortDate(d), v: v, tip: shortDate(d) + ": HRV " + fmtInt(v) + " ms" }; });
      var rhrPts = days.map(function (d) { var x = by[d]; var v = x && isNum(x.resting_hr_bpm) ? x.resting_hr_bpm : null; return { label: shortDate(d), v: v, tip: shortDate(d) + ": resting HR " + fmtInt(v) + " bpm" }; });
      var rdyPts = days.map(function (d) { var x = by[d]; var v = x && isNum(x.readiness) ? x.readiness : null; return { label: shortDate(d), v: v, tip: shortDate(d) + ": readiness " + fmtInt(v) }; });
      box.appendChild(h("div", { "class": "grid2" }, [
        panel("HRV (ms)", [chart({ kind: "line", points: hrvPts, fmt: fmtInt, mean: avg(hrvPts.map(function (p) { return p.v; })), color: "var(--teal)", emptyText: "No HRV data in this range" }), legend([{ name: "overnight HRV (SDNN)", color: "var(--teal)" }])]),
        panel("Resting heart rate (bpm)", [chart({ kind: "line", points: rhrPts, fmt: fmtInt, mean: avg(rhrPts.map(function (p) { return p.v; })), color: "var(--bad)", emptyText: "No resting heart rate in this range" }), legend([{ name: "resting HR", color: "var(--bad)" }])])
      ]));
      box.appendChild(panel("Readiness", [chart({ kind: "bar", points: rdyPts, fmt: fmtInt, steps: [10, 20, 25, 50], mean: avg(rdyPts.map(function (p) { return p.v; })), color: "var(--teal)", emptyText: "No readiness scores in this range" }), rangeNote(r)]));
      box.appendChild(h("p", { "class": "hint", text: "HRV is the average of the overnight SDNN readings the watch reports, filed under the day you wake up. Resting heart rate is the daily value, or the sleeping resting rate from the readiness record when the daily one is missing. Readiness is Zepp's own score; nothing here is calculated by this dashboard except the averages." }));
    });
  }

  // ---- training -----------------------------------------------------------------------------------------------------
  function agoText(min) {
    if (!isNum(min)) return "";
    if (min < 1) return "just now";
    if (min < 60) return min + " min ago";
    if (min < 48 * 60) return Math.floor(min / 60) + " h ago";
    return Math.floor(min / 1440) + " days ago";
  }
  function periodCard(label, p, sub) {
    var line = p.count + (p.count === 1 ? " workout" : " workouts") + " | " + fmtDur(p.duration_s) + (p.calories_kcal > 0 ? " | " + fmtInt(p.calories_kcal) + " kcal" : "");
    return card(label, p.distance_m > 0 ? (p.distance_m / 1000).toFixed(1) : "0", "km", [h("div", { text: line }), sub ? h("div", { text: sub }) : null], null, null, ico("route"));
  }
  function viewTraining(box, token) {
    return api("training").then(function (t) {
      if (token !== navToken) return;
      clear(box);
      if (!t.available) { box.appendChild(panel("", empty("No data yet"))); return; }
      if (t.watch && t.watch.available && t.watch.last_sync_at) {
        box.appendChild(h("div", { "class": "watchpill", title: "Last time the phone uploaded the watch's data to Zepp" }, [ico("watch"), h("span", { text: "Watch last synced " + agoText(t.watch.minutes_ago) })]));
      }
      box.appendChild(h("div", { "class": "cards" }, [
        periodCard("This week", t.this_week, "so far"),
        periodCard("Last week", t.last_week, ""),
        periodCard("This month", t.this_month, "so far"),
        periodCard("Last month", t.last_month, "")
      ]));
      var weeks = t.weeks || [];
      var pts = weeks.map(function (w) { var km = w.distance_m / 1000; return { label: shortDate(w.week_start), v: km, tip: "Week of " + shortDate(w.week_start) + ": " + km.toFixed(1) + " km, " + w.count + (w.count === 1 ? " workout" : " workouts") + ", " + fmtDur(w.duration_s) }; });
      box.appendChild(panel("Weekly distance, last " + weeks.length + " weeks (km)", [chart({ kind: "bar", points: pts, fmt: function (v) { return fmt1(v); }, mean: avg(pts.map(function (p) { return p.v; })), emptyText: "No workouts in these weeks" }), h("div", { "class": "sub", text: "Weeks start on Monday. Distance of every stored workout that recorded one." })]));
      if ((t.sports || []).length) {
        box.appendChild(panel("This month by sport", table(["Sport", "Workouts", "Time", "Distance"], t.sports.map(function (x) { return [typeName(x.activity_type), fmtInt(x.count), fmtDur(x.duration_s), x.distance_m > 0 ? fmtKm(x.distance_m) : "-"]; }), [1, 2, 3])));
      }
      if ((t.planned || []).length) {
        box.appendChild(panel("Planned workouts", [h("div", { "class": "planstrip" }, t.planned.slice(0, 14).map(function (p) {
          return h("div", { "class": "plan" }, [h("div", { "class": "d", text: fmtZone(p.start_at, { weekday: "short", day: "numeric", month: "short" }) }), h("div", { "class": "t", title: p.title, text: p.title })]);
        })), h("div", { "class": "sub", text: "Read from the training calendar in the Zepp app. Read only." })]));
      }
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

  // "Sync now": starts the server's normal sync (the server picks the window: last success minus the overlap; the page sends no dates), then polls the status
  // and shows the step stepper from the progress the sync reports.
  var SYNC_POLL_MS = 2000;
  function syncControl(box, token, st) {
    var sy = st.sync;
    if (!sy || sy.manual_available === false) return null;
    var overlap = isNum(sy.overlap_days) ? sy.overlap_days : null;
    var ui = state.syncUi || (state.syncUi = { msg: null, timer: 0 });
    var btn = h("button", { type: "button", "class": "syncbtn primary" });
    var spin = h("span", { "class": "spin", "aria-hidden": "true" });
    var label = h("span", { "class": "lbl" });
    btn.appendChild(ico("refresh")); btn.appendChild(spin); btn.appendChild(label);
    var hint = h("div", { "class": "sub synchint", text: overlap !== null ? "Fetches since the last sync (+" + overlap + (overlap === 1 ? " day" : " days") + " overlap)" : "Fetches new data since the last sync" });
    var fill = h("div", { "class": "fill" });
    var bar = h("div", { "class": "pbar ind hidden", role: "progressbar", "aria-label": "Sync progress" }, fill);
    var stepper = h("ol", { "class": "stepper hidden", "aria-label": "Sync steps" });
    var stepLine = h("div", { "class": "stepline hidden" });
    var stepSub = h("div", { "class": "sub stepsub hidden" });
    var lastLine = h("div", { "class": "sub steplast hidden" });
    var stepSig = "";
    var msg = h("div", { "class": "synmsg", role: "status", "aria-live": "polite" });
    var wrap = h("div", { "class": "syncctl" }, [h("div", { "class": "synctop" }, [btn, hint]), stepper, stepLine, stepSub, lastLine, bar, msg]);
    function showMsg(kind, text) { ui.msg = text ? { kind: kind, text: text } : null; msg.textContent = text || ""; msg.className = "synmsg" + (text ? " " + kind : ""); }
    function paint(running, progress) {
      btn.disabled = running; btn.setAttribute("aria-busy", running ? "true" : "false");
      btn.classList.toggle("busy", running);
      label.textContent = running ? "Syncing\u2026" : "Sync now";
      var steps = running && progress && progress.steps && progress.steps.length ? progress.steps : null;
      bar.classList.toggle("hidden", !running || !!steps); // no progress reported (yet): an indeterminate bar, nothing invented
      [stepper, stepLine, stepSub, lastLine].forEach(function (el) { el.classList.toggle("hidden", !steps); });
      if (!steps) { stepSig = ""; return; }
      var sig = steps.map(function (x) { return x.id; }).join(",");
      if (sig !== stepSig) {
        stepSig = sig; clear(stepper);
        steps.forEach(function (x) {
          stepper.appendChild(h("li", { "class": "step" }, [h("span", { "class": "sdot", "aria-hidden": "true" }), h("span", { "class": "slbl", text: x.label })]));
        });
      }
      var cur = progress.current;
      [].forEach.call(stepper.children, function (li, i) {
        li.className = "step " + (i < cur ? "done" : i === cur ? "cur" : "pend");
        if (i === cur) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
        var dot = li.firstChild; clear(dot);
        if (i < cur) dot.appendChild(ico("check")); else dot.textContent = String(i + 1);
      });
      stepLine.textContent = "Step " + (cur + 1) + " of " + steps.length + ": " + steps[cur].label + (progress.chunk ? " (window " + progress.chunk.index + " of " + progress.chunk.total + ")" : "");
      var since = progress.window_start ? shortDate(progress.window_start) : "";
      stepSub.textContent = "Fetching since " + since + (progress.mode === "backfill" ? " (first sync backfill)" : progress.mode === "overlap" ? " (last sync + " + (isNum(progress.overlap_days) ? progress.overlap_days : 2) + " days overlap)" : "");
      lastLine.textContent = "Last sync: " + (st.last_success && st.last_success.finished_at ? localDateTime(st.last_success.finished_at) : "never");
    }
    function stop() { if (ui.timer) { clearTimeout(ui.timer); ui.timer = 0; } }
    function done() {
      stop();
      // the run is over: reload the status, coverage and recent runs, and say how it went (from the stored run, never upstream text)
      api("status").then(function (next) {
        if (token !== navToken) return;
        var lr = next.last_run;
        if (lr && lr.ok) showMsg("ok", "Sync finished.");
        else if (lr) showMsg("bad", "Sync failed" + (lr.error_kind ? " (" + lr.error_kind + ")" : "") + ". See Recent runs.");
        else showMsg("bad", "Sync did not record a run.");
        paintView(box, token, next);
      }).catch(function () { if (token === navToken) { paint(false); showMsg("bad", "Could not read the sync status."); } });
    }
    function poll() {
      stop();
      ui.timer = setTimeout(function () {
        ui.timer = 0;
        if (token !== navToken || !wrap.isConnected) return;
        api("status").then(function (next) {
          if (token !== navToken || !wrap.isConnected) return;
          var run = next.sync && next.sync.running;
          if (run) { paint(true, next.sync.progress); poll(); } else done();
        }).catch(function () { if (token === navToken && wrap.isConnected) poll(); });
      }, SYNC_POLL_MS);
    }
    btn.addEventListener("click", function () {
      if (btn.disabled) return;
      showMsg("", ""); paint(true, null);
      apiPost("sync/run").then(function (r) {
        if (r.status === 202 || r.status === 409) { paint(true, null); watchApply(true); watchSchedule(); poll(); return; }
        paint(false);
        showMsg("bad", r.status === 429 ? "Too many manual syncs. Try again later." : r.status === 403 ? "Your session expired. Reload the page and try again." : r.status === 503 ? "Manual sync is not available." : "Could not start the sync.");
      }).catch(function () { paint(false); showMsg("bad", "Could not start the sync."); });
    });
    var running = !!sy.running;
    paint(running, sy.progress);
    if (ui.msg && !running) showMsg(ui.msg.kind, ui.msg.text);
    if (running) poll();
    return wrap;
  }
  function paintView(box, token, st) {
    clear(box);
    if (!st.available) { box.appendChild(panel("", empty("Local database not available yet"))); return; }
    var ctl = syncControl(box, token, st);
    box.appendChild(panel("Status", [ctl, syncLine(st),
      st.last_run ? h("div", { class: "sub", text: "Last run " + localDateTime(st.last_run.started_at) + " (" + st.last_run.trigger + ", " + shortDate(st.last_run.range_start) + " to " + shortDate(st.last_run.range_end) + ")" }) : null]));
    box.appendChild(panel("Coverage", table(["Data", "Rows", "First", "Last"], st.coverage.map(function (c) { return [c.table.replace(/_/g, " "), fmtInt(c.rows), c.first ? shortDate(c.first) + " " + c.first.slice(0, 4) : "-", c.last ? shortDate(c.last) + " " + c.last.slice(0, 4) : "-"]; }), [1])));
    box.appendChild(panel("Recent runs", (st.recent_runs || []).length ? table(["Started", "Trigger", "Result"], st.recent_runs.map(function (r) {
      return [localDateTime(r.started_at), r.trigger, h("span", { class: "badge " + (r.ok ? "ok" : r.status === "running" ? "warn" : "bad"), text: r.ok ? "ok" : r.status + (r.error_kind ? " (" + r.error_kind + ")" : "") })];
    })) : empty("No sync runs yet")));
    box.appendChild(h("div", { class: "sub", text: "Strength sets " + fmtInt(st.strength_sets) + " | charge insights " + fmtInt(st.charge_insights) + " | schema v" + st.schema_version + " | database " + (isNum(st.db_bytes) ? (st.db_bytes / 1048576).toFixed(1) + " MB" : "-") + " | times in " + TZ }));
  }
  function viewSync(box, token) {
    return api("status").then(function (st) {
      if (token !== navToken) return;
      paintView(box, token, st);
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
    // small picture left of the bold value: body map for strength with muscle data, route shape for GPS workouts, else none
    var lead = hasSets && hasMuscles(w.muscles) ? bodyMap(w.muscles, "sm") : (!hasSets && w.thumb && w.thumb.pts && w.thumb.pts.length > 1 ? routeThumbEl(w.thumb) : null);
    return h("a", { class: "wrow" + (w.workout_id === selId ? " sel" : ""), href: "#/workouts/" + encodeURIComponent(w.workout_id), onclick: function () { if (state.wkUi) state.wkUi.skipScroll = true; } }, [
      sportChip(w.activity_type),
      h("div", { class: "wmain" }, [
        h("div", { class: "t" }, [typeName(w.activity_type), " ", typeBadge(w, true)]),
        h("div", { class: "sub", text: shortDate(w.started_date) + " \u00b7 " + localTime(w.started_at) })
      ]),
      lead ? h("div", { class: "r lead" }, [lead, h("div", { class: "rt" }, right)]) : h("div", { class: "r" }, right)
    ]);
  }
  /** A GPS route as a tiny dark SVG polyline. The server sends only the normalised shape (no coordinates, no tiles). */
  function routeThumbEl(t) {
    // 64px square tile: faint street-like lines behind one clean route line, drawn at its true aspect ratio with padding all round
    var S = 64, pad = 11, k = (S - pad * 2) / Math.max(t.w, t.h, 1), ox = (S - t.w * k) / 2, oy = (S - t.h * k) / 2;
    var pts = t.pts.map(function (p) { return (ox + p[0] * k).toFixed(1) + "," + (oy + p[1] * k).toFixed(1); }), a = t.pts[0];
    var street = { fill: "none", stroke: "rgba(255,255,255,.07)", "stroke-width": "2", "stroke-linecap": "round" };
    return s("svg", { "class": "rthumb", width: S, height: S, viewBox: "0 0 " + S + " " + S, role: "img", "aria-label": "Route shape", preserveAspectRatio: "xMidYMid meet" }, [
      s("path", Object.assign({ d: "M-2 20L66 14M-2 46L66 52M22 -2L18 66M45 -2L50 66" }, street)),
      s("path", Object.assign({ d: "M-2 33L66 31M33 -2L32 66", "stroke-width": "3.2" }, street)),
      s("polyline", { points: pts.join(" "), fill: "none", stroke: "var(--teal)", "stroke-width": "2.6", "stroke-linejoin": "round", "stroke-linecap": "round" }),
      s("circle", { cx: ox + a[0] * k, cy: oy + a[1] * k, r: 3.4, fill: "var(--good)", stroke: "#05070b", "stroke-width": "1.2" })
    ]);
  }
  function renderDetail(pane, id, token) {
    clear(pane); pane.appendChild(skeleton());
    return api("workouts/" + encodeURIComponent(id)).then(function (r) {
      if (token !== navToken) return;
      clear(pane);
      var w = r.workout;
      pane.appendChild(h("a", { class: "back", href: "#/workouts" }, "< All workouts"));
      var heroEl = h("div", { class: "hero" }, [sportChip(w.activity_type, true), h("div", { class: "htxt" }, [
        h("h2", null, [typeName(w.activity_type), typeBadge(w, true)]),
        h("div", { class: "sub", text: shortDate(w.started_date) + " " + String(w.started_date || "").slice(0, 4) + " \u00b7 " + localTime(w.started_at) + " - " + localTime(w.ended_at) })
      ])]);
      pane.appendChild(heroEl);
      var tiles = [];
      if (isNum(w.distance_m) && w.distance_m > 0) tiles.push(card("Distance", (w.distance_m / 1000).toFixed(2), "km", ""));
      tiles.push(card("Duration", fmtDur(w.duration_s), "", ""));
      tiles.push(card("Heart rate", fmtInt(w.avg_hr_bpm), "bpm avg", "max " + fmtInt(w.max_hr_bpm)));
      tiles.push(card("Energy", fmtInt(w.calories_kcal), "kcal", isNum(w.training_load) ? "load " + fmtInt(w.training_load) : ""));
      var tilesEl = h("div", { class: "cards stats" }, tiles);
      var strengthWorkout = w.zepp_type === 52 || /strength/.test(String(w.activity_type));
      // "Muscles used" (estimated from the exercise ids) sits right under the header; it only exists when some set has muscle data
      if (strengthWorkout && hasMuscles(r.muscles)) pane.appendChild(musclesCard(r.muscles));
      pane.appendChild(tilesEl);
      if (!strengthWorkout) pane.appendChild(renderAnalysis(w, id, token, [heroEl, tilesEl]));
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
  // ---- body map: front and back figures with one shape per muscle group (own inline SVG artwork, no external assets) ---------------
  // Each figure is drawn for its left half (x < 60) and mirrored for the right half; the head is drawn once. Every muscle id of the
  // catalogue maps to one or more regions ("neck" and "upper_back" also cover the traps, "forearms" both forearms and so on).
  // The colouring is an estimate derived from the exercise ids of a workout (Zepp/Gadgetbridge catalogue), not measured by the watch.
  var BM_LABEL = { abs: "Abs", front_delts: "Front delts", chest: "Chest", obliques: "Obliques", biceps: "Biceps", forearms: "Forearms", quads: "Quads", calves: "Calves", lats: "Lats", triceps: "Triceps", glutes: "Glutes", hamstrings: "Hamstrings", shins: "Shins", hip_flexors: "Hip flexors", upper_back: "Upper back", lower_back: "Lower back", rear_delts: "Rear delts", neck: "Neck", inner_thighs: "Inner thighs", outer_hips: "Outer hips", lower_abs: "Lower abs" };
  var BM_HEAD = "M60 6C54.3 6 50.5 10.5 50.5 17C50.5 24 54.5 29.5 60 29.5C65.5 29.5 69.5 24 69.5 17C69.5 10.5 65.7 6 60 6Z";
  var BM_FRONT = {
    base: ["M60 45C60 45 53.5 44.7 50 45.5C46.5 46.3 41.8 48.2 39 50C36.2 51.8 34.1 53.3 33.5 56C32.9 58.7 34.8 62.3 35.5 66C36.2 69.7 36.8 73 37.5 78C38.2 83 39.3 90.7 40 96C40.7 101.3 41.8 105.3 41.5 110C41.2 114.7 39.4 119.7 38.5 124C37.6 128.3 35.6 132.7 36 136C36.4 139.3 37.3 142 41 144C44.7 146 58 148 58 148L60 148L60 45Z",
      "M23.2 62.3C20.7 62.8 22.2 66.6 21.7 68.7C21.2 70.8 20.7 73 20.3 75.1C19.8 77.3 19.3 79.4 18.9 81.6C18.4 83.7 18 85.9 17.6 88C17.2 90.2 16.9 92.4 16.5 94.5C16 96.6 15.7 98.6 15.2 100.7C14.6 102.7 13.8 104.8 13.1 106.9C12.4 109 11.6 111 11 113.2C10.5 115.3 10.2 117.6 9.8 119.8C9.4 122 9.1 124.1 8.7 126.3C8.3 128.5 8 130.7 7.6 132.8C7.2 135 6.7 137.1 6.1 139.3C5.5 141.4 4.4 143.6 4.2 145.8C4 148.1 4.4 151.5 5 152.7C5.6 153.9 6.9 154.2 8 153.3C9.1 152.4 10.7 149.3 11.4 147.3C12.1 145.2 12 143.1 12.5 141C13 139 13.8 136.9 14.5 134.8C15.3 132.7 16.1 130.7 17 128.6C17.8 126.6 18.6 124.5 19.4 122.5C20.2 120.5 21.2 118.6 21.9 116.5C22.6 114.4 23.1 112.3 23.7 110.2C24.3 108.1 24.8 106 25.5 103.8C26.1 101.7 26.9 99.4 27.6 97.3C28.3 95.2 28.9 93.1 29.6 91C30.3 88.9 30.9 86.8 31.6 84.7C32.2 82.6 32.8 80.5 33.4 78.4C33.9 76.3 34.5 74.2 35.1 72.1C35.7 69.9 38.8 67.3 36.8 65.7C34.8 64.1 25.7 61.8 23.2 62.3Z",
      "M36.1 137.1C32.3 137.9 35.8 141.6 35.6 143.8C35.5 146 35.4 148.3 35.3 150.5C35.1 152.8 35 155 34.9 157.3C34.9 159.5 35 161.9 35 164.2C35.1 166.5 35.2 168.7 35.3 171C35.4 173.2 35.5 175.5 35.6 177.7C35.7 180 36.2 182.3 36 184.5C35.8 186.7 34.8 188.9 34.5 191.1C34.2 193.3 34.2 195.6 34.2 197.8C34.2 200.1 34.2 202.3 34.3 204.6C34.5 206.9 34.9 209.2 35.1 211.4C35.4 213.7 35.7 216 36 218.2C36.2 220.5 36.4 222.8 36.6 225C36.7 227.3 35.7 230.6 36.9 231.8C38.2 233 42.7 233.3 44.1 232.2C45.5 231.2 44.8 227.8 45.3 225.6C45.7 223.3 46.2 221.1 46.7 218.9C47.2 216.7 47.8 214.5 48.4 212.3C48.9 210.1 49.6 207.9 50.1 205.7C50.5 203.5 50.8 201.2 51.1 199C51.4 196.8 51.7 194.5 51.7 192.3C51.8 190 51 187.7 51.1 185.5C51.3 183.2 52 181 52.4 178.8C52.8 176.6 53.1 174.3 53.5 172.1C53.9 169.9 54.3 167.6 54.6 165.4C55 163.3 55.4 161.2 55.7 159C56 156.8 56.2 154.5 56.5 152.3C56.8 150.1 57 147.8 57.2 145.6C57.5 143.4 61.5 140.3 57.9 138.9C54.4 137.5 39.8 136.3 36.1 137.1Z",
      "M36 233C37.9 231.5 44.1 231.5 46 233C47.9 234.5 48.8 239.8 47.5 242C46.2 244.2 40.2 246 38 246C35.8 246 34.8 244.2 34.5 242C34.2 239.8 34.1 234.5 36 233Z"],
    regions: [
      ["neck", "M54 30.5L60 30.5L60 47C60 47 51.1 46.3 50 45C48.9 43.7 52.5 41.4 53.2 39C53.9 36.6 54 30.5 54 30.5Z"],
      ["chest", "M59.4 54C59.4 54 54.6 52.6 52 52.5C49.4 52.4 46.2 52.6 44 53.5C41.8 54.4 39.6 55.9 38.5 58C37.4 60.1 37 63.5 37.2 66C37.5 68.5 38.4 71.2 40 73C41.6 74.8 44.7 76.1 47 76.5C49.3 76.9 51.9 76 54 75.5C56.1 75 59.4 73.5 59.4 73.5L59.4 54Z"],
      ["obliques", "M37.5 80C38.5 78.8 41.9 80.9 44 81C46.1 81.1 49.3 75.2 50.4 80.5C51.5 85.8 51.1 107.1 50.4 113C49.7 118.9 47.5 116.3 46 116C44.5 115.7 42.6 114 41.6 111C40.6 108 40.6 101.8 40 98C39.4 94.2 38.6 91 38.2 88C37.8 85 36.5 81.2 37.5 80Z"],
      ["abs", "M59.4 78C59.4 78 54.5 77.6 53.2 77.8C51.9 78 52 77.8 51.8 79.4C51.6 81 51.6 86 51.8 87.6C52 89.2 51.9 89 53.2 89.2C54.5 89.4 59.4 89 59.4 89L59.4 78Z"],
      ["abs", "M59.4 91C59.4 91 54.5 90.6 53.2 90.8C51.9 91 52 90.8 51.8 92.4C51.6 94 51.6 99 51.8 100.6C52 102.2 51.9 102 53.2 102.2C54.5 102.4 59.4 102 59.4 102L59.4 91Z"],
      ["abs", "M59.4 104C59.4 104 54.5 103.6 53.2 103.8C51.9 104 52 103.8 51.8 105.4C51.6 107 51.6 112 51.8 113.6C52 115.2 51.9 115 53.2 115.2C54.5 115.4 59.4 115 59.4 115L59.4 104Z"],
      ["lower_abs", "M59.4 117C59.4 117 54.5 116.6 53.2 116.8C51.9 117 52 116.9 51.8 118.4C51.6 120 51.6 124.5 51.8 126.1C52 127.6 51.9 127.5 53.2 127.7C54.5 127.9 59.4 127.5 59.4 127.5L59.4 117Z"],
      ["hip_flexors", "M50.4 128L59.4 127L59.4 145C59.4 145 52.3 141.5 50 139.5C47.7 137.5 45.4 134.9 45.5 133C45.6 131.1 50.4 128 50.4 128Z"],
      ["outer_hips", "M37.3 114C38.4 112.4 41.8 114.3 43.3 116.5C44.8 118.7 45.9 123.2 46 127C46.1 130.8 45.2 137.3 44 139C42.8 140.7 39.8 139.2 38.5 137C37.2 134.8 36.7 129.8 36.5 126C36.3 122.2 36.2 115.6 37.3 114Z"],
      ["front_delts", "M44 51C43.2 50.1 39.2 49.2 37 49.5C34.8 49.8 32.2 50.9 30.5 52.5C28.8 54.1 27.3 56.6 26.5 59C25.7 61.4 25.2 64.5 25.5 67C25.8 69.5 26.8 72.5 28 74C29.2 75.5 31.5 76.7 33 76C34.5 75.3 36.1 72.3 37 70C37.9 67.7 37.7 64.5 38.5 62C39.3 59.5 41.1 56.8 42 55C42.9 53.2 44.8 51.9 44 51Z"],
      ["biceps", "M21.4 75.1C19.5 75.2 20.9 77.1 20.6 78C20.3 79 20.1 80 19.9 80.9C19.6 81.9 19.4 82.9 19.2 83.9C19 84.8 18.9 85.8 18.7 86.8C18.5 87.8 18.4 88.8 18.2 89.8C18.1 90.8 18 91.8 17.8 92.8C17.7 93.8 17.6 94.8 17.5 95.7C17.3 96.7 15.8 97.9 17.1 98.7C18.4 99.6 23.5 100.9 25 100.7C26.5 100.6 25.8 98.9 26.1 97.9C26.5 97 26.9 96 27.2 95.1C27.6 94.2 27.9 93.2 28.3 92.3C28.6 91.3 28.9 90.4 29.2 89.4C29.6 88.5 29.9 87.5 30.2 86.6C30.4 85.6 30.7 84.7 31 83.7C31.2 82.7 31.5 81.8 31.7 80.8C31.9 79.8 34.1 78.8 32.3 77.9C30.6 76.9 23.4 75.1 21.4 75.1Z"],
      ["forearms", "M15.3 102.8C13.5 103 14.2 105.7 13.6 107.1C13 108.5 12.3 109.9 11.9 111.4C11.4 112.8 11.2 114.4 10.9 115.9C10.6 117.4 10.3 119 10 120.5C9.7 122.1 9.5 123.6 9.3 125.1C9 126.6 8.8 128.2 8.5 129.7C8.3 131.2 8.1 132.8 7.8 134.3C7.5 135.8 6.1 137.8 6.8 138.8C7.5 139.8 11 140.7 12.1 140.3C13.3 139.8 13 137.3 13.6 135.9C14.1 134.4 14.8 133 15.3 131.6C15.9 130.2 16.5 128.7 17.1 127.3C17.7 125.9 18.3 124.4 18.9 123C19.4 121.6 20 120.2 20.5 118.8C21.1 117.4 21.8 116 22.2 114.5C22.7 113.1 22.8 111.5 23.2 110C23.5 108.5 25.5 106.7 24.2 105.5C22.9 104.3 17 102.5 15.3 102.8Z"],
      ["quads", "M36.1 137.1C33.1 137.8 35.7 140.9 35.6 142.8C35.4 144.7 35.3 146.6 35.2 148.5C35.1 150.4 35 152.3 35 154.2C35 156.1 34.9 158 35 159.9C35.1 161.9 35.3 163.9 35.5 165.9C35.6 167.8 35.8 169.7 36 171.7C36.2 173.6 36.4 175.5 36.6 177.4C36.8 179.3 35.5 182.1 37.2 183.2C39 184.2 45.4 184.6 47.2 183.8C49.1 183 47.8 180 48.1 178.1C48.4 176.2 48.7 174.4 49 172.5C49.3 170.6 49.6 168.7 49.9 166.8C50.2 164.9 50.5 163.1 50.8 161.2C51 159.4 51.3 157.5 51.5 155.6C51.7 153.7 51.9 151.8 52.1 149.9C52.3 148 52.5 146.1 52.6 144.2C52.8 142.3 55.9 139.7 53.1 138.5C50.4 137.3 39 136.4 36.1 137.1Z"],
      ["inner_thighs", "M53.8 138.6C53 139.3 53.5 141.5 53.4 143C53.3 144.5 53.1 146 53 147.5C52.8 149 52.6 150.4 52.4 151.9C52.2 153.4 52 154.9 51.8 156.4C51.6 157.8 51.3 159.3 51 160.8C50.8 162.2 50.5 163.6 50.2 165.1C49.9 166.6 49.6 168.1 49.3 169.5C49.1 171 48.2 173.2 48.5 174C48.8 174.7 50.5 174.8 51.1 174.1C51.7 173.4 51.9 171.2 52.3 169.7C52.7 168.2 53.1 166.7 53.5 165.3C53.9 163.9 54.3 162.5 54.6 161.1C55 159.7 55.3 158.2 55.6 156.7C55.9 155.2 56.2 153.7 56.4 152.3C56.7 150.8 56.9 149.3 57.1 147.8C57.2 146.3 57.4 144.9 57.5 143.4C57.7 141.9 58.6 139.7 57.9 138.9C57.3 138.1 54.5 137.9 53.8 138.6Z"],
      ["shins", "M39.4 187.5C37.5 188.2 38.8 190.7 38.6 192.3C38.4 193.9 38.4 195.5 38.3 197.1C38.2 198.7 38 200.4 38 202C38 203.6 38 205.2 38 206.8C38.1 208.4 38.2 210.1 38.2 211.7C38.3 213.3 38.4 214.9 38.5 216.5C38.6 218.1 38.7 219.8 38.7 221.4C38.8 223 37.9 225.4 38.8 226.2C39.8 227.1 43.3 227.3 44.4 226.6C45.5 225.8 45 223.4 45.4 221.8C45.7 220.2 46.2 218.6 46.6 217C47 215.5 47.4 213.9 47.8 212.3C48.2 210.7 48.7 209.1 49 207.6C49.4 206 49.7 204.4 50 202.8C50.2 201.2 50.3 199.6 50.4 198C50.6 196.4 50.8 194.8 50.8 193.2C50.7 191.5 52.1 189.2 50.2 188.3C48.3 187.3 41.3 186.9 39.4 187.5Z"],
      ["calves", "M36.3 186.4C35.8 186.9 35.8 188.4 35.5 189.4C35.3 190.4 35 191.4 34.8 192.4C34.7 193.4 34.8 194.5 34.7 195.5C34.7 196.5 34.7 197.5 34.8 198.6C34.8 199.6 34.8 200.6 34.9 201.6C35 202.7 35.1 203.7 35.3 204.7C35.4 205.8 35.7 206.8 35.9 207.9C36.1 208.9 36 210.4 36.5 211C36.9 211.5 38.2 211.6 38.5 211.1C38.8 210.6 38.3 209 38.2 208C38.1 207 38 205.9 37.9 204.9C37.8 203.9 37.8 202.9 37.7 201.8C37.7 200.8 37.7 199.8 37.7 198.8C37.8 197.7 37.8 196.7 37.8 195.7C37.8 194.7 37.8 193.6 38 192.6C38.1 191.6 38.3 190.6 38.5 189.6C38.6 188.6 39.4 187.1 39 186.6C38.7 186 36.9 185.9 36.3 186.4Z"]
    ]
  };
  var BM_BACK = {
    base: ["M60 45C60 45 53.5 44.7 50 45.5C46.5 46.3 41.8 48.2 39 50C36.2 51.8 34.1 53.3 33.5 56C32.9 58.7 34.8 62.3 35.5 66C36.2 69.7 36.8 73 37.5 78C38.2 83 39.3 90.7 40 96C40.7 101.3 41.8 105.3 41.5 110C41.2 114.7 39.4 119.7 38.5 124C37.6 128.3 35.6 132.7 36 136C36.4 139.3 37.3 142 41 144C44.7 146 58 148 58 148L60 148L60 45Z",
      "M23.2 62.3C20.7 62.8 22.2 66.6 21.7 68.7C21.2 70.8 20.7 73 20.3 75.1C19.8 77.3 19.3 79.4 18.9 81.6C18.4 83.7 18 85.9 17.6 88C17.2 90.2 16.9 92.4 16.5 94.5C16 96.6 15.7 98.6 15.2 100.7C14.6 102.7 13.8 104.8 13.1 106.9C12.4 109 11.6 111 11 113.2C10.5 115.3 10.2 117.6 9.8 119.8C9.4 122 9.1 124.1 8.7 126.3C8.3 128.5 8 130.7 7.6 132.8C7.2 135 6.7 137.1 6.1 139.3C5.5 141.4 4.4 143.6 4.2 145.8C4 148.1 4.4 151.5 5 152.7C5.6 153.9 6.9 154.2 8 153.3C9.1 152.4 10.7 149.3 11.4 147.3C12.1 145.2 12 143.1 12.5 141C13 139 13.8 136.9 14.5 134.8C15.3 132.7 16.1 130.7 17 128.6C17.8 126.6 18.6 124.5 19.4 122.5C20.2 120.5 21.2 118.6 21.9 116.5C22.6 114.4 23.1 112.3 23.7 110.2C24.3 108.1 24.8 106 25.5 103.8C26.1 101.7 26.9 99.4 27.6 97.3C28.3 95.2 28.9 93.1 29.6 91C30.3 88.9 30.9 86.8 31.6 84.7C32.2 82.6 32.8 80.5 33.4 78.4C33.9 76.3 34.5 74.2 35.1 72.1C35.7 69.9 38.8 67.3 36.8 65.7C34.8 64.1 25.7 61.8 23.2 62.3Z",
      "M36.1 137.1C32.3 137.9 35.8 141.6 35.6 143.8C35.5 146 35.4 148.3 35.3 150.5C35.1 152.8 35 155 34.9 157.3C34.9 159.5 35 161.9 35 164.2C35.1 166.5 35.2 168.7 35.3 171C35.4 173.2 35.5 175.5 35.6 177.7C35.7 180 36.2 182.3 36 184.5C35.8 186.7 34.8 188.9 34.5 191.1C34.2 193.3 34.2 195.6 34.2 197.8C34.2 200.1 34.2 202.3 34.3 204.6C34.5 206.9 34.9 209.2 35.1 211.4C35.4 213.7 35.7 216 36 218.2C36.2 220.5 36.4 222.8 36.6 225C36.7 227.3 35.7 230.6 36.9 231.8C38.2 233 42.7 233.3 44.1 232.2C45.5 231.2 44.8 227.8 45.3 225.6C45.7 223.3 46.2 221.1 46.7 218.9C47.2 216.7 47.8 214.5 48.4 212.3C48.9 210.1 49.6 207.9 50.1 205.7C50.5 203.5 50.8 201.2 51.1 199C51.4 196.8 51.7 194.5 51.7 192.3C51.8 190 51 187.7 51.1 185.5C51.3 183.2 52 181 52.4 178.8C52.8 176.6 53.1 174.3 53.5 172.1C53.9 169.9 54.3 167.6 54.6 165.4C55 163.3 55.4 161.2 55.7 159C56 156.8 56.2 154.5 56.5 152.3C56.8 150.1 57 147.8 57.2 145.6C57.5 143.4 61.5 140.3 57.9 138.9C54.4 137.5 39.8 136.3 36.1 137.1Z",
      "M36 233C37.9 231.5 44.1 231.5 46 233C47.9 234.5 48.8 239.8 47.5 242C46.2 244.2 40.2 246 38 246C35.8 246 34.8 244.2 34.5 242C34.2 239.8 34.1 234.5 36 233Z"],
    regions: [
      ["neck", "M54 30.5L60 30.5L60 46C60 46 52.6 45.7 51.5 44.5C50.4 43.3 52.8 41.3 53.2 39C53.6 36.7 54 30.5 54 30.5Z"],
      ["lats", "M36.6 72C37.3 68 40.8 66.7 43 68C45.2 69.3 48.3 75.7 50 80C51.7 84.3 52.8 89.3 53 94C53.2 98.7 52 104.7 51 108C50 111.3 48.5 114 47 114C45.5 114 43.4 111.7 42 108C40.6 104.3 39.5 98 38.6 92C37.7 86 35.9 76 36.6 72Z"],
      ["lower_back", "M59.4 90C59.4 90 55.1 91.7 54 94C52.9 96.3 53 100.3 53 104C53 107.7 52.9 113.8 54 116C55.1 118.2 59.4 117 59.4 117L59.4 90Z"],
      ["glutes", "M59.4 119C59.4 119 53.1 117.8 50.5 118C47.9 118.2 45.5 118.5 43.5 120C41.5 121.5 39.4 124 38.6 127C37.9 130 37.8 135 39 138C40.2 141 43.7 143.7 46 145C48.3 146.3 50.8 146.2 53 146C55.2 145.8 59.4 143.5 59.4 143.5L59.4 119Z"],
      ["outer_hips", "M37.8 111C39 110.1 42.7 111.8 43.4 113.5C44.1 115.2 43.1 119.1 42 121C40.9 122.9 38 125.3 37 125C36 124.7 35.9 121.3 36 119C36.1 116.7 36.6 111.9 37.8 111Z"],
      ["upper_back", "M36.8 67C37.7 65.9 40.7 65.2 42 66.5C43.3 67.8 44.8 72.7 44.5 74.5C44.2 76.3 41.3 77.8 40 77.5C38.7 77.2 37.1 74.8 36.6 73C36.1 71.2 35.9 68.1 36.8 67Z"],
      ["upper_back", "M60 41C60 41 55.4 43 53 44.5C50.6 46 47.7 48.2 45.5 50C43.3 51.8 40.2 52.9 40 55C39.8 57.1 42.2 59.7 44 62.5C45.8 65.3 48.3 68.1 51 72C53.7 75.9 60 86 60 86L60 41Z"],
      ["rear_delts", "M44 52C43.2 51.1 39.2 50.3 37 50.5C34.8 50.7 32.2 51.5 30.5 53C28.8 54.5 27.3 57.2 26.5 59.5C25.7 61.8 25.2 64.6 25.5 67C25.8 69.4 26.8 72.5 28 74C29.2 75.5 31.5 76.7 33 76C34.5 75.3 36.1 72.3 37 70C37.9 67.7 37.7 64.3 38.5 62C39.3 59.7 41.1 57.7 42 56C42.9 54.3 44.8 52.9 44 52Z"],
      ["triceps", "M21.9 71.5C19.7 71.5 21.3 73.7 21 74.8C20.7 75.9 20.4 77 20.2 78.2C19.9 79.3 19.7 80.4 19.4 81.5C19.2 82.7 19 83.8 18.9 84.9C18.7 86.1 18.5 87.2 18.4 88.4C18.2 89.5 18.1 90.7 17.9 91.8C17.8 93 17.7 94.1 17.5 95.3C17.4 96.4 15.9 97.8 17.1 98.7C18.4 99.7 23.5 100.9 25 100.7C26.6 100.5 25.9 98.6 26.3 97.5C26.7 96.4 27.1 95.3 27.6 94.2C28 93.2 28.4 92.1 28.8 91C29.2 89.9 29.6 88.8 30 87.7C30.3 86.6 30.7 85.5 31.1 84.4C31.4 83.3 31.7 82.2 32 81.1C32.3 80 32.6 78.9 32.9 77.8C33.2 76.7 35.5 75.5 33.7 74.4C31.8 73.4 24 71.4 21.9 71.5Z"],
      ["forearms", "M15.3 102.8C13.5 103 14.2 105.7 13.6 107.1C13 108.5 12.3 109.9 11.9 111.4C11.4 112.8 11.2 114.4 10.9 115.9C10.6 117.4 10.3 119 10 120.5C9.7 122.1 9.5 123.6 9.3 125.1C9 126.6 8.8 128.2 8.5 129.7C8.3 131.2 8.1 132.8 7.8 134.3C7.5 135.8 6.1 137.8 6.8 138.8C7.5 139.8 11 140.7 12.1 140.3C13.3 139.8 13 137.3 13.6 135.9C14.1 134.4 14.8 133 15.3 131.6C15.9 130.2 16.5 128.7 17.1 127.3C17.7 125.9 18.3 124.4 18.9 123C19.4 121.6 20 120.2 20.5 118.8C21.1 117.4 21.8 116 22.2 114.5C22.7 113.1 22.8 111.5 23.2 110C23.5 108.5 25.5 106.7 24.2 105.5C22.9 104.3 17 102.5 15.3 102.8Z"],
      ["hamstrings", "M36.1 137.1C32.3 137.7 35.7 140.9 35.6 142.8C35.5 144.8 35.4 146.7 35.3 148.6C35.2 150.5 35.1 152.5 35.1 154.4C35 156.3 35 158.2 35.1 160.2C35.2 162.1 35.4 164.2 35.6 166.2C35.8 168.2 36 170.1 36.2 172C36.4 174 36.6 175.9 36.8 177.8C37 179.8 35.2 182.6 37.4 183.7C39.6 184.8 47.6 185.3 49.9 184.4C52.2 183.6 50.7 180.6 51.2 178.7C51.6 176.8 52.1 174.9 52.5 173C53 171.1 53.4 169.2 53.8 167.3C54.2 165.5 54.7 163.7 55 161.8C55.4 160 55.8 158 56.1 156.1C56.4 154.2 56.6 152.3 56.8 150.4C57 148.5 57.2 146.6 57.4 144.7C57.6 142.7 61.5 140.2 57.9 138.9C54.4 137.6 39.8 136.4 36.1 137.1Z"],
      ["calves", "M36.7 186.4C34.3 186.9 36.1 188.9 36 190.1C35.8 191.4 35.7 192.6 35.6 193.9C35.6 195.1 35.7 196.4 35.7 197.7C35.8 198.9 35.8 200.2 35.9 201.5C36 202.7 36.2 204 36.4 205.3C36.6 206.6 36.8 207.8 37 209.1C37.3 210.4 37.5 211.7 37.7 212.9C37.9 214.2 37 216 38.2 216.8C39.4 217.5 43.4 217.7 44.7 217.2C45.9 216.6 45.3 214.7 45.7 213.4C46 212.2 46.4 211 46.8 209.7C47.2 208.5 47.6 207.3 47.9 206.1C48.3 204.8 48.6 203.6 48.9 202.3C49.2 201.1 49.4 199.9 49.6 198.6C49.8 197.4 50.1 196.1 50.2 194.9C50.3 193.6 50.4 192.4 50.4 191.1C50.4 189.9 52.5 188.1 50.2 187.3C47.9 186.5 39.1 185.9 36.7 186.4Z"]
    ]
  };
  var BM_FIG = 130; // x offset of the back figure; each figure is 120 wide and about 250 tall
  var BM_MIRROR = "translate(120 0) scale(-1 1)";
  function bmFigure(d, ctx, dx) {
    var root = s("g", dx ? { transform: "translate(" + dx + " 0)" } : null);
    // silhouette: all outlines first, then all fills, so the body reads as one shape with a clean white outer edge
    var outline = function (cls) {
      var g = s("g", { "class": cls }), l = s("g"), r = s("g", { transform: BM_MIRROR });
      d.base.forEach(function (p) { l.appendChild(s("path", { d: p })); r.appendChild(s("path", { d: p })); });
      g.appendChild(l); g.appendChild(r); g.appendChild(s("path", { d: BM_HEAD }));
      return g;
    };
    root.appendChild(outline("bo")); root.appendChild(outline("b"));
    [false, true].forEach(function (mirror) {
      var g = s("g", mirror ? { transform: BM_MIRROR } : null);
      d.regions.forEach(function (sh) {
        var cls = ctx.p[sh[0]] ? "m-p" : ctx.s[sh[0]] ? "m-s" : "m-n";
        var el = s("path", { d: sh[1], "class": cls, "data-m": sh[0] });
        if (ctx.titles) el.appendChild(s("title", { text: BM_LABEL[sh[0]] + (cls === "m-p" ? " (primary)" : cls === "m-s" ? " (secondary)" : "") }));
        g.appendChild(el);
      });
      root.appendChild(g);
    });
    return root;
  }
  /** mus = { p: [muscle ids], s: [muscle ids] } (primary / secondary). size: "lg" (detail card) or "sm" (list row, same figure, same proportions). */
  function bodyMap(mus, size) {
    var ctx = { p: {}, s: {}, titles: size !== "sm" };
    (mus.p || []).forEach(function (m) { ctx.p[m] = true; });
    (mus.s || []).forEach(function (m) { if (!ctx.p[m]) ctx.s[m] = true; });
    var sm = size === "sm";
    // Both figures share the 246 x 244 viewBox; the compact version has an explicit pixel size with the same aspect, so nothing in the row can stretch it.
    var svg = s("svg", { "class": "bm bm-" + (size || "lg"), viewBox: "2 4 246 244", role: "img", preserveAspectRatio: "xMidYMid meet" });
    if (sm) { svg.setAttribute("width", "66"); svg.setAttribute("height", "66"); }
    svg.appendChild(bmFigure(BM_FRONT, ctx, 0));
    svg.appendChild(bmFigure(BM_BACK, ctx, BM_FIG));
    var names = function (list) { return (list || []).map(function (m) { return BM_LABEL[m] || m; }).join(", "); };
    svg.setAttribute("aria-label", "Muscles used, front and back. Primary: " + (names(mus.p) || "none") + ". Secondary: " + (names(mus.s) || "none") + ". Estimated from exercise ids.");
    return svg;
  }
  function hasMuscles(m) { return !!(m && ((m.p && m.p.length) || (m.s && m.s.length))); }
  function musclesCard(mus) {
    var names = function (list) { return (list || []).map(function (m) { return BM_LABEL[m] || m; }).join(", "); };
    var key = function (cls, label) { return h("span", { "class": "bm-key" }, [h("span", { "class": "dot " + cls }), h("span", { text: label })]); };
    var list = function (cls, title, items) {
      return h("div", { "class": "bm-list" }, [h("div", { "class": "bm-lt" }, [h("span", { "class": "dot " + cls }), h("b", { text: title })]), h("div", { "class": "sub", text: names(items) || "None" })]);
    };
    return h("section", { "class": "panel bm-card" }, [
      h("h2", { text: "Muscles used" }),
      h("div", { "class": "bm-body" }, [
        h("div", { "class": "bm-fig" }, [bodyMap(mus, "lg"), h("div", { "class": "bm-lbl" }, [h("span", { text: "Front" }), h("span", { text: "Back" })])]),
        h("div", { "class": "bm-lists" }, [list("p", "Primary muscles", mus.p), list("s", "Secondary muscles", mus.s)])
      ]),
      h("div", { "class": "bm-legend" }, [key("p", "Primary muscle used"), key("s", "Secondary muscle used"), key("n", "Non-target muscle")]),
      h("p", { "class": "bm-note", text: "Estimate from the exercise ids (Zepp exercise catalogue, checked against the live Zepp muscle config). The watch does not measure which muscles you used." })
    ]);
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
  function analysisCards(w, sm, inStats) {
    var cards = [], speed = isSpeedSport(w.activity_type);
    if (!inStats && !/swim/.test(String(w.activity_type || "")) && (isNum(sm.avg_pace_s_km) || isNum(sm.best_pace_s_km))) {
      if (speed) {
        cards.push(card("Speed", isNum(sm.avg_pace_s_km) ? fmt1(3600 / sm.avg_pace_s_km) : "-", "km/h avg", isNum(sm.best_pace_s_km) ? "best " + fmt1(3600 / sm.best_pace_s_km) + " km/h" : ""));
      } else {
        cards.push(card("Pace", fmtPace(sm.avg_pace_s_km), "/km avg", isNum(sm.best_pace_s_km) ? "best " + fmtPace(sm.best_pace_s_km) + " /km" : ""));
      }
    }
    if (!inStats && isNum(sm.avg_cadence_spm)) {
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
  var MAP_MIN_ZOOM = 3, MAP_MAX_ZOOM = 19, MAP_FIT_MAX_ZOOM = 19, MAP_MAX_TILES = 48;
  function mapEnabled() { try { return window.localStorage.getItem(MAP_PREF) !== "off"; } catch (e) { return true; } }
  function setMapEnabled(on) { try { window.localStorage.setItem(MAP_PREF, on ? "on" : "off"); } catch (e) { /* storage unavailable */ } }
  function mapWorld(z) { return 256 * Math.pow(2, z); }
  function mapX(lon, z) { return (lon + 180) / 360 * mapWorld(z); }
  function mapY(lat, z) {
    var r = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * mapWorld(z);
  }
  var PACE_RAMP = [[249, 115, 22], [234, 179, 8], [34, 197, 94]]; // slow (orange) -> fast (green)
  var PACE_BINS = 12;
  function rampColor(t) {
    t = Math.max(0, Math.min(1, t));
    var k = t * (PACE_RAMP.length - 1), i = Math.min(PACE_RAMP.length - 2, Math.floor(k)), f = k - i, a = PACE_RAMP[i], c = PACE_RAMP[i + 1];
    return "rgb(" + Math.round(a[0] + (c[0] - a[0]) * f) + "," + Math.round(a[1] + (c[1] - a[1]) * f) + "," + Math.round(a[2] + (c[2] - a[2]) * f) + ")";
  }
  function routeMeters(a, b) {
    var R = 6371000, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  /**
   * Speed class (0 = slowest .. 1 = fastest) for every route segment, from the stored pace series (pace is seconds per km, lower is faster).
   * A route point is matched to the series by its share of the route length, because the route and the series are sampled separately.
   * Returns null when there is no usable pace series (swims, no GPS pace), so nothing is invented.
   */
  function routeSegmentClasses(route, se, speedSport) {
    var pts = route.points, n = pts.length;
    if (!se || !se.pace_s_km || !se.dist_m || n < 2) return null;
    var idx = [], paces = [], i;
    for (i = 0; i < se.pace_s_km.length; i++) if (isNum(se.pace_s_km[i]) && se.pace_s_km[i] > 0 && isNum(se.dist_m[i])) { idx.push(i); paces.push(se.pace_s_km[i]); }
    if (paces.length < 3) return null;
    var cum = [0]; for (i = 1; i < n; i++) cum.push(cum[i - 1] + routeMeters(pts[i - 1], pts[i]));
    var total = cum[n - 1], endDist = se.dist_m[idx[idx.length - 1]];
    if (!(total > 0) || !isNum(endDist) || endDist <= 0) return null;
    var sorted = paces.slice().sort(function (x, y) { return x - y; });
    var lo = sorted[Math.floor(sorted.length * 0.1)], hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
    if (!(hi > lo)) return null;
    var out = [], j = 0;
    for (i = 0; i < n - 1; i++) {
      var d = ((cum[i] + cum[i + 1]) / 2) / total * endDist;
      while (j < idx.length - 1 && se.dist_m[idx[j + 1]] <= d) j++;
      var pace = paces[Math.min(j, paces.length - 1)];
      out.push(Math.max(0, Math.min(1, (hi - pace) / (hi - lo)))); // faster pace (smaller number) -> closer to 1
    }
    return out;
  }

  function exportMenu(id) {
    var wrap = h("div", { "class": "expwrap" });
    var btn = h("button", { type: "button", "class": "expbtn", "aria-haspopup": "menu", "aria-expanded": "false", "aria-controls": "expmenu" }, [ico("download"), h("span", { text: "Export" }), ico("chevron", "dd-chev")]);
    var base = "/dashboard/api/workouts/" + encodeURIComponent(id) + "/export.";
    var links = [["gpx", "Download GPX"], ["tcx", "Download TCX"]].map(function (x) { return h("a", { role: "menuitem", tabindex: "-1", "class": "expitem", href: base + x[0], download: "", text: x[1] }); });
    var menu = h("div", { id: "expmenu", role: "menu", "class": "expmenu hidden", "aria-label": "Export workout" }, links.concat([h("div", { "class": "expnote", text: "Built from the stored, simplified route." })]));
    var open = false, act = 0;
    function focusItem(i) { act = (i + links.length) % links.length; links[act].focus(); }
    function onDoc(ev) { if (!wrap.isConnected) { document.removeEventListener("click", onDoc); return; } if (!wrap.contains(ev.target)) close(false); }
    function openMenu() { open = true; menu.classList.remove("hidden"); btn.setAttribute("aria-expanded", "true"); document.addEventListener("click", onDoc); focusItem(0); }
    function close(focusBtn) { open = false; menu.classList.add("hidden"); btn.setAttribute("aria-expanded", "false"); document.removeEventListener("click", onDoc); if (focusBtn) btn.focus(); }
    btn.addEventListener("click", function () { if (open) close(false); else openMenu(); });
    btn.addEventListener("keydown", function (ev) { if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); if (!open) openMenu(); } else if (ev.key === "Escape" && open) { ev.preventDefault(); close(true); } });
    menu.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown") { ev.preventDefault(); focusItem(act + 1); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); focusItem(act - 1); }
      else if (ev.key === "Home") { ev.preventDefault(); focusItem(0); }
      else if (ev.key === "End") { ev.preventDefault(); focusItem(links.length - 1); }
      else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(true); }
      else if (ev.key === "Tab") close(false);
    });
    links.forEach(function (a) { a.addEventListener("click", function () { close(false); }); });
    wrap.appendChild(btn); wrap.appendChild(menu);
    return wrap;
  }
  function routePanel(route, opts) {
    if (!route || !route.points || route.points.length < 2) return null;
    opts = opts || {};
    var pts = route.points, b = route.bbox, classes = opts.classes && opts.classes.length === pts.length - 1 ? opts.classes : null;
    var box = h("div", { "class": "mapbox", role: "group", "aria-label": "Route map", tabindex: "0" });
    var tiles = h("div", { "class": "maptiles" });
    var casing = s("path", { fill: "none", stroke: "#05070b", "stroke-opacity": "0.7", "stroke-width": "6.5", "stroke-linejoin": "round", "stroke-linecap": "round" });
    var line = s("g", { fill: "none", "stroke-width": "3.6", "stroke-linejoin": "round", "stroke-linecap": "round" });
    var binPaths = [];
    for (var bi = 0; bi < (classes ? PACE_BINS : 1); bi++) {
      var bp = s("path", { fill: "none", stroke: classes ? rampColor((bi + 0.5) / PACE_BINS) : "var(--teal)" });
      binPaths.push(bp); line.appendChild(bp);
    }
    var binOf = classes ? classes.map(function (c) { return Math.min(PACE_BINS - 1, Math.floor(c * PACE_BINS)); }) : null;
    var startDot = s("circle", { r: 6.5, fill: "var(--good)", stroke: "#05070b", "stroke-width": "2" }, s("title", { text: "Start" }));
    var endDot = s("g", { "class": "finish" }, [
      s("title", { text: "Finish" }),
      s("rect", { x: -7.5, y: -7.5, width: 15, height: 15, rx: 2.5, fill: "#f5f7fa", stroke: "var(--bad)", "stroke-width": "2" }),
      s("rect", { x: -7.5, y: -7.5, width: 7.5, height: 7.5, fill: "#11151c" }), s("rect", { x: 0, y: 0, width: 7.5, height: 7.5, fill: "#11151c" })
    ]);
    var svg = s("svg", { "class": "route", role: "img", "aria-label": classes ? "Route track coloured by pace, slow to fast" : "Route track", preserveAspectRatio: "none" }, [casing, line, startDot, endDot]);
    var note = h("div", { "class": "mapnote hidden" });
    var attr = h("div", { "class": "mapattr" }, ["\u00a9 ", h("a", { href: "https://www.openstreetmap.org/copyright", target: "_blank", rel: "noopener noreferrer", text: "OpenStreetMap" }), " contributors"]);
    var m = { z: 3, cx: 0, cy: 0, W: 600, H: 320, tiles: mapEnabled(), loaded: 0, errors: 0, sized: false, cache: {}, raf: 0 };
    if (typeof navigator !== "undefined" && navigator.onLine === false) m.tiles = false;

    function fitView() {
      m.W = box.clientWidth || m.W; m.H = box.clientHeight || m.H;
      // Closest zoom at which the whole route fits with about 9% of free space on every side (tiles come in whole zoom levels,
      // so a short route fills roughly 40-80% of the map height). A single point or tiny jitter stops at the max zoom.
      var padX = m.W * 0.09, padY = m.H * 0.09, z, w, hh;
      for (z = MAP_FIT_MAX_ZOOM; z > MAP_MIN_ZOOM; z--) {
        w = mapX(b[3], z) - mapX(b[1], z); hh = mapY(b[0], z) - mapY(b[2], z);
        if (w <= m.W - 2 * padX && hh <= m.H - 2 * padY) break;
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
      casing.setAttribute("d", d);
      if (binOf) {
        var ds = binPaths.map(function () { return ""; });
        for (var k = 0; k < binOf.length; k++) {
          var x1 = (mapX(pts[k][1], z) - x0).toFixed(1), y1 = (mapY(pts[k][0], z) - y0).toFixed(1), x2 = (mapX(pts[k + 1][1], z) - x0).toFixed(1), y2 = (mapY(pts[k + 1][0], z) - y0).toFixed(1);
          ds[binOf[k]] += "M" + x1 + " " + y1 + "L" + x2 + " " + y2;
        }
        binPaths.forEach(function (bp, q) { bp.setAttribute("d", ds[q]); });
      } else binPaths[0].setAttribute("d", d);
      var a = pts[0], e = pts[pts.length - 1];
      startDot.setAttribute("cx", (mapX(a[1], z) - x0).toFixed(1)); startDot.setAttribute("cy", (mapY(a[0], z) - y0).toFixed(1));
      endDot.setAttribute("transform", "translate(" + (mapX(e[1], z) - x0).toFixed(1) + " " + (mapY(e[0], z) - y0).toFixed(1) + ")");
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
      if (ev.target && ev.target.closest && ev.target.closest(".mapctl,.mapattr,.mapbar")) return;
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
    var toggle = h("button", { type: "button", "class": "maptoggle", "aria-pressed": m.tiles ? "true" : "false", text: m.tiles ? "Hide map" : "Show map", onclick: function () {
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
    if (opts.label) box.appendChild(h("div", { "class": "mappill" }, [ico(opts.icon || "route"), h("span", { text: opts.label })]));
    box.appendChild(h("div", { "class": "mapbar" }, [opts.exportId ? exportMenu(opts.exportId) : null, toggle]));
    if (classes) box.appendChild(h("div", { "class": "maplegend", role: "img", "aria-label": "Route colour: slow is orange, fast is green" }, [h("div", { text: "Slow to Fast" }), h("div", { "class": "bar" }), h("div", { "class": "ends" }, [h("span", { text: "Slow" }), h("span", { text: "Fast" })])]));
    var card = panel(null, [
      box,
      h("p", { "class": "sub", text: "Map data \u00a9 OpenStreetMap contributors. Tiles load from tile.openstreetmap.org for this workout only, so that server sees the area you view. North is up. Green is the start, the checkered flag the finish." })
    ]);
    card.classList.add("mapcard");
    return card;
  }
  /** Big distance plus a grid of the figures that exist for this workout (nothing is shown for a missing value). */
  function routeStats(w, sm, speed) {
    var items = [];
    var item = function (icon, label, value, unit, extra) {
      items.push(h("div", { "class": "it" }, [h("div", { "class": "l" }, [ico(icon), h("span", { text: label })]), h("div", { "class": "v" }, [value, unit ? h("small", { text: unit }) : null]), extra ? h("div", { "class": "x", text: extra }) : null]));
    };
    var swim = /swim/.test(String(w.activity_type || ""));
    if (isNum(w.duration_s) && w.duration_s > 0) item("clock", "Workout time", fmtDur(w.duration_s));
    if (!swim && isNum(sm.avg_pace_s_km) && sm.avg_pace_s_km > 0) {
      if (speed) item("gauge", "Avg speed", fmt1(3600 / sm.avg_pace_s_km), "km/h", isNum(sm.best_pace_s_km) && sm.best_pace_s_km > 0 ? "best " + fmt1(3600 / sm.best_pace_s_km) + " km/h" : "");
      else item("gauge", "Avg pace", fmtPace(sm.avg_pace_s_km), "/km", isNum(sm.best_pace_s_km) && sm.best_pace_s_km > 0 ? "best " + fmtPace(sm.best_pace_s_km) + " /km" : "");
    }
    if (isNum(w.avg_hr_bpm) && w.avg_hr_bpm > 0) item("heart", "Avg heart rate", fmtInt(w.avg_hr_bpm), "bpm", isNum(w.max_hr_bpm) && w.max_hr_bpm > 0 ? "max " + fmtInt(w.max_hr_bpm) : "");
    if (isNum(w.calories_kcal) && w.calories_kcal > 0) item("flame", "Calories", fmtInt(w.calories_kcal), "kcal");
    if (isNum(sm.avg_cadence_spm) && sm.avg_cadence_spm > 0) {
      var cx = [];
      if (isNum(sm.max_cadence_spm)) cx.push("max " + fmtInt(sm.max_cadence_spm));
      if (isNum(sm.steps)) cx.push(fmtInt(sm.steps) + " steps");
      item("steps", "Avg cadence", fmtInt(sm.avg_cadence_spm), "spm", cx.join(" | "));
    }
    var big = isNum(w.distance_m) && w.distance_m > 0 ? h("div", { "class": "big" }, [h("span", { "class": "v", text: (w.distance_m / 1000).toFixed(2) }), h("span", { "class": "u", text: "km" })]) : null;
    return h("section", { "class": "panel rstats" }, [
      big,
      h("div", { "class": "when sub" }, [shortDate(w.started_date) + " " + String(w.started_date || "").slice(0, 4) + " \u00b7 " + localTime(w.started_at) + " - " + localTime(w.ended_at) + " ", typeBadge(w, true)]),
      items.length ? h("div", { "class": "grid" }, items) : null
    ]);
  }
  function analysisView(w, a, top) {
    var sm = a.summary || {}, se = a.series, speed = isSpeedSport(w.activity_type), out = [];
    // With a GPS route the map card comes first, full width, then the stats card; the header and the four tiles above it are replaced by them.
    var hasRoute = !!(a.route && a.route.points && a.route.points.length >= 2);
    if (hasRoute) {
      var mapCard = routePanel(a.route, { label: typeName(w.activity_type), icon: sportIconName(w.activity_type), exportId: w.workout_id, classes: routeSegmentClasses(a.route, se, speed) });
      out.push(mapCard, routeStats(w, sm, speed));
      (top || []).forEach(function (el) { el.classList.add("hidden"); });
    }
    var cards = analysisCards(w, sm, hasRoute);
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
    var grid3 = [splitsPanel(a.splits, speed)].filter(Boolean);
    if (grid3.length) out.push(h("div", { class: "grid2" }, grid3));
    if (!out.length) out.push(panel("", empty(ANALYSIS_MSG.no_detail)));
    else if (!a.route) out.push(h("p", { class: "sub", text: "No GPS track was recorded, so there is no route." }));
    return h("div", null, out);
  }
  function renderAnalysis(w, id, token, top) {
    var box = h("div", { class: "wa" }, skelPanel());
    api("workouts/" + encodeURIComponent(id) + "/analysis").then(function (r) {
      if (token !== navToken) return;
      clear(box);
      if (!r || r.status !== "ok" || !r.analysis) { box.appendChild(panel("", empty(ANALYSIS_MSG[r && r.reason] || "No detailed data for this workout."))); return; }
      box.appendChild(analysisView(w, r.analysis, top));
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
  var ddSeq = 0;
  /**
   * Sport filter: a button (select-only combobox) that opens a floating panel with a search field and a listbox.
   * Arrow keys move, Enter picks, Escape or a click outside closes. Returns { el, set(type) }; onPick(type) runs when the user chooses.
   */
  function sportDropdown(wk, onPick) {
    var uid = "wsd" + (++ddSeq), types = wk.types || [], total = 0;
    types.forEach(function (t) { total += t.n; });
    var items = [{ type: "", name: "All sports", n: total }].concat(types.map(function (t) { return { type: t.type, name: typeName(t.type), n: t.n }; }));
    var cur = wk.type || "", shown = items.slice(), act = -1, isOpen = false;
    var icoBox = h("span", { "class": "wdd-ico" }), nameEl = h("span", { "class": "wdd-name" });
    var btn = h("button", { type: "button", "class": "wtype", role: "combobox", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-controls": uid + "-list", "aria-label": "Filter by sport" }, [icoBox, nameEl, ico("chevron", "dd-chev")]);
    var search = h("input", { type: "search", "class": "wdd-search", "aria-label": "Search sports", "aria-controls": uid + "-list", placeholder: "Search sports", autocomplete: "off", maxlength: "40" });
    var list = h("div", { id: uid + "-list", role: "listbox", "aria-label": "Sports", "class": "wdd-list" });
    var menu = h("div", { "class": "wmenu" }, [search, list]);
    menu.hidden = true;
    var wrap = h("div", { "class": "wtype-wrap" }, [btn, menu]);
    function iconFor(type) { return type ? sportChip(type) : h("span", { "class": "sico neutral", "aria-hidden": "true" }, ico("grid")); }
    function find(type) { for (var i = 0; i < items.length; i++) if (items[i].type === type) return items[i]; return null; }
    function set(type) {
      cur = type || "";
      var it = find(cur);
      clear(icoBox); icoBox.appendChild(iconFor(cur));
      nameEl.textContent = it ? it.name : typeName(cur);
    }
    function setActive(i, scroll) {
      var opts = list.children;
      if (!shown.length) { act = -1; search.removeAttribute("aria-activedescendant"); btn.removeAttribute("aria-activedescendant"); return; }
      act = Math.max(0, Math.min(shown.length - 1, i));
      for (var k = 0; k < opts.length; k++) opts[k].classList.toggle("act", k === act);
      var id = uid + "-o" + act;
      search.setAttribute("aria-activedescendant", id); btn.setAttribute("aria-activedescendant", id);
      if (scroll && opts[act] && opts[act].scrollIntoView) opts[act].scrollIntoView({ block: "nearest" });
    }
    function paint() {
      clear(list);
      if (!shown.length) { list.appendChild(h("div", { "class": "wdd-none", text: "No sports match" })); return; }
      shown.forEach(function (it, i) {
        var on = it.type === cur;
        var o = h("div", { id: uid + "-o" + i, role: "option", "aria-selected": on ? "true" : "false", "data-type": it.type, "class": "wopt" + (on ? " on" : "") }, [
          iconFor(it.type), h("span", { "class": "nm", text: it.name }), h("span", { "class": "cnt", text: String(it.n) }), ico("check", "ck")
        ]);
        o.addEventListener("click", function () { pick(it.type); });
        o.addEventListener("mousemove", function () { if (act !== i) setActive(i, false); });
        list.appendChild(o);
      });
    }
    function filter() {
      var q = search.value.trim().toLowerCase();
      shown = items.filter(function (it) { return !q || it.name.toLowerCase().indexOf(q) >= 0; });
      paint();
      var si = -1; shown.forEach(function (it, i) { if (it.type === cur) si = i; });
      setActive(si >= 0 ? si : 0, true);
    }
    function onDoc(ev) {
      if (!wrap.isConnected || !wrap.contains(ev.target)) closeMenu(false);
    }
    function openMenu() {
      if (isOpen) return;
      isOpen = true; menu.hidden = false; btn.setAttribute("aria-expanded", "true");
      search.value = ""; filter(); search.focus();
      document.addEventListener("pointerdown", onDoc, true);
    }
    function closeMenu(focusBtn) {
      if (!isOpen) return;
      isOpen = false; menu.hidden = true; btn.setAttribute("aria-expanded", "false");
      btn.removeAttribute("aria-activedescendant");
      document.removeEventListener("pointerdown", onDoc, true);
      if (focusBtn) btn.focus();
    }
    function pick(type) {
      closeMenu(true);
      if (type !== cur) { set(type); onPick(type); }
    }
    btn.addEventListener("click", function () { if (isOpen) closeMenu(false); else openMenu(); });
    btn.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); openMenu(); }
      else if (ev.key === "Escape" && isOpen) { ev.preventDefault(); closeMenu(true); }
    });
    search.addEventListener("input", filter);
    search.addEventListener("keydown", function (ev) {
      var k = ev.key;
      if (k === "ArrowDown") { ev.preventDefault(); setActive(act + 1, true); }
      else if (k === "ArrowUp") { ev.preventDefault(); setActive(act - 1, true); }
      else if (k === "Home" && ev.ctrlKey) { ev.preventDefault(); setActive(0, true); }
      else if (k === "End" && ev.ctrlKey) { ev.preventDefault(); setActive(shown.length - 1, true); }
      else if (k === "Enter") { ev.preventDefault(); if (shown[act]) pick(shown[act].type); }
      else if (k === "Escape") { ev.preventDefault(); ev.stopPropagation(); closeMenu(true); }
      else if (k === "Tab") closeMenu(false);
    });
    set(cur);
    return { el: wrap, set: set };
  }
  function viewWorkouts(box, token, rest) {
    clear(box);
    state.wkUi = null;
    var wk = state.wk, hasIO = typeof IntersectionObserver === "function";
    var ui = { box: box, gen: 0, loading: false, done: false, failed: false, rows: {}, selId: "", skipScroll: false, observer: null, dd: null };
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
      if (ui.dd) ui.dd.set(wk.type || "");
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
      ui.dd = sportDropdown(wk, function (type) { if ((wk.type || "") !== type) resetList(type); });
      var typeWrap = ui.dd.el;
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
    watchKick(false);
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
    var views = { overview: viewOverview, sleep: viewSleep, recovery: viewRecovery, training: viewTraining, activity: viewActivity, charge: viewCharge, workouts: viewWorkouts, exercises: viewExercises, weight: viewWeight, sync: viewSync };
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
    document.addEventListener("visibilitychange", function () { if (!document.hidden) watchKick(false); });
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
  recovery: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8zM6 12h3l1.5-3 3 6L15 12h3",
  training: "M4 20V10M10 20V4M16 20v-8M22 20H2M18 8l3-3M21 5v3h-3",
  sync: "M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2M21 4v5h-5M3 20v-5h5",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  menu: "M3 6h18M3 12h18M3 18h18"
} as const;

/** Sidebar entries, in order. There is deliberately no separate Strength entry: strength lives inside Workouts. */
export const NAV_ITEMS: ReadonlyArray<{ route: keyof typeof ICONS; label: string }> = [
  { route: "overview", label: "Overview" },
  { route: "sleep", label: "Sleep" },
  { route: "recovery", label: "Recovery" },
  { route: "activity", label: "Activity" },
  { route: "charge", label: "Hybrid Charge" },
  { route: "workouts", label: "Workouts" },
  { route: "training", label: "Training" },
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

export function renderDashboardHtml(nonce: string, csrf = ""): string {
  const n = escapeHtml(nonce);
  const nav = NAV_ITEMS.map(i => `<a href="#/${i.route}" data-route="${i.route}" data-tip="${i.label}" title="${i.label}" aria-label="${i.label}">${icon(i.route)}<span>${i.label}</span></a>`).join("");
  return `${HEAD(nonce, "Zepp")}<body><div id="app" class="app" data-csrf="${escapeHtml(csrf)}">` +
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
import { icon } from './icons.js';
import { donut, areaChart, barChart, meter } from './charts.js';
import {
  HOSP, TODAY, CRIT, critColor, STAT, WOSTAT, USTAT, MODULES, ACTIONS, SKILL_AREAS,
  eqStatus, woStatus, priPill, fmtDate, overdue, certStatus,
  LAST_DB_ERROR,
  loadEquipment, loadWorkOrders, loadParts, loadPMWorkOrders, loadUsers, loadTechnicians,
  loadRoles, loadPermissions, loadWorkflows, loadWorkflowTransitions, loadServiceRequests,
  loadVendors, loadAuditLogs, loadChecklistResult,
  updateWorkOrder, updatePart, updatePMWorkOrder, saveEquipment,
  addWorkOrder, addServiceRequest, addVendor, addEquipment,
  addTechnician, addWorkflow, addWorkflowTransition,
  updateEquipment, updateVendor, updateUser, updateServiceRequest,
  deleteWorkOrder, deleteServiceRequest, deleteVendor, deleteEquipment, deleteTechnician, deleteRole,
  addUser, addRole as addRoleToDB, togglePermission, addWorkflowState, toggleWorkflowTransition,
  saveChecklistResult, addAuditLog,
} from './db.js';
import {
  CHECKLISTS, tplTotal, progressOf, CORR_STEPS, corrStepFromStatus, addInterval,
} from './checklists.js';

/* ================= NAVIGATION ================= */
const NAV = [
  { grp: 'Operations', items: [
    { id: 'dashboard', label: 'Command Center', ic: 'dash' },
    { id: 'equipment', label: 'Equipment Register', ic: 'asset', badge: '842', badgeClass: 'muted' },
    { id: 'workorders', label: 'Work Orders', ic: 'wo', badge: '23', badgeClass: '' },
    { id: 'requests', label: 'Service Requests', ic: 'alert', badge: '6', badgeClass: 'amber' },
  ]},
  { grp: 'Maintenance', items: [
    { id: 'pm', label: 'Preventive (PM)', ic: 'pm' },
    { id: 'calibration', label: 'Calibration', ic: 'cal' },
    { id: 'parts', label: 'Spare Parts', ic: 'parts', badge: '4', badgeClass: 'amber' },
    { id: 'vendors', label: 'Vendors & Contracts', ic: 'vendor' },
  ]},
  { grp: 'Insight', items: [
    { id: 'risk', label: 'Risk & Compliance', ic: 'risk' },
    { id: 'reports', label: 'Reports & KPIs', ic: 'report' },
    { id: 'audit', label: 'Audit Trail', ic: 'audit' },
  ]},
  { grp: 'Administration', items: [
    { id: 'users', label: 'Users & Access', ic: 'users' },
    { id: 'techs', label: 'Technicians', ic: 'wrench' },
    { id: 'roles', label: 'Roles & Permissions', ic: 'shield' },
    { id: 'workflows', label: 'Workflow Designer', ic: 'settings' },
  ]},
];

/* ================= STATE ================= */
let CURRENT = 'dashboard';
let THEME = 'light';
let EQFILTER = 'all';
let WOFILTER = 'open';
let SELROLE = 'bioeng';
let SELWF = 'corrective';
let ORIGIN = 'dashboard';
let CHK_CTX = null;
let NEWUSER = {};

// In-memory caches loaded from DB
let EQUIP = [];
let EQMAP = {};
let WORKORDERS = [];
let WOMAP = {};
let PARTS = [];
let PMWO = [];
let PMWOMAP = {};
let USERS = [];
let TECHS = [];
let ROLES = [];
let PERMS = {};
let WORKFLOWS = [];
let WFTRANS = [];
let SR_DATA = [];
let VENDORS = [];
let AUDIT = [];

// Checklist state per job (loaded from DB)
let CHK_STATE = {};

const VIEWS = {};
const AFTER = {};

/* ================= TOAST / THEME / DRAWER ================= */
let toastT;
function toast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = icon('check') + `<span>${msg}</span>`;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2600);
}
window.toast = toast;

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const ti = document.getElementById('themeIcon');
  if (ti) ti.innerHTML = t === 'dark'
    ? '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>'
    : '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>';
  try { localStorage.setItem('vit-theme', t); } catch (e) {}
}

function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('scrim').classList.remove('open');
}
window.closeDrawer = closeDrawer;

function openDrawerHTML(html) {
  document.getElementById('drawer').innerHTML = html;
  document.getElementById('drawer').classList.add('open');
  document.getElementById('scrim').classList.add('open');
}

/* ================= ROUTER ================= */
function buildNav() {
  document.getElementById('nav').innerHTML = NAV.map(g => `
    <div class="nav-group"><div class="nav-label">${g.grp}</div>
    ${g.items.map(it => `<button class="nav-item" data-view="${it.id}" onclick="go('${it.id}')">${icon(it.ic)}<span>${it.label}</span>${it.badge ? `<span class="badge ${it.badgeClass || ''}">${it.badge}</span>` : ''}</button>`).join('')}
    </div>`).join('');
}

async function go(v) {
  if (!VIEWS[v]) v = 'dashboard';
  CURRENT = v;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === v));
  const label = NAV.flatMap(g => g.items).find(i => i.id === v)?.label || '';
  document.getElementById('crumbs').innerHTML = `<span>${HOSP}</span>${icon('arrowr')}<b>${label}</b>`;
  const canvas = document.getElementById('canvas');
  canvas.innerHTML = `<section class="view active" id="view-${v}"></section>`;
  document.getElementById('view-' + v).innerHTML = await VIEWS[v]();
  canvas.scrollTop = 0;
  if (AFTER[v]) AFTER[v]();
}
window.go = go;

/* ================= DATA LOADING ================= */
async function refreshAllData() {
  EQUIP = await loadEquipment();
  EQMAP = Object.fromEntries(EQUIP.map(e => [e.id, e]));
  WORKORDERS = await loadWorkOrders();
  WOMAP = Object.fromEntries(WORKORDERS.map(w => [w.id, w]));
  PARTS = await loadParts();
  PMWO = await loadPMWorkOrders();
  PMWOMAP = Object.fromEntries(PMWO.map(p => [p.id, p]));
  USERS = await loadUsers();
  TECHS = await loadTechnicians();
  ROLES = await loadRoles();
  const permsData = await loadPermissions();
  PERMS = {};
  permsData.forEach(p => {
    if (!PERMS[p.role_id]) PERMS[p.role_id] = {};
    if (!PERMS[p.role_id][p.module]) PERMS[p.role_id][p.module] = {};
    PERMS[p.role_id][p.module][p.action] = p.allowed;
  });
  WORKFLOWS = await loadWorkflows();
  WFTRANS = await loadWorkflowTransitions();
  SR_DATA = await loadServiceRequests();
  VENDORS = await loadVendors();
  AUDIT = await loadAuditLogs();
}

/* ================= EQUIPMENT DRAWER ================= */
function openEquipment(id) {
  const e = EQMAP[id];
  if (!e) return;
  const wos = WORKORDERS.filter(w => w.eq_id === id);
  const timeline = [
    { t: 'Preventive maintenance completed', m: 'Full PM per manufacturer schedule · all checks passed', time: '12 Jun 2026 · K. Haddad', c: 'ok' },
    { t: 'Corrective repair — flow sensor', m: 'WO-24829 · sensor assembly replaced & recalibrated', time: '21 Aug 2026 · K. Haddad', c: 'primary' },
    { t: 'Electrical safety test (IEC 62353)', m: 'Earth leakage 0.12 mA · Pass', time: '22 Aug 2026 · N. Fares', c: 'ok' },
    { t: 'Commissioned & accepted into service', m: 'Acceptance checklist signed off · asset tag assigned', time: '04 Mar 2023 · Biomedical', c: 'info' },
  ];
  openDrawerHTML(`
    <div class="drawer-head">
      <div class="drawer-title">
        <div class="big-ic">${icon(e.ic)}</div>
        <div><h2>${e.name}</h2><div class="did">${e.tag} · ${e.id} · SN ${e.serial}</div></div>
      </div>
      <button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button>
    </div>
    <div class="drawer-tabs">
      <button class="on" onclick="dTab(this,'d-over')">Overview</button>
      <button onclick="dTab(this,'d-hist')">History</button>
      <button onclick="dTab(this,'d-docs')">Documents</button>
      <button onclick="dTab(this,'d-risk')">Risk & PM</button>
    </div>
    <div class="drawer-body">
      <div id="d-over">
        <div class="dsec" style="display:flex;gap:10px;flex-wrap:wrap">
          ${eqStatus(e.status)}<span class="pill p-${CRIT[e.crit].c}">${CRIT[e.crit].l}</span>
          ${e.warranty === 'Active' ? '<span class="pill p-ok">In Warranty</span>' : '<span class="pill p-muted">Warranty Expired</span>'}
          <span class="pill p-info">SLA ${e.sla}</span>
          ${wos.filter(w => w.status !== 'closed').length ? `<span class="pill p-warn">${wos.filter(w => w.status !== 'closed').length} open WO</span>` : ''}
        </div>
        <div class="dsec"><h4>Identification & Location</h4><div class="kv-grid">
          <div class="kv-item"><div class="k">Manufacturer</div><div class="v">${e.mfr}</div></div>
          <div class="kv-item"><div class="k">Model</div><div class="v">${e.model}</div></div>
          <div class="kv-item"><div class="k">Category</div><div class="v">${e.cat}</div></div>
          <div class="kv-item"><div class="k">Department</div><div class="v">${e.dept}</div></div>
          <div class="kv-item"><div class="k">Location</div><div class="v">${e.loc}</div></div>
          <div class="kv-item"><div class="k">Serial No.</div><div class="v mono">${e.serial}</div></div>
        </div></div>
        <div class="dsec"><h4>Lifecycle & Finance</h4><div class="kv-grid">
          <div class="kv-item"><div class="k">Age in Service</div><div class="v">${e.age} years</div></div>
          <div class="kv-item"><div class="k">Acquisition Cost</div><div class="v">$${Number(e.cost).toLocaleString()}</div></div>
          <div class="kv-item"><div class="k">Expected Lifetime</div><div class="v">${e.age + (e.cost > 500000 ? 6 : 4)} yrs est.</div></div>
          <div class="kv-item"><div class="k">Replacement Year</div><div class="v">${2023 + e.age + (e.cost > 500000 ? 9 : 7)}</div></div>
        </div></div>
      </div>
      <div id="d-hist" style="display:none">
        <div class="dsec"><h4>Work Orders (${wos.length})</h4>
          ${wos.length ? wos.map(w => `<div class="doc-row" onclick="closeDrawer();openJob('${w.id}','wo')" style="cursor:pointer">
            <div class="doc-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('wo')}</div>
            <div style="flex:1"><div class="dn">${w.title}</div><div class="dm mono">${w.id} · ${w.type} · ${w.pri}</div></div>
            ${woStatus(w.status)}</div>`).join('') : '<div class="empty">No work orders</div>'}
        </div>
        <div class="dsec"><h4>Equipment Timeline</h4><div class="timeline">
          ${timeline.map(t => `<div class="tl-item"><div class="tl-dot"><div class="d" style="box-shadow:0 0 0 2px var(--${t.c})"></div><div class="ln"></div></div>
            <div class="tl-c"><div class="tl-t">${t.t}</div><div class="tl-m">${t.m}</div><div class="tl-time">${t.time}</div></div></div>`).join('')}
        </div></div>
      </div>
      <div id="d-docs" style="display:none">
        <div class="dsec"><h4>Documents & Certificates</h4>
          ${[['Service Manual — ' + e.model, 'PDF · 8.4 MB', 'pdf'], ['Electrical Safety Certificate 2026', 'PDF · 220 KB', 'pdf'], ['Calibration Certificate', 'PDF · 180 KB', 'pdf'], ['Installation Photos', 'IMG · 3 files', 'img'], ['Warranty Agreement', 'PDF · 1.1 MB', 'pdf']].map(d => `
            <div class="doc-row"><div class="doc-ic ${d[2]}">${icon('file')}</div><div style="flex:1"><div class="dn">${d[0]}</div><div class="dm">${d[1]}</div></div><button class="icon-btn" onclick="toast('Downloading ${d[0]}')">${icon('download')}</button></div>`).join('')}
        </div>
      </div>
      <div id="d-risk" style="display:none">
        <div class="dsec"><h4>Risk Score</h4>
          <div class="hstat"><div class="big-num" style="color:${critColor(e.crit)}">${e.risk}</div>
          <div><div style="font-weight:600">${e.risk >= 85 ? 'Critical' : e.risk >= 65 ? 'High' : 'Moderate'} composite risk</div>
          <div class="sub2">Clinical criticality × failure consequence × utilization</div></div></div>
          <div style="margin-top:14px">${meter(e.risk, critColor(e.crit))}</div>
        </div>
        <div class="dsec"><h4>Maintenance Strategy</h4><div class="kv-grid">
          <div class="kv-item"><div class="k">PM Frequency</div><div class="v">${e.crit === 'life' ? 'Quarterly' : 'Semi-annual'}</div></div>
          <div class="kv-item"><div class="k">PM Compliance</div><div class="v">${e.pm}%</div></div>
          <div class="kv-item"><div class="k">Next PM Due</div><div class="v mono">${fmtDate(e.next_pm)}</div></div>
          <div class="kv-item"><div class="k">Calibration Due</div><div class="v mono">${e.cal_due ? fmtDate(e.cal_due) : 'N/A'}</div></div>
        </div></div>
        <div class="dsec"><button class="btn btn-primary" style="width:100%;justify-content:center" onclick="closeDrawer();openNewWorkOrder()">${icon('wrench')}Raise Work Order</button></div>
      </div>
    </div>`);
}
window.openEquipment = openEquipment;

function dTab(btn, id) {
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  ['d-over', 'd-hist', 'd-docs', 'd-risk'].forEach(x => {
    const el = document.getElementById(x);
    if (el) el.style.display = x === id ? 'block' : 'none';
  });
}
window.dTab = dTab;

/* ================= WORK ORDER DRAWER ================= */
function openWO(id) {
  const w = WOMAP[id];
  if (!w) return;
  const e = EQMAP[w.eq_id];
  const flowSteps = ['Fault Reported', 'Triaged & Validated', 'Assigned & Accepted', 'Diagnosis', 'Repair in Progress', 'Post-Repair Testing', 'Verification & Return'];
  const cur = w.status === 'closed' ? flowSteps.length : w.status === 'awaitparts' ? 4 : w.status === 'inprogress' ? 4 : w.status === 'accepted' ? 3 : w.status === 'assigned' ? 2 : w.status === 'triaged' ? 1 : w.status === 'onhold' ? 4 : 3;
  openDrawerHTML(`
    <div class="drawer-head">
      <div class="drawer-title">
        <div class="big-ic" style="background:${w.pri === 'P1' ? 'var(--crit-soft)' : 'var(--primary-soft)'};color:${w.pri === 'P1' ? 'var(--crit)' : 'var(--primary)'}">${icon('wo')}</div>
        <div><h2>${w.title}</h2><div class="did">${w.id} · ${w.type} · Opened ${w.opened}</div></div>
      </div>
      <button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button>
    </div>
    <div class="drawer-body">
      <div class="dsec" style="display:flex;gap:10px;flex-wrap:wrap">
        ${priPill(w.pri)}${woStatus(w.status)}<span class="pill ${w.sla === 'At risk' ? 'p-crit' : 'p-info'}">SLA ${w.sla}</span>
      </div>
      <div class="dsec"><h4>Affected Equipment</h4>
        <div class="doc-row" onclick="openEquipment('${e.id}')" style="cursor:pointer;border:none;padding:2px 0">
          <div class="doc-ic" style="background:var(--surface-3);color:var(--text-2)">${icon(e.ic)}</div>
          <div style="flex:1"><div class="dn">${e.name}</div><div class="dm mono">${e.tag} · ${e.loc}</div></div>
          <span class="pill p-${CRIT[e.crit].c}">${CRIT[e.crit].l}</span>
        </div>
      </div>
      <div class="dsec"><h4>Repair Workflow</h4>
        <div class="flow">${flowSteps.map((s, i) => {
          const cls = i < cur ? 'done' : i === cur ? 'current' : 'todo';
          return `<div class="flow-step ${cls}"><div class="flow-node"><div class="fn">${i < cur ? icon('check') : i + 1}</div><div class="fl"></div></div>
          <div class="flow-c"><div class="fs-t">${s}</div><div class="fs-m">${i < cur ? 'Completed' : i === cur ? 'In progress now' : 'Pending'}</div></div></div>`;
        }).join('')}
        </div>
      </div>
      <div class="dsec"><h4>Assignment & SLA</h4><div class="kv-grid">
        <div class="kv-item"><div class="k">Assignee</div><div class="v">${w.assignee}</div></div>
        <div class="kv-item"><div class="k">Team</div><div class="v">${w.team}</div></div>
        <div class="kv-item"><div class="k">Opened</div><div class="v mono">${w.opened}</div></div>
        <div class="kv-item"><div class="k">Resolution Due</div><div class="v mono">${w.due}</div></div>
      </div>
      ${w.status !== 'closed' ? `<div style="margin-top:14px">${meter(w.sla_pct, w.sla_pct > 75 ? 'var(--crit)' : 'var(--primary)')}<div class="sub2" style="margin-top:5px">${w.sla_pct > 75 ? 'Approaching SLA breach — escalation triggered' : 'Within resolution window'}</div></div>` : '<div class="pill p-ok" style="margin-top:12px">SLA Met · closed within window</div>'}
      </div>
      <div class="dsec"><h4>Actions</h4>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="advanceWODrawer('${w.id}')">${icon('play')}Advance Status</button>
          <button class="btn btn-ghost" onclick="requestPartToWO('${w.id}')">${icon('parts')}Request Part</button>
          <button class="btn btn-ghost" onclick="escalateWO('${w.id}')">${icon('up')}Escalate</button>
        </div>
      </div>
    </div>`);
}
window.openWO = openWO;

/* ============================================================
   VIEW: COMMAND CENTER (DASHBOARD)
   ============================================================ */
VIEWS.dashboard = async function () {
  const kpis = [
    { t: 'Equipment Uptime', v: '97.4', u: '%', ic: 'gauge', accent: 'var(--ok)', soft: 'var(--ok-soft)', trend: 'up', delta: '+0.6%', lbl: 'vs last month' },
    { t: 'PM Compliance', v: '91', u: '%', ic: 'pm', accent: 'var(--primary)', soft: 'var(--primary-soft)', trend: 'up', delta: '+3%', lbl: 'target 90%' },
    { t: 'Open Work Orders', v: String(WORKORDERS.filter(w => w.status !== 'closed').length), u: '', ic: 'wo', accent: 'var(--warn)', soft: 'var(--warn-soft)', trend: 'down', delta: '−4', lbl: '8 high priority' },
    { t: 'SLA Compliance', v: '94.2', u: '%', ic: 'clock', accent: 'var(--info)', soft: 'var(--info-soft)', trend: 'flat', delta: '0.0%', lbl: '3 at risk today' },
  ];
  const kpiRow = `<div class="kpi-row">${kpis.map(k => `
    <div class="kpi" style="--accent:${k.accent};--accent-soft:${k.soft}">
      <div class="kt"><span class="ic">${icon(k.ic)}</span>${k.t}</div>
      <div class="kv">${k.v}<small>${k.u}</small></div>
      <div class="kf">
        <span class="trend ${k.trend}">${icon(k.trend === 'up' ? 'up' : k.trend === 'down' ? 'down' : 'arrowr')}${k.delta}</span>
        <span class="lbl">${k.lbl}</span>
      </div>
    </div>`).join('')}</div>`;

  const alerts = [
    { ic: 'alert', c: 'crit', t: 'Overdue PM — Life Support', m: 'Fresenius 5008S dialysis (DIA-NEP-09) preventive maintenance is 1 day overdue.', meta: ['ICU escalation', 'P2'], act: () => openEquipment('EQ-100622') },
    { ic: 'bolt', c: 'crit', t: 'Equipment Out of Service', m: 'MobileDiagnost wDR X-Ray flagged for detector calibration drift.', meta: ['Radiology', '8h ago'], act: () => openEquipment('EQ-100450') },
    { ic: 'parts', c: 'warn', t: 'Critical Spare — Stockout', m: 'MX750 ECG Lead Module reached 0 in stock (min 3). Blocks WO-24886.', meta: ['Reorder needed'], act: () => go('parts') },
    { ic: 'cal', c: 'cal', t: 'Calibration Due — 3 days', m: 'MAGNETOM Vida 3T MRI calibration certificate expires 30 Sep.', meta: ['IEC 61223'], act: () => openEquipment('EQ-100119') },
    { ic: 'clock', c: 'warn', t: 'SLA At Risk', m: 'WO-24917 (dialysate flow error) at 78% of P2 resolution window.', meta: ['22% remaining'], act: () => openJob('WO-24917', 'wo') },
  ];
  const feed = `<div class="card"><div class="card-head"><h3>Priority Alerts</h3><span class="link" onclick="go('workorders')">View all ${icon('arrowr')}</span></div>
    <div class="feed">${alerts.map((a, i) => `<div class="feed-item" onclick="__alert${i}()">
      <div class="feed-ic" style="background:var(--${a.c}-soft);color:var(--${a.c})">${icon(a.ic)}</div>
      <div class="feed-body"><div class="ft">${a.t}</div><div class="fm">${a.m}</div>
      <div class="fmeta">${a.meta.map(x => `<span>${x}</span>`).join('<span>·</span>')}</div></div>
      <div style="align-self:center;color:var(--text-3)">${icon('arrowr')}</div>
    </div>`).join('')}</div></div>`;
  alerts.forEach((a, i) => { window['__alert' + i] = a.act; });

  const mix = [
    { label: 'Life Support', value: EQUIP.filter(e => e.crit === 'life').length, color: 'var(--crit)' },
    { label: 'High Risk', value: EQUIP.filter(e => e.crit === 'high').length, color: 'var(--warn)' },
    { label: 'Medium', value: EQUIP.filter(e => e.crit === 'med').length, color: 'var(--info)' },
    { label: 'Low', value: EQUIP.filter(e => e.crit === 'low').length, color: 'var(--text-3)' },
  ];
  const availTrend = [{ l: 'W1', v: 95.8 }, { l: 'W2', v: 96.2 }, { l: 'W3', v: 95.4 }, { l: 'W4', v: 96.9 }, { l: 'W5', v: 97.1 }, { l: 'W6', v: 96.7 }, { l: 'W7', v: 97.4 }];
  const woVol = [{ l: 'Mar', a: 62, b: 14 }, { l: 'Apr', a: 58, b: 11 }, { l: 'May', a: 66, b: 9 }, { l: 'Jun', a: 71, b: 13 }, { l: 'Jul', a: 64, b: 8 }, { l: 'Aug', a: 59, b: 7 }];

  const deptLoad = [
    { nm: 'ICU', v: 18, max: 18, c: 'var(--crit)' },
    { nm: 'Radiology', v: 14, max: 18, c: 'var(--warn)' },
    { nm: 'Operating Room', v: 11, max: 18, c: 'var(--primary)' },
    { nm: 'Emergency', v: 9, max: 18, c: 'var(--info)' },
    { nm: 'Nephrology', v: 7, max: 18, c: 'var(--info)' },
    { nm: 'Facilities', v: 6, max: 18, c: 'var(--text-3)' },
  ];
  const techLoad = TECHS.map(t => ({ n: t.name, r: t.trade + ' Team', open: t.load, cap: t.cap }));

  return `${kpiRow}
  <div class="grid-dash" style="margin-bottom:16px">
    <div class="card">
      <div class="card-head"><h3>Equipment Availability</h3><span class="hint">7-week trend · target 96%</span></div>
      <div class="card-pad">${areaChart(availTrend, 600, 180)}</div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Fleet by Criticality</h3><span class="hint">${EQUIP.length} assets</span></div>
      <div class="card-pad" style="display:flex;gap:20px;align-items:center">
        <div style="flex-shrink:0">${donut(mix, 140, 18, String(EQUIP.length), 'Total Assets')}</div>
        <div class="legend" style="flex-direction:column;gap:11px">
          ${mix.map(m => `<span><i style="background:${m.color}"></i>${m.label}<b style="margin-left:auto;color:var(--text);font-weight:600;padding-left:10px">${m.value}</b></span>`).join('')}
        </div>
      </div>
    </div>
  </div>
  <div class="grid-dash" style="margin-bottom:16px">
    ${feed}
    <div class="stack">
      <div class="card">
        <div class="card-head"><h3>Open Work by Department</h3></div>
        <div class="card-pad"><div class="barlist">
          ${deptLoad.map(d => `<div class="row"><span class="nm">${d.nm}</span><div class="track"><div class="fill" style="width:${d.v / d.max * 100}%;background:${d.c}"></div></div><span class="vv">${d.v}</span></div>`).join('')}
        </div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Technician Workload</h3><span class="link" onclick="toast('Opening resource planner')">Balance ${icon('arrowr')}</span></div>
        <div class="card-pad" style="display:flex;flex-direction:column;gap:14px">
          ${techLoad.map(t => `<div style="display:flex;align-items:center;gap:12px">
            <div class="avatar" style="background:linear-gradient(135deg,var(--primary),var(--primary-700))">${t.n.split(' ').map(x => x[0]).join('')}</div>
            <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px">${t.n}</div><div class="sub2">${t.r}</div></div>
            <div style="width:120px">${meter(Math.round(t.open / t.cap * 100), t.open / t.cap >= .75 ? 'var(--warn)' : 'var(--primary)')}</div>
            <div class="mono" style="font-size:12px;color:var(--text-2);min-width:34px;text-align:right">${t.open}/${t.cap}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Maintenance Volume</h3>
      <div class="legend"><span><i style="background:var(--primary)"></i>Preventive</span><span><i style="background:var(--warn)"></i>Corrective</span></div>
    </div>
    <div class="card-pad">${barChart(woVol, 1200, 180)}</div>
  </div>`;
};

/* ============================================================
   VIEW: EQUIPMENT REGISTER
   ============================================================ */
VIEWS.equipment = async function () {
  const counts = {
    all: EQUIP.length,
    life: EQUIP.filter(e => e.crit === 'life').length,
    maint: EQUIP.filter(e => ['maint', 'awaitpart', 'outofsvc'].includes(e.status)).length,
    pmdue: EQUIP.filter(e => new Date(e.next_pm) <= new Date('2026-09-01')).length,
  };
  return `
  <div class="page-head">
    <div><h1>Equipment Register</h1><div class="sub">Asset master for ${HOSP} — full lifecycle from commissioning to decommissioning</div></div>
    <div class="head-actions">
      <button class="btn btn-ghost" onclick="toast('Exporting register to Excel')">${icon('download')}Export</button>
      <button class="btn btn-primary" onclick="openAddEquipment()">${icon('asset')}Register Asset</button>
    </div>
  </div>
  <div class="toolbar">
    <div class="filters" id="eqchips">
      ${[['all', 'All Assets', counts.all], ['life', 'Life Support', counts.life], ['maint', 'Needs Attention', counts.maint], ['pmdue', 'PM Due Soon', counts.pmdue]].map(c => `<button class="chip ${c[0] === EQFILTER ? 'on' : ''}" onclick="EQFILTER='${c[0]}';go('equipment')">${c[1]}<span class="ct">${c[2]}</span></button>`).join('')}
    </div>
    <div class="spacer"></div>
    <select class="sel"><option>All Departments</option><option>ICU</option><option>Radiology</option><option>Operating Room</option><option>Emergency</option></select>
    <select class="sel"><option>All Categories</option><option>Ventilator</option><option>Imaging</option><option>Infusion</option></select>
  </div>
  <div class="card">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Asset</th><th>Location</th><th>Criticality</th><th>Status</th><th>PM Compliance</th><th>Next PM</th><th>Warranty</th></tr></thead>
      <tbody>${eqRows()}</tbody>
    </table></div>
  </div>`;
};

function eqRows() {
  let list = EQUIP.slice();
  if (EQFILTER === 'life') list = list.filter(e => e.crit === 'life');
  else if (EQFILTER === 'maint') list = list.filter(e => ['maint', 'awaitpart', 'outofsvc'].includes(e.status));
  else if (EQFILTER === 'pmdue') list = list.filter(e => new Date(e.next_pm) <= new Date('2026-09-01'));
  return list.map(e => `<tr onclick="openEquipment('${e.id}')">
    <td><div class="cellflex"><span class="crit-stripe" style="background:${critColor(e.crit)}"></span>
      <div class="eq-ic">${icon(e.ic)}</div>
      <div><div class="strong">${e.name}</div><div class="sub2 mono">${e.tag} · ${e.id}</div></div></div></td>
    <td>${e.loc}<div class="sub2">${e.dept}</div></td>
    <td><span class="pill p-${CRIT[e.crit].c}">${CRIT[e.crit].l}</span></td>
    <td>${eqStatus(e.status)}</td>
    <td style="min-width:130px">${meter(e.pm)}</td>
    <td class="mono" style="font-size:12px">${fmtDate(e.next_pm)}${overdue(e.next_pm)}</td>
    <td>${e.warranty === 'Active' ? '<span class="pill p-ok">In Warranty</span>' : '<span class="pill p-muted">Expired</span>'}</td>
  </tr>`).join('');
}

/* ============================================================
   VIEW: WORK ORDERS
   ============================================================ */
VIEWS.workorders = async function () {
  const open = WORKORDERS.filter(w => w.status !== 'closed').length;
  return `
  <div class="page-head">
    <div><h1>Work Orders</h1><div class="sub">Corrective & preventive maintenance execution · live SLA tracking</div></div>
    <div class="head-actions">
      <button class="btn btn-ghost" onclick="toast('Board view')">${icon('dash')}Board</button>
      <button class="btn btn-primary" onclick="openNewWorkOrder()">${icon('wo')}New Work Order</button>
    </div>
  </div>
  <div class="kpi-row" style="grid-template-columns:repeat(4,1fr)">
    ${[['Open', open, 'var(--warn)', 'var(--warn-soft)', 'wo'], ['High Priority', WORKORDERS.filter(w => w.pri === 'P1' && w.status !== 'closed').length, 'var(--crit)', 'var(--crit-soft)', 'alert'], ['Waiting Parts', WORKORDERS.filter(w => w.status === 'awaitparts').length, 'var(--info)', 'var(--info-soft)', 'parts'], ['SLA At Risk', WORKORDERS.filter(w => w.sla === 'At risk').length, 'var(--crit)', 'var(--crit-soft)', 'clock']].map(k => `
      <div class="kpi" style="--accent:${k[2]};--accent-soft:${k[3]}"><div class="kt"><span class="ic">${icon(k[4])}</span>${k[0]}</div><div class="kv">${k[1]}</div></div>`).join('')}
  </div>
  <div class="toolbar">
    <div class="seg">${[['open', 'Open'], ['all', 'All'], ['mine', 'Assigned to me'], ['closed', 'Closed']].map(s => `<button class="${s[0] === WOFILTER ? 'on' : ''}" onclick="WOFILTER='${s[0]}';go('workorders')">${s[1]}</button>`).join('')}</div>
    <div class="spacer"></div>
    <select class="sel"><option>All Priorities</option><option>P1</option><option>P2</option><option>P3</option></select>
    <select class="sel"><option>All Teams</option><option>Biomedical</option><option>Imaging</option><option>Facilities</option><option>Vendor</option></select>
  </div>
  <div class="card"><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Work Order</th><th>Equipment</th><th>Priority</th><th>Status</th><th>Assignee</th><th>SLA</th><th class="num">Due</th></tr></thead>
    <tbody>${woRows()}</tbody>
  </table></div></div>`;
};

function woRows() {
  let list = WORKORDERS.slice();
  if (WOFILTER === 'open') list = list.filter(w => w.status !== 'closed');
  else if (WOFILTER === 'closed') list = list.filter(w => w.status === 'closed');
  else if (WOFILTER === 'mine') list = list.filter(w => w.assignee === 'K. Haddad');
  const slaColor = s => s === 'At risk' ? 'p-crit' : s === 'Paused' ? 'p-warn' : s === 'Met' ? 'p-ok' : 'p-info';
  return list.map(w => {
    const e = EQMAP[w.eq_id];
    return `<tr onclick="openJob('${w.id}','wo')">
    <td><div class="strong">${w.title}</div><div class="sub2 mono">${w.id} · ${w.type}</div></td>
    <td><div class="cellflex"><div class="eq-ic">${icon(e.ic)}</div><div><div style="font-weight:500">${e.tag}</div><div class="sub2">${e.dept}</div></div></div></td>
    <td>${priPill(w.pri)}</td>
    <td>${woStatus(w.status)}</td>
    <td>${w.assignee}<div class="sub2">${w.team}</div></td>
    <td><span class="pill ${slaColor(w.sla)}">${w.sla}</span>${w.status !== 'closed' ? `<div class="meter" style="margin-top:6px;width:80px"><i style="width:${w.sla_pct}%;background:${w.sla_pct > 75 ? 'var(--crit)' : 'var(--primary)'}"></i></div>` : ''}</td>
    <td class="num mono" style="font-size:12px">${w.due.split(' ')[0].slice(5)}<div class="sub2">${w.due.split(' ')[1]}</div></td>
  </tr>`;
  }).join('');
}

/* ============================================================
   VIEW: SERVICE REQUESTS
   ============================================================ */
VIEWS.requests = async function () {
  return `
  <div class="page-head"><div><h1>Service Requests</h1><div class="sub">Faults reported from the floor — scan-to-report, triage, and convert to work orders</div></div>
  <button class="btn btn-primary" onclick="openReportFault()">${icon('alert')}Report Fault</button></div>
  <div class="card"><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Request</th><th>Equipment</th><th>Reported by</th><th>Usable?</th><th>Urgency</th><th>When</th><th></th></tr></thead>
    <tbody>${SR_DATA.map(r => {
    const e = EQMAP[r.eq_id];
    return `<tr>
      <td><div class="strong">${r.description}</div><div class="sub2 mono">${r.id}</div></td>
      <td><div class="cellflex"><div class="eq-ic">${icon(e.ic)}</div><div><div style="font-weight:500">${e.tag}</div><div class="sub2">${e.dept}</div></div></div></td>
      <td>${r.by}</td>
      <td>${r.usable === 'Yes' ? '<span class="pill p-ok">Usable</span>' : r.usable === 'Limited' ? '<span class="pill p-warn">Limited</span>' : '<span class="pill p-crit">Not Usable</span>'}</td>
      <td><span class="pill ${r.urg === 'High' ? 'p-crit' : r.urg === 'Medium' ? 'p-warn' : 'p-muted'}">${r.urg}</span></td>
      <td class="sub2">${r.time}</td>
      <td><button class="btn btn-ghost" style="height:32px;font-size:12px" onclick="event.stopPropagation();convertSRToWO('${r.id}')">Convert ${icon('arrowr')}</button></td>
    </tr>`;
  }).join('')}</tbody>
  </table></div></div>`;
};

/* ============================================================
   VIEW: PREVENTIVE MAINTENANCE
   ============================================================ */
VIEWS.pm = async function () {
  const complianceByDept = [
    { nm: 'ICU', v: 97 }, { nm: 'Radiology', v: 92 }, { nm: 'Operating Room', v: 98 }, { nm: 'Emergency', v: 100 }, { nm: 'Nephrology', v: 70 }, { nm: 'Facilities', v: 88 }, { nm: 'NICU', v: 97 },
  ];
  const first = new Date('2026-09-01');
  const startDow = (first.getDay() + 6) % 7;
  const evs = { 2: [['crit', 'Dialysis PM — overdue']], 3: [['warn', 'MRI cooling PM']], 5: [['warn', 'Sterilizer PM']], 8: [['crit', 'Defib safety test']], 10: [['ok', 'Incubator PM']], 12: [['ok', 'Ventilator PM']], 15: [['ok', 'Ultrasound PM']], 18: [['cal', 'Syringe pump cal']], 20: [['ok', 'Anesthesia PM']], 22: [['cal', 'Incubator cal']], 25: [['ok', 'X-ray PM']], 28: [['warn', 'Generator PM']] };
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell out"></div>`;
  for (let d = 1; d <= 30; d++) {
    const ev = evs[d] || [];
    cells += `<div class="cal-cell"><div class="dnum">${d}</div>${ev.map(e => `<div class="cal-ev ${e[0]}" onclick="toast('${e[1]}')">${e[1]}</div>`).join('')}</div>`;
  }
  return `
  <div class="page-head"><div><h1>Preventive Maintenance</h1><div class="sub">Scheduled servicing, safety testing & compliance — September 2026</div></div>
    <div class="head-actions"><button class="btn btn-ghost" onclick="toast('PM plan templates')">${icon('pm')}PM Plans</button>
    <button class="btn btn-primary" onclick="toast('Generating PM schedule')">${icon('refresh')}Generate Schedule</button></div></div>
  <div class="kpi-row">
    ${[['Overall PM Compliance', '91', '%', 'var(--primary)', 'var(--primary-soft)', 'pm'], ['High-Risk Compliance', '96', '%', 'var(--ok)', 'var(--ok-soft)', 'shield'], ['Due This Week', '12', '', 'var(--warn)', 'var(--warn-soft)', 'clock'], ['Overdue', String(PMWO.filter(p => p.status === 'overdue').length), '', 'var(--crit)', 'var(--crit-soft)', 'alert']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}
  </div>
  <div class="card">
    <div class="card-head"><h3>PM Calendar</h3><span class="hint">September 2026</span></div>
    <div class="card-pad">
      <div class="cal-grid" style="margin-bottom:8px">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="cal-dow">${d}</div>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
      <div class="legend" style="margin-top:14px"><span><i style="background:var(--ok)"></i>Routine PM</span><span><i style="background:var(--warn)"></i>Safety / major</span><span><i style="background:var(--crit)"></i>Overdue</span><span><i style="background:var(--cal)"></i>Calibration</span></div>
    </div>
  </div>
  <div class="grid-dash" style="align-items:start;margin-top:16px">
  <div class="card">
    <div class="card-head"><h3>Upcoming PM Work Orders</h3><span class="link" onclick="go('workorders')">All work orders ${icon('arrowr')}</span></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>PM Work Order</th><th>Equipment</th><th>Frequency</th><th>Due</th><th>Status</th><th></th></tr></thead>
      <tbody>${PMWO.map(pm => {
    const e = EQMAP[pm.eq_id];
    const ov = new Date(pm.due) < new Date(TODAY) && pm.status !== 'completed';
    return `<tr onclick="openJob('${pm.id}','pm')">
        <td><div class="strong">${pm.title}</div><div class="sub2 mono">${pm.id}</div></td>
        <td><div class="cellflex"><span class="crit-stripe" style="background:${critColor(e.crit)}"></span><div class="eq-ic">${icon(e.ic)}</div><div><div style="font-weight:500">${e.tag}</div><div class="sub2">${e.dept}</div></div></div></td>
        <td>${pm.freq}</td>
        <td class="mono" style="font-size:12px">${fmtDate(e.next_pm)}${ov ? ' <span class="pill p-crit" style="margin-left:4px">Overdue</span>' : ''}</td>
        <td>${pm.status === 'completed' ? '<span class="pill p-ok">Completed</span>' : ov ? '<span class="pill p-crit">Overdue</span>' : new Date(pm.due) < new Date('2026-09-11') ? '<span class="pill p-warn">Due soon</span>' : '<span class="pill p-info">Scheduled</span>'}</td>
        <td><button class="btn btn-ghost" style="height:32px;font-size:12px" onclick="event.stopPropagation();openJob('${pm.id}','pm')">${pm.status === 'completed' ? 'View' : 'Open checklist'} ${icon('arrowr')}</button></td>
      </tr>`;
  }).join('')}</tbody>
    </table></div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Compliance by Department</h3><span class="hint">target 90%</span></div>
    <div class="card-pad"><div class="barlist">
      ${complianceByDept.map(d => `<div class="row"><span class="nm">${d.nm}</span><div class="track"><div class="fill" style="width:${d.v}%;background:${d.v >= 90 ? 'var(--ok)' : d.v >= 80 ? 'var(--warn)' : 'var(--crit)'}"></div></div><span class="vv">${d.v}%</span></div>`).join('')}
    </div></div>
  </div>
  </div>`;
};

/* ============================================================
   VIEW: CALIBRATION
   ============================================================ */
VIEWS.calibration = async function () {
  const rows = EQUIP.filter(e => e.cal_due);
  return `
  <div class="page-head"><div><h1>Calibration Management</h1><div class="sub">Traceable calibration against IEC / manufacturer standards with certificate control</div></div>
    <button class="btn btn-primary" onclick="openRecordCalibration()">${icon('cal')}Record Calibration</button></div>
  <div class="kpi-row">
    ${[['Due in 30 days', '6', '', 'var(--warn)', 'var(--warn-soft)', 'clock'], ['Overdue', '1', '', 'var(--crit)', 'var(--crit-soft)', 'alert'], ['Pass Rate (YTD)', '96', '%', 'var(--ok)', 'var(--ok-soft)', 'check'], ['Certificates on File', '318', '', 'var(--info)', 'var(--info-soft)', 'file']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}
  </div>
  <div class="card"><div class="card-head"><h3>Calibration Schedule</h3></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Equipment</th><th>Standard</th><th>Interval</th><th>Last Result</th><th>Due</th><th>Certificate</th></tr></thead>
    <tbody>${rows.map(e => {
    const std = e.cat === 'Imaging' ? 'IEC 61223' : e.cat === 'Defibrillator' ? 'IEC 60601-2-4' : e.cat === 'Infusion' ? 'IEC 60601-2-24' : 'IEC 62353';
    const ov = new Date(e.cal_due) < new Date('2026-08-28');
    return `<tr onclick="openEquipment('${e.id}')">
      <td><div class="cellflex"><div class="eq-ic">${icon(e.ic)}</div><div><div class="strong">${e.name}</div><div class="sub2 mono">${e.tag}</div></div></div></td>
      <td class="mono" style="font-size:12px">${std}</td>
      <td>12 months</td>
      <td>${ov ? '<span class="pill p-crit">Overdue</span>' : '<span class="pill p-ok">Pass</span>'}</td>
      <td class="mono" style="font-size:12px">${fmtDate(e.cal_due)}${overdue(e.cal_due)}</td>
      <td>${ov ? '<span class="pill p-muted">Expired</span>' : '<span class="link">View certificate</span>'}</td>
    </tr>`;
  }).join('')}</tbody>
  </table></div></div>`;
};

/* ============================================================
   VIEW: SPARE PARTS
   ============================================================ */
VIEWS.parts = async function () {
  const low = PARTS.filter(p => p.qty < p.min_qty).length;
  const val = PARTS.reduce((s, p) => s + p.qty * Number(p.cost), 0);
  return `
  <div class="page-head"><div><h1>Spare Parts & Inventory</h1><div class="sub">Stock control, reorder monitoring & critical-spare availability</div></div>
    <div class="head-actions"><button class="btn btn-ghost" onclick="openIssuePart()">${icon('arrowr')}Issue Part</button>
    <button class="btn btn-primary" onclick="reorderLowStock()">${icon('parts')}Reorder Low Stock</button></div></div>
  <div class="kpi-row">
    ${[['Stock Value', '$' + (val / 1000).toFixed(1) + 'k', '', 'var(--primary)', 'var(--primary-soft)', 'cost'], ['Below Minimum', String(low), '', 'var(--warn)', 'var(--warn-soft)', 'down'], ['Stockouts', String(PARTS.filter(p => p.qty === 0).length), '', 'var(--crit)', 'var(--crit-soft)', 'alert'], ['Critical Spares OK', '83', '%', 'var(--ok)', 'var(--ok-soft)', 'shield']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}
  </div>
  <div class="card"><div class="card-head"><h3>Parts Catalog</h3><span class="hint">${PARTS.length} SKUs · Central Store</span></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Part</th><th>Category</th><th>Bin</th><th>Stock Level</th><th class="num">On Hand</th><th class="num">Unit Cost</th><th>Status</th></tr></thead>
    <tbody>${PARTS.map(p => {
    const pct = Math.min(100, Math.round(p.qty / p.max_qty * 100));
    const minPct = p.min_qty / p.max_qty * 100;
    const c = p.qty === 0 ? 'var(--crit)' : p.qty < p.min_qty ? 'var(--warn)' : 'var(--ok)';
    return `<tr onclick="toast('Opening ${p.id}')">
      <td><div class="strong">${p.name}${p.crit ? ' <span class="pill p-crit" style="margin-left:4px">Critical</span>' : ''}</div><div class="sub2 mono">${p.id} · ${p.mfr}</div></td>
      <td>${p.cat}</td>
      <td class="mono" style="font-size:12px">${p.bin}</td>
      <td><div class="stockbar"><div class="track"><div class="rp" style="left:${minPct}%"></div><div class="fill" style="width:${pct}%;background:${c}"></div></div></div></td>
      <td class="num mono strong">${p.qty}<span class="sub2"> / ${p.min_qty} min</span></td>
      <td class="num mono">$${p.cost}</td>
      <td>${p.qty === 0 ? '<span class="pill p-crit">Stockout</span>' : p.qty < p.min_qty ? '<span class="pill p-warn">Reorder</span>' : '<span class="pill p-ok">In Stock</span>'}</td>
    </tr>`;
  }).join('')}</tbody>
  </table></div></div>`;
};

/* ============================================================
   VIEW: VENDORS
   ============================================================ */
VIEWS.vendors = async function () {
  return `
  <div class="page-head"><div><h1>Vendors & Contracts</h1><div class="sub">Service contracts, SLA performance & expiry tracking</div></div>
  <button class="btn btn-primary" onclick="openAddVendor()">${icon('vendor')}Add Vendor</button></div>
  <div class="card"><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Vendor</th><th>Coverage</th><th>Contract</th><th>SLA Compliance</th><th>Open Jobs</th><th>Annual Cost</th><th>Contract Expiry</th></tr></thead>
    <tbody>${VENDORS.map(v => {
    const soon = new Date(v.exp) < new Date('2026-11-01');
    return `<tr onclick="openVendor('${v.id}')">
      <td><div class="cellflex"><div class="eq-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('vendor')}</div><div class="strong">${v.name}</div></div></td>
      <td>${v.cat}</td><td class="sub2">${v.contract}</td>
      <td style="min-width:120px">${meter(v.sla)}</td>
      <td>${v.open ? `<span class="pill p-info">${v.open} open</span>` : '<span class="pill p-muted">None</span>'}</td>
      <td class="mono">$${Number(v.cost).toLocaleString()}</td>
      <td class="mono" style="font-size:12px">${fmtDate(v.exp)}${soon ? ' <span class="pill p-warn">Expiring</span>' : ''}</td>
    </tr>`;
  }).join('')}</tbody></table></div></div>`;
};

/* ============================================================
   VIEW: RISK & COMPLIANCE
   ============================================================ */
VIEWS.risk = async function () {
  const high = EQUIP.filter(e => e.risk >= 80).sort((a, b) => b.risk - a.risk);
  return `
  <div class="page-head"><div><h1>Risk & Compliance</h1><div class="sub">Equipment risk register, accreditation readiness & safety oversight</div></div>
  <button class="btn btn-primary" onclick="toast('Generating accreditation evidence pack')">${icon('shield')}Accreditation Pack</button></div>
  <div class="kpi-row">
    ${[['Life-Support Assets', String(EQUIP.filter(e => e.crit === 'life').length), '', 'var(--crit)', 'var(--crit-soft)', 'risk'], ['High-Risk Assets', String(EQUIP.filter(e => e.crit === 'high').length), '', 'var(--warn)', 'var(--warn-soft)', 'alert'], ['Open Recalls', '2', '', 'var(--crit)', 'var(--crit-soft)', 'bolt'], ['Accreditation Ready', '96', '%', 'var(--ok)', 'var(--ok-soft)', 'shield']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}
  </div>
  <div class="card"><div class="card-head"><h3>Highest-Risk Equipment</h3><span class="hint">composite risk ≥ 80</span></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Equipment</th><th>Criticality</th><th>Risk Score</th><th>PM Compliance</th><th>Status</th></tr></thead>
    <tbody>${high.map(e => `<tr onclick="openEquipment('${e.id}')">
      <td><div class="cellflex"><span class="crit-stripe" style="background:${critColor(e.crit)}"></span><div class="eq-ic">${icon(e.ic)}</div><div><div class="strong">${e.name}</div><div class="sub2 mono">${e.tag} · ${e.dept}</div></div></div></td>
      <td><span class="pill p-${CRIT[e.crit].c}">${CRIT[e.crit].l}</span></td>
      <td><div class="meter-lbl"><div class="meter" style="width:80px"><i style="width:${e.risk}%;background:${critColor(e.crit)}"></i></div><span class="pct" style="color:${critColor(e.crit)}">${e.risk}</span></div></td>
      <td style="min-width:120px">${meter(e.pm)}</td>
      <td>${eqStatus(e.status)}</td>
    </tr>`).join('')}</tbody></table></div></div>`;
};

/* ============================================================
   VIEW: REPORTS & KPIs
   ============================================================ */
VIEWS.reports = async function () {
  const cats = [
    { t: 'Maintenance', ic: 'wrench', items: ['PM Compliance', 'PM Overdue', 'Corrective Maintenance', 'Repeat Failures', 'Backlog Aging'] },
    { t: 'Reliability', ic: 'trending', items: ['MTBF by Category', 'MTTR Analysis', 'Equipment Downtime', 'Availability by Dept'] },
    { t: 'Cost', ic: 'cost', items: ['Maintenance Cost', 'Cost per Work Order', 'Lifecycle Cost', 'Cost vs Replacement Value'] },
    { t: 'Inventory', ic: 'parts', items: ['Inventory Valuation', 'Low-Stock Parts', 'Parts Consumption', 'Obsolete Stock'] },
    { t: 'Compliance', ic: 'shield', items: ['Calibration History', 'Safety Test Register', 'Warranty Expiration', 'Recall Status'] },
    { t: 'Vendor', ic: 'vendor', items: ['Vendor Performance', 'SLA Compliance', 'Contract Expiration', 'Vendor Cost'] },
  ];
  return `
  <div class="page-head"><div><h1>Reports & KPIs</h1><div class="sub">Configurable reporting across maintenance, reliability, cost & compliance</div></div>
  <button class="btn btn-primary" onclick="toast('Report builder opened')">${icon('report')}Build Report</button></div>
  <div class="kpi-row">
    ${[['MTBF', '142', 'days', 'var(--primary)', 'var(--primary-soft)', 'trending'], ['MTTR', '4.6', 'hrs', 'var(--info)', 'var(--info-soft)', 'clock'], ['Planned vs Unplanned', '78', '%', 'var(--ok)', 'var(--ok-soft)', 'pm'], ['Cost / Bed', '$1.2k', '', 'var(--warn)', 'var(--warn-soft)', 'cost']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}
  </div>
  <div class="grid-3">${cats.map(c => `<div class="card"><div class="card-head"><h3 style="display:flex;align-items:center;gap:9px"><span style="width:28px;height:28px;border-radius:8px;background:var(--primary-soft);color:var(--primary);display:grid;place-items:center">${icon(c.ic)}</span>${c.t}</h3></div>
    <div style="padding:6px 8px">${c.items.map(i => `<div class="doc-row" style="padding:9px 12px;cursor:pointer" onclick="toast('Running: ${i}')"><div class="dn" style="font-weight:500">${i}</div><span class="link">Run ${icon('arrowr')}</span></div>`).join('')}</div></div>`).join('')}</div>`;
};

/* ============================================================
   VIEW: AUDIT TRAIL
   ============================================================ */
VIEWS.audit = async function () {
  return `
  <div class="page-head"><div><h1>Audit Trail</h1><div class="sub">Immutable record of every action, approval & configuration change</div></div>
  <button class="btn btn-ghost" onclick="toast('Exporting audit log')">${icon('download')}Export Log</button></div>
  <div class="card"><div class="feed">${AUDIT.map(l => `<div class="feed-item" style="cursor:default">
    <div class="feed-ic" style="background:var(--${l.cat}-soft);color:var(--${l.cat})">${icon('audit')}</div>
    <div class="feed-body"><div class="ft">${l.action}</div><div class="fmeta"><span>${l.user_name}</span><span>·</span><span>${l.time}</span></div></div>
  </div>`).join('')}</div></div>`;
};

/* ============================================================
   VIEW: USERS & ACCESS
   ============================================================ */
VIEWS.users = async function () {
  const active = USERS.filter(u => u.status === 'active').length;
  return `
  <div class="page-head"><div><h1>Users & Access</h1><div class="sub">Accounts, role assignment & data-scope control · Role-Based Access Control</div></div>
    <button class="btn btn-primary" onclick="openAddUser()">${icon('users')}Add User</button></div>
  <div class="kpi-row">
    ${[['Total Users', String(USERS.length), '', 'var(--primary)', 'var(--primary-soft)', 'users'], ['Active', String(active), '', 'var(--ok)', 'var(--ok-soft)', 'check'], ['Pending Invites', String(USERS.filter(u => u.status === 'invited').length), '', 'var(--warn)', 'var(--warn-soft)', 'clock'], ['Roles Defined', String(ROLES.length), '', 'var(--info)', 'var(--info-soft)', 'shield']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}</div></div>`).join('')}
  </div>
  <div class="card"><div class="card-head"><h3>User Directory</h3><span class="hint">${USERS.length} accounts</span></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>User</th><th>Role</th><th>Data Scope</th><th>MFA</th><th>Status</th><th>Last Active</th></tr></thead>
    <tbody>${userRows()}</tbody>
  </table></div></div>`;
};

function userRows() {
  return USERS.map(u => {
    const st = USTAT[u.status];
    return `<tr onclick="openUser('${u.id}')">
    <td><div class="cellflex"><div class="avatar" style="background:linear-gradient(135deg,var(--primary),var(--primary-700))">${u.name.split(' ').map(x => x[0]).slice(0, 2).join('')}</div><div><div class="strong">${u.name}</div><div class="sub2 mono">${u.email}</div></div></div></td>
    <td>${u.role}</td><td class="sub2" style="margin:0">${u.scope}</td>
    <td>${u.mfa ? '<span class="pill p-ok">Enabled</span>' : '<span class="pill p-muted">Off</span>'}</td>
    <td><span class="pill ${st.c}">${st.l}</span></td>
    <td class="sub2">${u.last_active}</td></tr>`;
  }).join('');
}

function openUser(id) {
  const u = USERS.find(x => x.id === id);
  if (!u) return;
  const role = ROLES.find(r => r.name === u.role);
  const perms = role ? PERMS[role.id] : null;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('users')}</div><div><h2>${u.name}</h2><div class="did">${u.email} · ${u.id}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body">
    <div class="dsec" style="display:flex;gap:10px;flex-wrap:wrap"><span class="pill ${USTAT[u.status].c}">${USTAT[u.status].l}</span><span class="pill p-info">${u.role}</span>${u.mfa ? '<span class="pill p-ok">MFA on</span>' : '<span class="pill p-warn">MFA off</span>'}</div>
    <div class="dsec"><h4>Access & Scope</h4><div class="kv-grid">
      <div class="kv-item"><div class="k">Assigned Role</div><div class="v">${u.role}</div></div>
      <div class="kv-item"><div class="k">Data Scope</div><div class="v">${u.scope}</div></div>
      <div class="kv-item"><div class="k">Last Active</div><div class="v">${u.last_active}</div></div>
      <div class="kv-item"><div class="k">Account ID</div><div class="v mono">${u.id}</div></div>
    </div></div>
    ${perms ? `<div class="dsec"><h4>Effective Permissions</h4><div style="display:flex;flex-direction:column;gap:8px">
      ${MODULES.filter(mod => ACTIONS.some(a => perms[mod] && perms[mod][a])).map(mod => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px"><span>${mod}</span><span style="display:flex;gap:5px">${ACTIONS.filter(a => perms[mod][a]).map(a => `<span class="pill p-muted" style="padding:2px 7px">${a}</span>`).join('')}</span></div>`).join('')}
    </div><div style="margin-top:12px"><button class="btn btn-ghost" style="width:100%;justify-content:center" onclick="closeDrawer();SELROLE='${role.id}';go('roles')">${icon('shield')}Edit role permissions</button></div></div>` : ''}
    <div class="dsec"><div style="display:flex;gap:9px;flex-wrap:wrap"><button class="btn btn-primary" onclick="resetUserPassword('${u.id}')">Reset Password</button><button class="btn btn-ghost" onclick="openEditScope('${u.id}')">Edit Scope</button>${u.status === 'active' ? `<button class="btn btn-ghost" onclick="suspendUser('${u.id}')">Suspend</button>` : ''}</div></div>
  </div>`);
}
window.openUser = openUser;

function openAddUser() {
  NEWUSER = { role: ROLES[3] ? ROLES[3].name : '', scope: 'Main Campus' };
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('users')}</div><div><h2>Add User</h2><div class="did">Create an account & assign access</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Account Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Full name</span><input id="nu_name" placeholder="e.g. Jamil Rahme" oninput="NEWUSER.name=this.value"></label>
      <label class="fld"><span>Email</span><input id="nu_email" type="email" placeholder="name@cedarridge.org" oninput="NEWUSER.email=this.value"></label>
      <label class="fld"><span>Role</span><select id="nu_role" onchange="NEWUSER.role=this.value">${ROLES.map(r => `<option ${r.name === NEWUSER.role ? 'selected' : ''}>${r.name}</option>`).join('')}</select></label>
      <label class="fld"><span>Data scope</span><select id="nu_scope" onchange="NEWUSER.scope=this.value"><option>Main Campus</option><option>All Hospitals</option><option>ICU</option><option>Radiology</option><option>Operating Room</option><option>Facilities</option><option>Central Store</option><option>Assigned WOs only</option></select></label>
      <label class="chk-supr"><input type="checkbox" checked onchange="NEWUSER.mfa=this.checked"> Require multi-factor authentication</label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitUser()">${icon('check')}Create & Send Invite</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddUser = openAddUser;

async function submitUser() {
  if (!NEWUSER.name || !NEWUSER.email) { toast('Enter a name and email'); return; }
  const id = 'U-0' + String(USERS.length + 1).padStart(2, '0');
  const u = { id, name: NEWUSER.name, email: NEWUSER.email, role: NEWUSER.role, scope: NEWUSER.scope || 'Main Campus', status: 'invited', last_active: '—', mfa: NEWUSER.mfa !== false };
  const ok = await addUser(u);
  if (!ok) { toast('Failed to create user — ' + LAST_DB_ERROR); return; }
  USERS.push(u);
  closeDrawer();
  if (CURRENT === 'users') go('users');
  toast('User ' + NEWUSER.name + ' created — invite sent');
  addAuditLog(NEWUSER.name, 'Created user account ' + id, 'info');
}
window.submitUser = submitUser;

/* ============================================================
   VIEW: TECHNICIANS
   ============================================================ */
VIEWS.techs = async function () {
  return `
  <div class="page-head"><div><h1>Technicians & Competency</h1><div class="sub">Skills, certifications & workload — assignments respect competency controls</div></div>
    <button class="btn btn-primary" onclick="openAddTechnician()">${icon('wrench')}Add Technician</button></div>
  <div class="kpi-row">
    ${[['Technicians', String(TECHS.length), '', 'var(--primary)', 'var(--primary-soft)', 'users'], ['Avg Utilisation', String(Math.round(TECHS.reduce((s, t) => s + t.load / t.cap, 0) / TECHS.length * 100)), '%', 'var(--info)', 'var(--info-soft)', 'gauge'], ['Certs Expiring', '2', '', 'var(--warn)', 'var(--warn-soft)', 'clock'], ['Skill Areas', String(SKILL_AREAS.length), '', 'var(--ok)', 'var(--ok-soft)', 'shield']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}
  </div>
  <div class="grid-2" style="align-items:start;margin-bottom:16px">
    ${TECHS.map(t => {
    const certs = Array.isArray(t.certs) ? t.certs : [];
    const skills = Array.isArray(t.skills) ? t.skills : [];
    return `<div class="card"><div class="card-pad">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div class="avatar" style="width:44px;height:44px;background:linear-gradient(135deg,var(--primary),var(--primary-700));font-size:15px">${t.name.split(' ').map(x => x[0]).join('')}</div>
        <div style="flex:1"><div style="font-weight:700;font-size:15px">${t.name}</div><div class="sub2">${t.trade} Team · ${t.avail}</div></div>
        <div style="text-align:right"><div class="mono strong">${t.load}/${t.cap}</div><div class="sub2">open jobs</div></div>
      </div>
      <div style="margin-bottom:12px">${meter(Math.round(t.load / t.cap * 100), t.load / t.cap >= .75 ? 'var(--warn)' : 'var(--primary)')}</div>
      <div class="sub2" style="margin:0 0 6px">Competencies</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">${skills.map(s => `<span class="pill p-info" style="font-weight:500">${s}</span>`).join('')}</div>
      <div class="sub2" style="margin:0 0 6px">Certifications</div>
      <div style="display:flex;flex-direction:column;gap:7px">${certs.map(c => {
        const cs = certStatus(c.exp);
        return `<div style="display:flex;align-items:center;justify-content:space-between;font-size:12.5px"><span>${c.n}</span><span style="display:flex;gap:8px;align-items:center"><span class="mono sub2">${fmtDate(c.exp)}</span><span class="pill ${cs.c}">${cs.l}</span></span></div>`;
      }).join('')}</div>
    </div></div>`;
  }).join('')}
  </div>
  <div class="card"><div class="card-head"><h3>Competency Matrix</h3><span class="hint">technician × skill area</span></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Technician</th>${SKILL_AREAS.map(s => `<th class="num" style="font-size:10px">${s}</th>`).join('')}</tr></thead>
    <tbody>${TECHS.map(t => {
    const skills = Array.isArray(t.skills) ? t.skills : [];
    return `<tr><td class="strong">${t.name}<div class="sub2">${t.trade}</div></td>${SKILL_AREAS.map(s => `<td class="num">${skills.includes(s) ? `<span style="color:var(--ok)">${icon('check')}</span>` : '<span style="color:var(--border-strong)">·</span>'}</td>`).join('')}</tr>`;
  }).join('')}</tbody>
  </table></div></div>`;
};

/* ============================================================
   VIEW: ROLES & PERMISSIONS
   ============================================================ */
VIEWS.roles = async function () {
  const r = ROLES.find(x => x.id === SELROLE) || ROLES[0];
  const rp = PERMS[r.id] || {};
  return `
  <div class="page-head"><div><h1>Roles & Permissions</h1><div class="sub">Dynamic role creation — permissions are configured, not hard-coded</div></div>
    <div class="head-actions"><input id="newrole" placeholder="New role name…" class="sel" style="width:180px;height:38px"><button class="btn btn-primary" onclick="addRole()">${icon('shield')}Create Role</button></div></div>
  <div class="roles-grid">
    <div class="card" style="align-self:start"><div class="card-head"><h3>Roles</h3><span class="hint">${ROLES.length}</span></div>
      <div class="role-list">${ROLES.map(x => `<button class="role-item ${x.id === SELROLE ? 'on' : ''}" onclick="SELROLE='${x.id}';go('roles')">
        <div style="flex:1;min-width:0"><div class="ri-name">${x.name}${x.system ? ' <span class="pill p-muted" style="padding:1px 6px;font-size:9.5px">System</span>' : ''}</div><div class="ri-desc">${x.description}</div></div>
        <span class="ri-count">${x.users}</span></button>`).join('')}</div>
    </div>
    <div class="card" style="align-self:start"><div class="card-head"><h3>${r.name}</h3><span class="hint">${r.users} users · ${r.scope} scope</span></div>
      <div class="card-pad" style="padding-bottom:6px"><div class="sub2" style="margin:0 0 4px">${r.description}</div></div>
      <div class="tbl-wrap"><table class="tbl perm-tbl">
        <thead><tr><th>Module</th>${ACTIONS.map(a => `<th class="num">${a}</th>`).join('')}</tr></thead>
        <tbody>${MODULES.map(mod => `<tr><td class="strong">${mod}</td>${ACTIONS.map(a => {
    const on = rp[mod] && rp[mod][a];
    return `<td class="num"><button class="permcell ${on ? 'on' : ''}" onclick="togglePerm('${r.id}','${mod}','${a}')" aria-label="${mod} ${a}">${on ? icon('check') : ''}</button></td>`;
  }).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <div class="card-pad" style="display:flex;gap:9px;border-top:1px solid var(--border);flex-wrap:wrap"><button class="btn btn-primary" onclick="saveRolePerms('${r.id}')">${icon('check')}Save Changes</button><button class="btn btn-ghost" onclick="duplicateRole('${r.id}')">Duplicate Role</button>${!r.system ? `<button class="btn btn-ghost" style="color:var(--crit)" onclick="deleteRolePerm('${r.id}')">${icon('x')}Delete Role</button>` : ''}</div>
    </div>
  </div>`;
};

async function togglePerm(rid, mod, act) {
  const rp = PERMS[rid] || {};
  const current = rp[mod] && rp[mod][act];
  const newVal = !current;
  await togglePermission(rid, mod, act, newVal);
  if (!PERMS[rid]) PERMS[rid] = {};
  if (!PERMS[rid][mod]) PERMS[rid][mod] = {};
  PERMS[rid][mod][act] = newVal;
  if ((act === 'Create' || act === 'Edit' || act === 'Approve' || act === 'Delete') && newVal) {
    PERMS[rid][mod].View = true;
    await togglePermission(rid, mod, 'View', true);
  }
  go('roles');
}
window.togglePerm = togglePerm;

async function addRole() {
  const el = document.getElementById('newrole');
  const nm = el && el.value.trim();
  if (!nm) { toast('Enter a role name'); return; }
  const id = 'role' + (ROLES.length + 1);
  const ok = await addRoleToDB({ id, name: nm, description: 'Custom role — configure permissions', users: 0, scope: 'Custom', system: false });
  if (!ok) { toast('Failed to create role — ' + LAST_DB_ERROR); return; }
  ROLES.push({ id, name: nm, description: 'Custom role — configure permissions', users: 0, scope: 'Custom', system: false });
  PERMS[id] = {};
  MODULES.forEach(mod => { PERMS[id][mod] = {}; ACTIONS.forEach(a => { PERMS[id][mod][a] = false; }); });
  PERMS[id]['Equipment'].View = true;
  SELROLE = id;
  go('roles');
  toast('Role "' + nm + '" created — configure its permissions');
  addAuditLog('Admin', 'Created role ' + nm, 'info');
}
window.addRole = addRole;

/* ============================================================
   VIEW: WORKFLOW DESIGNER
   ============================================================ */
VIEWS.workflows = async function () {
  const wf = WORKFLOWS.find(w => w.id === SELWF) || WORKFLOWS[0];
  const wfTrans = WFTRANS.filter(t => t.workflow_id === wf.id);
  return `
  <div class="page-head"><div><h1>Workflow Designer</h1><div class="sub">Configure state machines: Status → Action → Conditions → Approval → Next Status → Notification → SLA</div></div>
    <button class="btn btn-primary" onclick="openNewWorkflow()">${icon('settings')}New Workflow</button></div>
  <div class="seg" style="margin-bottom:16px;flex-wrap:wrap">${WORKFLOWS.map(w => `<button class="${w.id === SELWF ? 'on' : ''}" onclick="SELWF='${w.id}';go('workflows')">${w.name}</button>`).join('')}</div>
  <div class="card" style="margin-bottom:16px"><div class="card-head"><h3>States</h3><span class="hint">${(wf.states || []).length} states · drag to reorder</span></div>
    <div class="card-pad">
      <div class="wf-rail">${(wf.states || []).map((s, i) => `<span class="wf-node ${i === 0 ? 'start' : i === (wf.states || []).length - 1 || s === 'Closed' || s === 'Disposed' || s === 'Received' || s === 'Completed' || s === 'Converted to WO' ? 'end' : ''}">${s}</span>${i < (wf.states || []).length - 1 ? `<span class="wf-arrow">${icon('arrowr')}</span>` : ''}`).join('')}</div>
      <div style="display:flex;gap:9px;margin-top:14px"><input id="newstate" class="sel" style="height:36px;width:200px" placeholder="Add a status…"><button class="btn btn-ghost" onclick="addState()">${icon('dash')}Add State</button></div>
    </div>
  </div>
  <div class="card"><div class="card-head"><h3>Transition Rules</h3><span class="hint">${wfTrans.length} configured transitions</span></div>
  <div class="tbl-wrap"><table class="tbl wf-tbl">
    <thead><tr><th>From</th><th>Action</th><th>Next</th><th>Required Conditions</th><th class="num">Approval</th><th class="num">Notify</th><th>SLA Effect</th></tr></thead>
    <tbody>${wfTrans.map(t => `<tr>
      <td><span class="pill p-muted">${t.from_state}</span></td>
      <td class="strong">${t.action}</td>
      <td><span class="pill p-info">${t.to_state}</span></td>
      <td><div style="display:flex;flex-wrap:wrap;gap:5px">${(t.cond || []).length ? (t.cond || []).map(c => `<span class="pill p-muted" style="padding:2px 7px">${c}</span>`).join('') : '<span class="sub2">None</span>'}</div></td>
      <td class="num"><button class="wf-toggle ${t.approval ? 'on' : ''}" onclick="toggleWF('${wf.id}','${t.id}','approval')"><span class="knob"></span></button></td>
      <td class="num"><button class="wf-toggle ${t.notify ? 'on' : ''}" onclick="toggleWF('${wf.id}','${t.id}','notify')"><span class="knob"></span></button></td>
      <td class="sub2" style="margin:0">${t.sla}</td>
    </tr>`).join('')}</tbody>
  </table></div>
  <div class="card-pad" style="border-top:1px solid var(--border);display:flex;gap:9px"><button class="btn btn-ghost" onclick="openAddTransition('${wf.id}')">${icon('dash')}Add Transition</button><button class="btn btn-primary" onclick="publishWorkflow('${wf.id}')">${icon('check')}Publish Workflow</button></div>
  </div>`;
};

async function toggleWF(wid, transId, field) {
  const wf = WORKFLOWS.find(w => w.id === wid);
  const trans = WFTRANS.find(t => t.id === transId);
  if (!trans) return;
  const newVal = !trans[field];
  await toggleWorkflowTransition(wid, transId, field, newVal);
  trans[field] = newVal;
  go('workflows');
  toast(field === 'approval' ? (newVal ? 'Approval now required' : 'Approval removed') : (newVal ? 'Notification enabled' : 'Notification disabled'));
  addAuditLog('Admin', `Updated workflow ${wf.name} transition ${trans.action} — ${field} ${newVal ? 'on' : 'off'}`, 'info');
}
window.toggleWF = toggleWF;

async function addState() {
  const el = document.getElementById('newstate');
  const nm = el && el.value.trim();
  if (!nm) { toast('Enter a status name'); return; }
  const wf = WORKFLOWS.find(w => w.id === SELWF);
  await addWorkflowState(SELWF, nm);
  wf.states = [...(wf.states || []), nm];
  go('workflows');
  toast('State "' + nm + '" added');
  addAuditLog('Admin', 'Added workflow state ' + nm + ' to ' + wf.name, 'info');
}
window.addState = addState;

/* ============================================================
   JOB WORKSPACE — checklist + workflow
   ============================================================ */
async function getJobState(id, jobType) {
  if (CHK_STATE[id]) return CHK_STATE[id];
  const dbState = await loadChecklistResult(id);
  if (dbState) {
    CHK_STATE[id] = {
      checklist: dbState.checklist || {},
      notes: dbState.notes || '',
      supervisor: dbState.supervisor || false,
      parts: dbState.parts || [],
      step: dbState.step,
    };
  } else {
    CHK_STATE[id] = { checklist: {}, notes: '', supervisor: false, parts: [], step: null };
  }
  return CHK_STATE[id];
}

async function openJob(id, kind) {
  ORIGIN = (kind === 'pm') ? 'pm' : 'workorders';
  CURRENT = 'job';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.querySelector('.nav-item[data-view="' + ORIGIN + '"]');
  if (el) el.classList.add('active');
  const canvas = document.getElementById('canvas');
  canvas.innerHTML = `<section class="view active" id="view-job"></section>`;
  await getJobState(id, kind);
  document.getElementById('view-job').innerHTML = (kind === 'pm') ? await pmJobHTML(id) : await corrJobHTML(id);
  canvas.scrollTop = 0;
}
window.openJob = openJob;

async function pmJobHTML(id) {
  const pm = PMWOMAP[id];
  const e = EQMAP[pm.eq_id];
  CHK_CTX = { tpl: pm.tpl, mode: 'pm', id };
  document.getElementById('crumbs').innerHTML = `<span class="link" onclick="go('pm')">Preventive (PM)</span>${icon('arrowr')}<b>${id}</b>`;
  const done = pm.status === 'completed';
  return `
  <div class="job-head">
    <div>
      <div class="job-back" onclick="go('pm')">${icon('arrowr')}<span>Back to PM schedule</span></div>
      <h1>${pm.title}</h1>
      <div class="job-meta"><span class="mono">${id}</span><span>·</span><span>${pm.freq} PM</span><span>·</span><span>Due ${fmtDate(pm.due)}</span>${new Date(pm.due) < new Date(TODAY) && !done ? ' <span class="pill p-crit">Overdue</span>' : ''}</div>
    </div>
    <div class="head-actions">
      ${done ? '<span class="pill p-ok" style="height:34px;padding:0 14px">Completed</span>' : '<span class="pill p-cal" style="height:34px;padding:0 14px">In Progress</span>'}
    </div>
  </div>
  <div class="job-grid">
    <div class="stack">
      <div class="card"><div class="card-head"><h3>PM Checklist${done ? ' — Completed' : ''}</h3><span class="hint">${pm.tpl.charAt(0).toUpperCase() + pm.tpl.slice(1)} protocol</span></div>
        <div class="card-pad"><div id="chkarea">${checklistHTML(id, pm.tpl, 'pm')}</div></div>
      </div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-head"><h3>Equipment</h3></div>
        <div class="card-pad">
          <div class="doc-row" onclick="openEquipment('${e.id}')" style="cursor:pointer;border:none;padding:0 0 12px">
            <div class="big-ic" style="width:40px;height:40px">${icon(e.ic)}</div>
            <div style="flex:1"><div class="dn">${e.name}</div><div class="dm mono">${e.tag} · ${e.loc}</div></div>
          </div>
          <div class="kv-grid" style="border-top:1px solid var(--border);padding-top:14px">
            <div class="kv-item"><div class="k">Criticality</div><div class="v"><span class="pill p-${CRIT[e.crit].c}">${CRIT[e.crit].l}</span></div></div>
            <div class="kv-item"><div class="k">Department</div><div class="v">${e.dept}</div></div>
            <div class="kv-item"><div class="k">Assigned Team</div><div class="v">${pm.team}</div></div>
            <div class="kv-item"><div class="k">Last PM</div><div class="v mono">12 Jun 2026</div></div>
          </div>
        </div>
      </div>
      <div class="card"><div class="card-head"><h3>Required Resources</h3></div>
        <div class="card-pad" style="display:flex;flex-direction:column;gap:10px">
          ${[['Skill', 'Biomedical Engineer'], ['Est. Duration', '90 min'], ['Tools', 'Safety analyzer, gas flow meter'], ['Documents', 'Manufacturer PM procedure']].map(r => `<div style="display:flex;justify-content:space-between;font-size:13px"><span class="sub2" style="margin:0">${r[0]}</span><span style="font-weight:500">${r[1]}</span></div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
}

async function corrJobHTML(id) {
  const w = WOMAP[id];
  const e = EQMAP[w.eq_id];
  const st = CHK_STATE[id];
  if (st.step === null) st.step = corrStepFromStatus(w.status);
  CHK_CTX = { tpl: 'posttest', mode: 'wo', id };
  document.getElementById('crumbs').innerHTML = `<span class="link" onclick="go('workorders')">Work Orders</span>${icon('arrowr')}<b>${id}</b>`;
  const cur = st.step;
  const closed = cur >= 8;
  const atTest = cur === 6;
  const stepper = `<div class="flow">${CORR_STEPS.map((s, i) => {
    const cls = i < cur ? 'done' : i === cur ? 'current' : 'todo';
    return `<div class="flow-step ${cls}"><div class="flow-node"><div class="fn">${i < cur ? icon('check') : i + 1}</div><div class="fl"></div></div>
    <div class="flow-c"><div class="fs-t">${s}</div><div class="fs-m">${i < cur ? 'Done' : i === cur ? 'Active' : 'Pending'}</div></div></div>`;
  }).join('')}</div>`;
  return `
  <div class="job-head">
    <div>
      <div class="job-back" onclick="go('workorders')">${icon('arrowr')}<span>Back to work orders</span></div>
      <h1>${w.title}</h1>
      <div class="job-meta"><span class="mono">${id}</span><span>·</span><span>${w.type}</span><span>·</span>${priPill(w.pri)}${woStatus(closed ? 'closed' : w.status)}</div>
    </div>
    <div class="head-actions">
      ${!closed ? `<button class="btn btn-primary" onclick="advanceJob('${id}')">${icon('play')}Advance to ${CORR_STEPS[Math.min(cur + 1, 8)]}</button>` : '<span class="pill p-ok" style="height:34px;padding:0 14px">Closed · SLA met</span>'}
    </div>
  </div>
  <div class="job-grid">
    <div class="stack">
      <div class="card"><div class="card-head"><h3>Repair Workflow</h3><span class="hint">step ${Math.min(cur + 1, 9)} of 9</span></div>
        <div class="card-pad">${stepper}</div>
      </div>
      ${atTest ? `<div class="card"><div class="card-head"><h3>Post-Repair Verification</h3><span class="hint">IEC 62353 / functional</span></div><div class="card-pad"><div id="chkarea">${checklistHTML(id, 'posttest', 'wo')}</div></div></div>` : ''}
      <div class="card"><div class="card-head"><h3>Diagnosis & Repair Log</h3></div>
        <div class="card-pad">
          <div class="kv-grid" style="margin-bottom:14px">
            <div class="kv-item"><div class="k">Observed Problem</div><div class="v">${w.title}</div></div>
            <div class="kv-item"><div class="k">Failure Mode</div><div class="v">${cur >= 4 ? 'Sensor / component fault' : 'Pending diagnosis'}</div></div>
            <div class="kv-item"><div class="k">Corrective Action</div><div class="v">${cur >= 5 ? 'Component replaced & recalibrated' : '—'}</div></div>
            <div class="kv-item"><div class="k">Equipment Safety</div><div class="v">${cur >= 6 ? '<span class="pill p-ok">Safe to return</span>' : '<span class="pill p-warn">Out of service</span>'}</div></div>
          </div>
          <textarea class="job-notes" placeholder="Add technician notes, observations, test results…" oninput="saveNotes('${id}',this.value)">${st.notes}</textarea>
        </div>
      </div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-head"><h3>Equipment</h3></div>
        <div class="card-pad"><div class="doc-row" onclick="openEquipment('${e.id}')" style="cursor:pointer;border:none;padding:0">
          <div class="big-ic" style="width:40px;height:40px">${icon(e.ic)}</div>
          <div style="flex:1"><div class="dn">${e.name}</div><div class="dm mono">${e.tag} · ${e.loc}</div></div>
          <span class="pill p-${CRIT[e.crit].c}">${CRIT[e.crit].l}</span></div></div>
      </div>
      <div class="card"><div class="card-head"><h3>Parts Used</h3><span class="link" onclick="issuePartTo('${id}')">Issue part ${icon('arrowr')}</span></div>
        <div class="card-pad" id="jobparts">${jobPartsHTML(id)}</div>
      </div>
      <div class="card"><div class="card-head"><h3>Assignment & SLA</h3></div>
        <div class="card-pad"><div class="kv-grid">
          <div class="kv-item"><div class="k">Assignee</div><div class="v">${w.assignee}</div></div>
          <div class="kv-item"><div class="k">Team</div><div class="v">${w.team}</div></div>
          <div class="kv-item"><div class="k">Opened</div><div class="v mono" style="font-size:12px">${w.opened}</div></div>
          <div class="kv-item"><div class="k">Due</div><div class="v mono" style="font-size:12px">${w.due}</div></div>
        </div>
        ${!closed ? `<div style="margin-top:14px">${meter(w.sla_pct, w.sla_pct > 75 ? 'var(--crit)' : 'var(--primary)')}</div>` : '<div class="pill p-ok" style="margin-top:12px">Resolved within SLA</div>'}
        </div>
      </div>
    </div>
  </div>`;
}

function checklistHTML(id, tplKey, mode) {
  const tpl = CHECKLISTS[tplKey];
  const st = CHK_STATE[id] || { checklist: {}, notes: '', supervisor: false, parts: [] };
  const pr = progressOf(st.checklist, tplKey);
  const pct = pr.total ? Math.round(pr.done / pr.total * 100) : 0;
  const secs = tpl.sections.map((sec, si) => `
    <div class="chk-sec">
      <div class="chk-sec-h">${sec.title}<span class="chk-sec-n">${sec.items.filter((it, ii) => st.checklist[si + '-' + ii]?.result).length}/${sec.items.length}</span></div>
      ${sec.items.map((it, ii) => {
    const key = si + '-' + ii;
    const r = st.checklist[key];
    if (it.type === 'check') {
      return `<div class="chk-item"><div class="chk-t">${it.t}</div>
          <div class="chk-seg">
            <button class="cs pass ${r?.result === 'pass' ? 'on' : ''}" onclick="setCheck('${id}','${key}','pass')">Pass</button>
            <button class="cs fail ${r?.result === 'fail' ? 'on' : ''}" onclick="setCheck('${id}','${key}','fail')">Fail</button>
            <button class="cs na ${r?.result === 'na' ? 'on' : ''}" onclick="setCheck('${id}','${key}','na')">N/A</button>
          </div></div>`;
    } else {
      const badge = r?.result === 'pass' ? '<span class="pill p-ok">Pass</span>' : r?.result === 'fail' ? '<span class="pill p-crit">Out of range</span>' : '';
      return `<div class="chk-item reading"><div class="chk-t">${it.t}<div class="chk-exp">Expected ${it.nominal} ${it.unit} · range ${it.min}–${it.max}</div></div>
          <div class="chk-read"><input type="number" step="any" value="${r?.val ?? ''}" placeholder="—" onchange="setReading('${id}','${key}',this.value,${it.min},${it.max})"><span class="unit">${it.unit}</span>${badge}</div></div>`;
    }
  }).join('')}
    </div>`).join('');
  const canClose = pr.done === pr.total;
  const actionLabel = mode === 'pm' ? 'Complete PM & Schedule Next' : 'Complete Testing & Verify';
  const action = mode === 'pm' ? `completePM('${id}')` : `completeTesting('${id}')`;
  return `
    <div class="chk-progress">
      <div class="chk-prog-top"><b>Checklist completion</b><span class="mono">${pr.done}/${pr.total} · ${pct}%</span></div>
      <div class="meter" style="height:9px"><i style="width:${pct}%;background:${pr.fails ? 'var(--warn)' : 'var(--primary)'}"></i></div>
      ${pr.fails ? `<div class="chk-warn">${icon('alert')} ${pr.fails} reading(s) out of range — corrective action or supervisor review required before return to service.</div>` : ''}
    </div>
    ${secs}
    <div class="chk-signoff">
      <div class="chk-sec-h">Sign-off</div>
      <label class="chk-supr"><input type="checkbox" ${st.supervisor ? 'checked' : ''} onchange="toggleSupervisor('${id}',this.checked)"> Supervisor verification obtained (required for life-support equipment)</label>
      <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:14px">
        <button class="btn ${canClose ? 'btn-primary' : 'btn-ghost'}" onclick="${action}" ${canClose ? '' : 'disabled style="opacity:.55;cursor:not-allowed"'}>${icon('check')}${actionLabel}</button>
        <button class="btn btn-ghost" onclick="toast('Draft saved')">Save Draft</button>
      </div>
      ${!canClose ? `<div class="sub2" style="margin-top:8px">Complete all ${pr.total} checklist items to enable sign-off.</div>` : ''}
    </div>`;
}

function setCheck(id, key, val) {
  const st = CHK_STATE[id];
  if (!st) return;
  st.checklist[key] = { result: val };
  saveChecklistResult(id, CHK_CTX.mode === 'pm' ? 'pm' : 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step });
  refreshChecklist(id);
}
window.setCheck = setCheck;

function setReading(id, key, val, min, max) {
  const st = CHK_STATE[id];
  if (!st) return;
  if (val === '') { delete st.checklist[key]; }
  else {
    const num = parseFloat(val);
    const pass = num >= min && num <= max;
    st.checklist[key] = { result: pass ? 'pass' : 'fail', val: num };
  }
  saveChecklistResult(id, CHK_CTX.mode === 'pm' ? 'pm' : 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step });
  refreshChecklist(id);
}
window.setReading = setReading;

function refreshChecklist(id) {
  if (!CHK_CTX) return;
  const el = document.getElementById('chkarea');
  if (el) el.innerHTML = checklistHTML(id, CHK_CTX.tpl, CHK_CTX.mode);
}

function toggleSupervisor(id, val) {
  const st = CHK_STATE[id];
  if (!st) return;
  st.supervisor = val;
  saveChecklistResult(id, CHK_CTX.mode === 'pm' ? 'pm' : 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step });
}
window.toggleSupervisor = toggleSupervisor;

function saveNotes(id, val) {
  const st = CHK_STATE[id];
  if (!st) return;
  st.notes = val;
}
window.saveNotes = saveNotes;

function jobPartsHTML(id) {
  const st = CHK_STATE[id];
  if (!st || !st.parts.length) return '<div class="sub2" style="margin:0">No parts issued yet.</div>';
  return st.parts.map(p => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)"><div class="doc-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('parts')}</div><div style="flex:1"><div style="font-weight:500;font-size:13px">${p.name}</div><div class="sub2 mono">${p.id} · qty ${p.qty}</div></div><span class="mono">$${p.cost * p.qty}</span></div>`).join('');
}

async function issuePartTo(id) {
  const st = CHK_STATE[id];
  const avail = PARTS.filter(p => p.qty > 0);
  const p = avail[st.parts.length % avail.length] || PARTS[0];
  await updatePart(p.id, { qty: Math.max(0, p.qty - 1) });
  p.qty = Math.max(0, p.qty - 1);
  st.parts.push({ id: p.id, name: p.name, qty: 1, cost: Number(p.cost) });
  saveChecklistResult(id, 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step });
  const el = document.getElementById('jobparts');
  if (el) el.innerHTML = jobPartsHTML(id);
  toast('Issued ' + p.id + ' from store — stock now ' + p.qty);
  addAuditLog('Store', 'Issued part ' + p.id + ' to ' + id, 'warn');
}
window.issuePartTo = issuePartTo;

async function completePM(id) {
  const pm = PMWOMAP[id];
  const st = CHK_STATE[id];
  const pr = progressOf(st.checklist, pm.tpl);
  if (pr.done < pr.total) { toast('Complete all checklist items first'); return; }
  const e = EQMAP[pm.eq_id];
  await updatePMWorkOrder(id, { status: 'completed', completed_on: TODAY });
  pm.status = 'completed';
  pm.completed_on = TODAY;
  const newPM = Math.min(100, Math.max(e.pm, pr.fails ? 88 : 98));
  const nextPM = addInterval(pm.due, pm.freq);
  await saveEquipment({ ...e, pm: newPM, next_pm: nextPM, status: (e.status === 'pm' || e.status === 'maint') ? 'available' : e.status });
  e.pm = newPM;
  e.next_pm = nextPM;
  if (e.status === 'pm' || e.status === 'maint') e.status = 'available';
  toast('PM ' + id + ' completed — next ' + pm.freq.toLowerCase() + ' PM scheduled ' + fmtDate(e.next_pm));
  addAuditLog('K. Haddad', 'Completed PM ' + id + ' on ' + e.tag, 'ok');
  openJob(id, 'pm');
}
window.completePM = completePM;

async function completeTesting(id) {
  const st = CHK_STATE[id];
  const pr = progressOf(st.checklist, 'posttest');
  if (pr.done < pr.total) { toast('Complete all verification items'); return; }
  if (pr.fails) { toast('Testing failed — equipment cannot return to service'); return; }
  st.step = 6;
  saveChecklistResult(id, 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step });
  toast('Post-repair testing passed — ready for verification');
  openJob(id, 'wo');
}
window.completeTesting = completeTesting;

async function advanceJob(id) {
  const w = WOMAP[id];
  const st = CHK_STATE[id];
  if (st.step === null) st.step = corrStepFromStatus(w.status);
  if (st.step === 6) {
    const pr = progressOf(st.checklist, 'posttest');
    if (pr.done < pr.total) { toast('Complete post-repair verification checklist to proceed'); return; }
    if (pr.fails) { toast('Verification failed — cannot advance to return-to-service'); return; }
  }
  st.step = Math.min(8, st.step + 1);
  saveChecklistResult(id, 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step });
  if (st.step >= 8) {
    await updateWorkOrder(id, { status: 'closed', sla_pct: 100 });
    w.status = 'closed';
    w.sla_pct = 100;
    toast('Work order ' + id + ' closed — equipment returned to service');
    addAuditLog(w.assignee, 'Closed work order ' + id, 'ok');
  } else {
    const smap = { 4: 'inprogress', 5: 'inprogress', 6: 'inprogress', 7: 'inprogress' };
    if (smap[st.step]) {
      await updateWorkOrder(id, { status: smap[st.step] });
      w.status = smap[st.step];
    }
    toast('Advanced to ' + CORR_STEPS[st.step]);
  }
  openJob(id, 'wo');
}
window.advanceJob = advanceJob;

/* ================= CREATE FORMS ================= */

let NEWWO = {};
function openNewWorkOrder() {
  NEWWO = { type: 'Corrective', pri: 'P3', assignee: 'Unassigned', team: 'Biomedical', eq_id: '', title: '' };
  const eqOpts = EQUIP.map(e => `<option value="${e.id}">${e.tag} — ${e.name}</option>`).join('');
  const techOpts = ['Unassigned', ...TECHS.map(t => t.name)].map(n => `<option ${n === 'Unassigned' ? 'selected' : ''}>${n}</option>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('wo')}</div><div><h2>New Work Order</h2><div class="did">Create a corrective or preventive work order</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Work Order Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Title / Problem Description</span><input id="nw_title" placeholder="e.g. Ventilator alarm not triggering" oninput="NEWWO.title=this.value"></label>
      <label class="fld"><span>Equipment</span><select id="nw_eq" onchange="NEWWO.eq_id=this.value"><option value="">Select equipment…</option>${eqOpts}</select></label>
      <label class="fld"><span>Type</span><select id="nw_type" onchange="NEWWO.type=this.value"><option>Corrective</option><option>Preventive</option><option>Calibration</option><option>Safety Test</option></select></label>
      <label class="fld"><span>Priority</span><select id="nw_pri" onchange="NEWWO.pri=this.value"><option>P1</option><option selected>P2</option><option selected>P3</option><option>P4</option></select></label>
      <label class="fld"><span>Assignee</span><select id="nw_assignee" onchange="NEWWO.assignee=this.value">${techOpts}</select></label>
      <label class="fld"><span>Team</span><select id="nw_team" onchange="NEWWO.team=this.value"><option>Biomedical</option><option>Imaging</option><option>Facilities</option><option>Vendor</option></select></label>
      <label class="fld"><span>Due Date</span><input id="nw_due" type="date" onchange="NEWWO.due=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitWorkOrder()">${icon('check')}Create Work Order</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openNewWorkOrder = openNewWorkOrder;

async function submitWorkOrder() {
  if (!NEWWO.title) { toast('Enter a title / problem description'); return; }
  if (!NEWWO.eq_id) { toast('Select the affected equipment'); return; }
  const id = 'WO-' + String(WORKORDERS.length + 24830).padStart(5, '0');
  const now = new Date();
  const openedStr = `${now.getDate().toString().padStart(2,'0')} ${now.toLocaleDateString('en-GB',{month:'short'})} ${now.getFullYear()}`;
  const dueDate = NEWWO.due ? NEWWO.due.split('-').reverse().join(' ') : openedStr;
  const wo = {
    id, eq_id: NEWWO.eq_id, title: NEWWO.title, type: NEWWO.type, pri: NEWWO.pri,
    status: 'triaged', assignee: NEWWO.assignee || 'Unassigned', team: NEWWO.team,
    opened: openedStr, due: dueDate, sla: 'On track', sla_pct: 0, step: 1, notes: '',
  };
  const ok = await addWorkOrder(wo);
  if (!ok) { toast('Failed to create work order — ' + LAST_DB_ERROR); return; }
  WORKORDERS.unshift(wo);
  WOMAP[wo.id] = wo;
  closeDrawer();
  if (CURRENT === 'workorders') go('workorders');
  toast('Work order ' + id + ' created');
  addAuditLog('Dr. Rana Aoun', 'Created work order ' + id + ' — ' + NEWWO.title, 'info');
}
window.submitWorkOrder = submitWorkOrder;

let NEWSR = {};
function openReportFault() {
  NEWSR = { eq_id: '', by: '', description: '', usable: 'Yes', urg: 'Medium' };
  const eqOpts = EQUIP.map(e => `<option value="${e.id}">${e.tag} — ${e.name}</option>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('alert')}</div><div><h2>Report a Fault</h2><div class="did">Log a service request from the floor</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Fault Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Equipment</span><select id="sr_eq" onchange="NEWSR.eq_id=this.value"><option value="">Select equipment…</option>${eqOpts}</select></label>
      <label class="fld"><span>Reported By</span><input id="sr_by" placeholder="e.g. Nurse on duty" oninput="NEWSR.by=this.value"></label>
      <label class="fld"><span>Fault Description</span><textarea id="sr_desc" rows="3" placeholder="Describe the fault…" oninput="NEWSR.description=this.value"></textarea></label>
      <label class="fld"><span>Is the equipment usable?</span><select id="sr_usable" onchange="NEWSR.usable=this.value"><option>Yes</option><option>Limited</option><option>No</option></select></label>
      <label class="fld"><span>Urgency</span><select id="sr_urg" onchange="NEWSR.urg=this.value"><option>Low</option><option selected>Medium</option><option>High</option></select></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitServiceRequest()">${icon('check')}Submit Request</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openReportFault = openReportFault;

async function submitServiceRequest() {
  if (!NEWSR.description) { toast('Enter a fault description'); return; }
  if (!NEWSR.eq_id) { toast('Select the affected equipment'); return; }
  const id = 'SR-' + String(SR_DATA.length + 1007).padStart(4, '0');
  const now = new Date();
  const timeStr = `${now.getDate().toString().padStart(2,'0')} ${now.toLocaleDateString('en-GB',{month:'short'})} ${now.getFullYear()}`;
  const sr = {
    id, eq_id: NEWSR.eq_id, by: NEWSR.by || 'Anonymous', description: NEWSR.description,
    usable: NEWSR.usable, time: timeStr, urg: NEWSR.urg,
  };
  const ok = await addServiceRequest(sr);
  if (!ok) { toast('Failed to submit request — ' + LAST_DB_ERROR); return; }
  SR_DATA.unshift(sr);
  closeDrawer();
  if (CURRENT === 'requests') go('requests');
  toast('Service request ' + id + ' submitted');
  addAuditLog(NEWSR.by || 'Anonymous', 'Reported fault ' + id + ' — ' + NEWSR.description.slice(0, 40), 'warn');
}
window.submitServiceRequest = submitServiceRequest;

let NEWVENDOR = {};
function openAddVendor() {
  NEWVENDOR = { name: '', cat: '', contract: '', sla: 90, cost: 0, exp: '' };
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('vendor')}</div><div><h2>Add Vendor</h2><div class="did">Register a vendor & service contract</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Vendor Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Vendor Name</span><input id="v_name" placeholder="e.g. Siemens Healthineers" oninput="NEWVENDOR.name=this.value"></label>
      <label class="fld"><span>Coverage Category</span><select id="v_cat" onchange="NEWVENDOR.cat=this.value"><option>Imaging</option><option>Biomedical</option><option>Facilities</option><option>Laboratory</option><option>IT / Network</option></select></label>
      <label class="fld"><span>Contract Type</span><input id="v_contract" placeholder="e.g. Full-service, 24/7" oninput="NEWVENDOR.contract=this.value"></label>
      <label class="fld"><span>SLA Compliance %</span><input id="v_sla" type="number" min="0" max="100" value="90" onchange="NEWVENDOR.sla=Number(this.value)"></label>
      <label class="fld"><span>Annual Cost ($)</span><input id="v_cost" type="number" value="0" onchange="NEWVENDOR.cost=Number(this.value)"></label>
      <label class="fld"><span>Contract Expiry</span><input id="v_exp" type="date" onchange="NEWVENDOR.exp=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitVendor()">${icon('check')}Add Vendor</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddVendor = openAddVendor;

async function submitVendor() {
  if (!NEWVENDOR.name) { toast('Enter a vendor name'); return; }
  const id = 'V-' + String(VENDORS.length + 8).padStart(3, '0');
  const v = {
    id, name: NEWVENDOR.name, cat: NEWVENDOR.cat, contract: NEWVENDOR.contract || 'Standard',
    sla: NEWVENDOR.sla, open: 0, cost: NEWVENDOR.cost, exp: NEWVENDOR.exp || null,
  };
  const ok = await addVendor(v);
  if (!ok) { toast('Failed to add vendor — ' + LAST_DB_ERROR); return; }
  VENDORS.push(v);
  closeDrawer();
  if (CURRENT === 'vendors') go('vendors');
  toast('Vendor ' + NEWVENDOR.name + ' added');
  addAuditLog('Admin', 'Added vendor ' + NEWVENDOR.name, 'info');
}
window.submitVendor = submitVendor;

let NEWEQ = {};
function openAddEquipment() {
  NEWEQ = { id: '', tag: '', name: '', model: '', mfr: '', cat: '', dept: '', loc: '', crit: 'med', status: 'available', serial: '', cost: 0 };
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('asset')}</div><div><h2>Add Equipment</h2><div class="did">Register a new medical device asset</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Equipment Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Asset Name</span><input id="eq_name" placeholder="e.g. Patient Monitor MX450" oninput="NEWEQ.name=this.value"></label>
      <label class="fld"><span>Asset Tag</span><input id="eq_tag" placeholder="e.g. CR-PM-0150" oninput="NEWEQ.tag=this.value"></label>
      <label class="fld"><span>Manufacturer</span><input id="eq_mfr" placeholder="e.g. Philips" oninput="NEWEQ.mfr=this.value"></label>
      <label class="fld"><span>Model</span><input id="eq_model" placeholder="e.g. MX450" oninput="NEWEQ.model=this.value"></label>
      <label class="fld"><span>Serial Number</span><input id="eq_serial" placeholder="e.g. SN-DE-2024-0892" oninput="NEWEQ.serial=this.value"></label>
      <label class="fld"><span>Category</span><select id="eq_cat" onchange="NEWEQ.cat=this.value"><option>Patient Monitor</option><option>Ventilator</option><option>Defibrillator</option><option>Infusion</option><option>Imaging</option><option>Sterilizer</option><option>HVAC</option><option>Other</option></select></label>
      <label class="fld"><span>Department</span><select id="eq_dept" onchange="NEWEQ.dept=this.value"><option>ICU</option><option>Radiology</option><option>Operating Room</option><option>Emergency</option><option>Nephrology</option><option>Facilities</option><option>NICU</option></select></label>
      <label class="fld"><span>Location</span><input id="eq_loc" placeholder="e.g. ICU Bay 3" oninput="NEWEQ.loc=this.value"></label>
      <label class="fld"><span>Criticality</span><select id="eq_crit" onchange="NEWEQ.crit=this.value"><option value="life">Life Support</option><option value="high">High Risk</option><option value="med" selected>Medium</option><option value="low">Low</option></select></label>
      <label class="fld"><span>Acquisition Cost ($)</span><input id="eq_cost" type="number" value="0" onchange="NEWEQ.cost=Number(this.value)"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEquipment()">${icon('check')}Register Equipment</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddEquipment = openAddEquipment;

async function submitEquipment() {
  if (!NEWEQ.name) { toast('Enter an asset name'); return; }
  if (!NEWEQ.tag) { toast('Enter an asset tag'); return; }
  const id = 'E-' + String(EQUIP.length + 850).padStart(4, '0');
  const icMap = { 'Patient Monitor': 'monitor', 'Ventilator': 'vent', 'Defibrillator': 'defib', 'Infusion': 'pump', 'Imaging': 'mri', 'Sterilizer': 'ster', 'HVAC': 'hvac', 'Other': 'asset' };
  const e = {
    id, tag: NEWEQ.tag, name: NEWEQ.name, model: NEWEQ.model, mfr: NEWEQ.mfr,
    cat: NEWEQ.cat, ic: icMap[NEWEQ.cat] || 'asset', dept: NEWEQ.dept, loc: NEWEQ.loc,
    status: NEWEQ.status, crit: NEWEQ.crit, risk: NEWEQ.crit === 'life' ? 90 : NEWEQ.crit === 'high' ? 75 : 50,
    pm: 100, next_pm: null, warranty: 'Active', cal_due: null, age: 0, cost: NEWEQ.cost, serial: NEWEQ.serial, sla: 'P3',
  };
  const ok = await addEquipment(e);
  if (!ok) { toast('Failed to register equipment — ' + LAST_DB_ERROR); return; }
  EQUIP.push(e);
  EQMAP[e.id] = e;
  closeDrawer();
  if (CURRENT === 'equipment') go('equipment');
  toast('Equipment ' + NEWEQ.tag + ' registered');
  addAuditLog('Admin', 'Registered equipment ' + NEWEQ.tag + ' — ' + NEWEQ.name, 'info');
}
window.submitEquipment = submitEquipment;

/* ================= TECHNICIAN FORM ================= */
let NEWTECH = {};
function openAddTechnician() {
  NEWTECH = { name: '', trade: 'Biomedical', skills: [], certName: '', certExp: '', cap: 8 };
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('wrench')}</div><div><h2>Add Technician</h2><div class="did">Register a technician & competency record</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Technician Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Full Name</span><input id="t_name" placeholder="e.g. Sami Khoury" oninput="NEWTECH.name=this.value"></label>
      <label class="fld"><span>Trade / Team</span><select id="t_trade" onchange="NEWTECH.trade=this.value"><option>Biomedical</option><option>Imaging</option><option>Facilities</option><option>HVAC</option></select></label>
      <label class="fld"><span>Capacity (open jobs)</span><input id="t_cap" type="number" value="8" min="1" max="20" onchange="NEWTECH.cap=Number(this.value)"></label>
      <div><div class="sub2" style="margin:0 0 6px">Competencies (toggle skill areas)</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${SKILL_AREAS.map(s => `<button class="pill ${NEWTECH.skills.includes(s) ? 'p-info' : 'p-muted'}" style="cursor:pointer;border:none" id="t_skill_${s}" onclick="toggleTechSkill('${s}')">${s}</button>`).join('')}</div>
      </div>
      <label class="fld"><span>Certification Name</span><input id="t_cert" placeholder="e.g. CBET (Certified Biomedical Equipment Technician)" oninput="NEWTECH.certName=this.value"></label>
      <label class="fld"><span>Certification Expiry</span><input id="t_certexp" type="date" onchange="NEWTECH.certExp=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitTechnician()">${icon('check')}Add Technician</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddTechnician = openAddTechnician;

function toggleTechSkill(s) {
  const idx = NEWTECH.skills.indexOf(s);
  if (idx >= 0) NEWTECH.skills.splice(idx, 1); else NEWTECH.skills.push(s);
  const btn = document.getElementById('t_skill_' + s);
  if (btn) { btn.className = 'pill ' + (NEWTECH.skills.includes(s) ? 'p-info' : 'p-muted'); btn.style.cursor = 'pointer'; btn.style.border = 'none'; }
}
window.toggleTechSkill = toggleTechSkill;

async function submitTechnician() {
  if (!NEWTECH.name) { toast('Enter a technician name'); return; }
  const id = 'U-T' + String(TECHS.length + 10).padStart(2, '0');
  const certs = [];
  if (NEWTECH.certName) certs.push({ n: NEWTECH.certName, exp: NEWTECH.certExp || '2027-01-01' });
  const t = { id, name: NEWTECH.name, trade: NEWTECH.trade, skills: NEWTECH.skills, certs, load: 0, cap: NEWTECH.cap, avail: 'On shift' };
  const ok = await addTechnician(t);
  if (!ok) { toast('Failed to add technician — ' + LAST_DB_ERROR); return; }
  TECHS.push(t);
  closeDrawer();
  if (CURRENT === 'techs') go('techs');
  toast('Technician ' + NEWTECH.name + ' added');
  addAuditLog('Admin', 'Added technician ' + NEWTECH.name, 'info');
}
window.submitTechnician = submitTechnician;

/* ================= CALIBRATION FORM ================= */
let NEWCAL = {};
function openRecordCalibration() {
  const eqOpts = EQUIP.map(e => `<option value="${e.id}">${e.tag} — ${e.name}</option>`).join('');
  NEWCAL = { eq_id: '', result: 'Pass', standard: '', nextDate: '', notes: '' };
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('cal')}</div><div><h2>Record Calibration</h2><div class="did">Log a calibration result & update due date</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Calibration Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Equipment</span><select id="cal_eq" onchange="NEWCAL.eq_id=this.value"><option value="">Select equipment…</option>${eqOpts}</select></label>
      <label class="fld"><span>Result</span><select id="cal_result" onchange="NEWCAL.result=this.value"><option>Pass</option><option>Fail</option><option>Limited</option></select></label>
      <label class="fld"><span>Standard</span><input id="cal_std" placeholder="e.g. IEC 61223" oninput="NEWCAL.standard=this.value"></label>
      <label class="fld"><span>Next Calibration Due</span><input id="cal_next" type="date" onchange="NEWCAL.nextDate=this.value"></label>
      <label class="fld"><span>Notes</span><textarea id="cal_notes" rows="2" placeholder="Test conditions, deviations…" oninput="NEWCAL.notes=this.value"></textarea></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitCalibration()">${icon('check')}Save Calibration</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openRecordCalibration = openRecordCalibration;

async function submitCalibration() {
  if (!NEWCAL.eq_id) { toast('Select equipment to calibrate'); return; }
  const e = EQMAP[NEWCAL.eq_id];
  const nextDue = NEWCAL.nextDate || new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  const ok = await updateEquipment(e.id, { cal_due: nextDue, status: NEWCAL.result === 'Fail' ? 'outofsvc' : e.status });
  if (!ok) { toast('Failed to save calibration — ' + LAST_DB_ERROR); return; }
  e.cal_due = nextDue;
  if (NEWCAL.result === 'Fail') e.status = 'outofsvc';
  closeDrawer();
  if (CURRENT === 'calibration') go('calibration');
  toast('Calibration recorded for ' + e.tag + ' — next due ' + fmtDate(nextDue));
  addAuditLog('K. Haddad', 'Recorded calibration for ' + e.tag + ' — ' + NEWCAL.result, 'ok');
}
window.submitCalibration = submitCalibration;

/* ================= WORKFLOW FORMS ================= */
let NEWWF = {};
function openNewWorkflow() {
  NEWWF = { name: '', states: [] };
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('settings')}</div><div><h2>New Workflow</h2><div class="did">Create a blank state machine</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Workflow Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Workflow Name</span><input id="wf_name" placeholder="e.g. Asset Decommissioning" oninput="NEWWF.name=this.value"></label>
      <label class="fld"><span>Initial States (comma-separated)</span><input id="wf_states" placeholder="e.g. Requested, Approved, Disposed" oninput="NEWWF.states=this.value.split(',').map(s=>s.trim()).filter(Boolean)"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitWorkflow()">${icon('check')}Create Workflow</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openNewWorkflow = openNewWorkflow;

async function submitWorkflow() {
  if (!NEWWF.name) { toast('Enter a workflow name'); return; }
  const id = 'wf-' + String(WORKFLOWS.length + 1);
  const wf = { id, name: NEWWF.name, states: NEWWF.states.length ? NEWWF.states : ['New', 'In Progress', 'Done'] };
  const ok = await addWorkflow(wf);
  if (!ok) { toast('Failed to create workflow — ' + LAST_DB_ERROR); return; }
  WORKFLOWS.push(wf);
  SELWF = id;
  closeDrawer();
  go('workflows');
  toast('Workflow "' + NEWWF.name + '" created');
  addAuditLog('Admin', 'Created workflow ' + NEWWF.name, 'info');
}
window.submitWorkflow = submitWorkflow;

let NEWTRANS = {};
function openAddTransition(wfId) {
  const wf = WORKFLOWS.find(w => w.id === wfId);
  const states = wf.states || [];
  const stateOpts = states.map(s => `<option>${s}</option>`).join('');
  NEWTRANS = { workflow_id: wfId, from_state: states[0] || '', action: '', to_state: states[states.length - 1] || '', sla: '—', seq: WFTRANS.filter(t => t.workflow_id === wfId).length };
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('dash')}</div><div><h2>Add Transition</h2><div class="did">Define a state transition for ${wf.name}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Transition Rule</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>From State</span><select id="tr_from" onchange="NEWTRANS.from_state=this.value">${stateOpts}</select></label>
      <label class="fld"><span>Action</span><input id="tr_action" placeholder="e.g. Approve, Reject, Assign" oninput="NEWTRANS.action=this.value"></label>
      <label class="fld"><span>To State</span><select id="tr_to" onchange="NEWTRANS.to_state=this.value">${stateOpts}</select></label>
      <label class="fld"><span>SLA Effect</span><input id="tr_sla" placeholder="e.g. Pauses SLA, Resets SLA" oninput="NEWTRANS.sla=this.value"></label>
      <label class="chk-supr"><input type="checkbox" onchange="NEWTRANS.approval=this.checked"> Requires approval</label>
      <label class="chk-supr"><input type="checkbox" onchange="NEWTRANS.notify=this.checked"> Send notification</label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitTransition()">${icon('check')}Add Transition</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddTransition = openAddTransition;

async function submitTransition() {
  if (!NEWTRANS.action) { toast('Enter an action name'); return; }
  const trans = {
    workflow_id: NEWTRANS.workflow_id, from_state: NEWTRANS.from_state, action: NEWTRANS.action,
    to_state: NEWTRANS.to_state, cond: [], approval: !!NEWTRANS.approval, notify: !!NEWTRANS.notify,
    sla: NEWTRANS.sla || '—', seq: NEWTRANS.seq,
  };
  const ok = await addWorkflowTransition(trans);
  if (!ok) { toast('Failed to add transition — ' + LAST_DB_ERROR); return; }
  WFTRANS.push(trans);
  closeDrawer();
  go('workflows');
  toast('Transition "' + NEWTRANS.action + '" added');
  addAuditLog('Admin', 'Added workflow transition ' + NEWTRANS.action, 'info');
}
window.submitTransition = submitTransition;

async function publishWorkflow(wfId) {
  const wf = WORKFLOWS.find(w => w.id === wfId);
  if (!wf) return;
  toast(wf.name + ' workflow published');
  addAuditLog('Admin', 'Published workflow ' + wf.name, 'ok');
}
window.publishWorkflow = publishWorkflow;

/* ================= ROLES: SAVE & DUPLICATE ================= */
async function saveRolePerms(rid) {
  const r = ROLES.find(x => x.id === rid);
  toast('Permissions for ' + (r ? r.name : 'role') + ' saved');
  addAuditLog('Admin', 'Saved permissions for ' + (r ? r.name : 'role'), 'info');
}
window.saveRolePerms = saveRolePerms;

async function duplicateRole(rid) {
  const r = ROLES.find(x => x.id === rid);
  if (!r) return;
  const newId = 'role' + (ROLES.length + 1);
  const newName = r.name + ' (Copy)';
  await addRoleToDB({ id: newId, name: newName, description: r.description, users: 0, scope: r.scope, system: false });
  ROLES.push({ id: newId, name: newName, description: r.description, users: 0, scope: r.scope, system: false });
  PERMS[newId] = JSON.parse(JSON.stringify(PERMS[rid] || {}));
  SELROLE = newId;
  go('roles');
  toast('Role duplicated as "' + newName + '"');
  addAuditLog('Admin', 'Duplicated role ' + r.name, 'info');
}
window.duplicateRole = duplicateRole;

async function deleteRolePerm(rid) {
  const r = ROLES.find(x => x.id === rid);
  if (!r || r.system) { toast('System roles cannot be deleted'); return; }
  await deleteRole(rid);
  const idx = ROLES.findIndex(x => x.id === rid);
  if (idx >= 0) ROLES.splice(idx, 1);
  delete PERMS[rid];
  SELROLE = ROLES[0] ? ROLES[0].id : '';
  go('roles');
  toast('Role "' + r.name + '" deleted');
  addAuditLog('Admin', 'Deleted role ' + r.name, 'warn');
}
window.deleteRolePerm = deleteRolePerm;

/* ================= USER ACTIONS ================= */
async function resetUserPassword(uid) {
  const u = USERS.find(x => x.id === uid);
  toast('Reset link sent to ' + (u ? u.email : 'user'));
  addAuditLog('Admin', 'Sent password reset to ' + (u ? u.email : 'user'), 'info');
}
window.resetUserPassword = resetUserPassword;

function openEditScope(uid) {
  const u = USERS.find(x => x.id === uid);
  if (!u) return;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('users')}</div><div><h2>Edit Scope — ${u.name}</h2><div class="did">Change the data scope for this user</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Data Scope</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Scope</span><select id="us_scope"><option ${u.scope === 'Main Campus' ? 'selected' : ''}>Main Campus</option><option ${u.scope === 'All Hospitals' ? 'selected' : ''}>All Hospitals</option><option ${u.scope === 'ICU' ? 'selected' : ''}>ICU</option><option ${u.scope === 'Radiology' ? 'selected' : ''}>Radiology</option><option ${u.scope === 'Operating Room' ? 'selected' : ''}>Operating Room</option><option ${u.scope === 'Facilities' ? 'selected' : ''}>Facilities</option><option ${u.scope === 'Central Store' ? 'selected' : ''}>Central Store</option><option ${u.scope === 'Assigned WOs only' ? 'selected' : ''}>Assigned WOs only</option></select></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEditScope('${uid}')">${icon('check')}Save Scope</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openEditScope = openEditScope;

async function submitEditScope(uid) {
  const sel = document.getElementById('us_scope');
  const scope = sel ? sel.value : 'Main Campus';
  await updateUser(uid, { scope });
  const u = USERS.find(x => x.id === uid);
  if (u) u.scope = scope;
  closeDrawer();
  if (CURRENT === 'users') go('users');
  toast('Scope updated for ' + (u ? u.name : 'user'));
  addAuditLog('Admin', 'Updated scope for ' + (u ? u.name : 'user') + ' to ' + scope, 'info');
}
window.submitEditScope = submitEditScope;

async function suspendUser(uid) {
  const u = USERS.find(x => x.id === uid);
  if (!u) return;
  await updateUser(uid, { status: 'disabled' });
  u.status = 'disabled';
  if (CURRENT === 'users') go('users');
  toast(u.name + ' suspended');
  addAuditLog('Admin', 'Suspended user ' + u.name, 'warn');
}
window.suspendUser = suspendUser;

/* ================= WO DRAWER ACTIONS ================= */
async function advanceWODrawer(id) {
  closeDrawer();
  await openJob(id, 'wo');
  await advanceJob(id);
}
window.advanceWODrawer = advanceWODrawer;

async function requestPartToWO(id) {
  const w = WOMAP[id];
  if (!w) return;
  const avail = PARTS.filter(p => p.qty > 0);
  if (!avail.length) { toast('No parts in stock'); return; }
  const p = avail[0];
  await updatePart(p.id, { qty: Math.max(0, p.qty - 1) });
  p.qty = Math.max(0, p.qty - 1);
  toast('Part ' + p.id + ' requested for ' + id + ' — stock now ' + p.qty);
  addAuditLog('Store', 'Requested part ' + p.id + ' for ' + id, 'warn');
}
window.requestPartToWO = requestPartToWO;

function escalateWO(id) {
  const w = WOMAP[id];
  if (!w) return;
  toast('Work order ' + id + ' escalated to supervisor');
  addAuditLog('Dr. Rana Aoun', 'Escalated work order ' + id, 'crit');
}
window.escalateWO = escalateWO;

/* ================= SERVICE REQUEST: CONVERT TO WO ================= */
async function convertSRToWO(srId) {
  const sr = SR_DATA.find(r => r.id === srId);
  if (!sr) return;
  const id = 'WO-' + String(WORKORDERS.length + 24830).padStart(5, '0');
  const now = new Date();
  const openedStr = `${now.getDate().toString().padStart(2,'0')} ${now.toLocaleDateString('en-GB',{month:'short'})} ${now.getFullYear()}`;
  const dueDate = openedStr;
  const wo = {
    id, eq_id: sr.eq_id, title: sr.description.slice(0, 60), type: 'Corrective',
    pri: sr.urg === 'High' ? 'P2' : sr.urg === 'Medium' ? 'P3' : 'P4',
    status: 'triaged', assignee: 'Unassigned', team: 'Biomedical',
    opened: openedStr, due: dueDate, sla: 'On track', sla_pct: 0, step: 1, notes: '',
  };
  const ok = await addWorkOrder(wo);
  if (!ok) { toast('Failed to convert request — ' + LAST_DB_ERROR); return; }
  WORKORDERS.unshift(wo);
  WOMAP[wo.id] = wo;
  await updateServiceRequest(srId, { usable: 'Converted' });
  sr.usable = 'Converted';
  if (CURRENT === 'requests') go('requests');
  toast('Converted ' + srId + ' to work order ' + id);
  addAuditLog('Dr. Rana Aoun', 'Converted service request ' + srId + ' to work order ' + id, 'info');
}
window.convertSRToWO = convertSRToWO;

/* ================= PARTS: ISSUE & REORDER ================= */
function openIssuePart() {
  const avail = PARTS.filter(p => p.qty > 0);
  const partOpts = avail.map(p => `<option value="${p.id}">${p.id} — ${p.name} (${p.qty} in stock)</option>`).join('');
  const woOpts = WORKORDERS.filter(w => w.status !== 'closed').map(w => `<option value="${w.id}">${w.id} — ${w.title}</option>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('parts')}</div><div><h2>Issue Part to Work Order</h2><div class="did">Deduct stock and assign to a job</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Issue Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Part</span><select id="ip_part"><option value="">Select part…</option>${partOpts}</select></label>
      <label class="fld"><span>Work Order</span><select id="ip_wo"><option value="">Select work order…</option>${woOpts}</select></label>
      <label class="fld"><span>Quantity</span><input id="ip_qty" type="number" value="1" min="1"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitIssuePart()">${icon('check')}Issue Part</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openIssuePart = openIssuePart;

async function submitIssuePart() {
  const pid = document.getElementById('ip_part').value;
  const woid = document.getElementById('ip_wo').value;
  const qty = Number(document.getElementById('ip_qty').value) || 1;
  if (!pid) { toast('Select a part'); return; }
  if (!woid) { toast('Select a work order'); return; }
  const p = PARTS.find(x => x.id === pid);
  if (!p || p.qty < qty) { toast('Insufficient stock'); return; }
  await updatePart(pid, { qty: p.qty - qty });
  p.qty -= qty;
  closeDrawer();
  if (CURRENT === 'parts') go('parts');
  toast('Issued ' + qty + ' × ' + p.id + ' to ' + woid);
  addAuditLog('Store', 'Issued ' + qty + ' × ' + p.id + ' to ' + woid, 'warn');
}
window.submitIssuePart = submitIssuePart;

async function reorderLowStock() {
  const low = PARTS.filter(p => p.qty < p.min_qty);
  if (!low.length) { toast('No parts below minimum'); return; }
  for (const p of low) {
    const reorderQty = p.max_qty - p.qty;
    await updatePart(p.id, { qty: p.max_qty });
    p.qty = p.max_qty;
  }
  if (CURRENT === 'parts') go('parts');
  toast('Reorder placed for ' + low.length + ' part(s) — stock replenished');
  addAuditLog('Store', 'Reordered ' + low.length + ' low-stock parts', 'warn');
}
window.reorderLowStock = reorderLowStock;

/* ================= VENDOR DRAWER ================= */
function openVendor(id) {
  const v = VENDORS.find(x => x.id === id);
  if (!v) return;
  const soon = v.exp && new Date(v.exp) < new Date('2026-11-01');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('vendor')}</div><div><h2>${v.name}</h2><div class="did">${v.id} · ${v.cat}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body">
    <div class="dsec" style="display:flex;gap:10px;flex-wrap:wrap">
      <span class="pill p-info">${v.cat}</span>
      ${v.contract ? `<span class="pill p-muted">${v.contract}</span>` : ''}
      ${soon ? '<span class="pill p-warn">Expiring</span>' : ''}
    </div>
    <div class="dsec"><h4>Contract & Performance</h4><div class="kv-grid">
      <div class="kv-item"><div class="k">SLA Compliance</div><div class="v">${v.sla}%</div></div>
      <div class="kv-item"><div class="k">Open Jobs</div><div class="v">${v.open}</div></div>
      <div class="kv-item"><div class="k">Annual Cost</div><div class="v mono">${Number(v.cost).toLocaleString()}</div></div>
      <div class="kv-item"><div class="k">Contract Expiry</div><div class="v mono">${fmtDate(v.exp)}</div></div>
    </div></div>
    <div class="dsec"><div style="display:flex;gap:9px;flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="toast('Editing ${v.name}')">Edit Vendor</button>
      <button class="btn btn-ghost" onclick="deleteVendorConfirm('${v.id}')">Delete Vendor</button>
    </div></div>
  </div>`);
}
window.openVendor = openVendor;

async function deleteVendorConfirm(id) {
  const v = VENDORS.find(x => x.id === id);
  if (!v) return;
  const ok = await deleteVendor(id);
  if (!ok) { toast('Failed to delete vendor — ' + LAST_DB_ERROR); return; }
  const idx = VENDORS.findIndex(x => x.id === id);
  if (idx >= 0) VENDORS.splice(idx, 1);
  closeDrawer();
  if (CURRENT === 'vendors') go('vendors');
  toast('Vendor "' + v.name + '" deleted');
  addAuditLog('Admin', 'Deleted vendor ' + v.name, 'warn');
}
window.deleteVendorConfirm = deleteVendorConfirm;

/* ================= INIT ================= */
async function init() {
  try { const t = localStorage.getItem('vit-theme'); if (t) THEME = t; } catch (e) {}
  if (THEME === 'dark') setTheme('dark'); else setTheme('light');

  // Build app shell
  document.getElementById('app').innerHTML = `
   <div class="app">
    <aside class="rail">
      <div class="brand">
        <div class="brand-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h3l2-6 4 12 2-6h4"/></svg>
        </div>
        <div>
          <div class="brand-name">Vitalis</div>
          <div class="brand-sub">Clinical Engineering</div>
        </div>
      </div>
      <div class="rail-scroll" id="nav"></div>
      <div class="rail-foot">
        <div class="rail-user">
          <div class="avatar">RA</div>
          <div class="who"><b>Dr. Rana Aoun</b><span>Biomedical Manager</span></div>
        </div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <nav class="crumbs" id="crumbs"><b>Command Center</b></nav>
        <div class="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input placeholder="Search assets, work orders, parts…" id="globalSearch">
          <kbd>⌘K</kbd>
        </div>
        <div class="top-actions">
          <button class="btn btn-ghost" onclick="toast('QR scanner ready — point at an equipment tag')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4"/></svg>Scan</button>
          <button class="icon-btn" id="themeBtn" title="Toggle theme"><svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg></button>
          <button class="icon-btn" title="Notifications" onclick="toast('7 unread alerts')"><span class="dot"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg></button>
          <button class="btn btn-primary" onclick="openNewWorkOrder()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>New Work Order</button>
        </div>
      </header>
      <div class="canvas" id="canvas"></div>
    </div>
    <div class="scrim" id="scrim" onclick="closeDrawer()"></div>
    <aside class="drawer" id="drawer"></aside>
    <div class="toast" id="toast"></div>
   </div>
  `;

  document.getElementById('themeBtn').onclick = () => {
    THEME = THEME === 'dark' ? 'light' : 'dark';
    setTheme(THEME);
  };

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('globalSearch').focus();
    }
  });

  buildNav();

  // Show loading state
  document.getElementById('canvas').innerHTML = `<section class="view active" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:14px">Loading Vitalis CMMS…</section>`;

  // Load all data from Supabase
  await refreshAllData();

  // Wire up search
  document.getElementById('globalSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim();
      if (!q) return;
      const hit = EQUIP.find(x => (x.name + x.tag + x.id).toLowerCase().includes(q.toLowerCase()));
      if (hit) { openEquipment(hit.id); } else { toast('No results for "' + q + '"'); }
    }
  });

  // Navigate to dashboard
  go('dashboard');
}

init();

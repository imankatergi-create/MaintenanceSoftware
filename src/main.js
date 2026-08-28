import { icon } from './icons.js';
import { donut, areaChart, barChart, meter } from './charts.js';
import { supabase } from './supabase.js';
import {
  HOSP, TODAY, CRIT, critColor, STAT, WOSTAT, USTAT, MODULES, ACTIONS, SKILL_AREAS,
  eqStatus, woStatus, priPill, fmtDate, overdue, certStatus,
  LAST_DB_ERROR,
  loadEquipment, loadWorkOrders, loadParts, loadPMWorkOrders, loadUsers, loadTechnicians,
  loadRoles, loadPermissions, loadWorkflows, loadWorkflowTransitions, loadServiceRequests,
  loadVendors, loadAuditLogs, loadChecklistResult,
  loadPartRequests, loadEscalations, loadNotifications, loadEmailNotifications,
  loadEscalationGroups, loadEscalationGroupMembers,
  addPartRequest, updatePartRequest, addEscalation, updateEscalation,
  addEscalationGroup, updateEscalationGroup, deleteEscalationGroup,
  addEscalationGroupMember, removeEscalationGroupMember,
  addNotification, markNotificationRead, markAllNotificationsRead,
  addEmailNotification, updateEmailNotification,
  addPart,
  updateWorkOrder, updatePart, updatePMWorkOrder, saveEquipment,
  addWorkOrder, addServiceRequest, addVendor, addEquipment,
  addTechnician, addWorkflow, addWorkflowTransition,
  updateEquipment, updateVendor, updateUser, updateServiceRequest,
  deleteWorkOrder, deleteServiceRequest, deleteVendor, deleteEquipment, deleteTechnician, deleteRole,
  addUser, addRole as addRoleToDB, togglePermission, addWorkflowState, toggleWorkflowTransition,
  saveChecklistResult, addAuditLog,
  loadPMChecklistTemplates, addPMChecklistTemplate, updatePMChecklistTemplate, deletePMChecklistTemplate, addPMWorkOrder,
  loadPMPlans, addPMPlan, updatePMPlan, deletePMPlan,
  loadEquipmentDocuments, uploadEquipmentDocument, getDocumentDownloadUrl, deleteEquipmentDocument,
} from './db.js';
import {
  CHECKLISTS, tplTotal, progressOf, CORR_STEPS, corrStepFromStatus, addInterval,
} from './checklists.js';

/* ================= NAVIGATION ================= */
const NAV = [
  { grp: 'Operations', items: [
    { id: 'dashboard', label: 'Command Center', ic: 'dash' },
    { id: 'equipment', label: 'Equipment Register', ic: 'asset', badge: () => String(EQUIP.length), badgeClass: 'muted' },
    { id: 'workorders', label: 'Work Orders', ic: 'wo', badge: () => String(WORKORDERS.filter(w => w.status !== 'closed').length), badgeClass: '' },
    { id: 'requests', label: 'Service Requests', ic: 'alert', badge: () => String(SR_DATA.filter(r => r.status !== 'converted' && r.status !== 'closed').length), badgeClass: 'amber' },
  ]},
  { grp: 'Maintenance', items: [
    { id: 'pm', label: 'Preventive (PM)', ic: 'pm' },
    { id: 'calibration', label: 'Calibration', ic: 'cal' },
    { id: 'parts', label: 'Spare Parts', ic: 'parts', badge: () => String(PARTS.filter(p => p.qty <= p.min).length), badgeClass: 'amber' },
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
    { id: 'escalation-groups', label: 'Escalation Groups', ic: 'up' },
  ]},
];

/* ================= STATE ================= */
let CURRENT = 'dashboard';
let THEME = 'light';
let AUTH_USER = null;
let CMMS_USER = null;
let EQFILTER = 'all';
let WOFILTER = 'open';
let EQDEPTF = '';
let EQCATF = '';
let WOPRIF = '';
let WOTeamF = '';
let SELROLE = 'bioeng';
let SELWF = 'corrective';
let ORIGIN = 'dashboard';
let CHK_CTX = null;
let CURRENT_EQ_ID = null;

function setEqFilter(v) { EQFILTER = v; go('equipment'); }
function setWoFilter(v) { WOFILTER = v; go('workorders'); }
function setSelRole(v) { SELROLE = v; go('roles'); }
function setSelWf(v) { SELWF = v; go('workflows'); }

function nextSequentialId(prefix, rows, start, width) {
  const used = new Set(rows.map(row => row.id));
  let number = start;
  let id = prefix + '-' + String(number).padStart(width, '0');
  while (used.has(id)) {
    number += 1;
    id = prefix + '-' + String(number).padStart(width, '0');
  }
  return id;
}

window.setEqFilter = setEqFilter;
window.setWoFilter = setWoFilter;
window.setSelRole = setSelRole;
window.setSelWf = setSelWf;

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
let PM_TEMPLATES = [];
let PM_PLANS = [];
let PART_REQUESTS = [];
let ESCALATIONS = [];
let NOTIFICATIONS = [];
let EMAILS = [];
let ESC_GROUPS = [];
let ESC_MEMBERS = [];

// Checklist state per job (loaded from DB)
let CHK_STATE = {};

const VIEWS = {};
const AFTER = {};

/* ================= TOAST / THEME / DRAWER ================= */
let toastT;
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
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
    ${g.items.map(it => `<button class="nav-item" data-view="${it.id}" onclick="go('${it.id}')">${icon(it.ic)}<span>${it.label}</span>${it.badge ? `<span class="badge ${it.badgeClass || ''}">${typeof it.badge === 'function' ? it.badge() : it.badge}</span>` : ''}</button>`).join('')}
    </div>`).join('');
}

function buildMobileNav() {
  const main = NAV.flatMap(g => g.items).filter(it => ['dashboard', 'equipment', 'workorders', 'pm', 'reports'].includes(it.id));
  document.getElementById('mobileNav').innerHTML = main.map(it => `<button data-view="${it.id}" onclick="go('${it.id}')">${icon(it.ic)}<span>${it.label.split(' ')[0]}</span></button>`).join('');
}

async function go(v) {
  if (!VIEWS[v]) v = 'dashboard';
  CURRENT = v;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === v));
  document.querySelectorAll('.mobile-nav button').forEach(n => n.classList.toggle('active', n.dataset.view === v));
  const label = NAV.flatMap(g => g.items).find(i => i.id === v)?.label || '';
  document.getElementById('crumbs').innerHTML = `<span>${HOSP}</span>${icon('arrowr')}<b>${label}</b>`;
  const canvas = document.getElementById('canvas');
  canvas.innerHTML = `<section class="view active" id="view-${v}"></section>`;
  try {
    document.getElementById('view-' + v).innerHTML = await VIEWS[v]();
  } catch (err) {
    console.error('View error (' + v + '):', err);
    document.getElementById('view-' + v).innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;padding:40px"><div style="font-size:16px;font-weight:600;color:var(--crit)">Failed to load this page</div><div class="sub2" style="text-align:center;max-width:400px">${err.message || String(err)}</div><button class="btn btn-primary" onclick="go('${v}')">Retry</button></div>`;
  }
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
  PM_TEMPLATES = await loadPMChecklistTemplates();
  PM_PLANS = await loadPMPlans();
  PART_REQUESTS = await loadPartRequests();
  ESCALATIONS = await loadEscalations();
  ESC_GROUPS = await loadEscalationGroups();
  ESC_MEMBERS = await loadEscalationGroupMembers();
  NOTIFICATIONS = await loadNotifications();
  EMAILS = await loadEmailNotifications();
  await refreshNotifBadge();
  await checkPMReminders();
}

/* ================= EQUIPMENT DRAWER ================= */
function eqWarrantyStatus(e) {
  if (e.warranty_exp) {
    const exp = new Date(e.warranty_exp);
    const now = new Date(TODAY);
    if (exp < now) return { label: 'Warranty Expired', cls: 'p-muted', date: fmtDate(e.warranty_exp) };
    const days = Math.round((exp - now) / 864e5);
    if (days <= 60) return { label: 'Warranty Expiring', cls: 'p-warn', date: fmtDate(e.warranty_exp) };
    return { label: 'In Warranty', cls: 'p-ok', date: fmtDate(e.warranty_exp) };
  }
  return e.warranty === 'Active'
    ? { label: 'In Warranty', cls: 'p-ok', date: '—' }
    : { label: 'Warranty Expired', cls: 'p-muted', date: '—' };
}

function buildEqTimeline(e, wos, pms) {
  const items = [];
  pms.filter(p => p.eq_id === e.id && p.status === 'completed').forEach(p => {
    items.push({ t: 'Preventive maintenance completed', m: p.title + ' · ' + (p.freq || 'PM'), time: fmtDate(p.completed_on || p.due) + ' · ' + (p.team || 'Biomedical'), c: 'ok' });
  });
  wos.forEach(w => {
    const c = w.status === 'closed' ? 'ok' : 'primary';
    items.push({ t: w.type + ' — ' + w.title, m: w.id + ' · ' + w.assignee, time: (w.opened || '—') + ' · ' + w.assignee, c });
  });
  if (e.cal_due) {
    items.push({ t: 'Calibration due', m: 'Next calibration ' + fmtDate(e.cal_due), time: fmtDate(e.cal_due), c: 'cal' });
  }
  items.push({ t: 'Asset registered', m: e.tag + ' · ' + e.name, time: fmtDate(e.created_at) || '—', c: 'info' });
  return items.slice(0, 20);
}

function openEquipment(id) {
  const e = EQMAP[id];
  if (!e) return;
  CURRENT_EQ_ID = id;
  const wos = WORKORDERS.filter(w => w.eq_id === id);
  const pms = PMWO.filter(p => p.eq_id === id);
  const timeline = buildEqTimeline(e, wos, pms);
  const warr = eqWarrantyStatus(e);

  openDrawerHTML(`
    <div class="drawer-head">
      <div class="drawer-title">
        <div class="big-ic">${icon(e.ic)}</div>
        <div><h2>${e.name}</h2><div class="did">${e.tag} · ${e.id} · SN ${e.serial || '—'}</div></div>
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
          <span class="pill ${warr.cls}">${warr.label}</span>
          <span class="pill p-info">SLA ${e.sla}</span>
          ${wos.filter(w => w.status !== 'closed').length ? `<span class="pill p-warn">${wos.filter(w => w.status !== 'closed').length} open WO</span>` : ''}
        </div>
        <div class="dsec"><h4>Identification & Location</h4><div class="kv-grid">
          <div class="kv-item"><div class="k">Manufacturer</div><div class="v">${e.mfr || '—'}</div></div>
          <div class="kv-item"><div class="k">Model</div><div class="v">${e.model || '—'}</div></div>
          <div class="kv-item"><div class="k">Category</div><div class="v">${e.cat || '—'}</div></div>
          <div class="kv-item"><div class="k">Department</div><div class="v">${e.dept || '—'}</div></div>
          <div class="kv-item"><div class="k">Location</div><div class="v">${e.loc || '—'}</div></div>
          <div class="kv-item"><div class="k">Serial No.</div><div class="v mono">${e.serial || '—'}</div></div>
        </div></div>
        <div class="dsec"><h4>Lifecycle & Finance</h4><div class="kv-grid">
          <div class="kv-item"><div class="k">Age in Service</div><div class="v">${e.age || 0} years</div></div>
          <div class="kv-item"><div class="k">Acquisition Cost</div><div class="v">${Number(e.cost || 0).toLocaleString()}</div></div>
          <div class="kv-item"><div class="k">Warranty Expiry</div><div class="v mono">${warr.date}</div></div>
          <div class="kv-item"><div class="k">Expected Lifetime</div><div class="v">${(e.age || 0) + (e.cost > 500000 ? 6 : 4)} yrs <span class="sub2" style="font-size:11px">(est. from cost tier)</span></div></div>
        </div></div>
        <div class="dsec" style="display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="openEditEquipment('${e.id}')">${icon('edit')}Edit Asset</button>
          <button class="btn btn-ghost" onclick="closeDrawer();openNewWorkOrder()">${icon('wrench')}Raise Work Order</button>
          <button class="btn btn-ghost" style="color:var(--crit)" onclick="confirmDeleteEquipment('${e.id}')">${icon('trash')}Delete</button>
        </div>
      </div>
      <div id="d-hist" style="display:none">
        <div class="dsec"><h4>Work Orders (${wos.length})</h4>
          ${wos.length ? wos.map(w => `<div class="doc-row" onclick="closeDrawer();openJob('${w.id}','wo')" style="cursor:pointer">
            <div class="doc-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('wo')}</div>
            <div style="flex:1"><div class="dn">${w.title}</div><div class="dm mono">${w.id} · ${w.type} · ${w.pri}</div></div>
            ${woStatus(w.status)}</div>`).join('') : '<div class="empty">No work orders yet</div>'}
        </div>
        <div class="dsec"><h4>PM History (${pms.length})</h4>
          ${pms.length ? pms.map(p => `<div class="doc-row" onclick="closeDrawer();openJob('${p.id}','pm')" style="cursor:pointer">
            <div class="doc-ic" style="background:var(--cal-soft,var(--surface-3));color:var(--cal,var(--primary))">${icon('pm')}</div>
            <div style="flex:1"><div class="dn">${p.title}</div><div class="dm mono">${p.id} · ${p.freq} · due ${fmtDate(p.due)}</div></div>
            ${p.status === 'completed' ? '<span class="pill p-ok">Completed</span>' : '<span class="pill p-info">Scheduled</span>'}</div>`).join('') : '<div class="empty">No PM history yet</div>'}
        </div>
        <div class="dsec"><h4>Equipment Timeline</h4><div class="timeline">
          ${timeline.length ? timeline.map(t => `<div class="tl-item"><div class="tl-dot"><div class="d" style="box-shadow:0 0 0 2px var(--${t.c})"></div><div class="ln"></div></div>
            <div class="tl-c"><div class="tl-t">${t.t}</div><div class="tl-m">${t.m}</div><div class="tl-time">${t.time}</div></div></div>`).join('') : '<div class="empty">No activity yet</div>'}
        </div></div>
      </div>
      <div id="d-docs" style="display:none">
        <div class="dsec"><h4>Documents & Certificates</h4>
          <div id="eq-docs-list"><div class="empty">Loading documents…</div></div>
          <div style="margin-top:16px;border:2px dashed var(--border);border-radius:12px;padding:24px;text-align:center">
            <div style="margin-bottom:10px">${icon('file')}</div>
            <div style="font-weight:600;margin-bottom:4px">Upload a document</div>
            <div class="sub2" style="margin-bottom:14px">Warranty agreements, service manuals, calibration certificates, photos — any file type.</div>
            <label class="btn btn-primary" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
              ${icon('dash')}Choose File
              <input type="file" style="display:none" onchange="uploadEqDoc('${e.id}',this.files[0])">
            </label>
          </div>
        </div>
      </div>
      <div id="d-risk" style="display:none">
        <div class="dsec"><h4>Risk Score</h4>
          <div class="hstat"><div class="big-num" style="color:${critColor(e.crit)}">${e.risk || 50}</div>
          <div><div style="font-weight:600">${(e.risk || 50) >= 85 ? 'Critical' : (e.risk || 50) >= 65 ? 'High' : 'Moderate'} composite risk</div>
          <div class="sub2">Auto-calculated from the criticality level you selected (${CRIT[e.crit].l}). Life Support = 90, High Risk = 75, Medium/Low = 50.</div></div></div>
          <div style="margin-top:14px">${meter(e.risk || 50, critColor(e.crit))}</div>
        </div>
        <div class="dsec"><h4>Maintenance Strategy</h4>
        <div class="sub2" style="margin-bottom:12px">PM frequency and compliance are system defaults for new assets. They update automatically as maintenance work is completed.</div>
        <div class="kv-grid">
          <div class="kv-item"><div class="k">PM Frequency</div><div class="v">${e.crit === 'life' ? 'Quarterly' : 'Semi-annual'} <span class="sub2" style="font-size:11px">(auto from criticality)</span></div></div>
          <div class="kv-item"><div class="k">PM Compliance</div><div class="v">${e.pm || 100}% <span class="sub2" style="font-size:11px">(default)</span></div></div>
          <div class="kv-item"><div class="k">Next PM Due</div><div class="v mono">${fmtDate(e.next_pm)}</div></div>
          <div class="kv-item"><div class="k">Calibration Due</div><div class="v mono">${e.cal_due ? fmtDate(e.cal_due) : 'N/A'}</div></div>
        </div></div>
        <div class="dsec"><button class="btn btn-primary" style="width:100%;justify-content:center" onclick="closeDrawer();openNewWorkOrder()">${icon('wrench')}Raise Work Order</button></div>
      </div>
    </div>`);
}
window.openEquipment = openEquipment;

async function loadEqDocsIntoDrawer(eqId) {
  const el = document.getElementById('eq-docs-list');
  if (!el) return;
  el.innerHTML = '<div class="empty">Loading…</div>';
  const docs = await loadEquipmentDocuments(eqId);
  if (!docs.length) { el.innerHTML = '<div class="empty">No documents uploaded yet.</div>'; return; }
  el.innerHTML = docs.map(d => {
    const sizeStr = d.size > 1048576 ? (d.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(d.size / 1024)) + ' KB';
    const ic = (d.mime_type || '').includes('image') ? 'img' : (d.name || '').toLowerCase().endsWith('.pdf') ? 'pdf' : 'file';
    return `<div class="doc-row">
      <div class="doc-ic ${ic}">${icon('file')}</div>
      <div style="flex:1"><div class="dn">${d.name}</div><div class="dm">${sizeStr} · ${fmtDate(d.uploaded_at)}</div></div>
      <button class="icon-btn" onclick="downloadEqDoc('${d.id}','${d.storage_path}')" title="Download">${icon('download')}</button>
      <button class="icon-btn" style="color:var(--crit)" onclick="removeEqDoc('${d.id}','${eqId}')" title="Delete">${icon('trash')}</button>
    </div>`;
  }).join('');
}
window.loadEqDocsIntoDrawer = loadEqDocsIntoDrawer;

async function uploadEqDoc(eqId, file) {
  if (!file) return;
  toast('Uploading ' + file.name + '…');
  const doc = await uploadEquipmentDocument(eqId, file, 'Admin');
  if (!doc) { toast('Upload failed — ' + LAST_DB_ERROR); return; }
  toast(file.name + ' uploaded');
  addAuditLog('Admin', 'Uploaded document ' + file.name + ' to ' + eqId, 'info');
  loadEqDocsIntoDrawer(eqId);
}
window.uploadEqDoc = uploadEqDoc;

async function downloadEqDoc(docId, storagePath) {
  const url = await getDocumentDownloadUrl(storagePath);
  if (!url) { toast('Download failed — ' + LAST_DB_ERROR); return; }
  window.open(url, '_blank');
}
window.downloadEqDoc = downloadEqDoc;

async function removeEqDoc(docId, eqId) {
  const ok = await deleteEquipmentDocument(docId);
  if (!ok) { toast('Delete failed — ' + LAST_DB_ERROR); return; }
  toast('Document deleted');
  addAuditLog('Admin', 'Deleted document from ' + eqId, 'warn');
  loadEqDocsIntoDrawer(eqId);
}
window.removeEqDoc = removeEqDoc;

function dTab(btn, id) {
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  ['d-over', 'd-hist', 'd-docs', 'd-risk'].forEach(x => {
    const el = document.getElementById(x);
    if (el) el.style.display = x === id ? 'block' : 'none';
  });
  if (id === 'd-docs' && CURRENT_EQ_ID) loadEqDocsIntoDrawer(CURRENT_EQ_ID);
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
      <div class="dsec"><h4>Repair Workflow${w.workflow_id ? ` <span class="pill p-info" style="font-size:10px;margin-left:6px">${(WORKFLOWS.find(x => x.id === w.workflow_id) || {}).name || 'Custom'}</span>` : ''}</h4>
        ${w.workflow_id && (() => {
          const wf = WORKFLOWS.find(x => x.id === w.workflow_id);
          if (!wf || !wf.states || !wf.states.length) return '<div class="sub2">Workflow states not found.</div>';
          const wfTrans = WFTRANS.filter(t => t.workflow_id === wf.id);
          const curIdx = wf.states.indexOf(w.status) || 0;
          return `<div class="flow">${wf.states.map((s, i) => {
            const cls = i < curIdx ? 'done' : i === curIdx ? 'current' : 'todo';
            const trans = wfTrans.find(t => t.from_state === s);
            return `<div class="flow-step ${cls}"><div class="flow-node"><div class="fn">${i < curIdx ? icon('check') : i + 1}</div><div class="fl"></div></div>
            <div class="flow-c"><div class="fs-t">${s}</div><div class="fs-m">${i < curIdx ? 'Completed' : i === curIdx ? 'In progress now' : 'Pending'}</div>${trans ? `<div class="sub2" style="font-size:10px;margin-top:2px">${trans.action} → ${trans.to_state}</div>` : ''}</div></div>`;
          }).join('')}
          </div>`;
        })() || `<div class="flow">${flowSteps.map((s, i) => {
          const cls = i < cur ? 'done' : i === cur ? 'current' : 'todo';
          return `<div class="flow-step ${cls}"><div class="flow-node"><div class="fn">${i < cur ? icon('check') : i + 1}</div><div class="fl"></div></div>
          <div class="flow-c"><div class="fs-t">${s}</div><div class="fs-m">${i < cur ? 'Completed' : i === cur ? 'In progress now' : 'Pending'}</div></div></div>`;
        }).join('')}
        </div>`}
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
          <button class="btn btn-ghost" onclick="openAssignWO('${w.id}')">${icon('user')}Assign Technician</button>
          <button class="btn btn-ghost" onclick="openAssignWorkflow('${w.id}')">${icon('settings')}Assign Workflow</button>
          <button class="btn btn-ghost" onclick="requestPartToWO('${w.id}')">${icon('parts')}Request Part</button>
          <button class="btn btn-ghost" onclick="escalateWO('${w.id}')">${icon('up')}Escalate</button>
        </div>
      </div>
    </div>`);
}
window.openWO = openWO;

let ASSIGN_WF_WO_ID = null;
function openAssignWorkflow(id) {
  const w = WOMAP[id];
  if (!w) return;
  ASSIGN_WF_WO_ID = id;
  const wfOpts = ['<option value="">No workflow (default corrective flow)</option>', ...WORKFLOWS.map(wf => `<option value="${wf.id}" ${wf.id === w.workflow_id ? 'selected' : ''}>${wf.name}</option>`)].join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('settings')}</div><div><h2>Assign Workflow</h2><div class="did">${w.id} · ${w.title}</div></div></div><button class="icon-btn close" onclick="openWO('${id}')">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Select Workflow</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Workflow</span><select id="awf_wf">${wfOpts}</select></label>
      ${WORKFLOWS.length === 0 ? '<div class="sub2" style="color:var(--warn)">No workflows created yet. Go to Workflow Designer to create one first.</div>' : ''}
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitAssignWorkflow()">${icon('check')}Assign</button><button class="btn btn-ghost" onclick="openWO('${id}')">Cancel</button></div>
  </div></div>`);
}
window.openAssignWorkflow = openAssignWorkflow;

async function submitAssignWorkflow() {
  const id = ASSIGN_WF_WO_ID;
  if (!id) return;
  const w = WOMAP[id];
  if (!w) return;
  const wfId = document.getElementById('awf_wf').value || null;
  const ok = await updateWorkOrder(id, { workflow_id: wfId });
  if (!ok) { toast('Failed to assign workflow — ' + LAST_DB_ERROR); return; }
  w.workflow_id = wfId;
  toast(wfId ? 'Workflow "' + (WORKFLOWS.find(x => x.id === wfId) || {}).name + '" assigned to ' + id : 'Default workflow restored for ' + id);
  addAuditLog('Admin', 'Assigned workflow ' + (wfId || 'default') + ' to ' + id, 'info');
  openWO(id);
}
window.submitAssignWorkflow = submitAssignWorkflow;

let ASSIGN_WO_ID = null;
function openAssignWO(id) {
  const w = WOMAP[id];
  if (!w) return;
  ASSIGN_WO_ID = id;
  const techOpts = ['Unassigned', ...TECHS.map(t => t.name)].map(n => `<option ${n === w.assignee ? 'selected' : ''}>${n}</option>`).join('');
  const teamOpts = ['Biomedical', 'Imaging', 'Facilities', 'Vendor'].map(t => `<option ${t === w.team ? 'selected' : ''}>${t}</option>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('user')}</div><div><h2>Assign Work Order</h2><div class="did">${w.id} · ${w.title}</div></div></div><button class="icon-btn close" onclick="openWO('${id}')">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Assignment</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Technician</span><select id="as_tech">${techOpts}</select></label>
      <label class="fld"><span>Team</span><select id="as_team">${teamOpts}</select></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitAssignWO()">${icon('check')}Assign</button><button class="btn btn-ghost" onclick="openWO('${id}')">Cancel</button></div>
  </div></div>`);
}
window.openAssignWO = openAssignWO;

async function submitAssignWO() {
  const id = ASSIGN_WO_ID;
  if (!id) return;
  const w = WOMAP[id];
  if (!w) return;
  const tech = document.getElementById('as_tech').value;
  const team = document.getElementById('as_team').value;
  const updates = { assignee: tech, team, status: tech !== 'Unassigned' && w.status === 'triaged' ? 'assigned' : w.status };
  const ok = await updateWorkOrder(id, updates);
  if (!ok) { toast('Failed to assign — ' + LAST_DB_ERROR); return; }
  Object.assign(w, updates);
  toast('Work order ' + id + ' assigned to ' + tech);
  addAuditLog('Dr. Rana Aoun', 'Assigned ' + id + ' to ' + tech, 'info');
  await fireNotification(id, 'Work Order Assigned', `${id} has been assigned to ${tech} (${team})`, 'info', tech);
  await fireEmail(id, tech.toLowerCase().replace(/ /g, '.') + '@cedarridge.org', tech, `Assignment — ${id}`, `You have been assigned to work order ${id}.\n\nTitle: ${w.title}\nTeam: ${team}\nPriority: ${w.pri}\nDue: ${w.due}`);
  openWO(id);
}
window.submitAssignWO = submitAssignWO;

/* ============================================================
   VIEW: COMMAND CENTER (DASHBOARD)
   ============================================================ */
VIEWS.dashboard = async function () {
  const openWO = WORKORDERS.filter(w => w.status !== 'closed');
  const highPri = openWO.filter(w => w.pri === 'P1' || w.pri === 'P2');
  const slaAtRisk = openWO.filter(w => w.sla === 'At risk');
  const slaMet = WORKORDERS.filter(w => w.status === 'closed' && w.sla === 'Met').length;
  const slaTotal = WORKORDERS.filter(w => w.status === 'closed').length;
  const slaPct = slaTotal ? Math.round(slaMet / slaTotal * 1000) / 10 : 100;
  const pmCompliance = EQUIP.length ? Math.round(EQUIP.reduce((s, e) => s + (e.pm || 0), 0) / EQUIP.length) : 0;
  const inUseCount = EQUIP.filter(e => e.status === 'inuse' || e.status === 'available').length;
  const uptimePct = EQUIP.length ? Math.round(inUseCount / EQUIP.length * 1000) / 10 : 100;
  const kpis = [
    { t: 'Equipment Uptime', v: String(uptimePct), u: '%', ic: 'gauge', accent: 'var(--ok)', soft: 'var(--ok-soft)', trend: uptimePct >= 96 ? 'up' : 'down', delta: uptimePct >= 96 ? '+good' : '−check', lbl: `${inUseCount} of ${EQUIP.length} in service` },
    { t: 'PM Compliance', v: String(pmCompliance), u: '%', ic: 'pm', accent: 'var(--primary)', soft: 'var(--primary-soft)', trend: pmCompliance >= 90 ? 'up' : 'down', delta: pmCompliance >= 90 ? '+on target' : '−below target', lbl: 'target 90%' },
    { t: 'Open Work Orders', v: String(openWO.length), u: '', ic: 'wo', accent: 'var(--warn)', soft: 'var(--warn-soft)', trend: 'flat', delta: '', lbl: `${highPri.length} high priority` },
    { t: 'SLA Compliance', v: String(slaPct), u: '%', ic: 'clock', accent: 'var(--info)', soft: 'var(--info-soft)', trend: slaAtRisk.length === 0 ? 'up' : 'down', delta: slaAtRisk.length === 0 ? '0 at risk' : `${slaAtRisk.length} at risk`, lbl: `${slaMet} of ${slaTotal} closed met` },
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

  const alerts = [];
  const overduePMs = PMWO.filter(p => p.status === 'overdue' || (new Date(p.due) < new Date(TODAY) && p.status !== 'completed'));
  overduePMs.slice(0, 3).forEach(p => {
    const e = EQMAP[p.eq_id];
    alerts.push({ ic: 'pm', c: 'crit', t: 'Overdue PM', m: `${p.title}${e ? ' — ' + e.tag + ' (' + e.dept + ')' : ''} preventive maintenance is overdue.`, meta: [e ? e.dept : '—', p.id], act: () => openJob(p.id, 'pm') });
  });
  const outOfSvc = EQUIP.filter(e => e.status === 'outofsvc' || e.status === 'quarantine');
  outOfSvc.slice(0, 2).forEach(e => {
    alerts.push({ ic: 'bolt', c: 'crit', t: 'Equipment Out of Service', m: `${e.name} (${e.tag}) is currently out of service.`, meta: [e.dept, e.loc], act: () => openEquipment(e.id) });
  });
  const lowParts = PARTS.filter(p => p.qty <= p.min);
  lowParts.slice(0, 2).forEach(p => {
    alerts.push({ ic: 'parts', c: 'warn', t: 'Critical Spare — Low Stock', m: `${p.name} is at ${p.qty} in stock (minimum ${p.min}).`, meta: ['Reorder needed'], act: () => go('parts') });
  });
  const calDue = EQUIP.filter(e => e.cal_due && certStatus(e.cal_due).l !== 'Valid').sort((a, b) => new Date(a.cal_due) - new Date(b.cal_due));
  calDue.slice(0, 2).forEach(e => {
    const cs = certStatus(e.cal_due);
    alerts.push({ ic: 'cal', c: cs.l === 'Expired' ? 'crit' : 'cal', t: `Calibration ${cs.l}`, m: `${e.name} (${e.tag}) calibration ${cs.l === 'Expired' ? 'expired' : 'expires'} ${fmtDate(e.cal_due)}.`, meta: [e.dept], act: () => openEquipment(e.id) });
  });
  slaAtRisk.slice(0, 3).forEach(w => {
    const e = EQMAP[w.eq_id];
    alerts.push({ ic: 'clock', c: 'warn', t: 'SLA At Risk', m: `${w.id} (${w.title}) at ${w.sla_pct}% of ${w.pri} resolution window.`, meta: [e ? e.dept : '—', `${100 - w.sla_pct}% remaining`], act: () => openJob(w.id, 'wo') });
  });
  if (alerts.length === 0) {
    alerts.push({ ic: 'check', c: 'ok', t: 'All Clear', m: 'No priority alerts at this time. All systems operating normally.', meta: [TODAY], act: () => {} });
  }
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
  const availTrend = (() => {
    const weeks = [];
    for (let i = 6; i >= 0; i--) {
      const end = new Date(TODAY); end.setDate(end.getDate() - i * 7);
      const label = 'W' + (7 - i);
      const before = end.getTime();
      const closed = WORKORDERS.filter(w => w.status === 'closed' && w.opened && new Date(w.opened).getTime() <= before).length;
      const total = WORKORDERS.filter(w => w.opened && new Date(w.opened).getTime() <= before).length;
      const v = total ? Math.round((1 - closed / total) * 1000) / 10 : 100;
      weeks.push({ l: label, v });
    }
    return weeks;
  })();
  const woVol = (() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(TODAY); d.setMonth(d.getMonth() - i);
      const label = d.toLocaleDateString('en-GB', { month: 'short' });
      const monthWOs = WORKORDERS.filter(w => {
        if (!w.opened) return false;
        const wd = new Date(w.opened);
        return wd.getMonth() === d.getMonth() && wd.getFullYear() === d.getFullYear();
      });
      const pmCount = monthWOs.filter(w => w.type === 'Preventive').length;
      const corrCount = monthWOs.filter(w => w.type !== 'Preventive').length;
      months.push({ l: label, a: pmCount, b: corrCount });
    }
    return months;
  })();

  const deptMap = {};
  openWO.forEach(w => {
    const e = EQMAP[w.eq_id];
    const dept = e ? e.dept : 'Unassigned';
    deptMap[dept] = (deptMap[dept] || 0) + 1;
  });
  const deptEntries = Object.entries(deptMap).sort((a, b) => b[1] - a[1]);
  const maxDept = Math.max(1, ...deptEntries.map(d => d[1]));
  const deptColors = ['var(--crit)', 'var(--warn)', 'var(--primary)', 'var(--info)', 'var(--text-3)', 'var(--ok)'];
  const deptLoad = deptEntries.slice(0, 6).map((d, i) => ({ nm: d[0], v: d[1], max: maxDept, c: deptColors[i % deptColors.length] }));
  const techLoad = TECHS.map(t => ({ n: t.name, r: t.trade + ' Team', open: WORKORDERS.filter(w => w.assignee === t.name && w.status !== 'closed').length, cap: t.cap }));

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
    pmdue: EQUIP.filter(e => e.next_pm && new Date(e.next_pm) <= new Date(TODAY)).length,
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
      ${[['all', 'All Assets', counts.all], ['life', 'Life Support', counts.life], ['maint', 'Needs Attention', counts.maint], ['pmdue', 'PM Due Soon', counts.pmdue]].map(c => `<button class="chip ${c[0] === EQFILTER ? 'on' : ''}" onclick="setEqFilter('${c[0]}')">${c[1]}<span class="ct">${c[2]}</span></button>`).join('')}
    </div>
    <div class="spacer"></div>
    <select class="sel" id="eqDeptFilter" onchange="EQDEPTF=this.value;go('equipment')"><option value="">All Departments</option>${[...new Set(EQUIP.map(e => e.dept).filter(Boolean))].sort().map(d => `<option value="${d}" ${EQDEPTF === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
    <select class="sel" id="eqCatFilter" onchange="EQCATF=this.value;go('equipment')"><option value="">All Categories</option>${[...new Set(EQUIP.map(e => e.cat).filter(Boolean))].sort().map(c => `<option value="${c}" ${EQCATF === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
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
  else if (EQFILTER === 'pmdue') list = list.filter(e => e.next_pm && new Date(e.next_pm) <= new Date(TODAY));
  if (EQDEPTF) list = list.filter(e => e.dept === EQDEPTF);
  if (EQCATF) list = list.filter(e => e.cat === EQCATF);
  return list.map(e => `<tr onclick="openEquipment('${e.id}')">
    <td><div class="cellflex"><span class="crit-stripe" style="background:${critColor(e.crit)}"></span>
      <div class="eq-ic">${icon(e.ic)}</div>
      <div><div class="strong">${e.name}</div><div class="sub2 mono">${e.tag} · ${e.id}</div></div></div></td>
    <td>${e.loc}<div class="sub2">${e.dept}</div></td>
    <td><span class="pill p-${CRIT[e.crit].c}">${CRIT[e.crit].l}</span></td>
    <td>${eqStatus(e.status)}</td>
    <td style="min-width:130px">${meter(e.pm)}</td>
    <td class="mono" style="font-size:12px">${fmtDate(e.next_pm)}${overdue(e.next_pm)}</td>
    <td>${(() => { const w = eqWarrantyStatus(e); return `<span class="pill ${w.cls}">${w.label}</span>`; })()}</td>
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
    <div class="seg">${[['open', 'Open'], ['all', 'All'], ['mine', 'Assigned to me'], ['closed', 'Closed']].map(s => `<button class="${s[0] === WOFILTER ? 'on' : ''}" onclick="setWoFilter('${s[0]}')">${s[1]}</button>`).join('')}</div>
    <div class="spacer"></div>
    <select class="sel" id="woPriFilter" onchange="WOPRIF=this.value;go('workorders')"><option value="">All Priorities</option>${['P1','P2','P3','P4','P5'].map(p => `<option value="${p}" ${WOPRIF === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
    <select class="sel" id="woTeamFilter" onchange="WOTeamF=this.value;go('workorders')"><option value="">All Teams</option>${[...new Set(WORKORDERS.map(w => w.team).filter(Boolean))].sort().map(t => `<option value="${t}" ${WOTeamF === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
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
  else if (WOFILTER === 'mine') list = list.filter(w => w.assignee === (TECHS[0]?.name || ''));
  if (WOPRIF) list = list.filter(w => w.pri === WOPRIF);
  if (WOTeamF) list = list.filter(w => w.team === WOTeamF);
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
  const complianceByDept = (() => {
    const depts = [...new Set(EQUIP.map(e => e.dept).filter(Boolean))].sort();
    return depts.map(d => {
      const items = EQUIP.filter(e => e.dept === d);
      const avg = items.length ? Math.round(items.reduce((s, e) => s + (e.pm || 0), 0) / items.length) : 0;
      return { nm: d, v: avg };
    }).sort((a, b) => b.v - a.v);
  })();

  // Build calendar from real PM work orders
  const calDate = new Date(TODAY);
  const calYear = calDate.getFullYear();
  const calMonth = calDate.getMonth();
  const monthName = calDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1);
  const startDow = (firstDay.getDay() + 6) % 7;
  const todayDate = calDate.getDate();

  // Map PM work orders to calendar days
  const evByDay = {};
  for (const pm of PMWO) {
    const due = new Date(pm.due);
    if (due.getFullYear() === calYear && due.getMonth() === calMonth) {
      const day = due.getDate();
      if (!evByDay[day]) evByDay[day] = [];
      const e = EQMAP[pm.eq_id];
      const evLabel = e ? e.tag + ' — ' + pm.freq : pm.title;
      const evClass = pm.status === 'overdue' || (due < new Date(TODAY) && pm.status !== 'completed') ? 'crit' : pm.status === 'completed' ? 'ok' : 'warn';
      evByDay[day].push({ cls: evClass, label: evLabel, id: pm.id });
    }
  }
  // Also add PM plan next_due dates as scheduled events
  for (const plan of PM_PLANS) {
    if (!plan.active) continue;
    const nd = new Date(plan.next_due);
    if (nd.getFullYear() === calYear && nd.getMonth() === calMonth) {
      const day = nd.getDate();
      if (!evByDay[day]) evByDay[day] = [];
      const e = EQMAP[plan.eq_id];
      const evLabel = (e ? e.tag : plan.name) + ' — ' + plan.freq;
      evByDay[day].push({ cls: 'cal', label: evLabel, planId: plan.id });
    }
  }

  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell out"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const evs = evByDay[d] || [];
    const isToday = d === todayDate;
    cells += `<div class="cal-cell${isToday ? ' today' : ''}"><div class="dnum">${d}</div>${evs.map(e => `<div class="cal-ev ${e.cls}" onclick="${e.id ? `openJob('${e.id}','pm')` : `generateFromPlan('${e.planId}')`}">${e.label}</div>`).join('')}</div>`;
  }

  const dueThisWeek = PMWO.filter(p => {
    const due = new Date(p.due);
    const weekEnd = new Date(TODAY); weekEnd.setDate(weekEnd.getDate() + 7);
    return due >= new Date(TODAY) && due <= weekEnd && p.status !== 'completed';
  }).length;
  const overdueCount = PMWO.filter(p => p.status === 'overdue' || (new Date(p.due) < new Date(TODAY) && p.status !== 'completed')).length;
  const pmAvg = EQUIP.length ? Math.round(EQUIP.reduce((s, e) => s + (e.pm || 0), 0) / EQUIP.length) : 0;
  const highRiskCompliance = EQUIP.filter(e => e.crit === 'life' || e.crit === 'high').length
    ? Math.round(EQUIP.filter(e => e.crit === 'life' || e.crit === 'high').reduce((s, e) => s + (e.pm || 0), 0) / EQUIP.filter(e => e.crit === 'life' || e.crit === 'high').length)
    : 0;
  const activePlanRows = PM_PLANS.filter(p => p.active).map(plan => {
    const e = EQMAP[plan.eq_id];
    const generated = PMWO.find(pm => pm.eq_id === plan.eq_id && pm.freq === plan.freq);
    return `<div class="pm-plan-row"><div class="pm-plan-icon">${icon('pm')}</div><div class="pm-plan-main"><div class="strong">${plan.name}</div><div class="sub2">${e ? e.tag + ' · ' + e.name : 'Equipment unavailable'} · ${plan.freq}</div></div><div class="pm-plan-date"><span class="sub2">Next planned date</span><b>${fmtDate(plan.next_due)}</b></div><div>${generated ? '<span class="pill p-ok">Work order created</span>' : '<span class="pill p-cal">Planned</span>'}</div></div>`;
  }).join('');

  return `
  <div class="page-head"><div><h1>Preventive Maintenance</h1><div class="sub">Scheduled servicing, safety testing & compliance — ${monthName}</div></div>
    <div class="head-actions"><button class="btn btn-ghost" onclick="openPMPlans()">${icon('pm')}PM Plans</button>
    <button class="btn btn-primary" onclick="generatePMSchedule()">${icon('refresh')}Generate Schedule</button></div></div>
  <div class="kpi-row">
    ${[['Overall PM Compliance', String(pmAvg), '%', 'var(--primary)', 'var(--primary-soft)', 'pm'], ['High-Risk Compliance', String(highRiskCompliance), '%', 'var(--ok)', 'var(--ok-soft)', 'shield'], ['Due This Week', String(dueThisWeek), '', 'var(--warn)', 'var(--warn-soft)', 'clock'], ['Overdue', String(overdueCount), '', 'var(--crit)', 'var(--crit-soft)', 'alert']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}
  </div>
  <div class="card">
    <div class="card-head"><h3>PM Calendar</h3><span class="hint">${monthName}</span></div>
    <div class="card-pad">
      <div class="cal-grid cal-dow-row">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="cal-dow">${d}</div>`).join('')}</div>
      <div class="cal-grid cal-cells">${cells}</div>
      <div class="legend" style="margin-top:14px"><span><i style="background:var(--ok)"></i>Completed</span><span><i style="background:var(--warn)"></i>Scheduled</span><span><i style="background:var(--crit)"></i>Overdue</span><span><i style="background:var(--cal)"></i>Planned (from PM Plan)</span></div>
    </div>
  </div>
  <div class="card pm-plans-card">
    <div class="card-head"><h3>Active PM Plans</h3><button class="link" onclick="openPMPlans()">Manage plans ${icon('arrowr')}</button></div>
    <div class="pm-plan-list">${activePlanRows || '<div class="empty">No active PM plans yet — create one from PM Plans</div>'}</div>
  </div>
  <div class="grid-dash" style="align-items:start;margin-top:16px">
  <div class="card">
    <div class="card-head"><h3>Upcoming PM Work Orders</h3><span class="link" onclick="go('workorders')">All work orders ${icon('arrowr')}</span></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>PM Work Order</th><th>Equipment</th><th>Frequency</th><th>Due</th><th>Status</th><th></th></tr></thead>
      <tbody>${PMWO.length ? PMWO.map(pm => {
    const e = EQMAP[pm.eq_id];
    if (!e) return '';
    const ov = new Date(pm.due) < new Date(TODAY) && pm.status !== 'completed';
    return `<tr onclick="openJob('${pm.id}','pm')">
        <td><div class="strong">${pm.title}</div><div class="sub2 mono">${pm.id}</div></td>
        <td><div class="cellflex"><span class="crit-stripe" style="background:${critColor(e.crit)}"></span><div class="eq-ic">${icon(e.ic)}</div><div><div style="font-weight:500">${e.tag}</div><div class="sub2">${e.dept}</div></div></div></td>
        <td>${pm.freq}</td>
        <td class="mono" style="font-size:12px">${fmtDate(pm.due)}${ov ? ' <span class="pill p-crit" style="margin-left:4px">Overdue</span>' : ''}</td>
        <td>${pm.status === 'completed' ? '<span class="pill p-ok">Completed</span>' : ov ? '<span class="pill p-crit">Overdue</span>' : '<span class="pill p-info">Scheduled</span>'}</td>
        <td><button class="btn btn-ghost" style="height:32px;font-size:12px" onclick="event.stopPropagation();openJob('${pm.id}','pm')">${pm.status === 'completed' ? 'View' : 'Open checklist'} ${icon('arrowr')}</button></td>
      </tr>`;
  }).join('') : '<tr><td colspan="6" class="sub2" style="text-align:center;padding:20px">No PM work orders yet — create a PM plan and generate the schedule</td></tr>'}</tbody>
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
  const due30 = rows.filter(e => { const d = (new Date(e.cal_due) - new Date(TODAY)) / 864e5; return d >= 0 && d <= 30; }).length;
  const overdueCal = rows.filter(e => new Date(e.cal_due) < new Date(TODAY)).length;
  const passRate = rows.length ? Math.round((rows.length - overdueCal) / rows.length * 100) : 100;
  const certificates = rows.filter(e => e.cal_cert || e.cal_due).length;
  return `
  <div class="page-head"><div><h1>Calibration Management</h1><div class="sub">Traceable calibration against IEC / manufacturer standards with certificate control</div></div>
    <button class="btn btn-primary" onclick="openRecordCalibration()">${icon('cal')}Record Calibration</button></div>
  <div class="kpi-row">
    ${[['Due in 30 days', String(due30), '', 'var(--warn)', 'var(--warn-soft)', 'clock'], ['Overdue', String(overdueCal), '', 'var(--crit)', 'var(--crit-soft)', 'alert'], ['Pass Rate (YTD)', String(passRate), '%', 'var(--ok)', 'var(--ok-soft)', 'check'], ['Certificates on File', String(certificates), '', 'var(--info)', 'var(--info-soft)', 'file']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}
  </div>
  <div class="card"><div class="card-head"><h3>Calibration Schedule</h3></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Equipment</th><th>Standard</th><th>Interval</th><th>Last Result</th><th>Due</th><th>Certificate</th></tr></thead>
    <tbody>${rows.map(e => {
    const std = e.cat === 'Imaging' ? 'IEC 61223' : e.cat === 'Defibrillator' ? 'IEC 60601-2-4' : e.cat === 'Infusion' ? 'IEC 60601-2-24' : 'IEC 62353';
    const ov = new Date(e.cal_due) < new Date(TODAY);
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
  const criticalParts = PARTS.filter(p => p.crit);
  const criticalOK = criticalParts.length ? Math.round(criticalParts.filter(p => p.qty >= p.min_qty).length / criticalParts.length * 100) : 100;
  return `
  <div class="page-head"><div><h1>Spare Parts & Inventory</h1><div class="sub">Stock control, reorder monitoring & critical-spare availability</div></div>
    <div class="head-actions"><button class="btn btn-ghost" onclick="openIssuePart()">${icon('arrowr')}Issue Part</button>
    <button class="btn btn-primary" onclick="openAddPart()">${icon('parts')}Add Part</button></div></div>
  <div class="kpi-row">
    ${[['Stock Value', '$' + (val / 1000).toFixed(1) + 'k', '', 'var(--primary)', 'var(--primary-soft)', 'cost'], ['Below Minimum', String(low), '', 'var(--warn)', 'var(--warn-soft)', 'down'], ['Stockouts', String(PARTS.filter(p => p.qty === 0).length), '', 'var(--crit)', 'var(--crit-soft)', 'alert'], ['Critical Spares OK', String(criticalOK), '%', 'var(--ok)', 'var(--ok-soft)', 'shield']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}
  </div>
  <div class="card"><div class="card-head"><h3>Parts Catalog</h3><span class="hint">${PARTS.length} SKUs · Central Store</span></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Part</th><th>Category</th><th>Bin</th><th>Stock Level</th><th class="num">On Hand</th><th class="num">Unit Cost</th><th>Status</th></tr></thead>
    <tbody>${PARTS.map(p => {
    const pct = Math.min(100, Math.round(p.qty / p.max_qty * 100));
    const minPct = p.min_qty / p.max_qty * 100;
    const c = p.qty === 0 ? 'var(--crit)' : p.qty < p.min_qty ? 'var(--warn)' : 'var(--ok)';
    return `<tr onclick="openPart('${p.id}')">
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
    const soon = (new Date(v.exp) - new Date(TODAY)) / 864e5 <= 60;
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
const ACCRED_ITEMS = [
  { id: 'inv', label: 'Equipment Inventory Complete', desc: 'All assets registered with full identification data', check: () => EQUIP.length > 0 && EQUIP.every(e => e.tag && e.name && e.dept) },
  { id: 'pm', label: 'PM Compliance ≥ 90%', desc: 'Preventive maintenance schedule up to date', check: () => { const avg = EQUIP.length ? Math.round(EQUIP.reduce((s, e) => s + (e.pm || 0), 0) / EQUIP.length) : 0; return avg >= 90; } },
  { id: 'cal', label: 'Calibration Certificates Valid', desc: 'No expired calibration on life-support or high-risk equipment', check: () => EQUIP.filter(e => ['life', 'high'].includes(e.crit)).every(e => !e.cal_due || new Date(e.cal_due) >= new Date(TODAY)) },
  { id: 'risk', label: 'Risk Assessment Current', desc: 'All high-risk assets have a documented risk score', check: () => EQUIP.filter(e => e.crit === 'life' || e.crit === 'high').every(e => e.risk != null) },
  { id: 'recalls', label: 'No Open Recalls', desc: 'All manufacturer recalls resolved or documented', check: () => true },
  { id: 'safety', label: 'Safety Inspections Current', desc: 'Electrical safety tests passed on all patient-contact equipment', check: () => EQUIP.filter(e => e.crit === 'life').every(e => e.status !== 'outofsvc') },
  { id: 'warranty', label: 'Warranty Records Maintained', desc: 'Warranty status tracked for all assets', check: () => EQUIP.every(e => e.warranty || e.warranty_exp) },
  { id: 'audit', label: 'Audit Trail Active', desc: 'All maintenance actions logged and traceable', check: () => AUDIT.length > 0 },
];

VIEWS.risk = async function () {
  const high = EQUIP.filter(e => e.risk >= 80).sort((a, b) => b.risk - a.risk);
  const lifeCount = EQUIP.filter(e => e.crit === 'life').length;
  const highCount = EQUIP.filter(e => e.crit === 'high').length;
  const calItems = EQUIP.filter(e => e.cal_due).map(e => {
    const cs = certStatus(e.cal_due);
    return { ...e, calStatus: cs };
  }).sort((a, b) => new Date(a.cal_due) - new Date(b.cal_due));
  const calExpired = calItems.filter(e => e.calStatus.l === 'Expired').length;
  const calExpiring = calItems.filter(e => e.calStatus.l === 'Expiring').length;
  const pmAvg = EQUIP.length ? Math.round(EQUIP.reduce((s, e) => s + (e.pm || 0), 0) / EQUIP.length) : 0;
  const accredPassed = ACCRED_ITEMS.filter(a => a.check()).length;
  const accredPct = Math.round(accredPassed / ACCRED_ITEMS.length * 100);
  const outOfSvc = EQUIP.filter(e => e.status === 'outofsvc' || e.status === 'quarantine').length;

  return `
  <div class="page-head"><div><h1>Risk & Compliance</h1><div class="sub">Equipment risk register, accreditation readiness & safety oversight</div></div>
  <button class="btn btn-primary" onclick="openAccredPack()">${icon('shield')}Accreditation Pack</button></div>
  <div class="kpi-row">
    ${[['Life-Support Assets', String(lifeCount), '', 'var(--crit)', 'var(--crit-soft)', 'risk'], ['High-Risk Assets', String(highCount), '', 'var(--warn)', 'var(--warn-soft)', 'alert'], ['Out of Service', String(outOfSvc), '', 'var(--crit)', 'var(--crit-soft)', 'bolt'], ['Accreditation Ready', String(accredPct), '%', accredPct >= 90 ? 'var(--ok)' : 'var(--warn)', accredPct >= 90 ? 'var(--ok-soft)' : 'var(--warn-soft)', 'shield']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}
  </div>
  <div class="grid-2" style="align-items:start;margin-bottom:16px">
    <div class="card"><div class="card-head"><h3>Accreditation Readiness Checklist</h3><span class="hint">${accredPassed}/${ACCRED_ITEMS.length} passed</span></div>
      <div style="padding:6px 8px">${ACCRED_ITEMS.map(a => {
        const ok = a.check();
        return `<div class="doc-row" style="padding:11px 12px;cursor:default">
          <div class="doc-ic" style="background:${ok ? 'var(--ok-soft)' : 'var(--warn-soft)'};color:${ok ? 'var(--ok)' : 'var(--warn)'}">${icon(ok ? 'check' : 'alert')}</div>
          <div style="flex:1"><div class="dn" style="font-weight:600">${a.label}</div><div class="dm">${a.desc}</div></div>
          <span class="pill ${ok ? 'p-ok' : 'p-warn'}">${ok ? 'Pass' : 'Action needed'}</span>
        </div>`;
      }).join('')}</div>
    </div>
    <div class="card"><div class="card-head"><h3>Calibration & Safety Compliance</h3><span class="hint">${calExpired} expired · ${calExpiring} expiring</span></div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Equipment</th><th>Criticality</th><th>Cal Due</th><th>Status</th></tr></thead>
        <tbody>${calItems.length ? calItems.map(e => `<tr onclick="openEquipment('${e.id}')">
          <td><div class="cellflex"><div class="eq-ic">${icon(e.ic)}</div><div><div class="strong">${e.name}</div><div class="sub2 mono">${e.tag}</div></div></div></td>
          <td><span class="pill p-${CRIT[e.crit].c}">${CRIT[e.crit].l}</span></td>
          <td class="mono" style="font-size:12px">${fmtDate(e.cal_due)}</td>
          <td><span class="pill ${e.calStatus.c}">${e.calStatus.l}</span></td>
        </tr>`).join('') : '<tr><td colspan="4" class="sub2" style="text-align:center;padding:20px">No calibration dates recorded</td></tr>'}</tbody>
      </table></div></div>
  </div>
  <div class="card"><div class="card-head"><h3>Highest-Risk Equipment</h3><span class="hint">composite risk ≥ 80 · ${high.length} assets</span></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Equipment</th><th>Criticality</th><th>Risk Score</th><th>PM Compliance</th><th>Next PM</th><th>Status</th></tr></thead>
    <tbody>${high.length ? high.map(e => `<tr onclick="openEquipment('${e.id}')">
      <td><div class="cellflex"><span class="crit-stripe" style="background:${critColor(e.crit)}"></span><div class="eq-ic">${icon(e.ic)}</div><div><div class="strong">${e.name}</div><div class="sub2 mono">${e.tag} · ${e.dept}</div></div></div></td>
      <td><span class="pill p-${CRIT[e.crit].c}">${CRIT[e.crit].l}</span></td>
      <td><div class="meter-lbl"><div class="meter" style="width:80px"><i style="width:${e.risk}%;background:${critColor(e.crit)}"></i></div><span class="pct" style="color:${critColor(e.crit)}">${e.risk}</span></div></td>
      <td style="min-width:120px">${meter(e.pm)}</td>
      <td class="mono" style="font-size:12px">${fmtDate(e.next_pm)}${overdue(e.next_pm)}</td>
      <td>${eqStatus(e.status)}</td>
    </tr>`).join('') : '<tr><td colspan="6" class="sub2" style="text-align:center;padding:20px">No assets at composite risk ≥ 80</td></tr>'}</tbody></table></div></div>`;
};

function openAccredPack() {
  const passed = ACCRED_ITEMS.filter(a => a.check());
  const failed = ACCRED_ITEMS.filter(a => !a.check());
  const pmAvg = EQUIP.length ? Math.round(EQUIP.reduce((s, e) => s + (e.pm || 0), 0) / EQUIP.length) : 0;
  const lifeCount = EQUIP.filter(e => e.crit === 'life').length;
  const highCount = EQUIP.filter(e => e.crit === 'high').length;
  const calExpired = EQUIP.filter(e => e.cal_due && new Date(e.cal_due) < new Date(TODAY)).length;
  const openWO = WORKORDERS.filter(w => w.status !== 'closed').length;
  const pct = Math.round(passed.length / ACCRED_ITEMS.length * 100);

  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('shield')}</div><div><h2>Accreditation Evidence Pack</h2><div class="did">${HOSP} · Generated ${TODAY}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body">
    <div class="dsec"><div class="hstat"><div class="big-num" style="color:${pct >= 90 ? 'var(--ok)' : 'var(--warn)'}">${pct}%</div><div><div style="font-weight:600">Overall Readiness Score</div><div class="sub2">${passed.length} of ${ACCRED_ITEMS.length} compliance checks passed</div></div></div>
      <div style="margin-top:14px">${meter(pct, pct >= 90 ? 'var(--ok)' : 'var(--warn)')}</div></div>
    <div class="dsec"><h4>Facility Summary</h4><div class="kv-grid">
      <div class="kv-item"><div class="k">Total Assets</div><div class="v">${EQUIP.length}</div></div>
      <div class="kv-item"><div class="k">Life-Support</div><div class="v">${lifeCount}</div></div>
      <div class="kv-item"><div class="k">High-Risk</div><div class="v">${highCount}</div></div>
      <div class="kv-item"><div class="k">Open Work Orders</div><div class="v">${openWO}</div></div>
      <div class="kv-item"><div class="k">PM Compliance (avg)</div><div class="v">${pmAvg}%</div></div>
      <div class="kv-item"><div class="k">Expired Calibrations</div><div class="v">${calExpired}</div></div>
    </div></div>
    <div class="dsec"><h4>Passed Checks (${passed.length})</h4>
      <div style="display:flex;flex-direction:column;gap:7px">${passed.map(a => `<div style="display:flex;align-items:center;gap:10px;font-size:13px"><span style="color:var(--ok)">${icon('check')}</span><span style="font-weight:500">${a.label}</span></div>`).join('')}</div></div>
    ${failed.length ? `<div class="dsec"><h4>Action Required (${failed.length})</h4>
      <div style="display:flex;flex-direction:column;gap:7px">${failed.map(a => `<div style="display:flex;align-items:center;gap:10px;font-size:13px"><span style="color:var(--warn)">${icon('alert')}</span><div><div style="font-weight:500">${a.label}</div><div class="sub2">${a.desc}</div></div></div>`).join('')}</div></div>` : ''}
    <div class="dsec"><div style="display:flex;gap:9px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="toast('Evidence pack exported as PDF')">${icon('download')}Export PDF</button>
      <button class="btn btn-ghost" onclick="toast('Evidence pack sent to accreditation body')">${icon('report')}Send to Accreditation Body</button>
      <button class="btn btn-ghost" onclick="closeDrawer()">Close</button>
    </div></div>
  </div>`);
  addAuditLog('Compliance', 'Generated accreditation evidence pack (' + pct + '% ready)', 'info');
}
window.openAccredPack = openAccredPack;

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
  const closed = WORKORDERS.filter(w => w.status === 'closed');
  const preventive = WORKORDERS.filter(w => w.type === 'Preventive');
  const corrective = WORKORDERS.filter(w => w.type !== 'Preventive');
  const plannedPct = WORKORDERS.length ? Math.round(preventive.length / WORKORDERS.length * 100) : 0;
  const mtbfDays = corrective.length ? Math.round(EQUIP.length / corrective.length * 30) : 0;
  const mttrHrs = closed.length ? (closed.reduce((sum, w) => {
    const opened = new Date(w.opened || TODAY).getTime();
    const due = new Date(w.due || TODAY).getTime();
    return sum + Math.max(1, Math.round((due - opened) / 36e5));
  }, 0) / closed.length).toFixed(1) : '0';
  const totalCost = EQUIP.reduce((sum, e) => sum + (Number(e.cost) || 0), 0);
  const costPerAsset = EQUIP.length ? '$' + Math.round(totalCost / EQUIP.length / 1000) + 'k' : '$0';
  const kpis = [
    ['MTBF', String(mtbfDays), 'days', 'var(--primary)', 'var(--primary-soft)', 'trending'],
    ['MTTR', mttrHrs, 'hrs', 'var(--info)', 'var(--info-soft)', 'clock'],
    ['Planned vs Unplanned', String(plannedPct), '%', 'var(--ok)', 'var(--ok-soft)', 'pm'],
    ['Cost / Asset', costPerAsset, '', 'var(--warn)', 'var(--warn-soft)', 'cost'],
  ];
  return `
  <div class="page-head"><div><h1>Reports & KPIs</h1><div class="sub">Configurable reporting across maintenance, reliability, cost & compliance</div></div>
  <button class="btn btn-primary" onclick="toast('Report builder opened')">${icon('report')}Build Report</button></div>
  <div class="kpi-row">${kpis.map(k => `<div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}</div>
  <div class="grid-3">${cats.map(c => `<div class="card"><div class="card-head"><h3 style="display:flex;align-items:center;gap:9px"><span style="width:28px;height:28px;border-radius:8px;background:var(--primary-soft);color:var(--primary);display:grid;place-items:center">${icon(c.ic)}</span>${c.t}</h3></div><div style="padding:6px 8px">${c.items.map(i => `<div class="doc-row" style="padding:9px 12px;cursor:pointer" onclick="toast('Running: ${i}')"><div class="dn" style="font-weight:500">${i}</div><span class="link">Run ${icon('arrowr')}</span></div>`).join('')}</div></div>`).join('')}</div>`;
};

/* ============================================================
   VIEW: ESCALATION GROUPS
   ============================================================ */
VIEWS['escalation-groups'] = async function () {
  const groups = ESC_GROUPS.map(g => {
    const members = ESC_MEMBERS.filter(m => m.group_id === g.id).map(m => USERS.find(u => u.id === m.user_id)).filter(Boolean);
    const escCount = ESCALATIONS.filter(e => e.destination === g.name).length;
    return { ...g, members, escCount };
  });
  return `
  <div class="page-head"><div><h1>Escalation Groups</h1><div class="sub">Configure who gets notified when a work order is escalated to each group</div></div>
    <button class="btn btn-primary" onclick="openAddEscGroup()">${icon('up')}Add Group</button></div>
  <div class="kpi-row">
    ${[['Groups', String(ESC_GROUPS.length), '', 'var(--primary)', 'var(--primary-soft)', 'up'], ['Total Members', String(ESC_MEMBERS.length), '', 'var(--info)', 'var(--info-soft)', 'users'], ['Open Escalations', String(ESCALATIONS.filter(e => e.status === 'Open').length), '', 'var(--crit)', 'var(--crit-soft)', 'alert'], ['Total Escalations', String(ESCALATIONS.length), '', 'var(--warn)', 'var(--warn-soft)', 'clock']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}
  </div>
  <div class="grid-2" style="align-items:start">
    ${groups.map(g => `
      <div class="card"><div class="card-head"><h3 style="display:flex;align-items:center;gap:9px"><span style="width:28px;height:28px;border-radius:8px;background:var(--crit-soft);color:var(--crit);display:grid;place-items:center">${icon('up')}</span>${g.name}</h3>
        <div style="display:flex;gap:6px"><button class="btn btn-ghost" style="height:30px;padding:0 10px" onclick="openEditEscGroup('${g.id}')">${icon('edit')}Edit</button><button class="btn btn-ghost" style="height:30px;padding:0 10px;color:var(--crit)" onclick="deleteEscGroup('${g.id}')">${icon('x')}</button></div></div>
      <div class="card-pad">
        <div class="sub2" style="margin:0 0 12px">${g.description || 'No description'}</div>
        <div class="kv-grid" style="margin-bottom:14px">
          <div class="kv-item"><div class="k">Group Email</div><div class="v mono" style="font-size:12px">${g.email || '—'}</div></div>
          <div class="kv-item"><div class="k">Escalations</div><div class="v">${g.escCount} total</div></div>
        </div>
        <div class="sub2" style="margin:0 0 8px">Members (${g.members.length})</div>
        ${g.members.length ? g.members.map(m => `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)"><div class="avatar" style="width:30px;height:30px;font-size:11px">${(m.name || '?').split(' ').map(x => x[0] || '').slice(0,2).join('')}</div><div style="flex:1"><div style="font-weight:500;font-size:13px">${m.name}</div><div class="sub2 mono" style="font-size:11px">${m.email || '—'} · ${m.role || '—'}</div></div><button class="btn btn-ghost" style="height:28px;padding:0 8px;color:var(--crit)" onclick="removeEscMember('${g.id}','${m.id}')">${icon('x')}</button></div>`).join('') : '<div class="sub2" style="font-style:italic">No members — nobody gets notified</div>'}
        <div style="margin-top:12px"><button class="btn btn-ghost" style="width:100%;justify-content:center" onclick="openAddEscMember('${g.id}')">${icon('users')}Add Member</button></div>
      </div></div>`).join('')}
  </div>`;
};

function openAddEscGroup() {
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--crit-soft);color:var(--crit)">${icon('up')}</div><div><h2>Add Escalation Group</h2><div class="did">Create a new escalation destination</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Group Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Group Name</span><input id="eg_name" placeholder="e.g. Clinical Engineering Director" oninput="window.EG_NAME=this.value"></label>
      <label class="fld"><span>Description</span><input id="eg_desc" placeholder="When to escalate to this group" oninput="window.EG_DESC=this.value"></label>
      <label class="fld"><span>Group Email (fallback)</span><input id="eg_email" placeholder="group@cedarridge.org" oninput="window.EG_EMAIL=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitAddEscGroup()">${icon('check')}Create Group</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
  window.EG_NAME = ''; window.EG_DESC = ''; window.EG_EMAIL = '';
}
window.openAddEscGroup = openAddEscGroup;

async function submitAddEscGroup() {
  const name = window.EG_NAME;
  if (!name) { toast('Enter a group name'); return; }
  const id = 'grp-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
  if (ESC_GROUPS.find(g => g.id === id)) { toast('A group with this name already exists'); return; }
  const g = { id, name, description: window.EG_DESC || '', email: window.EG_EMAIL || '' };
  const ok = await addEscalationGroup(g);
  if (!ok) { toast('Failed to create group — ' + LAST_DB_ERROR); return; }
  ESC_GROUPS.push(g);
  closeDrawer();
  go('escalation-groups');
  toast('Escalation group "' + name + '" created');
  addAuditLog('Admin', 'Created escalation group ' + name, 'info');
}
window.submitAddEscGroup = submitAddEscGroup;

function openEditEscGroup(id) {
  const g = ESC_GROUPS.find(x => x.id === id);
  if (!g) return;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--crit-soft);color:var(--crit)">${icon('up')}</div><div><h2>Edit Group</h2><div class="did">${g.name}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Group Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Group Name</span><input id="eg_name" value="${g.name}" oninput="window.EG_NAME=this.value"></label>
      <label class="fld"><span>Description</span><input id="eg_desc" value="${g.description || ''}" oninput="window.EG_DESC=this.value"></label>
      <label class="fld"><span>Group Email (fallback)</span><input id="eg_email" value="${g.email || ''}" oninput="window.EG_EMAIL=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEditEscGroup('${id}')">${icon('check')}Save Changes</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
  window.EG_NAME = g.name; window.EG_DESC = g.description || ''; window.EG_EMAIL = g.email || '';
}
window.openEditEscGroup = openEditEscGroup;

async function submitEditEscGroup(id) {
  const g = ESC_GROUPS.find(x => x.id === id);
  if (!g) return;
  const updates = { name: window.EG_NAME || g.name, description: window.EG_DESC || '', email: window.EG_EMAIL || '' };
  const ok = await updateEscalationGroup(id, updates);
  if (!ok) { toast('Failed to update — ' + LAST_DB_ERROR); return; }
  Object.assign(g, updates);
  closeDrawer();
  go('escalation-groups');
  toast('Group updated');
  addAuditLog('Admin', 'Updated escalation group ' + g.name, 'info');
}
window.submitEditEscGroup = submitEditEscGroup;

async function deleteEscGroup(id) {
  const g = ESC_GROUPS.find(x => x.id === id);
  if (!g) return;
  const ok = await deleteEscalationGroup(id);
  if (!ok) { toast('Failed to delete — ' + LAST_DB_ERROR); return; }
  ESC_GROUPS = ESC_GROUPS.filter(x => x.id !== id);
  ESC_MEMBERS = ESC_MEMBERS.filter(m => m.group_id !== id);
  go('escalation-groups');
  toast('Group "' + g.name + '" deleted');
  addAuditLog('Admin', 'Deleted escalation group ' + g.name, 'warn');
}
window.deleteEscGroup = deleteEscGroup;

function openAddEscMember(groupId) {
  const g = ESC_GROUPS.find(x => x.id === groupId);
  if (!g) return;
  const existing = new Set(ESC_MEMBERS.filter(m => m.group_id === groupId).map(m => m.user_id));
  const available = USERS.filter(u => !existing.has(u.id));
  const userOpts = available.map(u => `<option value="${u.id}">${u.name} (${u.role || '—'})</option>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('users')}</div><div><h2>Add Member to ${g.name}</h2><div class="did">This person will be notified on escalation</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Select User</h4>
    <label class="fld"><span>User</span><select id="em_user"><option value="">Select user…</option>${userOpts}</select></label>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitAddEscMember('${groupId}')">${icon('check')}Add Member</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddEscMember = openAddEscMember;

async function submitAddEscMember(groupId) {
  const userId = document.getElementById('em_user').value;
  if (!userId) { toast('Select a user'); return; }
  const ok = await addEscalationGroupMember(groupId, userId);
  if (!ok) { toast('Failed to add member — ' + LAST_DB_ERROR); return; }
  ESC_MEMBERS.push({ group_id: groupId, user_id: userId, created_at: new Date().toISOString() });
  closeDrawer();
  go('escalation-groups');
  const u = USERS.find(x => x.id === userId);
  const g = ESC_GROUPS.find(x => x.id === groupId);
  toast((u ? u.name : 'User') + ' added to ' + (g ? g.name : 'group'));
  addAuditLog('Admin', 'Added ' + (u ? u.name : userId) + ' to escalation group ' + (g ? g.name : groupId), 'info');
}
window.submitAddEscMember = submitAddEscMember;

async function removeEscMember(groupId, userId) {
  const ok = await removeEscalationGroupMember(groupId, userId);
  if (!ok) { toast('Failed to remove — ' + LAST_DB_ERROR); return; }
  ESC_MEMBERS = ESC_MEMBERS.filter(m => !(m.group_id === groupId && m.user_id === userId));
  go('escalation-groups');
  const u = USERS.find(x => x.id === userId);
  const g = ESC_GROUPS.find(x => x.id === groupId);
  toast((u ? u.name : 'User') + ' removed from ' + (g ? g.name : 'group'));
}
window.removeEscMember = removeEscMember;


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
  if (!pm) { toast('PM work order not found'); go('pm'); return ''; }
  const e = EQMAP[pm.eq_id] || { name: 'Unknown', tag: '—', loc: '—', dept: '—', crit: 'med', ic: 'asset' };
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
      <div class="card"><div class="card-head"><h3>PM Checklist${done ? ' — Completed' : ''}</h3>${done ? `<span class="hint">${getTemplate(pm.tpl) ? (getTemplate(pm.tpl).title || pm.tpl) : pm.tpl} protocol</span>` : `<select style="height:28px;font-size:12px" onchange="changePMTemplate('${id}',this.value)">${buildTemplateOptions(pm.tpl)}</select>`}</div>
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

function getTemplate(tplKey) {
  if (CHECKLISTS[tplKey]) return CHECKLISTS[tplKey];
  const custom = PM_TEMPLATES.find(t => t.id === tplKey);
  return custom || null;
}

function buildTemplateOptions(currentTpl) {
  const builtIn = Object.keys(CHECKLISTS).filter(k => k !== 'posttest').map(k => `<option value="${k}" ${k === currentTpl ? 'selected' : ''}>${k.charAt(0).toUpperCase() + k.slice(1)} (built-in)</option>`);
  const custom = PM_TEMPLATES.map(t => `<option value="${t.id}" ${t.id === currentTpl ? 'selected' : ''}>${t.name} (custom)</option>`);
  return builtIn.join('') + custom.join('');
}

async function changePMTemplate(pmId, tplKey) {
  const pm = PMWOMAP[pmId];
  if (!pm) return;
  pm.tpl = tplKey;
  const ok = await updatePMWorkOrder(pmId, { tpl: tplKey });
  if (!ok) { toast('Failed to save — ' + LAST_DB_ERROR); return; }
  CHK_CTX = { tpl: tplKey, mode: 'pm', id: pmId };
  openJob(pmId, 'pm');
  toast('Checklist changed to ' + (getTemplate(tplKey)?.title || tplKey));
  addAuditLog('Admin', 'Changed PM checklist for ' + pmId, 'info');
}
window.changePMTemplate = changePMTemplate;

function checklistHTML(id, tplKey, mode) {
  const tpl = getTemplate(tplKey);
  if (!tpl) return '<div class="sub2">No checklist template found for this PM.</div>';
  const st = CHK_STATE[id] || { checklist: {}, notes: '', supervisor: false, parts: [], technician: '' };
  const pr = progressOf(st.checklist, tplKey);
  const pct = pr.total ? Math.round(pr.done / pr.total * 100) : 0;
  const w = WOMAP[id];
  const pm = PMWOMAP[id];
  const currentTech = st.technician || (w ? w.assignee : pm ? (pm.team || '') : '');
  const techOpts = ['Unassigned', ...TECHS.map(t => t.name)].map(n => `<option ${n === currentTech ? 'selected' : ''}>${n}</option>`).join('');
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
      ${pr.failItems ? `<div class="chk-warn" style="margin-top:8px">${pr.failItems.map(f => `<div>• <b>${f.title}</b>: measured ${f.val} ${f.unit} — acceptable range is ${f.min}–${f.max} ${f.unit}.</div>`).join('')}</div>` : ''}
    </div>
    ${secs}
    <div class="chk-signoff">
      <div class="chk-sec-h">Sign-off</div>
      <label class="fld" style="margin-bottom:12px"><span>Assigned Technician</span><select onchange="setChecklistTech('${id}',this.value)">${techOpts}</select></label>
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
  saveChecklistResult(id, CHK_CTX.mode === 'pm' ? 'pm' : 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step, technician: st.technician });
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
  saveChecklistResult(id, CHK_CTX.mode === 'pm' ? 'pm' : 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step, technician: st.technician });
  refreshChecklist(id);
}
window.setReading = setReading;

function setChecklistTech(id, val) {
  const st = CHK_STATE[id];
  if (!st) return;
  st.technician = val;
  saveChecklistResult(id, CHK_CTX.mode === 'pm' ? 'pm' : 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step, technician: st.technician });
}
window.setChecklistTech = setChecklistTech;

function refreshChecklist(id) {
  if (!CHK_CTX) return;
  const el = document.getElementById('chkarea');
  if (el) el.innerHTML = checklistHTML(id, CHK_CTX.tpl, CHK_CTX.mode);
}

function toggleSupervisor(id, val) {
  const st = CHK_STATE[id];
  if (!st) return;
  st.supervisor = val;
  saveChecklistResult(id, CHK_CTX.mode === 'pm' ? 'pm' : 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step, technician: st.technician });
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

let ISSUE_PART_WO_ID = null;
function issuePartTo(id) {
  ISSUE_PART_WO_ID = id;
  const avail = PARTS.filter(p => p.qty > 0);
  const partOpts = avail.map(p => `<option value="${p.id}">${p.id} — ${p.name} (${p.qty} in stock, ${p.cost})</option>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('parts')}</div><div><h2>Issue Part to Work Order</h2><div class="did">${id}</div></div></div><button class="icon-btn close" onclick="closeDrawer();openJob('${id}','wo')">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Select Part</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Part</span><select id="ip2_part"><option value="">Select part…</option>${partOpts}</select></label>
      <label class="fld"><span>Quantity</span><input id="ip2_qty" type="number" value="1" min="1"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitIssuePartTo()">${icon('check')}Issue Part</button><button class="btn btn-ghost" onclick="closeDrawer();openJob('${id}','wo')">Cancel</button></div>
  </div></div>`);
}
window.issuePartTo = issuePartTo;

async function submitIssuePartTo() {
  const id = ISSUE_PART_WO_ID;
  if (!id) return;
  const pid = document.getElementById('ip2_part').value;
  if (!pid) { toast('Select a part'); return; }
  const qty = Number(document.getElementById('ip2_qty').value) || 1;
  const p = PARTS.find(x => x.id === pid);
  if (!p) { toast('Part not found'); return; }
  if (p.qty < qty) { toast('Insufficient stock — only ' + p.qty + ' available'); return; }
  const ok = await updatePart(pid, { qty: p.qty - qty });
  if (!ok) { toast('Failed to issue part — ' + LAST_DB_ERROR); return; }
  p.qty -= qty;
  const st = CHK_STATE[id];
  if (st) {
    st.parts.push({ id: p.id, name: p.name, qty, cost: Number(p.cost) });
    saveChecklistResult(id, 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step, technician: st.technician });
  }
  closeDrawer();
  openJob(id, 'wo');
  const el = document.getElementById('jobparts');
  if (el) el.innerHTML = jobPartsHTML(id);
  toast('Issued ' + qty + ' × ' + p.id + ' to ' + id + ' — stock now ' + p.qty);
  addAuditLog('Store', 'Issued ' + qty + ' × ' + p.id + ' to ' + id, 'warn');
}
window.submitIssuePartTo = submitIssuePartTo;

async function completePM(id) {
  const pm = PMWOMAP[id];
  const st = CHK_STATE[id];
  const pr = progressOf(st.checklist, pm.tpl);
  if (pr.done < pr.total) { toast('Complete all checklist items first'); return; }
  const e = EQMAP[pm.eq_id];
  const pmOk = await updatePMWorkOrder(id, { status: 'completed', completed_on: TODAY });
  if (!pmOk) { toast('Failed to complete PM — ' + LAST_DB_ERROR); return; }
  pm.status = 'completed';
  pm.completed_on = TODAY;
  const newPM = Math.min(100, Math.max(e.pm, pr.fails ? 88 : 98));
  const nextPM = addInterval(pm.due, pm.freq);
  const eqOk = await saveEquipment({ ...e, pm: newPM, next_pm: nextPM, status: (e.status === 'pm' || e.status === 'maint') ? 'available' : e.status });
  if (!eqOk) { toast('Failed to update equipment — ' + LAST_DB_ERROR); return; }
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
  if (pr.fails) {
    const details = pr.failItems.map(f => f.val !== '—' ? `${f.title}: ${f.val} ${f.unit} (range ${f.min}–${f.max})` : f.title).join('; ');
    toast('Testing failed — ' + details + '. Equipment cannot return to service');
    return;
  }
  st.step = 6;
  saveChecklistResult(id, 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step, technician: st.technician });
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
  saveChecklistResult(id, 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step, technician: st.technician });
  if (st.step >= 8) {
    const closeOk = await updateWorkOrder(id, { status: 'closed', sla_pct: 100 });
    if (!closeOk) { toast('Failed to close — ' + LAST_DB_ERROR); return; }
    w.status = 'closed';
    w.sla_pct = 100;
    toast('Work order ' + id + ' closed — equipment returned to service');
    addAuditLog(w.assignee, 'Closed work order ' + id, 'ok');
    const eq = EQMAP[w.eq_id];
    const requestorEmail = w.requestor ? (USERS.find(u => u.name === w.requestor)?.email || '') : '';
    if (w.requestor && requestorEmail) {
      await fireNotification(id, 'Work Order Closed', `${id} — ${w.title} has been closed. Equipment returned to service.`, 'ok', w.requestor);
      await fireEmail(id, requestorEmail, w.requestor, `Work Order Closed — ${id}`, `Your service request has been completed and the work order is now closed.

Work Order: ${id}
Title: ${w.title}
Equipment: ${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}
Status: Closed
SLA: Met

The equipment has been returned to service. Thank you for your report.`);
    }
    const supervisor = USERS.find(u => u.role && u.role.toLowerCase().includes('supervisor') && u.status === 'active');
    if (supervisor) {
      await fireNotification(id, 'Work Order Closed', `${id} — ${w.title} closed by ${w.assignee}. SLA met.`, 'ok', supervisor.name);
      await fireEmail(id, supervisor.email, supervisor.name, `Work Order Closed — ${id}`, `A work order has been closed.

Work Order: ${id}
Title: ${w.title}
Equipment: ${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}
Closed by: ${w.assignee}
SLA: Met

Please review in Vitalis CMMS.`);
    }
  } else {
    const smap = { 4: 'inprogress', 5: 'inprogress', 6: 'inprogress', 7: 'inprogress' };
    if (smap[st.step]) {
      const advOk = await updateWorkOrder(id, { status: smap[st.step] });
      if (!advOk) { toast('Failed to update — ' + LAST_DB_ERROR); return; }
      w.status = smap[st.step];
    }
    toast('Advanced to ' + CORR_STEPS[st.step]);
    const eq = EQMAP[w.eq_id];
    const requestorEmail = w.requestor ? (USERS.find(u => u.name === w.requestor)?.email || '') : '';
    if (w.requestor && requestorEmail) {
      await fireNotification(id, 'Work Order Update', `${id} — Status changed to "${CORR_STEPS[st.step]}"`, 'info', w.requestor);
      await fireEmail(id, requestorEmail, w.requestor, `Work Order Update — ${id}`, `The status of your service request has been updated.

Work Order: ${id}
Title: ${w.title}
Equipment: ${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}
New Status: ${CORR_STEPS[st.step]}
Assigned to: ${w.assignee}

You will continue to receive updates as the work progresses.`);
    }
  }
  openJob(id, 'wo');
}
window.advanceJob = advanceJob;

/* ================= CREATE FORMS ================= */

let NEWWO = {};
function openNewWorkOrder() {
  NEWWO = { type: 'Corrective', pri: 'P3', assignee: 'Unassigned', team: 'Biomedical', eq_id: '', title: '', workflow_id: '', requestor: '' }; window.NEWWO = NEWWO;
  const eqOpts = EQUIP.map(e => `<option value="${e.id}">${e.tag} — ${e.name}</option>`).join('');
  const techOpts = ['Unassigned', ...TECHS.map(t => t.name)].map(n => `<option ${n === 'Unassigned' ? 'selected' : ''}>${n}</option>`).join('');
  const wfOpts = ['<option value="">No workflow (default corrective flow)</option>', ...WORKFLOWS.map(w => `<option value="${w.id}">${w.name}</option>`)].join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('wo')}</div><div><h2>New Work Order</h2><div class="did">Create a corrective or preventive work order</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Work Order Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Title / Problem Description</span><input id="nw_title" placeholder="e.g. Ventilator alarm not triggering" oninput="window.NEWWO.title=this.value"></label>
      <label class="fld"><span>Equipment</span><select id="nw_eq" onchange="window.NEWWO.eq_id=this.value"><option value="">Select equipment…</option>${eqOpts}</select></label>
      <label class="fld"><span>Type</span><select id="nw_type" onchange="window.NEWWO.type=this.value"><option>Corrective</option><option>Preventive</option><option>Calibration</option><option>Safety Test</option></select></label>
      <label class="fld"><span>Priority</span><select id="nw_pri" onchange="window.NEWWO.pri=this.value"><option>P1</option><option selected>P2</option><option>P3</option><option>P4</option></select></label>
      <label class="fld"><span>Assignee</span><select id="nw_assignee" onchange="window.NEWWO.assignee=this.value">${techOpts}</select></label>
      <label class="fld"><span>Team</span><select id="nw_team" onchange="window.NEWWO.team=this.value"><option>Biomedical</option><option>Imaging</option><option>Facilities</option><option>Vendor</option></select></label>
      <label class="fld"><span>Due Date</span><input id="nw_due" type="date" onchange="window.NEWWO.due=this.value"></label>
      <label class="fld"><span>Workflow</span><select id="nw_wf" onchange="window.NEWWO.workflow_id=this.value">${wfOpts}</select></label>
      <label class="fld"><span>Requestor (optional)</span><input id="nw_requestor" placeholder="e.g. Nurse on duty" oninput="window.NEWWO.requestor=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitWorkOrder()">${icon('check')}Create Work Order</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openNewWorkOrder = openNewWorkOrder;

async function submitWorkOrder() {
  if (!window.NEWWO.title) { toast('Enter a title / problem description'); return; }
  if (!window.NEWWO.eq_id) { toast('Select the affected equipment'); return; }
  const id = nextSequentialId('WO', WORKORDERS, 24830, 5);
  const now = new Date();
  const openedStr = `${now.getDate().toString().padStart(2,'0')} ${now.toLocaleDateString('en-GB',{month:'short'})} ${now.getFullYear()}`;
  const dueDate = window.NEWWO.due ? window.NEWWO.due.split('-').reverse().join(' ') : openedStr;
  const wo = {
    id, eq_id: window.NEWWO.eq_id, title: window.NEWWO.title, type: window.NEWWO.type, pri: window.NEWWO.pri,
    status: 'triaged', assignee: window.NEWWO.assignee || 'Unassigned', team: window.NEWWO.team,
    opened: openedStr, due: dueDate, sla: 'On track', sla_pct: 0, step: 1, notes: '',
    workflow_id: window.NEWWO.workflow_id || null,
    requestor: window.NEWWO.requestor || null,
  };
  const ok = await addWorkOrder(wo);
  if (!ok) { toast('Failed to create work order — ' + LAST_DB_ERROR); return; }
  WORKORDERS.unshift(wo);
  WOMAP[wo.id] = wo;
  closeDrawer();
  if (CURRENT === 'workorders') go('workorders');
  toast('Work order ' + id + ' created');
  addAuditLog('Dr. Rana Aoun', 'Created work order ' + id + ' — ' + window.NEWWO.title, 'info');
}
window.submitWorkOrder = submitWorkOrder;

let NEWSR = {};
function openReportFault() {
  NEWSR = { eq_id: '', by: '', description: '', usable: 'Yes', urg: 'Medium' }; window.NEWSR = NEWSR;
  const eqOpts = EQUIP.map(e => `<option value="${e.id}">${e.tag} — ${e.name}</option>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('alert')}</div><div><h2>Report a Fault</h2><div class="did">Log a service request from the floor</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Fault Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Equipment <span style="color:var(--crit)">*required</span></span><select id="sr_eq" onchange="window.NEWSR.eq_id=this.value"><option value="">Select equipment…</option>${eqOpts}</select></label>
      <label class="fld"><span>Reported By</span><input id="sr_by" placeholder="e.g. Nurse on duty" oninput="window.NEWSR.by=this.value"></label>
      <label class="fld"><span>Fault Description <span style="color:var(--crit)">*required</span></span><textarea id="sr_desc" rows="3" placeholder="Describe what is wrong with the equipment — e.g. 'Alarm not sounding when parameters are exceeded'" oninput="window.NEWSR.description=this.value"></textarea></label>
      <label class="fld"><span>Is the equipment usable?</span><select id="sr_usable" onchange="window.NEWSR.usable=this.value"><option>Yes</option><option>Limited</option><option>No</option></select></label>
      <label class="fld"><span>Urgency</span><select id="sr_urg" onchange="window.NEWSR.urg=this.value"><option>Low</option><option selected>Medium</option><option>High</option></select></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitServiceRequest()">${icon('check')}Submit Request</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openReportFault = openReportFault;

async function submitServiceRequest() {
  if (!window.NEWSR.description) { toast('Enter a fault description'); return; }
  if (!window.NEWSR.eq_id) { toast('Select the affected equipment'); return; }
  const id = nextSequentialId('SR', SR_DATA, 1007, 4);
  const now = new Date();
  const timeStr = `${now.getDate().toString().padStart(2,'0')} ${now.toLocaleDateString('en-GB',{month:'short'})} ${now.getFullYear()}`;
  const sr = {
    id, eq_id: window.NEWSR.eq_id, by: window.NEWSR.by || 'Anonymous', description: window.NEWSR.description,
    usable: window.NEWSR.usable, time: timeStr, urg: window.NEWSR.urg,
  };
  const ok = await addServiceRequest(sr);
  if (!ok) { toast('Failed to submit request — ' + LAST_DB_ERROR); return; }
  SR_DATA.unshift(sr);
  closeDrawer();
  if (CURRENT === 'requests') go('requests');
  toast('Service request ' + id + ' submitted');
  addAuditLog(window.NEWSR.by || 'Anonymous', 'Reported fault ' + id + ' — ' + window.NEWSR.description.slice(0, 40), 'warn');
  const eq = EQMAP[window.NEWSR.eq_id];
  const bioEngs = USERS.filter(u => u.role && u.role.toLowerCase().includes('biomedical') && u.status === 'active');
  for (const eng of bioEngs) {
    await fireNotification(null, 'New Service Request', `${id} — ${window.NEWSR.description.slice(0, 60)}${eq ? ' (' + eq.tag + ')' : ''}`, 'warn', eng.name);
    await fireEmail(null, eng.email, eng.name, `New Service Request — ${id}`, `A new service request has been submitted.

Request ID: ${id}
Equipment: ${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}
Reported by: ${window.NEWSR.by || 'Anonymous'}
Urgency: ${window.NEWSR.urg}
Usable: ${window.NEWSR.usable}

Description: ${window.NEWSR.description}

Please review and triage this request in Vitalis CMMS.`);
  }
  if (bioEngs.length === 0) {
    await fireNotification(null, 'New Service Request', `${id} — ${window.NEWSR.description.slice(0, 60)}`, 'warn', 'Biomedical Engineering');
    await fireEmail(null, 'biomedical@cedarridge.org', 'Biomedical Engineering', `New Service Request — ${id}`, `A new service request has been submitted.

Request ID: ${id}
Equipment: ${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}
Reported by: ${window.NEWSR.by || 'Anonymous'}
Urgency: ${window.NEWSR.urg}
Usable: ${window.NEWSR.usable}

Description: ${window.NEWSR.description}

Please review and triage this request in Vitalis CMMS.`);
  }
}
window.submitServiceRequest = submitServiceRequest;

let NEWVENDOR = {};
function openAddVendor() {
  NEWVENDOR = { name: '', cat: '', contract: '', sla: 90, cost: 0, exp: '' }; window.NEWVENDOR = NEWVENDOR;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('vendor')}</div><div><h2>Add Vendor</h2><div class="did">Register a vendor & service contract</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Vendor Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Vendor Name</span><input id="v_name" placeholder="e.g. Siemens Healthineers" oninput="window.NEWVENDOR.name=this.value"></label>
      <label class="fld"><span>Coverage Category</span><select id="v_cat" onchange="window.NEWVENDOR.cat=this.value"><option>Imaging</option><option>Biomedical</option><option>Facilities</option><option>Laboratory</option><option>IT / Network</option></select></label>
      <label class="fld"><span>Contract Type</span><input id="v_contract" placeholder="e.g. Full-service, 24/7" oninput="window.NEWVENDOR.contract=this.value"></label>
      <label class="fld"><span>SLA Compliance %</span><input id="v_sla" type="number" min="0" max="100" value="90" onchange="window.NEWVENDOR.sla=Number(this.value)"></label>
      <label class="fld"><span>Annual Cost ($)</span><input id="v_cost" type="number" value="0" onchange="window.NEWVENDOR.cost=Number(this.value)"></label>
      <label class="fld"><span>Contract Expiry</span><input id="v_exp" type="date" onchange="window.NEWVENDOR.exp=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitVendor()">${icon('check')}Add Vendor</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddVendor = openAddVendor;

async function submitVendor() {
  if (!window.NEWVENDOR.name) { toast('Enter a vendor name'); return; }
  const id = nextSequentialId('V', VENDORS, 8, 3);
  const v = {
    id, name: window.NEWVENDOR.name, cat: window.NEWVENDOR.cat, contract: window.NEWVENDOR.contract || 'Standard',
    sla: window.NEWVENDOR.sla, open: 0, cost: window.NEWVENDOR.cost, exp: window.NEWVENDOR.exp || null,
  };
  const ok = await addVendor(v);
  if (!ok) { toast('Failed to add vendor — ' + LAST_DB_ERROR); return; }
  VENDORS.push(v);
  closeDrawer();
  if (CURRENT === 'vendors') go('vendors');
  toast('Vendor ' + window.NEWVENDOR.name + ' added');
  addAuditLog('Admin', 'Added vendor ' + window.NEWVENDOR.name, 'info');
}
window.submitVendor = submitVendor;

let NEWEQ = {};
function openAddEquipment() {
  NEWEQ = { id: '', tag: '', name: '', model: '', mfr: '', cat: '', dept: '', loc: '', crit: 'med', status: 'available', serial: '', cost: 0, warranty_exp: '' }; window.NEWEQ = NEWEQ;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('asset')}</div><div><h2>Add Equipment</h2><div class="did">Register a new medical device asset</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Equipment Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Asset Name</span><input id="eq_name" placeholder="e.g. Patient Monitor MX450" oninput="window.NEWEQ.name=this.value"></label>
      <label class="fld"><span>Asset Tag</span><input id="eq_tag" placeholder="e.g. CR-PM-0150" oninput="window.NEWEQ.tag=this.value"></label>
      <label class="fld"><span>Manufacturer</span><input id="eq_mfr" placeholder="e.g. Philips" oninput="window.NEWEQ.mfr=this.value"></label>
      <label class="fld"><span>Model</span><input id="eq_model" placeholder="e.g. MX450" oninput="window.NEWEQ.model=this.value"></label>
      <label class="fld"><span>Serial Number</span><input id="eq_serial" placeholder="e.g. SN-DE-2024-0892" oninput="window.NEWEQ.serial=this.value"></label>
      <label class="fld"><span>Category</span><select id="eq_cat" onchange="window.NEWEQ.cat=this.value"><option>Patient Monitor</option><option>Ventilator</option><option>Defibrillator</option><option>Infusion</option><option>Imaging</option><option>Sterilizer</option><option>HVAC</option><option>Other</option></select></label>
      <label class="fld"><span>Department</span><select id="eq_dept" onchange="window.NEWEQ.dept=this.value"><option>ICU</option><option>Radiology</option><option>Operating Room</option><option>Emergency</option><option>Nephrology</option><option>Facilities</option><option>NICU</option></select></label>
      <label class="fld"><span>Location</span><input id="eq_loc" placeholder="e.g. ICU Bay 3" oninput="window.NEWEQ.loc=this.value"></label>
      <label class="fld"><span>Criticality</span><select id="eq_crit" onchange="window.NEWEQ.crit=this.value"><option value="life">Life Support</option><option value="high">High Risk</option><option value="med" selected>Medium</option><option value="low">Low</option></select></label>
      <label class="fld"><span>Acquisition Cost ($)</span><input id="eq_cost" type="number" value="0" onchange="window.NEWEQ.cost=Number(this.value)"></label>
      <label class="fld"><span>Warranty Expiry</span><input id="eq_warranty_exp" type="date" onchange="window.NEWEQ.warranty_exp=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEquipment()">${icon('check')}Register Equipment</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddEquipment = openAddEquipment;

async function submitEquipment() {
  if (!window.NEWEQ.name) { toast('Enter an asset name'); return; }
  if (!window.NEWEQ.tag) { toast('Enter an asset tag'); return; }
  const id = nextSequentialId('E', EQUIP, 850, 4);
  const icMap = { 'Patient Monitor': 'monitor', 'Ventilator': 'vent', 'Defibrillator': 'defib', 'Infusion': 'pump', 'Imaging': 'mri', 'Sterilizer': 'ster', 'HVAC': 'hvac', 'Other': 'asset' };
  const e = {
    id, tag: window.NEWEQ.tag, name: window.NEWEQ.name, model: window.NEWEQ.model, mfr: window.NEWEQ.mfr,
    cat: window.NEWEQ.cat, ic: icMap[window.NEWEQ.cat] || 'asset', dept: window.NEWEQ.dept, loc: window.NEWEQ.loc,
    status: window.NEWEQ.status, crit: window.NEWEQ.crit, risk: window.NEWEQ.crit === 'life' ? 90 : window.NEWEQ.crit === 'high' ? 75 : 50,
    pm: 100, next_pm: null, warranty: window.NEWEQ.warranty_exp ? (new Date(window.NEWEQ.warranty_exp) >= new Date(TODAY) ? 'Active' : 'Expired') : 'Active', warranty_exp: window.NEWEQ.warranty_exp || null, cal_due: null, age: 0, cost: window.NEWEQ.cost, serial: window.NEWEQ.serial, sla: 'P3',
  };
  const ok = await addEquipment(e);
  if (!ok) { toast('Failed to register equipment — ' + LAST_DB_ERROR); return; }
  EQUIP.push(e);
  EQMAP[e.id] = e;
  closeDrawer();
  if (CURRENT === 'equipment') go('equipment');
  toast('Equipment ' + window.NEWEQ.tag + ' registered');
  addAuditLog('Admin', 'Registered equipment ' + window.NEWEQ.tag + ' — ' + window.NEWEQ.name, 'info');
}
window.submitEquipment = submitEquipment;

/* ================= EDIT EQUIPMENT ================= */
let EDITEQ = {};
function openEditEquipment(id) {
  const e = EQMAP[id];
  if (!e) return;
  EDITEQ = { id, name: e.name, tag: e.tag, model: e.model || '', mfr: e.mfr || '', cat: e.cat || '', dept: e.dept || '', loc: e.loc || '', crit: e.crit, status: e.status, serial: e.serial || '', cost: Number(e.cost) || 0, warranty_exp: e.warranty_exp || '' };
  window.EDITEQ = EDITEQ;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('edit')}</div><div><h2>Edit Asset</h2><div class="did">${e.tag} · ${e.id}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Equipment Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Asset Name</span><input id="edeq_name" value="${e.name}" oninput="window.EDITEQ.name=this.value"></label>
      <label class="fld"><span>Asset Tag</span><input id="edeq_tag" value="${e.tag}" oninput="window.EDITEQ.tag=this.value"></label>
      <label class="fld"><span>Manufacturer</span><input id="edeq_mfr" value="${e.mfr || ''}" oninput="window.EDITEQ.mfr=this.value"></label>
      <label class="fld"><span>Model</span><input id="edeq_model" value="${e.model || ''}" oninput="window.EDITEQ.model=this.value"></label>
      <label class="fld"><span>Serial Number</span><input id="edeq_serial" value="${e.serial || ''}" oninput="window.EDITEQ.serial=this.value"></label>
      <label class="fld"><span>Category</span><select id="edeq_cat" onchange="window.EDITEQ.cat=this.value">${['Patient Monitor','Ventilator','Defibrillator','Infusion','Imaging','Sterilizer','HVAC','Other'].map(c => `<option ${c === e.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="fld"><span>Department</span><select id="edeq_dept" onchange="window.EDITEQ.dept=this.value">${['ICU','Radiology','Operating Room','Emergency','Nephrology','Facilities','NICU'].map(d => `<option ${d === e.dept ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label class="fld"><span>Location</span><input id="edeq_loc" value="${e.loc || ''}" oninput="window.EDITEQ.loc=this.value"></label>
      <label class="fld"><span>Criticality</span><select id="edeq_crit" onchange="window.EDITEQ.crit=this.value"><option value="life" ${e.crit === 'life' ? 'selected' : ''}>Life Support</option><option value="high" ${e.crit === 'high' ? 'selected' : ''}>High Risk</option><option value="med" ${e.crit === 'med' ? 'selected' : ''}>Medium</option><option value="low" ${e.crit === 'low' ? 'selected' : ''}>Low</option></select></label>
      <label class="fld"><span>Status</span><select id="edeq_status" onchange="window.EDITEQ.status=this.value">${Object.entries(STAT).map(([k,v]) => `<option value="${k}" ${e.status === k ? 'selected' : ''}>${v.l}</option>`).join('')}</select></label>
      <label class="fld"><span>Acquisition Cost ($)</span><input id="edeq_cost" type="number" value="${Number(e.cost) || 0}" onchange="window.EDITEQ.cost=Number(this.value)"></label>
      <label class="fld"><span>Warranty Expiry</span><input id="edeq_warranty_exp" type="date" value="${e.warranty_exp || ''}" onchange="window.EDITEQ.warranty_exp=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEditEquipment()">${icon('check')}Save Changes</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openEditEquipment = openEditEquipment;

async function submitEditEquipment() {
  const d = window.EDITEQ;
  if (!d.name) { toast('Enter an asset name'); return; }
  const updates = {
    name: d.name, tag: d.tag, model: d.model, mfr: d.mfr, cat: d.cat, dept: d.dept, loc: d.loc,
    crit: d.crit, status: d.status, serial: d.serial, cost: d.cost,
    warranty_exp: d.warranty_exp || null,
    warranty: d.warranty_exp ? (new Date(d.warranty_exp) >= new Date(TODAY) ? 'Active' : 'Expired') : 'Active',
    risk: d.crit === 'life' ? 90 : d.crit === 'high' ? 75 : 50,
  };
  const ok = await updateEquipment(d.id, updates);
  if (!ok) { toast('Failed to update equipment — ' + LAST_DB_ERROR); return; }
  const e = EQMAP[d.id];
  if (e) Object.assign(e, updates);
  closeDrawer();
  if (CURRENT === 'equipment') go('equipment');
  toast('Equipment ' + d.tag + ' updated');
  addAuditLog('Admin', 'Updated equipment ' + d.tag + ' — ' + d.name, 'info');
}
window.submitEditEquipment = submitEditEquipment;

function confirmDeleteEquipment(id) {
  const e = EQMAP[id];
  if (!e) return;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--crit-soft);color:var(--crit)">${icon('trash')}</div><div><h2>Delete Asset?</h2><div class="did">${e.tag} · ${e.name}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec">
    <p style="font-size:14px;line-height:1.6;color:var(--text-2)">This will permanently delete <b>${e.name}</b> (${e.tag}) and all related work orders and service requests. This cannot be undone.</p>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" style="background:var(--crit)" onclick="doDeleteEquipment('${id}')">${icon('trash')}Delete Permanently</button><button class="btn btn-ghost" onclick="openEquipment('${id}')">Cancel</button></div>
  </div></div>`);
}
window.confirmDeleteEquipment = confirmDeleteEquipment;

async function doDeleteEquipment(id) {
  const ok = await deleteEquipment(id);
  if (!ok) { toast('Failed to delete equipment — ' + LAST_DB_ERROR); return; }
  EQUIP = EQUIP.filter(e => e.id !== id);
  delete EQMAP[id];
  WORKORDERS = WORKORDERS.filter(w => w.eq_id !== id);
  WOMAP = Object.fromEntries(WORKORDERS.map(w => [w.id, w]));
  PMWO = PMWO.filter(p => p.eq_id !== id);
  PMWOMAP = Object.fromEntries(PMWO.map(p => [p.id, p]));
  SR_DATA = SR_DATA.filter(r => r.eq_id !== id);
  closeDrawer();
  if (CURRENT === 'equipment') go('equipment');
  toast('Equipment deleted');
  addAuditLog('Admin', 'Deleted equipment ' + id, 'warn');
}
window.doDeleteEquipment = doDeleteEquipment;

/* ================= TECHNICIAN FORM ================= */
let NEWTECH = {};
function openAddTechnician() {
  NEWTECH = { name: '', trade: 'Biomedical', skills: [], certName: '', certExp: '', cap: 8 }; window.NEWTECH = NEWTECH;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('wrench')}</div><div><h2>Add Technician</h2><div class="did">Register a technician & competency record</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Technician Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Full Name</span><input id="t_name" placeholder="e.g. Sami Khoury" oninput="window.NEWTECH.name=this.value"></label>
      <label class="fld"><span>Trade / Team</span><select id="t_trade" onchange="window.NEWTECH.trade=this.value"><option>Biomedical</option><option>Imaging</option><option>Facilities</option><option>HVAC</option></select></label>
      <label class="fld"><span>Capacity (open jobs)</span><input id="t_cap" type="number" value="8" min="1" max="20" onchange="window.NEWTECH.cap=Number(this.value)"></label>
      <div><div class="sub2" style="margin:0 0 6px">Competencies (toggle skill areas)</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${SKILL_AREAS.map(s => `<button class="pill ${window.NEWTECH.skills.includes(s) ? 'p-info' : 'p-muted'}" style="cursor:pointer;border:none" id="t_skill_${s}" onclick="toggleTechSkill('${s}')">${s}</button>`).join('')}</div>
      </div>
      <label class="fld"><span>Certification Name</span><input id="t_cert" placeholder="e.g. CBET (Certified Biomedical Equipment Technician)" oninput="window.NEWTECH.certName=this.value"></label>
      <label class="fld"><span>Certification Expiry</span><input id="t_certexp" type="date" onchange="window.NEWTECH.certExp=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitTechnician()">${icon('check')}Add Technician</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddTechnician = openAddTechnician;

function toggleTechSkill(s) {
  const idx = window.NEWTECH.skills.indexOf(s);
  if (idx >= 0) window.NEWTECH.skills.splice(idx, 1); else window.NEWTECH.skills.push(s);
  const btn = document.getElementById('t_skill_' + s);
  if (btn) { btn.className = 'pill ' + (window.NEWTECH.skills.includes(s) ? 'p-info' : 'p-muted'); btn.style.cursor = 'pointer'; btn.style.border = 'none'; }
}
window.toggleTechSkill = toggleTechSkill;

async function submitTechnician() {
  if (!window.NEWTECH.name) { toast('Enter a technician name'); return; }
  const id = nextSequentialId('U-T', TECHS, 10, 2);
  const certs = [];
  if (window.NEWTECH.certName) certs.push({ n: window.NEWTECH.certName, exp: window.NEWTECH.certExp || '2027-01-01' });
  const t = { id, name: window.NEWTECH.name, trade: window.NEWTECH.trade, skills: window.NEWTECH.skills, certs, load: 0, cap: window.NEWTECH.cap, avail: 'On shift' };
  const ok = await addTechnician(t);
  if (!ok) { toast('Failed to add technician — ' + LAST_DB_ERROR); return; }
  TECHS.push(t);
  closeDrawer();
  if (CURRENT === 'techs') go('techs');
  toast('Technician ' + window.NEWTECH.name + ' added');
  addAuditLog('Admin', 'Added technician ' + window.NEWTECH.name, 'info');
}
window.submitTechnician = submitTechnician;

/* ================= CALIBRATION FORM ================= */
let NEWCAL = {};
function openRecordCalibration() {
  const eqOpts = EQUIP.map(e => `<option value="${e.id}">${e.tag} — ${e.name}</option>`).join('');
  NEWCAL = { eq_id: '', result: 'Pass', standard: '', nextDate: '', notes: '' }; window.NEWCAL = NEWCAL;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('cal')}</div><div><h2>Record Calibration</h2><div class="did">Log a calibration result & update due date</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Calibration Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Equipment</span><select id="cal_eq" onchange="window.NEWCAL.eq_id=this.value"><option value="">Select equipment…</option>${eqOpts}</select></label>
      <label class="fld"><span>Result</span><select id="cal_result" onchange="window.NEWCAL.result=this.value"><option>Pass</option><option>Fail</option><option>Limited</option></select></label>
      <label class="fld"><span>Standard</span><input id="cal_std" placeholder="e.g. IEC 61223" oninput="window.NEWCAL.standard=this.value"></label>
      <label class="fld"><span>Next Calibration Due</span><input id="cal_next" type="date" onchange="window.NEWCAL.nextDate=this.value"></label>
      <label class="fld"><span>Notes</span><textarea id="cal_notes" rows="2" placeholder="Test conditions, deviations…" oninput="window.NEWCAL.notes=this.value"></textarea></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitCalibration()">${icon('check')}Save Calibration</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openRecordCalibration = openRecordCalibration;

async function submitCalibration() {
  if (!window.NEWCAL.eq_id) { toast('Select equipment to calibrate'); return; }
  const e = EQMAP[window.NEWCAL.eq_id];
  const nextDue = window.NEWCAL.nextDate || new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  const ok = await updateEquipment(e.id, { cal_due: nextDue, status: window.NEWCAL.result === 'Fail' ? 'outofsvc' : e.status });
  if (!ok) { toast('Failed to save calibration — ' + LAST_DB_ERROR); return; }
  e.cal_due = nextDue;
  if (window.NEWCAL.result === 'Fail') e.status = 'outofsvc';
  closeDrawer();
  if (CURRENT === 'calibration') go('calibration');
  toast('Calibration recorded for ' + e.tag + ' — next due ' + fmtDate(nextDue));
  addAuditLog('K. Haddad', 'Recorded calibration for ' + e.tag + ' — ' + window.NEWCAL.result, 'ok');
}
window.submitCalibration = submitCalibration;

/* ================= WORKFLOW FORMS ================= */
let NEWWF = {};
function openNewWorkflow() {
  NEWWF = { name: '', states: [] }; window.NEWWF = NEWWF;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('settings')}</div><div><h2>New Workflow</h2><div class="did">Create a blank state machine</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Workflow Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Workflow Name</span><input id="wf_name" placeholder="e.g. Asset Decommissioning" oninput="window.NEWWF.name=this.value"></label>
      <label class="fld"><span>Initial States (comma-separated)</span><input id="wf_states" placeholder="e.g. Requested, Approved, Disposed" oninput="window.NEWWF.states=this.value.split(',').map(s=>s.trim()).filter(Boolean)"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitWorkflow()">${icon('check')}Create Workflow</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openNewWorkflow = openNewWorkflow;

async function submitWorkflow() {
  if (!window.NEWWF.name) { toast('Enter a workflow name'); return; }
  const id = nextSequentialId('wf', WORKFLOWS, 1, 0);
  const wf = { id, name: window.NEWWF.name, states: window.NEWWF.states.length ? window.NEWWF.states : ['New', 'In Progress', 'Done'] };
  const ok = await addWorkflow(wf);
  if (!ok) { toast('Failed to create workflow — ' + LAST_DB_ERROR); return; }
  WORKFLOWS.push(wf);
  SELWF = id;
  closeDrawer();
  go('workflows');
  toast('Workflow "' + window.NEWWF.name + '" created');
  addAuditLog('Admin', 'Created workflow ' + window.NEWWF.name, 'info');
}
window.submitWorkflow = submitWorkflow;

let NEWTRANS = {};
function openAddTransition(wfId) {
  const wf = WORKFLOWS.find(w => w.id === wfId);
  const states = wf.states || [];
  const stateOpts = states.map(s => `<option>${s}</option>`).join('');
  NEWTRANS = { workflow_id: wfId, from_state: states[0] || '', action: '', to_state: states[states.length - 1] || '', sla: '—', seq: WFTRANS.filter(t => t.workflow_id === wfId).length }; window.NEWTRANS = NEWTRANS;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('dash')}</div><div><h2>Add Transition</h2><div class="did">Define a state transition for ${wf.name}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Transition Rule</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>From State</span><select id="tr_from" onchange="window.NEWTRANS.from_state=this.value">${stateOpts}</select></label>
      <label class="fld"><span>Action</span><input id="tr_action" placeholder="e.g. Approve, Reject, Assign" oninput="window.NEWTRANS.action=this.value"></label>
      <label class="fld"><span>To State</span><select id="tr_to" onchange="window.NEWTRANS.to_state=this.value">${stateOpts}</select></label>
      <label class="fld"><span>SLA Effect</span><input id="tr_sla" placeholder="e.g. Pauses SLA, Resets SLA" oninput="window.NEWTRANS.sla=this.value"></label>
      <label class="chk-supr"><input type="checkbox" onchange="window.NEWTRANS.approval=this.checked"> Requires approval</label>
      <label class="chk-supr"><input type="checkbox" onchange="window.NEWTRANS.notify=this.checked"> Send notification</label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitTransition()">${icon('check')}Add Transition</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddTransition = openAddTransition;

async function submitTransition() {
  if (!window.NEWTRANS.action) { toast('Enter an action name'); return; }
  const trans = {
    workflow_id: window.NEWTRANS.workflow_id, from_state: window.NEWTRANS.from_state, action: window.NEWTRANS.action,
    to_state: window.NEWTRANS.to_state, cond: [], approval: !!window.NEWTRANS.approval, notify: !!window.NEWTRANS.notify,
    sla: window.NEWTRANS.sla || '—', seq: window.NEWTRANS.seq,
  };
  const ok = await addWorkflowTransition(trans);
  if (!ok) { toast('Failed to add transition — ' + LAST_DB_ERROR); return; }
  WFTRANS.push(trans);
  closeDrawer();
  go('workflows');
  toast('Transition "' + window.NEWTRANS.action + '" added');
  addAuditLog('Admin', 'Added workflow transition ' + window.NEWTRANS.action, 'info');
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
  const newId = nextSequentialId('role', ROLES, 1, 0);
  const newName = r.name + ' (Copy)';
  const ok = await addRoleToDB({ id: newId, name: newName, description: r.description, users: 0, scope: r.scope, system: false });
  if (!ok) { toast('Failed to duplicate role — ' + LAST_DB_ERROR); return; }
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
  const drOk = await deleteRole(rid);
  if (!drOk) { toast('Failed to delete role — ' + LAST_DB_ERROR); return; }
  const idx = ROLES.findIndex(x => x.id === rid);
  if (idx >= 0) ROLES.splice(idx, 1);
  delete PERMS[rid];
  SELROLE = ROLES[0] ? ROLES[0].id : '';
  go('roles');
  toast('Role "' + r.name + '" deleted');
  addAuditLog('Admin', 'Deleted role ' + r.name, 'warn');
}
window.deleteRolePerm = deleteRolePerm;

/* ============================================================
   VIEW: USERS & ACCESS
   ============================================================ */
VIEWS.users = async function () {
  const active = USERS.filter(u => u.status === 'active').length;
  return `
  <div class="page-head"><div><h1>Users & Access</h1><div class="sub">Accounts, role assignment & data-scope control</div></div>
    <button class="btn btn-primary" onclick="openAddUser()">${icon('users')}Add User</button></div>
  <div class="kpi-row">
    ${[['Total Users', String(USERS.length), '', 'var(--primary)', 'var(--primary-soft)', 'users'], ['Active', String(active), '', 'var(--ok)', 'var(--ok-soft)', 'check'], ['Pending Invites', String(USERS.filter(u => u.status === 'invited').length), '', 'var(--warn)', 'var(--warn-soft)', 'clock'], ['Roles Defined', String(ROLES.length), '', 'var(--info)', 'var(--info-soft)', 'shield']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}</div></div>`).join('')}
  </div>
  <div class="card"><div class="card-head"><h3>User Directory</h3><span class="hint">${USERS.length} accounts</span></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>User</th><th>Role</th><th>Data Scope</th><th>MFA</th><th>Status</th><th>Last Active</th><th></th></tr></thead>
    <tbody>${USERS.map(u => {
      const st = USTAT[u.status] || { l: u.status || '—', c: 'p-muted' };
      const initials = (u.name || '?').split(' ').map(x => x[0] || '').slice(0, 2).join('') || '?';
      return `<tr>
      <td><div class="cellflex"><div class="avatar" style="background:linear-gradient(135deg,var(--primary),var(--primary-700))">${initials}</div><div><div class="strong">${u.name || '—'}</div><div class="sub2 mono">${u.email || '—'}</div></div></div></td>
      <td>${u.role || '—'}</td><td class="sub2" style="margin:0">${u.scope || '—'}</td>
      <td>${u.mfa ? '<span class="pill p-ok">Enabled</span>' : '<span class="pill p-muted">Off</span>'}</td>
      <td><span class="pill ${st.c}">${st.l}</span></td>
      <td class="sub2">${u.last_active || '—'}</td>
      <td><div style="display:flex;gap:4px"><button class="btn btn-ghost" style="height:30px;padding:0 8px;font-size:12px" onclick="resetUserPassword('${u.id}')">Reset</button><button class="btn btn-ghost" style="height:30px;padding:0 8px;font-size:12px" onclick="openEditScope('${u.id}')">Scope</button>${u.status !== 'disabled' ? `<button class="btn btn-ghost" style="height:30px;padding:0 8px;font-size:12px;color:var(--crit)" onclick="suspendUser('${u.id}')">Suspend</button>` : ''}</div></td></tr>`;
    }).join('')}</tbody>
  </table></div></div>`;
};

let NEWUSER = {};
function openAddUser() {
  NEWUSER = { role: ROLES[0] ? ROLES[0].name : '', scope: 'Main Campus', mfa: true }; window.NEWUSER = NEWUSER;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('users')}</div><div><h2>Add User</h2><div class="did">Create an account & send invite email</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Account Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Full name</span><input id="nu_name" placeholder="e.g. Jamil Rahme" oninput="window.NEWUSER.name=this.value"></label>
      <label class="fld"><span>Email</span><input id="nu_email" type="email" placeholder="name@hospital.org" oninput="window.NEWUSER.email=this.value"></label>
      <label class="fld"><span>Role</span><select id="nu_role" onchange="window.NEWUSER.role=this.value">${ROLES.map(r => `<option>${r.name}</option>`).join('')}</select></label>
      <label class="fld"><span>Data scope</span><select id="nu_scope" onchange="window.NEWUSER.scope=this.value"><option>Main Campus</option><option>All Hospitals</option><option>ICU</option><option>Radiology</option><option>Operating Room</option><option>Facilities</option><option>Central Store</option><option>Assigned WOs only</option></select></label>
      <label class="fld"><span>Temporary Password</span><input id="nu_pass" type="text" placeholder="Temp password (user will change on first login)" oninput="window.NEWUSER.password=this.value"></label>
      <label class="chk-supr"><input type="checkbox" checked onchange="window.NEWUSER.mfa=this.checked"> Require multi-factor authentication</label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitUser()">${icon('check')}Create & Send Invite</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddUser = openAddUser;

async function submitUser() {
  if (!window.NEWUSER.name || !window.NEWUSER.email) { toast('Enter a name and email'); return; }
  if (!window.NEWUSER.password) { toast('Enter a temporary password'); return; }
  const id = nextSequentialId('U', USERS, 1, 3);
  const u = { id, name: window.NEWUSER.name, email: window.NEWUSER.email, role: window.NEWUSER.role, scope: window.NEWUSER.scope || 'Main Campus', status: 'invited', last_active: '—', mfa: window.NEWUSER.mfa !== false, must_change_password: true };
  const ok = await addUser(u);
  if (!ok) { toast('Failed to create user — ' + LAST_DB_ERROR); return; }
  USERS.push(u);
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;
  const headers = { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' };
  try {
    const resp = await fetch(apiUrl, {
      method: 'POST', headers,
      body: JSON.stringify({ action: 'create-user', email: u.email, password: window.NEWUSER.password, name: u.name, role: u.role, scope: u.scope, mfa: u.mfa, userId: id }),
    });
    if (!resp.ok) { const e = await resp.text(); console.error('manage-users failed:', e); toast('User created but invite email may not have sent — ' + e.slice(0, 80)); }
    else { toast('User ' + u.name + ' created — invite email sent'); }
  } catch (e) { console.error('manage-users fetch error:', e); toast('User created but invite email failed to send'); }
  closeDrawer();
  if (CURRENT === 'users') go('users');
  addAuditLog(u.name, 'Created user account ' + id, 'info');
}
window.submitUser = submitUser;

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
  const usOk = await updateUser(uid, { scope });
  if (!usOk) { toast('Failed to update scope — ' + LAST_DB_ERROR); return; }
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
  const suOk = await updateUser(uid, { status: 'disabled' });
  if (!suOk) { toast('Failed to suspend user — ' + LAST_DB_ERROR); return; }
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

let PART_REQ_WO_ID = null;
function requestPartToWO(id) {
  const w = WOMAP[id];
  if (!w) return;
  PART_REQ_WO_ID = id;
  const partOpts = PARTS.map(p => `<option value="${p.id}">${p.name} — ${p.id} (stock: ${p.qty})</option>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--info-soft);color:var(--info)">${icon('parts')}</div><div><h2>Request Part</h2><div class="did">${w.id} · ${w.title}</div></div></div><button class="icon-btn close" onclick="openWO('${id}')">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Part Request Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Part</span><select id="pr_part">${partOpts}</select></label>
      <label class="fld"><span>Quantity</span><input id="pr_qty" type="number" min="1" value="1" onchange="window.PR_QTY=Number(this.value)"></label>
      <label class="fld"><span>Reason / Justification</span><textarea id="pr_reason" rows="2" placeholder="e.g. Defective sensor requires replacement" oninput="window.PR_REASON=this.value"></textarea></label>
      <label class="fld"><span>Requested By</span><input id="pr_by" value="${w.assignee !== 'Unassigned' ? w.assignee : 'Dr. Rana Aoun'}" oninput="window.PR_BY=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitPartRequest()">${icon('check')}Submit Request</button><button class="btn btn-ghost" onclick="openWO('${id}')">Cancel</button></div>
  </div></div>`);
  window.PR_QTY = 1; window.PR_REASON = ''; window.PR_BY = w.assignee !== 'Unassigned' ? w.assignee : 'Dr. Rana Aoun';
}
window.requestPartToWO = requestPartToWO;

async function submitPartRequest() {
  const woId = PART_REQ_WO_ID;
  if (!woId) return;
  const partId = document.getElementById('pr_part').value;
  const qty = window.PR_QTY || 1;
  const reason = window.PR_REASON || '';
  const requestedBy = window.PR_BY || 'Admin';
  const p = PARTS.find(x => x.id === partId);
  if (!p) { toast('Select a part'); return; }
  if (qty > p.qty) { toast('Insufficient stock — only ' + p.qty + ' available'); return; }
  const ok = await addPartRequest({ work_order_id: woId, part_id: partId, quantity: qty, requested_by: requestedBy, reason, status: 'Requested' });
  if (!ok) { toast('Failed to submit request — ' + LAST_DB_ERROR); return; }
  const woOk = await updateWorkOrder(woId, { status: 'awaitparts' });
  if (!woOk) { toast('Failed to update work order — ' + LAST_DB_ERROR); return; }
  const w = WOMAP[woId];
  if (w) w.status = 'awaitparts';
  const eqOk = await updatePart(partId, { qty: Math.max(0, p.qty - qty) });
  if (eqOk) p.qty = Math.max(0, p.qty - qty);
  PART_REQUESTS.unshift({ work_order_id: woId, part_id: partId, part_name: p.name, quantity: qty, requested_by: requestedBy, reason, status: 'Requested', created_at: new Date().toISOString() });
  await fireNotification(woId, 'Part Requested', `${p.name} (×${qty}) requested for ${woId}${reason ? ' — ' + reason : ''}`, 'warn', 'Store / Management');
  await fireEmail(woId, 'store@cedarridge.org', 'Store Manager', `Part Request — ${woId}`, `${p.name} (×${qty}) has been requested for work order ${woId}.\n\nReason: ${reason || '—'}\nRequested by: ${requestedBy}\nRemaining stock: ${p.qty}`);
  await fireEmail(woId, 'management@cedarridge.org', 'Management', `Part Request Notification — ${woId}`, `A part request was submitted:\n\nWork Order: ${woId}\nPart: ${p.name} (×${qty})\nReason: ${reason || '—'}\nRequested by: ${requestedBy}`);
  toast('Part request submitted — ' + p.name + ' ×' + qty);
  addAuditLog(requestedBy, 'Requested part ' + p.name + ' ×' + qty + ' for ' + woId, 'warn');
  openWO(woId);
}
window.submitPartRequest = submitPartRequest;

let ESC_WO_ID = null;
function escalateWO(id) {
  const w = WOMAP[id];
  if (!w) return;
  ESC_WO_ID = id;
  const groupOpts = ESC_GROUPS.length
    ? ESC_GROUPS.map(g => { const mc = ESC_MEMBERS.filter(m => m.group_id === g.id).length; return `<option value="${g.id}">${g.name} (${mc} member${mc === 1 ? '' : 's'})</option>`; }).join('')
    : '<option value="">No groups configured</option>';
  const memberPreview = ESC_GROUPS.length
    ? ESC_GROUPS.map(g => {
        const members = ESC_MEMBERS.filter(m => m.group_id === g.id).map(m => USERS.find(u => u.id === m.user_id)).filter(Boolean);
        return `<div style="font-size:12px;color:var(--text-3);margin-top:4px" id="esc_preview_${g.id}" style="display:none">${members.length ? members.map(m => m.name).join(', ') : 'No members assigned'}</div>`;
      }).join('')
    : '';
  const priOpts = ['P1', 'P2', 'P3'].map(p => `<option ${p === w.pri ? 'selected' : ''}>${p}</option>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--crit-soft);color:var(--crit)">${icon('up')}</div><div><h2>Escalate Work Order</h2><div class="did">${w.id} · ${w.title}</div></div></div><button class="icon-btn close" onclick="openWO('${id}')">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Escalation Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Reason for Escalation</span><textarea id="esc_reason" rows="3" placeholder="e.g. SLA at risk, parts unavailable, requires vendor intervention" oninput="window.ESC_REASON=this.value"></textarea></label>
      <label class="fld"><span>Escalate To</span><select id="esc_dest" onchange="updateEscPreview()">${groupOpts}</select></label>
      <div id="esc_member_preview" style="font-size:12px;color:var(--text-3);padding:0 2px"></div>
      <label class="fld"><span>New Priority</span><select id="esc_pri">${priOpts}</select></label>
      <label class="fld"><span>Escalated By</span><input id="esc_by" value="Dr. Rana Aoun" oninput="window.ESC_BY=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" style="background:var(--crit)" onclick="submitEscalation()">${icon('up')}Escalate Now</button><button class="btn btn-ghost" onclick="openWO('${id}')">Cancel</button></div>
  </div></div>`);
  window.ESC_REASON = '';
  setTimeout(() => updateEscPreview(), 50);
}
window.escalateWO = escalateWO;

function updateEscPreview() {
  const sel = document.getElementById('esc_dest');
  if (!sel) return;
  const gid = sel.value;
  const members = ESC_MEMBERS.filter(m => m.group_id === gid).map(m => USERS.find(u => u.id === m.user_id)).filter(Boolean);
  const preview = document.getElementById('esc_member_preview');
  if (preview) {
    const grp = ESC_GROUPS.find(g => g.id === gid);
    preview.innerHTML = members.length
      ? `<span style="color:var(--text-2)">Notifies:</span> ${members.map(m => m.name).join(', ')}${grp && grp.email ? ` + ${grp.email}` : ''}`
      : `<span style="color:var(--warn)">No members in this group — nobody will be notified</span>${grp && grp.email ? ` (group email: ${grp.email})` : ''}`;
  }
}
window.updateEscPreview = updateEscPreview;

async function submitEscalation() {
  const woId = ESC_WO_ID;
  if (!woId) return;
  const reason = window.ESC_REASON || '';
  if (!reason) { toast('Enter a reason for escalation'); return; }
  const groupId = document.getElementById('esc_dest').value;
  if (!groupId) { toast('Select an escalation group'); return; }
  const grp = ESC_GROUPS.find(g => g.id === groupId);
  if (!grp) { toast('Escalation group not found'); return; }
  const priority = document.getElementById('esc_pri').value;
  const escalatedBy = window.ESC_BY || 'Dr. Rana Aoun';
  const ok = await addEscalation({ work_order_id: woId, reason, destination: grp.name, group_id: groupId, priority, escalated_by: escalatedBy, status: 'Open' });
  if (!ok) { toast('Failed to escalate — ' + LAST_DB_ERROR); return; }
  const woOk = await updateWorkOrder(woId, { pri: priority, sla: 'At risk' });
  if (woOk) { const w = WOMAP[woId]; if (w) { w.pri = priority; w.sla = 'At risk'; } }
  ESCALATIONS.unshift({ work_order_id: woId, reason, destination: grp.name, group_id: groupId, priority, escalated_by: escalatedBy, status: 'Open', created_at: new Date().toISOString() });
  const members = ESC_MEMBERS.filter(m => m.group_id === groupId).map(m => USERS.find(u => u.id === m.user_id)).filter(Boolean);
  await fireNotification(woId, 'Work Order Escalated', `${woId} escalated to ${grp.name} — ${reason}`, 'crit', grp.name);
  for (const m of members) {
    await fireNotification(woId, 'Escalation Assigned to You', `${woId} escalated to ${grp.name} requires your attention — ${reason}`, 'crit', m.name);
  }
  const emailRecipients = members.length ? members : [{ name: grp.name, email: grp.email }];
  for (const r of emailRecipients) {
    if (r.email) {
      await fireEmail(woId, r.email, r.name, `Escalation — ${woId}`, `Work order ${woId} has been escalated to ${grp.name}.\n\nReason: ${reason}\nEscalated to: ${grp.name}\nNew priority: ${priority}\nEscalated by: ${escalatedBy}`);
    }
  }
  if (grp.email && !members.length) {
    await fireEmail(woId, grp.email, grp.name, `Escalation — ${woId}`, `Work order ${woId} has been escalated.\n\nReason: ${reason}\nEscalated to: ${grp.name}\nNew priority: ${priority}\nEscalated by: ${escalatedBy}`);
  }
  toast('Work order ' + woId + ' escalated to ' + grp.name + ' — ' + (members.length + (grp.email ? 1 : 0)) + ' recipient(s) notified');
  addAuditLog(escalatedBy, 'Escalated ' + woId + ' to ' + grp.name + ' — ' + reason.slice(0, 40), 'crit');
  openWO(woId);
}
window.submitEscalation = submitEscalation;

/* ================= NOTIFICATION + EMAIL HELPERS ================= */
async function fireNotification(workOrderId, title, message, category, recipient) {
  const ok = await addNotification({ work_order_id: workOrderId || null, title, message, category: category || 'info', recipient: recipient || 'Management', read: false });
  if (ok) {
    NOTIFICATIONS.unshift({ work_order_id: workOrderId || null, title, message, category: category || 'info', recipient: recipient || 'Management', read: false, created_at: new Date().toISOString() });
    await refreshNotifBadge();
  }
  return ok;
}
window.fireNotification = fireNotification;

async function fireEmail(workOrderId, email, name, subject, body) {
  const ok = await addEmailNotification({ work_order_id: workOrderId || null, recipient_email: email, recipient_name: name || '', subject, body, status: 'queued' });
  if (ok) {
    const emailRecord = EMAILS[0];
    EMAILS.unshift({ work_order_id: workOrderId || null, recipient_email: email, recipient_name: name || '', subject, body, status: 'queued', created_at: new Date().toISOString() });
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;
    const headers = {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    };
    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ to: email, toName: name, subject, body, emailId: emailRecord?.id }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        console.error('send-email edge function failed:', resp.status, errText);
      } else {
        if (emailRecord) emailRecord.status = 'sent';
      }
    } catch (e) {
      console.error('send-email fetch error:', e);
    }
  }
  return ok;
}
window.fireEmail = fireEmail;

async function refreshNotifBadge() {
  const unread = NOTIFICATIONS.filter(n => !n.read).length;
  const badge = document.getElementById('notifBadge');
  const dot = document.getElementById('notifDot');
  if (badge) { badge.textContent = String(unread); badge.style.display = unread > 0 ? 'flex' : 'none'; }
  if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
}
window.refreshNotifBadge = refreshNotifBadge;

function openNotifications() {
  const items = NOTIFICATIONS.length ? NOTIFICATIONS.map(n => {
    const cls = n.category === 'crit' ? 'p-crit' : n.category === 'warn' ? 'p-warn' : n.category === 'ok' ? 'p-ok' : 'p-info';
    return `<div class="notif-item ${n.read ? 'read' : ''}" onclick="openNotifDetail('${n.id}')">
      <div class="notif-dot" style="background:${n.read ? 'transparent' : 'var(--primary)'}"></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px"><span class="pill ${cls}" style="font-size:10px;padding:1px 7px">${n.category}</span><b style="font-size:13px">${n.title}</b></div>
        <div class="sub2" style="font-size:12px;margin:0">${n.message}</div>
        <div class="sub2 mono" style="font-size:10px;margin-top:3px">${n.recipient} · ${new Date(n.created_at).toLocaleString('en-GB', { day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit' })}</div>
      </div>
    </div>`;
  }).join('') : '<div class="empty">No notifications</div>';
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('alert')}</div><div><h2>Notifications</h2><div class="did">${NOTIFICATIONS.filter(n=>!n.read).length} unread · ${NOTIFICATIONS.length} total</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec" style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-ghost" onclick="markAllRead()">${icon('check')}Mark all read</button></div>
    <div class="notif-list">${items}</div>
  </div>`);
}
window.openNotifications = openNotifications;

async function markAllRead() {
  const ok = await markAllNotificationsRead();
  if (!ok) { toast('Failed — ' + LAST_DB_ERROR); return; }
  NOTIFICATIONS.forEach(n => n.read = true);
  await refreshNotifBadge();
  openNotifications();
  toast('All notifications marked read');
}
window.markAllRead = markAllRead;

async function openNotifDetail(id) {
  const n = NOTIFICATIONS.find(x => x.id === id);
  if (!n) return;
  if (!n.read) {
    const ok = await markNotificationRead(id);
    if (ok) { n.read = true; await refreshNotifBadge(); }
  }
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('alert')}</div><div><h2>${n.title}</h2><div class="did">${n.recipient}</div></div></div><button class="icon-btn close" onclick="openNotifications()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec">
    <p style="font-size:14px;line-height:1.6;color:var(--text-2)">${n.message}</p>
    <div class="kv-grid" style="margin-top:14px">
      <div class="kv-item"><div class="k">Category</div><div class="v">${n.category}</div></div>
      <div class="kv-item"><div class="k">Recipient</div><div class="v">${n.recipient}</div></div>
      <div class="kv-item"><div class="k">Time</div><div class="v mono">${new Date(n.created_at).toLocaleString('en-GB')}</div></div>
      <div class="kv-item"><div class="k">Work Order</div><div class="v mono">${n.work_order_id || '—'}</div></div>
    </div>
    ${n.work_order_id ? `<div style="margin-top:14px"><button class="btn btn-primary" onclick="closeDrawer();openWO('${n.work_order_id}')">${icon('wo')}Open Work Order</button></div>` : ''}
  </div></div>`);
}
window.openNotifDetail = openNotifDetail;

/* ================= SERVICE REQUEST: CONVERT TO WO ================= */
async function convertSRToWO(srId) {
  const sr = SR_DATA.find(r => r.id === srId);
  if (!sr) return;
  const id = nextSequentialId('WO', WORKORDERS, 24830, 5);
  const now = new Date();
  const openedStr = `${now.getDate().toString().padStart(2,'0')} ${now.toLocaleDateString('en-GB',{month:'short'})} ${now.getFullYear()}`;
  const dueDate = openedStr;
  const wo = {
    id, eq_id: sr.eq_id, title: sr.description.slice(0, 60), type: 'Corrective',
    pri: sr.urg === 'High' ? 'P2' : sr.urg === 'Medium' ? 'P3' : 'P4',
    status: 'triaged', assignee: 'Unassigned', team: 'Biomedical',
    opened: openedStr, due: dueDate, sla: 'On track', sla_pct: 0, step: 1, notes: '',
    requestor: sr.by || null,
  };
  const ok = await addWorkOrder(wo);
  if (!ok) { toast('Failed to convert request — ' + LAST_DB_ERROR); return; }
  WORKORDERS.unshift(wo);
  WOMAP[wo.id] = wo;
  const srOk = await updateServiceRequest(srId, { usable: 'Converted' });
  if (!srOk) { toast('Failed to update request — ' + LAST_DB_ERROR); return; }
  sr.usable = 'Converted';
  if (CURRENT === 'requests') go('requests');
  toast('Converted ' + srId + ' to work order ' + id + ' — assign a technician to proceed');
  addAuditLog('Dr. Rana Aoun', 'Converted service request ' + srId + ' to work order ' + id, 'info');
  openWO(id);
}
window.convertSRToWO = convertSRToWO;

/* ================= PARTS: ADD, ISSUE & REORDER ================= */
function openPart(id) {
  const p = PARTS.find(x => x.id === id);
  if (!p) { toast('Part not found'); return; }
  const pct = p.max_qty > 0 ? Math.min(100, Math.round(p.qty / p.max_qty * 100)) : 0;
  const status = p.qty === 0 ? ['Stockout', 'p-crit'] : p.qty < p.min_qty ? ['Reorder', 'p-warn'] : ['In Stock', 'p-ok'];
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('parts')}</div><div><h2>${p.name}</h2><div class="did">${p.id} · ${p.mfr || 'Generic'}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body">
    <div class="dsec" style="display:flex;gap:8px;flex-wrap:wrap"><span class="pill ${status[1]}">${status[0]}</span>${p.crit ? '<span class="pill p-crit">Critical spare</span>' : ''}<span class="pill p-muted">${p.cat || 'Other'}</span></div>
    <div class="dsec"><h4>Inventory Status</h4><div class="kv-grid">
      <div class="kv-item"><div class="k">On Hand</div><div class="v">${p.qty} units</div></div>
      <div class="kv-item"><div class="k">Minimum Level</div><div class="v">${p.min_qty} units</div></div>
      <div class="kv-item"><div class="k">Maximum Level</div><div class="v">${p.max_qty} units</div></div>
      <div class="kv-item"><div class="k">Unit Cost</div><div class="v mono">${Number(p.cost || 0).toFixed(2)}</div></div>
      <div class="kv-item"><div class="k">Bin Location</div><div class="v mono">${p.bin || '—'}</div></div>
      <div class="kv-item"><div class="k">Manufacturer</div><div class="v">${p.mfr || 'Generic'}</div></div>
    </div>
    <div style="margin-top:16px"><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-2);margin-bottom:6px"><span>Stock capacity</span><b>${pct}%</b></div><div class="meter" style="height:9px"><i style="width:${pct}%;background:${p.qty === 0 ? 'var(--crit)' : p.qty < p.min_qty ? 'var(--warn)' : 'var(--ok)'}"></i></div></div></div>
    <div class="dsec"><div style="display:flex;gap:9px;flex-wrap:wrap"><button class="btn btn-primary" onclick="closeDrawer();openIssuePartFor('${p.id}')">${icon('arrowr')}Issue This Part</button><button class="btn btn-ghost" onclick="closeDrawer()">Close</button></div></div>
  </div>`);
}
window.openPart = openPart;

function openIssuePartFor(id) {
  openIssuePart();
  const select = document.getElementById('ip_part');
  if (select) select.value = id;
}
window.openIssuePartFor = openIssuePartFor;

function openAddPart() {
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('parts')}</div><div><h2>Add Spare Part</h2><div class="did">Create a new inventory item</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Part Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Part Name</span><input id="np_name" placeholder="e.g. Infusion Pump Battery Module" oninput="window.NP_NAME=this.value"></label>
      <label class="fld"><span>Part ID / SKU</span><input id="np_id" placeholder="e.g. P-0099" oninput="window.NP_ID=this.value"></label>
      <label class="fld"><span>Manufacturer</span><input id="np_mfr" placeholder="e.g. Baxter" oninput="window.NP_MFR=this.value"></label>
      <label class="fld"><span>Category</span><select id="np_cat" onchange="window.NP_CAT=this.value"><option>Electrical</option><option>Mechanical</option><option>Pneumatic</option><option>Electronic</option><option>Consumable</option><option>Sensor</option><option>Filter</option><option>Other</option></select></label>
      <label class="fld"><span>Bin Location</span><input id="np_bin" placeholder="e.g. A-12" oninput="window.NP_BIN=this.value"></label>
      <div style="display:flex;gap:13px">
        <label class="fld" style="flex:1"><span>Quantity</span><input id="np_qty" type="number" min="0" value="0" onchange="window.NP_QTY=Number(this.value)"></label>
        <label class="fld" style="flex:1"><span>Min Qty</span><input id="np_min" type="number" min="0" value="0" onchange="window.NP_MIN=Number(this.value)"></label>
        <label class="fld" style="flex:1"><span>Max Qty</span><input id="np_max" type="number" min="0" value="0" onchange="window.NP_MAX=Number(this.value)"></label>
      </div>
      <label class="fld"><span>Unit Cost ($)</span><input id="np_cost" type="number" min="0" step="0.01" value="0" onchange="window.NP_COST=Number(this.value)"></label>
      <label class="chk-supr"><input type="checkbox" id="np_crit" onchange="window.NP_CRIT=this.checked"> Critical spare (essential for life-support equipment)</label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitAddPart()">${icon('check')}Create Part</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
  window.NP_NAME=''; window.NP_ID=''; window.NP_MFR=''; window.NP_CAT='Electrical'; window.NP_BIN=''; window.NP_QTY=0; window.NP_MIN=0; window.NP_MAX=0; window.NP_COST=0; window.NP_CRIT=false;
}
window.openAddPart = openAddPart;

async function submitAddPart() {
  const name = window.NP_NAME;
  const id = window.NP_ID;
  if (!name || !id) { toast('Enter a part name and ID'); return; }
  if (PARTS.find(p => p.id === id)) { toast('Part ID already exists'); return; }
  const part = {
    id, name,
    mfr: window.NP_MFR || 'Generic',
    cat: window.NP_CAT || 'Other',
    qty: window.NP_QTY || 0,
    min_qty: window.NP_MIN || 0,
    max_qty: window.NP_MAX || 0,
    bin: window.NP_BIN || '—',
    cost: window.NP_COST || 0,
    crit: window.NP_CRIT || false,
  };
  const ok = await addPart(part);
  if (!ok) { toast('Failed to create part — ' + LAST_DB_ERROR); return; }
  PARTS.push(part);
  closeDrawer();
  if (CURRENT === 'parts') go('parts');
  toast('Part "' + name + '" created');
  addAuditLog('Admin', 'Created spare part ' + id + ' — ' + name, 'info');
}
window.submitAddPart = submitAddPart;

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
  const ok = await updatePart(pid, { qty: p.qty - qty });
  if (!ok) { toast('Failed to issue part — ' + LAST_DB_ERROR); return; }
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
    const ok = await updatePart(p.id, { qty: p.max_qty });
    if (!ok) { toast('Failed to reorder — ' + LAST_DB_ERROR); return; }
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
  const soon = v.exp && (new Date(v.exp) - new Date(TODAY)) / 864e5 <= 60;
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

/* ================= PM SCHEDULE GENERATION ================= */
async function generatePMSchedule() {
  let created = 0;
  for (const plan of PM_PLANS) {
    if (!plan.active) continue;
    const already = PMWO.some(p => p.eq_id === plan.eq_id && p.status !== 'completed' && p.due === plan.next_due);
    if (already) continue;
    const e = EQMAP[plan.eq_id];
    if (!e) continue;
    const woId = nextSequentialId('PM', PMWO, 1, 5);
    const pm = {
      id: woId, eq_id: plan.eq_id,
      title: plan.freq + ' PM — ' + e.name,
      due: plan.next_due, freq: plan.freq,
      status: new Date(plan.next_due) < new Date(TODAY) ? 'overdue' : 'scheduled',
      tpl: plan.tpl, team: plan.team,
    };
    const ok = await addPMWorkOrder(pm);
    if (!ok) { toast('Failed to generate PM — ' + LAST_DB_ERROR); return; }
    PMWO.push(pm);
    PMWOMAP[pm.id] = pm;
    const newNext = addInterval(plan.next_due, plan.freq);
    await updatePMPlan(plan.id, { last_generated: TODAY, next_due: newNext });
    plan.last_generated = TODAY;
    plan.next_due = newNext;
    created++;
  }
  if (created === 0) { toast('All PM plans are already up to date'); return; }
  if (CURRENT === 'pm') go('pm');
  toast('Generated ' + created + ' PM work order' + (created > 1 ? 's' : '') + ' from plans');
  addAuditLog('Admin', 'Generated PM schedule — ' + created + ' work orders from plans', 'info');
}
window.generatePMSchedule = generatePMSchedule;

/* ================= PM REMINDER NOTIFICATIONS ================= */
async function checkPMReminders() {
  let sent = 0;
  for (const pm of PMWO) {
    if (pm.status === 'completed') continue;
    const dueDate = new Date(pm.due);
    const today = new Date(TODAY);
    const daysUntil = Math.round((dueDate - today) / 864e5);
    if (daysUntil === 1) {
      const already = NOTIFICATIONS.some(n => n.title === 'PM Reminder — Tomorrow' && n.message && n.message.includes(pm.id));
      if (already) continue;
      const e = EQMAP[pm.eq_id];
      const tech = pm.team || 'Biomedical';
      const techRecord = TECHS.find(t => t.name === tech);
      const recipient = techRecord ? techRecord.name : 'Technician';
      await fireNotification(pm.id, 'PM Reminder — Tomorrow', `PM ${pm.id} for ${e ? e.tag : ''} (${e ? e.name : ''}) is due tomorrow (${fmtDate(pm.due)}). Please prepare tools and checklist.`, 'warn', recipient);
      const email = techRecord ? techRecord.name.toLowerCase().replace(/ /g, '.') + '@cedarridge.org' : 'biomedical@cedarridge.org';
      await fireEmail(pm.id, email, recipient, `PM Reminder — ${pm.id} due tomorrow`, `This is a reminder that PM work order ${pm.id} is due tomorrow.\n\nEquipment: ${e ? e.tag + ' — ' + e.name : '—'}\nDue: ${fmtDate(pm.due)}\nFrequency: ${pm.freq}\n\nPlease review the checklist and prepare for the maintenance visit.`);
      sent++;
    }
  }
  if (sent > 0) {
    addAuditLog('System', 'Sent ' + sent + ' PM reminder notification' + (sent > 1 ? 's' : '') + ' for tomorrow', 'info');
  }
}
window.checkPMReminders = checkPMReminders;

/* ================= PM PLAN MANAGEMENT ================= */
function openPMPlans() {
  renderPMPlansList();
}
window.openPMPlans = openPMPlans;

function renderPMPlansList() {
  const planRows = PM_PLANS.map(p => {
    const e = EQMAP[p.eq_id];
    const tpl = getTemplate(p.tpl);
    const tplName = tpl ? tpl.title || p.tpl : p.tpl;
    const tech = p.technician || 'Unassigned';
    const nextDue = p.next_due || p.start_date;
    const dueStatus = new Date(nextDue) < new Date(TODAY) ? '<span class="pill p-crit">Overdue</span>' : new Date(nextDue) <= new Date(TODAY + 864e5 * 7) ? '<span class="pill p-warn">Due soon</span>' : '<span class="pill p-info">Scheduled</span>';
    return `<tr>
      <td><div class="strong">${p.name}</div><div class="sub2 mono">${p.id}</div></td>
      <td>${e ? `<div class="cellflex"><div class="eq-ic">${icon(e.ic)}</div><div><div style="font-weight:500">${e.tag}</div><div class="sub2">${e.dept}</div></div></div>` : '<span class="sub2">—</span>'}</td>
      <td class="sub2">${tplName}</td>
      <td><span class="pill p-muted">${p.freq}</span></td>
      <td>${tech === 'Unassigned' ? '<span class="sub2">Unassigned</span>' : `<div class="cellflex"><div class="avatar" style="width:24px;height:24px;font-size:10px">${tech.split(' ').map(w => w[0]).join('')}</div><span>${tech}</span></div>`}</td>
      <td class="mono" style="font-size:12px">${fmtDate(nextDue)}</td>
      <td>${dueStatus}</td>
      <td>
        <button class="btn btn-ghost" style="height:32px;font-size:12px" onclick="generateFromPlan('${p.id}')">Generate WO</button>
        <button class="btn btn-ghost" style="height:32px;font-size:12px;color:var(--crit)" onclick="deletePMPlanConfirm('${p.id}')">Delete</button>
      </td>
    </tr>`;
  }).join('');

  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('pm')}</div><div><h2>PM Plans</h2><div class="did">Create and manage preventive maintenance plans with checklists, schedules & technician assignments</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body">
    <div class="dsec"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <h4>Active Plans (${PM_PLANS.length})</h4>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" style="height:34px" onclick="openPMTemplateManager()">${icon('list')}Checklist Templates</button>
        <button class="btn btn-primary" style="height:34px" onclick="openNewPMPlan()">${icon('dash')}Create PM Plan</button>
      </div>
    </div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Plan Name</th><th>Equipment</th><th>Checklist</th><th>Frequency</th><th>Technician</th><th>Next Due</th><th>Status</th><th></th></tr></thead>
      <tbody>${planRows || '<tr><td colspan="8" class="sub2" style="text-align:center;padding:20px">No PM plans yet — click "Create PM Plan" to define one</td></tr>'}</tbody></table></div>
    </div>
  </div>`);
}

let NEWPMP = {};
function openNewPMPlan() {
  NEWPMP = { name: '', eq_id: '', tpl: 'generic', freq: 'Quarterly', technician: 'Unassigned', team: 'Biomedical', start_date: TODAY }; window.NEWPMP = NEWPMP;
  const eqOpts = EQUIP.map(e => `<option value="${e.id}">${e.tag} — ${e.name} (${e.dept})</option>`).join('');
  const tplOpts = buildTemplateOptions('generic');
  const techOpts = ['Unassigned', ...TECHS.map(t => t.name)].map(n => `<option ${n === 'Unassigned' ? 'selected' : ''}>${n}</option>`).join('');
  const teamOpts = ['Biomedical', 'Imaging', 'Facilities', 'Vendor'].map(t => `<option ${t === 'Biomedical' ? 'selected' : ''}>${t}</option>`).join('');
  const freqOpts = ['Weekly', 'Monthly', 'Quarterly', 'Semi-annual', 'Annual'].map(f => `<option ${f === 'Quarterly' ? 'selected' : ''}>${f}</option>`).join('');

  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('pm')}</div><div><h2>Create PM Plan</h2><div class="did">Define a recurring preventive maintenance plan</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Plan Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Plan Name</span><input id="pmp_name" placeholder="e.g. Ventilator Quarterly PM — ICU" oninput="window.NEWPMP.name=this.value"></label>
      <label class="fld"><span>Equipment</span><select id="pmp_eq" onchange="window.NEWPMP.eq_id=this.value"><option value="">Select equipment…</option>${eqOpts}</select></label>
      <label class="fld"><span>Checklist Template</span><select id="pmp_tpl" onchange="window.NEWPMP.tpl=this.value">${tplOpts}</select></label>
      <div style="display:flex;gap:13px">
        <label class="fld" style="flex:1"><span>Frequency</span><select id="pmp_freq" onchange="window.NEWPMP.freq=this.value">${freqOpts}</select></label>
        <label class="fld" style="flex:1"><span>Start Date</span><input id="pmp_start" type="date" value="${TODAY}" onchange="window.NEWPMP.start_date=this.value"></label>
      </div>
      <div style="display:flex;gap:13px">
        <label class="fld" style="flex:1"><span>Assigned Technician</span><select id="pmp_tech" onchange="window.NEWPMP.technician=this.value">${techOpts}</select></label>
        <label class="fld" style="flex:1"><span>Team</span><select id="pmp_team" onchange="window.NEWPMP.team=this.value">${teamOpts}</select></label>
      </div>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitPMPlan()">${icon('check')}Create & Schedule Plan</button><button class="btn btn-ghost" onclick="renderPMPlansList()">Back</button></div>
  </div></div>`);
}
window.openNewPMPlan = openNewPMPlan;

async function submitPMPlan() {
  if (!window.NEWPMP.name) { toast('Enter a plan name'); return; }
  if (!window.NEWPMP.eq_id) { toast('Select equipment'); return; }
  const id = nextSequentialId('PMP', PM_PLANS, 1, 4);
  const nextDue = window.NEWPMP.start_date || TODAY;
  const plan = {
    id, name: window.NEWPMP.name, eq_id: window.NEWPMP.eq_id,
    tpl: window.NEWPMP.tpl, freq: window.NEWPMP.freq,
    technician: window.NEWPMP.technician, team: window.NEWPMP.team,
    start_date: window.NEWPMP.start_date, active: true,
    next_due: nextDue,
  };
  const ok = await addPMPlan(plan);
  if (!ok) { toast('Failed to create plan — ' + LAST_DB_ERROR); return; }
  PM_PLANS.push(plan);
  toast('PM plan "' + plan.name + '" created and scheduled');
  addAuditLog('Admin', 'Created PM plan ' + plan.name + ' for ' + (EQMAP[plan.eq_id]?.tag || ''), 'info');
  await generateFromPlan(id, true);
  closeDrawer();
  await refreshAllData();
  go('pm');
  toast('PM plan "' + plan.name + '" created — work order generated and scheduled');
}
window.submitPMPlan = submitPMPlan;

async function generateFromPlan(planId, silent) {
  const plan = PM_PLANS.find(p => p.id === planId);
  if (!plan) return;
  const e = EQMAP[plan.eq_id];
  if (!e) { toast('Equipment not found for this plan'); return; }
  const already = PMWO.some(p => p.eq_id === plan.eq_id && p.status !== 'completed' && p.due === plan.next_due);
  if (already) { if (!silent) toast('A PM work order already exists for this due date'); return; }
  const woId = nextSequentialId('PM', PMWO, 1, 5);
  const pm = {
    id: woId, eq_id: plan.eq_id,
    title: plan.freq + ' PM — ' + e.name,
    due: plan.next_due, freq: plan.freq,
    status: new Date(plan.next_due) < new Date(TODAY) ? 'overdue' : 'scheduled',
    tpl: plan.tpl, team: plan.team,
  };
  const ok = await addPMWorkOrder(pm);
  if (!ok) { if (!silent) toast('Failed to generate work order — ' + LAST_DB_ERROR); return; }
  PMWO.push(pm);
  PMWOMAP[pm.id] = pm;
  const newNext = addInterval(plan.next_due, plan.freq);
  await updatePMPlan(planId, { last_generated: TODAY, next_due: newNext });
  plan.last_generated = TODAY;
  plan.next_due = newNext;
  if (!silent) {
    toast('Generated PM work order ' + woId + ' — due ' + fmtDate(pm.due));
    closeDrawer();
    await refreshAllData();
    if (CURRENT === 'pm') go('pm');
  }
  addAuditLog('Admin', 'Generated PM ' + woId + ' from plan ' + plan.name, 'info');
}
window.generateFromPlan = generateFromPlan;

async function deletePMPlanConfirm(id) {
  const plan = PM_PLANS.find(p => p.id === id);
  if (!plan) return;
  const ok = await deletePMPlan(id);
  if (!ok) { toast('Failed to delete plan — ' + LAST_DB_ERROR); return; }
  const idx = PM_PLANS.findIndex(p => p.id === id);
  if (idx >= 0) PM_PLANS.splice(idx, 1);
  toast('Plan "' + plan.name + '" deleted');
  addAuditLog('Admin', 'Deleted PM plan ' + plan.name, 'warn');
  renderPMPlansList();
}
window.deletePMPlanConfirm = deletePMPlanConfirm;

function openPMTemplateManager() {
  const builtIn = Object.keys(CHECKLISTS).filter(k => k !== 'posttest');
  const customRows = PM_TEMPLATES.map(t => `<tr>
    <td><div class="strong">${t.name}</div><div class="sub2 mono">${t.id}</div></td>
    <td class="sub2">${t.description || '—'}</td>
    <td class="sub2">${(t.sections || []).reduce((s, x) => s + (x.items || []).length, 0)} items</td>
    <td><button class="btn btn-ghost" style="height:32px;font-size:12px" onclick="editPMTemplate('${t.id}')">Edit</button>
        <button class="btn btn-ghost" style="height:32px;font-size:12px;color:var(--crit)" onclick="deletePMTemplate('${t.id}')">Delete</button></td>
  </tr>`).join('');
  const builtInRows = builtIn.map(k => {
    const tpl = CHECKLISTS[k];
    const count = tpl.sections.reduce((s, x) => s + x.items.length, 0);
    return `<tr><td><div class="strong">${k.charAt(0).toUpperCase() + k.slice(1)}</div><div class="sub2">Built-in</div></td>
      <td class="sub2">Standard protocol</td><td class="sub2">${count} items</td>
      <td><span class="pill p-muted">Built-in</span></td></tr>`;
  }).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('pm')}</div><div><h2>PM Checklist Templates</h2><div class="did">Create and manage reusable checklists for preventive maintenance</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body">
    <div class="dsec"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h4>Custom Templates</h4><div style="display:flex;gap:8px"><button class="btn btn-ghost" style="height:34px" onclick="renderPMPlansList()">${icon('arrowr')}Back to Plans</button><button class="btn btn-primary" style="height:34px" onclick="openNewPMTemplate()">${icon('dash')}New Template</button></div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Template</th><th>Description</th><th>Items</th><th></th></tr></thead>
      <tbody>${customRows || '<tr><td colspan="4" class="sub2" style="text-align:center;padding:20px">No custom templates yet — click "New Template" to create one</td></tr>'}</tbody></table></div>
    </div>
    <div class="dsec"><h4>Built-in Templates</h4>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Template</th><th>Description</th><th>Items</th><th></th></tr></thead>
      <tbody>${builtInRows}</tbody></table></div>
    </div>
  </div>`);
}
window.openPMTemplateManager = openPMTemplateManager;

let NEWPMTPL = {};
function openNewPMTemplate() {
  NEWPMTPL = { id: '', name: '', description: '', sections: [{ title: 'Section 1', items: [{ t: 'Check item 1', type: 'check' }] }] }; window.NEWPMTPL = NEWPMTPL;
  renderPMTemplateEditor();
}
window.openNewPMTemplate = openNewPMTemplate;

function renderPMTemplateEditor() {
  const secHTML = window.NEWPMTPL.sections.map((sec, si) => `
    <div class="card" style="margin-bottom:10px;border:1px solid var(--border)">
      <div class="card-pad" style="display:flex;gap:8px;align-items:center;padding:10px 12px">
        <input class="fld" style="flex:1;height:34px" placeholder="Section title" value="${sec.title}" oninput="window.NEWPMTPL.sections[${si}].title=this.value">
        <button class="btn btn-ghost" style="height:34px;color:var(--crit)" onclick="removePMSection(${si})">${icon('x')}</button>
      </div>
      <div class="card-pad" style="padding-top:0">
        ${sec.items.map((it, ii) => `
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
            <select style="width:90px;height:34px" onchange="window.NEWPMTPL.sections[${si}].items[${ii}].type=this.value;renderPMTemplateEditor()">
              <option value="check" ${it.type === 'check' ? 'selected' : ''}>Check</option>
              <option value="reading" ${it.type === 'reading' ? 'selected' : ''}>Reading</option>
            </select>
            <input style="flex:1;height:34px" placeholder="Item description" value="${it.t}" oninput="window.NEWPMTPL.sections[${si}].items[${ii}].t=this.value">
            ${it.type === 'reading' ? `
              <input style="width:60px;height:34px" placeholder="Unit" value="${it.unit || ''}" oninput="window.NEWPMTPL.sections[${si}].items[${ii}].unit=this.value">
              <input style="width:60px;height:34px" type="number" placeholder="Min" value="${it.min ?? ''}" oninput="window.NEWPMTPL.sections[${si}].items[${ii}].min=Number(this.value)">
              <input style="width:60px;height:34px" type="number" placeholder="Max" value="${it.max ?? ''}" oninput="window.NEWPMTPL.sections[${si}].items[${ii}].max=Number(this.value)">
            ` : ''}
            <button class="btn btn-ghost" style="height:34px;color:var(--crit)" onclick="removePMItem(${si},${ii})">${icon('x')}</button>
          </div>`).join('')}
        <button class="btn btn-ghost" style="height:32px;font-size:12px" onclick="addPMItem(${si})">${icon('dash')}Add Item</button>
      </div>
    </div>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('pm')}</div><div><h2>New Checklist Template</h2><div class="did">Build a reusable PM checklist</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body">
    <div class="dsec"><h4>Template Details</h4>
      <div style="display:flex;flex-direction:column;gap:13px">
        <label class="fld"><span>Template Name</span><input id="pmt_name" placeholder="e.g. Ventilator Quarterly PM" oninput="window.NEWPMTPL.name=this.value"></label>
        <label class="fld"><span>Description</span><input id="pmt_desc" placeholder="When to use this checklist" oninput="window.NEWPMTPL.description=this.value"></label>
      </div>
    </div>
    <div class="dsec"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h4>Sections & Items</h4><button class="btn btn-ghost" style="height:34px" onclick="addPMSection()">${icon('dash')}Add Section</button></div>
      <div id="pmt_sections">${secHTML}</div>
    </div>
    <div style="display:flex;gap:9px;margin-top:14px"><button class="btn btn-primary" onclick="submitPMTemplate()">${icon('check')}Save Template</button><button class="btn btn-ghost" onclick="openPMPlans()">Back</button></div>
  </div>`);
}

function addPMSection() {
  window.NEWPMTPL.sections.push({ title: 'New Section', items: [{ t: 'New check item', type: 'check' }] });
  renderPMTemplateEditor();
}
window.addPMSection = addPMSection;

function removePMSection(si) {
  window.NEWPMTPL.sections.splice(si, 1);
  if (window.NEWPMTPL.sections.length === 0) window.NEWPMTPL.sections.push({ title: 'Section 1', items: [] });
  renderPMTemplateEditor();
}
window.removePMSection = removePMSection;

function addPMItem(si) {
  window.NEWPMTPL.sections[si].items.push({ t: 'New item', type: 'check' });
  renderPMTemplateEditor();
}
window.addPMItem = addPMItem;

function removePMItem(si, ii) {
  window.NEWPMTPL.sections[si].items.splice(ii, 1);
  renderPMTemplateEditor();
}
window.removePMItem = removePMItem;

async function submitPMTemplate() {
  if (!window.NEWPMTPL.name) { toast('Enter a template name'); return; }
  const id = nextSequentialId('pmt', PM_TEMPLATES, 1, 0);
  const cleanSections = window.NEWPMTPL.sections.filter(s => s.title && s.items.length > 0);
  if (cleanSections.length === 0) { toast('Add at least one section with items'); return; }
  const tpl = { id, name: window.NEWPMTPL.name, description: window.NEWPMTPL.description, sections: cleanSections };
  const ok = await addPMChecklistTemplate(tpl);
  if (!ok) { toast('Failed to save template — ' + LAST_DB_ERROR); return; }
  PM_TEMPLATES.push(tpl);
  toast('Template "' + window.NEWPMTPL.name + '" saved');
  addAuditLog('Admin', 'Created PM checklist template ' + window.NEWPMTPL.name, 'info');
  openPMPlans();
}
window.submitPMTemplate = submitPMTemplate;

function editPMTemplate(id) {
  const t = PM_TEMPLATES.find(x => x.id === id);
  if (!t) return;
  NEWPMTPL = { id: t.id, name: t.name, description: t.description || '', sections: JSON.parse(JSON.stringify(t.sections || [])) }; window.NEWPMTPL = NEWPMTPL;
  renderPMTemplateEditor();
}
window.editPMTemplate = editPMTemplate;

async function deletePMTemplate(id) {
  const t = PM_TEMPLATES.find(x => x.id === id);
  if (!t) return;
  const ok = await deletePMChecklistTemplate(id);
  if (!ok) { toast('Failed to delete template — ' + LAST_DB_ERROR); return; }
  const idx = PM_TEMPLATES.findIndex(x => x.id === id);
  if (idx >= 0) PM_TEMPLATES.splice(idx, 1);
  toast('Template "' + t.name + '" deleted');
  addAuditLog('Admin', 'Deleted PM checklist template ' + t.name, 'warn');
  openPMPlans();
}
window.deletePMTemplate = deletePMTemplate;

/* ================= AUTH ================= */
function renderLogin() {
  try { const t = localStorage.getItem('vit-theme'); if (t) THEME = t; } catch (e) {}
  if (THEME === 'dark') setTheme('dark'); else setTheme('light');
  document.getElementById('app').innerHTML = `
  <div class="auth-screen">
    <div class="auth-card">
      <div class="auth-logo">
        <div class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h3l2-6 4 12 2-6h4"/></svg></div>
        <div class="brand-name">Vitalis</div>
      </div>
      <div class="auth-title">Sign in to your account</div>
      <div class="auth-sub">Clinical Engineering Management System</div>
      <div class="auth-error" id="authError"></div>
      <div class="auth-field"><span>Email</span><input id="loginEmail" type="email" placeholder="you@hospital.org" onkeydown="if(event.key==='Enter')document.getElementById('loginPass').focus()"></div>
      <div class="auth-field"><span>Password</span><input id="loginPass" type="password" placeholder="••••••••" onkeydown="if(event.key==='Enter')doLogin()"></div>
      <button class="auth-btn auth-btn-primary" onclick="doLogin()">Sign In</button>
      <div class="auth-link" onclick="renderForgot()">Forgot your password?</div>
    </div>
  </div>`;
  setTimeout(() => document.getElementById('loginEmail').focus(), 100);
}
window.renderLogin = renderLogin;

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPass').value;
  const errEl = document.getElementById('authError');
  if (!email || !password) { errEl.textContent = 'Enter your email and password'; errEl.classList.add('show'); return; }
  errEl.classList.remove('show');
  const btn = document.querySelector('.auth-btn-primary');
  btn.textContent = 'Signing in…';
  btn.style.opacity = '0.7';
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = error.message || 'Invalid email or password';
    errEl.classList.add('show');
    btn.textContent = 'Sign In';
    btn.style.opacity = '1';
    return;
  }
  AUTH_USER = data.user;
  const { data: cmmsUser } = await supabase.from('users').select('*').eq('auth_id', data.user.id).maybeSingle();
  if (!cmmsUser) {
    const { data: byEmail } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
    if (byEmail) {
      await supabase.from('users').update({ auth_id: data.user.id }).eq('id', byEmail.id);
      CMMS_USER = byEmail;
    } else {
      errEl.textContent = 'No CMMS account found for this email. Contact your administrator.';
      errEl.classList.add('show');
      btn.textContent = 'Sign In'; btn.style.opacity = '1';
      await supabase.auth.signOut();
      return;
    }
  } else {
    CMMS_USER = cmmsUser;
  }
  if (CMMS_USER.must_change_password) { renderChangePassword(); return; }
  await startApp();
}
window.doLogin = doLogin;

function renderChangePassword() {
  document.getElementById('app').innerHTML = `
  <div class="auth-screen">
    <div class="auth-card">
      <div class="auth-logo">
        <div class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h3l2-6 4 12 2-6h4"/></svg></div>
        <div class="brand-name">Vitalis</div>
      </div>
      <div class="auth-title">Change your password</div>
      <div class="auth-sub">You must set a new password before continuing</div>
      <div class="auth-error" id="authError"></div>
      <div class="auth-field"><span>New Password</span><input id="newPass" type="password" placeholder="At least 8 characters" onkeydown="if(event.key==='Enter')document.getElementById('confirmPass').focus()"></div>
      <div class="auth-field"><span>Confirm Password</span><input id="confirmPass" type="password" placeholder="Re-enter new password" onkeydown="if(event.key==='Enter')doChangePassword()"></div>
      <button class="auth-btn auth-btn-primary" onclick="doChangePassword()">Update Password</button>
    </div>
  </div>`;
  setTimeout(() => document.getElementById('newPass').focus(), 100);
}
window.renderChangePassword = renderChangePassword;

async function doChangePassword() {
  const newPass = document.getElementById('newPass').value;
  const confirmPass = document.getElementById('confirmPass').value;
  const errEl = document.getElementById('authError');
  if (newPass.length < 8) { errEl.textContent = 'Password must be at least 8 characters'; errEl.classList.add('show'); return; }
  if (newPass !== confirmPass) { errEl.textContent = 'Passwords do not match'; errEl.classList.add('show'); return; }
  errEl.classList.remove('show');
  const btn = document.querySelector('.auth-btn-primary');
  btn.textContent = 'Updating…'; btn.style.opacity = '0.7';
  const { error } = await supabase.auth.updateUser({ password: newPass });
  if (error) { errEl.textContent = error.message; errEl.classList.add('show'); btn.textContent = 'Update Password'; btn.style.opacity = '1'; return; }
  await supabase.from('users').update({ must_change_password: false, temp_password: null }).eq('auth_id', AUTH_USER.id);
  if (CMMS_USER) { CMMS_USER.must_change_password = false; CMMS_USER.temp_password = null; }
  await startApp();
  toast('Password updated successfully');
}
window.doChangePassword = doChangePassword;

function renderForgot() {
  document.getElementById('app').innerHTML = `
  <div class="auth-screen">
    <div class="auth-card">
      <div class="auth-logo">
        <div class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h3l2-6 4 12 2-6h4"/></svg></div>
        <div class="brand-name">Vitalis</div>
      </div>
      <div class="auth-title">Reset your password</div>
      <div class="auth-sub">Enter your email and we'll send you a reset link</div>
      <div class="auth-error" id="authError"></div>
      <div class="auth-field"><span>Email</span><input id="resetEmail" type="email" placeholder="you@hospital.org" onkeydown="if(event.key==='Enter')doForgot()"></div>
      <button class="auth-btn auth-btn-primary" onclick="doForgot()">Send Reset Link</button>
      <div class="auth-link" onclick="renderLogin()">Back to sign in</div>
    </div>
  </div>`;
  setTimeout(() => document.getElementById('resetEmail').focus(), 100);
}
window.renderForgot = renderForgot;

async function doForgot() {
  const email = document.getElementById('resetEmail').value.trim();
  const errEl = document.getElementById('authError');
  if (!email) { errEl.textContent = 'Enter your email'; errEl.classList.add('show'); return; }
  errEl.classList.remove('show');
  const btn = document.querySelector('.auth-btn-primary');
  btn.textContent = 'Sending…'; btn.style.opacity = '0.7';
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) { errEl.textContent = error.message; errEl.classList.add('show'); btn.textContent = 'Send Reset Link'; btn.style.opacity = '1'; return; }
  btn.textContent = 'Send Reset Link'; btn.style.opacity = '1';
  document.querySelector('.auth-card').insertAdjacentHTML('beforeend', '<div class="auth-info">If an account exists for ' + email + ', a password reset link has been sent.</div>');
}
window.doForgot = doForgot;

async function doSignOut() {
  await supabase.auth.signOut();
  AUTH_USER = null; CMMS_USER = null;
  renderLogin();
}
window.doSignOut = doSignOut;

async function startApp() {
  try { const t = localStorage.getItem('vit-theme'); if (t) THEME = t; } catch (e) {}
  if (THEME === 'dark') setTheme('dark'); else setTheme('light');
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
          <div class="avatar">${(CMMS_USER?.name || AUTH_USER?.email || '?').split(' ').map(x=>x[0]||'').slice(0,2).join('')}</div>
          <div class="who"><b>${CMMS_USER?.name || 'User'}</b><span>${CMMS_USER?.role || '—'}</span></div>
          <button class="icon-btn" style="margin-left:auto" title="Sign out" onclick="doSignOut()">${icon('x')}</button>
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
          <button class="icon-btn" title="Notifications" onclick="openNotifications()" style="position:relative"><span class="dot" id="notifDot" style="display:none"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><span id="notifBadge" class="badge" style="position:absolute;top:-2px;right:-2px;background:var(--crit);color:#fff;font-size:10px;min-width:18px;height:18px;border-radius:9px;display:none;align-items:center;justify-content:center;padding:0 4px">0</span></button>
          <button class="btn btn-primary" onclick="openNewWorkOrder()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>New Work Order</button>
        </div>
      </header>
      <div class="canvas" id="canvas"></div>
    </div>
    <div class="scrim" id="scrim" onclick="closeDrawer()"></div>
    <aside class="drawer" id="drawer"></aside>
    <div class="toast" id="toast"></div>
    <nav class="mobile-nav" id="mobileNav"></nav>
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
  buildMobileNav();

  // Show loading state
  document.getElementById('canvas').innerHTML = `<section class="view active" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3);font-size:14px">Loading Vitalis CMMS…</section>`;

  // Load all data from Supabase
  try {
    await refreshAllData();
  } catch (err) {
    console.error('Failed to load data:', err);
    document.getElementById('canvas').innerHTML = `<section class="view active" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;padding:40px">
      <div style="font-size:18px;font-weight:600;color:var(--crit)">Failed to load data</div>
      <div class="sub2" style="text-align:center;max-width:400px">There was a problem connecting to the database. Please check your connection and try again.<br><br><span class="mono" style="font-size:12px">${err.message || err}</span></div>
      <button class="btn btn-primary" onclick="location.reload()">${icon('refresh')}Retry</button>
    </section>`;
    return;
  }

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

/* ================= INIT ================= */
async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    AUTH_USER = session.user;
    const { data: cmmsUser } = await supabase.from('users').select('*').eq('auth_id', session.user.id).maybeSingle();
    if (cmmsUser) {
      CMMS_USER = cmmsUser;
      if (cmmsUser.must_change_password) { renderChangePassword(); return; }
      await startApp();
      return;
    }
  }
  renderLogin();
}

init();

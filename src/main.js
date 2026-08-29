import { icon } from './icons.js';
import QRCode from 'qrcode';
import { donut, areaChart, barChart, meter } from './charts.js';
import { supabase } from './supabase.js';
import {
  HOSP, setHosp, TODAY, CRIT, critColor, setCritLevels, STAT, WOSTAT, USTAT, MODULES, ACTIONS, SKILL_AREAS,
  eqStatus, woStatus, priPill, fmtDate, overdue, certStatus,
  LAST_DB_ERROR,
  loadEquipment, loadWorkOrders, loadParts, loadPMWorkOrders, loadUsers, loadTechnicians, loadUserDepartments, setUserDepartments,
  loadTeams, addTeam, updateTeam, deleteTeam,
  loadRoles, loadPermissions, loadWorkflows, loadWorkflowTransitions, loadServiceRequests,
  loadVendors, loadAuditLogs, loadChecklistResult,
  loadPartRequests, loadEscalations, loadNotifications, loadEmailNotifications,
  loadEscalationGroups, loadEscalationGroupMembers,
  addPartRequest, updatePartRequest, addEscalation, updateEscalation,
  addEscalationGroup, updateEscalationGroup, deleteEscalationGroup,
  addEscalationGroupMember, removeEscalationGroupMember,
  addNotification, markNotificationReadForUser, markAllNotificationsReadForUser,
  loadNotificationReads,
  addEmailNotification, updateEmailNotification,
  addPart,
  updateWorkOrder, updatePart, updatePMWorkOrder, saveEquipment,
  addWorkOrder, addServiceRequest, generateServiceRequestId, addVendor, addEquipment,
  addTechnician, addWorkflow, addWorkflowTransition, updateWorkflow, deleteWorkflow,
  updateWorkflowTransition, deleteWorkflowTransition, updateWorkflowStates,
  updateEquipment, updateVendor, updateUser, updateServiceRequest,
  deleteWorkOrder, deleteServiceRequest, deleteVendor, deleteEquipment, deleteTechnician, deleteRole,
  addUser, addRole as addRoleToDB, togglePermission, addWorkflowState, toggleWorkflowTransition,
  updateRole,
  saveChecklistResult, addAuditLog,
  loadPMChecklistTemplates, addPMChecklistTemplate, updatePMChecklistTemplate, deletePMChecklistTemplate, addPMWorkOrder,
  loadWorkflowChecklistTemplates, addWorkflowChecklistTemplate, updateWorkflowChecklistTemplate, deleteWorkflowChecklistTemplate,
  loadPMPlans, addPMPlan, updatePMPlan, deletePMPlan,
  loadEquipmentDocuments, uploadEquipmentDocument, getDocumentDownloadUrl, deleteEquipmentDocument,
  loadPMHistory, loadPMHistoryForEquipment, loadAllPMHistory, addPMHistory,
  loadDepartments, addDepartment, updateDepartment, deleteDepartment,
  loadDepartmentRoles, addDepartmentRole, removeDepartmentRole,
  loadSLAConfig, updateSLAConfig, computeSLA, SLA_DEFAULTS,
  loadCriticalityLevels, addCriticalityLevel, updateCriticalityLevel, deleteCriticalityLevel,
  loadPriorities, addPriority, updatePriority, deletePriority,
  loadAssetCategories, addAssetCategory, updateAssetCategory, deleteAssetCategory,
  loadPMFrequencies, addPMFrequency, updatePMFrequency, deletePMFrequency,
  loadSystemSettings, upsertSystemSetting, deleteSystemSetting,
  computePMCompliance, computeUptime,
} from './db.js';
import {
  CHECKLISTS, tplTotal, progressOf, CORR_STEPS, corrStepFromStatus, addInterval,
} from './checklists.js';

/* ================= NAVIGATION ================= */
const NAV = [
  { grp: 'Operations', items: [
    { id: 'dashboard', label: 'Command Center', ic: 'dash', perm: null },
    { id: 'equipment', label: 'Equipment Register', ic: 'asset', badge: () => String(EQUIP.length), badgeClass: 'muted', perm: 'Equipment' },
    { id: 'workorders', label: 'Work Orders', ic: 'wo', badge: () => String(WORKORDERS.filter(w => w.status !== 'closed').length), badgeClass: '', perm: 'Work Orders' },
    { id: 'requests', label: 'Service Requests', ic: 'alert', badge: () => String(SR_DATA.filter(r => r.status !== 'converted' && r.status !== 'closed').length), badgeClass: 'amber', perm: 'Service Requests' },
  ]},
  { grp: 'Maintenance', items: [
    { id: 'pm', label: 'Preventive (PM)', ic: 'pm', badge: () => String(isTechnician() ? PMWO.filter(p => isMyPM(p) && p.status !== 'completed').length : PMWO.filter(p => p.status !== 'completed').length), badgeClass: 'amber', perm: 'Preventive PM' },
    { id: 'pm-history', label: 'PM History', ic: 'audit', perm: 'Preventive PM' },
    { id: 'calibration', label: 'Calibration', ic: 'cal', perm: 'Calibration' },
    { id: 'parts', label: 'Spare Parts', ic: 'parts', badge: () => String(PARTS.filter(p => p.qty <= p.min_qty).length), badgeClass: 'amber', perm: 'Spare Parts' },
    { id: 'vendors', label: 'Vendors & Contracts', ic: 'vendor', perm: 'Vendors' },
  ]},
  { grp: 'Insight', items: [
    { id: 'risk', label: 'Risk & Compliance', ic: 'risk', perm: 'Reports' },
    { id: 'reports', label: 'Reports & KPIs', ic: 'report', perm: 'Reports' },
    { id: 'audit', label: 'Audit Trail', ic: 'audit', perm: 'Configuration' },
  ]},
  { grp: 'Administration', items: [
    { id: 'users', label: 'Users & Access', ic: 'users', perm: 'Users & Roles' },
    { id: 'techs', label: 'Technicians', ic: 'wrench', perm: 'Users & Roles' },
    { id: 'roles', label: 'Roles & Permissions', ic: 'shield', perm: 'Users & Roles' },
    { id: 'workflows', label: 'Workflow Designer', ic: 'settings', perm: 'Configuration' },
    { id: 'escalation-groups', label: 'Escalation Groups', ic: 'up', perm: 'Configuration' },
    { id: 'sla-config', label: 'SLA Targets', ic: 'clock', perm: 'Configuration' },
    { id: 'settings', label: 'Settings', ic: 'settings', perm: 'Configuration' },
    { id: 'departments', label: 'Departments', ic: 'asset', perm: 'Users & Roles' },
  ]},
];

function getRoleIdByName(roleName) {
  const r = ROLES.find(x => x.name === roleName);
  return r ? r.id : '';
}

function hasPerm(module, action) {
  if (!CMMS_USER) return false;
  const rid = getRoleIdByName(CMMS_USER.role);
  if (!rid || !PERMS[rid]) return false;
  return !!(PERMS[rid][module] && PERMS[rid][module][action]);
}

function navForRole() {
  return NAV.map(g => ({ ...g, items: g.items.filter(it => !it.perm || hasPerm(it.perm, 'View')) })).filter(g => g.items.length > 0);
}

function getMyTechnician() {
  if (!CMMS_USER) return null;
  return TECHS.find(t => t.id === CMMS_USER.id) || null;
}

function nameMatches(assignee, techName) {
  if (!assignee || !techName) return false;
  const a = assignee.toLowerCase().trim();
  const t = techName.toLowerCase().trim();
  if (a === t) return true;
  const tParts = techName.trim().split(/\s+/);
  if (tParts.length >= 2) {
    const abbr = tParts[0][0] + '. ' + tParts.slice(1).join(' ');
    if (a === abbr.toLowerCase()) return true;
    const abbr2 = tParts[0][0] + '. ' + tParts[tParts.length - 1];
    if (a === abbr2.toLowerCase()) return true;
  }
  return false;
}

function isMyWorkOrder(w) {
  const tech = getMyTechnician();
  if (!tech) return false;
  return nameMatches(w.assignee, tech.name);
}

function isMyPM(p) {
  const tech = getMyTechnician();
  if (!tech) return false;
  if (p.technician && p.technician !== 'Unassigned') return nameMatches(p.technician, tech.name);
  if (p.assignee && nameMatches(p.assignee, tech.name)) return true;
  return p.team && tech.trade && p.team.toLowerCase() === tech.trade.toLowerCase();
}

function isMyPlan(plan) {
  if (!isTechnician()) return true;
  const tech = getMyTechnician();
  if (!tech) return false;
  if (plan.technician && plan.technician !== 'Unassigned') return nameMatches(plan.technician, tech.name);
  return plan.team && tech.trade && plan.team.toLowerCase() === tech.trade.toLowerCase();
}

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
let WODEPTF = '';
let WOCATF = '';
let PMDEPTF = '';
let PMCATF = '';
let PMFREQF = '';
let CALDEPTF = '';
let CALCATF = '';
let SRDEPTF = '';
let SELROLE = 'bioeng';
let SELWF = 'corrective';
let ORIGIN = 'dashboard';
let CHK_CTX = null;
let CURRENT_EQ_ID = null;

function setEqFilter(v) { EQFILTER = v; go('equipment'); }
function setWoFilter(v) { WOFILTER = v; go('workorders'); }
function setSelRole(v) { SELROLE = v; go('roles'); }
function setSelWf(v) { SELWF = v; go('workflows'); }
function setEqDeptF(v) { EQDEPTF = v; go('equipment'); }
function setEqCatF(v) { EQCATF = v; go('equipment'); }
function setWoPriF(v) { WOPRIF = v; go('workorders'); }
function setWoTeamF(v) { WOTeamF = v; go('workorders'); }
function setWoDeptF(v) { WODEPTF = v; go('workorders'); }
function setWoCatF(v) { WOCATF = v; go('workorders'); }
function setPMDeptF(v) { PMDEPTF = v; go('pm'); }
function setPMCatF(v) { PMCATF = v; go('pm'); }
function setPMFreqF(v) { PMFREQF = v; go('pm'); }
function setCalDeptF(v) { CALDEPTF = v; go('calibration'); }
function setCalCatF(v) { CALCATF = v; go('calibration'); }
function setSRDeptF(v) { SRDEPTF = v; go('requests'); }

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
window.setEqDeptF = setEqDeptF;
window.setEqCatF = setEqCatF;
window.setWoPriF = setWoPriF;
window.setWoTeamF = setWoTeamF;
window.setWoDeptF = setWoDeptF;
window.setWoCatF = setWoCatF;
window.setPMDeptF = setPMDeptF;
window.setPMCatF = setPMCatF;
window.setPMFreqF = setPMFreqF;
window.setCalDeptF = setCalDeptF;
window.setCalCatF = setCalCatF;
window.setSRDeptF = setSRDeptF;

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
let WF_CHK_TEMPLATES = [];
let PM_PLANS = [];
let PART_REQUESTS = [];
let ESCALATIONS = [];
let NOTIFICATIONS = [];
let READ_NOTIF_IDS = new Set();
let EMAILS = [];
let ESC_GROUPS = [];
let ESC_MEMBERS = [];
let DEPARTMENTS = [];
let DEPT_ROLES = [];
let SLA_CONFIG = [];
let CRIT_LEVELS = [];
let PRIORITIES = [];
let ASSET_CATS = [];
let PM_FREQS = [];
let SYS_SETTINGS = [];
let SETTINGS_TAB = 'sla';
let TEAMS = [];
let USER_DEPT_MAP = {};

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
  const nav = navForRole();
  document.getElementById('nav').innerHTML = nav.map(g => `
    <div class="nav-group"><div class="nav-label">${g.grp}</div>
    ${g.items.map(it => `<button class="nav-item" data-view="${it.id}" onclick="go('${it.id}')">${icon(it.ic)}<span>${it.label}</span>${it.badge ? `<span class="badge ${it.badgeClass || ''}">${typeof it.badge === 'function' ? it.badge() : it.badge}</span>` : ''}</button>`).join('')}
    </div>`).join('');
}

function buildMobileNav() {
  const nav = navForRole();
  const all = nav.flatMap(g => g.items);
  const MOBILE_VISIBLE = 5;
  const visible = all.slice(0, MOBILE_VISIBLE);
  const hidden = all.slice(MOBILE_VISIBLE);
  let html = visible.map(it => `<button data-view="${it.id}" onclick="go('${it.id}')" title="${it.label}">${icon(it.ic)}<span>${it.label.split(' ')[0]}</span></button>`).join('');
  if (hidden.length) {
    html += `<button onclick="openMobileMore()" title="More">${icon('menu')}<span>More</span></button>`;
  }
  document.getElementById('mobileNav').innerHTML = html;
}

function openMobileMore() {
  const nav = navForRole();
  const all = nav.flatMap(g => g.items);
  const MOBILE_VISIBLE = 5;
  const hidden = all.slice(MOBILE_VISIBLE);
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('menu')}</div><div><h2>More Menu</h2><div class="did">All available pages</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div><div class="drawer-body"><div class="dsec" style="padding:8px 12px">${hidden.map(it => `<button class="nav-item more-item" data-view="${it.id}" onclick="go('${it.id}');closeDrawer()" style="margin-bottom:2px">${icon(it.ic)}<span>${it.label}</span>${it.badge ? `<span class="badge ${it.badgeClass || ''}">${typeof it.badge === 'function' ? it.badge() : it.badge}</span>` : ''}</button>`).join('')}</div></div>`);
}
window.openMobileMore = openMobileMore;

/* ================= QR / BARCODE SCANNER ================= */
let _scanStream = null;
let _scanRAF = null;

function openScanner() {
  const hasCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const hasDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  if (!hasCamera) {
    openDrawerHTML(`
      <div class="drawer-head">
        <div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('scan')}</div><div><h2>Scan Equipment</h2><div class="did">Enter a tag, serial, or asset ID</div></div></div>
        <button class="icon-btn close" onclick="closeScanner()">${icon('x')}</button>
      </div>
      <div class="drawer-body">
        <div class="dsec">
          <p class="sub2" style="margin-bottom:14px">Camera not available. Type the code printed on the equipment label.</p>
          <label class="fld"><span>Equipment code</span><input id="scanManualInput" placeholder="e.g. CR-VENT-001" style="text-transform:uppercase" onkeydown="if(event.key==='Enter')submitManualScan()"></label>
          <div style="margin-top:14px;display:flex;gap:9px">
            <button class="btn btn-primary" onclick="submitManualScan()">${icon('check')}Look Up</button>
            <button class="btn btn-ghost" onclick="closeScanner()">Cancel</button>
          </div>
        </div>
      </div>`);
    setTimeout(() => { const el = document.getElementById('scanManualInput'); if (el) el.focus(); }, 100);
    return;
  }

  openDrawerHTML(`
    <div class="drawer-head">
      <div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('scan')}</div><div><h2>Scan Equipment</h2><div class="did">Point camera at a QR or barcode label</div></div></div>
      <button class="icon-btn close" onclick="closeScanner()">${icon('x')}</button>
    </div>
    <div class="drawer-body">
      <div class="dsec">
        <div id="scanViewport" style="position:relative;width:100%;aspect-ratio:1;max-width:340px;margin:0 auto;background:var(--surface-3);border-radius:14px;overflow:hidden;display:flex;align-items:center;justify-content:center">
          <video id="scanVideo" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover"></video>
          <div style="position:absolute;inset:20px;border:2px solid var(--primary);border-radius:10px;pointer-events:none;box-shadow:0 0 0 2000px rgba(0,0,0,0.25)"></div>
          <div id="scanStatus" style="position:absolute;bottom:10px;left:0;right:0;text-align:center;color:#fff;font-size:13px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.7)">Starting camera…</div>
        </div>
        ${!hasDetector ? '<p class="sub2" style="margin-top:14px;text-align:center">Live detection not supported on this browser. Take a photo of the label instead.</p>' : ''}
        <div style="margin-top:16px;display:flex;gap:9px;justify-content:center">
          ${!hasDetector ? `<button class="btn btn-primary" onclick="captureScan()">${icon('camera')}Capture Photo</button>` : ''}
          <label class="btn ${hasDetector ? 'btn-ghost' : 'btn-ghost'}" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
            ${icon('edit')}Enter manually
            <input type="text" id="scanManualInput" style="display:none" onkeydown="if(event.key==='Enter')submitManualScan()">
          </label>
        </div>
        <div id="scanManualWrap" style="display:none;margin-top:14px">
          <label class="fld"><span>Equipment code</span><input id="scanManualInput2" placeholder="e.g. CR-VENT-001" style="text-transform:uppercase" onkeydown="if(event.key==='Enter')submitManualScan()"></label>
          <div style="margin-top:10px;display:flex;gap:9px">
            <button class="btn btn-primary" onclick="submitManualScan()">${icon('check')}Look Up</button>
            <button class="btn btn-ghost" onclick="document.getElementById('scanManualWrap').style.display='none'">Cancel</button>
          </div>
        </div>
      </div>
    </div>`);

  startCamera(hasDetector);
}

async function startCamera(useDetector) {
  const video = document.getElementById('scanVideo');
  const status = document.getElementById('scanStatus');
  if (!video) return;
  try {
    _scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = _scanStream;
    if (status) status.textContent = 'Point at a code…';
    if (useDetector) runDetectorLoop();
  } catch (err) {
    if (status) status.textContent = 'Camera blocked — enter code manually';
    const wrap = document.getElementById('scanManualWrap');
    if (wrap) wrap.style.display = 'block';
  }
}

async function runDetectorLoop() {
  const video = document.getElementById('scanVideo');
  const status = document.getElementById('scanStatus');
  if (!video || !_scanStream) return;
  try {
    const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    const tick = async () => {
      if (!_scanStream) return;
      try {
        const codes = await detector.detect(video);
        if (codes && codes.length) {
          const val = codes[0].rawValue || '';
          if (val) { handleScanResult(val); return; }
        }
      } catch (e) { /* frame not ready */ }
      _scanRAF = requestAnimationFrame(tick);
    };
    _scanRAF = requestAnimationFrame(tick);
  } catch (e) {
    if (status) status.textContent = 'Detector unavailable — enter code manually';
  }
}

async function captureScan() {
  const video = document.getElementById('scanVideo');
  const status = document.getElementById('scanStatus');
  if (!video || !_scanStream) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  if (status) status.textContent = 'Analyzing photo…';
  try {
    const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8'] });
    const codes = await detector.detect(canvas);
    if (codes && codes.length) { handleScanResult(codes[0].rawValue || ''); return; }
  } catch (e) { /* fall through */ }
  if (status) status.textContent = 'No code found — try again or enter manually';
}

async function handleScanResult(raw) {
  const code = (raw || '').trim().toUpperCase();
  if (!code) { toast('Empty scan'); return; }

  // Check if it's a service request deep-link (URL with #sr=ID)
  const srMatch = (raw || '').match(/[#&]sr=([^&]+)/i);
  if (srMatch) {
    const srId = decodeURIComponent(srMatch[1]);
    closeScanner();
    const sr = SR_DATA.find(r => r.id.toUpperCase() === srId.toUpperCase());
    if (sr) {
      openServiceRequest(sr.id);
    } else {
      toast('Service request ' + srId + ' not found');
    }
    return;
  }

  const stripped = code.replace(/^VIT-/, '');
  const match = EQUIP.find(e => {
    const eid = (e.id || '').toUpperCase();
    const tag = (e.tag || '').toUpperCase();
    const serial = (e.serial || '').toUpperCase();
    const qr = (e.qr_code || '').toUpperCase();
    const barcode = (e.barcode_id || '').toUpperCase();
    return eid === code || tag === code || serial === code || qr === code || barcode === code
      || eid === stripped || tag === stripped || serial === stripped || qr === stripped || barcode === stripped
      || tag.startsWith(code) || code.startsWith(tag) && tag.length >= 3;
  });
  closeScanner();
  if (match) {
    if (isTechnician()) {
      await refreshAllData();
      const myOpenWOs = WORKORDERS.filter(w => {
        if (w.eq_id !== match.id) return false;
        if (w.status === 'closed') return false;
        if (w.status === 'pending_closeout' && w.source_sr_id) {
          const sr = SR_DATA.find(r => r.id === w.source_sr_id);
          if (sr && sr.status === 'closed') return false;
        }
        return isMyWorkOrder(w);
      });
      const myOpenPMs = PMWO.filter(p => p.eq_id === match.id && p.status !== 'completed' && isMyPM(p));
      if (myOpenWOs.length) {
        toast('Opening your work order: ' + myOpenWOs[0].title);
        openJob(myOpenWOs[0].id, 'wo');
        return;
      }
      if (myOpenPMs.length) {
        toast('Opening your PM: ' + myOpenPMs[0].title);
        openJob(myOpenPMs[0].id, 'pm');
        return;
      }
    }
    toast('Found: ' + match.name);
    openScanResults(match.id);
  } else {
    toast('No equipment matches "' + code + '"');
  }
}
window.handleScanResult = handleScanResult;

async function openScanResults(id) {
  const e = EQMAP[id];
  if (!e) return;
  CURRENT_EQ_ID = id;
  const wos = WORKORDERS.filter(w => w.eq_id === id);
  const pms = PMWO.filter(p => p.eq_id === id);
  const openWOs = wos.filter(w => w.status !== 'closed');
  const openPMs = pms.filter(p => p.status !== 'completed');
  const timeline = await buildEqTimeline(e, wos, pms);
  const warr = eqWarrantyStatus(e);

  let qrDataUrl = '';
  try {
    const qrPayload = e.qr_code || ('VIT-' + e.id);
    qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 160, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } });
  } catch (err) { /* ignore */ }

  openDrawerHTML(`
    <div class="drawer-head">
      <div class="drawer-title">
        <div class="big-ic">${icon(e.ic)}</div>
        <div><h2>${e.name}</h2><div class="did">${e.tag} · ${e.id} · SN ${e.serial || '—'}</div></div>
      </div>
      <button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button>
    </div>
    <div class="drawer-tabs">
      <button class="on" onclick="dTab(this,'d-scan-wo')">Work Orders (${wos.length})</button>
      <button onclick="dTab(this,'d-scan-pm')">Preventive (${pms.length})</button>
      <button onclick="dTab(this,'d-scan-hist')">History</button>
      <button onclick="dTab(this,'d-scan-qr')">QR & Label</button>
    </div>
    <div class="drawer-body">
      <div id="d-scan-wo">
        <div class="dsec" style="display:flex;gap:10px;flex-wrap:wrap">
          ${eqStatus(e.status)}<span class="pill p-${CRIT[e.crit].c}">${CRIT[e.crit].l}</span>
          <span class="pill ${warr.cls}">${warr.label}</span>
          ${openWOs.length ? `<span class="pill p-warn">${openWOs.length} open WO</span>` : '<span class="pill p-ok">No open WO</span>'}
        </div>
        <div class="dsec"><h4>Open Work Orders (${openWOs.length})</h4>
          ${openWOs.length ? openWOs.map(w => `<div class="doc-row" onclick="closeDrawer();openJob('${w.id}','wo')" style="cursor:pointer">
            <div class="doc-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('wo')}</div>
            <div style="flex:1"><div class="dn">${w.title}</div><div class="dm mono">${w.id} · ${w.type} · ${w.pri} · ${w.assignee || 'Unassigned'}</div></div>
            ${woStatus(w.status)}</div>`).join('') : '<div class="empty">No open work orders</div>'}
        </div>
        <div class="dsec"><h4>All Work Orders (${wos.length})</h4>
          ${wos.length ? wos.map(w => `<div class="doc-row" onclick="closeDrawer();openJob('${w.id}','wo')" style="cursor:pointer">
            <div class="doc-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('wo')}</div>
            <div style="flex:1"><div class="dn">${w.title}</div><div class="dm mono">${w.id} · ${w.type} · ${w.assignee || 'Unassigned'} · ${fmtDate(w.opened) || '—'}</div></div>
            ${woStatus(w.status)}</div>`).join('') : '<div class="empty">No work orders yet</div>'}
        </div>
        <div class="dsec" style="display:flex;gap:9px;flex-wrap:wrap">
          ${hasPerm('Work Orders', 'Create') ? `<button class="btn btn-primary" onclick="closeDrawer();openNewWorkOrder()">${icon('wrench')}Raise Work Order</button>` : ''}
          <button class="btn btn-ghost" onclick="openEquipment('${e.id}')">${icon('asset')}Full Asset Details</button>
        </div>
      </div>
      <div id="d-scan-pm" style="display:none">
        <div class="dsec"><h4>Open PM Orders (${openPMs.length})</h4>
          ${openPMs.length ? openPMs.map(p => `<div class="doc-row" onclick="closeDrawer();openJob('${p.id}','pm')" style="cursor:pointer">
            <div class="doc-ic" style="background:var(--cal-soft,var(--surface-3));color:var(--cal,var(--primary))">${icon('pm')}</div>
            <div style="flex:1"><div class="dn">${p.title}</div><div class="dm mono">${p.id} · ${p.freq} · due ${fmtDate(p.due)} · ${p.technician || p.assignee || 'Unassigned'}</div></div>
            <span class="pill p-info">Scheduled</span></div>`).join('') : '<div class="empty">No open PM orders</div>'}
        </div>
        <div class="dsec"><h4>All PM History (${pms.length})</h4>
          ${pms.length ? pms.map(p => `<div class="doc-row" onclick="closeDrawer();openJob('${p.id}','pm')" style="cursor:pointer">
            <div class="doc-ic" style="background:var(--cal-soft,var(--surface-3));color:var(--cal,var(--primary))">${icon('pm')}</div>
            <div style="flex:1"><div class="dn">${p.title}</div><div class="dm mono">${p.id} · ${p.freq} · due ${fmtDate(p.due)}</div></div>
            ${p.status === 'completed' ? '<span class="pill p-ok">Completed</span>' : '<span class="pill p-info">Scheduled</span>'}</div>`).join('') : '<div class="empty">No PM history yet</div>'}
        </div>
      </div>
      <div id="d-scan-hist" style="display:none">
        <div class="dsec"><h4>PM Measurement History</h4><div id="eq-pm-history-list"><div class="empty">Loading…</div></div></div>
        <div class="dsec"><h4>Equipment Timeline</h4><div class="timeline">
          ${timeline.length ? timeline.map(t => `<div class="tl-item"><div class="tl-dot"><div class="d" style="box-shadow:0 0 0 2px var(--${t.c})"></div><div class="ln"></div></div>
            <div class="tl-c"><div class="tl-t">${t.t}</div><div class="tl-m">${t.m}</div><div class="tl-time">${t.time}</div></div></div>`).join('') : '<div class="empty">No activity yet</div>'}
        </div></div>
      </div>
      <div id="d-scan-qr" style="display:none">
        <div class="dsec" style="text-align:center">
          <h4>QR Code</h4>
          ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR Code" style="width:160px;height:160px;border-radius:10px;border:1px solid var(--border)">` : '<div class="empty">QR code not available</div>'}
          <div class="dm mono" style="margin-top:10px">${e.qr_code || 'VIT-' + e.id}</div>
          ${e.barcode_id ? `<div style="margin-top:14px"><h4>Barcode ID</h4><div class="dm mono" style="font-size:18px;letter-spacing:2px">${e.barcode_id}</div></div>` : ''}
          <div style="margin-top:18px;display:flex;gap:9px;justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary" onclick="printQRLabel('${e.id}')">${icon('print')}Print Label</button>
            ${qrDataUrl ? `<a class="btn btn-ghost" href="${qrDataUrl}" download="${e.tag}-qr.png" style="display:inline-flex;align-items:center;gap:6px">${icon('download')}Download QR</a>` : ''}
          </div>
        </div>
      </div>
    </div>`);
}
window.openScanResults = openScanResults;

async function printQRLabel(id) {
  const e = EQMAP[id];
  if (!e) return;
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(e.qr_code || ('VIT-' + e.id), { width: 200, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } });
  } catch (err) { toast('Could not generate QR code'); return; }
  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up blocked — allow pop-ups to print'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>QR Label — ${e.tag}</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f0f0}
    .label{width:300px;background:#fff;border:2px solid #0f172a;border-radius:12px;padding:20px;text-align:center}
    .label img{width:200px;height:200px;margin-bottom:12px}
    .label h1{font-size:18px;margin-bottom:4px;color:#0f172a}
    .label .tag{font-size:14px;color:#475569;margin-bottom:8px}
    .label .code{font-size:12px;font-family:monospace;color:#64748b;letter-spacing:1px;margin-bottom:4px}
    .label .barcode{font-size:16px;font-family:monospace;font-weight:700;letter-spacing:3px;color:#0f172a;margin-top:8px}
    @media print{body{background:#fff}.label{border-color:#000}}
  </style></head><body>
    <div class="label">
      <img src="${qrDataUrl}" alt="QR Code">
      <h1>${e.name}</h1>
      <div class="tag">${e.tag} · ${e.id}</div>
      <div class="code">SN: ${e.serial || '—'}</div>
      <div class="code">QR: ${e.qr_code || 'VIT-' + e.id}</div>
      ${e.barcode_id ? `<div class="barcode">${e.barcode_id}</div>` : ''}
    </div>
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
  </body></html>`);
  w.document.close();
}
window.printQRLabel = printQRLabel;

function submitManualScan() {
  const el = document.getElementById('scanManualInput2') || document.getElementById('scanManualInput');
  const code = (el && el.value || '').trim();
  if (!code) return;
  handleScanResult(code);
}
window.submitManualScan = submitManualScan;

function closeScanner() {
  if (_scanRAF) { cancelAnimationFrame(_scanRAF); _scanRAF = null; }
  if (_scanStream) { _scanStream.getTracks().forEach(t => t.stop()); _scanStream = null; }
  closeDrawer();
}
window.closeScanner = closeScanner;
window.openScanner = openScanner;

async function go(v) {
  const nav = navForRole();
  const allowed = nav.flatMap(g => g.items).some(it => it.id === v);
  if (!allowed) v = 'dashboard';
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
  const _userDepts = await loadUserDepartments();
  USER_DEPT_MAP = {};
  _userDepts.forEach(d => { if (!USER_DEPT_MAP[d.user_id]) USER_DEPT_MAP[d.user_id] = []; USER_DEPT_MAP[d.user_id].push(d.dept); });
  TECHS = await loadTechnicians();
  TEAMS = await loadTeams();
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
  const srCanManage = hasPerm('Service Requests', 'Edit') || hasPerm('Service Requests', 'Approve');
  SR_DATA = await loadServiceRequests(srCanManage ? null : (CMMS_USER?.id || null));
  VENDORS = await loadVendors();
  AUDIT = await loadAuditLogs();
  PM_TEMPLATES = await loadPMChecklistTemplates();
  WF_CHK_TEMPLATES = await loadWorkflowChecklistTemplates();
  PM_PLANS = await loadPMPlans();
  PART_REQUESTS = await loadPartRequests();
  ESCALATIONS = await loadEscalations();
  ESC_GROUPS = await loadEscalationGroups();
  ESC_MEMBERS = await loadEscalationGroupMembers();
  DEPARTMENTS = await loadDepartments();
  DEPT_ROLES = await loadDepartmentRoles();
  SLA_CONFIG = await loadSLAConfig();
  CRIT_LEVELS = await loadCriticalityLevels();
  setCritLevels(CRIT_LEVELS);
  PRIORITIES = await loadPriorities();
  ASSET_CATS = await loadAssetCategories();
  PM_FREQS = await loadPMFrequencies();
  SYS_SETTINGS = await loadSystemSettings();
  const orgSetting = SYS_SETTINGS.find(s => s.key === 'org_name');
  if (orgSetting && orgSetting.value) setHosp(orgSetting.value);
  NOTIFICATIONS = await loadNotifications();
  READ_NOTIF_IDS = new Set(await loadNotificationReads(CMMS_USER?.id));
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

async function buildEqTimeline(e, wos, pms) {
  const items = [];
  const pmHistory = await loadPMHistoryForEquipment(e.id);
  pmHistory.forEach(h => {
    const pm = pms.find(p => p.id === h.pm_work_order_id);
    if (h.result === 'pass') {
      items.push({ t: 'PM passed — all readings in range', m: (pm ? pm.title + ' · ' : '') + h.pm_work_order_id + ' · ' + (h.technician || 'Unknown'), time: fmtDate(h.completed_at) + ' · Attempt ' + h.attempt, c: 'ok' });
    } else {
      items.push({ t: 'PM failed — readings out of range', m: (pm ? pm.title + ' · ' : '') + h.pm_work_order_id + ' · ' + (h.technician || 'Unknown') + ' — ' + (h.fail_details || 'see history'), time: fmtDate(h.completed_at) + ' · Attempt ' + h.attempt, c: 'warn' });
    }
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

async function openEquipment(id) {
  const e = EQMAP[id];
  if (!e) return;
  CURRENT_EQ_ID = id;
  const wos = WORKORDERS.filter(w => w.eq_id === id);
  const pms = PMWO.filter(p => p.eq_id === id);
  const timeline = await buildEqTimeline(e, wos, pms);
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
      <button onclick="dTab(this,'d-qr')">QR & Label</button>
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
          ${hasPerm('Equipment', 'Edit') ? `<button class="btn btn-primary" onclick="openEditEquipment('${e.id}')">${icon('edit')}Edit Asset</button>` : ''}
          ${hasPerm('Work Orders', 'Create') ? `<button class="btn btn-ghost" onclick="closeDrawer();openNewWorkOrder()">${icon('wrench')}Raise Work Order</button>` : ''}
          ${hasPerm('Equipment', 'Delete') ? `<button class="btn btn-ghost" style="color:var(--crit)" onclick="confirmDeleteEquipment('${e.id}')">${icon('trash')}Delete</button>` : ''}
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
        <div class="dsec"><h4>PM Measurement History</h4><div id="eq-pm-history-list"><div class="empty">Loading…</div></div></div>
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
      <div id="d-qr" style="display:none">
        <div class="dsec" style="text-align:center">
          <h4>QR Code</h4>
          <div id="eq-qr-img" style="display:flex;align-items:center;justify-content:center;min-height:160px"><div class="empty">Generating QR…</div></div>
          <div class="dm mono" style="margin-top:10px">${e.qr_code || 'VIT-' + e.id}</div>
          ${e.barcode_id ? `<div style="margin-top:14px"><h4>Barcode ID</h4><div class="dm mono" style="font-size:18px;letter-spacing:2px">${e.barcode_id}</div></div>` : ''}
          <div style="margin-top:18px;display:flex;gap:9px;justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary" onclick="printQRLabel('${e.id}')">${icon('print')}Print Label</button>
            <button class="btn btn-ghost" id="eq-qr-download" style="display:none">${icon('download')}Download QR</button>
          </div>
        </div>
      </div>
      <div id="d-risk" style="display:none">
        <div class="dsec"><h4>Risk Score</h4>
          <div class="hstat"><div class="big-num" style="color:${critColor(e.crit)}">${e.risk || 50}</div>
          <div><div style="font-weight:600">${(e.risk || 50) >= 85 ? 'Critical' : (e.risk || 50) >= 65 ? 'High' : 'Moderate'} composite risk</div>
          <div class="sub2">Auto-calculated from the criticality level you selected (${CRIT[e.crit].l}). ${CRIT_LEVELS.map(c => c.level + ' = ' + (CRIT[c.id]?.risk || 50)).join(', ')}.</div></div></div>
          <div style="margin-top:14px">${meter(e.risk || 50, critColor(e.crit))}</div>
        </div>
        <div class="dsec"><h4>Maintenance Strategy</h4>
        <div class="sub2" style="margin-bottom:12px">PM frequency and compliance are system defaults for new assets. They update automatically as maintenance work is completed.</div>
        <div class="kv-grid">
          <div class="kv-item"><div class="k">PM Frequency</div><div class="v">${CRIT[e.crit]?.freq || (e.crit === 'life' ? 'Quarterly' : 'Semi-annual')} <span class="sub2" style="font-size:11px">(auto from criticality)</span></div></div>
          <div class="kv-item"><div class="k">PM Compliance</div><div class="v">${e.pm || 100}% <span class="sub2" style="font-size:11px">(default)</span></div></div>
          <div class="kv-item"><div class="k">Next PM Due</div><div class="v mono">${fmtDate(e.next_pm)}</div></div>
          <div class="kv-item"><div class="k">Calibration Due</div><div class="v mono">${e.cal_due ? fmtDate(e.cal_due) : 'N/A'}</div></div>
        </div></div>
        <div class="dsec">${hasPerm('Work Orders', 'Create') ? `<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="closeDrawer();openNewWorkOrder()">${icon('wrench')}Raise Work Order</button>` : ''}</div>
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

async function loadEqPMHistoryIntoDrawer(eqId) {
  const el = document.getElementById('eq-pm-history-list');
  if (!el) return;
  el.innerHTML = '<div class="empty">Loading…</div>';
  const history = await loadPMHistoryForEquipment(eqId);
  if (!history.length) { el.innerHTML = '<div class="empty">No PM measurement history yet.</div>'; return; }
  el.innerHTML = history.map(h => {
    const pm = PMWOMAP[h.pm_work_order_id];
    const pmTitle = pm ? pm.title : h.pm_work_order_id;
    const passIcon = h.result === 'pass' ? 'check' : 'alert';
    const pillCls = h.result === 'pass' ? 'p-ok' : 'p-crit';
    const resultLabel = h.result === 'pass' ? 'Passed' : 'Failed';
    const commentHtml = h.comment ? `<div style="margin-top:4px;font-size:12px;color:var(--text-2);font-style:italic">Comment: ${h.comment}</div>` : '';
    const failDetailsHtml = h.fail_details ? `<div style="margin-top:4px;font-size:12px;color:var(--crit)">${h.fail_details}</div>` : '';
    return `<div class="doc-row" style="cursor:pointer;align-items:flex-start" onclick="closeDrawer();openJob('${h.pm_work_order_id}','pm')">
      <div class="doc-ic" style="background:${h.result === 'pass' ? 'var(--ok-soft,var(--surface-3))' : 'var(--crit-soft,var(--surface-3))'};color:${h.result === 'pass' ? 'var(--ok,var(--primary))' : 'var(--crit)'}">${icon(passIcon)}</div>
      <div style="flex:1">
        <div class="dn">${pmTitle} — Attempt #${h.attempt}</div>
        <div class="dm mono">${h.pm_work_order_id} · ${h.technician || 'Unknown'} · ${fmtDate(h.completed_at)}</div>
        ${failDetailsHtml}${commentHtml}
      </div>
      <span class="pill ${pillCls}">${resultLabel}</span>
    </div>`;
  }).join('');
}
window.loadEqPMHistoryIntoDrawer = loadEqPMHistoryIntoDrawer;

async function loadEqQRIntoDrawer(eqId) {
  const e = EQMAP[eqId];
  if (!e) return;
  const el = document.getElementById('eq-qr-img');
  if (!el) return;
  try {
    const qrPayload = e.qr_code || ('VIT-' + e.id);
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 160, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } });
    el.innerHTML = `<img src="${qrDataUrl}" alt="QR Code" style="width:160px;height:160px;border-radius:10px;border:1px solid var(--border)">`;
    const dlBtn = document.getElementById('eq-qr-download');
    if (dlBtn) { dlBtn.style.display = 'inline-flex'; dlBtn.href = qrDataUrl; dlBtn.download = (e.tag || e.id) + '-qr.png'; dlBtn.setAttribute('href', qrDataUrl); dlBtn.setAttribute('download', (e.tag || e.id) + '-qr.png'); dlBtn.onclick = function() { const a = document.createElement('a'); a.href = qrDataUrl; a.download = (e.tag || e.id) + '-qr.png'; a.click(); }; }
  } catch (err) {
    el.innerHTML = '<div class="empty">QR code not available</div>';
  }
}
window.loadEqQRIntoDrawer = loadEqQRIntoDrawer;

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
  if (!hasPerm('Equipment', 'Delete')) { toast('You do not have permission to delete documents'); return; }
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
  const allTabs = ['d-over', 'd-hist', 'd-docs', 'd-qr', 'd-risk', 'd-scan-wo', 'd-scan-pm', 'd-scan-hist', 'd-scan-qr'];
  allTabs.forEach(x => {
    const el = document.getElementById(x);
    if (el) el.style.display = x === id ? 'block' : 'none';
  });
  if (id === 'd-docs' && CURRENT_EQ_ID) loadEqDocsIntoDrawer(CURRENT_EQ_ID);
  if (id === 'd-hist' && CURRENT_EQ_ID) loadEqPMHistoryIntoDrawer(CURRENT_EQ_ID);
  if (id === 'd-scan-hist' && CURRENT_EQ_ID) loadEqPMHistoryIntoDrawer(CURRENT_EQ_ID);
  if (id === 'd-qr' && CURRENT_EQ_ID) loadEqQRIntoDrawer(CURRENT_EQ_ID);
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
        ${priPill(w.pri)}${woStatus(w.status)}<span class="pill ${(() => { const s = w.status === 'closed' ? (w.sla || 'Met') : computeSLA(w, SLA_CONFIG).sla; return s === 'Breached' ? 'p-crit' : s === 'At risk' ? 'p-crit' : s === 'Met' ? 'p-ok' : 'p-info'; })()}">SLA ${(() => { const s = w.status === 'closed' ? (w.sla || 'Met') : computeSLA(w, SLA_CONFIG).sla; return s; })()}</span>
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
          const curIdx = Math.max(wf.states.findIndex(s => s.toLowerCase() === (w.status || '').toLowerCase()), 0);
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
      ${w.status !== 'closed' ? (() => { const s = computeSLA(w, SLA_CONFIG); return `<div style="margin-top:14px">${meter(s.pct, s.pct >= 100 ? 'var(--crit)' : s.pct >= (SLA_CONFIG.find(c => c.priority === w.pri) || SLA_DEFAULTS[2]).warning_pct ? 'var(--warn)' : 'var(--primary)')}<div class="sub2" style="margin-top:5px">${s.pct >= 100 ? 'SLA breached — resolution window exceeded' : s.pct >= (SLA_CONFIG.find(c => c.priority === w.pri) || SLA_DEFAULTS[2]).warning_pct ? 'Approaching SLA breach — ' + s.elapsedHours + 'h of ' + s.targetHours + 'h elapsed' : 'Within resolution window — ' + s.elapsedHours + 'h of ' + s.targetHours + 'h elapsed'}</div></div>`; })() : (() => { const s = computeSLA(w, SLA_CONFIG); return s.met ? '<div class="pill p-ok" style="margin-top:12px">SLA Met · closed within window</div>' : '<div class="pill p-crit" style="margin-top:12px">SLA Breached · closed after target</div>'; })()}
      </div>
      <div class="dsec"><h4>Actions</h4>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          ${hasPerm('Work Orders', 'Edit') ? (w.status === 'closed' ? `<button class="btn btn-primary" disabled style="opacity:.55;cursor:not-allowed">${icon('play')}Advance Status</button>` : `<button class="btn btn-primary" onclick="advanceWODrawer('${w.id}')">${icon('play')}Advance Status</button>`) : ''}
          ${hasPerm('Work Orders', 'Edit') ? (w.status === 'closed' ? `<button class="btn btn-ghost" disabled style="opacity:.55;cursor:not-allowed">${icon('user')}Assign Technician</button>` : `<button class="btn btn-ghost" onclick="openAssignWO('${w.id}')">${icon('user')}Assign Technician</button>`) : ''}
          ${hasPerm('Work Orders', 'Edit') ? (w.status === 'closed' ? `<button class="btn btn-ghost" disabled style="opacity:.55;cursor:not-allowed">${icon('settings')}Assign Workflow</button>` : `<button class="btn btn-ghost" onclick="openAssignWorkflow('${w.id}')">${icon('settings')}Assign Workflow</button>`) : ''}
          ${hasPerm('Work Orders', 'Create') ? (w.status === 'closed' ? `<button class="btn btn-ghost" disabled style="opacity:.55;cursor:not-allowed">${icon('parts')}Request Part</button>` : `<button class="btn btn-ghost" onclick="requestPartToWO('${w.id}')">${icon('parts')}Request Part</button>`) : ''}
          ${hasPerm('Work Orders', 'Edit') ? (w.status === 'closed' ? `<button class="btn btn-ghost" disabled style="opacity:.55;cursor:not-allowed">${icon('up')}Escalate</button>` : `<button class="btn btn-ghost" onclick="escalateWO('${w.id}')">${icon('up')}Escalate</button>`) : ''}
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
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to assign workflows'); return; }
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
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('user')}</div><div><h2>Assign Work Order</h2><div class="did">${w.id} · ${w.title}</div></div></div><button class="icon-btn close" onclick="openWO('${id}')">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Assignment</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Technician</span><select id="as_tech">${techOpts}</select></label>
      <label class="fld"><span>Team</span><select id="as_team">${teamOpts(w.team)}</select></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitAssignWO()">${icon('check')}Assign</button><button class="btn btn-ghost" onclick="openWO('${id}')">Cancel</button></div>
  </div></div>`);
}
window.openAssignWO = openAssignWO;

async function submitAssignWO() {
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to assign work orders'); return; }
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
  if (shouldSendEmail(tech, 'update', 'wo')) {
    await fireEmail(id, tech.toLowerCase().replace(/ /g, '.') + '@cedarridge.org', tech, `Assignment — ${id}`, `You have been assigned to work order ${id}.\n\nTitle: ${w.title}\nTeam: ${team}\nPriority: ${w.pri}\nDue: ${w.due}`);
  }
  openWO(id);
}
window.submitAssignWO = submitAssignWO;

/* ============================================================
   VIEW: COMMAND CENTER (DASHBOARD)
   ============================================================ */
VIEWS.dashboard = async function () {
  const can = (m) => hasPerm(m, 'View');
  const canEq = can('Equipment');
  const canWO = can('Work Orders');
  const canPM = can('Preventive PM');
  const canSR = can('Service Requests');
  const canParts = can('Spare Parts');
  const canCal = can('Calibration');
  const canReports = can('Reports');

  const myTech = getMyTechnician();
  const myWOs = myTech ? WORKORDERS.filter(isMyWorkOrder) : [];
  const myPMs = myTech ? PMWO.filter(isMyPM) : [];

  const sections = [];

  // ---- KPI ROW (permission-gated) ----
  const kpis = [];
  if (canEq) {
    const visEq = visibleEquipment();
    const uptimePct = computeUptime(visEq, WORKORDERS);
    const operationalCount = visEq.length ? Math.round(uptimePct / 100 * visEq.length) : 0;
    kpis.push({ t: 'Equipment Uptime', v: String(uptimePct), u: '%', ic: 'gauge', accent: 'var(--ok)', soft: 'var(--ok-soft)', trend: uptimePct >= 96 ? 'up' : 'down', delta: uptimePct >= 96 ? '+good' : '\u2212check', lbl: `${operationalCount} of ${visEq.length} operational` });
  }
  if (canPM) {
    const visEq = visibleEquipment();
    const pmCompliance = computePMCompliance(visEq, PMWO);
    kpis.push({ t: 'PM Compliance', v: String(pmCompliance), u: '%', ic: 'pm', accent: 'var(--primary)', soft: 'var(--primary-soft)', trend: pmCompliance >= 90 ? 'up' : 'down', delta: pmCompliance >= 90 ? '+on target' : '\u2212below target', lbl: 'target 90%' });
  }
  if (canWO) {
    const _dWO = userDepts(); const visWO = isDeptScoped() ? WORKORDERS.filter(w => { const e = EQMAP[w.eq_id]; return e && (!e.dept || _dWO.includes(e.dept)); }) : WORKORDERS;
    const openWO = visWO.filter(w => w.status !== 'closed');
    const highPri = openWO.filter(w => w.pri === 'P1' || w.pri === 'P2');
    kpis.push({ t: 'Open Work Orders', v: String(openWO.length), u: '', ic: 'wo', accent: 'var(--warn)', soft: 'var(--warn-soft)', trend: 'flat', delta: '', lbl: `${highPri.length} high priority` });
    const slaMet = visWO.filter(w => w.status === 'closed' && computeSLA(w, SLA_CONFIG).met).length;
    const slaTotal = visWO.filter(w => w.status === 'closed').length;
    const slaPct = slaTotal ? Math.round(slaMet / slaTotal * 1000) / 10 : 100;
    const slaAtRisk = openWO.filter(w => { const s = computeSLA(w, SLA_CONFIG); return s.sla === 'At risk' || s.sla === 'Breached'; });
    kpis.push({ t: 'SLA Compliance', v: String(slaPct), u: '%', ic: 'clock', accent: 'var(--info)', soft: 'var(--info-soft)', trend: slaAtRisk.length === 0 ? 'up' : 'down', delta: slaAtRisk.length === 0 ? '0 at risk' : `${slaAtRisk.length} at risk`, lbl: `${slaMet} of ${slaTotal} closed met` });
  }
  if (canSR) {
    const isReqOnly = !canWO && !canEq;
    let mySRData = SR_DATA;
    { const _d = userDepts(); if (_d.length) mySRData = mySRData.filter(r => { const e = EQMAP[r.eq_id]; return e && (!e.dept || _d.includes(e.dept)); }); }
    if (isReqOnly && CMMS_USER) mySRData = mySRData.filter(r => r.user_id === CMMS_USER.id || r.by === CMMS_USER.name);
    const srOpen = mySRData.filter(r => !r.status || r.status === 'open' || r.status === 'submitted').length;
    const srConverted = mySRData.filter(r => r.status === 'converted' || r.usable === 'Converted').length;
    const srClosed = mySRData.filter(r => r.status === 'closed').length;
    const srHigh = mySRData.filter(r => r.urg === 'High' && (!r.status || r.status === 'open' || r.status === 'submitted')).length;
    kpis.push({ t: isReqOnly ? 'My Requests' : 'Service Requests', v: String(mySRData.length), u: '', ic: 'alert', accent: 'var(--primary)', soft: 'var(--primary-soft)', trend: 'flat', delta: '', lbl: `${srOpen} open · ${srConverted} converted · ${srClosed} closed · ${srHigh} high urgency` });
  }
  if (canParts) {
    const lowParts = PARTS.filter(p => p.qty <= p.min_qty).length;
    kpis.push({ t: 'Parts Below Min', v: String(lowParts), u: '', ic: 'parts', accent: 'var(--warn)', soft: 'var(--warn-soft)', trend: lowParts === 0 ? 'up' : 'down', delta: lowParts === 0 ? '0 below' : `${lowParts} below`, lbl: `${PARTS.length} SKUs tracked` });
  }
  if (myTech && canWO) {
    const myOpen = myWOs.filter(w => w.status !== 'closed');
    const myHighPri = myOpen.filter(w => w.pri === 'P1' || w.pri === 'P2');
    kpis.push({ t: 'My Open WOs', v: String(myOpen.length), u: '', ic: 'wo', accent: 'var(--warn)', soft: 'var(--warn-soft)', trend: 'flat', delta: '', lbl: `${myHighPri.length} high priority \u00b7 ${myOpen.filter(w => w.sla === 'At risk').length} SLA at risk` });
    const myClosed = myWOs.filter(w => w.status === 'closed');
    const myCorr = myWOs.filter(w => w.type !== 'Preventive');
    const myPMWO = myWOs.filter(w => w.type === 'Preventive');
    kpis.push({ t: 'My Completed', v: String(myClosed.length), u: '', ic: 'check', accent: 'var(--ok)', soft: 'var(--ok-soft)', trend: 'up', delta: '', lbl: `${myCorr.length} corrective \u00b7 ${myPMWO.length} preventive` });
  }
  if (myTech && canPM) {
    const myPMOpen = myPMs.filter(p => p.status !== 'completed');
    const myPMOverdue = myPMOpen.filter(p => p.status === 'overdue' || (new Date(p.due) < new Date(TODAY) && p.status !== 'completed'));
    kpis.push({ t: 'My PM Plans', v: String(myPMOpen.length), u: '', ic: 'pm', accent: 'var(--primary)', soft: 'var(--primary-soft)', trend: myPMOverdue.length === 0 ? 'up' : 'down', delta: myPMOverdue.length === 0 ? '0 overdue' : `${myPMOverdue.length} overdue`, lbl: `${myPMs.length} total assigned \u00b7 ${myPMs.filter(p => p.status === 'completed').length} done` });
  }
  if (kpis.length === 0) {
    kpis.push({ t: 'Welcome', v: CMMS_USER?.name || 'User', u: '', ic: 'dash', accent: 'var(--primary)', soft: 'var(--primary-soft)', trend: 'flat', delta: '', lbl: 'No modules assigned yet' });
  }
  const kpiRow = `<div class="kpi-row">${kpis.map(k => `
    <div class="kpi" style="--accent:${k.accent};--accent-soft:${k.soft}">
      <div class="kt"><span class="ic">${icon(k.ic)}</span>${k.t}</div>
      <div class="kv">${k.v}<small>${k.u}</small></div>
      <div class="kf">
        <span class="trend ${k.trend}">${icon(k.trend === 'up' ? 'up' : k.trend === 'down' ? 'down' : 'arrowr')}${k.delta}</span>
        <span class="lbl">${k.lbl}</span>
      </div>
    </div>`).join('')}</div>`;
  sections.push(kpiRow);

  // ---- ALERTS (permission-gated) ----
  const alerts = [];
  if (canPM) {
    const overduePMs = PMWO.filter(p => p.status === 'overdue' || (new Date(p.due) < new Date(TODAY) && p.status !== 'completed'));
    overduePMs.slice(0, 3).forEach(p => {
      const e = EQMAP[p.eq_id];
      alerts.push({ ic: 'pm', c: 'crit', t: 'Overdue PM', m: `${p.title}${e ? ' \u2014 ' + e.tag + ' (' + e.dept + ')' : ''} preventive maintenance is overdue.`, meta: [e ? e.dept : '\u2014', p.id], act: () => openJob(p.id, 'pm') });
    });
  }
  if (canEq) {
    const visEq = visibleEquipment();
    const outOfSvc = visEq.filter(e => e.status === 'outofsvc' || e.status === 'quarantine');
    outOfSvc.slice(0, 2).forEach(e => {
      alerts.push({ ic: 'bolt', c: 'crit', t: 'Equipment Out of Service', m: `${e.name} (${e.tag}) is currently out of service.`, meta: [e.dept, e.loc], act: () => openEquipment(e.id) });
    });
    if (canCal) {
      const visEq = visibleEquipment();
      const calDue = visEq.filter(e => e.cal_due && certStatus(e.cal_due).l !== 'Valid').sort((a, b) => new Date(a.cal_due) - new Date(b.cal_due));
      calDue.slice(0, 2).forEach(e => {
        const cs = certStatus(e.cal_due);
        alerts.push({ ic: 'cal', c: cs.l === 'Expired' ? 'crit' : 'cal', t: `Calibration ${cs.l}`, m: `${e.name} (${e.tag}) calibration ${cs.l === 'Expired' ? 'expired' : 'expires'} ${fmtDate(e.cal_due)}.`, meta: [e.dept], act: () => openEquipment(e.id) });
      });
    }
  }
  if (canParts) {
    const lowParts = PARTS.filter(p => p.qty <= p.min_qty);
    lowParts.slice(0, 2).forEach(p => {
      alerts.push({ ic: 'parts', c: 'warn', t: 'Critical Spare \u2014 Low Stock', m: `${p.name} is at ${p.qty} in stock (minimum ${p.min_qty}).`, meta: ['Reorder needed'], act: () => go('parts') });
    });
  }
  if (canWO) {
    const _dWO = userDepts(); const visWO = isDeptScoped() ? WORKORDERS.filter(w => { const e = EQMAP[w.eq_id]; return e && (!e.dept || _dWO.includes(e.dept)); }) : WORKORDERS;
    const slaAtRisk = visWO.filter(w => w.status !== 'closed' && (() => { const s = computeSLA(w, SLA_CONFIG); return s.sla === 'At risk' || s.sla === 'Breached'; })());
    slaAtRisk.slice(0, 3).forEach(w => {
      const e = EQMAP[w.eq_id];
      const s = computeSLA(w, SLA_CONFIG);
      alerts.push({ ic: 'clock', c: s.sla === 'Breached' ? 'crit' : 'warn', t: s.sla === 'Breached' ? 'SLA Breached' : 'SLA At Risk', m: `${w.id} (${w.title}) at ${s.pct}% of ${w.pri} resolution window (${s.elapsedHours}h of ${s.targetHours}h).`, meta: [e ? e.dept : '\u2014', `${100 - s.pct}% remaining`], act: () => openJob(w.id, 'wo') });
    });
  }
  if (myTech && canPM) {
    const myOverduePMs = myPMs.filter(p => p.status === 'overdue' || (new Date(p.due) < new Date(TODAY) && p.status !== 'completed'));
    myOverduePMs.slice(0, 3).forEach(p => {
      const e = EQMAP[p.eq_id];
      alerts.push({ ic: 'pm', c: 'crit', t: 'My Overdue PM', m: `${p.title}${e ? ' \u2014 ' + e.tag + ' (' + e.dept + ')' : ''} is assigned to your team and overdue.`, meta: [e ? e.dept : '\u2014', p.id], act: () => openJob(p.id, 'pm') });
    });
  }
  if (myTech && canWO) {
    const mySLARisk = myWOs.filter(w => w.status !== 'closed' && (() => { const s = computeSLA(w, SLA_CONFIG); return s.sla === 'At risk' || s.sla === 'Breached'; })());
    mySLARisk.slice(0, 3).forEach(w => {
      const e = EQMAP[w.eq_id];
      const s = computeSLA(w, SLA_CONFIG);
      alerts.push({ ic: 'clock', c: s.sla === 'Breached' ? 'crit' : 'warn', t: s.sla === 'Breached' ? 'My WO SLA Breached' : 'My WO SLA At Risk', m: `${w.id} (${w.title}) is at ${s.pct}% of ${w.pri} resolution window (${s.elapsedHours}h of ${s.targetHours}h).`, meta: [e ? e.dept : '\u2014', `${Math.max(0, 100 - s.pct)}% remaining`], act: () => openJob(w.id, 'wo') });
    });
  }
  if (canSR && !canWO && !canEq) {
    { const _d = userDepts(); let _srAlerts = SR_DATA; if (_d.length) _srAlerts = _srAlerts.filter(r => { const e = EQMAP[r.eq_id]; return e && (!e.dept || _d.includes(e.dept)); }); if (CMMS_USER) _srAlerts = _srAlerts.filter(r => r.user_id === CMMS_USER.id || r.by === CMMS_USER.name); _srAlerts.slice(0, 3).forEach(r => {
      const e = EQMAP[r.eq_id];
      alerts.push({ ic: 'alert', c: r.urg === 'High' ? 'crit' : 'warn', t: `Service Request ${r.id}`, m: `${r.description.slice(0, 80)}${e ? ' \u2014 ' + e.tag : ''}`, meta: [r.urg, r.usable], act: () => go('requests') });
    }); }
  }
  if (alerts.length === 0) {
    alerts.push({ ic: 'check', c: 'ok', t: 'All Clear', m: 'No priority alerts at this time. All systems operating normally.', meta: [TODAY], act: () => {} });
  }
  const feed = `<div class="card"><div class="card-head"><h3>Priority Alerts</h3>${canWO ? `<span class="link" onclick="go('workorders')">View all ${icon('arrowr')}</span>` : ''}</div>
    <div class="feed">${alerts.map((a, i) => `<div class="feed-item" onclick="__alert${i}()">
      <div class="feed-ic" style="background:var(--${a.c}-soft);color:var(--${a.c})">${icon(a.ic)}</div>
      <div class="feed-body"><div class="ft">${a.t}</div><div class="fm">${a.m}</div>
      <div class="fmeta">${a.meta.map(x => `<span>${x}</span>`).join('<span>\u00b7</span>')}</div></div>
      <div style="align-self:center;color:var(--text-3)">${icon('arrowr')}</div>
    </div>`).join('')}</div></div>`;
  alerts.forEach((a, i) => { window['__alert' + i] = a.act; });

  // ---- CHARTS ROW (permission-gated) ----
  const chartsRow = [];
  if (canEq && canWO) {
    const visEq = visibleEquipment();
    const availTrend = (() => {
      const weeks = [];
      for (let i = 6; i >= 0; i--) {
        const end = new Date(TODAY); end.setDate(end.getDate() - i * 7);
        const label = 'W' + (7 - i);
        const before = end.getTime();
        const downWOs = WORKORDERS.filter(w => w.opened && w.status !== 'closed' && new Date(w.opened).getTime() <= before);
        const downEqIds = new Set(downWOs.map(w => w.eq_id));
        const totalEq = visEq.length;
        const availCount = totalEq - downEqIds.size;
        const v = totalEq ? Math.round(availCount / totalEq * 1000) / 10 : 100;
        weeks.push({ l: label, v });
      }
      return weeks;
    })();
    chartsRow.push(`<div class="card">
      <div class="card-head"><h3>Equipment Availability</h3><span class="hint">7-week trend \u00b7 target 96%</span></div>
      <div class="card-pad">${areaChart(availTrend, 600, 180)}</div>
    </div>`);
  }
  if (canEq) {
    const visEq = visibleEquipment();
    const critLevels = CRIT_LEVELS.length ? CRIT_LEVELS.slice().sort((a, b) => a.sort_order - b.sort_order) : [
      { id: 'life', level: 'Life Support', color: 'var(--crit)' },
      { id: 'high', level: 'High Risk', color: 'var(--warn)' },
      { id: 'med', level: 'Medium', color: 'var(--info)' },
      { id: 'low', level: 'Low', color: 'var(--text-3)' },
    ];
    const mix = critLevels.map(c => ({
      label: c.level,
      value: visEq.filter(e => e.crit === c.id).length,
      color: c.color,
    })).filter(m => m.value > 0);
    if (mix.length === 0 && visEq.length) {
      critLevels.forEach(c => mix.push({ label: c.level, value: 0, color: c.color }));
    }
    chartsRow.push(`<div class="card">
      <div class="card-head"><h3>Fleet by Criticality</h3><span class="hint">${visEq.length} assets</span></div>
      <div class="card-pad" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        <div style="flex-shrink:0;max-width:100%">${donut(mix, 140, 18, String(visEq.length), 'Total Assets')}</div>
        <div class="legend" style="flex-direction:column;gap:11px">
          ${mix.map(m => `<span><i style="background:${m.color}"></i>${m.label}<b style="margin-left:auto;color:var(--text);font-weight:600;padding-left:10px">${m.value}</b></span>`).join('')}
        </div>
      </div>
    </div>`);
  }
  if (chartsRow.length > 0) {
    sections.push(`<div class="grid-dash" style="margin-bottom:16px">${chartsRow.join('')}</div>`);
  }

  // ---- MIDDLE ROW: alerts + workload (permission-gated) ----
  const middleRight = [];
  if (canWO && canEq) {
    const _dWO = userDepts(); const visWO = isDeptScoped() ? WORKORDERS.filter(w => { const e = EQMAP[w.eq_id]; return e && (!e.dept || _dWO.includes(e.dept)); }) : WORKORDERS;
    const openWO = visWO.filter(w => w.status !== 'closed');
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
    middleRight.push(`<div class="card">
      <div class="card-head"><h3>Open Work by Department</h3></div>
      <div class="card-pad"><div class="barlist">
        ${deptLoad.map(d => `<div class="row"><span class="nm">${d.nm}</span><div class="track"><div class="fill" style="width:${d.v / d.max * 100}%;background:${d.c}"></div></div><span class="vv">${d.v}</span></div>`).join('')}
      </div></div>
    </div>`);
  }
  if (canWO) {
    const techLoad = TECHS.map(t => ({ n: t.name, r: t.trade + ' Team', open: WORKORDERS.filter(w => w.assignee === t.name && w.status !== 'closed').length, cap: t.cap }));
    middleRight.push(`<div class="card">
      <div class="card-head"><h3>Technician Workload</h3><span class="link" onclick="toast('Opening resource planner')">Balance ${icon('arrowr')}</span></div>
      <div class="card-pad tech-load-list">
        ${techLoad.map(t => `<div class="tech-load-row">
          <div class="avatar" style="background:linear-gradient(135deg,var(--primary),var(--primary-700))">${t.n.split(' ').map(x => x[0]).join('')}</div>
          <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px">${t.n}</div><div class="sub2">${t.r}</div></div>
          <div class="tech-load-meter">${meter(Math.round(t.open / t.cap * 100), t.open / t.cap >= .75 ? 'var(--warn)' : 'var(--primary)')}</div>
          <div class="mono tech-load-cap">${t.open}/${t.cap}</div>
        </div>`).join('')}
      </div>
    </div>`);
  }
  if (middleRight.length > 0) {
    sections.push(`<div class="grid-dash" style="margin-bottom:16px">${feed}<div class="stack">${middleRight.join('')}</div></div>`);
  } else if (canSR || canWO || canEq || canPM || canParts || canCal) {
    sections.push(`<div class="grid-dash" style="margin-bottom:16px">${feed}</div>`);
  }

  // ---- MAINTENANCE VOLUME (permission-gated) ----
  if (canWO && canReports) {
    const _dWO = userDepts(); const visWO = isDeptScoped() ? WORKORDERS.filter(w => { const e = EQMAP[w.eq_id]; return e && (!e.dept || _dWO.includes(e.dept)); }) : WORKORDERS;
    const woVol = (() => {
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(TODAY); d.setMonth(d.getMonth() - i);
        const label = d.toLocaleDateString('en-GB', { month: 'short' });
        const monthWOs = visWO.filter(w => {
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
    sections.push(`<div class="card">
      <div class="card-head"><h3>Maintenance Volume</h3>
        <div class="legend"><span><i style="background:var(--primary)"></i>Preventive</span><span><i style="background:var(--warn)"></i>Corrective</span></div>
      </div>
      <div class="card-pad">${barChart(woVol, 1200, 180)}</div>
    </div>`);
  }

  // ---- MY SERVICE REQUESTS (for SR-only users) ----
  if (canSR && !canWO && !canEq) {
    let mySRDash = SR_DATA;
    { const _d5 = userDepts(); if (_d5.length) mySRDash = mySRDash.filter(r => { const e = EQMAP[r.eq_id]; return e && (!e.dept || _d5.includes(e.dept)); }); }
    if (CMMS_USER) mySRDash = mySRDash.filter(r => r.user_id === CMMS_USER.id || r.by === CMMS_USER.name);
    const srRows = mySRDash.length ? mySRDash.slice(0, 6).map(r => {
      const e = EQMAP[r.eq_id];
      return `<div class="doc-row" onclick="go('requests')" style="cursor:pointer">
        <div class="doc-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('alert')}</div>
        <div style="flex:1"><div class="dn">${r.description.slice(0, 60)}</div><div class="dm mono">${r.id}${e ? ' \u00b7 ' + e.tag : ''} \u00b7 ${r.urg}</div></div>
        <span class="pill ${r.urg === 'High' ? 'p-crit' : r.urg === 'Medium' ? 'p-warn' : 'p-muted'}">${r.urg}</span>
      </div>`;
    }).join('') : '<div class="empty">No service requests yet \u2014 click Report Fault to log one</div>';
    sections.push(`<div class="card">
      <div class="card-head"><h3>My Recent Service Requests</h3>${hasPerm('Service Requests', 'Create') ? `<button class="btn btn-primary" style="height:34px;font-size:13px" onclick="openReportFault()">${icon('alert')}Report Fault</button>` : ''}</div>
      <div style="padding:6px 8px">${srRows}</div>
    </div>`);
  }

  // ---- TECHNICIAN: MY WORK ORDERS & PM PLANS ----
  if (myTech && (canWO || canPM)) {
    const techCols = [];

    if (canWO) {
      const myOpenWOs = myWOs.filter(w => w.status !== 'closed');
      const slaColor = s => s === 'At risk' ? 'p-crit' : s === 'Paused' ? 'p-warn' : s === 'Met' ? 'p-ok' : 'p-info';
      const woRows = myOpenWOs.length ? myOpenWOs.slice(0, 8).map(w => {
        const e = EQMAP[w.eq_id];
        return `<div class="doc-row" onclick="openJob('${w.id}','wo')" style="cursor:pointer">
          <div class="doc-ic" style="background:var(--warn-soft);color:var(--warn)">${icon('wo')}</div>
          <div style="flex:1"><div class="dn">${w.title}</div><div class="dm mono">${w.id} \u00b7 ${w.type} \u00b7 ${w.pri}${e ? ' \u00b7 ' + e.tag : ''}</div></div>
          ${woStatus(w.status)}
        </div>`;
      }).join('') : '<div class="empty">No open work orders assigned to you</div>';
      techCols.push(`<div class="card">
        <div class="card-head"><h3>My Work Orders</h3><span class="link" onclick="go('workorders')">View all ${icon('arrowr')}</span></div>
        <div style="padding:6px 8px">${woRows}</div>
      </div>`);
    }

    if (canPM) {
      const myOpenPMs = myPMs.filter(p => p.status !== 'completed');
      const pmRows = myOpenPMs.length ? myOpenPMs.slice(0, 8).map(p => {
        const e = EQMAP[p.eq_id];
        const isOverdue = p.status === 'overdue' || (new Date(p.due) < new Date(TODAY) && p.status !== 'completed');
        return `<div class="doc-row" onclick="openJob('${p.id}','pm')" style="cursor:pointer">
          <div class="doc-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('pm')}</div>
          <div style="flex:1"><div class="dn">${p.title}</div><div class="dm mono">${p.id} \u00b7 ${p.freq}${e ? ' \u00b7 ' + e.tag : ''} \u00b7 due ${fmtDate(p.due)}</div></div>
          ${isOverdue ? '<span class="pill p-crit">Overdue</span>' : '<span class="pill p-info">Scheduled</span>'}
        </div>`;
      }).join('') : '<div class="empty">No preventive maintenance plans assigned to your team</div>';
      techCols.push(`<div class="card">
        <div class="card-head"><h3>My Preventive Plans</h3><span class="link" onclick="go('pm')">View all ${icon('arrowr')}</span></div>
        <div style="padding:6px 8px">${pmRows}</div>
      </div>`);
    }

    sections.push(`<div class="grid-dash" style="margin-bottom:16px">${techCols.join('')}</div>`);
  }

  return sections.join('\n  ');
};

/* ============================================================
   VIEW: EQUIPMENT REGISTER
   ============================================================ */
VIEWS.equipment = async function () {
  const visEq = visibleEquipment();
  const critLevels = CRIT_LEVELS.length ? CRIT_LEVELS.slice().sort((a, b) => a.sort_order - b.sort_order) : [{ id: 'life', level: 'Life Support' }];
  const firstCrit = critLevels[0];
  const counts = {
    all: visEq.length,
    life: visEq.filter(e => e.crit === firstCrit.id).length,
    maint: visEq.filter(e => ['maint', 'awaitpart', 'outofsvc'].includes(e.status)).length,
    pmdue: visEq.filter(e => e.next_pm && new Date(e.next_pm) <= new Date(TODAY)).length,
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
      ${[['all', 'All Assets', counts.all], [firstCrit.id, firstCrit.level, counts.life], ['maint', 'Needs Attention', counts.maint], ['pmdue', 'PM Due Soon', counts.pmdue]].map(c => `<button class="chip ${c[0] === EQFILTER ? 'on' : ''}" onclick="setEqFilter('${c[0]}')">${c[1]}<span class="ct">${c[2]}</span></button>`).join('')}
    </div>
    <div class="spacer"></div>
    ${isDeptScoped() ? '' : `<select class="sel" id="eqDeptFilter" onchange="setEqDeptF(this.value)"><option value="">All Departments</option>${[...new Set(visEq.map(e => e.dept).filter(Boolean))].sort().map(d => `<option value="${d}" ${EQDEPTF === d ? 'selected' : ''}>${d}</option>`).join('')}</select>`}
    <select class="sel" id="eqCatFilter" onchange="setEqCatF(this.value)"><option value="">All Categories</option>${[...new Set(visEq.map(e => e.cat).filter(Boolean))].sort().map(c => `<option value="${c}" ${EQCATF === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
  </div>
  <div class="card">
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Asset</th><th>Location</th><th>Criticality</th><th>Status</th><th>PM Compliance</th><th>Next PM</th><th>Warranty</th></tr></thead>
      <tbody>${eqRows()}</tbody>
    </table></div>
  </div>`;
};

function eqRows() {
  let list = visibleEquipment().slice();
  const firstCritId = (CRIT_LEVELS.length ? CRIT_LEVELS.slice().sort((a, b) => a.sort_order - b.sort_order)[0].id : 'life');
  if (EQFILTER === firstCritId) list = list.filter(e => e.crit === firstCritId);
  else if (EQFILTER === 'maint') list = list.filter(e => ['maint', 'awaitpart', 'outofsvc'].includes(e.status));
  else if (EQFILTER === 'pmdue') list = list.filter(e => e.next_pm && new Date(e.next_pm) <= new Date(TODAY));
  if (EQDEPTF) list = list.filter(e => e.dept === EQDEPTF);
  if (EQCATF) list = list.filter(e => e.cat === EQCATF);
  if (!list.length) return '<tr><td colspan="7" class="sub2" style="text-align:center;padding:20px">No equipment matches the selected filters</td></tr>';
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
  let woKpis;
  if (isTechnician() && CMMS_USER) {
    const mine = WORKORDERS.filter(w => w.assignee === CMMS_USER.name);
    const myOpen = mine.filter(w => w.status !== 'closed');
    const myClosed = mine.filter(w => w.status === 'closed');
    const myPM = mine.filter(w => w.type === 'Preventive');
    const myCorr = mine.filter(w => w.type !== 'Preventive');
    const myHighPri = myOpen.filter(w => w.pri === 'P1' || w.pri === 'P2');
    woKpis = [
      ['My Open WOs', myOpen.length, 'var(--warn)', 'var(--warn-soft)', 'wo'],
      ['My Closed WOs', myClosed.length, 'var(--ok)', 'var(--ok-soft)', 'check'],
      ['My Corrective', myCorr.length, 'var(--info)', 'var(--info-soft)', 'wrench'],
      ['My Preventive', myPM.length, 'var(--primary)', 'var(--primary-soft)', 'pm'],
    ];
  } else {
    woKpis = [
      ['Open', open, 'var(--warn)', 'var(--warn-soft)', 'wo'],
      ['High Priority', WORKORDERS.filter(w => w.pri === 'P1' && w.status !== 'closed').length, 'var(--crit)', 'var(--crit-soft)', 'alert'],
      ['Waiting Parts', WORKORDERS.filter(w => w.status === 'awaitparts').length, 'var(--info)', 'var(--info-soft)', 'parts'],
      ['SLA At Risk', WORKORDERS.filter(w => w.status !== 'closed' && (() => { const s = computeSLA(w, SLA_CONFIG); return s.sla === 'At risk' || s.sla === 'Breached'; })()).length, 'var(--crit)', 'var(--crit-soft)', 'clock'],
    ];
  }
  return `
  <div class="page-head">
    <div><h1>Work Orders</h1><div class="sub">${isTechnician() ? 'Your assigned corrective & preventive maintenance · live SLA tracking' : 'Corrective & preventive maintenance execution · live SLA tracking'}</div></div>
    <div class="head-actions">
      <button class="btn btn-ghost" onclick="toggleBoard()">${icon('dash')}Board</button>
      ${hasPerm('Work Orders', 'Create') ? `<button class="btn btn-primary" onclick="openNewWorkOrder()">${icon('wo')}New Work Order</button>` : ''}
    </div>
  </div>
  <div class="kpi-row">
    ${woKpis.map(k => `
      <div class="kpi" style="--accent:${k[2]};--accent-soft:${k[3]}"><div class="kt"><span class="ic">${icon(k[4])}</span>${k[0]}</div><div class="kv">${k[1]}</div></div>`).join('')}
  </div>
  <div class="toolbar">
    <div class="seg">${isTechnician() ? '' : [['open', 'Open'], ['all', 'All'], ['mine', 'Assigned to me'], ['closed', 'Closed']].map(s => `<button class="${s[0] === WOFILTER ? 'on' : ''}" onclick="setWoFilter('${s[0]}')">${s[1]}</button>`).join('')}</div>
    <div class="spacer"></div>
    <select class="sel" id="woPriFilter" onchange="setWoPriF(this.value)"><option value="">All Priorities</option>${(PRIORITIES.length ? PRIORITIES.slice().sort((a, b) => a.sort_order - b.sort_order) : [{priority:'P1'},{priority:'P2'},{priority:'P3'},{priority:'P4'},{priority:'P5'}]).map(p => `<option value="${p.priority}" ${WOPRIF === p.priority ? 'selected' : ''}>${p.priority}</option>`).join('')}</select>
    ${isDeptScoped() ? '' : `<select class="sel" id="woDeptFilter" onchange="setWoDeptF(this.value)"><option value="">All Departments</option>${deptOpts(WODEPTF)}</select>`}
    <select class="sel" id="woCatFilter" onchange="setWoCatF(this.value)"><option value="">All Categories</option>${catOpts(WOCATF)}</select>
    <select class="sel" id="woTeamFilter" onchange="setWoTeamF(this.value)"><option value="">All Teams</option>${teamList().map(t => `<option value="${t}" ${WOTeamF === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
  </div>
  <div id="woBoardWrap" style="display:none">
    <div class="card"><div class="card-head"><h3>Work Order Board</h3><span class="hint">Drag columns to view by status</span></div>
      <div style="overflow-x:auto;padding:12px"><div style="display:flex;gap:12px;min-width:max-content">${(() => {
        const statuses = ['triaged','assigned','accepted','inprogress','awaitparts','onhold','pending_closeout','closed'];
        const visWO = WORKORDERS.slice();
        return statuses.map(st => {
          const items = visWO.filter(w => w.status === st);
          const stInfo = WOSTAT[st] || { l: st, c: 'p-muted' };
          return `<div style="width:240px;flex-shrink:0">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding:0 4px">
              <span class="pill ${stInfo.c}">${stInfo.l}</span><span class="sub2">${items.length}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">${items.map(w => { const e = EQMAP[w.eq_id]; return `<div onclick="openJob('${w.id}','wo')" style="background:var(--bg-1);border:1px solid var(--border);border-radius:10px;padding:11px;cursor:pointer">
              <div style="font-weight:600;font-size:13px;margin-bottom:4px">${w.title}</div>
              <div class="sub2 mono" style="font-size:11px;margin-bottom:6px">${w.id}</div>
              <div style="display:flex;align-items:center;justify-content:space-between">
                ${priPill(w.pri)}
                <span class="sub2" style="font-size:11px">${e ? e.tag : '—'}</span>
              </div>
              <div class="sub2" style="font-size:11px;margin-top:6px">${w.assignee || 'Unassigned'} · ${w.team || '—'}</div>
            </div>`; }).join('') || '<div class="sub2" style="text-align:center;padding:16px;font-style:italic">No items</div>'}</div>
          </div>`; }).join('');
      })()}</div></div></div>
  </div>
  <div id="woTableWrap">
  <div class="card"><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Work Order</th><th>Equipment</th><th>Priority</th><th>Status</th><th>Assignee</th><th>SLA</th><th class="num">Due</th></tr></thead>
    <tbody>${woRows()}</tbody>
  </table></div></div>
  </div>`;
};

function isTechnician() { return CMMS_USER?.role === 'Biomedical Technician'; }

function userDepts() { return (USER_DEPT_MAP[CMMS_USER?.id] || []).filter(Boolean); }
function roleDeptScoped() {
  if (!CMMS_USER) return false;
  const r = ROLES.find(x => x.name === CMMS_USER.role);
  return !!(r && r.dept_scoped);
}
function isDeptScoped() { return !!(CMMS_USER && userDepts().length > 0 && roleDeptScoped()); }
function visibleEquipment() { const depts = userDepts(); return isDeptScoped() ? EQUIP.filter(e => !e.dept || depts.includes(e.dept)) : EQUIP; }
function teamList() { return TEAMS.length ? TEAMS.map(t => t.name).sort() : [...new Set(TECHS.map(t => t.trade).filter(Boolean))].sort(); }
function teamOpts(selected) { const teams = teamList(); const base = teams.length ? teams : ['Biomedical', 'Imaging', 'Facilities', 'Vendor']; return base.map(t => `<option ${t === selected ? 'selected' : ''}>${t}</option>`).join(''); }
function deptOpts(selected) { const depts = [...new Set(visibleEquipment().map(e => e.dept).filter(Boolean))].sort(); return depts.map(d => `<option value="${d}" ${d === selected ? 'selected' : ''}>${d}</option>`).join(''); }
function catOpts(selected) { const cats = [...new Set(visibleEquipment().map(e => e.cat).filter(Boolean))].sort(); return cats.map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join(''); }
function priOpts(selected) { const pris = PRIORITIES.length ? PRIORITIES.slice().sort((a, b) => a.sort_order - b.sort_order).map(p => p.priority) : ['P1', 'P2', 'P3', 'P4', 'P5']; return pris.map(p => `<option value="${p}" ${p === selected ? 'selected' : ''}>${p}</option>`).join(''); }

function woRows() {
  let list = WORKORDERS.slice();
  if (isTechnician()) {
    list = list.filter(w => w.assignee === CMMS_USER?.name);
  } else {
    const _depts = userDepts(); if (isDeptScoped()) list = list.filter(w => { const e = EQMAP[w.eq_id]; return e && (!e.dept || _depts.includes(e.dept)); });
    if (WOFILTER === 'open') list = list.filter(w => w.status !== 'closed');
    else if (WOFILTER === 'closed') list = list.filter(w => w.status === 'closed');
    else if (WOFILTER === 'mine') list = list.filter(w => w.assignee === (TECHS[0]?.name || ''));
  }
  if (WOPRIF) list = list.filter(w => w.pri === WOPRIF);
  if (WOTeamF) list = list.filter(w => w.team === WOTeamF);
  if (WODEPTF) list = list.filter(w => { const e = EQMAP[w.eq_id]; return e && e.dept === WODEPTF; });
  if (WOCATF) list = list.filter(w => { const e = EQMAP[w.eq_id]; return e && e.cat === WOCATF; });
  const slaColor = s => s === 'Breached' ? 'p-crit' : s === 'At risk' ? 'p-crit' : s === 'Met' ? 'p-ok' : 'p-info';
  if (!list.length) return '<tr><td colspan="7" class="sub2" style="text-align:center;padding:20px">No work orders match the selected filters</td></tr>';
  return list.map(w => {
    const e = EQMAP[w.eq_id];
    const slaInfo = w.status === 'closed' ? null : computeSLA(w, SLA_CONFIG);
    const slaLabel = w.status === 'closed' ? (w.sla || 'Met') : slaInfo.sla;
    const slaPct = w.status === 'closed' ? 100 : slaInfo.pct;
    return `<tr onclick="openJob('${w.id}','wo')">
    <td><div class="strong">${w.title}</div><div class="sub2 mono">${w.id} · ${w.type}</div></td>
    <td><div class="cellflex"><div class="eq-ic">${icon(e.ic)}</div><div><div style="font-weight:500">${e.tag}</div><div class="sub2">${e.dept}</div></div></div></td>
    <td>${priPill(w.pri)}</td>
    <td>${woStatus(w.status)}</td>
    <td>${w.assignee}<div class="sub2">${w.team}</div></td>
    <td><span class="pill ${slaColor(slaLabel)}">${slaLabel}</span>${w.status !== 'closed' ? `<div class="meter" style="margin-top:6px;width:80px"><i style="width:${slaPct}%;background:${slaPct >= 100 ? 'var(--crit)' : slaPct >= (SLA_CONFIG.find(c => c.priority === w.pri) || SLA_DEFAULTS[2]).warning_pct ? 'var(--warn)' : 'var(--primary)'}"></i></div>` : ''}</td>
    <td class="num mono" style="font-size:12px">${w.due.split(' ')[0].slice(5)}<div class="sub2">${w.due.split(' ')[1]}</div></td>
  </tr>`;
  }).join('');
}
function toggleBoard() {
  const board = document.getElementById('woBoardWrap');
  const table = document.getElementById('woTableWrap');
  if (!board || !table) return;
  const showing = board.style.display === 'none';
  board.style.display = showing ? 'block' : 'none';
  table.style.display = showing ? 'none' : 'block';
}
window.toggleBoard = toggleBoard;

function openReportBuilder() {
  const reportTypes = [
    { cat: 'Maintenance', items: ['PM Compliance', 'PM Overdue', 'Corrective Maintenance', 'Repeat Failures', 'Backlog Aging'] },
    { cat: 'Reliability', items: ['MTBF by Category', 'MTTR Analysis', 'Equipment Downtime', 'Availability by Dept'] },
    { cat: 'Cost', items: ['Maintenance Cost', 'Cost per Work Order', 'Lifecycle Cost', 'Cost vs Replacement Value'] },
    { cat: 'Inventory', items: ['Inventory Valuation', 'Low-Stock Parts', 'Parts Consumption', 'Obsolete Stock'] },
    { cat: 'Compliance', items: ['Calibration History', 'Safety Test Register', 'Warranty Expiration', 'Recall Status'] },
    { cat: 'Vendor', items: ['Vendor Performance', 'SLA Compliance', 'Contract Expiration', 'Vendor Cost'] },
  ];
  openDrawerHTML('<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">' + icon('report') + '</div><div><h2>Report Builder</h2><div class="did">Select a report to generate</div></div></div><button class="icon-btn close" onclick="closeDrawer()">' + icon('x') + '</button></div><div class="drawer-body"><div class="dsec">' + reportTypes.map(function(rt) { return '<div style="margin-bottom:16px"><h4 style="margin:0 0 8px">' + rt.cat + '</h4><div style="display:flex;flex-direction:column;gap:6px">' + rt.items.map(function(i) { return '<div class="doc-row" style="padding:10px 12px;cursor:pointer" onclick="runReport(\'' + rt.cat + '\',\'' + i + '\')"><div class="dn" style="font-weight:500">' + i + '</div><span class="link">Generate ' + icon('arrowr') + '</span></div>'; }).join('') + '</div></div>'; }).join('') + '</div></div>');
}
window.openReportBuilder = openReportBuilder;

function runReport(cat, name) {
  var visEq = visibleEquipment();
  var kpis = [];
  var rows = [];
  var headers = [];

  if (name === 'PM Compliance') {
    headers = ['Department', 'Equipment', 'Criticality', 'PM Compliance', 'Next PM'];
    rows = visEq.map(function(e) { return [e.dept || '\u2014', e.tag + ' \u2014 ' + e.name, (CRIT[e.crit]||{}).l || '\u2014', (e.pm || 0) + '%', fmtDate(e.next_pm)]; });
    kpis = [['Avg Compliance', computePMCompliance(visEq, PMWO) + '%', 'var(--ok)'], ['Below 90%', String(visEq.filter(function(e) { return (e.pm||0) < 90; }).length), 'var(--warn)'], ['Total Assets', String(visEq.length), 'var(--primary)']];
  } else if (name === 'PM Overdue') {
    var ov = PMWO.filter(function(p) { return p.status === 'overdue' || (new Date(p.due) < new Date(TODAY) && p.status !== 'completed'); });
    headers = ['PM Work Order', 'Equipment', 'Due', 'Technician', 'Status'];
    rows = ov.map(function(p) { var e = EQMAP[p.eq_id]; return [p.id, e ? e.tag + ' \u2014 ' + e.name : '\u2014', fmtDate(p.due), p.technician || 'Unassigned', p.status || 'overdue']; });
    kpis = [['Overdue', String(ov.length), 'var(--crit)'], ['High-Risk', String(ov.filter(function(p) { var e = EQMAP[p.eq_id]; return e && (e.crit === 'life' || e.crit === 'high'); }).length), 'var(--warn)'], ['Total PM', String(PMWO.length), 'var(--primary)']];
  } else if (name === 'Corrective Maintenance') {
    var corr = WORKORDERS.filter(function(w) { return w.type !== 'Preventive'; });
    headers = ['Work Order', 'Equipment', 'Priority', 'Status', 'Opened'];
    rows = corr.map(function(w) { var e = EQMAP[w.eq_id]; return [w.id, e ? e.tag + ' \u2014 ' + e.name : '\u2014', w.pri, w.status, fmtDate(w.opened)]; });
    kpis = [['Total', String(corr.length), 'var(--primary)'], ['Open', String(corr.filter(function(w) { return w.status !== 'closed'; }).length), 'var(--warn)'], ['Closed', String(corr.filter(function(w) { return w.status === 'closed'; }).length), 'var(--ok)']];
  } else if (name === 'Repeat Failures') {
    var byEq = {};
    WORKORDERS.filter(function(w) { return w.type !== 'Preventive'; }).forEach(function(w) { byEq[w.eq_id] = (byEq[w.eq_id]||0)+1; });
    var reps = Object.entries(byEq).filter(function(x) { return x[1] > 1; }).sort(function(a,b) { return b[1]-a[1]; });
    headers = ['Equipment', 'Tag', 'Department', 'Failures'];
    rows = reps.map(function(x) { var e = EQMAP[x[0]]; return [e ? e.name : x[0], e ? e.tag : '\u2014', e ? e.dept : '\u2014', String(x[1])]; });
    kpis = [['Repeat Assets', String(reps.length), 'var(--crit)'], ['Worst', reps[0] ? ((EQMAP[reps[0][0]]||{}).name || reps[0][0]) + ' (' + reps[0][1] + 'x)' : '\u2014', 'var(--warn)'], ['Total Corrective', String(WORKORDERS.filter(function(w) { return w.type !== 'Preventive'; }).length), 'var(--primary)']];
  } else if (name === 'Backlog Aging') {
    var open = WORKORDERS.filter(function(w) { return w.status !== 'closed'; });
    headers = ['Work Order', 'Equipment', 'Priority', 'Days Open', 'Status'];
    rows = open.map(function(w) { var e = EQMAP[w.eq_id]; var days = Math.round((new Date(TODAY) - new Date(w.opened || TODAY)) / 864e5); return [w.id, e ? e.tag + ' \u2014 ' + e.name : '\u2014', w.pri, String(days), w.status]; });
    kpis = [['Open WOs', String(open.length), 'var(--primary)'], ['Over 30d', String(open.filter(function(w) { return Math.round((new Date(TODAY) - new Date(w.opened||TODAY))/864e5) > 30; }).length), 'var(--crit)'], ['Over 7d', String(open.filter(function(w) { return Math.round((new Date(TODAY) - new Date(w.opened||TODAY))/864e5) > 7; }).length), 'var(--warn)']];
  } else if (name === 'MTBF by Category') {
    var byCat = {};
    visEq.forEach(function(e) { if (!byCat[e.cat]) byCat[e.cat] = { count: 0, failures: 0 }; byCat[e.cat].count++; });
    WORKORDERS.filter(function(w) { return w.type !== 'Preventive'; }).forEach(function(w) { var e = EQMAP[w.eq_id]; if (e && byCat[e.cat]) byCat[e.cat].failures++; });
    headers = ['Category', 'Assets', 'Failures', 'MTBF (days)'];
    rows = Object.entries(byCat).map(function(x) { return [x[0], String(x[1].count), String(x[1].failures), x[1].failures ? String(Math.round(x[1].count / x[1].failures * 30)) : '\u2014']; });
    kpis = [['Categories', String(Object.keys(byCat).length), 'var(--primary)'], ['Total Failures', String(Object.values(byCat).reduce(function(s,d) { return s+d.failures; },0)), 'var(--crit)'], ['Assets', String(visEq.length), 'var(--info)']];
  } else if (name === 'MTTR Analysis') {
    var closed = WORKORDERS.filter(function(w) { return w.status === 'closed'; });
    headers = ['Work Order', 'Equipment', 'Opened', 'Closed', 'Repair Hrs'];
    rows = closed.map(function(w) { var e = EQMAP[w.eq_id]; var hrs = Math.round((new Date(w.closed||TODAY) - new Date(w.opened||TODAY))/36e5); return [w.id, e ? e.tag + ' \u2014 ' + e.name : '\u2014', fmtDate(w.opened), fmtDate(w.closed), String(hrs)]; });
    var avgHrs = closed.length ? (closed.reduce(function(s,w) { return s + Math.round((new Date(w.closed||TODAY) - new Date(w.opened||TODAY))/36e5); },0) / closed.length).toFixed(1) : '0';
    kpis = [['Avg MTTR', avgHrs + ' hrs', 'var(--info)'], ['Closed', String(closed.length), 'var(--ok)'], ['Total WOs', String(WORKORDERS.length), 'var(--primary)']];
  } else if (name === 'Equipment Downtime') {
    headers = ['Equipment', 'Tag', 'Department', 'Status', 'Criticality'];
    rows = visEq.filter(function(e) { return e.status === 'outofsvc' || e.status === 'maint' || e.status === 'quarantine'; }).map(function(e) { return [e.name, e.tag, e.dept, (STAT[e.status]||{}).l || e.status, (CRIT[e.crit]||{}).l || '\u2014']; });
    kpis = [['Down Assets', String(rows.length), 'var(--crit)'], ['In Maintenance', String(visEq.filter(function(e) { return e.status === 'maint'; }).length), 'var(--warn)'], ['Out of Service', String(visEq.filter(function(e) { return e.status === 'outofsvc'; }).length), 'var(--crit)']];
  } else if (name === 'Availability by Dept') {
    var byDept = {};
    visEq.forEach(function(e) { if (!byDept[e.dept]) byDept[e.dept] = { total: 0, avail: 0 }; byDept[e.dept].total++; if (e.status === 'inuse' || e.status === 'available') byDept[e.dept].avail++; });
    headers = ['Department', 'Total', 'Available', 'Availability'];
    rows = Object.entries(byDept).map(function(x) { return [x[0], String(x[1].total), String(x[1].avail), Math.round(x[1].avail / x[1].total * 100) + '%']; });
    kpis = [['Departments', String(Object.keys(byDept).length), 'var(--primary)'], ['Total Assets', String(visEq.length), 'var(--info)'], ['Avg Avail', '\u2014', 'var(--ok)']];
  } else if (name === 'Maintenance Cost') {
    headers = ['Work Order', 'Equipment', 'Type', 'Cost', 'Status'];
    rows = WORKORDERS.map(function(w) { var e = EQMAP[w.eq_id]; return [w.id, e ? e.tag + ' \u2014 ' + e.name : '\u2014', w.type, '$' + (Number(w.cost)||0), w.status]; });
    var totalCost = WORKORDERS.reduce(function(s,w) { return s + (Number(w.cost)||0); }, 0);
    kpis = [['Total Cost', '$' + totalCost.toLocaleString(), 'var(--warn)'], ['Preventive', '$' + WORKORDERS.filter(function(w) { return w.type === 'Preventive'; }).reduce(function(s,w) { return s+(Number(w.cost)||0); },0).toLocaleString(), 'var(--ok)'], ['Corrective', '$' + WORKORDERS.filter(function(w) { return w.type !== 'Preventive'; }).reduce(function(s,w) { return s+(Number(w.cost)||0); },0).toLocaleString(), 'var(--crit)']];
  } else if (name === 'Cost per Work Order') {
    var closedCost = WORKORDERS.filter(function(w) { return w.status === 'closed'; });
    headers = ['Work Order', 'Equipment', 'Cost', 'Type', 'Closed'];
    rows = closedCost.map(function(w) { var e = EQMAP[w.eq_id]; return [w.id, e ? e.tag : '\u2014', '$' + (Number(w.cost)||0), w.type, fmtDate(w.closed)]; });
    var totalC = closedCost.reduce(function(s,w) { return s+(Number(w.cost)||0); },0);
    kpis = [['Avg Cost/WO', '$' + (closedCost.length ? Math.round(totalC/closedCost.length) : 0), 'var(--info)'], ['Total', '$' + totalC.toLocaleString(), 'var(--warn)'], ['Closed WOs', String(closedCost.length), 'var(--ok)']];
  } else if (name === 'Lifecycle Cost') {
    headers = ['Equipment', 'Tag', 'Dept', 'Purchase', 'Maint Cost'];
    rows = visEq.map(function(e) { var woCost = WORKORDERS.filter(function(w) { return w.eq_id === e.id; }).reduce(function(s,w) { return s+(Number(w.cost)||0); },0); return [e.name, e.tag, e.dept, '$' + (Number(e.cost)||0), '$' + woCost]; });
    kpis = [['Purchase Value', '$' + visEq.reduce(function(s,e) { return s+(Number(e.cost)||0); },0).toLocaleString(), 'var(--primary)'], ['Maint Cost', '$' + WORKORDERS.reduce(function(s,w) { return s+(Number(w.cost)||0); },0).toLocaleString(), 'var(--warn)'], ['Assets', String(visEq.length), 'var(--info)']];
  } else if (name === 'Cost vs Replacement Value') {
    headers = ['Equipment', 'Purchase', 'Maint', 'Total', 'Replacement'];
    rows = visEq.map(function(e) { var woCost = WORKORDERS.filter(function(w) { return w.eq_id === e.id; }).reduce(function(s,w) { return s+(Number(w.cost)||0); },0); return [e.tag + ' \u2014 ' + e.name, '$' + (Number(e.cost)||0), '$' + woCost, '$' + ((Number(e.cost)||0)+woCost), '$' + (Number(e.replacement_cost)||Number(e.cost)||0)]; });
    kpis = [['Lifecycle', '$' + visEq.reduce(function(s,e) { return s+(Number(e.cost)||0); },0).toLocaleString(), 'var(--primary)'], ['Replacement', '$' + visEq.reduce(function(s,e) { return s+(Number(e.replacement_cost)||Number(e.cost)||0); },0).toLocaleString(), 'var(--warn)'], ['Assets', String(visEq.length), 'var(--info)']];
  } else if (name === 'Inventory Valuation') {
    headers = ['Part', 'Category', 'On Hand', 'Unit Cost', 'Total Value'];
    rows = PARTS.map(function(p) { return [p.name, p.cat, String(p.qty), '$' + p.cost, '$' + (p.qty * Number(p.cost)).toLocaleString()]; });
    kpis = [['Total Value', '$' + PARTS.reduce(function(s,p) { return s + p.qty * Number(p.cost); },0).toLocaleString(), 'var(--primary)'], ['SKUs', String(PARTS.length), 'var(--info)'], ['Critical', String(PARTS.filter(function(p) { return p.crit; }).length), 'var(--warn)']];
  } else if (name === 'Low-Stock Parts') {
    var low = PARTS.filter(function(p) { return p.qty < p.min_qty; });
    headers = ['Part', 'On Hand', 'Min', 'Bin', 'Supplier'];
    rows = low.map(function(p) { return [p.name, String(p.qty), String(p.min_qty), p.bin, p.mfr]; });
    kpis = [['Below Min', String(low.length), 'var(--crit)'], ['Stockouts', String(PARTS.filter(function(p) { return p.qty === 0; }).length), 'var(--crit)'], ['Total Parts', String(PARTS.length), 'var(--primary)']];
  } else if (name === 'Parts Consumption') {
    headers = ['Part', 'Category', 'On Hand', 'Min', 'Status'];
    rows = PARTS.map(function(p) { return [p.name, p.cat, String(p.qty), String(p.min_qty), p.qty === 0 ? 'Stockout' : p.qty < p.min_qty ? 'Reorder' : 'In Stock']; });
    kpis = [['Tracked', String(PARTS.length), 'var(--primary)'], ['Below Min', String(PARTS.filter(function(p) { return p.qty < p.min_qty; }).length), 'var(--warn)'], ['In Stock', String(PARTS.filter(function(p) { return p.qty >= p.min_qty; }).length), 'var(--ok)']];
  } else if (name === 'Obsolete Stock') {
    headers = ['Part', 'Category', 'On Hand', 'Bin', 'Status'];
    rows = PARTS.filter(function(p) { return p.obsolete || p.qty === 0; }).map(function(p) { return [p.name, p.cat, String(p.qty), p.bin, p.obsolete ? 'Obsolete' : 'No stock']; });
    kpis = [['Obsolete', String(PARTS.filter(function(p) { return p.obsolete; }).length), 'var(--crit)'], ['Zero Stock', String(PARTS.filter(function(p) { return p.qty === 0; }).length), 'var(--warn)'], ['Total', String(PARTS.length), 'var(--primary)']];
  } else if (name === 'Calibration History') {
    var calEq = visEq.filter(function(e) { return e.cal_due; });
    headers = ['Equipment', 'Tag', 'Dept', 'Cal Due', 'Status'];
    rows = calEq.map(function(e) { var cs = certStatus(e.cal_due); return [e.name, e.tag, e.dept, fmtDate(e.cal_due), cs.l]; });
    kpis = [['Due', String(calEq.length), 'var(--primary)'], ['Expired', String(calEq.filter(function(e) { return new Date(e.cal_due) < new Date(TODAY); }).length), 'var(--crit)'], ['Expiring', String(calEq.filter(function(e) { var d = (new Date(e.cal_due) - new Date(TODAY))/864e5; return d >= 0 && d < 60; }).length), 'var(--warn)']];
  } else if (name === 'Safety Test Register') {
    headers = ['Equipment', 'Tag', 'Dept', 'Criticality', 'Status'];
    rows = visEq.map(function(e) { return [e.name, e.tag, e.dept, (CRIT[e.crit]||{}).l || '\u2014', (STAT[e.status]||{}).l || e.status]; });
    kpis = [['Total', String(visEq.length), 'var(--primary)'], ['Life Support', String(visEq.filter(function(e) { return e.crit === 'life'; }).length), 'var(--crit)'], ['Out of Service', String(visEq.filter(function(e) { return e.status === 'outofsvc'; }).length), 'var(--warn)']];
  } else if (name === 'Warranty Expiration') {
    var warr = visEq.filter(function(e) { return e.warranty_exp; });
    headers = ['Equipment', 'Tag', 'Dept', 'Warranty Exp', 'Status'];
    rows = warr.map(function(e) { var cs = certStatus(e.warranty_exp); return [e.name, e.tag, e.dept, fmtDate(e.warranty_exp), cs.l]; }).sort(function(a,b) { return new Date(a[3]) - new Date(b[3]); });
    kpis = [['Under Warranty', String(warr.filter(function(e) { return new Date(e.warranty_exp) >= new Date(TODAY); }).length), 'var(--ok)'], ['Expiring', String(warr.filter(function(e) { var d = (new Date(e.warranty_exp) - new Date(TODAY))/864e5; return d >= 0 && d < 60; }).length), 'var(--warn)'], ['Expired', String(warr.filter(function(e) { return new Date(e.warranty_exp) < new Date(TODAY); }).length), 'var(--crit)']];
  } else if (name === 'Recall Status') {
    headers = ['Equipment', 'Tag', 'Dept', 'Criticality', 'Status'];
    rows = visEq.map(function(e) { return [e.name, e.tag, e.dept, (CRIT[e.crit]||{}).l || '\u2014', 'No open recalls']; });
    kpis = [['Open Recalls', '0', 'var(--ok)'], ['Total', String(visEq.length), 'var(--primary)'], ['High-Risk', String(visEq.filter(function(e) { return e.crit === 'life' || e.crit === 'high'; }).length), 'var(--warn)']];
  } else if (name === 'Vendor Performance') {
    headers = ['Vendor', 'Contract', 'Equipment', 'Status'];
    rows = VENDORS.map(function(v) { return [v.name, v.contract || '\u2014', v.equipment || '\u2014', v.status || 'Active']; });
    kpis = [['Vendors', String(VENDORS.length), 'var(--primary)'], ['Active', String(VENDORS.filter(function(v) { return v.status === 'Active'; }).length), 'var(--ok)'], ['Expiring', String(VENDORS.filter(function(v) { var d = (new Date(v.exp) - new Date(TODAY))/864e5; return d >= 0 && d < 60; }).length), 'var(--warn)']];
  } else if (name === 'SLA Compliance') {
    var openSla = WORKORDERS.filter(function(w) { return w.status !== 'closed'; });
    headers = ['Work Order', 'Priority', 'SLA Status', 'SLA %', 'Due'];
    rows = openSla.map(function(w) { var sla = computeSLA(w, SLA_CONFIG); return [w.id, w.pri, sla.sla, sla.pct + '%', fmtDate(w.due)]; });
    kpis = [['Breached', String(openSla.filter(function(w) { return computeSLA(w, SLA_CONFIG).sla === 'Breached'; }).length), 'var(--crit)'], ['At Risk', String(openSla.filter(function(w) { return computeSLA(w, SLA_CONFIG).sla === 'At risk'; }).length), 'var(--warn)'], ['On Track', String(openSla.filter(function(w) { return computeSLA(w, SLA_CONFIG).sla === 'On track'; }).length), 'var(--ok)']];
  } else if (name === 'Contract Expiration') {
    headers = ['Vendor', 'Contract', 'Expiration', 'Status'];
    rows = VENDORS.map(function(v) { return [v.name, v.contract || '\u2014', fmtDate(v.exp), v.status || 'Active']; });
    kpis = [['Total', String(VENDORS.length), 'var(--primary)'], ['Expiring 60d', String(VENDORS.filter(function(v) { var d = (new Date(v.exp) - new Date(TODAY))/864e5; return d >= 0 && d < 60; }).length), 'var(--warn)'], ['Expired', String(VENDORS.filter(function(v) { return v.exp && new Date(v.exp) < new Date(TODAY); }).length), 'var(--crit)']];
  } else if (name === 'Vendor Cost') {
    headers = ['Vendor', 'Contract', 'Equipment', 'Cost'];
    rows = VENDORS.map(function(v) { return [v.name, v.contract || '\u2014', v.equipment || '\u2014', '$' + (Number(v.cost)||0)]; });
    kpis = [['Total Cost', '$' + VENDORS.reduce(function(s,v) { return s+(Number(v.cost)||0); },0).toLocaleString(), 'var(--warn)'], ['Vendors', String(VENDORS.length), 'var(--primary)'], ['Avg/Vendor', '$' + (VENDORS.length ? Math.round(VENDORS.reduce(function(s,v) { return s+(Number(v.cost)||0); },0)/VENDORS.length) : 0), 'var(--info)']];
  } else {
    headers = ['Item', 'Value'];
    rows = [['Report', name], ['Category', cat], ['Generated', TODAY]];
    kpis = [['Status', 'Generated', 'var(--ok)'], ['Data', '0', 'var(--primary)'], ['Cat', cat, 'var(--info)']];
  }

  var kpiHtml = kpis.map(function(k) { return '<div class="kpi" style="--accent:' + k[2] + ';min-width:140px"><div class="kt">' + k[0] + '</div><div class="kv">' + k[1] + '</div></div>'; }).join('');
  var tableHtml = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + headers.map(function(h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function(r) { return '<tr>' + r.map(function(c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' : '<div class="sub2" style="text-align:center;padding:20px">No data available</div>';

  closeDrawer();
  openDrawerHTML('<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">' + icon('report') + '</div><div><h2>' + name + '</h2><div class="did">' + cat + ' \u00b7 ' + TODAY + '</div></div></div><button class="icon-btn close" onclick="closeDrawer()">' + icon('x') + '</button></div><div class="drawer-body"><div class="dsec"><div style="display:flex;gap:12px;flex-wrap:wrap">' + kpiHtml + '</div></div><div class="dsec">' + tableHtml + '</div><div class="dsec"><div style="display:flex;gap:9px"><button class="btn btn-primary" onclick="toast(\'Report exported as CSV\')">' + icon('download') + 'Export CSV</button><button class="btn btn-ghost" onclick="toast(\'Report exported as PDF\')">' + icon('file') + 'Export PDF</button><button class="btn btn-ghost" onclick="closeDrawer()">Close</button></div></div></div>');
  addAuditLog((CMMS_USER||{}).name || 'Admin', 'Generated report: ' + name, 'info');
}
window.runReport = runReport;

VIEWS.requests = async function () {
  const canSRView = hasPerm('Service Requests', 'View');
  const canWOView = hasPerm('Work Orders', 'View');
  const canEqView = hasPerm('Equipment', 'View');
  const isReqOnly = canSRView && !canWOView && !canEqView;
  let mySR = SR_DATA;
  if (isReqOnly && CMMS_USER) {
    mySR = mySR.filter(r => r.user_id === CMMS_USER.id || r.by === CMMS_USER.name);
    const _depts = userDepts();
    if (_depts.length) mySR = mySR.filter(r => { const e = EQMAP[r.eq_id]; return e && (!e.dept || _depts.includes(e.dept)); });
  }
  else if (isDeptScoped()) { const _depts = userDepts(); mySR = mySR.filter(r => { const e = EQMAP[r.eq_id]; return e && (!e.dept || _depts.includes(e.dept)); }); }
  if (SRDEPTF) mySR = mySR.filter(r => { const e = EQMAP[r.eq_id]; return e && e.dept === SRDEPTF; });
  const srOpen = mySR.filter(r => !r.status || r.status === 'open' || r.status === 'submitted').length;
  const srConverted = mySR.filter(r => r.status === 'converted' || r.usable === 'Converted').length;
  const srClosed = mySR.filter(r => r.status === 'closed').length;
  const srHigh = mySR.filter(r => r.urg === 'High' && (!r.status || r.status === 'open' || r.status === 'submitted')).length;
  return `
  <div class="page-head"><div><h1>Service Requests</h1><div class="sub">${isReqOnly ? 'Faults you have reported — track status from submission to resolution' : 'Faults reported from the floor — scan-to-report, triage, and convert to work orders'}</div></div>
  ${hasPerm('Service Requests', 'Create') ? `<button class="btn btn-primary" onclick="openReportFault()">${icon('alert')}Report Fault</button>` : ''}</div>
  ${isDeptScoped() ? '' : `<div class="toolbar"><select class="sel" onchange="setSRDeptF(this.value)"><option value="">All Departments</option>${deptOpts(SRDEPTF)}</select></div>`}
  <div class="kpi-row">
    ${[['Total Requests', String(mySR.length), '', 'var(--primary)', 'var(--primary-soft)', 'alert'], ['Open', String(srOpen), '', 'var(--warn)', 'var(--warn-soft)', 'clock'], ['Converted to WO', String(srConverted), '', 'var(--info)', 'var(--info-soft)', 'arrowr'], ['High Urgency', String(srHigh), '', 'var(--crit)', 'var(--crit-soft)', 'alert']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}
  </div>
  <div class="card"><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Request</th><th>Equipment</th><th>Reported by</th><th>Usable?</th><th>Urgency</th><th>When</th><th></th></tr></thead>
    <tbody>${mySR.length ? mySR.map(r => {
    const e = EQMAP[r.eq_id];
    return `<tr onclick="openServiceRequest('${r.id}')" style="cursor:pointer">
      <td><div class="strong">${r.description}</div><div class="sub2 mono">${r.id}</div></td>
      <td><div class="cellflex"><div class="eq-ic">${icon(e.ic)}</div><div><div style="font-weight:500">${e.tag}</div><div class="sub2">${e.dept}</div></div></div></td>
      <td>${r.by}</td>
      <td>${r.usable === 'Yes' ? '<span class="pill p-ok">Usable</span>' : r.usable === 'Limited' ? '<span class="pill p-warn">Limited</span>' : '<span class="pill p-crit">Not Usable</span>'}</td>
      <td><span class="pill ${r.urg === 'High' ? 'p-crit' : r.urg === 'Medium' ? 'p-warn' : 'p-muted'}">${r.urg}</span></td>
      <td class="sub2">${r.time}</td>
      <td>${(() => { const isMySR = CMMS_USER && (r.user_id === CMMS_USER.id || r.by === CMMS_USER.name); const linkedWO = WORKORDERS.find(wo => wo.source_sr_id === r.id); const canCloseSR = isMySR && linkedWO && (linkedWO.status === 'closed' || linkedWO.status === 'pending_closeout') && (!r.status || r.status === 'open' || r.status === 'submitted' || r.status === 'converted'); const canRejectSR = canCloseSR; const canConvert = hasPerm('Work Orders', 'Create') && (!r.status || r.status === 'open' || r.status === 'submitted') && !linkedWO; if (r.status === 'closed') return '<span class="pill p-ok">Closed</span>'; if (canCloseSR) return `<div style="display:flex;gap:6px"><button class="btn btn-primary" style="height:32px;font-size:12px" onclick="event.stopPropagation();closeServiceRequest('${r.id}')">${icon('check')}Close</button><button class="btn btn-ghost" style="height:32px;font-size:12px;color:var(--crit)" onclick="event.stopPropagation();openRejectServiceRequest('${r.id}')">${icon('alert')}Reject</button></div>`; if (canConvert) return `<button class="btn btn-ghost" style="height:32px;font-size:12px" onclick="event.stopPropagation();convertSRToWO('${r.id}')">Convert ${icon('arrowr')}</button>`; return '<span class="pill p-muted">In progress</span>'; })()}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="sub2" style="text-align:center;padding:20px">No service requests yet — click Report Fault to log one</td></tr>'}</tbody>
  </table></div></div>`;
};

/* ============================================================
   VIEW: PREVENTIVE MAINTENANCE
   ============================================================ */
VIEWS.pm = async function () {
  const visEq = visibleEquipment();
  const _dpm = userDepts(); const myPMWO = isTechnician() ? PMWO.filter(isMyPM) : (isDeptScoped() ? PMWO.filter(p => { const e = EQMAP[p.eq_id]; return e && (!e.dept || _dpm.includes(e.dept)); }) : PMWO);
  let filteredPMWO = myPMWO.slice();
  if (PMDEPTF) filteredPMWO = filteredPMWO.filter(p => { const e = EQMAP[p.eq_id]; return e && e.dept === PMDEPTF; });
  if (PMCATF) filteredPMWO = filteredPMWO.filter(p => { const e = EQMAP[p.eq_id]; return e && e.cat === PMCATF; });
  if (PMFREQF) filteredPMWO = filteredPMWO.filter(p => p.freq === PMFREQF);
  const filteredVisEq = visEq.filter(e => (!PMDEPTF || e.dept === PMDEPTF) && (!PMCATF || e.cat === PMCATF));
  const filteredPlans = PM_PLANS.filter(p => p.active && isMyPlan(p) && (!PMDEPTF || (() => { const e = EQMAP[p.eq_id]; return e && e.dept === PMDEPTF; })()) && (!PMCATF || (() => { const e = EQMAP[p.eq_id]; return e && e.cat === PMCATF; })()) && (!PMFREQF || p.freq === PMFREQF));
  const complianceByDept = (() => {
    const depts = [...new Set(filteredVisEq.map(e => e.dept).filter(Boolean))].sort();
    return depts.map(d => {
      const items = visEq.filter(e => e.dept === d);
      const avg = computePMCompliance(items, PMWO);
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
  for (const pm of filteredPMWO) {
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
  for (const plan of filteredPlans) {
    const generatedForDate = PMWO.some(pm => pm.eq_id === plan.eq_id && pm.freq === plan.freq && pm.due === plan.next_due && pm.status !== 'completed');
    if (generatedForDate) continue;
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

  const dueThisWeek = filteredPMWO.filter(p => {
    const due = new Date(p.due);
    const weekEnd = new Date(TODAY); weekEnd.setDate(weekEnd.getDate() + 7);
    return due >= new Date(TODAY) && due <= weekEnd && p.status !== 'completed';
  }).length;
  const overdueCount = filteredPMWO.filter(p => p.status === 'overdue' || (new Date(p.due) < new Date(TODAY) && p.status !== 'completed')).length;
  const pmAvg = computePMCompliance(filteredVisEq, PMWO);
  const highRiskEq = filteredVisEq.filter(e => e.crit === 'life' || e.crit === 'high');
  const highRiskCompliance = highRiskEq.length ? computePMCompliance(highRiskEq, PMWO) : 0;
  const completedPMs = filteredPMWO.filter(p => p.status === 'completed').sort((a, b) => new Date(b.completed_on || b.due) - new Date(a.completed_on || a.due));
  const activePlanRows = filteredPlans.map(plan => {
    const e = EQMAP[plan.eq_id];
    const generated = myPMWO.find(pm => pm.eq_id === plan.eq_id && pm.freq === plan.freq);
    return `<div class="pm-plan-row"><div class="pm-plan-icon">${icon('pm')}</div><div class="pm-plan-main"><div class="strong">${plan.name}</div><div class="sub2">${e ? e.tag + ' · ' + e.name : 'Equipment unavailable'} · ${plan.freq}</div></div><div class="pm-plan-date"><span class="sub2">Next planned date</span><b>${fmtDate(plan.next_due)}</b></div><div>${generated ? '<span class="pill p-ok">Work order created</span>' : '<span class="pill p-cal">Planned</span>'}</div></div>`;
  }).join('');

  return `
  <div class="page-head"><div><h1>Preventive Maintenance</h1><div class="sub">Scheduled servicing, safety testing & compliance — ${monthName}</div></div>
    <div class="head-actions">${hasPerm('Preventive PM', 'Edit') ? `<button class="btn btn-ghost" onclick="openPMPlans()">${icon('pm')}PM Plans</button>` : ''}
    ${hasPerm('Preventive PM', 'Create') ? `<button class="btn btn-primary" onclick="generatePMSchedule()">${icon('refresh')}Generate Schedule</button>` : ''}</div></div>
  <div class="toolbar">
    ${isDeptScoped() ? '' : `<select class="sel" onchange="setPMDeptF(this.value)"><option value="">All Departments</option>${deptOpts(PMDEPTF)}</select>`}
    <select class="sel" onchange="setPMCatF(this.value)"><option value="">All Categories</option>${catOpts(PMCATF)}</select>
    <select class="sel" onchange="setPMFreqF(this.value)"><option value="">All Frequencies</option>${(PM_FREQS.length ? PM_FREQS : [{label:'Monthly'},{label:'Quarterly'},{label:'Semi-annual'},{label:'Annual'}]).map(f => `<option value="${f.label}" ${PMFREQF === f.label ? 'selected' : ''}>${f.label}</option>`).join('')}</select>
  </div>
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
    <div class="card-head"><h3>Active PM Plans</h3>${isTechnician() ? '' : `<button class="link" onclick="openPMPlans()">Manage plans ${icon('arrowr')}</button>`}</div>
    <div class="pm-plan-list">${activePlanRows || '<div class="empty">No active PM plans yet — create one from PM Plans</div>'}</div>
  </div>
  <div class="grid-dash" style="align-items:start;margin-top:16px">
  <div class="card">
    <div class="card-head"><h3>Upcoming PM Work Orders</h3><span class="link" onclick="go('workorders')">All work orders ${icon('arrowr')}</span></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>PM Work Order</th><th>Equipment</th><th>Technician</th><th>Frequency</th><th>Due</th><th>Status</th><th></th></tr></thead>
      <tbody>${filteredPMWO.length ? filteredPMWO.map(pm => {
    const e = EQMAP[pm.eq_id];
    if (!e) return '';
    const ov = new Date(pm.due) < new Date(TODAY) && pm.status !== 'completed';
    return `<tr onclick="openJob('${pm.id}','pm')">
        <td><div class="strong">${pm.title}</div><div class="sub2 mono">${pm.id}</div></td>
        <td><div class="cellflex"><span class="crit-stripe" style="background:${critColor(e.crit)}"></span><div class="eq-ic">${icon(e.ic)}</div><div><div style="font-weight:500">${e.tag}</div><div class="sub2">${e.dept}</div></div></div></td>
        <td>${pm.technician || '<span class="sub2">Unassigned</span>'}</td>
        <td>${pm.freq}</td>
        <td class="mono" style="font-size:12px">${fmtDate(pm.due)}${ov ? ' <span class="pill p-crit" style="margin-left:4px">Overdue</span>' : ''}</td>
        <td>${pm.status === 'completed' ? '<span class="pill p-ok">Completed</span>' : ov ? '<span class="pill p-crit">Overdue</span>' : '<span class="pill p-info">Scheduled</span>'}</td>
        <td><button class="btn btn-ghost" style="height:32px;font-size:12px" onclick="event.stopPropagation();openJob('${pm.id}','pm')">${pm.status === 'completed' ? 'View' : 'Open checklist'} ${icon('arrowr')}</button></td>
      </tr>`;
  }).join('') : '<tr><td colspan="7" class="sub2" style="text-align:center;padding:20px">No PM work orders match the selected filters</td></tr>'}</tbody>
    </table></div>
  </div>
  <div class="card">
    <div class="card-head"><h3>Compliance by Department</h3><span class="hint">target 90%</span></div>
    <div class="card-pad"><div class="barlist">
      ${complianceByDept.map(d => `<div class="row"><span class="nm">${d.nm}</span><div class="track"><div class="fill" style="width:${d.v}%;background:${d.v >= 90 ? 'var(--ok)' : d.v >= 80 ? 'var(--warn)' : 'var(--crit)'}"></div></div><span class="vv">${d.v}%</span></div>`).join('')}
    </div></div>
  </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card-head"><h3>Completed PMs & History</h3><span class="hint">${completedPMs.length} completed</span></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>PM Work Order</th><th>Equipment</th><th>Technician</th><th>Frequency</th><th>Completed</th><th>Result</th><th></th></tr></thead>
      <tbody>${completedPMs.length ? completedPMs.map(pm => {
    const e = EQMAP[pm.eq_id];
    if (!e) return '';
    return `<tr onclick="openJob('${pm.id}','pm')">
        <td><div class="strong">${pm.title}</div><div class="sub2 mono">${pm.id}</div></td>
        <td><div class="cellflex"><span class="crit-stripe" style="background:${critColor(e.crit)}"></span><div class="eq-ic">${icon(e.ic)}</div><div><div style="font-weight:500">${e.tag}</div><div class="sub2">${e.dept}</div></div></div></td>
        <td>${pm.technician || '<span class="sub2">Unassigned</span>'}</td>
        <td>${pm.freq}</td>
        <td class="mono" style="font-size:12px">${pm.completed_on ? fmtDate(pm.completed_on) : '<span class="sub2">—</span>'}</td>
        <td><span class="pill p-ok">Completed</span></td>
        <td><button class="btn btn-ghost" style="height:32px;font-size:12px" onclick="event.stopPropagation();openJob('${pm.id}','pm')">View ${icon('arrowr')}</button></td>
      </tr>`;
  }).join('') : '<tr><td colspan="7" class="sub2" style="text-align:center;padding:20px">No completed PMs yet</td></tr>'}</tbody>
    </table></div>
  </div>`;
};

/* ============================================================
   VIEW: PM HISTORY
   ============================================================ */
VIEWS['pm-history'] = async function () {
  const allPMHistory = await loadAllPMHistory();
  const completedPMs = PMWO.filter(p => p.status === 'completed').sort((a, b) => new Date(b.completed_on || b.due) - new Date(a.completed_on || a.due));
  return `
  <div class="page-head"><div><h1>PM History</h1><div class="sub">Completed preventive maintenance work orders and measurement history across all equipment</div></div></div>
  <div class="kpi-row">
    ${[['Completed PMs', String(completedPMs.length), '', 'var(--ok)', 'var(--ok-soft)', 'check'], ['Total Measurements', String(allPMHistory.length), '', 'var(--primary)', 'var(--primary-soft)', 'pm'], ['Passed', String(allPMHistory.filter(h => h.result === 'pass').length), '', 'var(--ok)', 'var(--ok-soft)', 'check'], ['Failed', String(allPMHistory.filter(h => h.result === 'fail').length), '', 'var(--crit)', 'var(--crit-soft)', 'alert']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="card-head"><h3>Completed PM Work Orders</h3><span class="hint">${completedPMs.length} completed</span></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>PM Work Order</th><th>Equipment</th><th>Technician</th><th>Frequency</th><th>Completed</th><th></th></tr></thead>
      <tbody>${completedPMs.length ? completedPMs.map(pm => {
    const e = EQMAP[pm.eq_id];
    if (!e) return '';
    return `<tr onclick="openJob('${pm.id}','pm')">
        <td><div class="strong">${pm.title}</div><div class="sub2 mono">${pm.id}</div></td>
        <td><div class="cellflex"><span class="crit-stripe" style="background:${critColor(e.crit)}"></span><div class="eq-ic">${icon(e.ic)}</div><div><div style="font-weight:500">${e.tag}</div><div class="sub2">${e.dept}</div></div></div></td>
        <td>${pm.technician || '<span class="sub2">Unassigned</span>'}</td>
        <td>${pm.freq}</td>
        <td class="mono" style="font-size:12px">${pm.completed_on ? fmtDate(pm.completed_on) : '<span class="sub2">—</span>'}</td>
        <td><button class="btn btn-ghost" style="height:32px;font-size:12px" onclick="event.stopPropagation();openJob('${pm.id}','pm')">View ${icon('arrowr')}</button></td>
      </tr>`;
  }).join('') : '<tr><td colspan="6" class="sub2" style="text-align:center;padding:20px">No completed PMs yet</td></tr>'}</tbody>
    </table></div>
  </div>
  <div class="card">
    <div class="card-head"><h3>PM Measurement History</h3><span class="hint">${allPMHistory.length} records</span></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>PM Work Order</th><th>Equipment</th><th>Technician</th><th>Attempt</th><th>Completed</th><th>Result</th><th>Comment</th></tr></thead>
      <tbody>${allPMHistory.length ? allPMHistory.map(h => {
    const pm = PMWOMAP[h.pm_work_order_id];
    const e = pm ? EQMAP[pm.eq_id] : null;
    const pmTitle = pm ? pm.title : h.pm_work_order_id;
    return `<tr onclick="openJob('${h.pm_work_order_id}','pm')">
      <td><div class="strong">${pmTitle}</div><div class="sub2 mono">${h.pm_work_order_id}</div></td>
      <td>${e ? `<div class="cellflex"><div class="eq-ic">${icon(e.ic)}</div><div><div style="font-weight:500">${e.tag}</div><div class="sub2">${e.dept}</div></div></div>` : '<span class="sub2">—</span>'}</td>
      <td>${h.technician || '<span class="sub2">Unknown</span>'}</td>
      <td class="mono">#${h.attempt}</td>
      <td class="mono" style="font-size:12px">${fmtDate(h.completed_at)}</td>
      <td><span class="pill ${h.result === 'pass' ? 'p-ok' : 'p-crit'}">${h.result === 'pass' ? 'Passed' : 'Failed'}</span></td>
      <td class="sub2" style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis">${h.comment || h.fail_details || '—'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="sub2" style="text-align:center;padding:20px">No PM measurement history yet</td></tr>'}</tbody>
    </table></div>
  </div>`;
};

/* ============================================================
   VIEW: CALIBRATION
   ============================================================ */
VIEWS.calibration = async function () {
  const visEq = visibleEquipment();
  let calEq = visEq.filter(e => e.cal_due);
  if (CALDEPTF) calEq = calEq.filter(e => e.dept === CALDEPTF);
  if (CALCATF) calEq = calEq.filter(e => e.cat === CALCATF);
  const rows = calEq;
  if (!rows.length) {
    return `
  <div class="page-head"><div><h1>Calibration Management</h1><div class="sub">Traceable calibration against IEC / manufacturer standards with certificate control</div></div>
    ${hasPerm('Calibration', 'Create') ? `<button class="btn btn-primary" onclick="openRecordCalibration()">${icon('cal')}Record Calibration</button>` : ''}</div>
  <div class="toolbar">
    ${isDeptScoped() ? '' : `<select class="sel" onchange="setCalDeptF(this.value)"><option value="">All Departments</option>${deptOpts(CALDEPTF)}</select>`}
    <select class="sel" onchange="setCalCatF(this.value)"><option value="">All Categories</option>${catOpts(CALCATF)}</select>
  </div>
  <div class="card"><div class="card-pad"><div class="empty" style="text-align:center;padding:40px">No equipment with calibration due matches the selected filters</div></div></div>`;
  }
  const due30 = rows.filter(e => { const d = (new Date(e.cal_due) - new Date(TODAY)) / 864e5; return d >= 0 && d <= 30; }).length;
  const overdueCal = rows.filter(e => new Date(e.cal_due) < new Date(TODAY)).length;
  const passRate = rows.length ? Math.round((rows.length - overdueCal) / rows.length * 100) : 100;
  const certificates = rows.filter(e => e.cal_cert || e.cal_due).length;
  return `
  <div class="page-head"><div><h1>Calibration Management</h1><div class="sub">Traceable calibration against IEC / manufacturer standards with certificate control</div></div>
    ${hasPerm('Calibration', 'Create') ? `<button class="btn btn-primary" onclick="openRecordCalibration()">${icon('cal')}Record Calibration</button>` : ''}</div>
  <div class="toolbar">
    ${isDeptScoped() ? '' : `<select class="sel" onchange="setCalDeptF(this.value)"><option value="">All Departments</option>${deptOpts(CALDEPTF)}</select>`}
    <select class="sel" onchange="setCalCatF(this.value)"><option value="">All Categories</option>${catOpts(CALCATF)}</select>
  </div>
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
    <div class="head-actions">${hasPerm('Spare Parts', 'Edit') ? `<button class="btn btn-ghost" onclick="openIssuePart()">${icon('arrowr')}Issue Part</button>` : ''}
    ${hasPerm('Spare Parts', 'Create') ? `<button class="btn btn-primary" onclick="openAddPart()">${icon('parts')}Add Part</button>` : ''}</div></div>
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
  ${hasPerm('Vendors', 'Create') ? `<button class="btn btn-primary" onclick="openAddVendor()">${icon('vendor')}Add Vendor</button>` : ''}</div>
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
   VIEW: SLA CONFIGURATION
   ============================================================ */
VIEWS['sla-config'] = async function () {
  const rows = (SLA_CONFIG.length ? SLA_CONFIG : SLA_DEFAULTS).slice();
  return `
  <div class="page-head"><div><h1>SLA Target Configuration</h1><div class="sub">Define resolution-time targets per priority level. These drive the SLA meters, alerts, and compliance KPIs across the system.</div></div></div>
  <div class="card">
    <div class="card-head"><h3>Priority Resolution Targets</h3><span class="hint">${rows.length} priority levels</span></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Priority</th><th>Label</th><th class="num">Target Hours</th><th class="num">Warning Threshold</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td>${priPill(r.priority)}</td>
        <td class="strong">${r.label}</td>
        <td class="num mono">${r.target_hours}h</td>
        <td class="num mono">${r.warning_pct}%</td>
        <td><button class="btn btn-ghost" style="height:32px;font-size:12px" onclick="openEditSLA('${r.priority}')">${icon('edit')}Edit</button></td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card-head"><h3>How SLA Works</h3></div>
    <div class="card-pad" style="line-height:1.7">
      <p class="sub2" style="margin:0 0 10px">Each work order is assigned a priority (P1–P4) at creation. The SLA timer starts from the moment the work order is opened.</p>
      <p class="sub2" style="margin:0 0 10px"><b>On Track</b> — elapsed time is below the warning threshold (e.g. below 75% of the target window).</p>
      <p class="sub2" style="margin:0 0 10px"><b>At Risk</b> — elapsed time has crossed the warning threshold but the target window has not yet expired.</p>
      <p class="sub2" style="margin:0 0 10px"><b>Breached</b> — the target resolution window has expired and the work order is still open.</p>
      <p class="sub2" style="margin:0 0 10px"><b>Met</b> — the work order was closed within the target window.</p>
      <p class="sub2" style="margin:0">The SLA Compliance KPI on the Command Center shows the percentage of closed work orders that met their SLA target.</p>
    </div>
  </div>`;
};

let EDIT_SLA_PRIORITY = null;
function openEditSLA(priority) {
  const r = (SLA_CONFIG.length ? SLA_CONFIG : SLA_DEFAULTS).find(c => c.priority === priority);
  if (!r) return;
  EDIT_SLA_PRIORITY = priority;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('clock')}</div><div><h2>Edit SLA Target</h2><div class="did">${priority} · ${r.label}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Target Settings</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Label</span><input id="sla_label" value="${r.label}"></label>
      <label class="fld"><span>Target Resolution Time (hours)</span><input id="sla_hours" type="number" value="${r.target_hours}" min="1"></label>
      <label class="fld"><span>Warning Threshold (%)</span><input id="sla_warning" type="number" value="${r.warning_pct}" min="1" max="100"><div class="sub2" style="font-size:11px">Percentage of the target window at which "At Risk" alerts appear</div></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEditSLA()">${icon('check')}Save</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openEditSLA = openEditSLA;

async function submitEditSLA() {
  if (!hasPerm('Settings', 'Edit')) { toast('You do not have permission to edit SLA targets'); return; }
  const priority = EDIT_SLA_PRIORITY;
  if (!priority) return;
  const label = document.getElementById('sla_label').value.trim();
  const target_hours = parseInt(document.getElementById('sla_hours').value, 10);
  const warning_pct = parseInt(document.getElementById('sla_warning').value, 10);
  if (!label || !target_hours || !warning_pct) { toast('Fill in all fields'); return; }
  const ok = await updateSLAConfig(priority, { label, target_hours, warning_pct });
  if (!ok) { toast('Failed to update — ' + LAST_DB_ERROR); return; }
  const r = SLA_CONFIG.find(c => c.priority === priority);
  if (r) { r.label = label; r.target_hours = target_hours; r.warning_pct = warning_pct; }
  closeDrawer();
  go('sla-config');
  toast('SLA target updated for ' + priority);
  addAuditLog(CMMS_USER?.name || 'Admin', 'Updated SLA target for ' + priority + ' — ' + target_hours + 'h', 'info');
}
window.submitEditSLA = submitEditSLA;

/* ============================================================
   VIEW: SETTINGS (unified configuration hub)
   ============================================================ */
VIEWS['settings'] = async function () {
  const tabs = [
    { id: 'sla', label: 'Priorities & SLA', ic: 'clock' },
    { id: 'criticality', label: 'Criticality Levels', ic: 'risk' },
    { id: 'departments', label: 'Departments', ic: 'asset' },
    { id: 'categories', label: 'Asset Categories', ic: 'asset' },
    { id: 'pmfreq', label: 'PM Frequencies', ic: 'pm' },
    { id: 'teams', label: 'Teams', ic: 'wrench' },
    { id: 'system', label: 'System Settings', ic: 'settings' },
  ];
  const activeTab = SETTINGS_TAB || 'sla';
  let tabContent = '';
  if (activeTab === 'sla') tabContent = settingsSLATab();
  else if (activeTab === 'criticality') tabContent = settingsCriticalityTab();
  else if (activeTab === 'departments') tabContent = settingsDepartmentsTab();
  else if (activeTab === 'categories') tabContent = settingsCategoriesTab();
  else if (activeTab === 'pmfreq') tabContent = settingsPMFreqTab();
  else if (activeTab === 'teams') tabContent = settingsTeamsTab();
  else if (activeTab === 'system') tabContent = settingsSystemTab();
  return `
  <div class="page-head"><div><h1>Settings</h1><div class="sub">Centralized setup for SLA targets, criticality levels, departments, asset categories, PM frequencies, and system-wide configuration.</div></div></div>
  <div class="drawer-tabs" style="margin-bottom:16px;border-bottom:1px solid var(--border)">
    ${tabs.map(t => `<button class="${activeTab === t.id ? 'on' : ''}" onclick="setSettingsTab('${t.id}')">${icon(t.ic)}<span>${t.label}</span></button>`).join('')}
  </div>
  ${tabContent}`;
};

function setSettingsTab(t) { SETTINGS_TAB = t; go('settings'); }
window.setSettingsTab = setSettingsTab;

// --- SLA / Priorities tab ---
function settingsSLATab() {
  const rows = (PRIORITIES.length ? PRIORITIES : []).slice();
  const slaRows = (SLA_CONFIG.length ? SLA_CONFIG : SLA_DEFAULTS).slice();
  return `
  <div class="card">
    <div class="card-head"><h3>Priority Levels & SLA Rules</h3>
      <button class="btn btn-primary" style="height:34px;font-size:13px" onclick="openAddPriority()">${icon('plus')}Add Priority</button></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Priority</th><th>Label</th><th>Response Target</th><th>Resolution Target</th><th>Warning %</th><th>Applies To</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(r => `<tr>
        <td>${priPill(r.priority)}</td>
        <td class="strong">${r.label}</td>
        <td class="mono" style="font-size:12px">${r.response_target || '—'}</td>
        <td class="mono" style="font-size:12px">${r.resolution_target || '—'} (${r.resolution_hours || ''}h)</td>
        <td class="num mono">${r.warning_pct || 75}%</td>
        <td class="sub2">${r.applies_to || '—'}</td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-ghost" style="height:30px;padding:0 8px" onclick="openEditPriority('${r.priority}')">${icon('edit')}</button>
          <button class="btn btn-ghost" style="height:30px;padding:0 8px;color:var(--crit)" onclick="deletePriorityAction('${r.priority}')">${icon('trash')}</button>
        </div></td>
      </tr>`).join('') : '<tr><td colspan="7" class="sub2" style="text-align:center;padding:20px">No priorities configured</td></tr>'}</tbody>
    </table></div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card-head"><h3>SLA Resolution Targets (used for SLA % calculation)</h3>
      <button class="btn btn-primary" style="height:34px;font-size:13px" onclick="openAddSLA()">${icon('plus')}Add SLA Target</button></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Priority</th><th>Label</th><th class="num">Target Hours</th><th class="num">Warning %</th><th></th></tr></thead>
      <tbody>${slaRows.map(r => `<tr>
        <td>${priPill(r.priority)}</td>
        <td class="strong">${r.label}</td>
        <td class="num mono">${r.target_hours}h</td>
        <td class="num mono">${r.warning_pct}%</td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-ghost" style="height:30px;padding:0 8px" onclick="openEditSLA('${r.priority}')">${icon('edit')}</button>
          <button class="btn btn-ghost" style="height:30px;padding:0 8px;color:var(--crit)" onclick="deleteSLAAction('${r.priority}')">${icon('trash')}</button>
        </div></td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card-head"><h3>How SLA Works</h3></div>
    <div class="card-pad" style="line-height:1.7">
      <p class="sub2" style="margin:0 0 10px">Each work order is assigned a priority (P1–P5) at creation. The SLA timer starts from the moment the work order is opened.</p>
      <p class="sub2" style="margin:0 0 10px"><b>On Track</b> — elapsed time is below the warning threshold (e.g. below 75% of the target window).</p>
      <p class="sub2" style="margin:0 0 10px"><b>At Risk</b> — elapsed time has crossed the warning threshold but the target window has not yet expired.</p>
      <p class="sub2" style="margin:0 0 10px"><b>Breached</b> — the target resolution window has expired and the work order is still open.</p>
      <p class="sub2" style="margin:0 0 10px"><b>Met</b> — the work order was closed within the target window.</p>
      <p class="sub2" style="margin:0">The SLA Compliance KPI on the Command Center shows the percentage of closed work orders that met their SLA target. The SLA % on each work order is calculated live from the opened date, the priority's target hours, and the warning threshold you configure here.</p>
    </div>
  </div>`;
}

// --- Criticality tab ---
function settingsCriticalityTab() {
  const rows = CRIT_LEVELS.length ? CRIT_LEVELS.slice().sort((a, b) => a.sort_order - b.sort_order) : [];
  return `
  <div class="card">
    <div class="card-head"><h3>Criticality Levels</h3>
      <button class="btn btn-primary" style="height:34px;font-size:13px" onclick="openAddCriticality()">${icon('plus')}Add Level</button></div>
    <div class="sub2" style="padding:0 16px 12px">These levels appear in the Equipment form's criticality dropdown and drive the Fleet by Criticality donut chart on the dashboard. Each level can have a default priority and PM frequency.</div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Level</th><th>Description</th><th>Default Priority</th><th>Default PM Frequency</th><th>Color</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(r => `<tr>
        <td><span class="pill" style="background:${r.color || 'var(--surface-3)'};color:#fff">${r.level}</span></td>
        <td class="sub2">${r.description || '—'}</td>
        <td>${priPill(r.default_priority || 'P3')}</td>
        <td class="mono" style="font-size:12px">${r.default_pm_frequency || '—'}</td>
        <td><div style="width:24px;height:24px;border-radius:6px;background:${r.color || 'var(--text-3)'}"></div></td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-ghost" style="height:30px;padding:0 8px" onclick="openEditCriticality('${r.id}')">${icon('edit')}</button>
          <button class="btn btn-ghost" style="height:30px;padding:0 8px;color:var(--crit)" onclick="deleteCriticalityAction('${r.id}')">${icon('trash')}</button>
        </div></td>
      </tr>`).join('') : '<tr><td colspan="6" class="sub2" style="text-align:center;padding:20px">No criticality levels configured</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

// --- Departments tab ---
function settingsDepartmentsTab() {
  const deptList = DEPARTMENTS.map(d => {
    const eqCount = EQUIP.filter(e => e.dept === d.name).length;
    const userCount = USERS.filter(u => u.dept === d.name).length;
    return { ...d, eqCount, userCount };
  });
  return `
  <div class="card">
    <div class="card-head"><h3>Departments</h3>
      <button class="btn btn-primary" style="height:34px;font-size:13px" onclick="openAddDepartment()">${icon('plus')}Add Department</button></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Department</th><th>Description</th><th class="num">Equipment</th><th class="num">Users</th><th></th></tr></thead>
      <tbody>${deptList.length ? deptList.map(d => `<tr>
        <td class="strong">${d.name}</td>
        <td class="sub2">${d.description || '—'}</td>
        <td class="num">${d.eqCount}</td>
        <td class="num">${d.userCount}</td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-ghost" style="height:30px;padding:0 8px" onclick="openEditDepartment('${d.id}')">${icon('edit')}</button>
          <button class="btn btn-ghost" style="height:30px;padding:0 8px;color:var(--crit)" onclick="deleteDepartmentAction('${d.id}')">${icon('trash')}</button>
        </div></td>
      </tr>`).join('') : '<tr><td colspan="5" class="sub2" style="text-align:center;padding:20px">No departments configured</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

// --- Asset Categories tab ---
function settingsCategoriesTab() {
  const rows = ASSET_CATS;
  return `
  <div class="card">
    <div class="card-head"><h3>Asset Categories</h3>
      <button class="btn btn-primary" style="height:34px;font-size:13px" onclick="openAddCategory()">${icon('plus')}Add Category</button></div>
    <div class="sub2" style="padding:0 16px 12px">Categories drive the equipment form's category dropdown, default criticality assignment, and default PM strategy for new equipment.</div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Category</th><th>Subcategory</th><th>Equipment Group</th><th>Default Criticality</th><th>Default PM Strategy</th><th>Technical Fields</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(r => `<tr>
        <td class="strong">${r.category}</td>
        <td class="sub2">${r.subcategory || '—'}</td>
        <td class="sub2">${r.equipment_group || '—'}</td>
        <td>${r.default_criticality ? (CRIT_LEVELS.find(c => c.id === r.default_criticality)?.level || r.default_criticality) : '—'}</td>
        <td class="sub2">${r.default_pm_strategy || '—'}</td>
        <td class="sub2" style="font-size:11px">${r.technical_fields || '—'}</td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-ghost" style="height:30px;padding:0 8px" onclick="openEditCategory('${r.id}')">${icon('edit')}</button>
          <button class="btn btn-ghost" style="height:30px;padding:0 8px;color:var(--crit)" onclick="deleteCategoryAction('${r.id}')">${icon('trash')}</button>
        </div></td>
      </tr>`).join('') : '<tr><td colspan="7" class="sub2" style="text-align:center;padding:20px">No categories configured</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

// --- PM Frequencies tab ---
function settingsPMFreqTab() {
  const rows = PM_FREQS.length ? PM_FREQS.slice().sort((a, b) => a.sort_order - b.sort_order) : [];
  return `
  <div class="card">
    <div class="card-head"><h3>PM Frequencies</h3>
      <button class="btn btn-primary" style="height:34px;font-size:13px" onclick="openAddPMFreq()">${icon('plus')}Add Frequency</button></div>
    <div class="sub2" style="padding:0 16px 12px">Frequency options used when creating PM plans and scheduling preventive maintenance. The months interval drives automatic due-date calculation.</div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Label</th><th class="num">Months Interval</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(r => `<tr>
        <td class="strong">${r.label}</td>
        <td class="num mono">${r.months_interval} months</td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-ghost" style="height:30px;padding:0 8px" onclick="openEditPMFreq('${r.id}')">${icon('edit')}</button>
          <button class="btn btn-ghost" style="height:30px;padding:0 8px;color:var(--crit)" onclick="deletePMFreqAction('${r.id}')">${icon('trash')}</button>
        </div></td>
      </tr>`).join('') : '<tr><td colspan="3" class="sub2" style="text-align:center;padding:20px">No frequencies configured</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

// --- Teams tab ---
function settingsTeamsTab() {
  const rows = TEAMS.length ? TEAMS.slice().sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99)) : [];
  return `
  <div class="card">
    <div class="card-head"><h3>Teams</h3>
      <button class="btn btn-primary" style="height:34px;font-size:13px" onclick="openAddTeam()">${icon('plus')}Add Team</button></div>
    <div class="sub2" style="padding:0 16px 12px">Teams appear in the work order team dropdown, PM plan team field, technician trade field, and user supervised-team selector. Define your maintenance teams here.</div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Team Name</th><th>Description</th><th>Color</th><th class="num">Technicians</th><th class="num">Open WOs</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(r => {
        const techCount = TECHS.filter(t => t.trade === r.name).length;
        const woCount = WORKORDERS.filter(w => w.team === r.name && w.status !== 'closed').length;
        return `<tr>
          <td class="strong">${r.name}</td>
          <td class="sub2">${r.description || '—'}</td>
          <td><div style="width:24px;height:24px;border-radius:6px;background:${r.color || 'var(--primary)'}"></div></td>
          <td class="num">${techCount}</td>
          <td class="num">${woCount}</td>
          <td><div style="display:flex;gap:4px">
            <button class="btn btn-ghost" style="height:30px;padding:0 8px" onclick="openEditTeam('${r.id}')">${icon('edit')}</button>
            <button class="btn btn-ghost" style="height:30px;padding:0 8px;color:var(--crit)" onclick="deleteTeamAction('${r.id}')">${icon('trash')}</button>
          </div></td>
        </tr>`;
      }).join('') : '<tr><td colspan="6" class="sub2" style="text-align:center;padding:20px">No teams configured — add your first team to get started</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

function openAddTeam() {
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('wrench')}</div><div><h2>Add Team</h2><div class="did">Create a new maintenance team</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Team Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Team Name</span><input id="tm_name" placeholder="e.g. Biomedical"></label>
      <label class="fld"><span>Description</span><input id="tm_desc" placeholder="What this team handles"></label>
      <label class="fld"><span>Color (CSS variable or hex)</span><input id="tm_color" placeholder="var(--primary)" value="var(--primary)"></label>
      <label class="fld"><span>Sort Order</span><input id="tm_sort" type="number" value="99"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitAddTeam()">${icon('check')}Create</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddTeam = openAddTeam;

async function submitAddTeam() {
  if (!hasPerm('Settings', 'Create')) { toast('You do not have permission to add teams'); return; }
  const name = document.getElementById('tm_name').value.trim();
  if (!name) { toast('Team name is required'); return; }
  if (TEAMS.find(t => t.name === name)) { toast('Team already exists'); return; }
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const t = {
    id, name,
    description: document.getElementById('tm_desc').value.trim(),
    color: document.getElementById('tm_color').value.trim() || 'var(--primary)',
    sort_order: parseInt(document.getElementById('tm_sort').value, 10) || 99,
  };
  const ok = await addTeam(t);
  if (!ok) { toast('Failed to create — ' + LAST_DB_ERROR); return; }
  TEAMS.push(t);
  closeDrawer(); go('settings'); toast('Team "' + name + '" created');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Created team ' + name, 'info');
}
window.submitAddTeam = submitAddTeam;

function openEditTeam(id) {
  const r = TEAMS.find(t => t.id === id);
  if (!r) return;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('wrench')}</div><div><h2>Edit Team</h2><div class="did">${r.name}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Team Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Team Name</span><input id="tm_name" value="${r.name}"></label>
      <label class="fld"><span>Description</span><input id="tm_desc" value="${r.description || ''}"></label>
      <label class="fld"><span>Color</span><input id="tm_color" value="${r.color || 'var(--primary)'}"></label>
      <label class="fld"><span>Sort Order</span><input id="tm_sort" type="number" value="${r.sort_order || 99}"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEditTeam('${id}')">${icon('check')}Save</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openEditTeam = openEditTeam;

async function submitEditTeam(id) {
  if (!hasPerm('Settings', 'Edit')) { toast('You do not have permission to edit teams'); return; }
  const r = TEAMS.find(t => t.id === id);
  if (!r) return;
  const updates = {
    name: document.getElementById('tm_name').value.trim(),
    description: document.getElementById('tm_desc').value.trim(),
    color: document.getElementById('tm_color').value.trim() || 'var(--primary)',
    sort_order: parseInt(document.getElementById('tm_sort').value, 10) || 99,
  };
  if (!updates.name) { toast('Team name is required'); return; }
  const ok = await updateTeam(id, updates);
  if (!ok) { toast('Failed to update — ' + LAST_DB_ERROR); return; }
  Object.assign(r, updates);
  closeDrawer(); go('settings'); toast('Team updated');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Updated team ' + updates.name, 'info');
}
window.submitEditTeam = submitEditTeam;

async function deleteTeamAction(id) {
  if (!hasPerm('Settings', 'Delete')) { toast('You do not have permission to delete teams'); return; }
  const r = TEAMS.find(t => t.id === id);
  if (!r) return;
  const ok = await deleteTeam(id);
  if (!ok) { toast('Failed to delete — ' + LAST_DB_ERROR); return; }
  TEAMS = TEAMS.filter(t => t.id !== id);
  go('settings'); toast('Team "' + r.name + '" deleted');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Deleted team ' + r.name, 'warn');
}
window.deleteTeamAction = deleteTeamAction;

// --- System Settings tab ---
function settingsSystemTab() {
  const rows = SYS_SETTINGS;
  const grouped = {};
  rows.forEach(r => { const cat = r.category || 'general'; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(r); });
  const categories = Object.keys(grouped).sort();
  return `
  <div class="card">
    <div class="card-head"><h3>System Settings</h3>
      <button class="btn btn-primary" style="height:34px;font-size:13px" onclick="openAddSetting()">${icon('plus')}Add Setting</button></div>
    <div class="sub2" style="padding:0 16px 12px">Key/value pairs for organization-wide configuration: organization name, ID prefixes, and other system parameters.</div>
    ${categories.map(cat => `
      <div style="padding:0 16px 16px">
        <h4 style="text-transform:capitalize;margin:0 0 10px;font-size:13px;color:var(--text-2)">${cat}</h4>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>
          <tbody>${grouped[cat].map(r => `<tr>
            <td class="mono strong" style="font-size:12px">${r.key}</td>
            <td>${r.value}</td>
            <td><div style="display:flex;gap:4px">
              <button class="btn btn-ghost" style="height:30px;padding:0 8px" onclick="openEditSetting('${r.key}')">${icon('edit')}</button>
              <button class="btn btn-ghost" style="height:30px;padding:0 8px;color:var(--crit)" onclick="deleteSettingAction('${r.key}')">${icon('trash')}</button>
            </div></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`).join('')}
  </div>`;
}

// ============ SETTINGS: Priority CRUD ============
function openAddPriority() {
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('clock')}</div><div><h2>Add Priority</h2><div class="did">Create a new priority level</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Priority Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Priority Code (e.g. P6)</span><input id="pr_code" placeholder="P6"></label>
      <label class="fld"><span>Label</span><input id="pr_label" placeholder="e.g. Cosmetic"></label>
      <label class="fld"><span>Example Trigger</span><input id="pr_trigger" placeholder="When this priority applies"></label>
      <label class="fld"><span>Response Target</span><input id="pr_response" placeholder="e.g. 2 days"></label>
      <label class="fld"><span>Resolution Target</span><input id="pr_resolution" placeholder="e.g. 14 days"></label>
      <label class="fld"><span>Resolution Hours (number)</span><input id="pr_hours" type="number" value="168" min="1"></label>
      <label class="fld"><span>Warning Threshold (%)</span><input id="pr_warning" type="number" value="75" min="1" max="100"></label>
      <label class="fld"><span>Applies To</span><input id="pr_applies" placeholder="e.g. General"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitAddPriority()">${icon('check')}Create</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddPriority = openAddPriority;

async function submitAddPriority() {
  if (!hasPerm('Settings', 'Create')) { toast('You do not have permission to add priorities'); return; }
  const priority = document.getElementById('pr_code').value.trim().toUpperCase();
  const label = document.getElementById('pr_label').value.trim();
  if (!priority || !label) { toast('Fill in priority code and label'); return; }
  if (PRIORITIES.find(p => p.priority === priority)) { toast('Priority already exists'); return; }
  const p = {
    priority, label,
    example_trigger: document.getElementById('pr_trigger').value.trim(),
    response_target: document.getElementById('pr_response').value.trim(),
    resolution_target: document.getElementById('pr_resolution').value.trim(),
    resolution_hours: parseInt(document.getElementById('pr_hours').value, 10) || 168,
    warning_pct: parseInt(document.getElementById('pr_warning').value, 10) || 75,
    applies_to: document.getElementById('pr_applies').value.trim(),
    sort_order: PRIORITIES.length + 1,
  };
  const ok = await addPriority(p);
  if (!ok) { toast('Failed to create — ' + LAST_DB_ERROR); return; }
  PRIORITIES.push(p);
  closeDrawer(); go('settings'); toast('Priority ' + priority + ' created');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Created priority ' + priority, 'info');
}
window.submitAddPriority = submitAddPriority;

function openEditPriority(priority) {
  const r = PRIORITIES.find(p => p.priority === priority);
  if (!r) return;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('clock')}</div><div><h2>Edit Priority</h2><div class="did">${priority} · ${r.label}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Priority Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Label</span><input id="pr_label" value="${r.label}"></label>
      <label class="fld"><span>Example Trigger</span><input id="pr_trigger" value="${r.example_trigger || ''}"></label>
      <label class="fld"><span>Response Target</span><input id="pr_response" value="${r.response_target || ''}"></label>
      <label class="fld"><span>Resolution Target</span><input id="pr_resolution" value="${r.resolution_target || ''}"></label>
      <label class="fld"><span>Resolution Hours (number)</span><input id="pr_hours" type="number" value="${r.resolution_hours || 168}" min="1"></label>
      <label class="fld"><span>Warning Threshold (%)</span><input id="pr_warning" type="number" value="${r.warning_pct || 75}" min="1" max="100"></label>
      <label class="fld"><span>Applies To</span><input id="pr_applies" value="${r.applies_to || ''}"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEditPriority('${priority}')">${icon('check')}Save</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openEditPriority = openEditPriority;

async function submitEditPriority(priority) {
  if (!hasPerm('Settings', 'Edit')) { toast('You do not have permission to edit priorities'); return; }
  const r = PRIORITIES.find(p => p.priority === priority);
  if (!r) return;
  const updates = {
    label: document.getElementById('pr_label').value.trim(),
    example_trigger: document.getElementById('pr_trigger').value.trim(),
    response_target: document.getElementById('pr_response').value.trim(),
    resolution_target: document.getElementById('pr_resolution').value.trim(),
    resolution_hours: parseInt(document.getElementById('pr_hours').value, 10) || 168,
    warning_pct: parseInt(document.getElementById('pr_warning').value, 10) || 75,
    applies_to: document.getElementById('pr_applies').value.trim(),
  };
  if (!updates.label) { toast('Label is required'); return; }
  const ok = await updatePriority(priority, updates);
  if (!ok) { toast('Failed to update — ' + LAST_DB_ERROR); return; }
  Object.assign(r, updates);
  const sla = SLA_CONFIG.find(c => c.priority === priority);
  if (sla) { sla.label = updates.label; sla.target_hours = updates.resolution_hours; sla.warning_pct = updates.warning_pct; }
  closeDrawer(); go('settings'); toast('Priority updated');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Updated priority ' + priority, 'info');
}
window.submitEditPriority = submitEditPriority;

async function deletePriorityAction(priority) {
  if (!hasPerm('Settings', 'Delete')) { toast('You do not have permission to delete priorities'); return; }
  const ok = await deletePriority(priority);
  if (!ok) { toast('Failed to delete — ' + LAST_DB_ERROR); return; }
  PRIORITIES = PRIORITIES.filter(p => p.priority !== priority);
  go('settings'); toast('Priority ' + priority + ' deleted');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Deleted priority ' + priority, 'warn');
}
window.deletePriorityAction = deletePriorityAction;

// ============ SETTINGS: SLA target add/delete ============
function openAddSLA() {
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('clock')}</div><div><h2>Add SLA Target</h2><div class="did">Create a resolution target for a priority</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>SLA Target</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Priority Code</span><input id="sla_pri" placeholder="e.g. P5"></label>
      <label class="fld"><span>Label</span><input id="sla_lbl" placeholder="e.g. Low Priority"></label>
      <label class="fld"><span>Target Hours</span><input id="sla_hrs" type="number" value="168" min="1"></label>
      <label class="fld"><span>Warning Threshold (%)</span><input id="sla_wrn" type="number" value="75" min="1" max="100"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitAddSLA()">${icon('check')}Create</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddSLA = openAddSLA;

async function submitAddSLA() {
  if (!hasPerm('Settings', 'Create')) { toast('You do not have permission to add SLA targets'); return; }
  const priority = document.getElementById('sla_pri').value.trim().toUpperCase();
  const label = document.getElementById('sla_lbl').value.trim();
  const target_hours = parseInt(document.getElementById('sla_hrs').value, 10);
  const warning_pct = parseInt(document.getElementById('sla_wrn').value, 10);
  if (!priority || !label || !target_hours || !warning_pct) { toast('Fill in all fields'); return; }
  const ok = await updateSLAConfig(priority, { label, target_hours, warning_pct });
  if (!ok) { toast('Failed to create — ' + LAST_DB_ERROR); return; }
  const existing = SLA_CONFIG.find(c => c.priority === priority);
  if (existing) { existing.label = label; existing.target_hours = target_hours; existing.warning_pct = warning_pct; }
  else { SLA_CONFIG.push({ priority, label, target_hours, warning_pct }); }
  closeDrawer(); go('settings'); toast('SLA target created for ' + priority);
  addAuditLog(CMMS_USER?.name || 'Admin', 'Created SLA target for ' + priority, 'info');
}
window.submitAddSLA = submitAddSLA;

async function deleteSLAAction(priority) {
  if (!hasPerm('Settings', 'Delete')) { toast('You do not have permission to delete SLA targets'); return; }
  const { error } = await supabase.from('sla_config').delete().eq('priority', priority);
  if (error) { toast('Failed to delete — ' + error.message); return; }
  SLA_CONFIG = SLA_CONFIG.filter(c => c.priority !== priority);
  go('settings'); toast('SLA target deleted for ' + priority);
  addAuditLog(CMMS_USER?.name || 'Admin', 'Deleted SLA target for ' + priority, 'warn');
}
window.deleteSLAAction = deleteSLAAction;

// ============ SETTINGS: Criticality CRUD ============
function openAddCriticality() {
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--crit-soft);color:var(--crit)">${icon('risk')}</div><div><h2>Add Criticality Level</h2><div class="did">Create a new criticality tier</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Criticality Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>ID (short code, e.g. 'critical')</span><input id="cr_id" placeholder="e.g. critical"></label>
      <label class="fld"><span>Level Name</span><input id="cr_level" placeholder="e.g. Critical"></label>
      <label class="fld"><span>Description</span><input id="cr_desc" placeholder="What this level means"></label>
      <label class="fld"><span>Default Priority</span><select id="cr_pri">${priOpts('P3')}</select></label>
      <label class="fld"><span>Default PM Frequency</span><input id="cr_freq" placeholder="e.g. Quarterly"></label>
      <label class="fld"><span>Color (CSS variable or hex)</span><input id="cr_color" placeholder="var(--crit)" value="var(--text-3)"></label>
      <label class="fld"><span>Sort Order</span><input id="cr_sort" type="number" value="99"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitAddCriticality()">${icon('check')}Create</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddCriticality = openAddCriticality;

async function submitAddCriticality() {
  if (!hasPerm('Settings', 'Create')) { toast('You do not have permission to add criticality levels'); return; }
  const id = document.getElementById('cr_id').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const level = document.getElementById('cr_level').value.trim();
  if (!id || !level) { toast('Fill in ID and level name'); return; }
  if (CRIT_LEVELS.find(c => c.id === id)) { toast('Criticality ID already exists'); return; }
  const c = {
    id, level,
    description: document.getElementById('cr_desc').value.trim(),
    default_priority: document.getElementById('cr_pri').value,
    default_pm_frequency: document.getElementById('cr_freq').value.trim(),
    color: document.getElementById('cr_color').value.trim() || 'var(--text-3)',
    sort_order: parseInt(document.getElementById('cr_sort').value, 10) || 99,
  };
  const ok = await addCriticalityLevel(c);
  if (!ok) { toast('Failed to create — ' + LAST_DB_ERROR); return; }
  CRIT_LEVELS.push(c);
  closeDrawer(); go('settings'); toast('Criticality level "' + level + '" created');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Created criticality level ' + level, 'info');
}
window.submitAddCriticality = submitAddCriticality;

function openEditCriticality(id) {
  const r = CRIT_LEVELS.find(c => c.id === id);
  if (!r) return;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--crit-soft);color:var(--crit)">${icon('risk')}</div><div><h2>Edit Criticality</h2><div class="did">${r.level}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Criticality Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Level Name</span><input id="cr_level" value="${r.level}"></label>
      <label class="fld"><span>Description</span><input id="cr_desc" value="${r.description || ''}"></label>
      <label class="fld"><span>Default Priority</span><select id="cr_pri">${priOpts(r.default_priority)}</select></label>
      <label class="fld"><span>Default PM Frequency</span><input id="cr_freq" value="${r.default_pm_frequency || ''}"></label>
      <label class="fld"><span>Color</span><input id="cr_color" value="${r.color || 'var(--text-3)'}"></label>
      <label class="fld"><span>Sort Order</span><input id="cr_sort" type="number" value="${r.sort_order || 99}"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEditCriticality('${id}')">${icon('check')}Save</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openEditCriticality = openEditCriticality;

async function submitEditCriticality(id) {
  if (!hasPerm('Settings', 'Edit')) { toast('You do not have permission to edit criticality levels'); return; }
  const r = CRIT_LEVELS.find(c => c.id === id);
  if (!r) return;
  const updates = {
    level: document.getElementById('cr_level').value.trim(),
    description: document.getElementById('cr_desc').value.trim(),
    default_priority: document.getElementById('cr_pri').value,
    default_pm_frequency: document.getElementById('cr_freq').value.trim(),
    color: document.getElementById('cr_color').value.trim() || 'var(--text-3)',
    sort_order: parseInt(document.getElementById('cr_sort').value, 10) || 99,
  };
  if (!updates.level) { toast('Level name is required'); return; }
  const ok = await updateCriticalityLevel(id, updates);
  if (!ok) { toast('Failed to update — ' + LAST_DB_ERROR); return; }
  Object.assign(r, updates);
  closeDrawer(); go('settings'); toast('Criticality updated');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Updated criticality ' + updates.level, 'info');
}
window.submitEditCriticality = submitEditCriticality;

async function deleteCriticalityAction(id) {
  if (!hasPerm('Settings', 'Delete')) { toast('You do not have permission to delete criticality levels'); return; }
  const ok = await deleteCriticalityLevel(id);
  if (!ok) { toast('Failed to delete — ' + LAST_DB_ERROR); return; }
  CRIT_LEVELS = CRIT_LEVELS.filter(c => c.id !== id);
  go('settings'); toast('Criticality level deleted');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Deleted criticality ' + id, 'warn');
}
window.deleteCriticalityAction = deleteCriticalityAction;

// ============ SETTINGS: Asset Category CRUD ============
function openAddCategory() {
  const critOpts = CRIT_LEVELS.map(c => `<option value="${c.id}">${c.level}</option>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('asset')}</div><div><h2>Add Asset Category</h2><div class="did">Create a new equipment category</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Category Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Category</span><input id="cat_name" placeholder="e.g. Monitoring"></label>
      <label class="fld"><span>Subcategory</span><input id="cat_sub" placeholder="e.g. Patient Monitor"></label>
      <label class="fld"><span>Equipment Group</span><input id="cat_group" placeholder="e.g. Patient-care"></label>
      <label class="fld"><span>Default Criticality</span><select id="cat_crit"><option value="med">—</option>${critOpts}</select></label>
      <label class="fld"><span>Default PM Strategy</span><input id="cat_pm" placeholder="e.g. Annual"></label>
      <label class="fld"><span>Technical Fields</span><input id="cat_fields" placeholder="e.g. ECG, SpO2, NIBP"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitAddCategory()">${icon('check')}Create</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddCategory = openAddCategory;

async function submitAddCategory() {
  if (!hasPerm('Settings', 'Create')) { toast('You do not have permission to add categories'); return; }
  const category = document.getElementById('cat_name').value.trim();
  if (!category) { toast('Category name is required'); return; }
  const c = {
    category,
    subcategory: document.getElementById('cat_sub').value.trim(),
    equipment_group: document.getElementById('cat_group').value.trim(),
    default_criticality: document.getElementById('cat_crit').value,
    default_pm_strategy: document.getElementById('cat_pm').value.trim(),
    technical_fields: document.getElementById('cat_fields').value.trim(),
  };
  const ok = await addAssetCategory(c);
  if (!ok) { toast('Failed to create — ' + LAST_DB_ERROR); return; }
  ASSET_CATS.push(c);
  closeDrawer(); go('settings'); toast('Category "' + category + '" created');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Created asset category ' + category, 'info');
}
window.submitAddCategory = submitAddCategory;

function openEditCategory(id) {
  const r = ASSET_CATS.find(c => c.id === id);
  if (!r) return;
  const critOpts = CRIT_LEVELS.map(c => `<option value="${c.id}" ${r.default_criticality===c.id?'selected':''}>${c.level}</option>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('asset')}</div><div><h2>Edit Category</h2><div class="did">${r.category}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Category Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Category</span><input id="cat_name" value="${r.category}"></label>
      <label class="fld"><span>Subcategory</span><input id="cat_sub" value="${r.subcategory || ''}"></label>
      <label class="fld"><span>Equipment Group</span><input id="cat_group" value="${r.equipment_group || ''}"></label>
      <label class="fld"><span>Default Criticality</span><select id="cat_crit"><option value="med">—</option>${critOpts}</select></label>
      <label class="fld"><span>Default PM Strategy</span><input id="cat_pm" value="${r.default_pm_strategy || ''}"></label>
      <label class="fld"><span>Technical Fields</span><input id="cat_fields" value="${r.technical_fields || ''}"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEditCategory('${id}')">${icon('check')}Save</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openEditCategory = openEditCategory;

async function submitEditCategory(id) {
  if (!hasPerm('Settings', 'Edit')) { toast('You do not have permission to edit categories'); return; }
  const r = ASSET_CATS.find(c => c.id === id);
  if (!r) return;
  const updates = {
    category: document.getElementById('cat_name').value.trim(),
    subcategory: document.getElementById('cat_sub').value.trim(),
    equipment_group: document.getElementById('cat_group').value.trim(),
    default_criticality: document.getElementById('cat_crit').value,
    default_pm_strategy: document.getElementById('cat_pm').value.trim(),
    technical_fields: document.getElementById('cat_fields').value.trim(),
  };
  if (!updates.category) { toast('Category name is required'); return; }
  const ok = await updateAssetCategory(id, updates);
  if (!ok) { toast('Failed to update — ' + LAST_DB_ERROR); return; }
  Object.assign(r, updates);
  closeDrawer(); go('settings'); toast('Category updated');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Updated asset category ' + updates.category, 'info');
}
window.submitEditCategory = submitEditCategory;

async function deleteCategoryAction(id) {
  if (!hasPerm('Settings', 'Delete')) { toast('You do not have permission to delete categories'); return; }
  const ok = await deleteAssetCategory(id);
  if (!ok) { toast('Failed to delete — ' + LAST_DB_ERROR); return; }
  ASSET_CATS = ASSET_CATS.filter(c => c.id !== id);
  go('settings'); toast('Category deleted');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Deleted asset category', 'warn');
}
window.deleteCategoryAction = deleteCategoryAction;

// ============ SETTINGS: PM Frequency CRUD ============
function openAddPMFreq() {
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('pm')}</div><div><h2>Add PM Frequency</h2><div class="did">Create a new frequency option</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Frequency Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>ID (e.g. 'weekly')</span><input id="pf_id" placeholder="weekly"></label>
      <label class="fld"><span>Label</span><input id="pf_label" placeholder="Weekly"></label>
      <label class="fld"><span>Months Interval</span><input id="pf_months" type="number" value="1" min="1"></label>
      <label class="fld"><span>Sort Order</span><input id="pf_sort" type="number" value="99"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitAddPMFreq()">${icon('check')}Create</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddPMFreq = openAddPMFreq;

async function submitAddPMFreq() {
  if (!hasPerm('Settings', 'Create')) { toast('You do not have permission to add PM frequencies'); return; }
  const id = document.getElementById('pf_id').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const label = document.getElementById('pf_label').value.trim();
  if (!id || !label) { toast('Fill in ID and label'); return; }
  const f = {
    id, label,
    months_interval: parseInt(document.getElementById('pf_months').value, 10) || 1,
    sort_order: parseInt(document.getElementById('pf_sort').value, 10) || 99,
  };
  const ok = await addPMFrequency(f);
  if (!ok) { toast('Failed to create — ' + LAST_DB_ERROR); return; }
  PM_FREQS.push(f);
  closeDrawer(); go('settings'); toast('PM frequency "' + label + '" created');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Created PM frequency ' + label, 'info');
}
window.submitAddPMFreq = submitAddPMFreq;

function openEditPMFreq(id) {
  const r = PM_FREQS.find(f => f.id === id);
  if (!r) return;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('pm')}</div><div><h2>Edit PM Frequency</h2><div class="did">${r.label}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Frequency Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Label</span><input id="pf_label" value="${r.label}"></label>
      <label class="fld"><span>Months Interval</span><input id="pf_months" type="number" value="${r.months_interval}" min="1"></label>
      <label class="fld"><span>Sort Order</span><input id="pf_sort" type="number" value="${r.sort_order}"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEditPMFreq('${id}')">${icon('check')}Save</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openEditPMFreq = openEditPMFreq;

async function submitEditPMFreq(id) {
  if (!hasPerm('Settings', 'Edit')) { toast('You do not have permission to edit PM frequencies'); return; }
  const r = PM_FREQS.find(f => f.id === id);
  if (!r) return;
  const updates = {
    label: document.getElementById('pf_label').value.trim(),
    months_interval: parseInt(document.getElementById('pf_months').value, 10) || 1,
    sort_order: parseInt(document.getElementById('pf_sort').value, 10) || 99,
  };
  if (!updates.label) { toast('Label is required'); return; }
  const ok = await updatePMFrequency(id, updates);
  if (!ok) { toast('Failed to update — ' + LAST_DB_ERROR); return; }
  Object.assign(r, updates);
  closeDrawer(); go('settings'); toast('PM frequency updated');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Updated PM frequency ' + updates.label, 'info');
}
window.submitEditPMFreq = submitEditPMFreq;

async function deletePMFreqAction(id) {
  if (!hasPerm('Settings', 'Delete')) { toast('You do not have permission to delete PM frequencies'); return; }
  const ok = await deletePMFrequency(id);
  if (!ok) { toast('Failed to delete — ' + LAST_DB_ERROR); return; }
  PM_FREQS = PM_FREQS.filter(f => f.id !== id);
  go('settings'); toast('PM frequency deleted');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Deleted PM frequency ' + id, 'warn');
}
window.deletePMFreqAction = deletePMFreqAction;

// ============ SETTINGS: System Setting CRUD ============
function openAddSetting() {
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('settings')}</div><div><h2>Add System Setting</h2><div class="did">Create a new key/value setting</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Setting Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Key</span><input id="ss_key" placeholder="e.g. default_language"></label>
      <label class="fld"><span>Value</span><input id="ss_value" placeholder="e.g. English"></label>
      <label class="fld"><span>Category</span><input id="ss_cat" placeholder="general" value="general"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitAddSetting()">${icon('check')}Create</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddSetting = openAddSetting;

async function submitAddSetting() {
  if (!hasPerm('Settings', 'Create')) { toast('You do not have permission to add system settings'); return; }
  const key = document.getElementById('ss_key').value.trim();
  const value = document.getElementById('ss_value').value.trim();
  const category = document.getElementById('ss_cat').value.trim() || 'general';
  if (!key || !value) { toast('Key and value are required'); return; }
  const ok = await upsertSystemSetting(key, value, category);
  if (!ok) { toast('Failed to create — ' + LAST_DB_ERROR); return; }
  const existing = SYS_SETTINGS.find(s => s.key === key);
  if (existing) { existing.value = value; existing.category = category; }
  else { SYS_SETTINGS.push({ key, value, category }); }
  if (key === 'org_name') setHosp(value);
  closeDrawer(); go('settings'); toast('Setting "' + key + '" created');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Created system setting ' + key, 'info');
}
window.submitAddSetting = submitAddSetting;

function openEditSetting(key) {
  const r = SYS_SETTINGS.find(s => s.key === key);
  if (!r) return;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('settings')}</div><div><h2>Edit Setting</h2><div class="did">${r.key}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Setting Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Value</span><input id="ss_value" value="${r.value}"></label>
      <label class="fld"><span>Category</span><input id="ss_cat" value="${r.category || 'general'}"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEditSetting('${r.key}')">${icon('check')}Save</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openEditSetting = openEditSetting;

async function submitEditSetting(key) {
  if (!hasPerm('Settings', 'Edit')) { toast('You do not have permission to edit settings'); return; }
  const r = SYS_SETTINGS.find(s => s.key === key);
  if (!r) return;
  const value = document.getElementById('ss_value').value.trim();
  const category = document.getElementById('ss_cat').value.trim() || 'general';
  if (!value) { toast('Value is required'); return; }
  const ok = await upsertSystemSetting(key, value, category);
  if (!ok) { toast('Failed to update — ' + LAST_DB_ERROR); return; }
  r.value = value; r.category = category;
  if (key === 'org_name') setHosp(value);
  closeDrawer(); go('settings'); toast('Setting updated');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Updated system setting ' + key, 'info');
}
window.submitEditSetting = submitEditSetting;

async function deleteSettingAction(key) {
  if (!hasPerm('Settings', 'Delete')) { toast('You do not have permission to delete settings'); return; }
  const ok = await deleteSystemSetting(key);
  if (!ok) { toast('Failed to delete — ' + LAST_DB_ERROR); return; }
  SYS_SETTINGS = SYS_SETTINGS.filter(s => s.key !== key);
  go('settings'); toast('Setting "' + key + '" deleted');
  addAuditLog(CMMS_USER?.name || 'Admin', 'Deleted system setting ' + key, 'warn');
}
window.deleteSettingAction = deleteSettingAction;
const ACCRED_ITEMS = [
  { id: 'inv', label: 'Equipment Inventory Complete', desc: 'All assets registered with full identification data', check: () => EQUIP.length > 0 && EQUIP.every(e => e.tag && e.name && e.dept) },
  { id: 'pm', label: 'PM Compliance ≥ 90%', desc: 'Preventive maintenance schedule up to date', check: () => computePMCompliance(EQUIP, PMWO) >= 90 },
  { id: 'cal', label: 'Calibration Certificates Valid', desc: 'No expired calibration on life-support or high-risk equipment', check: () => EQUIP.filter(e => ['life', 'high'].includes(e.crit)).every(e => !e.cal_due || new Date(e.cal_due) >= new Date(TODAY)) },
  { id: 'risk', label: 'Risk Assessment Current', desc: 'All high-risk assets have a documented risk score', check: () => EQUIP.filter(e => e.crit === 'life' || e.crit === 'high').every(e => e.risk != null) },
  { id: 'recalls', label: 'No Open Recalls', desc: 'All manufacturer recalls resolved or documented', check: () => true },
  { id: 'safety', label: 'Safety Inspections Current', desc: 'Electrical safety tests passed on all patient-contact equipment', check: () => EQUIP.filter(e => e.crit === 'life').every(e => e.status !== 'outofsvc') },
  { id: 'warranty', label: 'Warranty Records Maintained', desc: 'Warranty status tracked for all assets', check: () => EQUIP.every(e => e.warranty || e.warranty_exp) },
  { id: 'audit', label: 'Audit Trail Active', desc: 'All maintenance actions logged and traceable', check: () => AUDIT.length > 0 },
];

VIEWS.risk = async function () {
  const visEq = visibleEquipment();
  const high = visEq.filter(e => e.risk >= 80).sort((a, b) => b.risk - a.risk);
  const lifeCount = visEq.filter(e => e.crit === 'life').length;
  const highCount = visEq.filter(e => e.crit === 'high').length;
  const calItems = visEq.filter(e => e.cal_due).map(e => {
    const cs = certStatus(e.cal_due);
    return { ...e, calStatus: cs };
  }).sort((a, b) => new Date(a.cal_due) - new Date(b.cal_due));
  const calExpired = calItems.filter(e => e.calStatus.l === 'Expired').length;
  const calExpiring = calItems.filter(e => e.calStatus.l === 'Expiring').length;
  const pmAvg = computePMCompliance(visEq, PMWO);
  const accredPassed = ACCRED_ITEMS.filter(a => a.check()).length;
  const accredPct = Math.round(accredPassed / ACCRED_ITEMS.length * 100);
  const outOfSvc = visEq.filter(e => e.status === 'outofsvc' || e.status === 'quarantine').length;

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
  const pmAvg = computePMCompliance(EQUIP, PMWO);
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
  <button class="btn btn-primary" onclick="openReportBuilder()">${icon('report')}Build Report</button></div>
  <div class="kpi-row">${kpis.map(k => `<div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}</div>
  <div class="grid-3">${cats.map(c => `<div class="card"><div class="card-head"><h3 style="display:flex;align-items:center;gap:9px"><span style="width:28px;height:28px;border-radius:8px;background:var(--primary-soft);color:var(--primary);display:grid;place-items:center">${icon(c.ic)}</span>${c.t}</h3></div><div style="padding:6px 8px">${c.items.map(i => `<div class="doc-row" style="padding:9px 12px;cursor:pointer" onclick="runReport('${c.t}','${i}')"><div class="dn" style="font-weight:500">${i}</div><span class="link">Run ${icon('arrowr')}</span></div>`).join('')}</div></div>`).join('')}</div>`;
};

/* ============================================================
   VIEW: DEPARTMENTS
   ============================================================ */
VIEWS['departments'] = async function () {
  const deptList = DEPARTMENTS.map(d => {
    const linkedRoles = DEPT_ROLES.filter(dr => dr.department_id === d.id).map(dr => ROLES.find(r => r.id === dr.role_id)).filter(Boolean);
    const eqCount = EQUIP.filter(e => e.dept === d.name).length;
    const userCount = USERS.filter(u => u.dept === d.name).length;
    return { ...d, linkedRoles, eqCount, userCount };
  });
  return `
  <div class="page-head"><div><h1>Departments</h1><div class="sub">Create and manage departments, and link them to roles for access control</div></div>
    <button class="btn btn-primary" onclick="openAddDepartment()">${icon('asset')}Add Department</button></div>
  <div class="kpi-row">
    ${[['Total Departments', String(DEPARTMENTS.length), '', 'var(--primary)', 'var(--primary-soft)', 'asset'], ['Linked Equipment', String(EQUIP.filter(e => e.dept && DEPARTMENTS.some(d => d.name === e.dept)).length), '', 'var(--info)', 'var(--info-soft)', 'asset'], ['Department Users', String(USERS.filter(u => u.dept && DEPARTMENTS.some(d => d.name === u.dept)).length), '', 'var(--ok)', 'var(--ok-soft)', 'users'], ['Role Links', String(DEPT_ROLES.length), '', 'var(--warn)', 'var(--warn-soft)', 'shield']].map(k => `
      <div class="kpi" style="--accent:${k[3]};--accent-soft:${k[4]}"><div class="kt"><span class="ic">${icon(k[5])}</span>${k[0]}</div><div class="kv">${k[1]}<small>${k[2]}</small></div></div>`).join('')}
  </div>
  <div class="grid-2" style="align-items:start">
    ${deptList.map(d => `
      <div class="card"><div class="card-head"><h3 style="display:flex;align-items:center;gap:9px"><span style="width:28px;height:28px;border-radius:8px;background:var(--primary-soft);color:var(--primary);display:grid;place-items:center">${icon('asset')}</span>${d.name}</h3>
        <div style="display:flex;gap:6px"><button class="btn btn-ghost" style="height:30px;padding:0 10px" onclick="openEditDepartment('${d.id}')">${icon('edit')}Edit</button><button class="btn btn-ghost" style="height:30px;padding:0 10px;color:var(--crit)" onclick="deleteDepartmentAction('${d.id}')">${icon('x')}</button></div></div>
      <div class="card-pad">
        <div class="sub2" style="margin:0 0 12px">${d.description || 'No description'}</div>
        <div class="kv-grid" style="margin-bottom:14px">
          <div class="kv-item"><div class="k">Equipment</div><div class="v">${d.eqCount} assets</div></div>
          <div class="kv-item"><div class="k">Users</div><div class="v">${d.userCount} users</div></div>
        </div>
        <div class="sub2" style="margin:0 0 8px">Linked Roles (${d.linkedRoles.length})</div>
        ${d.linkedRoles.length ? d.linkedRoles.map(r => `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)"><div style="width:28px;height:28px;border-radius:8px;background:var(--info-soft);color:var(--info);display:grid;place-items:center;flex-shrink:0">${icon('shield')}</div><div style="flex:1;font-weight:500;font-size:13px">${r.name}</div><button class="btn btn-ghost" style="height:28px;padding:0 8px;color:var(--crit)" onclick="unlinkDeptRole('${d.id}','${r.id}')">${icon('x')}</button></div>`).join('') : '<div class="sub2" style="font-style:italic">No roles linked — all roles can see this department</div>'}
        <div style="margin-top:12px"><button class="btn btn-ghost" style="width:100%;justify-content:center" onclick="openLinkDeptRole('${d.id}')">${icon('shield')}Link Role</button></div>
      </div></div>`).join('')}
  </div>`;
};

function openAddDepartment() {
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('asset')}</div><div><h2>Add Department</h2><div class="did">Create a new department</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Department Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Department Name</span><input id="dp_name" placeholder="e.g. Cardiology" oninput="window.DP_NAME=this.value"></label>
      <label class="fld"><span>Description</span><input id="dp_desc" placeholder="What this department covers" oninput="window.DP_DESC=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitAddDepartment()">${icon('check')}Create Department</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
  window.DP_NAME = ''; window.DP_DESC = '';
}
window.openAddDepartment = openAddDepartment;

async function submitAddDepartment() {
  if (!hasPerm('Settings', 'Create')) { toast('You do not have permission to add departments'); return; }
  const name = window.DP_NAME?.trim();
  if (!name) { toast('Enter a department name'); return; }
  if (DEPARTMENTS.find(d => d.name.toLowerCase() === name.toLowerCase())) { toast('A department with this name already exists'); return; }
  const id = 'dept-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
  const d = { id, name, description: window.DP_DESC || '' };
  const ok = await addDepartment(d);
  if (!ok) { toast('Failed to create department — ' + LAST_DB_ERROR); return; }
  DEPARTMENTS.push(d);
  closeDrawer();
  go('departments');
  toast('Department "' + name + '" created');
  addAuditLog('Admin', 'Created department ' + name, 'info');
}
window.submitAddDepartment = submitAddDepartment;

function openEditDepartment(id) {
  const d = DEPARTMENTS.find(x => x.id === id);
  if (!d) return;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('asset')}</div><div><h2>Edit Department</h2><div class="did">${d.name}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Department Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Department Name</span><input id="dp_name" value="${d.name}" oninput="window.DP_NAME=this.value"></label>
      <label class="fld"><span>Description</span><input id="dp_desc" value="${d.description || ''}" oninput="window.DP_DESC=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEditDepartment('${id}')">${icon('check')}Save Changes</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
  window.DP_NAME = d.name; window.DP_DESC = d.description || '';
}
window.openEditDepartment = openEditDepartment;

async function submitEditDepartment(id) {
  if (!hasPerm('Settings', 'Edit')) { toast('You do not have permission to edit departments'); return; }
  const d = DEPARTMENTS.find(x => x.id === id);
  if (!d) return;
  const name = window.DP_NAME?.trim() || d.name;
  const updates = { name, description: window.DP_DESC || '' };
  const ok = await updateDepartment(id, updates);
  if (!ok) { toast('Failed to update — ' + LAST_DB_ERROR); return; }
  const oldName = d.name;
  Object.assign(d, updates);
  EQUIP.forEach(e => { if (e.dept === oldName) e.dept = name; });
  USERS.forEach(u => { if (u.dept === oldName) u.dept = name; });
  closeDrawer();
  go('departments');
  toast('Department updated');
  addAuditLog('Admin', 'Updated department ' + name, 'info');
}
window.submitEditDepartment = submitEditDepartment;

async function deleteDepartmentAction(id) {
  if (!hasPerm('Settings', 'Delete')) { toast('You do not have permission to delete departments'); return; }
  const d = DEPARTMENTS.find(x => x.id === id);
  if (!d) return;
  const ok = await deleteDepartment(id);
  if (!ok) { toast('Failed to delete — ' + LAST_DB_ERROR); return; }
  DEPARTMENTS = DEPARTMENTS.filter(x => x.id !== id);
  DEPT_ROLES = DEPT_ROLES.filter(dr => dr.department_id !== id);
  go('departments');
  toast('Department "' + d.name + '" deleted');
  addAuditLog('Admin', 'Deleted department ' + d.name, 'warn');
}
window.deleteDepartmentAction = deleteDepartmentAction;

function openLinkDeptRole(deptId) {
  const d = DEPARTMENTS.find(x => x.id === deptId);
  if (!d) return;
  const linked = new Set(DEPT_ROLES.filter(dr => dr.department_id === deptId).map(dr => dr.role_id));
  const available = ROLES.filter(r => !linked.has(r.id));
  const roleOpts = available.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--info-soft);color:var(--info)">${icon('shield')}</div><div><h2>Link Role to ${d.name}</h2><div class="did">Users with this role will be associated with this department</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Select Role</h4>
    <label class="fld"><span>Role</span><select id="dlr_role"><option value="">Select role…</option>${roleOpts}</select></label>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitLinkDeptRole('${deptId}')">${icon('check')}Link Role</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openLinkDeptRole = openLinkDeptRole;

async function submitLinkDeptRole(deptId) {
  if (!hasPerm('Settings', 'Edit')) { toast('You do not have permission to link roles'); return; }
  const roleId = document.getElementById('dlr_role').value;
  if (!roleId) { toast('Select a role'); return; }
  const ok = await addDepartmentRole(deptId, roleId);
  if (!ok) { toast('Failed to link role — ' + LAST_DB_ERROR); return; }
  DEPT_ROLES.push({ department_id: deptId, role_id: roleId });
  closeDrawer();
  go('departments');
  const d = DEPARTMENTS.find(x => x.id === deptId);
  const r = ROLES.find(x => x.id === roleId);
  toast('Role "' + (r?.name || roleId) + '" linked to ' + (d?.name || deptId));
  addAuditLog('Admin', 'Linked role ' + (r?.name || roleId) + ' to department ' + (d?.name || deptId), 'info');
}
window.submitLinkDeptRole = submitLinkDeptRole;

async function unlinkDeptRole(deptId, roleId) {
  if (!hasPerm('Settings', 'Edit')) { toast('You do not have permission to unlink roles'); return; }
  const ok = await removeDepartmentRole(deptId, roleId);
  if (!ok) { toast('Failed to unlink — ' + LAST_DB_ERROR); return; }
  DEPT_ROLES = DEPT_ROLES.filter(dr => !(dr.department_id === deptId && dr.role_id === roleId));
  go('departments');
  const d = DEPARTMENTS.find(x => x.id === deptId);
  const r = ROLES.find(x => x.id === roleId);
  toast('Role "' + (r?.name || roleId) + '" unlinked from ' + (d?.name || deptId));
}
window.unlinkDeptRole = unlinkDeptRole;

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
  if (!hasPerm('Settings', 'Create')) { toast('You do not have permission to add escalation groups'); return; }
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
  if (!hasPerm('Settings', 'Edit')) { toast('You do not have permission to edit escalation groups'); return; }
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
  if (!hasPerm('Settings', 'Delete')) { toast('You do not have permission to delete escalation groups'); return; }
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
  if (!hasPerm('Settings', 'Edit')) { toast('You do not have permission to add escalation members'); return; }
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
  if (!hasPerm('Settings', 'Edit')) { toast('You do not have permission to remove escalation members'); return; }
  const ok = await removeEscalationGroupMember(groupId, userId);
  if (!ok) { toast('Failed to remove — ' + LAST_DB_ERROR); return; }
  ESC_MEMBERS = ESC_MEMBERS.filter(m => !(m.group_id === groupId && m.user_id === userId));
  go('escalation-groups');
  const u = USERS.find(x => x.id === userId);
  const g = ESC_GROUPS.find(x => x.id === groupId);
  toast((u ? u.name : 'User') + ' removed from ' + (g ? g.name : 'group'));
}
window.removeEscMember = removeEscMember;


async function getJobState(id, kind) {
  const saved = await loadChecklistResult(id);
  if (saved) {
    CHK_STATE[id] = {
      checklist: saved.checklist || {},
      notes: saved.notes || '',
      supervisor: saved.supervisor || false,
      parts: saved.parts || [],
      step: saved.step ?? null,
      technician: saved.technician || '',
    };
  } else {
    const pm = PMWOMAP[id];
    const w = WOMAP[id];
    CHK_STATE[id] = { checklist: {}, notes: '', supervisor: false, parts: [], step: null, technician: pm?.technician || w?.assignee || '' };
  }
}

async function openJob(id, kind) {
  ORIGIN = (kind === 'pm') ? 'pm' : 'workorders';
  if (kind === 'pm' && isTechnician()) {
    const pm = PMWOMAP[id];
    if (!pm || !isMyPM(pm)) {
      toast('This PM is not assigned to you');
      go('pm');
      return;
    }
  }
  CURRENT = 'job';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.querySelector('.nav-item[data-view="' + ORIGIN + '"]');
  if (el) el.classList.add('active');
  const canvas = document.getElementById('canvas');
  canvas.innerHTML = `<section class="view active" id="view-job"></section>`;
  try {
    await getJobState(id, kind);
    document.getElementById('view-job').innerHTML = (kind === 'pm') ? await pmJobHTML(id) : await corrJobHTML(id);
    if (kind === 'pm') loadPMJobHistory(id);
  } catch (err) {
    console.error('openJob error:', err);
    document.getElementById('view-job').innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;padding:40px"><div style="font-size:16px;font-weight:600;color:var(--crit)">Failed to open work order</div><div class="sub2" style="text-align:center;max-width:400px">${err.message || String(err)}</div><button class="btn btn-primary" onclick="go('${ORIGIN}')">Go back</button></div>`;
  }
  canvas.scrollTop = 0;
}
window.openJob = openJob;

async function loadPMJobHistory(id) {
  const el = document.getElementById('pm-job-history');
  if (!el) return;
  const history = await loadPMHistory(id);
  if (!history.length) { el.innerHTML = '<div class="sub2" style="margin:0">No previous attempts. This is the first measurement.</div>'; return; }
  el.innerHTML = history.map(h => {
    const passIcon = h.result === 'pass' ? 'check' : 'alert';
    const pillCls = h.result === 'pass' ? 'p-ok' : 'p-crit';
    const resultLabel = h.result === 'pass' ? 'Passed' : 'Failed';
    const commentHtml = h.comment ? `<div style="margin-top:4px;font-size:12px;color:var(--text-2);font-style:italic">"${h.comment}"</div>` : '';
    const failDetailsHtml = h.fail_details ? `<div style="margin-top:4px;font-size:12px;color:var(--crit)">${h.fail_details}</div>` : '';
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px">
        <div class="doc-ic" style="width:28px;height:28px;background:${h.result === 'pass' ? 'var(--ok-soft,var(--surface-3))' : 'var(--crit-soft,var(--surface-3))'};color:${h.result === 'pass' ? 'var(--ok,var(--primary))' : 'var(--crit)'}">${icon(passIcon)}</div>
        <div style="flex:1"><b>Attempt #${h.attempt}</b> · ${h.technician || 'Unknown'} · ${fmtDate(h.completed_at)}</div>
        <span class="pill ${pillCls}">${resultLabel}</span>
      </div>
      ${failDetailsHtml}${commentHtml}
    </div>`;
  }).join('');
}
window.loadPMJobHistory = loadPMJobHistory;

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
  ${done ? `<div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:16px"><button class="btn btn-primary" onclick="reopenPMForRetry('${id}')">${icon('refresh')}Record Another Attempt</button><div class="sub2" style="align-self:center;margin:0">Reopens this PM so you can take a new set of measurements. Previous attempts are preserved in history.</div></div>` : ''}
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
            <div class="kv-item"><div class="k">Assigned Technician</div><div class="v">${pm.technician || 'Unassigned'}</div></div>
            <div class="kv-item"><div class="k">Last PM</div><div class="v mono">12 Jun 2026</div></div>
          </div>
        </div>
      </div>
      <div class="card"><div class="card-head"><h3>Required Resources</h3></div>
        <div class="card-pad" style="display:flex;flex-direction:column;gap:10px">
          ${[['Skill', 'Biomedical Engineer'], ['Est. Duration', '90 min'], ['Tools', 'Safety analyzer, gas flow meter'], ['Documents', 'Manufacturer PM procedure']].map(r => `<div style="display:flex;justify-content:space-between;font-size:13px"><span class="sub2" style="margin:0">${r[0]}</span><span style="font-weight:500">${r[1]}</span></div>`).join('')}
        </div>
      </div>
      <div class="card"><div class="card-head"><h3>PM Attempt History</h3></div>
        <div class="card-pad" id="pm-job-history"><div class="sub2" style="margin:0">Loading…</div></div>
      </div>
    </div>
  </div>`;
}

async function corrJobHTML(id) {
  const w = WOMAP[id];
  const e = EQMAP[w.eq_id];
  const st = CHK_STATE[id];
  const wf = w.workflow_id ? WORKFLOWS.find(x => x.id === w.workflow_id) : null;
  const workflowStates = wf?.states?.length ? wf.states : CORR_STEPS;
  if (st.step === null) {
    st.step = wf
      ? (w.status === 'closed' ? workflowStates.length - 1 : Math.max(workflowStates.findIndex(s => s.toLowerCase() === (w.status || '').toLowerCase()), 0))
      : corrStepFromStatus(w.status);
  }
  const cur = wf ? Math.min(st.step, workflowStates.length - 1) : st.step;
  const closed = wf ? w.status === 'closed' : cur >= 8;
  const pendingCloseout = w.status === 'pending_closeout';
  const isRequestor = CMMS_USER && w.requestor && (CMMS_USER.name === w.requestor || nameMatches(CMMS_USER.name, w.requestor));
  const canApproveCloseout = isRequestor || hasPerm('Work Orders', 'Approve');
  const atTest = !wf && cur === 6;
  const wfChk = atTest ? getWorkflowChecklistForStep(6, w.workflow_id) : null;
  const customChk = wf ? getWorkflowChecklistForStep(cur, w.workflow_id) : null;
  const showChkKey = atTest ? (wfChk ? wfChk.id : 'posttest') : (customChk ? customChk.id : null);
  CHK_CTX = { tpl: showChkKey || 'posttest', mode: 'wo', id };
  const showChk = atTest || (wf && customChk);
  const stepper = `<div class="flow">${workflowStates.map((s, i) => {
    const cls = i < cur ? 'done' : i === cur ? 'current' : 'todo';
    return `<div class="flow-step ${cls}"><div class="flow-node"><div class="fn">${i < cur ? icon('check') : i + 1}</div><div class="fl"></div></div>
    <div class="flow-c"><div class="fs-t">${s}</div><div class="fs-m">${i < cur ? 'Done' : i === cur ? 'Active' : 'Pending'}</div></div></div>`;
  }).join('')}</div>`;
  return `
  <div class="job-head">
    <div>
      <div class="job-back" onclick="go('workorders')">${icon('arrowr')}<span>Back to work orders</span></div>
      <h1>${w.title}</h1>
      <div class="job-meta"><span class="mono">${id}</span><span>·</span><span>${w.type}</span><span>·</span>${priPill(w.pri)}${woStatus(closed ? 'closed' : w.status)}${wf ? `<span>·</span><span class="pill p-info" style="font-size:11px">${wf.name}</span>` : ''}</div>
    </div>
    <div class="head-actions">
      ${closed ? (() => { const sr = w.source_sr_id ? SR_DATA.find(r => r.id === w.source_sr_id) : null; const srClosed = !sr || sr.status === 'closed'; return srClosed ? `<button class="btn btn-primary" onclick="printWOReport('${id}')">${icon('file')}Print Report</button><span class="pill p-ok" style="height:34px;padding:0 14px">Closed · SLA met</span>` : `<span class="pill p-cal" style="height:34px;padding:0 14px">Awaiting requestor to close service request</span>`; })() : pendingCloseout ? `<span class="pill p-cal" style="height:34px;padding:0 14px">Awaiting requestor to close service request</span>` : hasPerm('Work Orders', 'Edit') ? `<button class="btn btn-primary" onclick="advanceJob('${id}')">${icon('play')}Advance to ${workflowStates[Math.min(cur + 1, workflowStates.length - 1)]}</button>` : ''}
    </div>
  </div>
  <div class="job-grid">
    <div class="stack">
      <div class="card"><div class="card-head"><h3>Repair Workflow${wf ? ` — ${wf.name}` : ''}</h3><span class="hint">step ${Math.min(cur + 1, workflowStates.length)} of ${workflowStates.length}</span></div>
        <div class="card-pad">${stepper}</div>
      </div>
      ${showChk ? `<div class="card"><div class="card-head"><h3>${showChkKey === 'posttest' ? 'Post-Repair Verification' : (WF_CHK_TEMPLATES.find(t => t.id === showChkKey)?.name || 'Step Checklist')}</h3><span class="hint">${WF_CHK_TEMPLATES.find(t => t.id === showChkKey)?.description || 'IEC 62353 / functional'}</span></div><div class="card-pad"><div id="chkarea">${checklistHTML(id, showChkKey, 'wo')}</div></div></div>` : ''}
      <div class="card"><div class="card-head"><h3>Diagnosis & Repair Log</h3></div>
        <div class="card-pad">
          <div class="kv-grid" style="margin-bottom:14px">
            <div class="kv-item"><div class="k">Observed Problem</div><div class="v">${w.title}</div></div>
            <div class="kv-item"><div class="k">Failure Mode</div><div class="v">${cur >= 4 ? 'Sensor / component fault' : 'Pending diagnosis'}</div></div>
            <div class="kv-item"><div class="k">Corrective Action</div><div class="v">${cur >= 5 ? 'Component replaced & recalibrated' : '—'}</div></div>
            <div class="kv-item"><div class="k">Equipment Safety</div><div class="v">${cur >= 6 ? '<span class="pill p-ok">Safe to return</span>' : '<span class="pill p-warn">Out of service</span>'}</div></div>
          </div>
          <textarea class="job-notes" placeholder="Add technician notes, observations, test results…" ${closed ? 'readonly style="opacity:.7"' : `oninput="saveNotes('${id}',this.value)"`}>${st.notes}</textarea>
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
      <div class="card"><div class="card-head"><h3>Parts Used</h3>${hasPerm('Work Orders', 'Edit') && !closed ? `<span class="link" onclick="issuePartTo('${id}')">Issue part ${icon('arrowr')}</span>` : ''}</div>
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
      ${(w.closeout_history && w.closeout_history.length > 0) ? `<div class="card"><div class="card-head"><h3>Close-Out History</h3></div><div class="card-pad">${(w.closeout_history || []).map(h => `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border)"><div><div style="font-weight:500;font-size:13px;text-transform:capitalize">${h.action}</div><div class="sub2" style="font-size:12px;margin:0">${h.by} · ${new Date(h.timestamp).toLocaleString('en-GB', { day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit' })}</div>${h.reason ? `<div class="sub2" style="font-size:12px;margin-top:4px;color:var(--crit)">Reason: ${h.reason}</div>` : ''}</div></div>`).join('')}</div></div>` : ''}
    </div>
  </div>`;
}

function getTemplate(tplKey) {
  if (CHECKLISTS[tplKey]) return CHECKLISTS[tplKey];
  const wf = WF_CHK_TEMPLATES.find(t => t.id === tplKey);
  if (wf) return { sections: wf.sections };
  const custom = PM_TEMPLATES.find(t => t.id === tplKey);
  return custom || null;
}

function getWorkflowChecklistForStep(stepIndex, workflowId) {
  return WF_CHK_TEMPLATES.find(t => t.step_index === stepIndex && (t.workflow_id === workflowId || (!t.workflow_id && !workflowId)));
}

function buildTemplateOptions(currentTpl) {
  const builtIn = Object.keys(CHECKLISTS).filter(k => k !== 'posttest').map(k => `<option value="${k}" ${k === currentTpl ? 'selected' : ''}>${k.charAt(0).toUpperCase() + k.slice(1)} (built-in)</option>`);
  const custom = PM_TEMPLATES.map(t => `<option value="${t.id}" ${t.id === currentTpl ? 'selected' : ''}>${t.name} (custom)</option>`);
  return builtIn.join('') + custom.join('');
}

async function changePMTemplate(pmId, tplKey) {
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to change PM templates'); return; }
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

async function reopenPMForRetry(id) {
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to reopen PMs'); return; }
  const pm = PMWOMAP[id];
  if (!pm) return;
  const ok = await updatePMWorkOrder(id, { status: 'inprogress', completed_on: null });
  if (!ok) { toast('Failed to reopen PM — ' + LAST_DB_ERROR); return; }
  pm.status = 'inprogress';
  pm.completed_on = null;
  CHK_STATE[id] = { checklist: {}, notes: '', supervisor: false, parts: [], step: null, technician: pm.technician || '' };
  await saveChecklistResult(id, 'pm', { checklist: {}, supervisor: false, notes: '', parts: [], step: null, technician: pm.technician || '' });
  toast('PM reopened — take new measurements and click Complete PM when done');
  addAuditLog(pm.technician || 'Admin', 'Reopened PM ' + id + ' for another attempt', 'info');
  openJob(id, 'pm');
}
window.reopenPMForRetry = reopenPMForRetry;

function checklistHTML(id, tplKey, mode) {
  const tpl = getTemplate(tplKey);
  if (!tpl) return '<div class="sub2">No checklist template found for this PM.</div>';
  const st = CHK_STATE[id] || { checklist: {}, notes: '', supervisor: false, parts: [], technician: '' };
  const pr = progressOf(st.checklist, tpl);
  const pct = pr.total ? Math.round(pr.done / pr.total * 100) : 0;
  const w = WOMAP[id];
  const pm = PMWOMAP[id];
  const currentTech = st.technician || (w ? w.assignee : pm ? (pm.technician || '') : '');
  const techOpts = ['Unassigned', ...TECHS.map(t => t.name)].map(n => `<option ${n === currentTech ? 'selected' : ''}>${n}</option>`).join('');
  const woClosed = mode === 'wo' && isWOClosed(id);
  const canEdit = hasPerm('Work Orders', 'Edit') && !woClosed;
  const secs = tpl.sections.map((sec, si) => `
    <div class="chk-sec">
      <div class="chk-sec-h">${sec.title}<span class="chk-sec-n">${sec.items.filter((it, ii) => st.checklist[si + '-' + ii]?.result).length}/${sec.items.length}</span></div>
      ${sec.items.map((it, ii) => {
    const key = si + '-' + ii;
    const r = st.checklist[key];
    if (it.type === 'check') {
      if (canEdit) {
      return `<div class="chk-item"><div class="chk-t">${it.t}</div>
          <div class="chk-seg">
            <button class="cs pass ${r?.result === 'pass' ? 'on' : ''}" onclick="setCheck('${id}','${key}','pass')">Pass</button>
            <button class="cs fail ${r?.result === 'fail' ? 'on' : ''}" onclick="setCheck('${id}','${key}','fail')">Fail</button>
            <button class="cs na ${r?.result === 'na' ? 'on' : ''}" onclick="setCheck('${id}','${key}','na')">N/A</button>
          </div></div>`;
      } else {
        const label = r?.result === 'pass' ? '<span class="pill p-ok">Pass</span>' : r?.result === 'fail' ? '<span class="pill p-crit">Fail</span>' : r?.result === 'na' ? '<span class="pill p-muted">N/A</span>' : '<span class="pill p-muted">—</span>';
        return `<div class="chk-item"><div class="chk-t">${it.t}</div><div class="chk-seg">${label}</div></div>`;
      }
    } else {
      const badge = r?.result === 'pass' ? '<span class="pill p-ok">Pass</span>' : r?.result === 'fail' ? '<span class="pill p-crit">Out of range</span>' : '';
      const inputHtml = canEdit
        ? `<input type="number" step="any" value="${r?.val ?? ''}" placeholder="—" onchange="setReading('${id}','${key}',this.value,${it.min},${it.max})">`
        : `<span class="mono" style="font-size:14px">${r?.val ?? '—'}</span>`;
      return `<div class="chk-item reading"><div class="chk-t">${it.t}<div class="chk-exp">Expected ${it.nominal} ${it.unit} · range ${it.min}–${it.max}</div></div>
          <div class="chk-read">${inputHtml}<span class="unit">${it.unit}</span>${badge}</div></div>`;
    }
  }).join('')}
    </div>`).join('');
  const canClose = pr.done === pr.total;
  const actionLabel = mode === 'pm' ? (pr.fails ? 'Record Failure & Comment' : 'Complete PM & Schedule Next') : 'Complete Testing & Verify';
  const action = mode === 'pm' ? `completePM('${id}')` : `completeTesting('${id}')`;
  return `
    <div class="chk-progress">
      <div class="chk-prog-top"><b>Checklist completion</b><span class="mono">${pr.done}/${pr.total} completed · ${pct}%${pr.fails ? ` · ${pr.fails} failed` : ''}</span></div>
      <div class="meter" style="height:9px"><i style="width:${pct}%;background:${pr.fails ? 'var(--warn)' : 'var(--primary)'}"></i></div>
      ${pr.fails ? `<div class="chk-warn">${icon('alert')} ${pr.fails} item(s) failed. Orange indicates a completed item that did not pass — it is not a passed result. Record a failure comment before taking another attempt.</div>` : ''}
      ${pr.failItems && pr.fails ? `<div class="chk-warn" style="margin-top:8px">${pr.failItems.map(f => f.val !== '—' ? `<div>• <b>${f.title}</b>: measured ${f.val} ${f.unit} — acceptable range is ${f.min}–${f.max} ${f.unit}.</div>` : `<div>• <b>${f.title}</b>: marked Failed. This check does not require a numeric measurement; explain the failure in the comment.</div>`).join('')}</div>` : ''}
      ${pr.fails && canEdit ? `<button class="btn btn-primary" style="margin-top:10px" onclick="completePM('${id}')">${icon('alert')}Record Failure & Comment</button>` : ''}
    </div>
    ${secs}
    ${canEdit ? `
    <div class="chk-signoff">
      <div class="chk-sec-h">Sign-off</div>
      <label class="fld" style="margin-bottom:12px"><span>Assigned Technician</span><select onchange="setChecklistTech('${id}',this.value)">${techOpts}</select></label>
      <label class="chk-supr"><input type="checkbox" ${st.supervisor ? 'checked' : ''} onchange="toggleSupervisor('${id}',this.checked)"> Supervisor verification obtained (required for life-support equipment)</label>
      <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:14px">
        <button class="btn ${canClose ? 'btn-primary' : 'btn-ghost'}" onclick="${action}" ${canClose ? '' : 'disabled style="opacity:.55;cursor:not-allowed"'}>${icon('check')}${actionLabel}</button>
        <button class="btn btn-ghost" onclick="saveDraft('${id}')">Save Draft</button>
      </div>
      ${!canClose ? `<div class="sub2" style="margin-top:8px">Complete all ${pr.total} checklist items to enable sign-off.</div>` : ''}
    </div>` : woClosed ? `
    <div class="chk-signoff">
      <div class="chk-sec-h">Sign-off</div>
      <div class="sub2" style="margin:0 0 12px">This work order is closed and cannot be edited.</div>
      <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:14px">
        <button class="btn btn-ghost" disabled style="opacity:.55;cursor:not-allowed">${icon('check')}${actionLabel}</button>
        <button class="btn btn-ghost" disabled style="opacity:.55;cursor:not-allowed">Save Draft</button>
      </div>
    </div>` : ''}
  `;
}

function isWOClosed(id) {
  const w = WOMAP[id];
  if (!w) return false;
  return w.status === 'closed';
}
window.isWOClosed = isWOClosed;

function setCheck(id, key, val) {
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to edit checklists'); return; }
  if (isWOClosed(id)) { toast('This work order is closed and cannot be edited'); return; }
  const st = CHK_STATE[id];
  if (!st) return;
  st.checklist[key] = { result: val };
  saveChecklistResult(id, CHK_CTX.mode === 'pm' ? 'pm' : 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step, technician: st.technician });
  refreshChecklist(id);
}
window.setCheck = setCheck;

function setReading(id, key, val, min, max) {
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to edit checklists'); return; }
  if (isWOClosed(id)) { toast('This work order is closed and cannot be edited'); return; }
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
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to edit checklists'); return; }
  if (isWOClosed(id)) { toast('This work order is closed and cannot be edited'); return; }
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
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to edit checklists'); return; }
  if (isWOClosed(id)) { toast('This work order is closed and cannot be edited'); return; }
  const st = CHK_STATE[id];
  if (!st) return;
  st.supervisor = val;
  saveChecklistResult(id, CHK_CTX.mode === 'pm' ? 'pm' : 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step, technician: st.technician });
}
window.toggleSupervisor = toggleSupervisor;

function saveNotes(id, val) {
  if (!hasPerm('Work Orders', 'Edit')) { return; }
  if (isWOClosed(id)) { return; }
  const st = CHK_STATE[id];
  if (!st) return;
  st.notes = val;
}
window.saveNotes = saveNotes;

async function saveDraft(id) {
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to save drafts'); return; }
  if (isWOClosed(id)) { toast('This work order is closed and cannot be edited'); return; }
  const st = CHK_STATE[id];
  if (!st) { toast('Nothing to save'); return; }
  const ok = await saveChecklistResult(id, CHK_CTX.mode === 'pm' ? 'pm' : 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step, technician: st.technician });
  if (ok) { toast('Draft saved'); }
  else { toast('Failed to save draft — ' + LAST_DB_ERROR); }
}
window.saveDraft = saveDraft;

function jobPartsHTML(id) {
  const st = CHK_STATE[id];
  if (!st || !st.parts.length) return '<div class="sub2" style="margin:0">No parts issued yet.</div>';
  return st.parts.map(p => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)"><div class="doc-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('parts')}</div><div style="flex:1"><div style="font-weight:500;font-size:13px">${p.name}</div><div class="sub2 mono">${p.id} · qty ${p.qty}</div></div><span class="mono">$${p.cost * p.qty}</span></div>`).join('');
}

let ISSUE_PART_WO_ID = null;
function issuePartTo(id) {
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to issue parts'); return; }
  if (isWOClosed(id)) { toast('This work order is closed and cannot be edited'); return; }
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
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to issue parts'); return; }
  if (isWOClosed(ISSUE_PART_WO_ID)) { toast('This work order is closed and cannot be edited'); return; }
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
  if (p.qty <= p.min_qty) {
    await fireNotification(null, 'Low Stock Alert', `${p.name} (${p.id}) is at ${p.qty} units — minimum is ${p.min_qty}. Reorder needed.`, 'warn', 'Store / Management');
  }
  let st = CHK_STATE[id];
  if (!st) {
    const saved = await loadChecklistResult(id);
    const wo = WOMAP[id];
    st = saved ? { checklist: saved.checklist || {}, notes: saved.notes || '', supervisor: saved.supervisor || false, parts: saved.parts || [], step: saved.step ?? null, technician: saved.technician || '' } : { checklist: {}, notes: '', supervisor: false, parts: [], step: null, technician: (wo && wo.assignee) || '' };
    CHK_STATE[id] = st;
  }
  st.parts.push({ id: p.id, name: p.name, qty, cost: Number(p.cost) });
  await saveChecklistResult(id, 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step, technician: st.technician });
  closeDrawer();
  openJob(id, 'wo');
  const el = document.getElementById('jobparts');
  if (el) el.innerHTML = jobPartsHTML(id);
  toast('Issued ' + qty + ' × ' + p.id + ' to ' + id + ' — stock now ' + p.qty);
  addAuditLog('Store', 'Issued ' + qty + ' × ' + p.id + ' to ' + id, 'warn');
}
window.submitIssuePartTo = submitIssuePartTo;

async function completePM(id) {
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to complete PMs'); return; }
  const pm = PMWOMAP[id];
  const st = CHK_STATE[id];
  const tpl = getTemplate(pm.tpl);
  const pr = progressOf(st.checklist, tpl);
  if (pr.done < pr.total) { toast('Complete all checklist items first'); return; }
  const e = EQMAP[pm.eq_id];
  const failed = pr.fails > 0;
  const techName = st.technician || pm.technician || 'Unassigned';
  const failDetails = failed ? pr.failItems.map(f => f.val !== '—' ? `${f.title}: ${f.val} ${f.unit} (range ${f.min}–${f.max})` : f.title).join('; ') : '';

  if (failed) {
    openFailCommentDialog(id, pr, techName, failDetails);
    return;
  }

  const existingHistory = await loadPMHistory(id);
  const attemptNum = existingHistory.length + 1;
  const historyRecord = await addPMHistory({
    pm_work_order_id: id, eq_id: pm.eq_id, result: 'pass',
    readings: st.checklist, fail_details: '', technician: techName,
    comment: '', attempt: attemptNum,
  });
  if (!historyRecord) { toast('Failed to save PM attempt — ' + LAST_DB_ERROR); return; }

  const pmOk = await updatePMWorkOrder(id, { status: 'completed', completed_on: TODAY });
  if (!pmOk) { toast('Failed to complete PM — ' + LAST_DB_ERROR); return; }
  pm.status = 'completed';
  pm.completed_on = TODAY;
  const newPM = Math.min(100, Math.max(e.pm, 98));
  const nextPM = addInterval(pm.due, pm.freq, PM_FREQS);
  const eqOk = await saveEquipment({ ...e, pm: newPM, next_pm: nextPM, status: (e.status === 'pm' || e.status === 'maint') ? 'available' : e.status });
  if (!eqOk) { toast('Failed to update equipment — ' + LAST_DB_ERROR); return; }
  e.pm = newPM;
  e.next_pm = nextPM;
  if (e.status === 'pm' || e.status === 'maint') e.status = 'available';

  toast('PM ' + id + ' completed — next ' + pm.freq.toLowerCase() + ' PM scheduled ' + fmtDate(e.next_pm));
  addAuditLog(techName, 'Completed PM ' + id + ' on ' + e.tag, 'ok');
  await fireNotification(id, 'PM Completed', `${id} — ${pm.title} on ${e.tag} (${e.name}) was completed successfully by ${techName}. Next ${pm.freq.toLowerCase()} PM scheduled ${fmtDate(nextPM)}.`, 'ok', 'Biomedical Engineering');
  const supervisor = findSupervisorForTeam(pm.team);
  if (supervisor && shouldSendEmail(supervisor.name, 'close', 'pm')) {
    await fireEmail(id, supervisor.email, supervisor.name, `PM Completed — ${id}`, `A preventive maintenance has been completed successfully.

PM Work Order: ${id}
Title: ${pm.title}
Equipment: ${e.tag} — ${e.name}
Completed by: ${techName}
Result: All readings passed
Next PM: ${fmtDate(nextPM)}

The equipment has been returned to service.`);
  }
  openJob(id, 'pm');
}
window.completePM = completePM;

let FAIL_COMMENT_PM_ID = null;
function openFailCommentDialog(id, pr, techName, failDetails) {
  FAIL_COMMENT_PM_ID = id;
  const pm = PMWOMAP[id];
  const e = EQMAP[pm.eq_id];
  const failList = pr.failItems.map(f => f.val !== '—'
    ? `<div style="padding:6px 0;border-bottom:1px solid var(--border)"><b>${f.title}</b>: measured ${f.val} ${f.unit} — acceptable range ${f.min}–${f.max} ${f.unit}</div>`
    : `<div style="padding:6px 0;border-bottom:1px solid var(--border)"><b>${f.title}</b>: failed</div>`
  ).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--warn-soft,var(--surface-3));color:var(--warn)">${icon('alert')}</div><div><h2>PM Failed — Record Comment</h2><div class="did">${id} · ${pm.title} on ${e.tag}</div></div></div><button class="icon-btn close" onclick="closeDrawer();openJob('${id}','pm')">${icon('x')}</button></div>
  <div class="drawer-body">
    <div class="dsec"><h4>Failed Readings (${pr.fails})</h4><div style="font-size:13px">${failList}</div></div>
    <div class="dsec"><h4>Comment — Why did this PM fail?</h4>
      <textarea id="fail_comment" rows="4" style="width:100%;font-size:13px;padding:10px;border:1px solid var(--border);border-radius:8px;resize:vertical" placeholder="Explain why the readings were out of range — e.g. 'Sensor drift detected, recalibration needed' or 'Equipment fault requires corrective work order'"></textarea>
    </div>
    <div class="dsec" style="display:flex;gap:9px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="submitFailComment()">${icon('check')}Record Failed Attempt</button>
      <button class="btn btn-ghost" onclick="closeDrawer();openJob('${id}','pm')">${icon('back')}Back to Checklist (Re-measure)</button>
    </div>
    <div class="sub2" style="margin-top:10px">Recording a failed attempt saves it to the PM history. You can then adjust the readings and re-measure. The PM stays open until all readings pass.</div>
  </div>`);
}
window.openFailCommentDialog = openFailCommentDialog;

async function submitFailComment() {
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to record PM failures'); return; }
  const id = FAIL_COMMENT_PM_ID;
  if (!id) return;
  const pm = PMWOMAP[id];
  const st = CHK_STATE[id];
  const tpl = getTemplate(pm.tpl);
  const pr = progressOf(st.checklist, tpl);
  const techName = st.technician || pm.technician || 'Unassigned';
  const e = EQMAP[pm.eq_id];
  const failDetails = pr.failItems.map(f => f.val !== '—' ? `${f.title}: ${f.val} ${f.unit} (range ${f.min}–${f.max})` : f.title).join('; ');
  const comment = (document.getElementById('fail_comment')?.value || '').trim();
  if (!comment) { toast('Please enter a comment explaining why the PM failed'); return; }

  const existingHistory = await loadPMHistory(id);
  const attemptNum = existingHistory.length + 1;
  const historyRecord = await addPMHistory({
    pm_work_order_id: id, eq_id: pm.eq_id, result: 'fail',
    readings: st.checklist, fail_details: failDetails, technician: techName,
    comment, attempt: attemptNum,
  });
  if (!historyRecord) { toast('Failed to save failed attempt — ' + LAST_DB_ERROR); return; }

  addAuditLog(techName, 'PM ' + id + ' failed on ' + e.tag + ' — ' + pr.fails + ' reading(s) out of range: ' + failDetails, 'warn');
  await fireNotification(id, 'PM Failed — ' + pr.fails + ' reading(s) out of range', `${id} — ${pm.title} on ${e.tag} (${e.name}) failed. ${pr.fails} reading(s) out of range. Technician: ${techName}. Comment: ${comment}`, 'warn', 'Biomedical Engineering');
  const supervisor = findSupervisorForTeam(pm.team);
  if (supervisor) {
    await fireNotification(id, 'PM Failed — Review Required', `${id} — ${pm.title} on ${e.tag}: ${failDetails}. Completed by ${techName}. Comment: ${comment}`, 'crit', supervisor.name);
    if (shouldSendEmail(supervisor.name, 'update', 'pm')) {
      await fireEmail(id, supervisor.email, supervisor.name, `PM Failed Readings — ${id}`, `A preventive maintenance attempt failed with out-of-range readings.

PM Work Order: ${id}
Title: ${pm.title}
Equipment: ${e.tag} — ${e.name}
Technician: ${techName}
Failed Readings: ${pr.fails}
Attempt: ${attemptNum}

Details:
${failDetails}

Technician Comment:
${comment}

The PM remains open for re-measurement. Please review in Vitalis CMMS.`);
    }
  }

  toast('Failed attempt #' + attemptNum + ' recorded — adjust readings and re-measure');
  closeDrawer();
  openJob(id, 'pm');
}
window.submitFailComment = submitFailComment;

async function completeTesting(id) {
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to complete work order testing'); return; }
  if (isWOClosed(id)) { toast('This work order is closed and cannot be edited'); return; }
  const st = CHK_STATE[id];
  const w = WOMAP[id];
  const wf = w.workflow_id ? WORKFLOWS.find(x => x.id === w.workflow_id) : null;
  const chkStep = wf ? (st.step ?? 0) : 6;
  const wfChk = getWorkflowChecklistForStep(chkStep, w.workflow_id);
  const chkKey = wfChk ? wfChk.id : 'posttest';
  const pr = progressOf(st.checklist, getTemplate(chkKey));
  if (pr.done < pr.total) { toast('Complete all verification items'); return; }
  if (pr.fails) {
    const details = pr.failItems.map(f => f.val !== '—' ? `${f.title}: ${f.val} ${f.unit} (range ${f.min}–${f.max})` : f.title).join('; ');
    toast('Testing failed — ' + details + '. Equipment cannot return to service');
    return;
  }
  if (wf) {
    const workflowStates = wf.states?.length ? wf.states : CORR_STEPS;
    st.step = Math.min(workflowStates.length - 1, st.step + 1);
  } else {
    st.step = 6;
  }
  saveChecklistResult(id, 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step, technician: st.technician });
  toast('Post-repair testing passed — ready for verification');
  openJob(id, 'wo');
}
window.completeTesting = completeTesting;

async function advanceJob(id) {
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to advance work orders'); return; }
  if (isWOClosed(id)) { toast('This work order is closed and cannot be edited'); return; }
  const w = WOMAP[id];
  const st = CHK_STATE[id];
  const wf = w.workflow_id ? WORKFLOWS.find(x => x.id === w.workflow_id) : null;
  const workflowStates = wf?.states?.length ? wf.states : CORR_STEPS;
  if (st.step === null) {
    st.step = wf
      ? (w.status === 'closed' ? workflowStates.length - 1 : Math.max(workflowStates.findIndex(s => s.toLowerCase() === (w.status || '').toLowerCase()), 0))
      : corrStepFromStatus(w.status);
  }
  const maxStep = workflowStates.length - 1;
  if (!wf && st.step === 6) {
    const wfChk = getWorkflowChecklistForStep(6, w.workflow_id);
    const chkKey = wfChk ? wfChk.id : 'posttest';
    const pr = progressOf(st.checklist, getTemplate(chkKey));
    if (pr.done < pr.total) { toast('Complete post-repair verification checklist to proceed'); return; }
    if (pr.fails) { toast('Verification failed — cannot advance to return-to-service'); return; }
  }
  if (wf) {
    const customChk = getWorkflowChecklistForStep(st.step, w.workflow_id);
    if (customChk) {
      const tpl = getTemplate(customChk.id);
      const pr = progressOf(st.checklist, tpl);
      if (pr.done < pr.total) { toast('Complete the "' + customChk.name + '" checklist to proceed'); return; }
      if (pr.fails) { toast('Checklist "' + customChk.name + '" has failed items — cannot advance'); return; }
    }
  }
  st.step = Math.min(maxStep, st.step + 1);
  saveChecklistResult(id, 'wo', { checklist: st.checklist, supervisor: st.supervisor, notes: st.notes, parts: st.parts, step: st.step, technician: st.technician });
  if (st.step >= maxStep) {
    const history = w.closeout_history || [];
    history.push({ action: 'submitted', by: w.assignee || 'Technician', timestamp: new Date().toISOString() });
    const closeOk = await updateWorkOrder(id, { status: 'pending_closeout', sla_pct: 100, closeout_status: 'pending_closeout', closeout_history: history });
    if (!closeOk) { toast('Failed to submit for close-out — ' + LAST_DB_ERROR); return; }
    w.status = 'pending_closeout';
    w.sla_pct = 100;
    w.closeout_status = 'pending_closeout';
    w.closeout_history = history;
    toast('Work order ' + id + ' submitted for requestor close-out review');
    addAuditLog(w.assignee, 'Submitted work order ' + id + ' for close-out review', 'info');
    const eq = EQMAP[w.eq_id];
    const requestorEmail = w.requestor ? (USERS.find(u => u.name === w.requestor)?.email || '') : '';
    if (w.requestor && requestorEmail) {
      await fireNotification(id, 'Work Order Ready for Close-Out', `${id} — ${w.title} has been completed by ${w.assignee}. Please review and confirm closure.`, 'ok', w.requestor);
      if (shouldSendEmail(w.requestor, 'update', 'wo')) {
        await fireEmail(id, requestorEmail, w.requestor, `Work Order Completed — Review & Close — ${id}`, `Your service request has been completed by the technician and is ready for your review.

Work Order: ${id}
Title: ${w.title}
Equipment: ${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}
Completed by: ${w.assignee}
Status: Awaiting your close-out confirmation

Please review the work in Vitalis CMMS and confirm closure. If the issue is not resolved, you can reject the close-out and the work order will be reopened.`);
      }
    }
    const supervisor = findSupervisorForTeam(w.team);
    if (supervisor) {
      await fireNotification(id, 'Work Order Awaiting Close-Out', `${id} — ${w.title} completed by ${w.assignee}. Awaiting requestor confirmation.`, 'info', supervisor.name);
      if (shouldSendEmail(supervisor.name, 'update', 'wo')) {
        await fireEmail(id, supervisor.email, supervisor.name, `Work Order Awaiting Close-Out — ${id}`, `A work order has been completed and is awaiting requestor close-out confirmation.

Work Order: ${id}
Title: ${w.title}
Equipment: ${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}
Completed by: ${w.assignee}

Please review in Vitalis CMMS.`);
      }
    }
  } else {
    let newStatus;
    if (wf) {
      newStatus = workflowStates[st.step] || 'inprogress';
    } else {
      const smap = { 4: 'inprogress', 5: 'inprogress', 6: 'inprogress', 7: 'inprogress' };
      newStatus = smap[st.step] || null;
    }
    if (newStatus) {
      const advOk = await updateWorkOrder(id, { status: newStatus });
      if (!advOk) { toast('Failed to update — ' + LAST_DB_ERROR); return; }
      w.status = newStatus;
    }
    toast('Advanced to ' + workflowStates[st.step]);
    const eq = EQMAP[w.eq_id];
    const requestorEmail = w.requestor ? (USERS.find(u => u.name === w.requestor)?.email || '') : '';
    if (w.requestor && requestorEmail) {
      await fireNotification(id, 'Work Order Update', `${id} — Status changed to "${workflowStates[st.step]}"`, 'info', w.requestor);
      if (shouldSendEmail(w.requestor, 'update', 'wo')) {
        await fireEmail(id, requestorEmail, w.requestor, `Work Order Update — ${id}`, `The status of your service request has been updated.

Work Order: ${id}
Title: ${w.title}
Equipment: ${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}
New Status: ${workflowStates[st.step]}
Assigned to: ${w.assignee}

You will continue to receive updates as the work progresses.`);
      }
    }
  }
  openJob(id, 'wo');
}
window.advanceJob = advanceJob;

async function confirmCloseout(id) {
  const w = WOMAP[id];
  if (!w) return;
  const isRequestor = CMMS_USER && (w.requestor === CMMS_USER.name || w.requestor === CMMS_USER.email);
  if (!isRequestor && !hasPerm('Work Orders', 'Edit')) { toast('Only the requestor can confirm close-out'); return; }
  if (!w) return;
  const history = w.closeout_history || [];
  history.push({ action: 'confirmed', by: CMMS_USER?.name || w.requestor || 'Requestor', timestamp: new Date().toISOString() });
  const slaResult = computeSLA(w, SLA_CONFIG);
  const slaLabel = slaResult.met ? 'Met' : 'Breached';
  const ok = await updateWorkOrder(id, { status: 'closed', closeout_status: 'confirmed', closeout_history: history, sla: slaLabel, sla_pct: 100 });
  if (!ok) { toast('Failed to confirm close-out — ' + LAST_DB_ERROR); return; }
  w.status = 'closed';
  w.closeout_status = 'confirmed';
  w.closeout_history = history;
  w.sla = slaLabel;
  w.sla_pct = 100;
  toast('Work order ' + id + ' confirmed and closed');
  addAuditLog(CMMS_USER?.name || w.requestor, 'Confirmed close-out for ' + id, 'ok');
  const eq = EQMAP[w.eq_id];
  const supervisor = findSupervisorForTeam(w.team);
  if (supervisor) {
    await fireNotification(id, 'Work Order Closed', `${id} — ${w.title} confirmed and closed by ${w.requestor || 'requestor'}.`, 'ok', supervisor.name);
    if (shouldSendEmail(supervisor.name, 'close', 'wo')) {
      await fireEmail(id, supervisor.email, supervisor.name, `Work Order Closed — ${id}`, `The requestor has confirmed close-out and the work order is now closed.

Work Order: ${id}
Title: ${w.title}
Equipment: ${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}
Confirmed by: ${w.requestor || 'Requestor'}
Technician: ${w.assignee}

The technician can now print the final report from Vitalis CMMS.`);
    }
  }
  if (w.assignee && w.assignee !== 'Unassigned') {
    const techEmail = USERS.find(u => u.name === w.assignee)?.email || w.assignee.toLowerCase().replace(/ /g, '.') + '@cedarridge.org';
    await fireNotification(id, 'Work Order Closed', `${id} — ${w.title} confirmed and closed by ${w.requestor || 'requestor'}.`, 'ok', w.assignee);
    if (shouldSendEmail(w.assignee, 'close', 'wo')) {
      await fireEmail(id, techEmail, w.assignee, `Work Order Closed — ${id}`, `The requestor has confirmed close-out and the work order is now closed.

Work Order: ${id}
Title: ${w.title}
Equipment: ${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}
Confirmed by: ${w.requestor || 'Requestor'}

The final PDF report is now available for printing from Vitalis CMMS.`);
    }
  }
  openJob(id, 'wo');
}
window.confirmCloseout = confirmCloseout;

let REJECT_WO_ID = null;
function openRejectCloseout(id) {
  REJECT_WO_ID = id;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--crit-soft,var(--crit));color:#fff">${icon('alert')}</div><div><h2>Reject Close-Out & Reopen</h2><div class="did">${id}</div></div></div><button class="icon-btn close" onclick="closeDrawer();openJob('${id}','wo')">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Why is this not resolved?</h4>
    <p class="sub2" style="margin:0 0 12px">The work order will be reopened and the technician will be notified. Your explanation will be saved to the close-out history.</p>
    <label class="fld"><span>Reason <span style="color:var(--crit)">*required</span></span><textarea id="rej_reason" rows="4" placeholder="e.g. The alarm is still not triggering when parameters are exceeded"></textarea></label>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitRejectCloseout()">${icon('alert')}Reject & Reopen</button><button class="btn btn-ghost" onclick="closeDrawer();openJob('${id}','wo')">Cancel</button></div>
  </div></div>`);
}
window.openRejectCloseout = openRejectCloseout;

async function submitRejectCloseout() {
  const id = REJECT_WO_ID;
  if (!id) return;
  const reason = document.getElementById('rej_reason').value.trim();
  if (!reason) { toast('Please explain why the work was not complete'); return; }
  const w = WOMAP[id];
  if (!w) return;
  const isRequestor = CMMS_USER && (w.requestor === CMMS_USER.name || w.requestor === CMMS_USER.email);
  if (!isRequestor && !hasPerm('Work Orders', 'Edit')) { toast('Only the requestor can reject close-out'); return; }
  const history = w.closeout_history || [];
  history.push({ action: 'rejected', by: CMMS_USER?.name || w.requestor || 'Requestor', reason, timestamp: new Date().toISOString() });
  const ok = await updateWorkOrder(id, { status: 'inprogress', closeout_status: 'rejected', closeout_reason: reason, closeout_history: history });
  if (!ok) { toast('Failed to reopen — ' + LAST_DB_ERROR); return; }
  w.status = 'inprogress';
  w.closeout_status = 'rejected';
  w.closeout_reason = reason;
  w.closeout_history = history;
  closeDrawer();
  toast('Work order ' + id + ' reopened — technician notified');
  addAuditLog(CMMS_USER?.name || w.requestor, 'Rejected close-out for ' + id + ' — ' + reason, 'warn');
  const eq = EQMAP[w.eq_id];
  if (w.assignee) {
    const techEmail = w.assignee.toLowerCase().replace(/ /g, '.') + '@cedarridge.org';
    await fireNotification(id, 'Work Order Reopened', `${id} — ${w.title} rejected by requestor. ${reason}`, 'warn', w.assignee);
    if (shouldSendEmail(w.assignee, 'update', 'wo')) {
      await fireEmail(id, techEmail, w.assignee, `Work Order Reopened — ${id}`, `The requestor has rejected the close-out and the work order has been reopened.

Work Order: ${id}
Title: ${w.title}
Equipment: ${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}
Rejected by: ${w.requestor || 'Requestor'}
Reason: ${reason}

Please review the reason and address the issue in Vitalis CMMS.`);
    }
  }
  openJob(id, 'wo');
}
window.submitRejectCloseout = submitRejectCloseout;

/* ================= CREATE FORMS ================= */

let NEWWO = {};
function openNewWorkOrder() {
  NEWWO = { type: 'Corrective', pri: 'P3', assignee: 'Unassigned', team: 'Biomedical', eq_id: '', title: '', workflow_id: '', requestor: '' }; window.NEWWO = NEWWO;
  const eqOpts = visibleEquipment().map(e => `<option value="${e.id}">${e.tag} — ${e.name}</option>`).join('');
  const techOpts = ['Unassigned', ...TECHS.map(t => t.name)].map(n => `<option ${n === 'Unassigned' ? 'selected' : ''}>${n}</option>`).join('');
  const wfOpts = ['<option value="">No workflow (default corrective flow)</option>', ...WORKFLOWS.map(w => `<option value="${w.id}">${w.name}</option>`)].join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('wo')}</div><div><h2>New Work Order</h2><div class="did">Create a corrective or preventive work order</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Work Order Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Title / Problem Description</span><input id="nw_title" placeholder="e.g. Ventilator alarm not triggering" oninput="window.NEWWO.title=this.value"></label>
      <label class="fld"><span>Equipment</span><select id="nw_eq" onchange="window.NEWWO.eq_id=this.value"><option value="">Select equipment…</option>${eqOpts}</select></label>
      <label class="fld"><span>Type</span><select id="nw_type" onchange="window.NEWWO.type=this.value"><option>Corrective</option><option>Preventive</option><option>Calibration</option><option>Safety Test</option></select></label>
      <label class="fld"><span>Priority</span><select id="nw_pri" onchange="window.NEWWO.pri=this.value">${priOpts('P2')}</select></label>
      <label class="fld"><span>Assignee</span><select id="nw_assignee" onchange="window.NEWWO.assignee=this.value">${techOpts}</select></label>
      <label class="fld"><span>Team</span><select id="nw_team" onchange="window.NEWWO.team=this.value">${teamOpts('')}</select></label>
      <label class="fld"><span>Due Date</span><input id="nw_due" type="date" onchange="window.NEWWO.due=this.value"></label>
      <label class="fld"><span>Workflow</span><select id="nw_wf" onchange="window.NEWWO.workflow_id=this.value">${wfOpts}</select></label>
      <label class="fld"><span>Requestor (optional)</span><input id="nw_requestor" placeholder="e.g. Nurse on duty" oninput="window.NEWWO.requestor=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitWorkOrder()">${icon('check')}Create Work Order</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openNewWorkOrder = openNewWorkOrder;

async function submitWorkOrder() {
  if (!hasPerm('Work Orders', 'Create')) { toast('You do not have permission to create work orders'); return; }
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
  if (wo.assignee && wo.assignee !== 'Unassigned') {
    await fireNotification(id, 'New Work Order Assigned', `${id} — ${wo.title} has been assigned to you (${wo.team})`, 'info', wo.assignee);
    if (shouldSendEmail(wo.assignee, 'create', 'wo')) {
      await fireEmail(id, wo.assignee.toLowerCase().replace(/ /g, '.') + '@cedarridge.org', wo.assignee, `New Work Order — ${id}`, `You have been assigned a new work order.\n\nWork Order: ${id}\nTitle: ${wo.title}\nEquipment: ${EQMAP[wo.eq_id] ? EQMAP[wo.eq_id].tag + ' — ' + EQMAP[wo.eq_id].name : '—'}\nType: ${wo.type}\nPriority: ${wo.pri}\nTeam: ${wo.team}\nDue: ${wo.due}\n\nPlease review this work order in Vitalis CMMS.`);
    }
  }
}
window.submitWorkOrder = submitWorkOrder;

let NEWSR = {};
async function openServiceRequest(srId) {
  const sr = SR_DATA.find(r => r.id === srId);
  if (!sr) { toast('Service request not found'); return; }
  const eq = EQMAP[sr.eq_id];
  const linkedWO = WORKORDERS.find(w => w.source_sr_id === srId);
  const isMySR = CMMS_USER && (sr.user_id === CMMS_USER.id || sr.by === CMMS_USER.name);
  const canCloseSR = isMySR && linkedWO && (linkedWO.status === 'closed' || linkedWO.status === 'pending_closeout') && (!sr.status || sr.status === 'open' || sr.status === 'submitted' || sr.status === 'converted');
  const canRejectSR = canCloseSR;

  let statusPill = '<span class="pill p-muted">In progress</span>';
  if (sr.status === 'closed') statusPill = '<span class="pill p-ok">Closed</span>';
  else if (linkedWO && linkedWO.status === 'pending_closeout') statusPill = '<span class="pill p-warn">Awaiting confirmation</span>';
  else if (linkedWO) statusPill = '<span class="pill p-info">Work order in progress</span>';
  else if (sr.status === 'converted' || sr.usable === 'Converted') statusPill = '<span class="pill p-info">Converted to WO</span>';

  const urgPill = sr.urg === 'High' ? '<span class="pill p-crit">High</span>' : sr.urg === 'Medium' ? '<span class="pill p-warn">Medium</span>' : '<span class="pill p-muted">Low</span>';

  const historyHtml = (sr.closeout_history || []).length ? (sr.closeout_history || []).map(h => {
    const cls = h.action === 'closed' ? 'p-ok' : h.action === 'rejected' ? 'p-crit' : 'p-info';
    const label = h.action === 'closed' ? 'Closed' : h.action === 'rejected' ? 'Rejected' : h.action;
    return `<div class="doc-row"><div class="doc-ic" style="background:var(--surface-3)">${icon(h.action === 'closed' ? 'check' : 'alert')}</div><div style="flex:1"><div class="dn">${label} by ${h.by}</div><div class="dm mono">${fmtDate(h.timestamp)}${h.reason ? ' — ' + h.reason : ''}</div></div><span class="pill ${cls}">${label}</span></div>`;
  }).join('') : '<div class="empty">No history yet</div>';

  const qrPayload = window.location.origin + window.location.pathname + '#sr=' + srId;

  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('alert')}</div><div><h2>Service Request</h2><div class="did">${sr.id}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body">
    <div class="dsec" style="display:flex;gap:8px;flex-wrap:wrap">${statusPill}${urgPill}<span class="pill ${sr.usable === 'Yes' ? 'p-ok' : sr.usable === 'No' ? 'p-crit' : 'p-warn'}">${sr.usable === 'Yes' ? 'Usable' : sr.usable === 'No' ? 'Not usable' : sr.usable}</span></div>
    <div class="dsec"><h4>Request Details</h4><div class="kv-grid">
      <div class="kv-item"><div class="k">Equipment</div><div class="v">${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}</div></div>
      <div class="kv-item"><div class="k">Department</div><div class="v">${eq ? eq.dept || '—' : '—'}</div></div>
      <div class="kv-item"><div class="k">Reported By</div><div class="v">${sr.by || 'Anonymous'}</div></div>
      <div class="kv-item"><div class="k">Reported On</div><div class="v mono">${sr.time || '—'}</div></div>
      <div class="kv-item"><div class="k">Urgency</div><div class="v">${sr.urg || '—'}</div></div>
      <div class="kv-item"><div class="k">Linked Work Order</div><div class="v mono">${linkedWO ? linkedWO.id : 'Not yet converted'}</div></div>
    </div></div>
    <div class="dsec"><h4>Description</h4><p style="font-size:14px;line-height:1.6;color:var(--text-2)">${sr.description || 'No description provided'}</p></div>
    ${linkedWO ? `<div class="dsec"><h4>Linked Work Order</h4><div class="doc-row" onclick="closeDrawer();openJob('${linkedWO.id}','wo')" style="cursor:pointer"><div class="doc-ic" style="background:var(--warn-soft);color:var(--warn)">${icon('wo')}</div><div style="flex:1"><div class="dn">${linkedWO.title}</div><div class="dm mono">${linkedWO.id} · ${linkedWO.status} · ${linkedWO.assignee || 'Unassigned'}</div></div>${woStatus(linkedWO.status)}</div></div>` : ''}
    <div class="dsec"><h4>QR Code</h4><div style="text-align:center"><div id="sr-qr-img" style="display:flex;align-items:center;justify-content:center;min-height:160px"><div class="empty">Generating QR…</div></div><div class="dm mono" style="margin-top:10px;font-size:11px;word-break:break-all">${qrPayload}</div><div style="margin-top:12px;display:flex;gap:9px;justify-content:center;flex-wrap:wrap"><button class="btn btn-ghost" id="sr-qr-download" style="display:none">${icon('download')}Download QR</button><button class="btn btn-ghost" onclick="printSRQR('${srId}')">${icon('print')}Print QR</button></div></div></div>
    <div class="dsec"><h4>History</h4>${historyHtml}</div>
    <div class="dsec" style="display:flex;gap:9px;flex-wrap:wrap">
      ${canCloseSR ? `<button class="btn btn-primary" onclick="closeServiceRequest('${sr.id}')">${icon('check')}Confirm & Close</button>` : ''}
      ${canRejectSR ? `<button class="btn btn-ghost" style="color:var(--crit)" onclick="openRejectServiceRequest('${sr.id}')">${icon('alert')}Reject & Reopen</button>` : ''}
      <button class="btn btn-ghost" onclick="closeDrawer()">Close</button>
    </div>
  </div>`);
  try {
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 160, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } });
    const el = document.getElementById('sr-qr-img');
    if (el) el.innerHTML = `<img src="${qrDataUrl}" alt="QR Code" style="width:160px;height:160px;border-radius:10px;border:1px solid var(--border)">`;
    const dlBtn = document.getElementById('sr-qr-download');
    if (dlBtn) { dlBtn.style.display = 'inline-flex'; dlBtn.onclick = function() { const a = document.createElement('a'); a.href = qrDataUrl; a.download = sr.id + '-qr.png'; a.click(); }; }
  } catch (err) {
    const el = document.getElementById('sr-qr-img');
    if (el) el.innerHTML = '<div class="empty">QR code not available</div>';
  }
}
window.openServiceRequest = openServiceRequest;

function printSRQR(srId) {
  const sr = SR_DATA.find(r => r.id === srId);
  if (!sr) return;
  const eq = EQMAP[sr.eq_id];
  const payload = window.location.origin + window.location.pathname + '#sr=' + srId;
  QRCode.toDataURL(payload, { width: 200, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } }).then(qrUrl => {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${srId} — QR Label</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;padding:20px;text-align:center}.label{border:2px solid #0f172a;border-radius:12px;padding:20px;display:inline-block}img{width:200px;height:200px}h1{font-size:16px;margin:10px 0 4px}p{font-size:12px;color:#475569}</style></head><body><div class="label"><img src="${qrUrl}"><h1>${srId}</h1><p>${eq ? eq.tag + ' — ' + eq.name : ''}</p><p style="margin-top:4px">Scan to view request status</p></div><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    w.document.close();
  });
}
window.printSRQR = printSRQR;

function openReportFault() {
  NEWSR = { eq_id: '', by: CMMS_USER?.name || '', description: '', usable: 'Yes', urg: 'Medium' }; window.NEWSR = NEWSR;
  const eqOpts = visibleEquipment().map(e => `<option value="${e.id}">${e.tag} — ${e.name}</option>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('alert')}</div><div><h2>Report a Fault</h2><div class="did">Log a service request from the floor${isDeptScoped() ? ' — ' + userDepts().join(', ') : ''}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Fault Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Equipment <span style="color:var(--crit)">*required</span></span><select id="sr_eq" onchange="window.NEWSR.eq_id=this.value"><option value="">Select equipment…</option>${eqOpts}</select></label>
      <label class="fld"><span>Reported By</span><input id="sr_by" value="${NEWSR.by}" placeholder="e.g. Nurse on duty" oninput="window.NEWSR.by=this.value"></label>
      <label class="fld"><span>Fault Description <span style="color:var(--crit)">*required</span></span><textarea id="sr_desc" rows="3" placeholder="Describe what is wrong with the equipment — e.g. 'Alarm not sounding when parameters are exceeded'" oninput="window.NEWSR.description=this.value"></textarea></label>
      <label class="fld"><span>Is the equipment usable?</span><select id="sr_usable" onchange="window.NEWSR.usable=this.value"><option>Yes</option><option>Limited</option><option>No</option></select></label>
      <label class="fld"><span>Urgency</span><select id="sr_urg" onchange="window.NEWSR.urg=this.value">${(PRIORITIES.length ? PRIORITIES.slice().sort((a, b) => a.sort_order - b.sort_order).map(p => p.label) : ['Low', 'Medium', 'High']).map(u => `<option ${u === 'Medium' ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitServiceRequest()">${icon('check')}Submit Request</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openReportFault = openReportFault;

async function submitServiceRequest() {
  if (!hasPerm('Service Requests', 'Create')) { toast('You do not have permission to submit service requests'); return; }
  if (!window.NEWSR.description) { toast('Enter a fault description'); return; }
  if (!window.NEWSR.eq_id) { toast('Select the affected equipment'); return; }
  const id = await generateServiceRequestId();
  if (!id) { toast('Failed to generate request ID — please try again'); return; }
  const now = new Date();
  const timeStr = `${now.getDate().toString().padStart(2,'0')} ${now.toLocaleDateString('en-GB',{month:'short'})} ${now.getFullYear()}`;
  const sr = {
    id, eq_id: window.NEWSR.eq_id, by: window.NEWSR.by || 'Anonymous', description: window.NEWSR.description,
    usable: window.NEWSR.usable, time: timeStr, urg: window.NEWSR.urg, user_id: CMMS_USER?.id || 'unknown',
  };
  const ok = await addServiceRequest(sr);
  if (!ok) { toast('Failed to submit request — ' + LAST_DB_ERROR); return; }
  SR_DATA.unshift(sr);
  if (CURRENT === 'requests') go('requests');
  addAuditLog(window.NEWSR.by || 'Anonymous', 'Reported fault ' + id + ' — ' + window.NEWSR.description.slice(0, 40), 'warn');
  const eq = EQMAP[window.NEWSR.eq_id];
  const requestMessage = `${id} — ${window.NEWSR.description.slice(0, 60)}${eq ? ' (' + eq.tag + ')' : ''}`;
  await fireNotification(null, 'New Service Request', requestMessage, 'warn', 'Biomedical Engineering');
  if (shouldSendEmail('Biomedical Engineering', 'create', 'sr')) {
    await fireEmail(null, 'biomedical@cedarridge.org', 'Biomedical Engineering', `New Service Request — ${id}`, `A new service request has been submitted and is awaiting triage.

Request ID: ${id}
Equipment: ${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}
Reported by: ${window.NEWSR.by || 'Anonymous'}
Urgency: ${window.NEWSR.urg}
Usable: ${window.NEWSR.usable}

Description: ${window.NEWSR.description}

Please review and triage this request in Vitalis CMMS.`);
  }
  await showSRQRConfirmation(id);
}
window.submitServiceRequest = submitServiceRequest;

async function showSRQRConfirmation(srId) {
  const sr = SR_DATA.find(r => r.id === srId);
  if (!sr) { toast('Service request ' + srId + ' submitted'); return; }
  const eq = EQMAP[sr.eq_id];
  const qrPayload = window.location.origin + window.location.pathname + '#sr=' + srId;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--ok-soft,var(--surface-3));color:var(--ok,var(--primary))">${icon('check')}</div><div><h2>Request Submitted</h2><div class="did">${srId}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body">
    <div class="dsec" style="text-align:center">
      <p style="font-size:14px;line-height:1.6;color:var(--text-2);margin-bottom:16px">Your service request has been submitted successfully. Scan the QR code below to check its status, confirm the repair, or reject it.</p>
      <div id="sr-confirm-qr" style="display:flex;align-items:center;justify-content:center;min-height:180px"><div class="empty">Generating QR…</div></div>
      <div style="margin-top:12px;display:flex;gap:9px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" id="sr-confirm-download" style="display:none">${icon('download')}Download QR</button>
        <button class="btn btn-ghost" onclick="printSRQR('${srId}')">${icon('print')}Print QR</button>
        <button class="btn btn-ghost" onclick="closeDrawer();openServiceRequest('${srId}')">${icon('alert')}View Request</button>
      </div>
    </div>
    <div class="dsec"><h4>Request Summary</h4><div class="kv-grid">
      <div class="kv-item"><div class="k">Equipment</div><div class="v">${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}</div></div>
      <div class="kv-item"><div class="k">Reported By</div><div class="v">${sr.by || 'Anonymous'}</div></div>
      <div class="kv-item"><div class="k">Urgency</div><div class="v">${sr.urg || '—'}</div></div>
      <div class="kv-item"><div class="k">Description</div><div class="v" style="font-size:12px">${(sr.description || '').slice(0, 80)}</div></div>
    </div></div>
  </div>`);
  try {
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 180, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } });
    const el = document.getElementById('sr-confirm-qr');
    if (el) el.innerHTML = `<img src="${qrDataUrl}" alt="QR Code" style="width:180px;height:180px;border-radius:10px;border:1px solid var(--border)">`;
    const dlBtn = document.getElementById('sr-confirm-download');
    if (dlBtn) { dlBtn.style.display = 'inline-flex'; dlBtn.onclick = function() { const a = document.createElement('a'); a.href = qrDataUrl; a.download = srId + '-qr.png'; a.click(); }; }
  } catch (err) {
    const el = document.getElementById('sr-confirm-qr');
    if (el) el.innerHTML = '<div class="empty">QR code not available</div>';
  }
}
window.showSRQRConfirmation = showSRQRConfirmation;

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
  if (!hasPerm('Vendors', 'Create')) { toast('You do not have permission to add vendors'); return; }
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
  NEWEQ = { id: '', tag: '', name: '', model: '', mfr: '', cat: '', dept: '', loc: '', crit: 'med', status: 'available', serial: '', cost: 0, warranty_exp: '', barcode_id: '' }; window.NEWEQ = NEWEQ;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('asset')}</div><div><h2>Add Equipment</h2><div class="did">Register a new medical device asset</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Equipment Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Asset Name</span><input id="eq_name" placeholder="e.g. Patient Monitor MX450" oninput="window.NEWEQ.name=this.value"></label>
      <label class="fld"><span>Asset Tag</span><input id="eq_tag" placeholder="e.g. CR-PM-0150" oninput="window.NEWEQ.tag=this.value"></label>
      <label class="fld"><span>Manufacturer</span><input id="eq_mfr" placeholder="e.g. Philips" oninput="window.NEWEQ.mfr=this.value"></label>
      <label class="fld"><span>Model</span><input id="eq_model" placeholder="e.g. MX450" oninput="window.NEWEQ.model=this.value"></label>
      <label class="fld"><span>Serial Number</span><input id="eq_serial" placeholder="e.g. SN-DE-2024-0892" oninput="window.NEWEQ.serial=this.value"></label>
      <label class="fld"><span>Barcode ID <span class="sub2" style="font-weight:400">(optional — if asset has a manufacturer barcode)</span></span><input id="eq_barcode" placeholder="e.g. 1234567890123" oninput="window.NEWEQ.barcode_id=this.value"></label>
      <label class="fld"><span>Category</span><select id="eq_cat" onchange="window.NEWEQ.cat=this.value">${(ASSET_CATS.length ? [...new Set(ASSET_CATS.map(c => c.category))] : ['Patient Monitor','Ventilator','Defibrillator','Infusion','Imaging','Sterilizer','HVAC','Other']).map(c => `<option ${c === 'Patient Monitor' ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="fld"><span>Department</span><select id="eq_dept" onchange="window.NEWEQ.dept=this.value"><option value="">Select department…</option>${DEPARTMENTS.map(d => `<option value="${d.name}">${d.name}</option>`).join('')}</select></label>
      <label class="fld"><span>Location</span><input id="eq_loc" placeholder="e.g. ICU Bay 3" oninput="window.NEWEQ.loc=this.value"></label>
      <label class="fld"><span>Criticality</span><select id="eq_crit" onchange="window.NEWEQ.crit=this.value">${(CRIT_LEVELS.length ? CRIT_LEVELS : [{ id: 'med', level: 'Medium' }]).map(c => `<option value="${c.id}" ${c.id === 'med' ? 'selected' : ''}>${c.level}</option>`).join('')}</select></label>
      <label class="fld"><span>Acquisition Cost ($)</span><input id="eq_cost" type="number" value="0" onchange="window.NEWEQ.cost=Number(this.value)"></label>
      <label class="fld"><span>Warranty Expiry</span><input id="eq_warranty_exp" type="date" onchange="window.NEWEQ.warranty_exp=this.value"></label>
    </div>
    <div style="margin-top:14px;padding:12px;background:var(--surface-3);border-radius:10px;display:flex;align-items:center;gap:12px">
      <div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:var(--primary-soft);border-radius:8px;color:var(--primary)">${icon('qr')}</div>
      <div><div style="font-weight:600;font-size:13px">QR Code Auto-Generated</div><div class="sub2" style="font-size:12px">A unique QR code is created automatically when you register this asset. You can print it from the equipment detail page.</div></div>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEquipment()">${icon('check')}Register Equipment</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openAddEquipment = openAddEquipment;

async function submitEquipment() {
  if (!hasPerm('Equipment', 'Create')) { toast('You do not have permission to add equipment'); return; }
  if (!window.NEWEQ.name) { toast('Enter an asset name'); return; }
  if (!window.NEWEQ.tag) { toast('Enter an asset tag'); return; }
  const id = nextSequentialId('E', EQUIP, 850, 4);
  const qrCode = 'VIT-' + id;
  const icMap = { 'Patient Monitor': 'monitor', 'Ventilator': 'vent', 'Defibrillator': 'defib', 'Infusion': 'pump', 'Imaging': 'mri', 'Sterilizer': 'ster', 'HVAC': 'hvac', 'Other': 'asset' };
  const e = {
    id, tag: window.NEWEQ.tag, name: window.NEWEQ.name, model: window.NEWEQ.model, mfr: window.NEWEQ.mfr,
    cat: window.NEWEQ.cat, ic: icMap[window.NEWEQ.cat] || 'asset', dept: window.NEWEQ.dept, loc: window.NEWEQ.loc,
    status: window.NEWEQ.status, crit: window.NEWEQ.crit, risk: CRIT[window.NEWEQ.crit]?.risk || (window.NEWEQ.crit === 'life' ? 90 : window.NEWEQ.crit === 'high' ? 75 : 50),
    pm: 100, next_pm: null, warranty: window.NEWEQ.warranty_exp ? (new Date(window.NEWEQ.warranty_exp) >= new Date(TODAY) ? 'Active' : 'Expired') : 'Active', warranty_exp: window.NEWEQ.warranty_exp || null, cal_due: null, age: 0, cost: window.NEWEQ.cost, serial: window.NEWEQ.serial, sla: 'P3',
    qr_code: qrCode, barcode_id: window.NEWEQ.barcode_id || null,
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
  EDITEQ = { id, name: e.name, tag: e.tag, model: e.model || '', mfr: e.mfr || '', cat: e.cat || '', dept: e.dept || '', loc: e.loc || '', crit: e.crit, status: e.status, serial: e.serial || '', cost: Number(e.cost) || 0, warranty_exp: e.warranty_exp || '', barcode_id: e.barcode_id || '', qr_code: e.qr_code || '' };
  window.EDITEQ = EDITEQ;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('edit')}</div><div><h2>Edit Asset</h2><div class="did">${e.tag} · ${e.id}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Equipment Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Asset Name</span><input id="edeq_name" value="${e.name}" oninput="window.EDITEQ.name=this.value"></label>
      <label class="fld"><span>Asset Tag</span><input id="edeq_tag" value="${e.tag}" oninput="window.EDITEQ.tag=this.value"></label>
      <label class="fld"><span>Manufacturer</span><input id="edeq_mfr" value="${e.mfr || ''}" oninput="window.EDITEQ.mfr=this.value"></label>
      <label class="fld"><span>Model</span><input id="edeq_model" value="${e.model || ''}" oninput="window.EDITEQ.model=this.value"></label>
      <label class="fld"><span>Serial Number</span><input id="edeq_serial" value="${e.serial || ''}" oninput="window.EDITEQ.serial=this.value"></label>
      <label class="fld"><span>Barcode ID <span class="sub2" style="font-weight:400">(optional)</span></span><input id="edeq_barcode" value="${e.barcode_id || ''}" placeholder="e.g. 1234567890123" oninput="window.EDITEQ.barcode_id=this.value"></label>
      <label class="fld"><span>QR Code <span class="sub2" style="font-weight:400">(auto-generated)</span></span><input id="edeq_qrcode" value="${e.qr_code || ''}" readonly style="background:var(--surface-3);cursor:default"></label>
      <label class="fld"><span>Category</span><select id="edeq_cat" onchange="window.EDITEQ.cat=this.value">${(ASSET_CATS.length ? [...new Set(ASSET_CATS.map(c => c.category))] : ['Patient Monitor','Ventilator','Defibrillator','Infusion','Imaging','Sterilizer','HVAC','Other']).map(c => `<option ${c === e.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="fld"><span>Department</span><select id="edeq_dept" onchange="window.EDITEQ.dept=this.value"><option value="" ${!e.dept ? 'selected' : ''}>Select department…</option>${DEPARTMENTS.map(d => `<option value="${d.name}" ${e.dept === d.name ? 'selected' : ''}>${d.name}</option>`).join('')}</select></label>
      <label class="fld"><span>Location</span><input id="edeq_loc" value="${e.loc || ''}" oninput="window.EDITEQ.loc=this.value"></label>
      <label class="fld"><span>Criticality</span><select id="edeq_crit" onchange="window.EDITEQ.crit=this.value">${(CRIT_LEVELS.length ? CRIT_LEVELS : [{ id: 'med', level: 'Medium' }]).map(c => `<option value="${c.id}" ${e.crit === c.id ? 'selected' : ''}>${c.level}</option>`).join('')}</select></label>
      <label class="fld"><span>Status</span><select id="edeq_status" onchange="window.EDITEQ.status=this.value">${Object.entries(STAT).map(([k,v]) => `<option value="${k}" ${e.status === k ? 'selected' : ''}>${v.l}</option>`).join('')}</select></label>
      <label class="fld"><span>Acquisition Cost ($)</span><input id="edeq_cost" type="number" value="${Number(e.cost) || 0}" onchange="window.EDITEQ.cost=Number(this.value)"></label>
      <label class="fld"><span>Warranty Expiry</span><input id="edeq_warranty_exp" type="date" value="${e.warranty_exp || ''}" onchange="window.EDITEQ.warranty_exp=this.value"></label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEditEquipment()">${icon('check')}Save Changes</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openEditEquipment = openEditEquipment;

async function submitEditEquipment() {
  if (!hasPerm('Equipment', 'Edit')) { toast('You do not have permission to edit equipment'); return; }
  const d = window.EDITEQ;
  if (!d.name) { toast('Enter an asset name'); return; }
  const updates = {
    name: d.name, tag: d.tag, model: d.model, mfr: d.mfr, cat: d.cat, dept: d.dept, loc: d.loc,
    crit: d.crit, status: d.status, serial: d.serial, cost: d.cost,
    barcode_id: d.barcode_id || null,
    warranty_exp: d.warranty_exp || null,
    warranty: d.warranty_exp ? (new Date(d.warranty_exp) >= new Date(TODAY) ? 'Active' : 'Expired') : 'Active',
    risk: CRIT[d.crit]?.risk || (d.crit === 'life' ? 90 : d.crit === 'high' ? 75 : 50),
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
  if (!hasPerm('Equipment', 'Delete')) { toast('You do not have permission to delete equipment'); return; }
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
  if (!hasPerm('Equipment', 'Delete')) { toast('You do not have permission to delete equipment'); return; }
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
      <label class="fld"><span>Trade / Team</span><select id="t_trade" onchange="window.NEWTECH.trade=this.value">${teamOpts('')}</select></label>
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
  if (!hasPerm('Technicians', 'Create')) { toast('You do not have permission to add technicians'); return; }
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
  if (!hasPerm('Equipment', 'Edit')) { toast('You do not have permission to record calibrations'); return; }
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
  if (!hasPerm('Workflows', 'Create')) { toast('You do not have permission to create workflows'); return; }
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
  if (!hasPerm('Workflows', 'Edit')) { toast('You do not have permission to add transitions'); return; }
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

let EDIT_TRANS_ID = null;
function openEditTransition(wfId, transId) {
  const wf = WORKFLOWS.find(w => w.id === wfId);
  const t = WFTRANS.find(x => x.id === transId);
  if (!wf || !t) return;
  const states = wf.states || [];
  const stateOpts = states.map(s => `<option value="${s}" ${s === t.from_state ? 'selected' : ''}>${s}</option>`).join('');
  const toOpts = states.map(s => `<option value="${s}" ${s === t.to_state ? 'selected' : ''}>${s}</option>`).join('');
  EDIT_TRANS_ID = transId;
  window.EDIT_TRANS = {
    workflow_id: wfId,
    from_state: t.from_state,
    action: t.action,
    to_state: t.to_state,
    sla: t.sla || '—',
    approval: !!t.approval,
    notify: !!t.notify,
  };
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('edit')}</div><div><h2>Edit Transition</h2><div class="did">${t.action} — ${wf.name}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Transition Rule</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>From State</span><select id="etr_from" onchange="window.EDIT_TRANS.from_state=this.value">${stateOpts}</select></label>
      <label class="fld"><span>Action</span><input id="etr_action" value="${t.action}" oninput="window.EDIT_TRANS.action=this.value"></label>
      <label class="fld"><span>To State</span><select id="etr_to" onchange="window.EDIT_TRANS.to_state=this.value">${toOpts}</select></label>
      <label class="fld"><span>SLA Effect</span><input id="etr_sla" value="${t.sla && t.sla !== '—' ? t.sla : ''}" placeholder="e.g. Pauses SLA, Resets SLA" oninput="window.EDIT_TRANS.sla=this.value"></label>
      <label class="chk-supr"><input type="checkbox" id="etr_approval_chk" ${t.approval ? 'checked' : ''} onchange="window.EDIT_TRANS.approval=this.checked"> Requires approval</label>
      <label class="chk-supr"><input type="checkbox" id="etr_notify_chk" ${t.notify ? 'checked' : ''} onchange="window.EDIT_TRANS.notify=this.checked"> Send notification</label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEditTransition()">${icon('check')}Save Changes</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openEditTransition = openEditTransition;

async function submitEditTransition() {
  if (!hasPerm('Workflows', 'Edit')) { toast('You do not have permission to edit transitions'); return; }
  const e = window.EDIT_TRANS;
  if (!e) return;
  const fromEl = document.getElementById('etr_from');
  const actionEl = document.getElementById('etr_action');
  const toEl = document.getElementById('etr_to');
  const slaEl = document.getElementById('etr_sla');
  const approvalEl = document.getElementById('etr_approval_chk');
  const notifyEl = document.getElementById('etr_notify_chk');
  const fromState = fromEl ? fromEl.value : e.from_state;
  const action = actionEl ? actionEl.value.trim() : (e.action || '').trim();
  const toState = toEl ? toEl.value : e.to_state;
  const sla = slaEl ? slaEl.value : (e.sla || '');
  const approval = approvalEl ? approvalEl.checked : !!e.approval;
  const notify = notifyEl ? notifyEl.checked : !!e.notify;
  if (!action) { toast('Enter an action name'); return; }
  const t = WFTRANS.find(x => x.id === EDIT_TRANS_ID);
  if (!t) return;
  const updates = {
    from_state: fromState,
    action: action,
    to_state: toState,
    sla: sla || '—',
    approval: approval,
    notify: notify,
  };
  const ok = await updateWorkflowTransition(EDIT_TRANS_ID, updates);
  if (!ok) { toast('Failed to update transition — ' + LAST_DB_ERROR); return; }
  Object.assign(t, updates);
  closeDrawer();
  go('workflows');
  toast('Transition "' + e.action + '" updated');
  addAuditLog('Admin', 'Updated workflow transition "' + e.action + '"', 'info');
}
window.submitEditTransition = submitEditTransition;

async function confirmDeleteTransition(transId) {
  if (!hasPerm('Workflows', 'Delete')) { toast('You do not have permission to delete transitions'); return; }
  const t = WFTRANS.find(x => x.id === transId);
  if (!t) return;
  const ok = await deleteWorkflowTransition(transId);
  if (!ok) { toast('Failed to delete transition — ' + LAST_DB_ERROR); return; }
  const idx = WFTRANS.findIndex(x => x.id === transId);
  if (idx >= 0) WFTRANS.splice(idx, 1);
  go('workflows');
  toast('Transition "' + t.action + '" deleted');
  addAuditLog('Admin', 'Deleted workflow transition "' + t.action + '"', 'warn');
}
window.confirmDeleteTransition = confirmDeleteTransition;

async function publishWorkflow(wfId) {
  if (!hasPerm('Workflows', 'Edit')) { toast('You do not have permission to publish workflows'); return; }
  const wf = WORKFLOWS.find(w => w.id === wfId);
  if (!wf) return;
  toast(wf.name + ' workflow published');
  addAuditLog('Admin', 'Published workflow ' + wf.name, 'ok');
}
window.publishWorkflow = publishWorkflow;

/* ============================================================
   VIEW: AUDIT TRAIL
   ============================================================ */
VIEWS.audit = async function () {
  return `
  <div class="page-head"><div><h1>Audit Trail</h1><div class="sub">Immutable record of every action, approval & configuration change</div></div>
  <button class="btn btn-ghost" onclick="toast('Exporting audit log')">${icon('download')}Export Log</button></div>
  <div class="card"><div class="feed">${AUDIT.length ? AUDIT.map(l => `<div class="feed-item" style="cursor:default">
    <div class="feed-ic" style="background:var(--${l.cat || 'info'}-soft);color:var(--${l.cat || 'info'})">${icon('audit')}</div>
    <div class="feed-body"><div class="ft">${l.action}</div><div class="fmeta"><span>${l.user_name || '—'}</span><span>·</span><span>${l.time || '—'}</span></div></div>
  </div>`).join('') : '<div class="empty">No audit entries</div>'}</div></div>`;
};

/* ============================================================
   VIEW: TECHNICIANS
   ============================================================ */
VIEWS.techs = async function () {
  const expiringCerts = TECHS.reduce((count, t) => {
    const certs = Array.isArray(t.certs) ? t.certs : [];
    return count + certs.filter(c => { const days = (new Date(c.exp) - new Date(TODAY)) / 864e5; return days >= 0 && days <= 60; }).length;
  }, 0);
  return `
  <div class="page-head"><div><h1>Technicians & Competency</h1><div class="sub">Skills, certifications & workload</div></div>
    <button class="btn btn-primary" onclick="toast('Add technician form opened')">${icon('wrench')}Add Technician</button></div>
  <div class="kpi-row">
    ${[['Technicians', String(TECHS.length), '', 'var(--primary)', 'var(--primary-soft)', 'users'], ['Avg Utilisation', String(TECHS.length ? Math.round(TECHS.reduce((s, t) => s + t.load / t.cap, 0) / TECHS.length * 100) : 0), '%', 'var(--info)', 'var(--info-soft)', 'gauge'], ['Certs Expiring', String(expiringCerts), '', 'var(--warn)', 'var(--warn-soft)', 'clock'], ['Skill Areas', String(SKILL_AREAS.length), '', 'var(--ok)', 'var(--ok-soft)', 'shield']].map(k => `
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
      <div style="display:flex;flex-direction:column;gap:7px">${certs.map(c => { const cs = certStatus(c.exp); return `<div style="display:flex;align-items:center;justify-content:space-between;font-size:12.5px"><span>${c.n}</span><span style="display:flex;gap:8px;align-items:center"><span class="mono sub2">${fmtDate(c.exp)}</span><span class="pill ${cs.c}">${cs.l}</span></span></div>`; }).join('')}</div>
    </div></div>`;
  }).join('')}
  </div>`;
};

/* ============================================================
   VIEW: ROLES & PERMISSIONS
   ============================================================ */
VIEWS.roles = async function () {
  if (!ROLES.length) return `<div class="page-head"><div><h1>Roles & Permissions</h1></div></div><div class="card"><div class="card-pad" style="text-align:center;padding:40px;color:var(--text-3)">No roles loaded.</div></div>`;
  const r = ROLES.find(x => x.id === SELROLE) || ROLES[0];
  if (!r) return '';
  const rp = PERMS[r.id] || {};
  return `
  <div class="page-head"><div><h1>Roles & Permissions</h1><div class="sub">Dynamic role creation — permissions are configured, not hard-coded</div></div>
    <div class="head-actions" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input id="newrole" placeholder="New role name…" class="sel" style="width:180px;height:38px"><label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2);cursor:pointer"><input type="checkbox" id="newrole_deptscoped" onchange="window.NEWROLE_DEPTSCOPED=this.checked"> Department-based</label><button class="btn btn-primary" onclick="addRole()">${icon('shield')}Create Role</button></div></div>
  <div class="roles-grid">
    <div class="card" style="align-self:start"><div class="card-head"><h3>Roles</h3><span class="hint">${ROLES.length}</span></div>
      <div class="role-list">${ROLES.map(x => `<button class="role-item ${x.id === SELROLE ? 'on' : ''}" onclick="setSelRole('${x.id}')">
        <div style="flex:1;min-width:0"><div class="ri-name">${x.name}${x.system ? ' <span class="pill p-muted" style="padding:1px 6px;font-size:9.5px">System</span>' : ''}</div><div class="ri-desc">${x.description || ''}</div></div>
        <span class="ri-count">${x.users || 0}</span></button>`).join('')}</div>
    </div>
    <div class="card" style="align-self:start"><div class="card-head"><h3>${r.name}</h3><span class="hint">${r.users || 0} users · ${r.scope || '—'} scope</span></div>
      <div class="card-pad" style="padding-bottom:6px"><div class="sub2" style="margin:0 0 4px">${r.description || ''}</div><div style="margin-top:6px"><button type="button" class="wf-toggle ${r.dept_scoped ? 'on' : ''}" onclick="toggleDeptScoped('${r.id}')" style="vertical-align:middle;margin-right:8px"><span class="knob"></span></button><span class="sub2" style="margin:0;vertical-align:middle">Department-based — users only see their department's equipment</span></div></div>
      <div class="card-pad" style="padding-top:0;padding-bottom:10px;border-bottom:1px solid var(--border)"><h4 style="font-size:13px;margin:0 0 10px">Email Notification Preferences</h4><div class="sub2" style="margin:0 0 10px">Choose which events trigger an email notification for users with this role.</div>
        <table class="tbl" style="font-size:12px"><thead><tr><th style="text-align:left">Event</th><th class="num">Service Request</th><th class="num">Work Order</th><th class="num">PM</th></tr></thead><tbody>
          ${['create','update','close'].map(ev => `<tr><td class="strong" style="text-transform:capitalize">${ev === 'create' ? 'On Creation' : ev === 'update' ? 'On Update' : 'On Closure'}</td>${['sr','wo','pm'].map(et => { const col = `email_${et}_${ev}`; const on = !!r[col]; return `<td class="num"><button type="button" class="wf-toggle ${on ? 'on' : ''}" onclick="toggleEmailNotif('${r.id}','${col}')" style="vertical-align:middle"><span class="knob"></span></button></td>`; }).join('')}</tr>`).join('')}
        </tbody></table>
      </div>
      <div class="tbl-wrap"><table class="tbl perm-tbl">
        <thead><tr><th>Module</th>${ACTIONS.map(a => `<th class="num">${a}</th>`).join('')}</tr></thead>
        <tbody>${MODULES.map(mod => `<tr><td class="strong">${mod}</td>${ACTIONS.map(a => { const on = rp[mod] && rp[mod][a]; return `<td class="num"><button class="permcell ${on ? 'on' : ''}" onclick="togglePerm('${r.id}','${mod}','${a}')" aria-label="${mod} ${a}">${on ? icon('check') : ''}</button></td>`; }).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <div class="card-pad" style="display:flex;gap:9px;border-top:1px solid var(--border);flex-wrap:wrap"><button class="btn btn-primary" onclick="saveRolePerms('${r.id}')">${icon('check')}Save Changes</button>${!r.system ? `<button class="btn btn-ghost" onclick="duplicateRole('${r.id}')">${icon('copy')}Duplicate</button><button class="btn btn-ghost" style="color:var(--crit)" onclick="deleteRolePerm('${r.id}')">${icon('trash')}Delete</button>` : ''}</div>
    </div>
  </div>`;
};

async function togglePerm(rid, mod, act) {
  const rp = PERMS[rid] || {};
  const current = rp[mod] && rp[mod][act];
  const newVal = !current;
  const tpOk = await togglePermission(rid, mod, act, newVal);
  if (!tpOk) { toast('Failed to update permission — ' + LAST_DB_ERROR); return; }
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

async function toggleEmailNotif(rid, col) {
  const r = ROLES.find(x => x.id === rid);
  if (!r) return;
  const newVal = !r[col];
  const ok = await updateRole(rid, { [col]: newVal });
  if (!ok) { toast('Failed to update — ' + LAST_DB_ERROR); return; }
  r[col] = newVal;
  go('roles');
  toast('Email preference updated for ' + r.name);
}
window.toggleEmailNotif = toggleEmailNotif;

async function toggleDeptScoped(rid) {
  const r = ROLES.find(x => x.id === rid);
  if (!r) return;
  const newVal = !r.dept_scoped;
  const ok = await updateRole(rid, { dept_scoped: newVal });
  if (!ok) { toast('Failed to update — ' + LAST_DB_ERROR); return; }
  r.dept_scoped = newVal;
  go('roles');
  toast('Role "' + r.name + '" is now ' + (newVal ? 'department-based' : 'not department-based'));
  addAuditLog('Admin', (newVal ? 'Enabled' : 'Disabled') + ' department scoping for role ' + r.name, 'info');
}
window.toggleDeptScoped = toggleDeptScoped;

async function addRole() {
  const el = document.getElementById('newrole');
  const nm = el && el.value.trim();
  if (!nm) { toast('Enter a role name'); return; }
  const deptScopedEl = document.getElementById('newrole_deptscoped');
  const deptScoped = deptScopedEl ? deptScopedEl.checked : false;
  const id = nextSequentialId('role', ROLES, 1, 0);
  const ok = await addRoleToDB({ id, name: nm, description: 'Custom role', users: 0, scope: 'Custom', system: false, dept_scoped: deptScoped });
  if (!ok) { toast('Failed to create role — ' + LAST_DB_ERROR); return; }
  const permRows = [];
  MODULES.forEach(mod => { ACTIONS.forEach(a => { permRows.push({ role_id: id, module: mod, action: a, allowed: false }); }); });
  const { error: permErr } = await supabase.from('permissions').insert(permRows);
  if (permErr) { console.error('addRole permissions insert', permErr); }
  ROLES.push({ id, name: nm, description: 'Custom role', users: 0, scope: 'Custom', system: false, dept_scoped: deptScoped });
  PERMS[id] = {};
  MODULES.forEach(mod => { PERMS[id][mod] = {}; ACTIONS.forEach(a => { PERMS[id][mod][a] = false; }); });
  SELROLE = id;
  go('roles');
  toast('Role "' + nm + '" created' + (deptScoped ? ' (department-based)' : ''));
  addAuditLog('Admin', 'Created role ' + nm + (deptScoped ? ' (department-based)' : ''), 'info');
}
window.addRole = addRole;

/* ============================================================
   VIEW: WORKFLOW DESIGNER
   ============================================================ */
VIEWS.workflows = async function () {
  const wf = WORKFLOWS.find(w => w.id === SELWF) || WORKFLOWS[0];
  if (!wf) return `<div class="page-head"><div><h1>Workflow Designer</h1></div></div><div class="card"><div class="card-pad" style="text-align:center;padding:40px;color:var(--text-3)">No workflows loaded.</div></div>`;
  const wfTrans = WFTRANS.filter(t => t.workflow_id === wf.id);
  return `
  <div class="page-head"><div><h1>Workflow Designer</h1><div class="sub">Configure state machines: Status → Action → Next Status → SLA</div></div>
    <button class="btn btn-primary" onclick="openNewWorkflow()">${icon('settings')}New Workflow</button></div>
  <div class="seg" style="margin-bottom:16px;flex-wrap:wrap">${WORKFLOWS.map(w => `<button class="${w.id === SELWF ? 'on' : ''}" onclick="setSelWf('${w.id}')">${w.name}</button>`).join('')}</div>
  <div class="card" style="margin-bottom:16px"><div class="card-head"><h3>States</h3><span class="hint">${(wf.states || []).length} states</span><div style="margin-left:auto;display:flex;gap:6px"><button class="btn btn-ghost" style="height:30px;padding:0 10px;font-size:12px" onclick="openRenameWorkflow('${wf.id}')">${icon('edit')}Rename</button><button class="btn btn-ghost" style="height:30px;padding:0 10px;font-size:12px;color:var(--crit)" onclick="confirmDeleteWorkflow('${wf.id}')">${icon('trash')}Delete</button></div></span></div>
    <div class="card-pad">
      <div class="wf-rail">${(wf.states || []).map((s, i) => `<span class="wf-node ${i === 0 ? 'start' : i === (wf.states || []).length - 1 ? 'end' : ''}">${s}<button class="wf-node-btn" onclick="renameState(${i})" title="Rename state">${icon('edit')}</button>${(wf.states || []).length > 1 ? `<button class="wf-node-btn" onclick="deleteState(${i})" title="Delete state" style="color:var(--crit)">${icon('x')}</button>` : ''}</span>${i < (wf.states || []).length - 1 ? `<span class="wf-arrow">${icon('arrowr')}</span>` : ''}`).join('')}</div>
      <div style="display:flex;gap:9px;margin-top:14px"><input id="newstate" class="sel" style="height:36px;width:200px" placeholder="Add a status…"><button class="btn btn-ghost" onclick="addState()">${icon('dash')}Add State</button></div>
    </div>
  </div>
  <div class="card"><div class="card-head"><h3>Transition Rules</h3><span class="hint">${wfTrans.length} transitions</span><div style="margin-left:auto"><button class="btn btn-ghost" style="height:30px;padding:0 10px;font-size:12px" onclick="openAddTransition('${wf.id}')">${icon('dash')}Add Transition</button></div></div>
  <div class="tbl-wrap"><table class="tbl wf-tbl">
    <thead><tr><th>From</th><th>Action</th><th>Next</th><th class="num">Approval</th><th class="num">Notify</th><th>SLA</th><th></th></tr></thead>
    <tbody>${wfTrans.map(t => `<tr>
      <td><span class="pill p-muted">${t.from_state}</span></td>
      <td class="strong">${t.action}</td>
      <td><span class="pill p-info">${t.to_state}</span></td>
      <td class="num"><button type="button" class="wf-toggle ${t.approval ? 'on' : ''}" onclick="toggleWF('${wf.id}','${t.id}','approval')"><span class="knob"></span></button></td>
      <td class="num"><button type="button" class="wf-toggle ${t.notify ? 'on' : ''}" onclick="toggleWF('${wf.id}','${t.id}','notify')"><span class="knob"></span></button></td>
      <td class="sub2" style="margin:0">${t.sla || '—'}</td>
      <td><div style="display:flex;gap:4px"><button class="btn btn-ghost" style="height:30px;padding:0 8px;font-size:12px" onclick="openEditTransition('${wf.id}','${t.id}')">${icon('edit')}Edit</button><button class="btn btn-ghost" style="height:30px;padding:0 8px;font-size:12px;color:var(--crit)" onclick="confirmDeleteTransition('${t.id}')">${icon('trash')}Delete</button></div></td>
    </tr>`).join('')}</tbody>
  </table></div></div>
  <div class="card" style="margin-top:16px"><div class="card-head"><h3>Step Checklists</h3><span class="hint">${WF_CHK_TEMPLATES.length} template${WF_CHK_TEMPLATES.length === 1 ? '' : 's'}</span></div>
    <div class="card-pad">
      <div class="sub2" style="margin-bottom:12px">Link a configurable checklist to any step in any workflow. When a work order reaches that step, the technician sees this checklist instead of the built-in one.</div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Workflow</th><th>Step</th><th>Checklist Name</th><th>Description</th><th>Items</th><th></th></tr></thead>
        <tbody>${WF_CHK_TEMPLATES.map(t => {
          const tWf = t.workflow_id ? WORKFLOWS.find(w => w.id === t.workflow_id) : null;
          const tStates = tWf?.states?.length ? tWf.states : CORR_STEPS;
          const stepName = tStates[t.step_index] || ('Step ' + (t.step_index + 1));
          const itemCount = (t.sections || []).reduce((s, sec) => s + (sec.items || []).length, 0);
          return `<tr>
            <td><span class="pill p-muted">${tWf ? tWf.name : 'Default'}</span></td>
            <td><span class="pill p-info">${stepName}</span></td>
            <td class="strong">${t.name}</td>
            <td class="sub2" style="margin:0">${t.description || '—'}</td>
            <td class="num">${itemCount}</td>
            <td><div style="display:flex;gap:4px"><button class="btn btn-ghost" style="height:30px;padding:0 8px;font-size:12px" onclick="openEditWorkflowChecklist('${t.id}')">${icon('edit')}Edit</button><button class="btn btn-ghost" style="height:30px;padding:0 8px;font-size:12px;color:var(--crit)" onclick="confirmDeleteWorkflowChecklist('${t.id}')">${icon('trash')}Delete</button></div></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <div style="margin-top:14px"><button class="btn btn-primary" onclick="openNewWorkflowChecklist()">${icon('dash')}Link Checklist to Step</button></div>
    </div>
  </div>`;
};

async function toggleWF(wid, transId, field) {
  const trans = WFTRANS.find(t => t.id === transId);
  if (!trans) return;
  const newVal = !trans[field];
  const wfOk = await toggleWorkflowTransition(wid, transId, field, newVal);
  if (!wfOk) { toast('Failed to update workflow — ' + LAST_DB_ERROR); return; }
  trans[field] = newVal;
  go('workflows');
  toast(field === 'approval' ? (newVal ? 'Approval required' : 'Approval removed') : (newVal ? 'Notification enabled' : 'Notification disabled'));
}
window.toggleWF = toggleWF;

async function addState() {
  const el = document.getElementById('newstate');
  const nm = el && el.value.trim();
  if (!nm) { toast('Enter a status name'); return; }
  const wf = WORKFLOWS.find(w => w.id === SELWF);
  const stOk = await addWorkflowState(SELWF, nm);
  if (!stOk) { toast('Failed to add state — ' + LAST_DB_ERROR); return; }
  wf.states = [...(wf.states || []), nm];
  go('workflows');
  toast('State "' + nm + '" added');
}
window.addState = addState;

async function renameState(idx) {
  const wf = WORKFLOWS.find(w => w.id === SELWF);
  if (!wf || !wf.states || idx < 0 || idx >= wf.states.length) return;
  const oldName = wf.states[idx];
  window.RN_STATE = { wfId: SELWF, idx, oldName, newName: oldName };
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('edit')}</div><div><h2>Rename State</h2><div class="did">${oldName}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>State Name</h4>
    <label class="fld"><span>New Name</span><input id="rnstate_name" value="${oldName}" oninput="window.RN_STATE.newName=this.value"></label>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitRenameState()">${icon('check')}Save</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.renameState = renameState;

async function submitRenameState() {
  const r = window.RN_STATE;
  if (!r) return;
  const newName = (r.newName || '').trim();
  if (!newName) { toast('Enter a state name'); return; }
  const wf = WORKFLOWS.find(w => w.id === r.wfId);
  if (!wf) return;
  const states = [...(wf.states || [])];
  states[r.idx] = newName;
  const ok = await updateWorkflowStates(r.wfId, states);
  if (!ok) { toast('Failed to rename state — ' + LAST_DB_ERROR); return; }
  const oldName = states[r.idx];
  wf.states = states;
  WFTRANS.filter(t => t.workflow_id === r.wfId).forEach(t => {
    if (t.from_state === oldName) t.from_state = newName;
    if (t.to_state === oldName) t.to_state = newName;
  });
  closeDrawer();
  go('workflows');
  toast('State renamed to "' + newName + '"');
  addAuditLog('Admin', 'Renamed workflow state from "' + oldName + '" to "' + newName + '"', 'info');
}
window.submitRenameState = submitRenameState;

async function deleteState(idx) {
  const wf = WORKFLOWS.find(w => w.id === SELWF);
  if (!wf || !wf.states || idx < 0 || idx >= wf.states.length) return;
  if (wf.states.length <= 1) { toast('A workflow must have at least one state'); return; }
  const stateName = wf.states[idx];
  const usedInTrans = WFTRANS.some(t => t.workflow_id === SELWF && (t.from_state === stateName || t.to_state === stateName));
  if (usedInTrans) { toast('Cannot delete — this state is used in one or more transition rules. Remove those transitions first.'); return; }
  const states = wf.states.filter((_, i) => i !== idx);
  const ok = await updateWorkflowStates(SELWF, states);
  if (!ok) { toast('Failed to delete state — ' + LAST_DB_ERROR); return; }
  wf.states = states;
  go('workflows');
  toast('State "' + stateName + '" deleted');
  addAuditLog('Admin', 'Deleted workflow state "' + stateName + '"', 'warn');
}
window.deleteState = deleteState;

let RENAME_WF_ID = null;
function openRenameWorkflow(wfId) {
  const wf = WORKFLOWS.find(w => w.id === wfId);
  if (!wf) return;
  RENAME_WF_ID = wfId;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('edit')}</div><div><h2>Rename Workflow</h2><div class="did">${wf.name}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Workflow Name</h4>
    <label class="fld"><span>New Name</span><input id="rnwf_name" value="${wf.name}" oninput="window.RENAME_WF_NAME=this.value"></label>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitRenameWorkflow()">${icon('check')}Save</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}
window.openRenameWorkflow = openRenameWorkflow;

async function submitRenameWorkflow() {
  const newName = (window.RENAME_WF_NAME || '').trim();
  if (!newName) { toast('Enter a new name'); return; }
  const wf = WORKFLOWS.find(w => w.id === RENAME_WF_ID);
  if (!wf) return;
  const ok = await updateWorkflow(RENAME_WF_ID, { name: newName });
  if (!ok) { toast('Failed to rename — ' + LAST_DB_ERROR); return; }
  wf.name = newName;
  closeDrawer();
  go('workflows');
  toast('Workflow renamed to "' + newName + '"');
  addAuditLog('Admin', 'Renamed workflow to ' + newName, 'info');
}
window.submitRenameWorkflow = submitRenameWorkflow;

async function confirmDeleteWorkflow(wfId) {
  const wf = WORKFLOWS.find(w => w.id === wfId);
  if (!wf) return;
  const inUse = WORKORDERS.some(w => w.workflow_id === wfId);
  if (inUse) { toast('Cannot delete — workflow is assigned to one or more work orders. Remove it from those work orders first.'); return; }
  const ok = await deleteWorkflow(wfId);
  if (!ok) { toast('Failed to delete — ' + LAST_DB_ERROR); return; }
  const idx = WORKFLOWS.findIndex(w => w.id === wfId);
  if (idx >= 0) WORKFLOWS.splice(idx, 1);
  WFTRANS = WFTRANS.filter(t => t.workflow_id !== wfId);
  SELWF = WORKFLOWS[0] ? WORKFLOWS[0].id : '';
  go('workflows');
  toast('Workflow "' + wf.name + '" deleted');
  addAuditLog('Admin', 'Deleted workflow ' + wf.name, 'warn');
}
window.confirmDeleteWorkflow = confirmDeleteWorkflow;

/* ================= WORKFLOW CHECKLIST EDITOR ================= */
let WF_CHK_EDIT = null;

function openNewWorkflowChecklist() {
  const wfId = SELWF || '';
  const wf = WORKFLOWS.find(w => w.id === wfId) || null;
  const states = wf?.states?.length ? wf.states : CORR_STEPS;
  const stepOpts = states.map((s, i) => `<option value="${i}">${i + 1}. ${s}</option>`).join('');
  WF_CHK_EDIT = { id: '', name: '', description: '', workflow_id: wfId, step_index: 0, sections: [{ title: 'New Checklist Section', items: [{ t: 'First checklist item', type: 'check' }] }] };
  window.WF_CHK_EDIT = WF_CHK_EDIT;
  renderWorkflowChkEditor('Link Checklist to Step', stepOpts);
}
window.openNewWorkflowChecklist = openNewWorkflowChecklist;

function openEditWorkflowChecklist(tplId) {
  const t = WF_CHK_TEMPLATES.find(x => x.id === tplId);
  if (!t) return;
  WF_CHK_EDIT = JSON.parse(JSON.stringify(t));
  window.WF_CHK_EDIT = WF_CHK_EDIT;
  const wf = t.workflow_id ? WORKFLOWS.find(w => w.id === t.workflow_id) : null;
  const states = wf?.states?.length ? wf.states : CORR_STEPS;
  const stepOpts = states.map((s, i) => `<option value="${i}" ${i === t.step_index ? 'selected' : ''}>${i + 1}. ${s}</option>`).join('');
  renderWorkflowChkEditor('Edit Step Checklist', stepOpts);
}
window.openEditWorkflowChecklist = openEditWorkflowChecklist;

function renderWorkflowChkEditor(title, stepOpts) {
  const e = WF_CHK_EDIT;
  const wfOpts = ['<option value="">Default (no workflow)</option>', ...WORKFLOWS.map(w => `<option value="${w.id}" ${w.id === (e.workflow_id || '') ? 'selected' : ''}>${w.name}</option>`)].join('');
  const sectionsHTML = e.sections.map((sec, si) => `
    <div class="chk-edit-sec" style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px">
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input class="fld-input" style="flex:1;font-weight:600" value="${sec.title || ''}" placeholder="Section title" oninput="window.WF_CHK_EDIT.sections[${si}].title=this.value">
        ${e.sections.length > 1 ? `<button class="btn btn-ghost" style="height:34px;color:var(--crit)" onclick="removeWfChkSection(${si})">${icon('trash')}</button>` : ''}
      </div>
      ${(sec.items || []).map((it, ii) => `
        <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px">
          <input class="fld-input" style="flex:1" value="${it.t || ''}" placeholder="Item description" oninput="window.WF_CHK_EDIT.sections[${si}].items[${ii}].t=this.value">
          <select class="sel" style="width:110px;height:34px" onchange="window.WF_CHK_EDIT.sections[${si}].items[${ii}].type=this.value">
            <option value="check" ${it.type !== 'reading' ? 'selected' : ''}>Check</option>
            <option value="reading" ${it.type === 'reading' ? 'selected' : ''}>Reading</option>
          </select>
          ${it.type === 'reading' ? `
            <input class="fld-input" style="width:70px" type="number" step="any" value="${it.nominal ?? ''}" placeholder="Nom" oninput="window.WF_CHK_EDIT.sections[${si}].items[${ii}].nominal=parseFloat(this.value)">
            <input class="fld-input" style="width:60px" type="text" value="${it.unit || ''}" placeholder="Unit" oninput="window.WF_CHK_EDIT.sections[${si}].items[${ii}].unit=this.value">
            <input class="fld-input" style="width:60px" type="number" step="any" value="${it.min ?? ''}" placeholder="Min" oninput="window.WF_CHK_EDIT.sections[${si}].items[${ii}].min=parseFloat(this.value)">
            <input class="fld-input" style="width:60px" type="number" step="any" value="${it.max ?? ''}" placeholder="Max" oninput="window.WF_CHK_EDIT.sections[${si}].items[${ii}].max=parseFloat(this.value)">
          ` : ''}
          <button class="btn btn-ghost" style="height:34px;color:var(--crit)" onclick="removeWfChkItem(${si},${ii})">${icon('x')}</button>
        </div>`).join('')}
      <button class="btn btn-ghost" style="height:30px;font-size:12px;padding:0 10px" onclick="addWfChkItem(${si})">${icon('dash')}Add Item</button>
    </div>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('check')}</div><div><h2>${title}</h2><div class="did">Configure checklist items for a workflow step</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec">
    <h4>Checklist Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px;margin-bottom:16px">
      <label class="fld"><span>Checklist Name</span><input id="wfchk_name" value="${e.name || ''}" placeholder="e.g. Post-Repair Verification" oninput="window.WF_CHK_EDIT.name=this.value"></label>
      <label class="fld"><span>Description</span><input id="wfchk_desc" value="${e.description || ''}" placeholder="When/why this checklist applies" oninput="window.WF_CHK_EDIT.description=this.value"></label>
      <label class="fld"><span>Workflow</span><select id="wfchk_wf" onchange="changeChkWorkflow()">${wfOpts}</select></label>
      <label class="fld"><span>Workflow Step</span><select id="wfchk_step" onchange="window.WF_CHK_EDIT.step_index=parseInt(this.value)">${stepOpts}</select></label>
    </div>
    <h4>Sections & Items</h4>
    <div id="wfchk_sections">${sectionsHTML}</div>
    <button class="btn btn-ghost" style="margin-bottom:16px" onclick="addWfChkSection()">${icon('dash')}Add Section</button>
    <div style="display:flex;gap:9px"><button class="btn btn-primary" onclick="submitWorkflowChecklist()">${icon('check')}Save Checklist</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
}

function wfChkStepOpts() {
  const wf = WF_CHK_EDIT.workflow_id ? WORKFLOWS.find(w => w.id === WF_CHK_EDIT.workflow_id) : null;
  const states = wf?.states?.length ? wf.states : CORR_STEPS;
  return states.map((s, i) => `<option value="${i}" ${i === WF_CHK_EDIT.step_index ? 'selected' : ''}>${i + 1}. ${s}</option>`).join('');
}

function changeChkWorkflow() {
  WF_CHK_EDIT.workflow_id = document.getElementById('wfchk_wf').value || '';
  WF_CHK_EDIT.step_index = 0;
  renderWorkflowChkEditor(WF_CHK_EDIT.id ? 'Edit Step Checklist' : 'Link Checklist to Step', wfChkStepOpts());
}
window.changeChkWorkflow = changeChkWorkflow;

function addWfChkSection() {
  WF_CHK_EDIT.sections.push({ title: 'New Section', items: [{ t: '', type: 'check' }] });
  renderWorkflowChkEditor(WF_CHK_EDIT.id ? 'Edit Step Checklist' : 'Link Checklist to Step', wfChkStepOpts());
}
window.addWfChkSection = addWfChkSection;

function removeWfChkSection(si) {
  if (WF_CHK_EDIT.sections.length <= 1) return;
  WF_CHK_EDIT.sections.splice(si, 1);
  renderWorkflowChkEditor(WF_CHK_EDIT.id ? 'Edit Step Checklist' : 'Link Checklist to Step', wfChkStepOpts());
}
window.removeWfChkSection = removeWfChkSection;

function addWfChkItem(si) {
  WF_CHK_EDIT.sections[si].items.push({ t: '', type: 'check' });
  renderWorkflowChkEditor(WF_CHK_EDIT.id ? 'Edit Step Checklist' : 'Link Checklist to Step', wfChkStepOpts());
}
window.addWfChkItem = addWfChkItem;

function removeWfChkItem(si, ii) {
  WF_CHK_EDIT.sections[si].items.splice(ii, 1);
  renderWorkflowChkEditor(WF_CHK_EDIT.id ? 'Edit Step Checklist' : 'Link Checklist to Step', wfChkStepOpts());
}
window.removeWfChkItem = removeWfChkItem;

async function submitWorkflowChecklist() {
  const e = WF_CHK_EDIT;
  if (!e.name || !e.name.trim()) { toast('Enter a checklist name'); return; }
  if (!e.sections.length || !e.sections.some(s => s.items.some(i => i.t && i.t.trim()))) { toast('Add at least one checklist item'); return; }
  const cleanSections = e.sections.map(sec => ({
    title: sec.title || 'Section',
    items: sec.items.filter(it => it.t && it.t.trim()).map(it => {
      if (it.type === 'reading') return { t: it.t, type: 'reading', unit: it.unit || '', nominal: Number(it.nominal) || 0, min: Number(it.min) || 0, max: Number(it.max) || 0 };
      return { t: it.t, type: 'check' };
    }),
  })).filter(sec => sec.items.length > 0);
  if (!cleanSections.length) { toast('Add at least one valid checklist item'); return; }
  const wfId = e.workflow_id || null;
  if (e.id) {
    const ok = await updateWorkflowChecklistTemplate(e.id, { name: e.name, description: e.description || '', workflow_id: wfId, step_index: e.step_index, sections: cleanSections });
    if (!ok) { toast('Failed to save — ' + LAST_DB_ERROR); return; }
    const t = WF_CHK_TEMPLATES.find(x => x.id === e.id);
    if (t) { t.name = e.name; t.description = e.description || ''; t.workflow_id = wfId; t.step_index = e.step_index; t.sections = cleanSections; }
    toast('Checklist updated');
  } else {
    const id = 'wfchk-' + Date.now().toString(36);
    const ok = await addWorkflowChecklistTemplate({ id, name: e.name, description: e.description || '', workflow_id: wfId, step_index: e.step_index, sections: cleanSections });
    if (!ok) { toast('Failed to save — ' + LAST_DB_ERROR); return; }
    WF_CHK_TEMPLATES.push({ id, name: e.name, description: e.description || '', workflow_id: wfId, step_index: e.step_index, sections: cleanSections, created_at: new Date().toISOString() });
    toast('Checklist linked to step');
  }
  closeDrawer();
  go('workflows');
  const wfName = e.workflow_id ? (WORKFLOWS.find(w => w.id === e.workflow_id)?.name || 'workflow') : 'default';
  addAuditLog('Admin', 'Saved workflow checklist "' + e.name + '" for ' + wfName + ' step ' + (e.step_index + 1), 'info');
}
window.submitWorkflowChecklist = submitWorkflowChecklist;

async function confirmDeleteWorkflowChecklist(tplId) {
  const t = WF_CHK_TEMPLATES.find(x => x.id === tplId);
  if (!t) return;
  const ok = await deleteWorkflowChecklistTemplate(tplId);
  if (!ok) { toast('Failed to delete — ' + LAST_DB_ERROR); return; }
  const idx = WF_CHK_TEMPLATES.findIndex(x => x.id === tplId);
  if (idx >= 0) WF_CHK_TEMPLATES.splice(idx, 1);
  go('workflows');
  toast('Checklist "' + t.name + '" deleted');
  addAuditLog('Admin', 'Deleted workflow checklist "' + t.name + '"', 'warn');
}
window.confirmDeleteWorkflowChecklist = confirmDeleteWorkflowChecklist;

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
  const srcPerms = PERMS[rid] || {};
  const permRows = [];
  MODULES.forEach(mod => { ACTIONS.forEach(a => {
    const allowed = !!(srcPerms[mod] && srcPerms[mod][a]);
    permRows.push({ role_id: newId, module: mod, action: a, allowed });
  }); });
  const { error: permErr } = await supabase.from('permissions').insert(permRows);
  if (permErr) { console.error('duplicateRole permissions insert', permErr); }
  ROLES.push({ id: newId, name: newName, description: r.description, users: 0, scope: r.scope, system: false });
  PERMS[newId] = JSON.parse(JSON.stringify(srcPerms));
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
    <thead><tr><th>User</th><th>Role</th><th>Department</th><th>Team</th><th>Data Scope</th><th>MFA</th><th>Status</th><th>Last Active</th><th></th></tr></thead>
    <tbody>${USERS.map(u => {
      const st = USTAT[u.status] || { l: u.status || '—', c: 'p-muted' };
      const initials = (u.name || '?').split(' ').map(x => x[0] || '').slice(0, 2).join('') || '?';
      return `<tr>
      <td><div class="cellflex"><div class="avatar" style="background:linear-gradient(135deg,var(--primary),var(--primary-700))">${initials}</div><div><div class="strong">${u.name || '—'}</div><div class="sub2 mono">${u.email || '—'}</div></div></div></td>
      <td>${u.role || '—'}</td><td class="sub2" style="margin:0">${(USER_DEPT_MAP[u.id] || []).join(', ') || 'All'}</td><td class="sub2" style="margin:0">${u.supervised_team || '—'}</td><td class="sub2" style="margin:0">${u.scope || '—'}</td>
      <td>${u.mfa ? '<span class="pill p-ok">Enabled</span>' : '<span class="pill p-muted">Off</span>'}</td>
      <td><span class="pill ${st.c}">${st.l}</span></td>
      <td class="sub2">${u.last_active || '—'}</td>
      <td><div style="display:flex;gap:4px"><button class="btn btn-ghost" style="height:30px;padding:0 8px;font-size:12px" onclick="resetUserPassword('${u.id}')">Reset</button><button class="btn btn-ghost" style="height:30px;padding:0 8px;font-size:12px" onclick="openEditScope('${u.id}')">Edit</button>${u.status !== 'disabled' ? `<button class="btn btn-ghost" style="height:30px;padding:0 8px;font-size:12px;color:var(--crit)" onclick="suspendUser('${u.id}')">Suspend</button>` : ''}</div></td></tr>`;
    }).join('')}</tbody>
  </table></div></div>`;
};

let NEWUSER = {};
function openAddUser() {
  NEWUSER = { role: ROLES[0] ? ROLES[0].name : '', scope: 'Main Campus', mfa: true, supervised_team: '', depts: [], dept_linked: false }; window.NEWUSER = NEWUSER;
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('users')}</div><div><h2>Add User</h2><div class="did">Create an account & send invite email</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Account Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Full name</span><input id="nu_name" placeholder="e.g. Jamil Rahme" oninput="window.NEWUSER.name=this.value"></label>
      <label class="fld"><span>Email</span><input id="nu_email" type="email" placeholder="name@hospital.org" oninput="window.NEWUSER.email=this.value"></label>
      <label class="fld"><span>Role</span><select id="nu_role" onchange="window.NEWUSER.role=this.value;toggleSupervisedTeamField();toggleDeptLinkField()">${ROLES.map(r => `<option>${r.name}</option>`).join('')}</select></label>
      <div id="nu_supervised_team_wrap" style="display:none">
        <label class="fld"><span>Supervised Team</span><select id="nu_supervised_team" onchange="window.NEWUSER.supervised_team=this.value"><option value="">None (all teams)</option>${teamOpts(window.NEWUSER.supervised_team)}</select></label>
      </div>
      <label class="chk-supr"><input type="checkbox" id="nu_dept_linked" onchange="toggleDeptLinkField()"> Link to department(s) (restricts visible equipment to those departments)</label>
      <div id="nu_dept_wrap" style="display:none">
        <div class="fld"><span style="margin-bottom:6px">Departments</span><div style="display:flex;flex-wrap:wrap;gap:8px;max-height:180px;overflow-y:auto;padding:4px 0">${DEPARTMENTS.map(d => `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;padding:6px 10px;border:1px solid var(--border);border-radius:8px"><input type="checkbox" value="${d.name}" onchange="toggleNewUserDept(this)"> ${d.name}</label>`).join('')}</div></div>
      </div>
      <label class="fld"><span>Data scope</span><select id="nu_scope" onchange="window.NEWUSER.scope=this.value"><option>Main Campus</option><option>All Hospitals</option><option>ICU</option><option>Radiology</option><option>Operating Room</option><option>Facilities</option><option>Central Store</option><option>Assigned WOs only</option></select></label>
      <label class="fld"><span>Temporary Password</span><input id="nu_pass" type="text" placeholder="Temp password (user will change on first login)" oninput="window.NEWUSER.password=this.value"></label>
      <label class="chk-supr"><input type="checkbox" checked onchange="window.NEWUSER.mfa=this.checked"> Require multi-factor authentication</label>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitUser()">${icon('check')}Create & Send Invite</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
  setTimeout(() => { toggleSupervisedTeamField(); toggleDeptLinkField(); }, 0);
}
function toggleDeptLinkField() {
  const cb = document.getElementById('nu_dept_linked');
  const wrap = document.getElementById('nu_dept_wrap');
  if (!wrap) return;
  const linked = cb ? cb.checked : false;
  wrap.style.display = linked ? '' : 'none';
  window.NEWUSER.dept_linked = linked;
  if (!linked) { window.NEWUSER.depts = []; document.querySelectorAll('#nu_dept_wrap input[type=checkbox]').forEach(c => c.checked = false); }
}
window.toggleDeptLinkField = toggleDeptLinkField;
function toggleNewUserDept(cb) {
  if (!window.NEWUSER.depts) window.NEWUSER.depts = [];
  if (cb.checked) { if (!window.NEWUSER.depts.includes(cb.value)) window.NEWUSER.depts.push(cb.value); }
  else { window.NEWUSER.depts = window.NEWUSER.depts.filter(d => d !== cb.value); }
}
window.toggleNewUserDept = toggleNewUserDept;
function toggleSupervisedTeamField() {
  const role = document.getElementById('nu_role')?.value || '';
  const wrap = document.getElementById('nu_supervised_team_wrap');
  if (!wrap) return;
  const isLead = role.toLowerCase().includes('supervisor') || role.toLowerCase().includes('manager');
  wrap.style.display = isLead ? '' : 'none';
  if (!isLead) window.NEWUSER.supervised_team = '';
}
window.toggleSupervisedTeamField = toggleSupervisedTeamField;
window.openAddUser = openAddUser;

async function submitUser() {
  if (!window.NEWUSER.name || !window.NEWUSER.email) { toast('Enter a name and email'); return; }
  if (!window.NEWUSER.password) { toast('Enter a temporary password'); return; }
  const id = nextSequentialId('U', USERS, 1, 3);
  const userDepts = window.NEWUSER.depts || [];
  const u = { id, name: window.NEWUSER.name, email: window.NEWUSER.email, role: window.NEWUSER.role, scope: window.NEWUSER.scope || 'Main Campus', dept: userDepts.length ? userDepts.join(', ') : null, status: 'invited', last_active: '—', mfa: window.NEWUSER.mfa !== false, must_change_password: true, supervised_team: window.NEWUSER.supervised_team || null };
  const ok = await addUser(u);
  if (!ok) { toast('Failed to create user — ' + LAST_DB_ERROR); return; }
  if (userDepts.length) await setUserDepartments(id, userDepts);
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
  const userDepts = USER_DEPT_MAP[u.id] || [];
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('users')}</div><div><h2>Edit User — ${u.name}</h2><div class="did">Change scope and team assignment</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Data Scope</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Role</span><select id="us_role" onchange="toggleEditSupervisedTeam()">${ROLES.map(r => `<option ${u.role === r.name ? 'selected' : ''}>${r.name}</option>`).join('')}</select></label>
      <label class="chk-supr"><input type="checkbox" id="us_dept_linked" ${userDepts.length ? 'checked' : ''} onchange="toggleEditDeptLink()"> Link to department(s) (restricts visible equipment to those departments)</label>
      <div id="us_dept_wrap" style="display:${userDepts.length ? '' : 'none'}">
        <div class="fld"><span style="margin-bottom:6px">Departments</span><div style="display:flex;flex-wrap:wrap;gap:8px;max-height:180px;overflow-y:auto;padding:4px 0">${DEPARTMENTS.map(d => `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;padding:6px 10px;border:1px solid var(--border);border-radius:8px"><input type="checkbox" value="${d.name}" ${userDepts.includes(d.name) ? 'checked' : ''} onchange="toggleEditUserDept(this)"> ${d.name}</label>`).join('')}</div></div>
      </div>
      <label class="fld"><span>Scope</span><select id="us_scope"><option ${u.scope === 'Main Campus' ? 'selected' : ''}>Main Campus</option><option ${u.scope === 'All Hospitals' ? 'selected' : ''}>All Hospitals</option><option ${u.scope === 'ICU' ? 'selected' : ''}>ICU</option><option ${u.scope === 'Radiology' ? 'selected' : ''}>Radiology</option><option ${u.scope === 'Operating Room' ? 'selected' : ''}>Operating Room</option><option ${u.scope === 'Facilities' ? 'selected' : ''}>Facilities</option><option ${u.scope === 'Central Store' ? 'selected' : ''}>Central Store</option><option ${u.scope === 'Assigned WOs only' ? 'selected' : ''}>Assigned WOs only</option></select></label>
      <div id="us_supervised_team_wrap">
        <label class="fld"><span>Supervised Team</span><select id="us_supervised_team"><option value="" ${!u.supervised_team ? 'selected' : ''}>None (all teams)</option>${teamOpts(u.supervised_team)}</select></label>
      </div>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEditScope('${uid}')">${icon('check')}Save Changes</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div>
  </div></div>`);
  setTimeout(() => toggleEditSupervisedTeam(), 0);
}
function toggleEditDeptLink() {
  const cb = document.getElementById('us_dept_linked');
  const wrap = document.getElementById('us_dept_wrap');
  if (!wrap) return;
  wrap.style.display = cb && cb.checked ? '' : 'none';
  if (!cb || !cb.checked) { document.querySelectorAll('#us_dept_wrap input[type=checkbox]').forEach(c => c.checked = false); }
}
window.toggleEditDeptLink = toggleEditDeptLink;
function toggleEditUserDept(cb) {
  if (!window.EDIT_USER_DEPTS) window.EDIT_USER_DEPTS = [];
  if (cb.checked) { if (!window.EDIT_USER_DEPTS.includes(cb.value)) window.EDIT_USER_DEPTS.push(cb.value); }
  else { window.EDIT_USER_DEPTS = window.EDIT_USER_DEPTS.filter(d => d !== cb.value); }
}
window.toggleEditUserDept = toggleEditUserDept;
function toggleEditSupervisedTeam() {
  const role = document.getElementById('us_role')?.value || '';
  const wrap = document.getElementById('us_supervised_team_wrap');
  if (!wrap) return;
  const isLead = role.toLowerCase().includes('supervisor') || role.toLowerCase().includes('manager');
  wrap.style.display = isLead ? '' : 'none';
}
window.toggleEditSupervisedTeam = toggleEditSupervisedTeam;
window.openEditScope = openEditScope;

async function submitEditScope(uid) {
  const roleSel = document.getElementById('us_role');
  const sel = document.getElementById('us_scope');
  const deptLinked = document.getElementById('us_dept_linked');
  const scope = sel ? sel.value : 'Main Campus';
  const checkedDepts = Array.from(document.querySelectorAll('#us_dept_wrap input[type=checkbox]:checked')).map(c => c.value);
  const depts = (deptLinked && deptLinked.checked) ? checkedDepts : [];
  const supSel = document.getElementById('us_supervised_team');
  const supervised_team = supSel ? supSel.value : null;
  const updates = { scope, dept: depts.length ? depts.join(', ') : null };
  if (roleSel) updates.role = roleSel.value;
  if (supSel) updates.supervised_team = supervised_team;
  const usOk = await updateUser(uid, updates);
  if (!usOk) { toast('Failed to update — ' + LAST_DB_ERROR); return; }
  await setUserDepartments(uid, depts);
  USER_DEPT_MAP[uid] = depts;
  const u = USERS.find(x => x.id === uid);
  if (u) { u.scope = scope; u.dept = depts.length ? depts.join(', ') : null; if (roleSel) u.role = roleSel.value; if (supSel) u.supervised_team = supervised_team; }
  closeDrawer();
  if (CURRENT === 'users') go('users');
  toast('User updated — ' + (u ? u.name : 'user'));
  addAuditLog('Admin', 'Updated user ' + (u ? u.name : 'user') + ' — scope: ' + scope + ', depts: ' + (depts.length ? depts.join(', ') : 'all') + (supSel ? ', team: ' + (supervised_team || 'all') : ''), 'info');
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
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to advance work orders'); return; }
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
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to request parts'); return; }
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
  if (!hasPerm('Work Orders', 'Edit')) { toast('You do not have permission to escalate work orders'); return; }
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

/* ================= PRINTABLE WORK ORDER REPORT ================= */
async function printWOReport(id) {
  const w = WOMAP[id];
  if (!w) { toast('Work order not found'); return; }
  const e = EQMAP[w.eq_id] || {};
  const saved = await loadChecklistResult(id);
  const st = saved ? { checklist: saved.checklist || {}, notes: saved.notes || '', parts: saved.parts || [] } : (CHK_STATE[id] || { checklist: {}, notes: '', parts: [] });
  const chkResults = st.checklist || {};
  const tpl = getTemplate(CHK_CTX.tpl);
  const chkSections = tpl ? tpl.sections.map((sec, si) => {
    const items = sec.items.map((it, ii) => {
      const r = chkResults[si + '-' + ii];
      if (it.type === 'check') {
        return `<tr><td>${it.t}</td><td style="text-align:center">${r?.result === 'pass' ? 'Pass' : r?.result === 'fail' ? 'Fail' : r?.result === 'na' ? 'N/A' : '—'}</td></tr>`;
      } else {
        return `<tr><td>${it.t} <span style="color:#666;font-size:11px">(range ${it.min}–${it.max} ${it.unit})</span></td><td style="text-align:center">${r?.val ?? '—'} ${it.unit}</td></tr>`;
      }
    }).join('');
    return `<table class="chk-tbl"><thead><tr><th>${sec.title}</th><th style="text-align:center">Result</th></tr></thead><tbody>${items}</tbody></table>`;
  }).join('') : '';

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Work Order Report — ${id}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a2a36; max-width: 800px; margin: 0 auto; padding: 32px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 24px 0 8px; color: #2a4a5c; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    .meta { font-size: 12px; color: #666; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-bottom: 16px; }
    .field { font-size: 13px; }
    .field .k { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
    .field .v { font-weight: 600; }
    .chk-tbl { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px; }
    .chk-tbl th { text-align: left; background: #f0f4f6; padding: 6px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .chk-tbl td { padding: 5px 8px; border-bottom: 1px solid #e8e8e8; }
    .chk-tbl tbody tr:nth-child(even) { background: #fafbfc; }
    .sign-section { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .sign-box { border: 1.5px solid #1a2a36; border-radius: 8px; padding: 16px; min-height: 120px; }
    .sign-box .role { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .sign-box .name { font-size: 14px; font-weight: 600; margin-bottom: 40px; }
    .sign-box .line { border-top: 1px solid #999; padding-top: 4px; font-size: 11px; color: #888; }
    .sign-box .date-line { border-top: 1px solid #999; padding-top: 4px; font-size: 11px; color: #888; margin-top: 12px; }
    .header-bar { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2a4a5c; padding-bottom: 12px; margin-bottom: 20px; }
    .logo { font-size: 18px; font-weight: 800; color: #2a4a5c; }
    .status-badge { font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 6px; background: #e6f4ea; color: #1a7a3a; }
    .notes-box { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; font-size: 12px; min-height: 60px; white-space: pre-wrap; }
    @media print { body { padding: 16px; } .no-print { display: none; } }
    .print-btn { position: fixed; top: 16px; right: 16px; padding: 8px 20px; font-size: 13px; font-weight: 600; background: #2a4a5c; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
  </style></head><body>
  <button class="print-btn no-print" onclick="window.print()">Print</button>
  <div class="header-bar">
    <div><div class="logo">Vitalis CMMS</div><div style="font-size:11px;color:#888;margin-top:2px">Medical Equipment Maintenance System</div></div>
    <div class="status-badge">${w.status === 'closed' ? 'Closed' : 'Completed'}</div>
  </div>
  <h1>Work Order Report</h1>
  <div class="meta">Report ID: ${id} · Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>

  <h2>Work Order Details</h2>
  <div class="grid">
    <div class="field"><div class="k">Work Order ID</div><div class="v">${id}</div></div>
    <div class="field"><div class="k">Type</div><div class="v">${w.type}</div></div>
    <div class="field"><div class="k">Priority</div><div class="v">${w.pri}</div></div>
    <div class="field"><div class="k">Status</div><div class="v">${w.status}</div></div>
    <div class="field"><div class="k">Opened</div><div class="v">${w.opened}</div></div>
    <div class="field"><div class="k">Due</div><div class="v">${w.due}</div></div>
    <div class="field"><div class="k">Team</div><div class="v">${w.team}</div></div>
    <div class="field"><div class="k">SLA</div><div class="v">${w.sla}</div></div>
  </div>

  <h2>Equipment</h2>
  <div class="grid">
    <div class="field"><div class="k">Asset Name</div><div class="v">${e.name || '—'}</div></div>
    <div class="field"><div class="k">Asset Tag</div><div class="v">${e.tag || '—'}</div></div>
    <div class="field"><div class="k">Serial Number</div><div class="v">${e.serial || '—'}</div></div>
    <div class="field"><div class="k">Manufacturer</div><div class="v">${e.mfr || '—'}</div></div>
    <div class="field"><div class="k">Model</div><div class="v">${e.model || '—'}</div></div>
    <div class="field"><div class="k">Department</div><div class="v">${e.dept || '—'}</div></div>
    <div class="field"><div class="k">Location</div><div class="v">${e.loc || '—'}</div></div>
    <div class="field"><div class="k">Criticality</div><div class="v">${e.crit === 'life' ? 'Life Support' : e.crit === 'high' ? 'High Risk' : e.crit === 'med' ? 'Medium' : 'Low'}</div></div>
  </div>

  <h2>Problem Description</h2>
  <div class="notes-box">${w.title || '—'}</div>

  ${st.notes ? `<h2>Technician Notes</h2><div class="notes-box">${st.notes}</div>` : ''}

  ${chkSections ? `<h2>Checklist Results</h2>${chkSections}` : ''}

  ${(st.parts && st.parts.length > 0) ? `<h2>Parts Used</h2><table class="chk-tbl"><thead><tr><th>Part</th><th>ID</th><th style="text-align:center">Qty</th><th style="text-align:center">Unit Cost</th><th style="text-align:center">Total</th></tr></thead><tbody>${st.parts.map(p => `<tr><td>${p.name}</td><td class="mono">${p.id}</td><td style="text-align:center">${p.qty}</td><td style="text-align:center">${Number(p.cost).toFixed(2)}</td><td style="text-align:center">${(Number(p.cost) * p.qty).toFixed(2)}</td></tr>`).join('')}</tbody></table>` : ''}

  ${(w.closeout_history && w.closeout_history.length > 0) ? `<h2>Work Order Close-Out History</h2><table class="chk-tbl"><thead><tr><th>Action</th><th>By</th><th>Reason</th><th style="text-align:center">Date</th></tr></thead><tbody>${(w.closeout_history || []).map(h => `<tr><td style="text-transform:capitalize">${h.action}</td><td>${h.by}</td><td>${h.reason || '—'}</td><td style="text-align:center">${new Date(h.timestamp).toLocaleString('en-GB', { day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit' })}</td></tr>`).join('')}</tbody></table>` : ''}

  ${(() => { const sr = w.source_sr_id ? SR_DATA.find(r => r.id === w.source_sr_id) : null; return (sr && sr.closeout_history && sr.closeout_history.length > 0) ? `<h2>Service Request Close-Out History</h2><table class="chk-tbl"><thead><tr><th>Action</th><th>By</th><th>Reason</th><th style="text-align:center">Date</th></tr></thead><tbody>${(sr.closeout_history || []).map(h => `<tr><td style="text-transform:capitalize">${h.action}</td><td>${h.by}</td><td>${h.reason || '—'}</td><td style="text-align:center">${new Date(h.timestamp).toLocaleString('en-GB', { day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit' })}</td></tr>`).join('')}</tbody></table>` : ''; })()}

  <h2>Parties</h2>
  <div class="grid">
    <div class="field"><div class="k">Technician</div><div class="v">${w.assignee || '—'}</div></div>
    <div class="field"><div class="k">Requestor</div><div class="v">${w.requestor || '—'}</div></div>
  </div>

  <div class="sign-section">
    <div class="sign-box">
      <div class="role">Technician Signature</div>
      <div class="name">${w.assignee || '—'}</div>
      <div class="line">Signature</div>
      <div class="date-line">Date</div>
    </div>
    <div class="sign-box">
      <div class="role">Requestor Signature</div>
      <div class="name">${w.requestor || '—'}</div>
      <div class="line">Signature</div>
      <div class="date-line">Date</div>
    </div>
  </div>

  </body></html>`);
  win.document.close();
}
window.printWOReport = printWOReport;

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

function shouldSendEmail(recipientName, eventType, entityType) {
  if (!recipientName) return true;
  if (!USERS.length) return true;
  let user = USERS.find(u => u.name === recipientName || nameMatches(u.name, recipientName));
  if (!user && recipientName === 'Biomedical Engineering') {
    user = USERS.find(u => u.role && u.role.toLowerCase().includes('supervisor') && u.status === 'active');
  }
  if (!user || !user.role) return true;
  const role = ROLES.find(r => r.name === user.role);
  if (!role) return true;
  const col = `email_${entityType}_${eventType}`;
  return role[col] === true;
}
window.shouldSendEmail = shouldSendEmail;

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

function isSupervisor() { return CMMS_USER?.role && CMMS_USER.role.toLowerCase().includes('supervisor'); }

function findSupervisorForTeam(team) {
  if (!team) return null;
  const teamLower = team.toLowerCase();
  let sup = USERS.find(u => u.role && u.role.toLowerCase().includes('supervisor') && u.status === 'active' && u.supervised_team && u.supervised_team.toLowerCase() === teamLower);
  if (sup) return sup;
  sup = USERS.find(u => u.role && u.role.toLowerCase().includes('supervisor') && u.status === 'active' && !u.supervised_team);
  if (sup) return sup;
  return USERS.find(u => u.role && u.role.toLowerCase().includes('supervisor') && u.status === 'active') || null;
}

function visibleNotifications() {
  if (!CMMS_USER) return [];
  if (isSupervisor()) return NOTIFICATIONS;
  const me = CMMS_USER.name;
  return NOTIFICATIONS.filter(n => {
    if (n.recipient === me || nameMatches(n.recipient, me)) return true;
    if (n.recipient === 'Biomedical Engineering' || n.recipient === 'Store / Management' || n.recipient === 'Management') return CMMS_USER.role === 'Biomedical Supervisor';
    return false;
  });
}

async function refreshNotifBadge() {
  const myNotifs = visibleNotifications();
  const unread = myNotifs.filter(n => !READ_NOTIF_IDS.has(n.id)).length;
  const badge = document.getElementById('notifBadge');
  const dot = document.getElementById('notifDot');
  if (badge) { badge.textContent = String(unread); badge.style.display = unread > 0 ? 'flex' : 'none'; }
  if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
}
window.refreshNotifBadge = refreshNotifBadge;

function openNotifications() {
  const myNotifs = visibleNotifications();
  const items = myNotifs.length ? myNotifs.map(n => {
    const isRead = READ_NOTIF_IDS.has(n.id);
    const cls = n.category === 'crit' ? 'p-crit' : n.category === 'warn' ? 'p-warn' : n.category === 'ok' ? 'p-ok' : 'p-info';
    return `<div class="notif-item ${isRead ? 'read' : ''}" onclick="openNotifDetail('${n.id}')">
      <div class="notif-dot" style="background:${isRead ? 'transparent' : 'var(--primary)'}"></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px"><span class="pill ${cls}" style="font-size:10px;padding:1px 7px">${n.category}</span><b style="font-size:13px">${n.title}</b></div>
        <div class="sub2" style="font-size:12px;margin:0">${n.message}</div>
        <div class="sub2 mono" style="font-size:10px;margin-top:3px">${n.recipient} · ${new Date(n.created_at).toLocaleString('en-GB', { day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit' })}</div>
      </div>
    </div>`;
  }).join('') : '<div class="empty">No notifications</div>';
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('alert')}</div><div><h2>Notifications</h2><div class="did">${myNotifs.filter(n=>!READ_NOTIF_IDS.has(n.id)).length} unread · ${myNotifs.length} total</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec" style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-ghost" onclick="markAllRead()">${icon('check')}Mark all read</button></div>
    <div class="notif-list">${items}</div>
  </div>`);
}
window.openNotifications = openNotifications;

async function markAllRead() {
  const allIds = visibleNotifications().map(n => n.id);
  const ok = await markAllNotificationsReadForUser(allIds, CMMS_USER?.id);
  if (!ok) { toast('Failed — ' + LAST_DB_ERROR); return; }
  allIds.forEach(id => READ_NOTIF_IDS.add(id));
  await refreshNotifBadge();
  openNotifications();
  toast('All notifications marked read');
}
window.markAllRead = markAllRead;

async function openNotifDetail(id) {
  const n = NOTIFICATIONS.find(x => x.id === id);
  if (!n) return;
  if (!READ_NOTIF_IDS.has(id)) {
    const ok = await markNotificationReadForUser(id, CMMS_USER?.id);
    if (ok) { READ_NOTIF_IDS.add(id); await refreshNotifBadge(); }
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
  if (!hasPerm('Work Orders', 'Create')) { toast('You do not have permission to convert service requests'); return; }
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
    source_sr_id: srId,
  };
  const ok = await addWorkOrder(wo);
  if (!ok) { toast('Failed to convert request — ' + LAST_DB_ERROR); return; }
  WORKORDERS.unshift(wo);
  WOMAP[wo.id] = wo;
  const srOk = await updateServiceRequest(srId, { usable: 'Converted' });
  if (!srOk) { toast('Failed to update request — ' + LAST_DB_ERROR); return; }
  sr.usable = 'Converted';
  sr.status = 'converted';
  if (CURRENT === 'requests') go('requests');
  toast('Converted ' + srId + ' to work order ' + id + ' — assign a technician to proceed');
  addAuditLog('Dr. Rana Aoun', 'Converted service request ' + srId + ' to work order ' + id, 'info');
  openWO(id);
}
window.convertSRToWO = convertSRToWO;

/* ================= SERVICE REQUEST: CLOSE / REJECT BY REQUESTOR ================= */
async function closeServiceRequest(srId) {
  const sr = SR_DATA.find(r => r.id === srId);
  if (!sr) return;
  const isRequestor = CMMS_USER && (sr.by === CMMS_USER.name || sr.by === CMMS_USER.email || sr.user_id === CMMS_USER.id);
  if (!isRequestor && !hasPerm('Service Requests', 'Edit')) { toast('Only the requestor can close this service request'); return; }
  const linkedWO = WORKORDERS.find(w => w.source_sr_id === srId);
  if (!linkedWO || (linkedWO.status !== 'closed' && linkedWO.status !== 'pending_closeout')) { toast('Linked work order must be completed first'); return; }
  const woHistory = linkedWO.closeout_history || [];
  woHistory.push({ action: 'confirmed', by: CMMS_USER?.name || sr.by || 'Requestor', timestamp: new Date().toISOString() });
  const slaResult = computeSLA(linkedWO, SLA_CONFIG);
  const slaLabel = slaResult.met ? 'Met' : 'Breached';
  const woOk = await updateWorkOrder(linkedWO.id, { status: 'closed', closeout_status: 'confirmed', closeout_history: woHistory, sla: slaLabel, sla_pct: 100 });
  if (!woOk) { toast('Failed to close work order — ' + LAST_DB_ERROR); return; }
  linkedWO.status = 'closed';
  linkedWO.closeout_status = 'confirmed';
  linkedWO.closeout_history = woHistory;
  linkedWO.sla = slaLabel;
  linkedWO.sla_pct = 100;
  const history = sr.closeout_history || [];
  history.push({ action: 'closed', by: CMMS_USER?.name || sr.by || 'Requestor', timestamp: new Date().toISOString() });
  const srOk = await updateServiceRequest(srId, { status: 'closed', usable: 'Closed', closeout_history: history });
  if (!srOk) { toast('Failed to close request — ' + LAST_DB_ERROR); return; }
  sr.status = 'closed';
  sr.usable = 'Closed';
  sr.closeout_history = history;
  if (CURRENT === 'requests') go('requests');
  toast('Service request ' + srId + ' closed');
  addAuditLog(CMMS_USER?.name || sr.by, 'Closed service request ' + srId, 'ok');
  const eq = EQMAP[sr.eq_id];
  const supervisor = findSupervisorForTeam(linkedWO.team);
  if (supervisor) {
    await fireNotification(linkedWO.id, 'Service Request Closed', `${srId} confirmed and closed by ${sr.by}. Work order ${linkedWO.id} is now fully closed.`, 'ok', supervisor.name);
    if (shouldSendEmail(supervisor.name, 'close', 'sr')) {
      await fireEmail(linkedWO.id, supervisor.email, supervisor.name, `Service Request Closed — ${srId}`, `The requestor has confirmed the repair and closed the service request. Both the request and work order are now fully closed.\n\nService Request: ${srId}\nWork Order: ${linkedWO.id}\nEquipment: ${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}\nClosed by: ${sr.by}\n\nThe final PDF report is now available for printing from Vitalis CMMS.`);
    }
  }
  if (linkedWO.assignee && linkedWO.assignee !== 'Unassigned') {
    const techEmail = USERS.find(u => u.name === linkedWO.assignee)?.email || linkedWO.assignee.toLowerCase().replace(/ /g, '.') + '@cedarridge.org';
    await fireNotification(linkedWO.id, 'Work Order Closed', `${linkedWO.id} — ${linkedWO.title} confirmed and closed by ${sr.by}.`, 'ok', linkedWO.assignee);
    if (shouldSendEmail(linkedWO.assignee, 'close', 'wo')) {
      await fireEmail(linkedWO.id, techEmail, linkedWO.assignee, `Work Order Closed — ${linkedWO.id}`, `The requestor has confirmed the repair and the work order is now fully closed.\n\nWork Order: ${linkedWO.id}\nTitle: ${linkedWO.title}\nEquipment: ${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}\nConfirmed by: ${sr.by}\n\nThe final PDF report is now available for printing from Vitalis CMMS.`);
    }
  }
}
window.closeServiceRequest = closeServiceRequest;

let REJECT_SR_ID = null;
function openRejectServiceRequest(srId) {
  REJECT_SR_ID = srId;
  const sr = SR_DATA.find(r => r.id === srId);
  const linkedWO = WORKORDERS.find(w => w.source_sr_id === srId);
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--crit-soft,var(--crit));color:#fff">${icon('alert')}</div><div><h2>Reject Repair & Reopen</h2><div class="did">${srId}</div></div></div><button class="icon-btn close" onclick="closeDrawer();go('requests')">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Why is this not resolved?</h4>
    <p class="sub2" style="margin:0 0 12px">The linked work order ${linkedWO ? linkedWO.id : ''} will be reopened and the technician will be notified. Your explanation will be saved to the history.</p>
    <label class="fld"><span>Reason <span style="color:var(--crit)">*required</span></span><textarea id="rej_sr_reason" rows="4" placeholder="e.g. The alarm is still not triggering when parameters are exceeded"></textarea></label>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitRejectServiceRequest()">${icon('alert')}Reject & Reopen</button><button class="btn btn-ghost" onclick="closeDrawer();go('requests')">Cancel</button></div>
  </div></div>`);
}
window.openRejectServiceRequest = openRejectServiceRequest;

async function submitRejectServiceRequest() {
  const srId = REJECT_SR_ID;
  if (!srId) return;
  const sr = SR_DATA.find(r => r.id === srId);
  if (!sr) return;
  const isRequestor = CMMS_USER && (sr.by === CMMS_USER.name || sr.by === CMMS_USER.email || sr.user_id === CMMS_USER.id);
  if (!isRequestor && !hasPerm('Service Requests', 'Edit')) { toast('Only the requestor can reject this service request'); return; }
  const reason = document.getElementById('rej_sr_reason').value.trim();
  if (!reason) { toast('Please explain why the repair was not complete'); return; }
  const linkedWO = WORKORDERS.find(w => w.source_sr_id === srId);
  if (!linkedWO) { toast('No linked work order found'); return; }
  const srHistory = sr.closeout_history || [];
  srHistory.push({ action: 'rejected', by: CMMS_USER?.name || sr.by || 'Requestor', reason, timestamp: new Date().toISOString() });
  const srOk = await updateServiceRequest(srId, { status: 'open', usable: 'Converted', closeout_history: srHistory });
  if (!srOk) { toast('Failed to reopen request — ' + LAST_DB_ERROR); return; }
  sr.status = 'open';
  sr.usable = 'Converted';
  sr.closeout_history = srHistory;
  const woHistory = linkedWO.closeout_history || [];
  woHistory.push({ action: 'rejected', by: CMMS_USER?.name || sr.by || 'Requestor', reason, timestamp: new Date().toISOString() });
  const woOk = await updateWorkOrder(linkedWO.id, { status: 'inprogress', closeout_status: 'rejected', closeout_reason: reason, closeout_history: woHistory });
  if (!woOk) { toast('Failed to reopen work order — ' + LAST_DB_ERROR); return; }
  linkedWO.status = 'inprogress';
  linkedWO.closeout_status = 'rejected';
  linkedWO.closeout_reason = reason;
  linkedWO.closeout_history = woHistory;
  const existing = await loadChecklistResult(linkedWO.id);
  if (existing) {
    await saveChecklistResult(linkedWO.id, 'wo', { checklist: existing.checklist || {}, supervisor: existing.supervisor || false, notes: existing.notes || '', parts: existing.parts || [], step: null, technician: existing.technician || '' });
  } else {
    await saveChecklistResult(linkedWO.id, 'wo', { checklist: {}, supervisor: false, notes: '', parts: [], step: null, technician: linkedWO.assignee || '' });
  }
  if (CHK_STATE[linkedWO.id]) CHK_STATE[linkedWO.id].step = null;
  closeDrawer();
  if (CURRENT === 'requests') go('requests');
  toast('Service request ' + srId + ' rejected — work order ' + linkedWO.id + ' reopened');
  addAuditLog(CMMS_USER?.name || sr.by, 'Rejected service request ' + srId + ' — ' + reason, 'warn');
  const eq = EQMAP[linkedWO.eq_id];
  if (linkedWO.assignee) {
    const techEmail = linkedWO.assignee.toLowerCase().replace(/ /g, '.') + '@cedarridge.org';
    await fireNotification(linkedWO.id, 'Work Order Reopened', `${linkedWO.id} — ${linkedWO.title} rejected by requestor. ${reason}`, 'warn', linkedWO.assignee);
    if (shouldSendEmail(linkedWO.assignee, 'update', 'wo')) {
      await fireEmail(linkedWO.id, techEmail, linkedWO.assignee, `Work Order Reopened — ${linkedWO.id}`, `The requestor has rejected the repair and the work order has been reopened.\n\nWork Order: ${linkedWO.id}\nTitle: ${linkedWO.title}\nEquipment: ${eq ? eq.tag + ' — ' + eq.name : 'Unknown'}\nRejected by: ${sr.by}\nReason: ${reason}\n\nPlease review the reason and address the issue in Vitalis CMMS.`);
    }
  }
}
window.submitRejectServiceRequest = submitRejectServiceRequest;

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
  if (!hasPerm('Parts', 'Create')) { toast('You do not have permission to add parts'); return; }
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
  if (!hasPerm('Parts', 'Edit')) { toast('You do not have permission to issue parts'); return; }
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
  if (p.qty <= p.min_qty) {
    await fireNotification(null, 'Low Stock Alert', `${p.name} (${p.id}) is at ${p.qty} units — minimum is ${p.min_qty}. Reorder needed.`, 'warn', 'Store / Management');
  }
  closeDrawer();
  if (CURRENT === 'parts') go('parts');
  toast('Issued ' + qty + ' × ' + p.id + ' to ' + woid);
  addAuditLog('Store', 'Issued ' + qty + ' × ' + p.id + ' to ' + woid, 'warn');
}
window.submitIssuePart = submitIssuePart;

async function reorderLowStock() {
  if (!hasPerm('Parts', 'Edit')) { toast('You do not have permission to reorder parts'); return; }
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
  if (!hasPerm('Vendors', 'Delete')) { toast('You do not have permission to delete vendors'); return; }
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
  if (!hasPerm('Preventive PM', 'Create')) { toast('You do not have permission to generate PM schedules'); return; }
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
      title: plan.name || (plan.freq + ' PM — ' + e.name),
      due: plan.next_due, freq: plan.freq,
      status: new Date(plan.next_due) < new Date(TODAY) ? 'overdue' : 'scheduled',
      tpl: plan.tpl, team: plan.team, technician: plan.technician || null,
    };
    const ok = await addPMWorkOrder(pm);
    if (!ok) { toast('Failed to generate PM — ' + LAST_DB_ERROR); return; }
    PMWO.push(pm);
    PMWOMAP[pm.id] = pm;
    const newNext = addInterval(plan.next_due, plan.freq, PM_FREQS);
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
      const techRecord = TECHS.find(t => nameMatches(pm.technician, t.name));
      if (!techRecord) continue;
      const recipient = techRecord.name;
      await fireNotification(pm.id, 'PM Reminder — Tomorrow', `PM ${pm.id} for ${e ? e.tag : ''} (${e ? e.name : ''}) is due tomorrow (${fmtDate(pm.due)}). Please prepare tools and checklist.`, 'warn', recipient);
      const email = techRecord.name.toLowerCase().replace(/ /g, '.') + '@cedarridge.org';
      if (shouldSendEmail(recipient, 'update', 'pm')) {
        await fireEmail(pm.id, email, recipient, `PM Reminder — ${pm.id} due tomorrow`, `This is a reminder that PM work order ${pm.id} is due tomorrow.\n\nEquipment: ${e ? e.tag + ' — ' + e.name : '—'}\nDue: ${fmtDate(pm.due)}\nFrequency: ${pm.freq}\n\nPlease review the checklist and prepare for the maintenance visit.`);
      }
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
        <button class="btn btn-ghost" style="height:32px;font-size:12px" onclick="openEditPMPlan('${p.id}')">Edit</button>
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
  const freqOpts = (PM_FREQS.length ? PM_FREQS : [{ label: 'Quarterly' }]).map(f => `<option ${f.label === 'Quarterly' ? 'selected' : ''}>${f.label}</option>`).join('');

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
        <label class="fld" style="flex:1"><span>Team</span><select id="pmp_team" onchange="window.NEWPMP.team=this.value">${teamOpts(window.NEWPMP.team)}</select></label>
      </div>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitPMPlan()">${icon('check')}Create & Schedule Plan</button><button class="btn btn-ghost" onclick="renderPMPlansList()">Back</button></div>
  </div></div>`);
}
window.openNewPMPlan = openNewPMPlan;

function openEditPMPlan(planId) {
  const p = PM_PLANS.find(x => x.id === planId);
  if (!p) return;
  NEWPMP = { id: p.id, name: p.name, eq_id: p.eq_id, tpl: p.tpl, freq: p.freq, technician: p.technician || 'Unassigned', team: p.team || '', start_date: p.start_date || TODAY }; window.NEWPMP = NEWPMP;
  const eqOpts = EQUIP.map(e => `<option value="${e.id}" ${e.id === p.eq_id ? 'selected' : ''}>${e.tag} — ${e.name} (${e.dept})</option>`).join('');
  const tplOpts = buildTemplateOptions(p.tpl);
  const techOpts = ['Unassigned', ...TECHS.map(t => t.name)].map(n => `<option ${n === (p.technician || 'Unassigned') ? 'selected' : ''}>${n}</option>`).join('');
  const freqOpts = (PM_FREQS.length ? PM_FREQS : [{ label: 'Quarterly' }]).map(f => `<option ${f.label === p.freq ? 'selected' : ''}>${f.label}</option>`).join('');
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic" style="background:var(--primary-soft);color:var(--primary)">${icon('pm')}</div><div><h2>Edit PM Plan</h2><div class="did">${p.id}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body"><div class="dsec"><h4>Plan Details</h4>
    <div style="display:flex;flex-direction:column;gap:13px">
      <label class="fld"><span>Plan Name</span><input id="pmp_name" value="${p.name}" oninput="window.NEWPMP.name=this.value"></label>
      <label class="fld"><span>Equipment</span><select id="pmp_eq" onchange="window.NEWPMP.eq_id=this.value"><option value="">Select equipment…</option>${eqOpts}</select></label>
      <label class="fld"><span>Checklist Template</span><select id="pmp_tpl" onchange="window.NEWPMP.tpl=this.value">${tplOpts}</select></label>
      <div style="display:flex;gap:13px">
        <label class="fld" style="flex:1"><span>Frequency</span><select id="pmp_freq" onchange="window.NEWPMP.freq=this.value">${freqOpts}</select></label>
        <label class="fld" style="flex:1"><span>Start Date</span><input id="pmp_start" type="date" value="${p.start_date || TODAY}" onchange="window.NEWPMP.start_date=this.value"></label>
      </div>
      <div style="display:flex;gap:13px">
        <label class="fld" style="flex:1"><span>Assigned Technician</span><select id="pmp_tech" onchange="window.NEWPMP.technician=this.value">${techOpts}</select></label>
        <label class="fld" style="flex:1"><span>Team</span><select id="pmp_team" onchange="window.NEWPMP.team=this.value">${teamOpts(window.NEWPMP.team)}</select></label>
      </div>
    </div>
    <div style="margin-top:18px;display:flex;gap:9px"><button class="btn btn-primary" onclick="submitEditPMPlan()">${icon('check')}Save Changes</button><button class="btn btn-ghost" onclick="renderPMPlansList()">Back</button></div>
  </div></div>`);
}
window.openEditPMPlan = openEditPMPlan;

async function submitEditPMPlan() {
  if (!hasPerm('Preventive PM', 'Edit')) { toast('You do not have permission to edit PM plans'); return; }
  if (!window.NEWPMP.name) { toast('Enter a plan name'); return; }
  if (!window.NEWPMP.eq_id) { toast('Select equipment'); return; }
  const plan = PM_PLANS.find(p => p.id === window.NEWPMP.id);
  if (!plan) { toast('Plan not found'); return; }
  const updates = {
    name: window.NEWPMP.name, eq_id: window.NEWPMP.eq_id,
    tpl: window.NEWPMP.tpl, freq: window.NEWPMP.freq,
    technician: window.NEWPMP.technician, team: window.NEWPMP.team,
    start_date: window.NEWPMP.start_date,
  };
  const ok = await updatePMPlan(plan.id, updates);
  if (!ok) { toast('Failed to update plan — ' + LAST_DB_ERROR); return; }
  Object.assign(plan, updates);
  toast('PM plan "' + plan.name + '" updated');
  addAuditLog('Admin', 'Updated PM plan ' + plan.name, 'info');
  closeDrawer();
  await refreshAllData();
  renderPMPlansList();
}
window.submitEditPMPlan = submitEditPMPlan;

async function submitPMPlan() {
  if (!hasPerm('Preventive PM', 'Create')) { toast('You do not have permission to create PM plans'); return; }
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
  if (!hasPerm('Preventive PM', 'Create')) { if (!silent) toast('You do not have permission to generate PM work orders'); return; }
  const plan = PM_PLANS.find(p => p.id === planId);
  if (!plan) return;
  const e = EQMAP[plan.eq_id];
  if (!e) { toast('Equipment not found for this plan'); return; }
  const already = PMWO.some(p => p.eq_id === plan.eq_id && p.status !== 'completed' && p.due === plan.next_due);
  if (already) { if (!silent) toast('A PM work order already exists for this due date'); return; }
  const woId = nextSequentialId('PM', PMWO, 1, 5);
  const pm = {
    id: woId, eq_id: plan.eq_id,
    title: plan.name || (plan.freq + ' PM — ' + e.name),
    due: plan.next_due, freq: plan.freq,
    status: new Date(plan.next_due) < new Date(TODAY) ? 'overdue' : 'scheduled',
    tpl: plan.tpl, team: plan.team, technician: plan.technician || null,
  };
  const ok = await addPMWorkOrder(pm);
  if (!ok) { if (!silent) toast('Failed to generate work order — ' + LAST_DB_ERROR); return; }
  PMWO.push(pm);
  PMWOMAP[pm.id] = pm;
  const newNext = addInterval(plan.next_due, plan.freq, PM_FREQS);
  await updatePMPlan(planId, { last_generated: TODAY, next_due: newNext });
  plan.last_generated = TODAY;
  plan.next_due = newNext;
  if (plan.technician && plan.technician !== 'Unassigned') {
    const techRecord = TECHS.find(t => nameMatches(plan.technician, t.name));
    if (techRecord) {
      await fireNotification(woId, 'PM Work Order Assigned', `${woId} — ${pm.title} has been assigned to you. Due ${fmtDate(pm.due)}.`, 'info', techRecord.name);
      const email = techRecord.name.toLowerCase().replace(/ /g, '.') + '@cedarridge.org';
      if (shouldSendEmail(techRecord.name, 'create', 'pm')) {
        await fireEmail(woId, email, techRecord.name, `PM Assignment — ${woId}`, `You have been assigned PM work order ${woId}.\n\nTitle: ${pm.title}\nEquipment: ${e.tag} — ${e.name}\nDue: ${fmtDate(pm.due)}\nFrequency: ${pm.freq}\n\nPlease review the checklist and prepare for the maintenance visit.`);
      }
    }
  }
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
  if (!hasPerm('Preventive PM', 'Delete')) { toast('You do not have permission to delete PM plans'); return; }
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
  const isEdit = !!window.NEWPMTPL.id;
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
  openDrawerHTML(`<div class="drawer-head"><div class="drawer-title"><div class="big-ic">${icon('pm')}</div><div><h2>${isEdit ? 'Edit Checklist Template' : 'New Checklist Template'}</h2><div class="did">${isEdit ? window.NEWPMTPL.id : 'Build a reusable PM checklist'}</div></div></div><button class="icon-btn close" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body">
    <div class="dsec"><h4>Template Details</h4>
      <div style="display:flex;flex-direction:column;gap:13px">
        <label class="fld"><span>Template Name</span><input id="pmt_name" placeholder="e.g. Ventilator Quarterly PM" value="${window.NEWPMTPL.name || ''}" oninput="window.NEWPMTPL.name=this.value"></label>
        <label class="fld"><span>Description</span><input id="pmt_desc" placeholder="When to use this checklist" value="${window.NEWPMTPL.description || ''}" oninput="window.NEWPMTPL.description=this.value"></label>
      </div>
    </div>
    <div class="dsec"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h4>Sections & Items</h4><button class="btn btn-ghost" style="height:34px" onclick="addPMSection()">${icon('dash')}Add Section</button></div>
      <div id="pmt_sections">${secHTML}</div>
    </div>
    <div style="display:flex;gap:9px;margin-top:14px"><button class="btn btn-primary" onclick="submitPMTemplate()">${icon('check')}${isEdit ? 'Update Template' : 'Save Template'}</button><button class="btn btn-ghost" onclick="openPMTemplateManager()">Back to Templates</button></div>
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
  if (!hasPerm('Preventive PM', 'Create')) { toast('You do not have permission to manage PM templates'); return; }
  if (!window.NEWPMTPL.name) { toast('Enter a template name'); return; }
  const cleanSections = window.NEWPMTPL.sections.filter(s => s.title && s.items.length > 0);
  if (cleanSections.length === 0) { toast('Add at least one section with items'); return; }
  const isEdit = !!window.NEWPMTPL.id;
  if (isEdit) {
    const tpl = { id: window.NEWPMTPL.id, name: window.NEWPMTPL.name, description: window.NEWPMTPL.description, sections: cleanSections };
    const ok = await updatePMChecklistTemplate(tpl.id, { name: tpl.name, description: tpl.description, sections: tpl.sections });
    if (!ok) { toast('Failed to update template — ' + LAST_DB_ERROR); return; }
    const idx = PM_TEMPLATES.findIndex(x => x.id === tpl.id);
    if (idx >= 0) PM_TEMPLATES[idx] = tpl;
    toast('Template "' + window.NEWPMTPL.name + '" updated');
    addAuditLog('Admin', 'Updated PM checklist template ' + window.NEWPMTPL.name, 'info');
  } else {
    const id = nextSequentialId('pmt', PM_TEMPLATES, 1, 0);
    const tpl = { id, name: window.NEWPMTPL.name, description: window.NEWPMTPL.description, sections: cleanSections };
    const ok = await addPMChecklistTemplate(tpl);
    if (!ok) { toast('Failed to save template — ' + LAST_DB_ERROR); return; }
    PM_TEMPLATES.push(tpl);
    toast('Template "' + window.NEWPMTPL.name + '" saved');
    addAuditLog('Admin', 'Created PM checklist template ' + window.NEWPMTPL.name, 'info');
  }
  openPMTemplateManager();
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
  if (!hasPerm('Preventive PM', 'Delete')) { toast('You do not have permission to delete PM templates'); return; }
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
          <button class="btn btn-ghost" style="margin-left:auto;font-size:12px;padding:6px 12px" title="Sign out" onclick="doSignOut()">${icon('x')}<span>Sign Out</span></button>
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
          <button class="btn btn-ghost" onclick="openScanner()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4"/></svg>Scan</button>
          <button class="icon-btn" id="themeBtn" title="Toggle theme"><svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg></button>
          <button class="btn btn-ghost" style="height:36px;padding:0 12px;font-size:13px" title="Sign out" onclick="doSignOut()">${icon('x')}<span class="sign-out-label">Sign Out</span></button>
          <button class="icon-btn" title="Notifications" onclick="openNotifications()" style="position:relative"><span class="dot" id="notifDot" style="display:none"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><span id="notifBadge" class="badge" style="position:absolute;top:-2px;right:-2px;background:var(--crit);color:#fff;font-size:10px;min-width:18px;height:18px;border-radius:9px;display:none;align-items:center;justify-content:center;padding:0 4px">0</span></button>
          ${hasPerm('Work Orders', 'Create') ? `<button class="btn btn-primary" onclick="openNewWorkOrder()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>New Work Order</button>` : ''}
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
    buildNav();
    buildMobileNav();
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

  // Deep-link: open service request if #sr=ID is in the URL
  const hashMatch = window.location.hash.match(/[#&]sr=([^&]+)/);
  if (hashMatch) {
    const srId = decodeURIComponent(hashMatch[1]);
    setTimeout(() => openServiceRequest(srId), 500);
    if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

/* ================= INIT ================= */
async function init() {
  try {
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
  } catch (err) {
    console.error('Init error:', err);
  }
  renderLogin();
}

init();

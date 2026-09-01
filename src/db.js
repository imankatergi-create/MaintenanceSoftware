import { supabase } from './supabase.js';

export let HOSP = 'Cedar Ridge Medical Center';
export function setHosp(name) { if (name) HOSP = name; }
export const TODAY = new Date().toISOString().split('T')[0];
export let LAST_DB_ERROR = '';

function recordDbError(error, label) {
  LAST_DB_ERROR = error?.message || label;
  if (error) console.error(label, error);
}

const CRIT_FALLBACK = {
  life: { l: 'Life Support', c: 'crit', color: 'var(--crit)', risk: 90, pri: 'P1', freq: 'Quarterly' },
  high: { l: 'High Risk', c: 'warn', color: 'var(--warn)', risk: 75, pri: 'P2', freq: 'Semi-annual' },
  med: { l: 'Medium', c: 'info', color: 'var(--info)', risk: 50, pri: 'P3', freq: 'Semi-annual' },
  low: { l: 'Low', c: 'muted', color: 'var(--text-3)', risk: 50, pri: 'P4', freq: 'Annual' },
};

let _CRIT_LEVELS = [];

export function setCritLevels(levels) {
  _CRIT_LEVELS = levels || [];
}

export const CRIT = new Proxy(CRIT_FALLBACK, {
  get(target, prop) {
    if (typeof prop !== 'string') return target[prop];
    const db = _CRIT_LEVELS.find(l => l.id === prop);
    if (!db) return target[prop];
    const colorMap = { 'var(--crit)': 'crit', 'var(--warn)': 'warn', 'var(--info)': 'info', 'var(--text-3)': 'muted' };
    return {
      l: db.level || target[prop]?.l || prop,
      c: colorMap[db.color] || target[prop]?.c || 'muted',
      color: db.color || target[prop]?.color,
      risk: db.risk_score || target[prop]?.risk || 50,
      pri: db.default_priority || target[prop]?.pri || 'P3',
      freq: db.default_pm_frequency || target[prop]?.freq || 'Semi-annual',
      description: db.description || '',
    };
  },
});

export function critColor(k) {
  const db = _CRIT_LEVELS.find(l => l.id === k);
  if (db && db.color) return db.color;
  return { life: 'var(--crit)', high: 'var(--warn)', med: 'var(--info)', low: 'var(--text-3)' }[k] || 'var(--text-3)';
}

export const STAT = {
  inuse: { l: 'In Use', c: 'p-ok' },
  available: { l: 'Available', c: 'p-info' },
  maint: { l: 'Under Maintenance', c: 'p-warn' },
  awaitpart: { l: 'Awaiting Part', c: 'p-warn' },
  outofsvc: { l: 'Out of Service', c: 'p-crit' },
  pm: { l: 'Under PM', c: 'p-cal' },
  quarantine: { l: 'Quarantined', c: 'p-crit' },
};

export const WOSTAT = {
  triaged: { l: 'Triaged', c: 'p-muted' },
  assigned: { l: 'Assigned', c: 'p-info' },
  accepted: { l: 'Accepted', c: 'p-info' },
  inprogress: { l: 'In Progress', c: 'p-cal' },
  awaitparts: { l: 'Waiting Parts', c: 'p-warn' },
  onhold: { l: 'On Hold', c: 'p-warn' },
  pending_closeout: { l: 'Awaiting Close-Out', c: 'p-cal' },
  closed: { l: 'Closed', c: 'p-ok' },
};

export const USTAT = {
  active: { l: 'Active', c: 'p-ok' },
  invited: { l: 'Invited', c: 'p-warn' },
  disabled: { l: 'Disabled', c: 'p-muted' },
};

export const MODULES = ['Equipment', 'Work Orders', 'Service Requests', 'Preventive PM', 'Calibration', 'Spare Parts', 'Vendors', 'Reports', 'Configuration', 'Users & Roles'];
export const ACTIONS = ['View', 'Create', 'Edit', 'Approve', 'Delete'];

export let SKILL_AREAS = ['Ventilators', 'Defibrillators', 'Patient Monitors', 'Infusion Pumps', 'MRI', 'CT', 'Ultrasound', 'X-Ray', 'Sterilizers', 'HVAC', 'Generators', 'Medical Gases'];

export function setSkillAreas(arr) { SKILL_AREAS = arr; }

export function eqStatus(s) {
  const o = STAT[s] || STAT.inuse;
  return `<span class="pill ${o.c}"><span class="dotc"></span>${o.l}</span>`;
}

export function woStatus(s) {
  const o = WOSTAT[s] || WOSTAT.triaged;
  return `<span class="pill ${o.c}">${o.l}</span>`;
}

export function priPill(p) {
  const m = { P1: 'p-crit', P2: 'p-warn', P3: 'p-info', P4: 'p-muted', P5: 'p-muted' };
  return `<span class="pill ${m[p]}">${p}</span>`;
}

export function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function overdue(d) {
  return new Date(d) < new Date(TODAY) ? ' <span class="pill p-crit" style="margin-left:4px">Overdue</span>' : '';
}

export function certStatus(exp) {
  const d = (new Date(exp) - new Date(TODAY)) / 864e5;
  return d < 0 ? { l: 'Expired', c: 'p-crit' } : d < 60 ? { l: 'Expiring', c: 'p-warn' } : { l: 'Valid', c: 'p-ok' };
}

// ============ DATA LOADING ============

export async function loadEquipment() {
  const { data, error } = await supabase.from('equipment').select('*').order('name');
  if (error) { console.error('loadEquipment', error); return []; }
  return data;
}

export async function loadWorkOrders() {
  const { data, error } = await supabase.from('work_orders').select('*').order('opened', { ascending: false });
  if (error) { console.error('loadWorkOrders', error); return []; }
  return data;
}

export async function loadParts() {
  const { data, error } = await supabase.from('parts').select('*').order('name');
  if (error) { console.error('loadParts', error); return []; }
  return data;
}

export async function loadPMWorkOrders() {
  const { data, error } = await supabase.from('pm_work_orders').select('*').order('due');
  if (error) { console.error('loadPMWorkOrders', error); return []; }
  return data;
}

export async function loadUsers() {
  const { data, error } = await supabase.from('users').select('*').order('name');
  if (error) { console.error('loadUsers', error); return []; }
  return data;
}

export async function loadUserDepartments() {
  const { data, error } = await supabase.from('user_departments').select('*');
  if (error) { console.error('loadUserDepartments', error); return []; }
  return data;
}

export async function setUserDepartments(userId, deptNames) {
  await supabase.from('user_departments').delete().eq('user_id', userId);
  if (!deptNames || !deptNames.length) return true;
  const rows = deptNames.map(d => ({ user_id: userId, dept: d }));
  const { error } = await supabase.from('user_departments').insert(rows);
  recordDbError(error, 'setUserDepartments');
  return !error;
}

export async function loadTechnicians() {
  const { data, error } = await supabase.from('technicians').select('*').order('name');
  if (error) { console.error('loadTechnicians', error); return []; }
  return data;
}

export async function loadTeams() {
  const { data, error } = await supabase.from('teams').select('*').order('sort_order');
  if (error) { console.error('loadTeams', error); return []; }
  return data;
}

export async function addTeam(t) {
  const { error } = await supabase.from('teams').insert(t);
  recordDbError(error, 'addTeam');
  return !error;
}

export async function updateTeam(id, updates) {
  const { error } = await supabase.from('teams').update(updates).eq('id', id);
  recordDbError(error, 'updateTeam');
  return !error;
}

export async function deleteTeam(id) {
  const { error } = await supabase.from('teams').delete().eq('id', id);
  recordDbError(error, 'deleteTeam');
  return !error;
}

export async function loadRoles() {
  const { data, error } = await supabase.from('roles').select('*').order('name');
  if (error) { console.error('loadRoles', error); return []; }
  return data;
}

export async function loadWorkOrderTypes() {
  const { data, error } = await supabase.from('work_order_types').select('*').order('sort_order');
  if (error) { console.error('loadWorkOrderTypes', error); return []; }
  return data;
}

export async function addWorkOrderType(t) {
  const { error } = await supabase.from('work_order_types').insert(t);
  recordDbError(error, 'addWorkOrderType');
  return !error;
}

export async function updateWorkOrderType(id, updates) {
  const { error } = await supabase.from('work_order_types').update(updates).eq('id', id);
  recordDbError(error, 'updateWorkOrderType');
  return !error;
}

export async function deleteWorkOrderType(id) {
  const { error } = await supabase.from('work_order_types').delete().eq('id', id);
  recordDbError(error, 'deleteWorkOrderType');
  return !error;
}

export async function loadCompetencies() {
  const { data, error } = await supabase.from('competencies').select('*').order('sort_order');
  if (error) { console.error('loadCompetencies', error); return []; }
  return data;
}

export async function addCompetency(c) {
  const { error } = await supabase.from('competencies').insert(c);
  recordDbError(error, 'addCompetency');
  return !error;
}

export async function deleteCompetency(id) {
  const { error } = await supabase.from('competencies').delete().eq('id', id);
  recordDbError(error, 'deleteCompetency');
  return !error;
}

export async function loadUnitsOfMeasure() {
  const { data, error } = await supabase.from('units_of_measure').select('*').order('sort_order');
  if (error) { console.error('loadUnitsOfMeasure', error); return []; }
  return data;
}

export async function addUnitOfMeasure(u) {
  const { error } = await supabase.from('units_of_measure').insert(u);
  recordDbError(error, 'addUnitOfMeasure');
  return !error;
}

export async function updateUnitOfMeasure(id, updates) {
  const { error } = await supabase.from('units_of_measure').update(updates).eq('id', id);
  recordDbError(error, 'updateUnitOfMeasure');
  return !error;
}

export async function deleteUnitOfMeasure(id) {
  const { error } = await supabase.from('units_of_measure').delete().eq('id', id);
  recordDbError(error, 'deleteUnitOfMeasure');
  return !error;
}

export async function loadPermissions() {
  const { data, error } = await supabase.from('permissions').select('*');
  if (error) { console.error('loadPermissions', error); return []; }
  return data;
}

export async function loadWorkflows() {
  const { data, error } = await supabase.from('workflows').select('*').order('name');
  if (error) { console.error('loadWorkflows', error); return []; }
  return data;
}

export async function loadWorkflowTransitions() {
  const { data, error } = await supabase.from('workflow_transitions').select('*').order('seq');
  if (error) { console.error('loadWorkflowTransitions', error); return []; }
  return data;
}

export async function loadServiceRequests(userId) {
  let query = supabase.from('service_requests').select('*').order('time');
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) { console.error('loadServiceRequests', error); return []; }
  return data;
}

export async function loadServiceRequestById(srId) {
  const { data, error } = await supabase.from('service_requests').select('*').eq('id', srId).maybeSingle();
  if (error) { console.error('loadServiceRequestById', error); return null; }
  return data;
}

export async function loadVendors() {
  const { data, error } = await supabase.from('vendors').select('*').order('name');
  if (error) { console.error('loadVendors', error); return []; }
  return data;
}

export async function loadAuditLogs() {
  const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
  if (error) { console.error('loadAuditLogs', error); return []; }
  return data;
}

export async function loadChecklistResult(jobId) {
  const { data, error } = await supabase.from('checklist_results').select('*').eq('job_id', jobId).maybeSingle();
  if (error) { console.error('loadChecklistResult', error); return null; }
  return data;
}

// ============ DATA SAVING ============

export async function saveEquipment(e) {
  const { error } = await supabase.from('equipment').upsert(e);
  recordDbError(error, 'saveEquipment');
  return !error;
}

export async function updateWorkOrder(id, updates) {
  const { data, error } = await supabase.from('work_orders').update(updates).eq('id', id).select('id');
  recordDbError(error, 'updateWorkOrder');
  if (error) return false;
  if (!data || data.length === 0) { recordDbError({ message: 'No rows updated for work order ' + id }, 'updateWorkOrder'); return false; }
  return true;
}

export async function updatePart(id, updates) {
  const { error } = await supabase.from('parts').update(updates).eq('id', id);
  recordDbError(error, 'updatePart');
  return !error;
}

export async function updatePMWorkOrder(id, updates) {
  const { error } = await supabase.from('pm_work_orders').update(updates).eq('id', id);
  recordDbError(error, 'updatePMWorkOrder');
  return !error;
}

export async function addUser(u) {
  const { error } = await supabase.from('users').insert(u);
  recordDbError(error, 'addUser');
  return !error;
}

export async function addRole(r) {
  const { error } = await supabase.from('roles').insert(r);
  recordDbError(error, 'addRole');
  return !error;
}

export async function togglePermission(roleId, mod, act, allowed) {
  const { error } = await supabase
    .from('permissions')
    .update({ allowed })
    .eq('role_id', roleId)
    .eq('module', mod)
    .eq('action', act);
  recordDbError(error, 'togglePermission');
  return !error;
}

export async function addWorkflowState(wfId, stateName) {
  const { data: wf, error: e1 } = await supabase.from('workflows').select('states').eq('id', wfId).maybeSingle();
  if (e1 || !wf) return false;
  const states = [...(wf.states || []), stateName];
  const { error } = await supabase.from('workflows').update({ states }).eq('id', wfId);
  recordDbError(error, 'addWorkflowState');
  return !error;
}

export async function toggleWorkflowTransition(wfId, transId, field, value) {
  const { error } = await supabase.from('workflow_transitions').update({ [field]: value }).eq('id', transId);
  recordDbError(error, 'toggleWorkflowTransition');
  return !error;
}

export async function updateWorkflowTransition(transId, updates) {
  const { error } = await supabase.from('workflow_transitions').update(updates).eq('id', transId);
  recordDbError(error, 'updateWorkflowTransition');
  return !error;
}

export async function deleteWorkflowTransition(transId) {
  const { error } = await supabase.from('workflow_transitions').delete().eq('id', transId);
  recordDbError(error, 'deleteWorkflowTransition');
  return !error;
}

export async function updateWorkflowStates(wfId, states) {
  const { error } = await supabase.from('workflows').update({ states }).eq('id', wfId);
  recordDbError(error, 'updateWorkflowStates');
  return !error;
}

export async function updateWorkflowStepConfig(wfId, stepConfig) {
  const { error } = await supabase.from('workflows').update({ step_config: stepConfig }).eq('id', wfId);
  recordDbError(error, 'updateWorkflowStepConfig');
  return !error;
}

export async function saveChecklistResult(jobId, jobType, data) {
  const { error } = await supabase.from('checklist_results').upsert({
    job_id: jobId,
    job_type: jobType,
    checklist: data.checklist || {},
    supervisor: data.supervisor || false,
    notes: data.notes || '',
    parts: data.parts || [],
    step: data.step,
    technician: data.technician || '',
    step_checklists: data.step_checklists || {},
    submitted_step: data.submitted_step ?? null,
    skipped_steps: data.skipped_steps || [],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'job_id' });
  recordDbError(error, 'saveChecklistResult');
  return !error;
}

export async function addWorkOrder(w) {
  const { error } = await supabase.from('work_orders').insert(w);
  recordDbError(error, 'addWorkOrder');
  return !error;
}

export async function addServiceRequest(sr) {
  const { error } = await supabase.from('service_requests').insert(sr);
  recordDbError(error, 'addServiceRequest');
  return !error;
}

export async function generateServiceRequestId() {
  const { data, error } = await supabase.rpc('generate_sr_id');
  if (error) { recordDbError(error, 'generateServiceRequestId'); return null; }
  return data;
}

export async function addVendor(v) {
  const { error } = await supabase.from('vendors').insert(v);
  recordDbError(error, 'addVendor');
  return !error;
}

export async function addEquipment(e) {
  const { error } = await supabase.from('equipment').insert(e);
  recordDbError(error, 'addEquipment');
  return !error;
}

export async function addTechnician(t, userRow) {
  if (userRow) {
    const { error: userError } = await supabase.from('users').upsert(userRow, { onConflict: 'id' });
    if (userError) {
      recordDbError(userError, 'addTechnician user');
      return false;
    }
  }
  const { error } = await supabase.from('technicians').insert(t);
  recordDbError(error, 'addTechnician');
  return !error;
}

export async function updateTechnician(id, updates, userUpdates) {
  if (userUpdates) {
    const { error: userError } = await supabase.from('users').update(userUpdates).eq('id', id);
    if (userError) {
      recordDbError(userError, 'updateTechnician user');
      return false;
    }
  }
  const { error } = await supabase.from('technicians').update(updates).eq('id', id);
  recordDbError(error, 'updateTechnician');
  return !error;
}

export async function addWorkflow(w) {
  const { error } = await supabase.from('workflows').insert(w);
  recordDbError(error, 'addWorkflow');
  return !error;
}

export async function addWorkflowTransition(t) {
  const { error } = await supabase.from('workflow_transitions').insert(t);
  recordDbError(error, 'addWorkflowTransition');
  return !error;
}

export async function updateWorkflow(id, updates) {
  const { error } = await supabase.from('workflows').update(updates).eq('id', id);
  recordDbError(error, 'updateWorkflow');
  return !error;
}

export async function deleteWorkflow(id) {
  await supabase.from('workflow_transitions').delete().eq('workflow_id', id);
  const { error } = await supabase.from('workflows').delete().eq('id', id);
  recordDbError(error, 'deleteWorkflow');
  return !error;
}

export async function updateEquipment(id, updates) {
  const { error } = await supabase.from('equipment').update(updates).eq('id', id);
  recordDbError(error, 'updateEquipment');
  return !error;
}

export async function updateVendor(id, updates) {
  const { error } = await supabase.from('vendors').update(updates).eq('id', id);
  recordDbError(error, 'updateVendor');
  return !error;
}

export async function updateUser(id, updates) {
  const { error } = await supabase.from('users').update(updates).eq('id', id);
  recordDbError(error, 'updateUser');
  return !error;
}

export async function updateServiceRequest(id, updates) {
  const { error } = await supabase.from('service_requests').update(updates).eq('id', id);
  recordDbError(error, 'updateServiceRequest');
  return !error;
}

export async function deleteWorkOrder(id) {
  const { error } = await supabase.from('work_orders').delete().eq('id', id);
  recordDbError(error, 'deleteWorkOrder');
  return !error;
}

export async function deleteServiceRequest(id) {
  const { error } = await supabase.from('service_requests').delete().eq('id', id);
  recordDbError(error, 'deleteServiceRequest');
  return !error;
}

export async function deleteVendor(id) {
  const { error } = await supabase.from('vendors').delete().eq('id', id);
  recordDbError(error, 'deleteVendor');
  return !error;
}

export async function deleteEquipment(id) {
  const { error } = await supabase.from('equipment').delete().eq('id', id);
  recordDbError(error, 'deleteEquipment');
  return !error;
}

export async function deleteTechnician(id) {
  const { error } = await supabase.from('technicians').delete().eq('id', id);
  recordDbError(error, 'deleteTechnician');
  return !error;
}

export async function updateRole(id, updates) {
  const { error } = await supabase.from('roles').update(updates).eq('id', id);
  recordDbError(error, 'updateRole');
  return !error;
}

export async function deleteRole(id) {
  const { error } = await supabase.from('roles').delete().eq('id', id);
  recordDbError(error, 'deleteRole');
  return !error;
}

export async function addAuditLog(user, action, cat) {
  const now = new Date();
  const time = `Today · ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const { error } = await supabase.from('audit_logs').insert({ user_name: user, action, time, cat: cat || 'info' });
  recordDbError(error, 'addAuditLog');
  return !error;
}


export async function loadPMChecklistTemplates() {
  const { data, error } = await supabase.from('pm_checklist_templates').select('*').order('name');
  if (error) { console.error('loadPMChecklistTemplates', error); return []; }
  return data;
}

export async function addPMChecklistTemplate(t) {
  const { error } = await supabase.from('pm_checklist_templates').insert(t);
  recordDbError(error, 'addPMChecklistTemplate');
  return !error;
}

export async function updatePMChecklistTemplate(id, updates) {
  const { error } = await supabase.from('pm_checklist_templates').update(updates).eq('id', id);
  recordDbError(error, 'updatePMChecklistTemplate');
  return !error;
}

export async function deletePMChecklistTemplate(id) {
  const { error } = await supabase.from('pm_checklist_templates').delete().eq('id', id);
  recordDbError(error, 'deletePMChecklistTemplate');
  return !error;
}

// ============ WORKFLOW CHECKLIST TEMPLATES ============

export async function loadWorkflowChecklistTemplates() {
  const { data, error } = await supabase.from('workflow_checklist_templates').select('*').order('step_index');
  if (error) { console.error('loadWorkflowChecklistTemplates', error); return []; }
  return data;
}

export async function addWorkflowChecklistTemplate(t) {
  const { error } = await supabase.from('workflow_checklist_templates').insert(t);
  recordDbError(error, 'addWorkflowChecklistTemplate');
  return !error;
}

export async function updateWorkflowChecklistTemplate(id, updates) {
  const { error } = await supabase.from('workflow_checklist_templates').update(updates).eq('id', id);
  recordDbError(error, 'updateWorkflowChecklistTemplate');
  return !error;
}

export async function deleteWorkflowChecklistTemplate(id) {
  const { error } = await supabase.from('workflow_checklist_templates').delete().eq('id', id);
  recordDbError(error, 'deleteWorkflowChecklistTemplate');
  return !error;
}

export async function addPMWorkOrder(pm) {
  const { error } = await supabase.from('pm_work_orders').insert(pm);
  recordDbError(error, 'addPMWorkOrder');
  return !error;
}

// ============ PM PLANS ============

export async function loadPMPlans() {
  const { data, error } = await supabase.from('pm_plans').select('*').order('created_at', { ascending: false });
  if (error) { console.error('loadPMPlans', error); return []; }
  return data;
}

export async function addPMPlan(plan) {
  const { error } = await supabase.from('pm_plans').insert(plan);
  recordDbError(error, 'addPMPlan');
  return !error;
}

export async function updatePMPlan(id, updates) {
  const { error } = await supabase.from('pm_plans').update(updates).eq('id', id);
  recordDbError(error, 'updatePMPlan');
  return !error;
}

export async function deletePMPlan(id) {
  const { error } = await supabase.from('pm_plans').delete().eq('id', id);
  recordDbError(error, 'deletePMPlan');
  return !error;
}

// ============ EQUIPMENT DOCUMENTS ============

export async function loadEquipmentDocuments(eqId) {
  const { data, error } = await supabase
    .from('equipment_documents')
    .select('*')
    .eq('eq_id', eqId)
    .order('uploaded_at', { ascending: false });
  if (error) { console.error('loadEquipmentDocuments', error); return []; }
  return data;
}

export async function uploadEquipmentDocument(eqId, file, uploadedBy) {
  const ext = file.name.split('.').pop();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${eqId}/${Date.now()}_${safeName}`;
  const { error: upErr } = await supabase.storage
    .from('equipment-docs')
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (upErr) { recordDbError(upErr, 'uploadEquipmentDocument'); return null; }
  const { data, error } = await supabase.from('equipment_documents').insert({
    eq_id: eqId,
    name: file.name,
    storage_path: storagePath,
    mime_type: file.type || ext,
    size: file.size,
  }).select().single();
  if (error) { recordDbError(error, 'uploadEquipmentDocument insert'); return null; }
  return data;
}

export async function getDocumentDownloadUrl(storagePath) {
  const { data, error } = await supabase.storage
    .from('equipment-docs')
    .createSignedUrl(storagePath, 3600);
  if (error) { recordDbError(error, 'getDocumentDownloadUrl'); return null; }
  return data.signedUrl;
}

// ============ PART REQUESTS ============

export async function loadPartRequests() {
  const { data, error } = await supabase.from('part_requests').select('*').order('created_at', { ascending: false });
  if (error) { console.error('loadPartRequests', error); return []; }
  return data;
}

export async function addPartRequest(pr) {
  const { error } = await supabase.from('part_requests').insert(pr);
  recordDbError(error, 'addPartRequest');
  return !error;
}

export async function updatePartRequest(id, updates) {
  const { error } = await supabase.from('part_requests').update(updates).eq('id', id);
  recordDbError(error, 'updatePartRequest');
  return !error;
}

// ============ WORK ORDER ESCALATIONS ============

export async function loadEscalations() {
  const { data, error } = await supabase.from('work_order_escalations').select('*').order('created_at', { ascending: false });
  if (error) { console.error('loadEscalations', error); return []; }
  return data;
}

export async function addEscalation(esc) {
  const { error } = await supabase.from('work_order_escalations').insert(esc);
  recordDbError(error, 'addEscalation');
  return !error;
}

export async function updateEscalation(id, updates) {
  const { error } = await supabase.from('work_order_escalations').update(updates).eq('id', id);
  recordDbError(error, 'updateEscalation');
  return !error;
}

// ============ ESCALATION GROUPS ============

export async function loadEscalationGroups() {
  const { data, error } = await supabase.from('escalation_groups').select('*').order('name');
  if (error) { console.error('loadEscalationGroups', error); return []; }
  return data;
}

export async function loadEscalationGroupMembers() {
  const { data, error } = await supabase.from('escalation_group_members').select('*');
  if (error) { console.error('loadEscalationGroupMembers', error); return []; }
  return data;
}

export async function addEscalationGroup(g) {
  const { error } = await supabase.from('escalation_groups').insert(g);
  recordDbError(error, 'addEscalationGroup');
  return !error;
}

export async function updateEscalationGroup(id, updates) {
  const { error } = await supabase.from('escalation_groups').update(updates).eq('id', id);
  recordDbError(error, 'updateEscalationGroup');
  return !error;
}

export async function deleteEscalationGroup(id) {
  const { error } = await supabase.from('escalation_groups').delete().eq('id', id);
  recordDbError(error, 'deleteEscalationGroup');
  return !error;
}

export async function addEscalationGroupMember(groupId, userId) {
  const { error } = await supabase.from('escalation_group_members').insert({ group_id: groupId, user_id: userId });
  recordDbError(error, 'addEscalationGroupMember');
  return !error;
}

export async function removeEscalationGroupMember(groupId, userId) {
  const { error } = await supabase.from('escalation_group_members').delete().eq('group_id', groupId).eq('user_id', userId);
  recordDbError(error, 'removeEscalationGroupMember');
  return !error;
}

// ============ NOTIFICATIONS ============

export async function loadNotifications() {
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) { console.error('loadNotifications', error); return []; }
  return data;
}

export async function addNotification(n) {
  const { error } = await supabase.from('notifications').insert(n);
  recordDbError(error, 'addNotification');
  return !error;
}

export async function loadNotificationReads(userId) {
  if (!userId) return [];
  const { data, error } = await supabase.from('notification_reads').select('notification_id').eq('user_id', userId);
  if (error) { console.error('loadNotificationReads', error); return []; }
  return data.map(r => r.notification_id);
}

export async function markNotificationReadForUser(id, userId) {
  if (!userId || !id) return false;
  const { error } = await supabase.from('notification_reads').upsert({ notification_id: id, user_id: userId, read_at: new Date().toISOString() });
  recordDbError(error, 'markNotificationReadForUser');
  return !error;
}

export async function markAllNotificationsReadForUser(notificationIds, userId) {
  if (!userId || !notificationIds.length) return false;
  const rows = notificationIds.map(id => ({ notification_id: id, user_id: userId, read_at: new Date().toISOString() }));
  const { error } = await supabase.from('notification_reads').upsert(rows);
  recordDbError(error, 'markAllNotificationsReadForUser');
  return !error;
}

// ============ EMAIL NOTIFICATIONS ============

export async function loadEmailNotifications() {
  const { data, error } = await supabase.from('email_notifications').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) { console.error('loadEmailNotifications', error); return []; }
  return data;
}

export async function addEmailNotification(e) {
  const { data, error } = await supabase.from('email_notifications').insert(e).select().single();
  recordDbError(error, 'addEmailNotification');
  if (error) return null;
  return data;
}

export async function updateEmailNotification(id, updates) {
  const { error } = await supabase.from('email_notifications').update(updates).eq('id', id);
  recordDbError(error, 'updateEmailNotification');
  return !error;
}

export async function createEmailToken(entityType, entityId, userEmail) {
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
  const { data, error } = await supabase.from('email_tokens').insert({
    token,
    entity_type: entityType,
    entity_id: entityId,
    user_email: userEmail || null,
  }).select().single();
  recordDbError(error, 'createEmailToken');
  if (error) return null;
  return token;
}

export async function verifyEmailToken(token) {
  const { data, error } = await supabase.from('email_tokens')
    .select('*')
    .eq('token', token)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) { recordDbError(error, 'verifyEmailToken'); return null; }
  if (!data) return null;
  await supabase.from('email_tokens').update({ used: true }).eq('id', data.id);
  return data;
}

export async function addPart(p) {
  const { error } = await supabase.from('parts').insert(p);
  recordDbError(error, 'addPart');
  return !error;
}

export async function deleteEquipmentDocument(docId) {
  const { data: doc, error: fetchErr } = await supabase
    .from('equipment_documents')
    .select('storage_path')
    .eq('id', docId)
    .maybeSingle();
  if (fetchErr || !doc) { recordDbError(fetchErr, 'deleteEquipmentDocument fetch'); return false; }
  if (doc.storage_path) {
    const { error: delErr } = await supabase.storage
      .from('equipment-docs')
      .remove([doc.storage_path]);
    if (delErr) console.error('deleteEquipmentDocument storage', delErr);
  }
  const { error } = await supabase.from('equipment_documents').delete().eq('id', docId);
  recordDbError(error, 'deleteEquipmentDocument');
  return !error;
}

// ============ DEPARTMENTS ============

export async function loadDepartments() {
  const { data, error } = await supabase.from('departments').select('*').order('name');
  if (error) { console.error('loadDepartments', error); return []; }
  return data;
}

export async function addDepartment(d) {
  const { error } = await supabase.from('departments').insert(d);
  recordDbError(error, 'addDepartment');
  return !error;
}

export async function updateDepartment(id, updates) {
  const { error } = await supabase.from('departments').update(updates).eq('id', id);
  recordDbError(error, 'updateDepartment');
  return !error;
}

export async function deleteDepartment(id) {
  await supabase.from('department_roles').delete().eq('department_id', id);
  const { error } = await supabase.from('departments').delete().eq('id', id);
  recordDbError(error, 'deleteDepartment');
  return !error;
}

export async function loadDepartmentRoles() {
  const { data, error } = await supabase.from('department_roles').select('*');
  if (error) { console.error('loadDepartmentRoles', error); return []; }
  return data;
}

export async function addDepartmentRole(departmentId, roleId) {
  const { error } = await supabase.from('department_roles').insert({ department_id: departmentId, role_id: roleId });
  recordDbError(error, 'addDepartmentRole');
  return !error;
}

export async function removeDepartmentRole(departmentId, roleId) {
  const { error } = await supabase.from('department_roles').delete().eq('department_id', departmentId).eq('role_id', roleId);
  recordDbError(error, 'removeDepartmentRole');
  return !error;
}

// ============ PM HISTORY ============

export async function loadPMHistory(pmWorkOrderId) {
  const { data, error } = await supabase.from('pm_history').select('*').eq('pm_work_order_id', pmWorkOrderId).order('completed_at', { ascending: false });
  if (error) { console.error('loadPMHistory', error); return []; }
  return data;
}

export async function loadPMHistoryForEquipment(eqId) {
  const { data, error } = await supabase.from('pm_history').select('*').eq('eq_id', eqId).order('completed_at', { ascending: false });
  if (error) { console.error('loadPMHistoryForEquipment', error); return []; }
  return data;
}

export async function loadAllPMHistory() {
  const { data, error } = await supabase.from('pm_history').select('*').order('completed_at', { ascending: false });
  if (error) { console.error('loadAllPMHistory', error); return []; }
  return data;
}

export async function addPMHistory(record) {
  const { data, error } = await supabase.from('pm_history').insert(record).select().single();
  recordDbError(error, 'addPMHistory');
  if (error) return null;
  return data;
}

// ============ SLA CONFIG ============

export async function loadSLAConfig() {
  const { data, error } = await supabase.from('sla_config').select('*').order('priority');
  if (error) { console.error('loadSLAConfig', error); return []; }
  return data;
}

export async function updateSLAConfig(priority, updates) {
  const { error } = await supabase.from('sla_config').update(updates).eq('priority', priority);
  recordDbError(error, 'updateSLAConfig');
  return !error;
}

export const SLA_DEFAULTS = [
  { priority: 'P1', label: 'Emergency', target_hours: 4, warning_pct: 75, color: 'var(--crit)' },
  { priority: 'P2', label: 'Urgent', target_hours: 8, warning_pct: 75, color: 'var(--warn)' },
  { priority: 'P3', label: 'Standard', target_hours: 24, warning_pct: 75, color: 'var(--info)' },
  { priority: 'P4', label: 'Low Priority', target_hours: 72, warning_pct: 75, color: 'var(--text-3)' },
];

export function computeSLA(w, slaConfig) {
  const cfg = (slaConfig || SLA_DEFAULTS).find(c => c.priority === w.pri) || SLA_DEFAULTS[2];
  const targetMs = cfg.target_hours * 3600000;
  const openedDate = w.opened ? new Date(w.opened) : new Date();
  const dueDate = w.due ? new Date(w.due) : new Date(openedDate.getTime() + targetMs);
  const now = new Date();
  if (w.status === 'closed') {
    const closedAt = (w.closeout_history && w.closeout_history.length)
      ? new Date(w.closeout_history[w.closeout_history.length - 1].timestamp)
      : now;
    const elapsed = closedAt - openedDate;
    const pct = Math.min(100, Math.round(elapsed / targetMs * 100));
    const met = elapsed <= targetMs;
    return { pct: 100, sla: met ? 'Met' : 'Breached', met, elapsedHours: Math.round(elapsed / 3600000 * 10) / 10, targetHours: cfg.target_hours };
  }
  const elapsed = now - openedDate;
  const pct = Math.min(100, Math.round(elapsed / targetMs * 100));
  const sla = pct >= 100 ? 'Breached' : pct >= cfg.warning_pct ? 'At risk' : 'On track';
  return { pct, sla, met: false, elapsedHours: Math.round(elapsed / 3600000 * 10) / 10, targetHours: cfg.target_hours };
}

// ============ CRITICALITY LEVELS ============

export async function loadCriticalityLevels() {
  const { data, error } = await supabase.from('criticality_levels').select('*').order('sort_order');
  if (error) { console.error('loadCriticalityLevels', error); return []; }
  return data;
}

export async function addCriticalityLevel(c) {
  const { error } = await supabase.from('criticality_levels').insert(c);
  recordDbError(error, 'addCriticalityLevel');
  return !error;
}

export async function updateCriticalityLevel(id, updates) {
  const { error } = await supabase.from('criticality_levels').update(updates).eq('id', id);
  recordDbError(error, 'updateCriticalityLevel');
  return !error;
}

export async function deleteCriticalityLevel(id) {
  const { error } = await supabase.from('criticality_levels').delete().eq('id', id);
  recordDbError(error, 'deleteCriticalityLevel');
  return !error;
}

// ============ PRIORITIES ============

export async function loadPriorities() {
  const { data, error } = await supabase.from('priorities').select('*').order('sort_order');
  if (error) { console.error('loadPriorities', error); return []; }
  return data;
}

export async function addPriority(p) {
  const { error } = await supabase.from('priorities').insert(p);
  recordDbError(error, 'addPriority');
  return !error;
}

export async function updatePriority(priority, updates) {
  const { error } = await supabase.from('priorities').update(updates).eq('priority', priority);
  recordDbError(error, 'updatePriority');
  return !error;
}

export async function deletePriority(priority) {
  const { error } = await supabase.from('priorities').delete().eq('priority', priority);
  recordDbError(error, 'deletePriority');
  return !error;
}

// ============ ASSET CATEGORIES ============

export async function loadAssetCategories() {
  const { data, error } = await supabase.from('asset_categories').select('*').order('category');
  if (error) { console.error('loadAssetCategories', error); return []; }
  return data;
}

export async function addAssetCategory(c) {
  const { error } = await supabase.from('asset_categories').insert(c);
  recordDbError(error, 'addAssetCategory');
  return !error;
}

export async function updateAssetCategory(id, updates) {
  const { error } = await supabase.from('asset_categories').update(updates).eq('id', id);
  recordDbError(error, 'updateAssetCategory');
  return !error;
}

export async function deleteAssetCategory(id) {
  const { error } = await supabase.from('asset_categories').delete().eq('id', id);
  recordDbError(error, 'deleteAssetCategory');
  return !error;
}

// ============ PM FREQUENCIES ============

export async function loadPMFrequencies() {
  const { data, error } = await supabase.from('pm_frequencies').select('*').order('sort_order');
  if (error) { console.error('loadPMFrequencies', error); return []; }
  return data;
}

export async function addPMFrequency(f) {
  const { error } = await supabase.from('pm_frequencies').insert(f);
  recordDbError(error, 'addPMFrequency');
  return !error;
}

export async function updatePMFrequency(id, updates) {
  const { error } = await supabase.from('pm_frequencies').update(updates).eq('id', id);
  recordDbError(error, 'updatePMFrequency');
  return !error;
}

export async function deletePMFrequency(id) {
  const { error } = await supabase.from('pm_frequencies').delete().eq('id', id);
  recordDbError(error, 'deletePMFrequency');
  return !error;
}

// ============ SYSTEM SETTINGS ============

export async function loadSystemSettings() {
  const { data, error } = await supabase.from('system_settings').select('*').order('key');
  if (error) { console.error('loadSystemSettings', error); return []; }
  return data;
}

export async function upsertSystemSetting(key, value, category) {
  const { error } = await supabase.from('system_settings').upsert({ key, value, category: category || 'general' }, { onConflict: 'key' });
  recordDbError(error, 'upsertSystemSetting');
  return !error;
}

export async function deleteSystemSetting(key) {
  const { error } = await supabase.from('system_settings').delete().eq('key', key);
  recordDbError(error, 'deleteSystemSetting');
  return !error;
}

// ============ DYNAMIC PM COMPLIANCE ============

export function computePMCompliance(equipment, pmWorkOrders) {
  if (!equipment.length) return 0;
  let total = 0;
  let count = 0;
  for (const eq of equipment) {
    const pms = pmWorkOrders.filter(p => p.eq_id === eq.id);
    if (!pms.length) {
      total += 100;
      count++;
    } else {
      const completed = pms.filter(p => p.status === 'completed').length;
      total += Math.round(completed / pms.length * 100);
      count++;
    }
  }
  return count ? Math.round(total / count) : 0;
}

// ============ DYNAMIC EQUIPMENT UPTIME ============

export function computeUptime(equipment, workOrders) {
  if (!equipment.length) return 100;
  const downEqIds = new Set(
    workOrders
      .filter(w => w.status !== 'closed' && w.eq_id)
      .map(w => w.eq_id)
  );
  const operational = equipment.filter(e => !downEqIds.has(e.id) && e.status !== 'outofsvc' && e.status !== 'quarantine').length;
  return Math.round(operational / equipment.length * 1000) / 10;
}

// ============ SERVICE REQUEST PHOTOS ============

export async function loadSRPhotos(srId) {
  const { data, error } = await supabase
    .from('service_request_photos')
    .select('*')
    .eq('sr_id', srId)
    .order('uploaded_at', { ascending: true });
  if (error) { console.error('loadSRPhotos', error); return []; }
  return data;
}

export async function uploadSRPhoto(srId, file, uploadedBy) {
  const safeName = (file.name || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${srId}/${Date.now()}_${safeName}`;
  const { error: upErr } = await supabase.storage
    .from('sr-photos')
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (upErr) { recordDbError(upErr, 'uploadSRPhoto'); return null; }
  const { data, error } = await supabase
    .from('service_request_photos')
    .insert({
      sr_id: srId,
      storage_path: storagePath,
      name: file.name,
      mime_type: file.type,
      size: file.size,
      uploaded_by: uploadedBy || 'Unknown',
    })
    .select('id')
    .single();
  if (error) { recordDbError(error, 'uploadSRPhoto'); return null; }
  return data.id;
}

export function getSRPhotoUrl(storagePath) {
  const { data } = supabase.storage
    .from('sr-photos')
    .getPublicUrl(storagePath);
  return data?.publicUrl || '';
}

export async function deleteSRPhoto(photoId, storagePath) {
  await supabase.storage.from('sr-photos').remove([storagePath]);
  const { error } = await supabase
    .from('service_request_photos')
    .delete()
    .eq('id', photoId);
  if (error) { recordDbError(error, 'deleteSRPhoto'); return false; }
  return true;
}

// ============ EQUIPMENT RECALLS ============

export async function loadEquipmentRecalls(eqId) {
  const { data, error } = await supabase
    .from('equipment_recalls')
    .select('*')
    .eq('eq_id', eqId)
    .order('created_at', { ascending: false });
  if (error) { console.error('loadEquipmentRecalls', error); return []; }
  return data;
}

export async function loadAllEquipmentRecalls() {
  const { data, error } = await supabase
    .from('equipment_recalls')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('loadAllEquipmentRecalls', error); return []; }
  return data;
}

export async function addEquipmentRecall(recall) {
  const { data, error } = await supabase
    .from('equipment_recalls')
    .insert(recall)
    .select('id')
    .single();
  if (error) { recordDbError(error, 'addEquipmentRecall'); return null; }
  return data.id;
}

export async function updateEquipmentRecall(id, updates) {
  const { error } = await supabase
    .from('equipment_recalls')
    .update(updates)
    .eq('id', id);
  recordDbError(error, 'updateEquipmentRecall');
  return !error;
}

export async function deleteEquipmentRecall(id) {
  const { error } = await supabase
    .from('equipment_recalls')
    .delete()
    .eq('id', id);
  recordDbError(error, 'deleteEquipmentRecall');
  return !error;
}

// ============ RECALL DOCUMENTS ============

export async function loadRecallDocuments(recallId) {
  const { data, error } = await supabase
    .from('recall_documents')
    .select('*')
    .eq('recall_id', recallId)
    .order('uploaded_at', { ascending: false });
  if (error) { console.error('loadRecallDocuments', error); return []; }
  return data;
}

export async function uploadRecallDocument(recallId, file, uploadedBy) {
  const safeName = (file.name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${recallId}/${Date.now()}_${safeName}`;
  const { error: upErr } = await supabase.storage
    .from('recall-docs')
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (upErr) { recordDbError(upErr, 'uploadRecallDocument'); return null; }
  const { data, error } = await supabase.from('recall_documents').insert({
    recall_id: recallId,
    file_name: file.name,
    storage_path: storagePath,
    file_type: file.type,
    file_size: file.size,
    uploaded_by: uploadedBy || 'Admin',
  }).select('id').single();
  if (error) { recordDbError(error, 'uploadRecallDocument insert'); return null; }
  return data.id;
}

export async function getRecallDocumentDownloadUrl(storagePath) {
  const { data, error } = await supabase.storage
    .from('recall-docs')
    .createSignedUrl(storagePath, 3600);
  if (error) { recordDbError(error, 'getRecallDocumentDownloadUrl'); return null; }
  return data.signedUrl;
}

export async function deleteRecallDocument(docId) {
  const { data: doc, error: fetchErr } = await supabase
    .from('recall_documents')
    .select('storage_path')
    .eq('id', docId)
    .maybeSingle();
  if (fetchErr || !doc) { recordDbError(fetchErr, 'deleteRecallDocument fetch'); return false; }
  if (doc.storage_path) {
    const { error: delErr } = await supabase.storage
      .from('recall-docs')
      .remove([doc.storage_path]);
    if (delErr) console.error('deleteRecallDocument storage', delErr);
  }
  const { error } = await supabase.from('recall_documents').delete().eq('id', docId);
  recordDbError(error, 'deleteRecallDocument');
  return !error;
}

/* ================= DOWNTIME TRACKING ================= */

export async function loadDowntimeEvents() {
  const { data, error } = await supabase
    .from('downtime_events')
    .select('*')
    .order('start_time', { ascending: false });
  if (error) { console.error('loadDowntimeEvents', error); return []; }
  return data;
}

export async function loadOpenDowntimeForEquipment(eqId) {
  const { data, error } = await supabase
    .from('downtime_events')
    .select('*')
    .eq('eq_id', eqId)
    .eq('status', 'open')
    .order('start_time', { ascending: false });
  if (error) { console.error('loadOpenDowntimeForEquipment', error); return []; }
  return data;
}

export async function startDowntimeEvent(eqId, workOrderId, reason) {
  const { data, error } = await supabase
    .from('downtime_events')
    .insert({
      eq_id: eqId,
      work_order_id: workOrderId || null,
      reason: reason || '',
      status: 'open',
      start_time: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) { console.error('startDowntimeEvent', error); return null; }
  return data;
}

export async function endDowntimeEvent(eventId) {
  const now = new Date().toISOString();
  const { data: evt, error: fetchErr } = await supabase
    .from('downtime_events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();
  if (fetchErr || !evt) { console.error('endDowntimeEvent fetch', fetchErr); return false; }
  const start = new Date(evt.start_time);
  const end = new Date(now);
  const durationHours = Math.round((end - start) / 36e5 * 10) / 10;
  const { error } = await supabase
    .from('downtime_events')
    .update({ end_time: now, duration_hours: durationHours, status: 'resolved' })
    .eq('id', eventId);
  if (error) { console.error('endDowntimeEvent', error); return false; }
  return true;
}

export async function endAllOpenDowntimeForEquipment(eqId) {
  const { data: events, error: fetchErr } = await supabase
    .from('downtime_events')
    .select('*')
    .eq('eq_id', eqId)
    .eq('status', 'open');
  if (fetchErr) { console.error('endAllOpenDowntimeForEquipment', fetchErr); return false; }
  if (!events || !events.length) return true;
  const now = new Date().toISOString();
  for (const evt of events) {
    const start = new Date(evt.start_time);
    const end = new Date(now);
    const durationHours = Math.round((end - start) / 36e5 * 10) / 10;
    await supabase
      .from('downtime_events')
      .update({ end_time: now, duration_hours: durationHours, status: 'resolved' })
      .eq('id', evt.id);
  }
  return true;
}

/* ================= TECHNICIAN TIME-OFF ================= */

export async function loadTechTimeoff() {
  const { data, error } = await supabase
    .from('technician_timeoff')
    .select('*')
    .order('start_date', { ascending: false });
  if (error) { console.error('loadTechTimeoff', error); return []; }
  return data;
}

export async function addTechTimeoff(record) {
  const { data, error } = await supabase
    .from('technician_timeoff')
    .insert(record)
    .select('id')
    .single();
  if (error) { recordDbError(error, 'addTechTimeoff'); return null; }
  return data.id;
}

export async function deleteTechTimeoff(id) {
  const { error } = await supabase
    .from('technician_timeoff')
    .delete()
    .eq('id', id);
  recordDbError(error, 'deleteTechTimeoff');
  return !error;
}

/* ================= ASSET OWNERSHIP TYPES ================= */

export async function loadOwnershipTypes() {
  const { data, error } = await supabase
    .from('asset_ownership_types')
    .select('*')
    .order('sort_order');
  if (error) { console.error('loadOwnershipTypes', error); return []; }
  return data;
}

export async function addOwnershipType(t) {
  const { error } = await supabase
    .from('asset_ownership_types')
    .insert(t);
  recordDbError(error, 'addOwnershipType');
  return !error;
}

export async function deleteOwnershipType(id) {
  const { error } = await supabase
    .from('asset_ownership_types')
    .delete()
    .eq('id', id);
  recordDbError(error, 'deleteOwnershipType');
  return !error;
}


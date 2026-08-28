import { supabase } from './supabase.js';

export const HOSP = 'Cedar Ridge Medical Center';
export const TODAY = '2026-08-28';

export const CRIT = {
  life: { l: 'Life Support', c: 'crit' },
  high: { l: 'High Risk', c: 'warn' },
  med: { l: 'Medium', c: 'info' },
  low: { l: 'Low', c: 'muted' },
};

export function critColor(k) {
  return { life: 'var(--crit)', high: 'var(--warn)', med: 'var(--info)', low: 'var(--text-3)' }[k];
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
  closed: { l: 'Closed', c: 'p-ok' },
};

export const USTAT = {
  active: { l: 'Active', c: 'p-ok' },
  invited: { l: 'Invited', c: 'p-warn' },
  disabled: { l: 'Disabled', c: 'p-muted' },
};

export const MODULES = ['Equipment', 'Work Orders', 'Preventive PM', 'Calibration', 'Spare Parts', 'Vendors', 'Reports', 'Configuration', 'Users & Roles'];
export const ACTIONS = ['View', 'Create', 'Edit', 'Approve', 'Delete'];

export const SKILL_AREAS = ['Ventilators', 'Defibrillators', 'Patient Monitors', 'Infusion Pumps', 'MRI', 'CT', 'Ultrasound', 'X-Ray', 'Sterilizers', 'HVAC', 'Generators', 'Medical Gases'];

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

export async function loadTechnicians() {
  const { data, error } = await supabase.from('technicians').select('*').order('name');
  if (error) { console.error('loadTechnicians', error); return []; }
  return data;
}

export async function loadRoles() {
  const { data, error } = await supabase.from('roles').select('*').order('name');
  if (error) { console.error('loadRoles', error); return []; }
  return data;
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

export async function loadServiceRequests() {
  const { data, error } = await supabase.from('service_requests').select('*').order('time');
  if (error) { console.error('loadServiceRequests', error); return []; }
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
  if (error) console.error('saveEquipment', error);
  return !error;
}

export async function updateWorkOrder(id, updates) {
  const { error } = await supabase.from('work_orders').update(updates).eq('id', id);
  if (error) console.error('updateWorkOrder', error);
  return !error;
}

export async function updatePart(id, updates) {
  const { error } = await supabase.from('parts').update(updates).eq('id', id);
  if (error) console.error('updatePart', error);
  return !error;
}

export async function updatePMWorkOrder(id, updates) {
  const { error } = await supabase.from('pm_work_orders').update(updates).eq('id', id);
  if (error) console.error('updatePMWorkOrder', error);
  return !error;
}

export async function addUser(u) {
  const { error } = await supabase.from('users').insert(u);
  if (error) console.error('addUser', error);
  return !error;
}

export async function addRole(r) {
  const { error } = await supabase.from('roles').insert(r);
  if (error) console.error('addRole', error);
  return !error;
}

export async function togglePermission(roleId, mod, act, allowed) {
  const { error } = await supabase
    .from('permissions')
    .update({ allowed })
    .eq('role_id', roleId)
    .eq('module', mod)
    .eq('action', act);
  if (error) console.error('togglePermission', error);
  return !error;
}

export async function addWorkflowState(wfId, stateName) {
  const { data: wf, error: e1 } = await supabase.from('workflows').select('states').eq('id', wfId).maybeSingle();
  if (e1 || !wf) return false;
  const states = [...(wf.states || []), stateName];
  const { error } = await supabase.from('workflows').update({ states }).eq('id', wfId);
  if (error) console.error('addWorkflowState', error);
  return !error;
}

export async function toggleWorkflowTransition(wfId, transId, field, value) {
  const { error } = await supabase.from('workflow_transitions').update({ [field]: value }).eq('id', transId);
  if (error) console.error('toggleWorkflowTransition', error);
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
    updated_at: new Date().toISOString(),
  }, { onConflict: 'job_id' });
  if (error) console.error('saveChecklistResult', error);
  return !error;
}

export async function addWorkOrder(w) {
  const { error } = await supabase.from('work_orders').insert(w);
  if (error) console.error('addWorkOrder', error);
  return !error;
}

export async function addServiceRequest(sr) {
  const { error } = await supabase.from('service_requests').insert(sr);
  if (error) console.error('addServiceRequest', error);
  return !error;
}

export async function addVendor(v) {
  const { error } = await supabase.from('vendors').insert(v);
  if (error) console.error('addVendor', error);
  return !error;
}

export async function addEquipment(e) {
  const { error } = await supabase.from('equipment').insert(e);
  if (error) console.error('addEquipment', error);
  return !error;
}

export async function addAuditLog(user, action, cat) {
  const now = new Date();
  const time = `Today · ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const { error } = await supabase.from('audit_logs').insert({ user_name: user, action, time, cat: cat || 'info' });
  if (error) console.error('addAuditLog', error);
  return !error;
}

import { supabase } from './supabase.js';

export const HOSP = 'Cedar Ridge Medical Center';
export const TODAY = '2026-08-28';
export let LAST_DB_ERROR = '';

function recordDbError(error, label) {
  LAST_DB_ERROR = error?.message || label;
  if (error) console.error(label, error);
}

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

export const MODULES = ['Equipment', 'Work Orders', 'Service Requests', 'Preventive PM', 'Calibration', 'Spare Parts', 'Vendors', 'Reports', 'Configuration', 'Users & Roles'];
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
  recordDbError(error, 'saveEquipment');
  return !error;
}

export async function updateWorkOrder(id, updates) {
  const { error } = await supabase.from('work_orders').update(updates).eq('id', id);
  recordDbError(error, 'updateWorkOrder');
  return !error;
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

export async function addTechnician(t) {
  const { error: userError } = await supabase.from('users').upsert({
    id: t.id,
    name: t.name,
    email: `${t.id.toLowerCase()}@cedarridge.org`,
    role: 'Technician',
    scope: 'Main Campus',
    status: 'active',
    last_active: 'Now',
    mfa: true,
  }, { onConflict: 'id' });
  if (userError) {
    recordDbError(userError, 'addTechnician user');
    return false;
  }
  const { error } = await supabase.from('technicians').insert(t);
  recordDbError(error, 'addTechnician');
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

export async function markNotificationRead(id) {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  recordDbError(error, 'markNotificationRead');
  return !error;
}

export async function markAllNotificationsRead() {
  const { error } = await supabase.from('notifications').update({ read: true }).neq('read', true);
  recordDbError(error, 'markAllNotificationsRead');
  return !error;
}

// ============ EMAIL NOTIFICATIONS ============

export async function loadEmailNotifications() {
  const { data, error } = await supabase.from('email_notifications').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) { console.error('loadEmailNotifications', error); return []; }
  return data;
}

export async function addEmailNotification(e) {
  const { error } = await supabase.from('email_notifications').insert(e);
  recordDbError(error, 'addEmailNotification');
  return !error;
}

export async function updateEmailNotification(id, updates) {
  const { error } = await supabase.from('email_notifications').update(updates).eq('id', id);
  recordDbError(error, 'updateEmailNotification');
  return !error;
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


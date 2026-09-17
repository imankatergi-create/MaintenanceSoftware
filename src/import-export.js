import * as XLSX from 'xlsx';
import { supabase } from './supabase.js';

// Table configs: sheet name, table name, columns to export/import (excluding auto-managed fields)
const SKIP_COLS = ['created_at', 'auth_id', 'must_change_password', 'temp_password'];

const TABLE_CONFIGS = [
  {
    sheet: 'Equipment',
    table: 'equipment',
    pk: 'id',
    columns: ['id', 'tag', 'name', 'model', 'mfr', 'cat', 'ic', 'dept', 'loc', 'status', 'crit', 'risk', 'pm', 'next_pm', 'warranty', 'warranty_exp', 'cal_due', 'age', 'cost', 'serial', 'sla', 'qr_code', 'barcode_id', 'track_downtime', 'downtime_limit_hours', 'asset_ownership', 'depreciation', 'flagged', 'ownership_type', 'depreciation_years', 'depreciation_method', 'acquisition_date', 'salvage_value', 'active', 'cal_standard', 'cal_interval'],
  importColumns: ['id', 'tag', 'name', 'model', 'mfr', 'cat', 'ic', 'dept', 'loc', 'status', 'crit', 'risk', 'pm', 'next_pm', 'warranty', 'warranty_exp', 'cal_due', 'age', 'cost', 'serial', 'sla', 'qr_code', 'barcode_id', 'track_downtime', 'downtime_limit_hours', 'asset_ownership', 'depreciation', 'flagged', 'ownership_type', 'depreciation_years', 'depreciation_method', 'acquisition_date', 'salvage_value', 'active', 'cal_standard', 'cal_interval'],
  upsert: true,
  onConflict: 'id',
  note: 'Equipment ID is required and must be unique. QR code is auto-generated as VIT-<id> if left blank.',
  importNote: 'Existing equipment with matching ID will be updated. New rows will be inserted.',
  sampleRows: [
    { id: 'EQ-100001', tag: 'US-001', name: 'Example Ultrasound', model: 'Model X', mfr: 'Philips', cat: 'Diagnostic', ic: 'asset', dept: 'Radiology', loc: 'Room 101', status: 'available', crit: 'med', risk: 50, pm: 90, next_pm: '', warranty: 'Active', warranty_exp: '', cal_due: '', age: 1, cost: 50000, serial: 'SN12345', sla: 'P3', qr_code: '', barcode_id: '', track_downtime: false, downtime_limit_hours: 0, asset_ownership: '', depreciation: 0, flagged: false, ownership_type: '', depreciation_years: 5, depreciation_method: 'straight-line', acquisition_date: '', salvage_value: 0, active: true, cal_standard: '', cal_interval: '' },
  ],
  },
  {
    sheet: 'Users',
    table: 'users',
    pk: 'id',
    columns: ['id', 'name', 'email', 'role', 'scope', 'status', 'supervised_team', 'dept'],
    importColumns: ['id', 'name', 'email', 'role', 'scope', 'status', 'supervised_team', 'dept'],
    upsert: true,
    onConflict: 'id',
    note: 'User ID is required. Auth-linked columns (auth_id, password) are excluded — use the Users page to manage authentication.',
    importNote: 'Existing users with matching ID will be updated. New users will be inserted (but won\'t have auth accounts — use "Invite User" for that).',
    sampleRows: [
      { id: 'U-001', name: 'John Doe', email: 'john@hospital.org', role: 'Biomedical Engineer', scope: '', status: 'active', supervised_team: '', dept: 'Biomedical' },
    ],
  },
  {
    sheet: 'Departments',
    table: 'departments',
    pk: 'id',
    columns: ['id', 'name', 'description'],
    importColumns: ['id', 'name', 'description'],
    upsert: true,
    onConflict: 'id',
    note: 'Department ID is required and must be unique.',
    importNote: 'Existing departments with matching ID will be updated. New ones will be inserted.',
    sampleRows: [
      { id: 'dept-001', name: 'Radiology', description: 'Diagnostic imaging department' },
    ],
  },
  {
    sheet: 'Spare Parts',
    table: 'parts',
    pk: 'id',
    columns: ['id', 'name', 'mfr', 'cat', 'qty', 'min_qty', 'max_qty', 'bin', 'cost', 'crit', 'asset_id', 'sap_po_number', 'active'],
    importColumns: ['id', 'name', 'mfr', 'cat', 'qty', 'min_qty', 'max_qty', 'bin', 'cost', 'crit', 'asset_id', 'sap_po_number', 'active'],
    upsert: true,
    onConflict: 'id',
    note: 'Part ID is required and must be unique.',
    importNote: 'Existing parts with matching ID will be updated. New ones will be inserted.',
    sampleRows: [
      { id: 'P-001', name: 'Air Filter', mfr: 'GE', cat: 'Filter', qty: 10, min_qty: 2, max_qty: 20, bin: 'A-12', cost: 45.00, crit: false, asset_id: '', sap_po_number: '', active: true },
    ],
  },
  {
    sheet: 'Vendors',
    table: 'vendors',
    pk: 'id',
    columns: ['id', 'name', 'cat', 'contract', 'sla', 'open', 'cost', 'exp'],
    importColumns: ['id', 'name', 'cat', 'contract', 'sla', 'open', 'cost', 'exp'],
    upsert: true,
    onConflict: 'id',
    note: 'Vendor ID is required and must be unique.',
    importNote: 'Existing vendors with matching ID will be updated. New ones will be inserted.',
    sampleRows: [
      { id: 'V-001', name: 'Philips Healthcare', cat: 'Full Service', contract: 'Premium Gold', sla: 95, open: 0, cost: 25000, exp: '2026-12-31' },
    ],
  },
  {
    sheet: 'Roles',
    table: 'roles',
    pk: 'id',
    columns: ['id', 'name', 'description', 'scope', 'system', 'dept_scoped', 'is_superadmin', 'is_technician', 'email_sr_create', 'email_sr_update', 'email_sr_close', 'email_wo_create', 'email_wo_update', 'email_wo_close', 'email_pm_create', 'email_pm_update', 'email_pm_close'],
    importColumns: ['id', 'name', 'description', 'scope', 'system', 'dept_scoped', 'is_superadmin', 'is_technician', 'email_sr_create', 'email_sr_update', 'email_sr_close', 'email_wo_create', 'email_wo_update', 'email_wo_close', 'email_pm_create', 'email_pm_update', 'email_pm_close'],
    upsert: true,
    onConflict: 'id',
    note: 'Role ID is required. System roles (system=true) are protected from deletion.',
    importNote: 'Existing roles with matching ID will be updated. New ones will be inserted. Permission assignments are not imported — use the Roles page for those.',
    sampleRows: [
      { id: 'biomed', name: 'Biomedical Engineer', description: 'Handles medical equipment maintenance', scope: '', system: false, dept_scoped: false, is_superadmin: false, is_technician: true, email_sr_create: true, email_sr_update: true, email_sr_close: false, email_wo_create: true, email_wo_update: true, email_wo_close: false, email_pm_create: true, email_pm_update: false, email_pm_close: false },
    ],
  },
  {
    sheet: 'Teams',
    table: 'teams',
    pk: 'id',
    columns: ['id', 'name', 'description', 'color', 'sort_order'],
    importColumns: ['id', 'name', 'description', 'color', 'sort_order'],
    upsert: true,
    onConflict: 'id',
    note: 'Team ID is required and must be unique.',
    importNote: 'Existing teams with matching ID will be updated. New ones will be inserted.',
    sampleRows: [
      { id: 'biomed', name: 'Biomedical', description: 'Medical equipment maintenance', color: 'var(--primary)', sort_order: 1 },
    ],
  },
  {
    sheet: 'Criticality Levels',
    table: 'criticality_levels',
    pk: 'id',
    columns: ['id', 'level', 'description', 'default_priority', 'default_pm_frequency', 'color', 'sort_order', 'risk_score'],
    importColumns: ['id', 'level', 'description', 'default_priority', 'default_pm_frequency', 'color', 'sort_order', 'risk_score'],
    upsert: true,
    onConflict: 'id',
    note: 'Criticality ID is required and must be unique.',
    importNote: 'Existing levels with matching ID will be updated. New ones will be inserted.',
    sampleRows: [
      { id: 'life', level: 'Life Support', description: 'Critical life-support equipment', default_priority: 'P1', default_pm_frequency: 'Quarterly', color: 'var(--crit)', sort_order: 1, risk_score: 90 },
    ],
  },
  {
    sheet: 'Priorities',
    table: 'priorities',
    pk: 'priority',
    columns: ['priority', 'label', 'example_trigger', 'response_target', 'resolution_target', 'resolution_hours', 'warning_pct', 'applies_to', 'color', 'sort_order'],
    importColumns: ['priority', 'label', 'example_trigger', 'response_target', 'resolution_target', 'resolution_hours', 'warning_pct', 'applies_to', 'color', 'sort_order'],
    upsert: true,
    onConflict: 'priority',
    note: 'Priority (P1–P5) is the primary key.',
    importNote: 'Existing priorities with matching key will be updated. New ones will be inserted.',
    sampleRows: [
      { priority: 'P1', label: 'Emergency', example_trigger: 'Life-support failure', response_target: '15 min', resolution_target: '4 hours', resolution_hours: 4, warning_pct: 75, applies_to: 'All', color: 'var(--crit)', sort_order: 1 },
    ],
  },
  {
    sheet: 'Asset Categories',
    table: 'asset_categories',
    pk: 'id',
    columns: ['id', 'category', 'subcategory', 'equipment_group', 'default_criticality', 'default_pm_strategy', 'technical_fields'],
    importColumns: ['category', 'subcategory', 'equipment_group', 'default_criticality', 'default_pm_strategy', 'technical_fields'],
    upsert: false,
    onConflict: null,
    note: 'ID is auto-generated (UUID). Leave it blank on import to create new categories.',
    importNote: 'All rows will be inserted as new categories. To update existing ones, use the Settings page.',
    sampleRows: [
      { id: '', category: 'Diagnostic', subcategory: 'Imaging', equipment_group: 'Radiology', default_criticality: 'med', default_pm_strategy: 'Quarterly', technical_fields: 'voltage,current' },
    ],
  },
  {
    sheet: 'PM Frequencies',
    table: 'pm_frequencies',
    pk: 'id',
    columns: ['id', 'label', 'months_interval', 'sort_order'],
    importColumns: ['id', 'label', 'months_interval', 'sort_order'],
    upsert: true,
    onConflict: 'id',
    note: 'Frequency ID is required and must be unique.',
    importNote: 'Existing frequencies with matching ID will be updated. New ones will be inserted.',
    sampleRows: [
      { id: 'quarterly', label: 'Quarterly', months_interval: 3, sort_order: 1 },
    ],
  },
  {
    sheet: 'WO Types',
    table: 'work_order_types',
    pk: 'id',
    columns: ['id', 'name', 'competencies', 'sort_order'],
    importColumns: ['id', 'name', 'competencies', 'sort_order'],
    upsert: true,
    onConflict: 'id',
    note: 'Competencies should be comma-separated values (e.g. "Electrical,Safety").',
    importNote: 'Existing WO types with matching ID will be updated. New ones will be inserted.',
    sampleRows: [
      { id: 'corrective', name: 'Corrective Maintenance', competencies: 'Electrical,Mechanical', sort_order: 1 },
    ],
  },
  {
    sheet: 'Competencies',
    table: 'competencies',
    pk: 'id',
    columns: ['id', 'name', 'sort_order'],
    importColumns: ['id', 'name', 'sort_order'],
    upsert: true,
    onConflict: 'id',
    note: 'Competency ID is required and must be unique.',
    importNote: 'Existing competencies with matching ID will be updated. New ones will be inserted.',
    sampleRows: [
      { id: 'electrical', name: 'Electrical', sort_order: 1 },
    ],
  },
  {
    sheet: 'Units of Measure',
    table: 'units_of_measure',
    pk: 'id',
    columns: ['id', 'name', 'symbol', 'value_type', 'sort_order'],
    importColumns: ['id', 'name', 'symbol', 'value_type', 'sort_order'],
    upsert: true,
    onConflict: 'id',
    note: 'Unit ID is required and must be unique.',
    importNote: 'Existing units with matching ID will be updated. New ones will be inserted.',
    sampleRows: [
      { id: 'voltage', name: 'Voltage', symbol: 'V', value_type: 'number', sort_order: 1 },
    ],
  },
  {
    sheet: 'Ownership Types',
    table: 'asset_ownership_types',
    pk: 'id',
    columns: ['id', 'name', 'sort_order'],
    importColumns: ['id', 'name', 'sort_order'],
    upsert: true,
    onConflict: 'id',
    note: 'Ownership type ID is required and must be unique.',
    importNote: 'Existing ownership types with matching ID will be updated. New ones will be inserted.',
    sampleRows: [
      { id: 'owned', name: 'Owned', sort_order: 1 },
    ],
  },
  {
    sheet: 'SLA Config',
    table: 'sla_config',
    pk: 'priority',
    columns: ['priority', 'label', 'target_hours', 'warning_pct', 'color'],
    importColumns: ['priority', 'label', 'target_hours', 'warning_pct', 'color'],
    upsert: true,
    onConflict: 'priority',
    note: 'Priority (P1–P5) is the primary key.',
    importNote: 'Existing SLA configs with matching priority will be updated. New ones will be inserted.',
    sampleRows: [
      { priority: 'P1', label: 'Emergency', target_hours: 4, warning_pct: 75, color: 'var(--crit)' },
    ],
  },
];

export function getTableConfigs() {
  return TABLE_CONFIGS;
}

// ===== EXPORT =====

export async function exportAllData() {
  const wb = XLSX.utils.book_new();

  for (const cfg of TABLE_CONFIGS) {
    const { data, error } = await supabase.from(cfg.table).select('*');
    if (error) {
      console.error(`Export ${cfg.table}:`, error);
      continue;
    }
    const rows = (data || []).map(row => {
      const clean = {};
      for (const col of cfg.columns) {
        let val = row[col];
        if (Array.isArray(val)) val = val.join(',');
        if (typeof val === 'boolean') val = val ? 'true' : 'false';
        clean[col] = val ?? '';
      }
      return clean;
    });
    const ws = XLSX.utils.json_to_sheet(rows, { header: cfg.columns });
    XLSX.utils.book_append_sheet(wb, ws, cfg.sheet);
  }

  const timestamp = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `Vitalis-Setup-Export-${timestamp}.xlsx`);
}

export async function exportSingleTable(sheetName) {
  const cfg = TABLE_CONFIGS.find(c => c.sheet === sheetName);
  if (!cfg) return;

  const { data, error } = await supabase.from(cfg.table).select('*');
  if (error) {
    console.error(`Export ${cfg.table}:`, error);
    return;
  }

  const rows = (data || []).map(row => {
    const clean = {};
    for (const col of cfg.columns) {
      let val = row[col];
      if (Array.isArray(val)) val = val.join(',');
      if (typeof val === 'boolean') val = val ? 'true' : 'false';
      clean[col] = val ?? '';
    }
    return clean;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { header: cfg.columns });
  XLSX.utils.book_append_sheet(wb, ws, cfg.sheet);
  XLSX.writeFile(wb, `Vitalis-${cfg.sheet.replace(/\s+/g, '-')}-Export.xlsx`);
}

// ===== EXPORT TEMPLATE (empty with headers + sample row) =====

export function exportTemplate() {
  const wb = XLSX.utils.book_new();

  for (const cfg of TABLE_CONFIGS) {
    const headerRow = {};
    for (const col of cfg.columns) headerRow[col] = '';
    const sampleRows = (cfg.sampleRows || []).map(s => {
      const clean = {};
      for (const col of cfg.columns) {
        let val = s[col];
        if (Array.isArray(val)) val = val.join(',');
        if (typeof val === 'boolean') val = val ? 'true' : 'false';
        clean[col] = val ?? '';
      }
      return clean;
    });
    const allRows = [headerRow, ...sampleRows];
    const ws = XLSX.utils.json_to_sheet(allRows, { header: cfg.columns });
    XLSX.utils.book_append_sheet(wb, ws, cfg.sheet);
  }

  XLSX.writeFile(wb, 'Vitalis-Setup-Data-Template.xlsx');
}

export function exportTemplateForSheet(sheetName) {
  const cfg = TABLE_CONFIGS.find(c => c.sheet === sheetName);
  if (!cfg) return;

  const headerRow = {};
  for (const col of cfg.columns) headerRow[col] = '';
  const sampleRows = (cfg.sampleRows || []).map(s => {
    const clean = {};
    for (const col of cfg.columns) {
      let val = s[col];
      if (Array.isArray(val)) val = val.join(',');
      if (typeof val === 'boolean') val = val ? 'true' : 'false';
      clean[col] = val ?? '';
    }
    return clean;
  });
  const allRows = [headerRow, ...sampleRows];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(allRows, { header: cfg.columns });
  XLSX.utils.book_append_sheet(wb, ws, cfg.sheet);
  XLSX.writeFile(wb, `Vitalis-${cfg.sheet.replace(/\s+/g, '-')}-Template.xlsx`);
}

// ===== IMPORT =====

export async function parseImportFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const results = [];

  for (const cfg of TABLE_CONFIGS) {
    if (!wb.SheetNames.includes(cfg.sheet)) continue;
    const ws = wb.Sheets[cfg.sheet];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rawRows.length) continue;

    const parsed = rawRows.map(row => {
      const clean = {};
      for (const col of cfg.importColumns) {
        let val = row[col] ?? '';
        if (typeof val === 'string') {
          if (val === '') val = null;
          else if (val === 'true') val = true;
          else if (val === 'false') val = false;
        }
        // Parse arrays stored as comma-separated strings
        if (col === 'competencies' && typeof val === 'string') {
          val = val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
        }
        // Parse numbers
        if (['risk', 'pm', 'age', 'qty', 'min_qty', 'max_qty', 'sla', 'open', 'sort_order', 'target_hours', 'warning_pct', 'resolution_hours', 'months_interval', 'depreciation_years'].includes(col) && val !== null) {
          val = typeof val === 'number' ? val : parseInt(val, 10);
          if (isNaN(val)) val = null;
        }
        if (['cost', 'downtime_limit_hours', 'depreciation', 'salvage_value'].includes(col) && val !== null) {
          val = typeof val === 'number' ? val : parseFloat(val);
          if (isNaN(val)) val = null;
        }
        clean[col] = val;
      }
      // Skip rows where all import columns are null/empty
      const hasData = Object.values(clean).some(v => v !== null && v !== '');
      return hasData ? clean : null;
    }).filter(Boolean);

    if (parsed.length) {
      results.push({ config: cfg, rows: parsed, count: parsed.length });
    }
  }

  return results;
}

export async function importTableData(cfg, rows) {
  const results = { inserted: 0, updated: 0, errors: [] };

  // Auto-generate QR codes for equipment rows that don't have one
  let processedRows = rows;
  if (cfg.table === 'equipment') {
    processedRows = rows.map(r => {
      if (!r.qr_code && r.id) return { ...r, qr_code: 'VIT-' + r.id };
      return r;
    });
  }

  // For tables without upsert (insert-only), filter out empty PK
  let toInsert = processedRows;
  if (!cfg.upsert) {
    toInsert = processedRows.filter(r => !r[cfg.pk] || r[cfg.pk] === '');
  }

  if (cfg.upsert && cfg.onConflict) {
    // Upsert in batches of 100
    for (let i = 0; i < processedRows.length; i += 100) {
      const batch = processedRows.slice(i, i + 100);
      const { data, error } = await supabase
        .from(cfg.table)
        .upsert(batch, { onConflict: cfg.onConflict })
        .select();
      if (error) {
        results.errors.push(`Batch ${Math.floor(i / 100) + 1}: ${error.message}`);
      } else {
        results.updated += data ? data.length : batch.length;
      }
    }
  } else {
    // Insert only — remove PK so DB generates it
    const insertRows = toInsert.map(r => {
      const c = { ...r };
      if (!cfg.upsert) delete c[cfg.pk];
      return c;
    });
    for (let i = 0; i < insertRows.length; i += 100) {
      const batch = insertRows.slice(i, i + 100);
      const { data, error } = await supabase
        .from(cfg.table)
        .insert(batch)
        .select();
      if (error) {
        results.errors.push(`Batch ${Math.floor(i / 100) + 1}: ${error.message}`);
      } else {
        results.inserted += data ? data.length : batch.length;
      }
    }
  }

  return results;
}

export async function importAllData(parsedResults) {
  const allResults = [];
  for (const { config, rows } of parsedResults) {
    const res = await importTableData(config, rows);
    allResults.push({ sheet: config.sheet, table: config.table, ...res });
  }
  return allResults;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Runs the actual TypeScript modules with mocked IO, not a simulated RLS engine.
// PostgreSQL policies/constraints require the separate staging verification plan.
const nativeRequire = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
function load(entry, mocks = {}, env = {}, globals = {}) {
  const cache = new Map();
  function read(file) {
    file = path.resolve(root, file);
    if (!path.extname(file)) file += '.ts';
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} }; cache.set(file, loadedModule);
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const require = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('.')) return read(path.resolve(path.dirname(file), name));
      return nativeRequire(name);
    };
    const context = vm.createContext({ module: loadedModule, exports: loadedModule.exports, require, process: { env },
      Request, Response, Headers, URL, URLSearchParams, Buffer, TextEncoder, TextDecoder, crypto,
      console, setTimeout, clearTimeout, ...globals });
    new vm.Script(compiled, { filename: file }).runInContext(context);
    return loadedModule.exports;
  }
  return read(entry);
}

function fixture(role = 'project_director', permissions = {}, options = {}) {
  const rows = {
    platform_admins: options.platform ? [{ auth_user_id: 'u1', email: 'platform@example.test' }] : [],
    projects: [{ id: 'p1', name: 'Tenant A project', organization_id: 'a' }, { id: 'p2', name: 'Other project', organization_id: 'b' }, { id: 'p3', name: 'Same tenant, unassigned', organization_id: 'a' }],
    organizations: [{ id: 'a', name: 'A', subscription_status: 'active', access_until: '2099-01-01', seat_limit: 10 }],
    organization_members: options.inactive ? [{ organization_id: 'a', auth_user_id: 'u1', status: 'inactive', role }] : [],
    project_users: [{ id: 'm1', project_id: 'p1', auth_user_id: 'u1', email: 'actor@example.test', name: 'Actor', role, feature_permissions: permissions },
      { id: 'm2', project_id: 'p1', auth_user_id: 'u2', email: 'staff@example.test', name: 'Staff', role: 'site_engineer', feature_permissions: {} },
      { id: 'm3', project_id: 'p2', auth_user_id: 'u3', email: 'other@example.test', role: 'site_engineer', feature_permissions: {} }],
  };
  const writes = [];
  const db = { auth: { getUser: async token => token === 'valid' ? { data: { user: { id: 'u1' } }, error: null } : { data: { user: null }, error: { message: 'invalid' } }, admin: {
    createUser: async payload => ({ data: { user: { id: 'new-user', email: payload.email } }, error: null }), deleteUser: async () => ({ error: null }),
  } }, rpc: async () => ({ data: { code: 'UPDATED', message: 'Saved', revision: 2, record: { id: 'r1', revision: 2 } }, error: null }), from(table) {
    let filters = []; let mutation; let single = false;
    const chain = {
      select() { return chain; }, eq(key, value) { filters.push(row => row[key] === value); return chain; },
      in(key, values) { filters.push(row => values.includes(row[key])); return chain; },
      limit() { return chain; }, order() { return chain; },
      maybeSingle() { single = true; return chain; }, single() { single = true; return chain; },
      upsert(value) { mutation = value; return chain; }, insert(value) { mutation = value; return chain; },
      update(value) { mutation = value; return chain; }, delete() { mutation = {}; return chain; },
      then(resolve, reject) {
        let selected = (rows[table] || []).filter(row => filters.every(fn => fn(row)));
        if (mutation) { writes.push({ table, value: mutation }); selected = [{ ...selected[0], ...mutation }]; }
        return Promise.resolve({ data: single ? selected[0] || null : selected, error: null }).then(resolve, reject);
      },
    }; return chain;
  } };
  return { db, writes, rows };
}
const serverEnv = { NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'test-only', OPENAI_API_KEY: 'test-only' };
function modules(file, data, globals = {}) {
  return load(file, { '@supabase/supabase-js': { createClient: () => data.db }, 'next/server': { NextResponse: Response } }, serverEnv, globals);
}
function request(body, token = 'valid', method = 'POST', url = 'https://app.test/api') {
  return new Request(url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) });
}

test('feature overrides only narrow known role baselines', () => {
  const { can } = load('src/lib/permissions.ts');
  assert.equal(can('unknown', 'reports'), false);
  assert.equal(can('super_admin', 'expenses', { expenses: 'write' }), false);
  assert.equal(can('site_engineer', 'upload_evidence', { upload_evidence: 'none' }, 'write'), false);
  assert.equal(can('employer_viewer', 'schedule', { schedule: 'write' }, 'write'), false);
  assert.equal(can('site_engineer', 'upload_evidence', { upload_evidence: 'read' }, 'write'), false);
  assert.equal(can('project_director', 'manage_users', {}, 'write'), true);
});
test('language catalog defaults safely and falls back to English catalog entries', () => {
  const i18n = load('src/lib/i18n.ts');
  assert.equal(i18n.t('ne', 'common.save'), 'सुरक्षित गर्नुहोस्');
  assert.equal(i18n.t('en', 'common.save'), 'Save');
  assert.equal(i18n.readLanguage(), 'ne');
});
test('language preference persists through the single browser preference key', () => {
  const values = new Map();
  const i18n = load('src/lib/i18n.ts', {}, {}, { window: { localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) } } });
  assert.equal(i18n.readLanguage(), 'ne');
  i18n.persistLanguage('en');
  assert.equal(i18n.readLanguage(), 'en');
});
test('business dates remain Bikram Sambat in both languages and round trip to stored ISO', () => {
  class TestNepaliDate {
    constructor(...args) { this.parts = args.length === 1 ? { year: 2083, month: 5, day: 8 } : { year: args[0], month: args[1], day: args[2] }; }
    getBS() { return { year: this.parts.year, month: this.parts.month, date: this.parts.day }; }
    getAD() { return { year: 2026, month: 8, date: 24 }; }
    getYear() { return this.parts.year; } getMonth() { return this.parts.month; } getDate() { return this.parts.day; }
  }
  const dates = load('src/lib/nepaliDate.ts', { 'nepali-date-converter': { __esModule: true, default: TestNepaliDate } });
  const ad = '2026-09-24';
  const nepali = dates.formatBsDate(ad, { long: true, language: 'ne' });
  const english = dates.formatBsDate(ad, { long: true, language: 'en' });
  assert.match(nepali, /[०-९]/);
  assert.match(english, /Ashwin|Bhadra|Kartik/);
  assert.match(english, /BS$/);
  assert.equal(dates.bsToAdDate(dates.adToBsParts(ad)), ad);
});
test('canonical field update accepts only active-project activities and waits for persistence', async () => {
  let submitted = false;
  const validStorage = { getProject: () => ({ id: 'p1' }), getActivities: () => [{ id: 'a1' }], enqueueDailyWorkMutation: () => ({}), submitDailyReport: () => { submitted = true; return { id: 'r1' }; }, flushDurableMutations: async () => ({ ok: true }), isSupabaseConfigured: () => true };
  const command = load('src/lib/dailyWorkUpdate.ts', { './storage': { storage: validStorage } });
  assert.equal((await command.saveDailyWorkUpdate({ projectId: 'p1', report: {}, workItems: [{ activity_id: 'a1' }], materialItems: [] })).id, 'r1');
  assert.equal(submitted, true);
  await assert.rejects(() => command.saveDailyWorkUpdate({ projectId: 'p2', report: {}, workItems: [{ activity_id: 'a1' }], materialItems: [] }));
  await assert.rejects(() => command.saveDailyWorkUpdate({ projectId: 'p1', report: {}, workItems: [{ activity_id: 'foreign' }], materialItems: [] }));
});
test('daily report conditional updates increment revisions, preserve newer data, and keep accepted operations idempotent', async () => {
  const concurrency = load('src/lib/server/dailyReportConcurrency.ts');
  const reports = new Map([['r1', { id: 'r1', project_id: 'p1', report_date: '2026-09-25', weather: 'Clear', revision: 4 }]]);
  const operations = new Map();
  const persistence = { apply: async input => {
    const prior = operations.get(input.operationId); if (prior) return prior;
    const current = reports.get(input.report.id);
    let result;
    if (!current) result = { code: 'NOT_FOUND', message: 'Missing' };
    else if (current.project_id !== input.projectId) result = { code: 'NOT_FOUND', message: 'Missing' };
    else if (current.revision !== input.expectedRevision) result = { code: 'CONFLICT', message: 'Stale', revision: current.revision, record: { ...current } };
    else { const saved = { ...current, ...input.report, revision: current.revision + 1 }; reports.set(saved.id, saved); result = { code: 'UPDATED', message: 'Saved', revision: saved.revision, record: { ...saved } }; }
    operations.set(input.operationId, result); return result;
  } };
  const base = { organizationId: 'o1', projectId: 'p1', actorId: 'u1', expectedRevision: 4, report: { id: 'r1', report_date: '2026-09-25', weather: 'Rain' } };
  const first = await concurrency.conditionallyUpdateDailyReport({ ...base, operationId: 'op-1' }, persistence);
  assert.equal(first.code, 'UPDATED'); assert.equal(first.revision, 5);
  const retry = await concurrency.conditionallyUpdateDailyReport({ ...base, operationId: 'op-1' }, persistence);
  assert.equal(retry.code, 'UPDATED'); assert.equal(retry.revision, 5);
  const latest = await concurrency.conditionallyUpdateDailyReport({ ...base, operationId: 'op-2', expectedRevision: 5 }, persistence);
  assert.equal(latest.code, 'UPDATED'); assert.equal(latest.revision, 6);
  const stale = await concurrency.conditionallyUpdateDailyReport({ ...base, operationId: 'op-3' }, persistence);
  assert.equal(stale.code, 'CONFLICT'); assert.equal(reports.get('r1').weather, 'Rain'); assert.equal(reports.get('r1').revision, 6);
  const wrongProject = await concurrency.conditionallyUpdateDailyReport({ ...base, projectId: 'p2', operationId: 'op-4', expectedRevision: 6 }, persistence);
  assert.equal(wrongProject.code, 'NOT_FOUND');
});
test('daily report concurrency API authorizes the exact project before invoking the server compare-and-set command', async () => {
  const data = fixture('site_engineer'); let rpcInput;
  data.db.rpc = async (name, input) => { rpcInput = { name, input }; return { data: { code: 'UPDATED', message: 'Saved', revision: 2, record: { id: 'r1', revision: 2 } }, error: null }; };
  const route = modules('src/app/api/daily-work/update/route.ts', data);
  const body = { projectId: 'p1', operationId: 'daily-op-1', expectedRevision: 1, report: { id: 'r1', report_date: '2026-09-25', manpower_total: 2 } };
  assert.equal((await route.POST(request(body))).status, 200);
  assert.equal(rpcInput.name, 'phase1g_apply_daily_report_update');
  assert.equal(rpcInput.input.p_project_id, 'p1'); assert.equal(rpcInput.input.p_organization_id, 'a');
  assert.equal((await route.POST(request({ ...body, projectId: 'p2' }))).status, 403);
  assert.equal((await route.POST(request(body, ''))).status, 401);
});
test('safe BOQ import merges deterministic rows and preserves missing linked activities', () => {
  const importer = load('src/lib/boqImport.ts');
  const existing = {
    wbs: [{ id: 'w-01', project_id: 'p1', wbs_code: '01', name: 'Earthworks', parent_code: null }],
    activities: [
      { id: 'a-01', project_id: 'p1', wbs_code: '01.01', name: 'Excavation', baseline_start: '2026-01-01', baseline_finish: '2026-01-05', planned_duration: 5, planned_quantity: 100, actual_quantity: 30, unit: 'm3', weightage: 5, status: 'in_progress' },
      { id: 'a-linked', project_id: 'p1', wbs_code: '01.02', name: 'Existing linked work', baseline_start: '2026-01-06', baseline_finish: '2026-01-08', planned_duration: 3, planned_quantity: 1, actual_quantity: 1, unit: 'Pkg', weightage: 1, status: 'completed' },
    ], dependencies: [],
  };
  const incoming = {
    projectId: 'p1',
    wbs: [...existing.wbs, { id: 'w-02', wbs_code: '02', name: 'Concrete', parent_code: null }],
    activities: [
      { ...existing.activities[0], planned_duration: 6, baseline_finish: '2026-01-06', actual_quantity: 0, status: 'not_started' },
      { id: 'a-02', wbs_code: '02.01', name: 'Footing concrete', baseline_start: '2026-01-07', baseline_finish: '2026-01-10', planned_duration: 4, planned_quantity: 20, actual_quantity: 0, unit: 'm3', weightage: 4, status: 'not_started' },
    ], dependencies: [{ id: 'd-01', predecessor_id: 'a-01', successor_id: 'a-02', type: 'FS', lag: 0 }],
  };
  const result = importer.prepareSafeBoqImport(existing, incoming);
  assert.equal(result.ok, true);
  assert.equal(result.activities.length, 3);
  assert.equal(result.activities.find(item => item.id === 'a-linked').status, 'completed');
  assert.equal(result.activities.find(item => item.id === 'a-01').actual_quantity, 30);
  assert.equal(result.dependencies[0].successor_id, 'a-02');
  assert.ok(result.counts.created >= 3);
  const repeated = importer.prepareSafeBoqImport({ wbs: result.wbs, activities: result.activities, dependencies: result.dependencies }, incoming);
  assert.equal(repeated.ok, true);
  assert.equal(repeated.counts.created, 0);
  assert.equal(repeated.counts.updated, 0);
});
test('canonical project metrics keep progress and financial streams distinct and deterministic', () => {
  const metrics = load('src/lib/projectMetrics.ts');
  const activities = [
    { id: 'a1', wbs_code: '01', name: 'Earthwork', baseline_start: '2026-01-01', baseline_finish: '2026-01-11', planned_duration: 11, planned_quantity: 100, actual_quantity: 50, weightage: 40, unit: 'm3', status: 'in_progress' },
    { id: 'a2', wbs_code: '02', name: 'Concrete', baseline_start: '2026-01-01', baseline_finish: '2026-01-11', planned_duration: 11, planned_quantity: 20, actual_quantity: 99, weightage: 60, unit: 'm3', status: 'completed' },
  ];
  const progress = metrics.calculateProjectProgress(activities, '2026-01-06');
  assert.equal(progress.plannedProgress, 50);
  assert.equal(progress.actualProgress, 80);
  assert.equal(metrics.activityActualProgress({ ...activities[0], actual_quantity: 1000 }), 100);
  const financials = metrics.calculateProjectFinancials({
    contractAmount: 1_000,
    claims: [{ type: 'variation', status: 'approved', cost_impact_amount: 100 }, { type: 'variation', status: 'submitted', cost_impact_amount: 500 }],
    expenses: [{ amount: 40, status: 'approved' }, { amount: 9, status: 'rejected' }],
    budgetHeads: [{ actual_cost: 70 }],
    ipcSubmissions: [{ claimed_amount: 600, certified_amount: 500, retention_deducted: 20, advance_recovered: 30, paid_amount: 400, status: 'paid' }],
    ipcPayments: [{ amount: 100 }, { amount: 200 }],
  });
  assert.equal(financials.approvedVariationAmount, 100);
  assert.equal(financials.revisedContractAmount, 1_100);
  assert.equal(financials.expenseTotal, 40);
  assert.equal(financials.budgetActualCost, 70);
  assert.equal(financials.billedAmount, 600);
  assert.equal(financials.paidAmount, 300);
  assert.equal(financials.outstandingAmount, 150);
  const empty = metrics.calculateProjectFinancials({ contractAmount: 0 });
  assert.equal(empty.revisedContractAmount, 0); assert.equal(empty.outstandingAmount, 0);
});
test('report safety escapes HTML and neutralizes spreadsheet formula cells without changing normal values', () => {
  const report = load('src/lib/reportSafety.ts');
  assert.equal(report.escapeReportHtml('<script>alert("x")</script> & \"remarks\"'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;remarks&quot;');
  assert.equal(report.escapeReportHtml('Brickwork & concrete'), 'Brickwork &amp; concrete');
  for (const dangerous of ['=SUM(A1:A2)', '+cmd', '-10+10', '@HYPERLINK("x")']) assert.equal(report.csvSafeCell(dangerous).startsWith("\"'"), true);
  assert.equal(report.csvSafeCell('ordinary remark'), '"ordinary remark"');
  assert.equal(report.csvSafeCell(1250), '"1250"');
});
test('maintenance cron fails closed when no cron secret is configured', async () => {
  const route = modules('src/app/api/cron/keepalive/route.ts', fixture());
  assert.equal((await route.GET(request(undefined, '', 'GET'))).status, 401);
});
test('safe BOQ import rejects malformed, foreign-project, and ambiguous records without changing the snapshot', () => {
  const importer = load('src/lib/boqImport.ts');
  const existing = {
    wbs: [],
    activities: [
      { id: 'a1', project_id: 'p1', wbs_code: '03.01', name: 'Brickwork', baseline_start: '2026-01-01', baseline_finish: '2026-01-02', planned_duration: 2, planned_quantity: 1, actual_quantity: 0, status: 'not_started' },
      { id: 'a2', project_id: 'p1', wbs_code: '03.01', name: 'Brickwork', baseline_start: '2026-01-03', baseline_finish: '2026-01-04', planned_duration: 2, planned_quantity: 1, actual_quantity: 0, status: 'not_started' },
    ], dependencies: [],
  };
  const foreign = importer.prepareSafeBoqImport(existing, { projectId: 'p1', wbs: [], activities: [{ id: 'foreign', project_id: 'p2', wbs_code: '04.01', name: 'Foreign', baseline_start: '2026-01-01', baseline_finish: '2026-01-02', planned_duration: 2 }], dependencies: [] });
  assert.equal(foreign.ok, false); assert.equal(foreign.activities, existing.activities);
  const ambiguous = importer.prepareSafeBoqImport(existing, { projectId: 'p1', wbs: [], activities: [{ id: 'new', wbs_code: '03.01', name: 'Brickwork', baseline_start: '2026-01-01', baseline_finish: '2026-01-02', planned_duration: 2 }], dependencies: [] });
  assert.equal(ambiguous.ok, false); assert.ok(ambiguous.issues.some(issue => issue.code === 'MATCH_CONFLICT'));
  const malformed = importer.prepareSafeBoqImport(existing, { projectId: 'p1', wbs: [], activities: [{ id: 'bad', wbs_code: '', name: '', baseline_start: '', baseline_finish: '', planned_duration: 0 }], dependencies: [] });
  assert.equal(malformed.ok, false); assert.equal(malformed.activities, existing.activities);
});
test('server BOQ import requires the actor to have schedule authority for the exact project', async () => {
  const route = modules('src/app/api/boq/import/route.ts', fixture('planning_engineer'));
  const body = { projectId: 'p1', wbs: [{ id: 'w1', wbs_code: '01', name: 'Mobilization', parent_code: null }], activities: [{ id: 'a1', wbs_code: '01.01', name: 'Site setup', baseline_start: '2026-01-01', baseline_finish: '2026-01-02', planned_duration: 2, planned_quantity: 1, actual_quantity: 0, unit: 'Pkg', weightage: 1, status: 'not_started' }], dependencies: [] };
  assert.equal((await route.POST(request(body))).status, 200);
  assert.equal((await route.POST(request({ ...body, projectId: 'p2' }))).status, 403);
  const denied = modules('src/app/api/boq/import/route.ts', fixture('site_engineer'));
  assert.equal((await denied.POST(request(body))).status, 403);
});
test('one stable BuildTrack person can hold different assignments across projects', () => {
  const identity = load('src/lib/personIdentity.ts');
  const personId = identity.buildTrackPersonId('u-staff');
  const assignments = [
    { personId, projectId: 'p1', organizationId: 'o1', role: 'site_engineer' },
    { personId, projectId: 'p3', organizationId: 'o1', role: 'store_officer' },
  ];
  assert.equal(identity.assignmentsForPerson(assignments, personId).length, 2);
  assert.equal(identity.hasMultipleProjectContexts(assignments, personId), true);
  assert.equal(identity.canUseProjectAssignment(assignments[0], { personId, projectId: 'p1', organizationId: 'o1' }), true);
  assert.equal(identity.canUseProjectAssignment(assignments[0], { personId, projectId: 'p3', organizationId: 'o1' }), false);
});
test('employee workforce records validate tenant-scoped HR data without creating a second identity', () => {
  const workforce = load('src/lib/employeeWorkforce.ts');
  const employee = { organizationId: 'o1', personId: 'u1', employeeCode: ' emp-001 ', fullName: 'Sita Rai', employmentStatus: 'active', employmentType: 'full_time', joiningDate: '2026-01-01', exitDate: null };
  assert.equal(workforce.validateEmployeeMaster(employee), null);
  assert.equal(workforce.employeeCodeKey(employee.employeeCode), 'EMP-001');
  assert.match(workforce.validateEmployeeMaster({ ...employee, exitDate: '2025-01-01' }), /Exit date/);
  assert.equal(workforce.validateEmployeeAssignment({ organizationId: 'o1', employeeId: 'e1', projectId: 'p1', projectRole: 'site_engineer', status: 'active' }), null);
  assert.match(workforce.validateEmployeeAssignment({ organizationId: 'o1', employeeId: 'e1', projectId: 'p1', startDate: '2026-02-01', endDate: '2026-01-01' }), /end date/);
  assert.equal(workforce.sameOrganization({ organization_id: 'o1' }, { organization_id: 'o1' }), true);
  assert.equal(workforce.sameOrganization({ organization_id: 'o1' }, { organization_id: 'o2' }), false);
});
test('leave, availability and planned allocation remain separate from attendance and project access', () => {
  const workforce = load('src/lib/workforceAvailability.ts');
  assert.equal(workforce.validateLeave({ employeeId: 'e1', leaveType: 'Annual', startDate: '2026-09-20', endDate: '2026-09-22' }), null);
  assert.equal(workforce.inclusiveDays('2026-09-20', '2026-09-22'), 3);
  assert.match(workforce.validateLeave({ employeeId: 'e1', leaveType: 'Annual', startDate: '2026-09-23', endDate: '2026-09-22' }), /end date/);
  assert.equal(workforce.validateAllocation({ employeeId: 'e1', projectId: 'p1', startDate: '2026-09-20', endDate: '2026-09-22' }), null);
  const employee = { id: 'e1', active: true, employment_status: 'active' };
  const assignments = [{ employee_id: 'e1', project_id: 'p1', status: 'active', start_date: '2026-09-01', end_date: '2026-10-01' }, { employee_id: 'e1', project_id: 'p2', status: 'active', start_date: '2026-09-01', end_date: '2026-10-01' }];
  assert.equal(workforce.evaluateEmployeeAvailability(employee, 'p1', '2026-09-21', assignments, [], []).available, true);
  assert.deepEqual([...workforce.evaluateEmployeeAvailability(employee, 'p1', '2026-09-21', assignments, [{ employee_id: 'e1', status: 'approved', start_date: '2026-09-20', end_date: '2026-09-22' }], []).reasons], ['approved_leave']);
  assert.ok(workforce.evaluateEmployeeAvailability({ ...employee, active: false }, 'p1', '2026-09-21', assignments, [], []).reasons.includes('inactive'));
  assert.ok(workforce.evaluateEmployeeAvailability(employee, 'p1', '2026-11-01', assignments, [], []).reasons.includes('outside_assignment'));
  assert.ok(workforce.evaluateEmployeeAvailability(employee, 'p1', '2026-09-21', assignments, [], [{ employee_id: 'e1', project_id: 'p2', status: 'planned', start_date: '2026-09-20', end_date: '2026-09-22' }]).reasons.includes('allocated_elsewhere'));
});
test('payroll calculation is deterministic, input-driven, and has no attendance inference', () => {
  const payroll = load('src/lib/payroll.ts');
  const totals = payroll.calculatePayroll(1000, [
    { kind: 'allowance', amount: 100, status: 'approved' }, { kind: 'overtime', amount: 50, status: 'approved' },
    { kind: 'other_earning', amount: 25, status: 'draft' }, { kind: 'tax', amount: 75, status: 'approved' }, { kind: 'other_deduction', amount: 20, status: 'approved' },
  ]);
  assert.equal(totals.grossEarnings, 1150); assert.equal(totals.totalDeductions, 95); assert.equal(totals.netPay, 1055);
  assert.throws(() => payroll.calculatePayroll(-1, [])); assert.throws(() => payroll.calculatePayroll(100, [{ kind: 'tax', amount: -1, status: 'approved' }]));
  assert.equal(payroll.validPeriodTransition('draft', 'open'), true); assert.equal(payroll.validPeriodTransition('finalized', 'open'), false);
  assert.equal(payroll.approvedLeaveInputs([{ status: 'approved', start_date: '2026-09-10', end_date: '2026-09-12' }, { status: 'rejected', start_date: '2026-09-10', end_date: '2026-09-12' }], { start_date: '2026-09-01', end_date: '2026-09-30' }).length, 1);
});
test('BOQ measurements count only approved quantities and explicitly flag excess', () => {
  const measurement = load('src/lib/boqMeasurement.ts');
  assert.equal(measurement.validateMeasurement(0, '2026-09-25'), null);
  assert.match(measurement.validateMeasurement(-1, '2026-09-25'), /non-negative/);
  assert.match(measurement.validateMeasurement('not-a-number', '2026-09-25'), /non-negative/);
  assert.equal(measurement.validMeasurementTransition('draft', 'submitted'), true);
  assert.equal(measurement.validMeasurementTransition('approved', 'submitted'), false);
  const summary = measurement.summarizeBoqMeasurement(100, 12.5, [{ id: 'd', activity_id: 'a', quantity: 30, status: 'draft', measurement_date: '2026-09-01' }, { id: 'r', activity_id: 'a', quantity: 20, status: 'rejected', measurement_date: '2026-09-02' }, { id: 'a', activity_id: 'a', quantity: 80, status: 'approved', measurement_date: '2026-09-03' }]);
  assert.equal(summary.cumulativeApprovedQuantity, 80); assert.equal(summary.remainingQuantity, 20); assert.equal(summary.approvedValue, 1000);
  assert.equal(measurement.summarizeBoqMeasurement(10, 1, [{ id: 'a', activity_id: 'a', quantity: 11, status: 'approved', measurement_date: '2026-09-01' }]).exceedsBoq, true);
});
test('IPC valuation keeps approved measurements eligible once, calculates snapshots, and preserves workflow boundaries', () => {
  const ipc = load('src/lib/ipcValuation.ts');
  assert.equal(ipc.validIpcTransition('draft', 'submitted'), true); assert.equal(ipc.validIpcTransition('certified', 'review'), false);
  assert.equal(ipc.eligibleMeasurements([{ status: 'approved' }, { status: 'draft' }, { status: 'approved', certified_valuation_period_id: 'ipc-1' }]).length, 1);
  const value = ipc.valuationLine(10, 5, 100, 12);
  assert.equal(value.currentValue, 500); assert.equal(value.cumulativeValue, 1500); assert.equal(value.exceedsBoq, true);
  assert.throws(() => ipc.valuationLine(0, -1, 10, 10));
});

test('payment certificates retain explicit deductions, net values, and controlled approval transitions', () => {
  const certificates = load('src/lib/paymentCertificate.ts');
  const totals = certificates.calculateCertificate(1000.125, [
    { kind: 'retention', amount: 100.115 }, { kind: 'advance_recovery', amount: 25 },
  ]);
  assert.equal(totals.grossCertifiedAmount, 1000.13);
  assert.equal(totals.totalDeductions, 125.12);
  assert.equal(totals.netCertifiedAmount, 875.01);
  assert.equal(certificates.validCertificateTransition('draft', 'submitted'), true);
  assert.equal(certificates.validCertificateTransition('submitted', 'certified'), false);
  assert.equal(certificates.validCertificateTransition('certified', 'draft'), false);
  assert.throws(() => certificates.calculateCertificate(100, [{ kind: 'retention', amount: 101 }]));
});
test('flexible field intake accepts partial text, mapped quantity, and confirmed media without financial side effects', async () => {
  const intake = load('src/lib/fieldUpdateIntake.ts');
  const context = { personId: 'u1', organizationId: 'o1', projects: [{ projectId: 'p1', organizationId: 'o1', personId: 'u1', canSubmitDailyWork: true, activities: [{ id: 'a1', wbsCode: '03.01', name: 'Brickwork', unit: 'm²' }] }] };
  const textOnly = intake.evaluateFieldUpdate({ personId: 'u1', organizationId: 'o1', source: 'WEB', description: 'Block A brickwork completed.' }, context);
  assert.equal(textOnly.status, 'accepted'); assert.equal(textOnly.candidate.mapping, 'partial');
  const mapped = intake.evaluateFieldUpdate({ personId: 'u1', organizationId: 'o1', source: 'MOBILE', projectId: 'p1', activityId: 'a1', quantity: 35, description: 'Brickwork completed.' }, context);
  assert.equal(mapped.status, 'accepted'); assert.equal(mapped.candidate.activityId, 'a1'); assert.equal(mapped.candidate.unit, 'm²');
  let saved = null;
  const media = await intake.submitFieldUpdate({ personId: 'u1', organizationId: 'o1', source: 'FUTURE', projectId: 'p1', description: 'Photo only update', media: [{ kind: 'photo', reference: 'existing-storage-ref', storageConfirmed: true }] }, context, { save: async candidate => { saved = candidate; } });
  assert.equal(media.status, 'accepted'); assert.equal(saved.source, 'FUTURE'); assert.equal(media.event.type, 'field_update_created');
});
test('flexible field intake rejects cross-project/tenant context and asks once for ambiguous multi-project context', () => {
  const intake = load('src/lib/fieldUpdateIntake.ts');
  const context = { personId: 'u1', organizationId: 'o1', projects: [
    { projectId: 'p1', organizationId: 'o1', personId: 'u1', canSubmitDailyWork: true, activities: [{ id: 'a1', wbsCode: '03.01', name: 'Brickwork' }] },
    { projectId: 'p2', organizationId: 'o1', personId: 'u1', canSubmitDailyWork: true, activities: [{ id: 'a2', wbsCode: '03.01', name: 'Concrete' }] },
  ] };
  assert.equal(intake.evaluateFieldUpdate({ personId: 'u1', organizationId: 'o1', source: 'WHATSAPP', description: 'Payment made' }, context).status, 'needs_clarification');
  assert.equal(intake.evaluateFieldUpdate({ personId: 'u1', organizationId: 'o1', source: 'WEB', projectId: 'p1', activityId: 'a2', quantity: 1 }, context).status, 'rejected');
  assert.equal(intake.evaluateFieldUpdate({ personId: 'u1', organizationId: 'other', source: 'WEB', projectId: 'p1', description: 'work' }, context).status, 'rejected');
  assert.equal(intake.evaluateFieldUpdate({ personId: 'other', organizationId: 'o1', source: 'WEB', projectId: 'p1', description: 'work' }, context).status, 'rejected');
});
test('notification routing is project-scoped, responsibility-driven, and provider-neutral', () => {
  const routing = load('src/lib/notificationRouting.ts');
  const context = {
    projectMemberships: [
      { organizationId: 'o1', projectId: 'pA', personId: 'ram', active: true },
      { organizationId: 'o1', projectId: 'pA', personId: 'engineer-a', active: true },
      { organizationId: 'o1', projectId: 'pA', personId: 'manager-a', active: true },
      { organizationId: 'o1', projectId: 'pB', personId: 'ram', active: true },
      { organizationId: 'o1', projectId: 'pB', personId: 'engineer-b', active: true },
      { organizationId: 'o1', projectId: 'pB', personId: 'manager-b', active: true },
    ],
    reportingRelationships: [
      { organizationId: 'o1', projectId: 'pA', personId: 'ram', supervisorPersonId: 'engineer-a' },
      { organizationId: 'o1', projectId: 'pA', personId: 'manager-a', isProjectResponsible: true },
      { organizationId: 'o1', projectId: 'pB', personId: 'ram', supervisorPersonId: 'engineer-b' },
      { organizationId: 'o1', projectId: 'pB', personId: 'manager-b', isProjectResponsible: true },
    ],
    organizationRecipients: [{ organizationId: 'o1', personId: 'md', active: true, eventTypes: ['field_update_created'] }],
  };
  const event = routing.fieldUpdateNotificationEvent({ type: 'field_update_created', projectId: 'pA', personId: 'ram' }, { id: 'event-1', organizationId: 'o1', occurredAt: '2026-09-24T10:00:00.000Z', source: 'WEB', recordId: 'work-1' });
  const resolved = routing.resolveNotificationRecipients(event, context);
  assert.equal(resolved.status, 'accepted');
  assert.deepEqual([...resolved.recipientPersonIds], ['engineer-a', 'manager-a', 'md']);
  assert.deepEqual([...routing.resolveNotificationRecipients({ ...event, source: 'MOBILE' }, context).recipientPersonIds], [...resolved.recipientPersonIds]);
  assert.deepEqual([...routing.resolveNotificationRecipients({ ...event, source: 'WHATSAPP' }, context).recipientPersonIds], [...resolved.recipientPersonIds]);
  assert.equal(resolved.recipientPersonIds.includes('engineer-b'), false);
  assert.equal(resolved.recipientPersonIds.includes('manager-b'), false);
  assert.equal(routing.buildPendingNotificationRecords(event, resolved)[0].channel, 'BUILDTRACK');
});
test('notification routing rejects cross-tenant or non-member project actors and supports company events explicitly', () => {
  const routing = load('src/lib/notificationRouting.ts');
  const context = { projectMemberships: [{ organizationId: 'o1', projectId: 'p1', personId: 'ram', active: true }], reportingRelationships: [], organizationRecipients: [{ organizationId: 'o1', personId: 'md', active: true }] };
  const rejected = routing.resolveNotificationRecipients({ id: 'bad', type: 'expense_submitted', organizationId: 'o1', projectId: 'p1', actorPersonId: 'other-tenant', occurredAt: '2026-09-24T10:00:00.000Z', source: 'WEB', scope: 'project' }, context);
  assert.equal(rejected.status, 'rejected');
  const company = routing.resolveNotificationRecipients({ id: 'company-1', type: 'subscription_reviewed', organizationId: 'o1', occurredAt: '2026-09-24T10:00:00.000Z', source: 'MOBILE', scope: 'organization' }, context);
  assert.equal(company.status, 'accepted');
  assert.deepEqual([...company.recipientPersonIds], ['md']);
});
test('durable mutations survive reload, remain pending on failure, and acknowledge only after confirmation', () => {
  const { DurableMutationOutbox } = load('src/lib/durableMutationOutbox.ts');
  const values = new Map(); const store = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const first = new DurableMutationOutbox(store);
  first.enqueue({ id: 'op-1', kind: 'daily_work_update', projectId: 'p1', organizationId: 'o1', actorId: 'u1', targetId: 'r1', affectedLocalKeys: ['bt_daily_reports'], payload: {} });
  first.markFailed('op-1', 'offline');
  const reloaded = new DurableMutationOutbox(store);
  assert.equal(reloaded.pendingForProject('p1', 'u1').length, 1);
  assert.equal(reloaded.pendingForProject('p1', 'u1')[0].lastError, 'offline');
  reloaded.acknowledge('op-1');
  assert.equal(reloaded.all()[0].status, 'acknowledged');
});
test('durable replay is idempotent, project scoped, and tombstones protect pending deletion', () => {
  const { DurableMutationOutbox } = load('src/lib/durableMutationOutbox.ts');
  const values = new Map(); const store = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const outbox = new DurableMutationOutbox(store);
  const mutation = { id: 'delete-p1-r1', kind: 'daily_report_delete', projectId: 'p1', organizationId: 'o1', actorId: 'u1', targetId: 'r1', affectedLocalKeys: ['bt_daily_reports'], payload: {}, tombstone: { localKey: 'bt_daily_reports', recordId: 'r1' } };
  outbox.enqueue(mutation); outbox.enqueue(mutation);
  assert.equal(outbox.pendingForProject('p1').length, 1);
  assert.equal(outbox.pendingForProject('p2').length, 0);
  assert.equal(outbox.protectedLocalKeys('p1').has('bt_daily_reports'), true);
  assert.equal(outbox.hasTombstone('p1', 'bt_daily_reports', 'r1'), true);
  outbox.acknowledge('delete-p1-r1');
  assert.equal(outbox.hasTombstone('p1', 'bt_daily_reports', 'r1'), false);
});
test('a later local change receives a new durable operation after an earlier operation is acknowledged', () => {
  const { DurableMutationOutbox } = load('src/lib/durableMutationOutbox.ts');
  const values = new Map(); const store = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const outbox = new DurableMutationOutbox(store);
  const first = { id: 'collection-p1-activities-op-1', kind: 'project_collection_sync', projectId: 'p1', organizationId: 'o1', actorId: 'u1', targetId: 'bt_activities', affectedLocalKeys: ['bt_activities'], payload: { localKey: 'bt_activities' } };
  const second = { ...first, id: 'collection-p1-activities-op-2' };
  outbox.enqueue(first);
  outbox.acknowledge(first.id);
  outbox.enqueue(second);
  assert.equal(outbox.pendingForProject('p1', 'u1').map(item => item.id).join(','), second.id);
  assert.equal(outbox.all().find(item => item.id === first.id)?.status, 'acknowledged');
});
test('cloud synchronization no longer contains a project-wide delete-and-replace path', () => {
  const source = fs.readFileSync(path.join(root, 'src/lib/storage.ts'), 'utf8');
  const syncStart = source.indexOf('syncActiveProjectToCloud: async');
  const syncEnd = source.indexOf('pullActiveProjectFromCloud:', syncStart);
  const syncBody = source.slice(syncStart, syncEnd);
  assert.equal(syncBody.includes(".delete().eq('project_id', projectId)"), false);
  assert.match(syncBody, /merge-only by id/);
});
test('failed attachment attempts preserve exactly the files that need retry', () => {
  const state = load('src/lib/dailySaveState.ts');
  const first = { name: 'confirmed.jpg' }; const second = { name: 'retry.jpg' };
  assert.deepEqual(state.attachmentsNeedingRetry([{ file: first, cloudConfirmed: true }, { file: second, cloudConfirmed: false }]), [second]);
  assert.match(state.saveFailureMessage(new Error('Network unavailable')), /Network unavailable/);
});
test('low-bandwidth policies limit portfolio aggregation and protect active daily entry from refresh', () => {
  const network = load('src/lib/lowBandwidth.ts');
  assert.equal(network.needsPortfolioCollections('project_director'), true);
  assert.equal(network.needsPortfolioCollections('field_employee'), false);
  assert.equal(network.mayRefreshWorkspace({ online: true, visible: true, activeTab: 'dashboard' }), true);
  assert.equal(network.mayRefreshWorkspace({ online: true, visible: true, activeTab: 'daily' }), false);
  assert.equal(network.mayRefreshWorkspace({ online: false, visible: true, activeTab: 'dashboard' }), false);
});
test('WhatsApp adapter normalizes valid events and rejects malformed events or bad signatures', () => {
  const whatsapp = load('src/lib/server/whatsappAdapter.ts');
  const event = whatsapp.normalizeOpenWaEvent({ id: 'provider-1', from: '+977 9800000000', type: 'image', text: '42 m3' });
  assert.equal(event.providerMessageId, 'provider-1');
  assert.equal(event.senderWhatsAppNumber, '+9779800000000');
  assert.equal(event.messageType, 'image');
  assert.equal(whatsapp.normalizeOpenWaEvent({ type: 'text' }), null);
  const crypto = nativeRequire('node:crypto'); const body = '{"id":"provider-1"}'; const secret = 'test-secret';
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(whatsapp.verifyOpenWaSignature(body, signature, secret), true);
  assert.equal(whatsapp.verifyOpenWaSignature(body, 'bad', secret), false);
});
test('WhatsApp identity resolver has no number-to-user fallback', async () => {
  const whatsapp = load('src/lib/server/whatsappAdapter.ts');
  assert.equal(await whatsapp.unavailableIdentityResolver.resolve('+9779800000000'), null);
});
test('communication identities are person-scoped, normalized, and preserve multi-project assignments', () => {
  const communication = load('src/lib/communicationIdentity.ts');
  assert.equal(communication.normalizeNepalWhatsAppNumber('9812 345 678'), '+9779812345678');
  assert.equal(communication.normalizeNepalWhatsAppNumber('+977 9812345678'), '+9779812345678');
  assert.equal(communication.normalizeNepalWhatsAppNumber('+1 202 555 0100'), null);
  const identity = { id: 'ci1', organizationId: 'o1', personId: 'ram', channel: 'WHATSAPP', provider: 'GENERIC', normalizedAddress: '+9779812345678', pairingState: 'VERIFIED', createdAt: 'x', updatedAt: 'x' };
  const assignments = [{ organizationId: 'o1', projectId: 'pA', personId: 'ram', role: 'site_engineer' }, { organizationId: 'o1', projectId: 'pB', personId: 'ram', role: 'site_engineer' }];
  assert.equal(communication.projectContextsForCommunicationIdentity(assignments, identity).length, 2);
  assert.equal(communication.hasAmbiguousCommunicationProjectContext(assignments, identity), true);
  assert.equal(communication.isUsableVerifiedCommunicationIdentity({ pairingState: 'PENDING' }), false);
  assert.equal(communication.isUsableVerifiedCommunicationIdentity({ pairingState: 'REVOKED' }), false);
  assert.equal(communication.allowedPairingTransition('UNVERIFIED', 'VERIFIED'), false);
  assert.equal(communication.allowedPairingTransition('PENDING', 'REVOKED'), true);
});
test('communication identity administration requires tenant-scoped user-management authority and never changes notification routing', () => {
  const communication = load('src/lib/communicationIdentity.ts');
  const valid = { organizationId: 'o1', actorPersonId: 'director', canManageUsers: true, targetPersonId: 'ram', targetAssignments: [{ organizationId: 'o1', projectId: 'pA', personId: 'ram', role: 'site_engineer' }] };
  assert.equal(communication.authorizeCommunicationIdentityAdministration(valid).allowed, true);
  assert.equal(communication.authorizeCommunicationIdentityAdministration({ ...valid, canManageUsers: false }).allowed, false);
  assert.equal(communication.authorizeCommunicationIdentityAdministration({ ...valid, targetAssignments: [{ organizationId: 'o2', projectId: 'foreign', personId: 'ram', role: 'site_engineer' }] }).allowed, false);
  const routing = load('src/lib/notificationRouting.ts');
  const resolution = routing.resolveNotificationRecipients({ id: 'unchanged', type: 'field_update_created', organizationId: 'o1', projectId: 'pA', actorPersonId: 'ram', occurredAt: '2026-09-24T10:00:00.000Z', source: 'WHATSAPP', scope: 'project' }, { projectMemberships: [{ organizationId: 'o1', projectId: 'pA', personId: 'ram', active: true }], reportingRelationships: [], organizationRecipients: [] });
  assert.equal(resolution.status, 'accepted');
  assert.deepEqual([...resolution.recipientPersonIds], []);
});
test('canonical field updates require verified inbound identity and explicit multi-project context', async () => {
  const command = load('src/lib/server/canonicalFieldUpdate.ts');
  const operations = new Map(); const saved = [];
  const store = {
    find: async id => operations.get(id) || null,
    claim: async id => { if (operations.has(id)) return 'duplicate'; operations.set(id, { operationId: id }); return 'claimed'; },
    complete: async (id, value) => { operations.set(id, { operationId: id, outcome: value }); }, fail: async () => {},
  };
  const persistence = { create: async (candidate, id) => { saved.push({ candidate, id }); return { recordId: `record-${id}` }; } };
  const events = { publish: async () => {} };
  const projects = [
    { projectId: 'pA', organizationId: 'o1', personId: 'ram', canSubmitDailyWork: true, activities: [{ id: 'a1', wbsCode: '01', name: 'Brickwork', unit: 'm2' }] },
    { projectId: 'pB', organizationId: 'o1', personId: 'ram', canSubmitDailyWork: true, activities: [{ id: 'b1', wbsCode: '01', name: 'Concrete', unit: 'm3' }] },
  ];
  const base = { personId: 'ram', organizationId: 'o1', projects, communicationIdentity: { personId: 'ram', organizationId: 'o1', pairingState: 'VERIFIED' } };
  assert.equal((await command.createCanonicalFieldUpdate({ operationId: 'wa-1', source: 'WHATSAPP', description: 'done' }, base, store, persistence, events)).code, 'PROJECT_CONTEXT_REQUIRED');
  assert.equal((await command.createCanonicalFieldUpdate({ operationId: 'wa-2', source: 'WHATSAPP', projectId: 'pA', activityId: 'a1', quantity: 3, description: 'done' }, base, store, persistence, events)).code, 'ACCEPTED');
  assert.equal(saved.length, 1);
  assert.equal((await command.createCanonicalFieldUpdate({ operationId: 'wa-3', source: 'WHATSAPP', projectId: 'pA', description: 'done' }, { ...base, communicationIdentity: { ...base.communicationIdentity, pairingState: 'PENDING' } }, store, persistence, events)).code, 'IDENTITY_NOT_VERIFIED');
  assert.equal((await command.createCanonicalFieldUpdate({ operationId: 'wa-4', source: 'WHATSAPP', projectId: 'pA', description: 'done' }, { ...base, communicationIdentity: { ...base.communicationIdentity, pairingState: 'REVOKED' } }, store, persistence, events)).code, 'IDENTITY_NOT_VERIFIED');
});
test('canonical field updates reject foreign activity, require activity for quantity, and safely deduplicate retries', async () => {
  const command = load('src/lib/server/canonicalFieldUpdate.ts');
  const completed = new Map(); let creates = 0;
  const operations = { find: async id => completed.get(id) || null, claim: async id => completed.has(id) ? 'duplicate' : (completed.set(id, { operationId: id }), 'claimed'), complete: async (id, value) => completed.set(id, { operationId: id, outcome: value }), fail: async () => {} };
  const context = { personId: 'ram', organizationId: 'o1', projects: [{ projectId: 'pA', organizationId: 'o1', personId: 'ram', canSubmitDailyWork: true, activities: [{ id: 'a1', wbsCode: '01', name: 'Brickwork' }] }] };
  const persistence = { create: async () => ({ creates: ++creates, recordId: 'record-1' }) }; const events = { publish: async () => {} };
  assert.equal((await command.createCanonicalFieldUpdate({ operationId: 'foreign', source: 'WEB', projectId: 'pA', activityId: 'foreign', description: 'done' }, context, operations, persistence, events)).code, 'ACTIVITY_NOT_FOUND');
  assert.equal((await command.createCanonicalFieldUpdate({ operationId: 'quantity', source: 'MOBILE', projectId: 'pA', quantity: 5 }, context, operations, persistence, events)).code, 'ACTIVITY_REQUIRED');
  assert.equal((await command.createCanonicalFieldUpdate({ operationId: 'unknown-wbs', source: 'WEB', projectId: 'pA', wbsCode: '99', description: 'done' }, context, operations, persistence, events)).code, 'ACTIVITY_NOT_FOUND');
  const ambiguousContext = { ...context, projects: [{ ...context.projects[0], activities: [...context.projects[0].activities, { id: 'a2', wbsCode: '01', name: 'Other brickwork' }] }] };
  assert.equal((await command.createCanonicalFieldUpdate({ operationId: 'ambiguous-wbs', source: 'WEB', projectId: 'pA', wbsCode: '01', description: 'done' }, ambiguousContext, operations, persistence, events)).code, 'ACTIVITY_AMBIGUOUS');
  assert.equal((await command.createCanonicalFieldUpdate({ operationId: 'same', source: 'WEB', projectId: 'pA', activityId: 'a1', description: 'Paid Ram 5000' }, context, operations, persistence, events)).code, 'ACCEPTED');
  assert.equal((await command.createCanonicalFieldUpdate({ operationId: 'same', source: 'WHATSAPP', projectId: 'pA', activityId: 'a1', description: 'Paid Ram 5000' }, context, operations, persistence, events)).code, 'DUPLICATE');
  assert.equal(creates, 1);
});
test('WhatsApp inbound adapter requires a verified sender, preserves opaque media, and asks one project question', async () => {
  const inbound = load('src/lib/server/whatsappInboundFieldUpdate.ts');
  const event = { provider: 'openwa', providerMessageId: 'evt-1', channel: 'WHATSAPP', senderAddress: '+9779800000000', receivedAt: '2026-09-24T10:00:00.000Z', text: 'BOQ 01 35 m2 completed', media: [{ kind: 'photo', providerReference: 'provider-media-1' }] };
  const contexts = [];
  const conversations = { findByMessage: async () => null, findActive: async () => null, save: async context => contexts.push(context), resolve: async () => {} };
  const sender = { status: 'verified', personId: 'ram', organizations: [{ organizationId: 'o1', communicationIdentity: { personId: 'ram', organizationId: 'o1', pairingState: 'VERIFIED' }, projectLabels: [{ id: 'pA', name: 'Kathmandu Apartment' }, { id: 'pB', name: 'Pokhara Hotel' }], projects: [
    { projectId: 'pA', organizationId: 'o1', personId: 'ram', canSubmitDailyWork: true, activities: [] },
    { projectId: 'pB', organizationId: 'o1', personId: 'ram', canSubmitDailyWork: true, activities: [] },
  ] }] };
  const command = { create: async input => input.projectId ? { code: 'ACCEPTED', message: 'Field update recorded.' } : { code: 'PROJECT_CONTEXT_REQUIRED', message: 'Choose the project for this update.' } };
  const first = await inbound.processInboundWhatsAppFieldUpdate(event, { resolveSender: async () => sender, conversations, command });
  assert.equal(first.code, 'PROJECT_CONTEXT_REQUIRED');
  assert.equal(first.pendingMedia.length, 1);
  assert.equal(first.pendingMedia[0].providerReference, 'provider-media-1');
  assert.equal(contexts.length, 1);
  conversations.findByMessage = async () => contexts[0];
  assert.equal((await inbound.processInboundWhatsAppFieldUpdate(event, { resolveSender: async () => sender, conversations, command })).code, 'DUPLICATE');
  conversations.findByMessage = async () => null;
  conversations.findActive = async () => contexts[0];
  const second = await inbound.processInboundWhatsAppFieldUpdate({ ...event, providerMessageId: 'evt-2', text: '1', media: [] }, { resolveSender: async () => sender, conversations, command });
  assert.equal(second.code, 'ACCEPTED');
  const unknown = await inbound.processInboundWhatsAppFieldUpdate({ ...event, providerMessageId: 'evt-3' }, { resolveSender: async () => ({ status: 'unknown' }), conversations, command });
  assert.equal(unknown.code, 'IDENTITY_NOT_VERIFIED');
});
test('WhatsApp inbound adapter does not trust stale project context or arbitrary media URLs', async () => {
  const inbound = load('src/lib/server/whatsappInboundFieldUpdate.ts');
  const parsed = inbound.parseInboundFieldUpdate({ provider: 'openwa', providerMessageId: 'm1', channel: 'WHATSAPP', senderAddress: '+9779800000000', receivedAt: '2026-09-24T10:00:00.000Z', text: 'BOQ 77 25 m3 done', media: [{ kind: 'audio', providerReference: 'https://untrusted.example/audio' }, { kind: 'audio', providerReference: 'provider-audio-1' }] });
  assert.equal(parsed.wbsCode, '77');
  assert.equal(parsed.quantity, 25);
  assert.equal(parsed.pendingMedia.length, 1);
  let projectId;
  const stale = { id: 'c1', provider: 'openwa', originProviderMessageId: 'origin', lastProviderMessageId: 'origin', personId: 'ram', organizationId: 'o1', question: 'project', input: { description: 'done' }, options: [{ id: 'pA', label: 'Old project' }], expiresAt: '2099-01-01T00:00:00.000Z', state: 'pending' };
  const result = await inbound.processInboundWhatsAppFieldUpdate({ provider: 'openwa', providerMessageId: 'select-1', channel: 'WHATSAPP', senderAddress: '+9779800000000', receivedAt: '2026-09-24T10:00:00.000Z', text: '1' }, {
    resolveSender: async () => ({ status: 'verified', personId: 'ram', organizations: [] }),
    conversations: { findByMessage: async () => null, findActive: async () => stale, save: async () => {}, resolve: async () => {} },
    command: { create: async input => { projectId = input.projectId; return { code: 'ACCEPTED', message: 'should not run' }; } },
  });
  assert.equal(result.code, 'UNAUTHORIZED');
  assert.equal(projectId, undefined);
});
test('canonical evidence media enforces project ownership, opaque objects, state transitions, and retryable association failures', async () => {
  const evidence = load('src/lib/server/evidenceMedia.ts');
  const rows = new Map();
  const store = {
    find: async (org, provider, object) => [...rows.values()].find(item => item.organizationId === org && item.storageProvider === provider && item.providerObjectId === object) || null,
    create: async record => { rows.set(record.id, record); },
    update: async (id, change) => { const next = { ...rows.get(id), ...change }; rows.set(id, next); return next; },
  };
  const context = { personId: 'ram', organizationId: 'o1', projectId: 'pA', canUploadEvidence: true };
  const base = { operationId: 'wa-event-1', source: 'WHATSAPP', mediaType: 'IMAGE', storageProvider: 'WHATSAPP_PROVIDER', providerObjectId: 'opaque-media-1', mimeType: 'image/jpeg', sizeBytes: 12 };
  const created = await evidence.createEvidenceReference(base, context, store);
  assert.equal(created.code, 'ACCEPTED'); assert.equal(created.evidence.status, 'PENDING');
  assert.equal((await evidence.createEvidenceReference(base, context, store)).code, 'DUPLICATE');
  assert.equal((await evidence.createEvidenceReference({ ...base, operationId: 'bad', providerObjectId: 'https://bad.example/file' }, context, store)).code, 'INVALID_INPUT');
  const ingested = await evidence.markEvidenceIngested(created.evidence, context, store);
  assert.equal(ingested.evidence.status, 'INGESTED');
  const failed = await evidence.attachEvidenceToCanonicalRecord(ingested.evidence, 'foreign-record', context, store, { belongsToProject: async () => false });
  assert.equal(failed.code, 'CONFLICT'); assert.equal(failed.evidence.status, 'FAILED');
  const retry = await evidence.markEvidenceIngested(failed.evidence, context, store);
  const attached = await evidence.attachEvidenceToCanonicalRecord(retry.evidence, 'daily-report-1', context, store, { belongsToProject: async (_id, project, org) => project === 'pA' && org === 'o1' });
  assert.equal(attached.evidence.status, 'ATTACHED');
  assert.equal((await evidence.createEvidenceReference({ ...base, operationId: 'audio', providerObjectId: 'opaque-audio-1', mediaType: 'AUDIO' }, { ...context, projectId: 'pB' }, store)).code, 'ACCEPTED');
  assert.equal((await evidence.createEvidenceReference({ ...base, operationId: 'denied', providerObjectId: 'opaque-doc-1', mediaType: 'DOCUMENT' }, { ...context, canUploadEvidence: false }, store)).code, 'UNAUTHORIZED');
});
test('organization storage classifies ownership without inferring it from identity and preserves legacy resolution', () => {
  const storage = load('src/lib/server/organizationStorage.ts');
  assert.equal(storage.classifyStorageOwnership({ providerRootId: 'root-1' }), 'PERSONAL_DRIVE');
  assert.equal(storage.classifyStorageOwnership({ providerRootId: 'root-1', sharedDriveId: 'shared-1' }), 'SHARED_DRIVE');
  assert.equal(storage.classifyStorageOwnership({ providerRootId: 'root-1', organizationVerified: true }), 'ORGANIZATION_CONTROLLED');
  assert.equal(storage.classifyStorageOwnership({ providerRootId: 'https://outside.example/root' }), null);
  assert.equal(storage.canManageOrganizationStorage('business_admin', true), true);
  assert.equal(storage.canManageOrganizationStorage('site_engineer', true), false);
  assert.equal(storage.canManageOrganizationStorage('project_director', false), false);
  const legacy = storage.organizationStorageView({ kind: 'legacy_personal', projectId: 'p1', organizationId: 'o1', projectFolderId: 'folder-1', connectedBy: 'director-1' });
  assert.equal(legacy.kind, 'legacy_personal');
  assert.equal(legacy.ownershipType, 'PERSONAL_DRIVE');
  assert.equal(legacy.projectFolderReady, true);
});
test('organization storage reports Shared Drive discovery as unavailable with current drive.file scope', () => {
  const storage = load('src/lib/server/organizationStorage.ts');
  assert.equal(storage.googleSharedDriveCapability(['https://www.googleapis.com/auth/drive.file']).canDiscoverSharedDrives, false);
  assert.equal(storage.googleSharedDriveCapability(['https://www.googleapis.com/auth/drive.metadata.readonly']).canDiscoverSharedDrives, true);
  assert.equal(storage.googleSharedDriveCapability(['https://www.googleapis.com/auth/drive.metadata.readonly']).canVerifySharedDriveWrite, false);
});
test('organization storage management is tenant-scoped leadership only and does not grant project access', async () => {
  const director = modules('src/lib/server/organizationStorage.ts', fixture('project_director'));
  assert.equal((await director.authorizeOrganizationStorageRequest(request({}), 'p1')).role, 'project_director');
  assert.equal((await director.authorizeOrganizationStorageRequest(request({}), 'p2')).status, 403);
  const staff = modules('src/lib/server/organizationStorage.ts', fixture('site_engineer'));
  assert.equal((await staff.authorizeOrganizationStorageRequest(request({}), 'p1')).status, 403);
});
test('OpenWA remains disabled by default, validates signed opaque events, and never trusts provider tenant metadata', () => {
  const adapter = load('src/lib/server/whatsappAdapter.ts', {}, {});
  assert.equal(adapter.whatsappConfig().enabled, false);
  const raw = JSON.stringify({ id: 'evt-1', from: '+9779812345678', type: 'image', mediaReference: 'opaque-media-1', organizationId: 'foreign', projectId: 'foreign-project' });
  const signature = nativeRequire('node:crypto').createHmac('sha256', 'secret').update(raw).digest('hex');
  assert.equal(adapter.verifyOpenWaSignature(raw, `sha256=${signature}`, 'secret'), true);
  assert.equal(adapter.verifyOpenWaSignature(raw, signature, 'wrong-secret'), false);
  assert.equal(adapter.normalizeOpenWaEvent({ from: '+9779812345678' }), null);
  const normalized = adapter.normalizeOpenWaEvent(JSON.parse(raw));
  const inbound = adapter.toProviderInboundWhatsAppEvent(normalized);
  assert.equal(inbound.providerMessageId, 'evt-1');
  assert.equal(Object.hasOwn(inbound, 'organizationId'), false);
  assert.equal(Object.hasOwn(inbound, 'projectId'), false);
  assert.equal(adapter.queueOpenWaOutboundIntent({ recipientWhatsAppNumber: '+9779812345678', content: 'Update' }).status, 'PENDING_UNSUPPORTED');
});
test('OpenWA requires both server activation switches and only forwards opaque media references', async () => {
  const onlyFirstSwitch = load('src/lib/server/whatsappAdapter.ts', {}, { WHATSAPP_ENABLED: 'true' });
  const onlySecondSwitch = load('src/lib/server/whatsappAdapter.ts', {}, { OPENWA_TRANSPORT_ACTIVATED: 'true' });
  const enabled = load('src/lib/server/whatsappAdapter.ts', {}, { WHATSAPP_ENABLED: 'true', OPENWA_TRANSPORT_ACTIVATED: 'true' });
  assert.equal(onlyFirstSwitch.whatsappConfig().enabled, false);
  assert.equal(onlySecondSwitch.whatsappConfig().enabled, false);
  assert.equal(enabled.whatsappConfig().enabled, true);
  const inbound = enabled.toProviderInboundWhatsAppEvent(enabled.normalizeOpenWaEvent({ id: 'evt-opaque', from: '+9779812345678', type: 'image', mediaReference: 'opaque-id-1' }));
  assert.equal(JSON.stringify(inbound.media), JSON.stringify([{ kind: 'photo', providerReference: 'opaque-id-1' }]));
  assert.equal(inbound.media[0].storageConfirmed, undefined);
  const route = modules('src/app/api/whatsapp/openwa/route.ts', fixture());
  assert.equal((await route.POST(request({ id: 'evt-disabled', from: '+9779812345678' }))).status, 503);
});
test('OpenWA provider configuration is leadership-only and public health never exposes endpoint or secret metadata', async () => {
  const provider = modules('src/lib/server/openwaProvider.ts', fixture('business_admin'));
  assert.equal((await provider.authorizeOpenWaManagement(request({}), 'p1')).role, 'business_admin');
  assert.equal((await provider.authorizeOpenWaManagement(request({}), 'p2')).status, 403);
  const staff = modules('src/lib/server/openwaProvider.ts', fixture('site_engineer'));
  assert.equal((await staff.authorizeOpenWaManagement(request({}), 'p1')).status, 403);
  assert.equal(provider.safeOpenWaConfigurationInput({ state: 'CONFIGURED', endpointBaseUrl: 'https://openwa.example', webhookSecretRef: 'openwa-secret-v1' }).state, 'CONFIGURED');
  assert.equal(provider.safeOpenWaConfigurationInput({ state: 'ENABLED', endpointBaseUrl: 'https://openwa.example', webhookSecretRef: 'x' }), null);
  const health = provider.openWaHealthView({ id: 'c1', organization_id: 'o1', provider: 'OPENWA', state: 'CONFIGURED', endpoint_base_url: 'https://private.example', webhook_secret_ref: 'secret-ref', last_health_at: null, last_health_state: null, last_error_code: null, configured_by: 'u1', updated_at: '2026-09-25T00:00:00.000Z' });
  assert.equal(Object.hasOwn(health, 'endpointBaseUrl'), false);
  assert.equal(Object.hasOwn(health, 'webhookSecretRef'), false);
});
test('CTMS OpenWA gateway keeps provider credentials server-side and returns only an authorized pairing QR', async () => {
  const calls = [];
  const gateway = load('src/lib/server/openwaGateway.ts', {}, {
    WHATSAPP_OPENWA_ENDPOINT: 'https://openwa.example',
    WHATSAPP_OPENWA_API_KEY: 'server-only-key',
    WHATSAPP_OPENWA_SESSION_ID: 'tenant-session',
  }, {
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method || 'GET', key: new Headers(init.headers).get('x-api-key') });
      if (String(url).endsWith('/start')) return new Response('{}', { status: 202 });
      if (String(url).endsWith('/qr')) return Response.json({ qrCode: 'data:image/png;base64,AA==' });
      return Response.json({ name: 'tenant-session', status: 'disconnected' });
    },
  });
  const status = await gateway.readManagedOpenWaSession();
  assert.equal(status.available, true);
  assert.equal(status.status, 'DISCONNECTED');
  assert.equal(Object.hasOwn(status, 'apiKey'), false);
  const pairing = await gateway.startManagedOpenWaPairing();
  assert.equal(pairing.status, 'PAIRING');
  assert.match(pairing.qrDataUrl, /^data:image\/png;base64,/);
  assert.equal(calls.every(call => call.key === 'server-only-key'), true);
  assert.equal(calls.some(call => call.url.includes('/api/sessions/tenant-session/start') && call.method === 'POST'), true);
});
test('CTMS OpenWA gateway fails closed when deployment credentials are incomplete', async () => {
  const gateway = load('src/lib/server/openwaGateway.ts', {}, { WHATSAPP_OPENWA_ENDPOINT: 'https://openwa.example' });
  const status = await gateway.readManagedOpenWaSession();
  assert.equal(status.available, false);
  assert.equal(status.status, 'UNAVAILABLE');
});
test('SQL role lists match the application role lists (not a database execution test)', () => {
  const { ROLE_PERMISSIONS } = load('src/lib/permissions.ts');
  const sql = fs.readFileSync(path.join(root, 'supabase_phase1a_authorization.sql'), 'utf8');
  const sqlRoles = JSON.parse(sql.match(/'(\{"super_admin":.*\})'::jsonb/)[1]);
  for (const [role, features] of Object.entries(ROLE_PERMISSIONS)) {
    if (role !== 'project_director') assert.equal(JSON.stringify(sqlRoles[role]), JSON.stringify(features), role);
  }
});
test('tenant/project membership and platform boundary are enforced by shared server gate', async () => {
  const f = fixture(); const auth = modules('src/lib/server/projectAuthorization.ts', f);
  assert.equal((await auth.authorizeProjectUser(f.db, 'u1', 'p1', 'manage_users', 'write')).role, 'project_director');
  assert.equal((await auth.authorizeProjectUser(f.db, 'u1', 'p2', 'manage_users', 'write')).status, 403);
  assert.equal((await auth.authorizeProjectUser(f.db, 'u1', 'p3', 'manage_users', 'write')).status, 403);
  const platform = fixture('project_director', {}, { platform: true });
  assert.equal((await auth.authorizeProjectUser(platform.db, 'u1', 'p1', 'expenses')).status, 403);
  const inactive = fixture('project_director', {}, { inactive: true });
  assert.equal((await auth.authorizeProjectUser(inactive.db, 'u1', 'p1', 'expenses')).status, 403);
});
test('AI rejects unauthenticated/invalid sessions before provider usage', async () => {
  const route = modules('src/app/api/ai/route.ts', fixture(), { fetch: () => { throw Error('provider must not run'); } });
  assert.equal((await route.POST(request({}, ''))).status, 401);
  assert.equal((await route.POST(request({ prompt: 'x', projectId: 'p1', useCase: 'tender' }, 'invalid'))).status, 401);
});
test('AI denies other projects and denied features', async () => {
  const route = modules('src/app/api/ai/route.ts', fixture('planning_engineer', { schedule: 'none' }), { fetch: () => { throw Error('provider must not run'); } });
  for (const projectId of ['p1', 'p2']) assert.equal((await route.POST(request({ prompt: 'x', projectId, useCase: 'tender' }))).status, 403);
});
test('AI preserves legitimate tender use with verified project context', async () => {
  let called = false;
  const route = modules('src/app/api/ai/route.ts', fixture('planning_engineer'), { fetch: async () => { called = true; return Response.json({ choices: [{ message: { content: 'result' } }] }); } });
  const response = await route.POST(request({ prompt: 'x', projectId: 'p1', useCase: 'tender' }));
  assert.equal(response.status, 200); assert.equal(called, true);
});
test('Google upload rejects feature denial before reading files', async () => {
  const f = fixture('site_engineer', { upload_evidence: 'none' });
  const route = load('src/app/api/google/upload/route.ts', {
    '@supabase/supabase-js': { createClient: () => f.db }, 'next/server': { NextResponse: Response },
    '../../../../lib/server/googleWorkspace': { getGoogleWorkspaceConfig: () => ({}) },
  }, serverEnv);
  const req = request({}); req.headers.set('x-buildtrack-project', 'p1');
  assert.equal((await route.POST(req)).status, 403);
});
test('Google status requires authorized project access before exposing integration state', async () => {
  const route = modules('src/app/api/google/status/route.ts', fixture('site_engineer'));
  assert.equal((await route.GET(request(undefined, '', 'GET', 'https://app.test/api/google/status?projectId=p1'))).status, 401);
  assert.equal((await route.GET(request(undefined, 'valid', 'GET', 'https://app.test/api/google/status?projectId=p2'))).status, 403);
  assert.equal((await route.GET(request(undefined, 'valid', 'GET', 'https://app.test/api/google/status?projectId=p1'))).status, 200);
});
test('Google permits legitimate upload capability but never another project', async () => {
  const f = fixture('site_engineer'); const auth = modules('src/lib/server/googleConnection.ts', f);
  assert.equal((await auth.authorizeGoogleRequest(request({}), 'p1', ['site_engineer'], 'upload_evidence', 'write')).role, 'site_engineer');
  assert.equal((await auth.authorizeGoogleRequest(request({}), 'p2', ['site_engineer'], 'upload_evidence', 'write')).status, 403);
});
test('Business Admin cannot self-promote or grant Director, but can provision ordinary staff', async () => {
  const f = fixture('business_admin'); const route = modules('src/app/api/admin/users/route.ts', f);
  const body = { name: 'Name', projectId: 'p1', email: 'actor@example.test', role: 'project_director' };
  assert.equal((await route.POST(request(body))).status, 403);
  assert.equal((await route.POST(request({ ...body, role: 'site_engineer' }))).status, 403);
  assert.equal((await route.POST(request({ ...body, email: 'new@example.test', role: 'site_engineer' }))).status, 200);
  assert.equal(f.writes.some(item => item.table === 'organization_members'), false);
});
test('Business Admin can assign the same person to another project in the tenant without creating a new identity', async () => {
  const f = fixture('business_admin');
  f.rows.organization_members.push({ organization_id: 'a', auth_user_id: 'u1', email: 'actor@example.test', name: 'Actor', role: 'business_admin', status: 'active' });
  const route = modules('src/app/api/admin/users/route.ts', f);
  const response = await route.POST(request({ name: 'Staff', email: 'staff@example.test', projectId: 'p3', role: 'store_officer' }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.reusedAccount, true);
  assert.equal(body.personId, 'u2');
  assert.equal(body.user.role, 'store_officer');
});
test('assignment removal removes only project access, never the stable person identity', async () => {
  const f = fixture(); const route = modules('src/app/api/admin/users/route.ts', f);
  const response = await route.DELETE(request({ projectId: 'p1', membershipId: 'm2' }, 'valid', 'DELETE'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.personId, 'u2');
  assert.equal(body.projectId, 'p1');
  assert.equal(f.writes.some(item => item.table === 'auth.users'), false);
});
test('cross-tenant person assignment is rejected before membership mutation', async () => {
  const f = fixture(); const route = modules('src/app/api/admin/users/route.ts', f);
  const response = await route.POST(request({ name: 'Staff', email: 'staff@example.test', projectId: 'p2', role: 'site_engineer' }));
  assert.equal(response.status, 403);
});
test('Director cannot change own authorization or a foreign project membership; can edit own staff', async () => {
  const f = fixture(); const route = modules('src/app/api/admin/users/route.ts', f);
  const body = { projectId: 'p1', membershipId: 'm1', role: 'site_engineer', featurePermissions: { expenses: 'none' } };
  assert.equal((await route.PATCH(request(body, 'valid', 'PATCH'))).status, 403);
  assert.equal((await route.PATCH(request({ ...body, membershipId: 'm3' }, 'valid', 'PATCH'))).status, 403);
  assert.equal((await route.PATCH(request({ ...body, projectId: 'p2', membershipId: 'm3' }, 'valid', 'PATCH'))).status, 403);
  assert.equal((await route.PATCH(request({ ...body, membershipId: 'm2' }, 'valid', 'PATCH'))).status, 200);
});
test('platform metadata authorization requires real platform identity, never demo cookie', async () => {
  const f = fixture('project_director', {}, { platform: true });
  const auth = modules('src/lib/server/platformAdmin.ts', f);
  assert.equal((await auth.authorizePlatformOwner(request({}))).actorId, 'u1');
  const req = request({}, ''); req.headers.set('cookie', 'buildtrack_demo_session=forged');
  assert.equal((await auth.authorizePlatformOwner(req)).status, 403);
  const tenant = modules('src/lib/server/platformAdmin.ts', fixture());
  assert.equal((await tenant.authorizePlatformOwner(request({}))).status, 403);
});
test('platform overview retains metadata response without tenant operational tables', async () => {
  const f = fixture('project_director', {}, { platform: true });
  const route = modules('src/app/api/platform/overview/route.ts', f);
  const result = await route.GET(request(undefined, 'valid', 'GET'));
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.businesses[0].id, 'a');
  assert.equal(body.projects, undefined);
  assert.equal(body.employees, undefined);
  assert.equal(body.documents, undefined);
});
test('normal member cannot mutate membership, Business Admin cannot mutate another project', async () => {
  const member = modules('src/app/api/admin/users/route.ts', fixture('site_engineer'));
  const body = { projectId: 'p1', membershipId: 'm1', role: 'site_engineer', featurePermissions: { expenses: 'write' } };
  assert.equal((await member.PATCH(request(body, 'valid', 'PATCH'))).status, 403);
  const admin = modules('src/app/api/admin/users/route.ts', fixture('business_admin'));
  assert.equal((await admin.POST(request({ projectId: 'p2', name: 'Other', email: 'other@example.test', role: 'site_engineer' }))).status, 403);
});
test('demo gate only permits development without managed cloud; production hashes cannot enable it', async () => {
  for (const env of [serverEnv, { NODE_ENV: 'production', BUILDTRACK_DEMO_PASSWORD_HASHES_JSON: '{}' }, { NODE_ENV: 'development', NEXT_PUBLIC_SUPABASE_URL: 'cloud' }]) {
    const security = load('src/lib/server/security.ts', {}, env);
    assert.equal(security.demoAuthEnabled(), false);
    assert.equal(await security.readDemoSession('anything'), null);
  }
  const security = load('src/lib/server/security.ts', {}, { NODE_ENV: 'development' });
  assert.equal(security.demoAuthEnabled(), true);
  const signed = await security.createDemoSession({ id: 'demo', email: 'demo@example.test', role: 'site_engineer', name: 'Demo' });
  assert.equal((await security.readDemoSession(signed)).id, 'demo');
});

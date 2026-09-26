import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const cache = new Map();
function load(relativePath) {
  const file = path.resolve(relativePath); if (cache.has(file)) return cache.get(file);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} }; cache.set(file, loaded.exports);
  const require = (specifier) => {
    if (!specifier.startsWith('.')) throw new Error(`Unexpected dependency ${specifier}`);
    return load(path.join(path.dirname(relativePath), `${specifier}.ts`));
  };
  new vm.Script(compiled, { filename: file }).runInNewContext({ module: loaded, exports: loaded.exports, require, crypto: globalThis.crypto, Date, Math, JSON, URL, URLSearchParams }); cache.set(file, loaded.exports); return loaded.exports;
}
const store = () => { const rows = new Map(); return { getItem: key => rows.get(key) || null, setItem: (key, value) => rows.set(key, value) }; };

test('project switch changes report context and never renders the previous project workspace', () => {
  const context = load('src/lib/projectContext.ts');
  assert.equal(context.workspaceUrl('https://ctms.test/?project=A&tab=reports', 'B'), '/?project=B');
  assert.equal(context.isCurrentProject('A', 'B'), false);
  const page = fs.readFileSync('src/app/page.tsx', 'utf8'); const reports = fs.readFileSync('src/components/ReportCenter.tsx', 'utf8');
  assert.match(page, /<ReportCenter key=\{project\.id\} projectId=\{project\.id\}/);
  assert.match(reports, /\[projectId, type\]/);
  assert.match(reports, /encodeURIComponent\(projectId\)/);
});

test('pending mutation scope survives project switching and BOQ import preserves historical work', () => {
  const { DurableMutationOutbox } = load('src/lib/durableMutationOutbox.ts');
  const outbox = new DurableMutationOutbox(store());
  outbox.enqueue({ id: 'a-1', kind: 'daily_work_update', organizationId: 'o1', projectId: 'A', actorId: 'u1', targetId: 'r1', affectedLocalKeys: ['bt_daily_reports'], payload: {} });
  assert.equal(outbox.pendingForProject('B', 'u1').length, 0);
  assert.equal(outbox.pendingForProject('A', 'u1')[0].projectId, 'A');
  const { mergeBoqSchedule } = load('src/lib/boqSafety.ts');
  const result = mergeBoqSchedule({ projectId: 'B', wbs: [], activities: [], dependencies: [], existingWbs: [], existingActivities: [{ id: 'a1', project_id: 'B', wbs_code: '01', actual_quantity: 5, status: 'in_progress' }], existingDependencies: [] });
  assert.equal(result.ok, true); assert.equal(result.activities[0].actual_quantity, 5);
});

test('measurement, valuation, certificate and report totals retain their distinct immutable values', () => {
  const { valuationLine } = load('src/lib/ipcValuation.ts'); const { calculateCertificate } = load('src/lib/paymentCertificate.ts'); const { buildProjectReport } = load('src/lib/server/projectReport.ts');
  const line = valuationLine(2, 3, 100, 10); assert.deepEqual(JSON.parse(JSON.stringify(line)), { previousQuantity: 2, currentQuantity: 3, cumulativeQuantity: 5, rate: 100, currentValue: 300, cumulativeValue: 500, exceedsBoq: false });
  const certificate = calculateCertificate(line.currentValue, [{ kind: 'retention', amount: 30 }, { kind: 'advance_recovery', amount: 20 }]); assert.equal(certificate.netCertifiedAmount, 250);
  const report = buildProjectReport({ type: 'ipc', project: { name: 'B', contract_amount: 1000 }, organizationId: 'o1', projectId: 'B', generatedAt: '2026-09-26T00:00:00.000Z', dailyReports: [], activities: [], ipcRows: [{ organization_id: 'o1', project_id: 'B', status: 'certified', claimed_amount: 300, certified_amount: 300, retention_deducted: 30, advance_recovered: 20, paid_amount: 100 }], commercialRows: [], qualityRows: [], safetyRows: [], handoverRows: [], expenseRows: [] });
  assert.equal(report.financials.netPayableAmount, 250); assert.equal(report.financials.outstandingAmount, 150);
});

test('server boundaries retain authorization, tenant/project filters, commercial lifecycle and view-detail isolation', () => {
  const permissions = load('src/lib/permissions.ts'); const commercial = load('src/lib/commercialLifecycle.ts');
  assert.equal(permissions.can('field_employee', 'reports'), false); assert.equal(permissions.can('project_director', 'reports'), true);
  assert.equal(commercial.canTransition('draft', 'submitted'), true); assert.equal(commercial.canTransition('approved', 'draft'), false);
  const route = fs.readFileSync('src/app/api/reports/route.ts', 'utf8'); const detail = fs.readFileSync('src/components/RecordDetailsDialog.tsx', 'utf8'); const expenses = fs.readFileSync('src/components/DailyExpenseDashboard.tsx', 'utf8');
  assert.match(route, /authorizeProjectRequest\(request, projectId, 'reports', 'read'\)/); assert.match(route, /organization_id', org\)\.eq\('project_id', projectId/); assert.match(route, /if \(\(from \|\| to\) && !date\) return false/);
  assert.match(detail, /Full record information for the active project/); assert.match(expenses, /storage\.getDailyExpenses\(\)/); assert.match(expenses, /View details/);
});

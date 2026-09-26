import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const modules = new Map();
function load(relativePath) {
  const file = path.resolve(relativePath); if (modules.has(file)) return modules.get(file);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} }; modules.set(file, loaded.exports);
  const require = (specifier) => {
    if (!specifier.startsWith('.')) throw new Error(`Unexpected dependency ${specifier}`);
    return load(path.join(path.dirname(relativePath), `${specifier}.ts`));
  };
  new vm.Script(compiled, { filename: file }).runInNewContext({ module: loaded, exports: loaded.exports, require }); modules.set(file, loaded.exports); return loaded.exports;
}

test('report HTML and CSV preserve ordinary text but neutralize injection', () => {
  const safety = load('src/lib/reportSafety.ts');
  assert.equal(safety.escapeReportHtml('<img src=x onerror=alert(1)> & "quoted"'), '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;');
  assert.equal(safety.csvSafeCell('=HYPERLINK("https://attacker")'), '"\'=HYPERLINK(""https://attacker"")"');
  assert.equal(safety.csvSafeCell('Ordinary brickwork'), '"Ordinary brickwork"');
  assert.equal(safety.csvSafeCell(1250), '"1250"');
});

test('reports scope every row to the authorized tenant/project and use canonical financial totals', () => {
  const reports = load('src/lib/server/projectReport.ts');
  const scoped = reports.rowsForReportScope([{ organization_id: 'o1', project_id: 'p1', title: 'Allowed' }, { organization_id: 'o1', project_id: 'p2', title: 'Other project' }, { organization_id: 'o2', project_id: 'p1', title: 'Other tenant' }], 'o1', 'p1');
  assert.equal(scoped.length, 1);
  const report = reports.buildProjectReport({ type: 'ipc', project: { name: '<script>bad</script>', contract_amount: 1000 }, organizationId: 'o1', projectId: 'p1', generatedAt: '2026-09-26T00:00:00.000Z', dailyReports: [], activities: [], ipcRows: [{ organization_id: 'o1', project_id: 'p1', claimed_amount: 700, certified_amount: 600, retention_deducted: 50, advance_recovered: 25, paid_amount: 300, status: 'certified' }, { organization_id: 'o2', project_id: 'p1', claimed_amount: 999 }], commercialRows: [{ organization_id: 'o1', project_id: 'p1', type: 'variation', workflow_status: 'approved', cost_impact_amount: 50 }], qualityRows: [], safetyRows: [], handoverRows: [], expenseRows: [{ organization_id: 'o1', project_id: 'p1', amount: 10 }] });
  assert.equal(report.financials.revisedContractAmount, 1050);
  assert.equal(report.financials.outstandingAmount, 225);
  assert.equal(report.html.includes('<script>bad</script>'), false);
  assert.equal(report.html.includes('&lt;script&gt;bad&lt;/script&gt;'), true);
});

test('report route keeps authorization, project/tenant query filters and safe failure boundaries', () => {
  const source = fs.readFileSync('src/app/api/reports/route.ts', 'utf8');
  assert.match(source, /authorizeProjectRequest\(request, projectId, 'reports', 'read'\)/);
  assert.match(source, /eq\('organization_id', org\)\.eq\('project_id', projectId\)/);
  assert.match(source, /Valid project, report type, format and date filters are required/);
  assert.match(source, /csvSafeRows/);
  const reports = load('src/lib/server/projectReport.ts');
  assert.equal(reports.parseReportType('ipc'), 'ipc');
  assert.equal(reports.parseReportType('admin'), null);
  assert.equal(reports.validReportDate('2026-02-30'), null);
  assert.equal(reports.validReportDate('bad'), null);
});

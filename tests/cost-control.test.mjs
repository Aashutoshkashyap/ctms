import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadMetrics() {
  const source = fs.readFileSync('src/lib/financialMetrics.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedModule = { exports: {} };
  new vm.Script(compiled).runInNewContext({ module: loadedModule, exports: loadedModule.exports });
  return loadedModule.exports;
}

test('cost control reuses canonical financial metrics without changing certified history', () => {
  const { calculateProjectFinancialSummary } = loadMetrics();
  const financials = calculateProjectFinancialSummary({
    contractAmount: 1000,
    commercialRecords: [{ type: 'variation', workflow_status: 'approved', cost_impact_amount: 100 }],
    expenseRows: [{ amount: 125 }],
    ipcRows: [{ status: 'certified', certified_amount: 300, retention_deducted: 30, advance_recovered: 20, paid_amount: 150 }],
  });
  assert.equal(financials.revisedContractAmount, 1100);
  assert.equal(financials.expenseTotal, 125);
  assert.equal(financials.certifiedAmount, 300);
  assert.equal(financials.outstandingAmount, 100);
});

test('cost control API is authorized, project-scoped, and only updates editable cost heads', () => {
  const route = fs.readFileSync('src/app/api/cost-control/route.ts', 'utf8');
  assert.match(route, /authorizeProjectRequest\(request,\s*projectId,\s*'budget',\s*'read'\)/);
  assert.match(route, /authorizeProjectRequest\(request,\s*projectId,\s*'budget',\s*'write'\)/);
  assert.match(route, /daily_expenses'.*organization_id.*project_id/);
  assert.match(route, /ipc_submissions'.*organization_id.*project_id/);
  assert.match(route, /variations_and_claims'.*organization_id.*project_id/);
  assert.match(route, /\.eq\('project_id',\s*projectId\)/);
  assert.match(route, /update\(\{\s*actual_cost:\s*(actualCost|actual)\s*\}\)/);
  assert.doesNotMatch(route, /update\(\{[^}]*certified_amount/);
});

test('cost-control workspace reloads and resets records when the active project changes', () => {
  const ui = fs.readFileSync('src/components/BudgetDashboard.tsx', 'utf8');
  const page = fs.readFileSync('src/app/page.tsx', 'utf8');
  assert.match(ui, /api\/cost-control\?projectId=/);
  assert.match(ui, /\}, \[projectId\]\)/);
  assert.match(page, /key=\{`cost-control-\$\{project\.id\}`\}/);
  assert.match(ui, /View details/);
  assert.match(ui, /Edit cost/);
  assert.match(page, /projectId=\{project\.id\}/);
});

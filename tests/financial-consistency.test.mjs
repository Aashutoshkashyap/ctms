import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const cache = new Map();
function load(relativePath) {
  const file = path.resolve(relativePath);
  if (cache.has(file)) return cache.get(file);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedModule = { exports: {} }; cache.set(file, loadedModule.exports);
  const localRequire = (specifier) => {
    if (specifier.startsWith('.')) return load(path.join(path.dirname(relativePath), `${specifier}.ts`));
    throw new Error(`Unexpected external dependency: ${specifier}`);
  };
  new vm.Script(compiled, { filename: file }).runInNewContext({ module: loadedModule, exports: loadedModule.exports, require: localRequire });
  cache.set(file, loadedModule.exports); return loadedModule.exports;
}

test('canonical BOQ, variations and IPC totals use one rounded definition', () => {
  const metrics = load('src/lib/financialMetrics.ts');
  assert.equal(metrics.calculateBoqValue(3, 33.335), 100.02);
  const summary = metrics.calculateProjectFinancialSummary({
    contractAmount: 1_000_000,
    commercialRecords: [
      { type: 'variation', workflow_status: 'approved', cost_impact_amount: 50_000.129 },
      { type: 'variation', workflow_status: 'draft', cost_impact_amount: 25_000 },
    ],
    ipcRows: [
      { status: 'certified', claimed_amount: 100, certified_amount: 90, retention_deducted: 9, advance_recovered: 5, paid_amount: 50 },
      { status: 'rejected', claimed_amount: 99, certified_amount: 99, paid_amount: 99 },
    ],
    expenseRows: [{ amount: 20.005 }, { amount: 10 }],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), {
    contractAmount: 1_000_000, approvedVariationAmount: 50_000.13, revisedContractAmount: 1_050_000.13,
    expenseTotal: 30.01, claimedAmount: 100, certifiedAmount: 90, retentionAmount: 9,
    advanceRecoveryAmount: 5, netPayableAmount: 76, paidAmount: 50, outstandingAmount: 26,
  });
});

test('EVM and IPC dashboards share the same paid and outstanding amounts', () => {
  const { calculateEVM } = load('src/lib/evm.ts');
  const result = calculateEVM(1_000, [{ id: 'a', baseline_start: '2026-01-01', baseline_finish: '2026-01-02', planned_duration: 1, planned_quantity: 10, actual_quantity: 10, unit: 'm', weightage: 100, status: 'completed', wbs_code: '1', name: 'Work' }], [{ actual_cost: 100, internal_budget: 200 }], [{ status: 'partially_paid', claimed_amount: 900, certified_amount: 800, retention_deducted: 80, advance_recovered: 20, paid_amount: 500 }], '2026-01-03');
  assert.equal(result.earnedValue, 1_000);
  assert.equal(result.paymentGap, 200);
  assert.equal(result.cashGap, 0);
  assert.equal(result.billingGap, 100);
});

test('invalid values are rejected and valuation/certificate snapshots remain numeric', () => {
  const metrics = load('src/lib/financialMetrics.ts');
  const { valuationLine } = load('src/lib/ipcValuation.ts');
  const { calculateCertificate } = load('src/lib/paymentCertificate.ts');
  assert.throws(() => metrics.roundMoney(-1));
  assert.throws(() => valuationLine(0, 1, Infinity, 1));
  assert.throws(() => calculateCertificate(10, [{ kind: 'retention', amount: 11 }]));
  assert.deepEqual(JSON.parse(JSON.stringify(valuationLine(5, 2.125, 10.005, 20))), {
    previousQuantity: 5, currentQuantity: 2.125, cumulativeQuantity: 7.125, rate: 10.01,
    currentValue: 21.27, cumulativeValue: 71.32, exceedsBoq: false,
  });
});

test('financial server routes retain tenant/project authorization and certified snapshot persistence', () => {
  const commercial = fs.readFileSync('src/app/api/commercial/route.ts', 'utf8');
  const certificates = fs.readFileSync('src/app/api/ipc/certificates/route.ts', 'utf8');
  const valuation = fs.readFileSync('src/app/api/ipc/valuation/route.ts', 'utf8');
  for (const source of [commercial, certificates, valuation]) assert.match(source, /authorizeProjectRequest/);
  assert.match(commercial, /organization_id.*project_id/);
  assert.match(certificates, /valuation_snapshot/);
  assert.match(valuation, /snapshot:\{measurement:measurement\.data,rate:rate\.data,valuation:line\}/);
});

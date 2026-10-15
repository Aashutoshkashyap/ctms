import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function loadModule(relativePath) {
  const file = path.resolve(relativePath);
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  new vm.Script(compiled, { filename: file }).runInNewContext({
    module: loadedModule,
    exports: loadedModule.exports,
    require: (pkg) => {
      if (pkg.startsWith('.')) {
        return loadModule(path.join(path.dirname(relativePath), pkg) + (pkg.endsWith('.ts') ? '' : '.ts'));
      }
      return {};
    },
    Date,
    Math,
    Map,
    Set,
    Array,
    Number,
    Infinity,
    console,
  });
  return loadedModule.exports;
}

test('EVM calculateEVM deterministically computes CPI, SPI, EAC, and billing gaps', () => {
  const { calculateEVM } = loadModule('src/lib/evm.ts');

  const contractAmount = 10_000_000;
  const activities = [
    {
      id: 'a1',
      wbs_code: '1.0',
      name: 'Earthworks',
      baseline_start: '2026-01-01',
      baseline_finish: '2026-01-11',
      planned_duration: 10,
      planned_quantity: 1000,
      actual_quantity: 500, // 50% done
      unit: 'm3',
      weightage: 100,
      status: 'in_progress',
    },
  ];

  const budgetHeads = [
    {
      id: 'bh1',
      name: 'Earthwork Head',
      contract_value: 10_000_000,
      internal_budget: 8_000_000,
      actual_cost: 4_000_000,
      committed_cost: 1_000_000,
    },
  ];

  const ipcSubmissions = [
    {
      id: 'ipc-1',
      ipc_number: 1,
      claimed_amount: 3_000_000,
      certified_amount: 2_800_000,
      status: 'certified',
    },
  ];

  const evm = calculateEVM(contractAmount, activities, budgetHeads, ipcSubmissions, '2026-01-06', {
    ipcPayments: [{ ipc_submission_id: 'ipc-1', amount: 2_500_000 }],
  });

  // Earned value should be 50% of 10M = 5M
  assert.equal(evm.earnedValue, 5_000_000);
  assert.equal(evm.actualCost, 4_000_000);

  // CPI = 5,000,000 / 4,000,000 = 1.25
  assert.equal(evm.cpi, 1.25);

  // EAC = internal budget / CPI = 8,000,000 / 1.25 = 6,400,000
  assert.equal(evm.forecastFinalCost, 6_400_000);
  assert.equal(evm.costOverrun, 0); // No overrun since EAC < Budget

  // Billing gap = earnedValue (5M) - billedAmount (3M claimed) = 2M
  assert.equal(evm.billingGap, 2_000_000);

  // Outstanding payment gap = 2.8M certified - 2.5M paid = 300,000
  assert.equal(evm.paymentGap, 300_000);
});

test('EVM calculateActivityRiskScore assigns correct risk categories and factors', () => {
  const { calculateActivityRiskScore } = loadModule('src/lib/evm.ts');

  const lowRiskActivity = {
    id: 'act-1',
    wbs_code: '1.1',
    name: 'General Surveying',
    total_float: 25,
    status: 'in_progress',
    weightage: 5,
  };

  const criticalActivity = {
    id: 'act-2',
    wbs_code: '2.1',
    name: 'Pier Foundation Concrete',
    total_float: 0,
    is_critical: true,
    status: 'in_progress',
    weightage: 40,
    design_package_id: 'dp-1',
  };

  const designPackages = [
    { id: 'dp-1', name: 'Pier Structure Design', status: 'pending', delay_days: 15 },
  ];

  const lowResult = calculateActivityRiskScore(lowRiskActivity, [], []);
  assert.equal(lowResult.category, 'low');
  assert.ok(lowResult.score < 30);

  const critResult = calculateActivityRiskScore(criticalActivity, designPackages, []);
  assert.ok(critResult.score >= 50);
  assert.ok(['high', 'critical'].includes(critResult.category));
  assert.ok(critResult.factors.some(f => f.name.toLowerCase().includes('critical') || f.name.toLowerCase().includes('design')));
});

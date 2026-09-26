import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function loadPaymentCertificate() {
  const file = path.resolve('src/lib/paymentCertificate.ts');
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  const metricsPath = path.resolve('src/lib/financialMetrics.ts');
  const metricsSource = fs.readFileSync(metricsPath, 'utf8');
  const metricsCompiled = ts.transpileModule(metricsSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const metricsModule = { exports: {} };
  new vm.Script(metricsCompiled, { filename: metricsPath }).runInNewContext({ module: metricsModule, exports: metricsModule.exports });
  new vm.Script(compiled, { filename: file }).runInNewContext({ module: loadedModule, exports: loadedModule.exports, require: () => metricsModule.exports });
  return loadedModule.exports;
}

test('payment certificate totals and lifecycle are deterministic', () => {
  const { calculateCertificate, validCertificateTransition } = loadPaymentCertificate();
  assert.equal(
    JSON.stringify(calculateCertificate(1000.129, [
      { kind: 'retention', amount: 50.124 },
      { kind: 'advance_recovery', amount: 20 },
    ])),
    JSON.stringify({
      grossCertifiedAmount: 1000.13,
      totalDeductions: 70.12,
      netCertifiedAmount: 930.01,
      deductions: [
        { kind: 'retention', amount: 50.12 },
        { kind: 'advance_recovery', amount: 20 },
      ],
    }),
  );
  assert.equal(validCertificateTransition('draft', 'submitted'), true);
  assert.equal(validCertificateTransition('approved', 'certified'), true);
  assert.equal(validCertificateTransition('certified', 'draft'), false);
  assert.throws(() => calculateCertificate(100, [{ kind: 'retention', amount: 101 }]));
});

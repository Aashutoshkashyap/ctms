import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function load() {
  const file = path.resolve('src/lib/commercialLifecycle.ts');
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedModule = { exports: {} };
  new vm.Script(compiled, { filename: file }).runInNewContext({ module: loadedModule, exports: loadedModule.exports, Date });
  return loadedModule.exports;
}

test('commercial workflows are one-way and EOT completion dates are deterministic', () => {
  const commercial = load();
  assert.equal(commercial.canTransition('draft', 'submitted'), true);
  assert.equal(commercial.canTransition('under_review', 'approved'), true);
  assert.equal(commercial.canTransition('approved', 'draft'), false);
  assert.equal(commercial.revisedCompletionDate('2026-01-31', 2), '2026-02-02');
  assert.throws(() => commercial.revisedCompletionDate('invalid', 1));
});

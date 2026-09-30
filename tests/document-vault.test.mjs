import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';

function load() {
  const file = path.resolve('src/lib/documentVault.ts');
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedModule = { exports: {} };
  new vm.Script(compiled, { filename: file }).runInNewContext({ module: loadedModule, exports: loadedModule.exports, Date });
  return loadedModule.exports;
}

test('document vault classifies previews without rejecting unsupported formats', () => {
  const vault = load();
  assert.equal(vault.previewKind('image/jpeg', 'site.jpg'), 'image');
  assert.equal(vault.previewKind('application/pdf', 'receipt.pdf'), 'pdf');
  assert.equal(vault.previewKind('audio/mpeg', 'note.mp3'), 'audio');
  assert.equal(vault.previewKind('application/vnd.ms-excel', 'boq.xls'), 'file');
});

test('Drive folder names always use Gregorian dates and metadata context', () => {
  const vault = load();
  assert.equal(vault.gregorianFolderDate('2026-09-30T12:00:00Z'), '2026-09-30');
  assert.deepEqual(JSON.parse(JSON.stringify(vault.documentFolderSegments({ date: '2026-09-30', module: 'Equipment', site: 'Foundation', task: 'Excavation' }))), ['2026-09-30', 'Equipment', 'Foundation', 'Excavation']);
});

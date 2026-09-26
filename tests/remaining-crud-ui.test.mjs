import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = (file) => fs.readFileSync(file, 'utf8');

test('BOQ activities have project-aware view details and preserve existing edit authority', () => {
  const ui = source('src/components/CpmTimelineDashboard.tsx');
  assert.match(ui, /RecordDetailsDialog/);
  assert.match(ui, /View details/);
  assert.match(ui, /isEditable/);
  assert.match(ui, /onUpdateActivity/);
});

test('employee directory provides view and edit without removing historical inactive records', () => {
  const ui = source('src/components/DailyExpenseDashboard.tsx');
  const storage = source('src/lib/storage.ts');
  assert.match(ui, /Project employee directory/);
  assert.match(ui, /Edit employee record/);
  assert.match(ui, /View details/);
  assert.match(ui, /employee\.status==='inactive'/);
  assert.match(storage, /project_id === projectId/);
});

test('expense editing retains evidence and blocks approved records from modification', () => {
  const ui = source('src/components/DailyExpenseDashboard.tsx');
  assert.match(ui, /existingExpense\?\.payment_slip_path/);
  assert.match(ui, /\['draft','submitted','rejected'\]\.includes\(item\.status\)/);
  assert.match(ui, /Save expense changes/);
  assert.doesNotMatch(ui, /\['draft','submitted','approved','rejected'\]\.includes\(item\.status\)/);
});

test('established project authorization and MD alias normalization remain authoritative', () => {
  const authorization = source('src/lib/server/projectAuthorization.ts');
  const permissions = source('src/lib/permissions.ts');
  assert.match(authorization, /normalizeRole\(sourceRole\)/);
  assert.match(authorization, /authorizeProjectRequest/);
  assert.match(permissions, /managing_director/);
  assert.match(permissions, /md:\s*'project_director'/);
});

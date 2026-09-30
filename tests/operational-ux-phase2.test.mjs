import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = file => fs.readFileSync(file, 'utf8');

test('people and fleet share operational records but show role-appropriate views', () => {
  const page = read('src/app/page.tsx');
  const operations = read('src/components/OperationalControlDashboard.tsx');
  const people = read('src/components/PeopleAssignments.tsx');
  assert.match(page, /focus="people"/);
  assert.match(page, /focus="fleet"/);
  assert.match(operations, /focus === 'people' && canTrackEmployees/);
  assert.match(operations, /focus === 'fleet' && canRecordResources/);
  assert.match(operations, /storage\.saveDailyResourceUsage/);
  assert.match(operations, /storage\.saveEmployeeVisit/);
  assert.match(people, /People in directory/);
  assert.match(people, /Not allocated here/);
  assert.match(people, /<EmptyState title="No matching assignments"/);
});

test('work board shows source-derived stage counts and retains protected source actions', () => {
  const board = read('src/components/work/WorkBoard.tsx');
  assert.match(board, /items\.filter\(item => item\.stage === stage\)\.length/);
  assert.match(board, /Nothing here right now/);
  assert.match(board, /fetch\('\/api\/procurement'/);
  assert.doesNotMatch(board, /onDrag|draggable/);
});

test('inventory and purchases use existing API data for attention metrics', () => {
  const workspace = read('src/components/ProcurementStoresDashboard.tsx');
  for (const label of ['Stock items', 'Low stock', 'Receipts posted', 'Issues posted', 'Draft orders', 'Ordered', 'Receiving', 'Late deliveries']) assert.match(workspace, new RegExp(label));
  assert.match(workspace, /Number\(item\.reorder_level\) > 0/);
  assert.match(workspace, /setMovements\(inventory\.movements\|\|\[\]\)/);
});

test('reports and documents do not show stale project results during reload', () => {
  const reports = read('src/components/ReportCenter.tsx');
  const documents = read('src/components/DocumentVault.tsx');
  assert.match(reports, /new AbortController\(\)/);
  assert.match(reports, /controller\.abort\(\)/);
  assert.match(reports, /setReport\(null\)/);
  assert.match(reports, /sandbox=""/);
  assert.match(reports, /csvSafeRows/);
  assert.match(documents, /new AbortController\(\)/);
  assert.match(documents, /loading \? <p role="status"/);
  assert.match(documents, /showUpload && uploadEnabled && <form/);
  assert.match(documents, /payload\.capabilities\?\.fileUpload === true/);
  assert.match(documents, /Drive file index is not connected to this API/);
  assert.match(read('src/app/page.tsx'), /Controlled document register/);
});

test('quality, commercial and settings remain in the existing project context', () => {
  const page = read('src/app/page.tsx');
  const snapshot = read('src/components/ModuleSnapshot.tsx');
  const settings = read('src/components/SettingsPanel.tsx');
  assert.match(page, /<SettingsPanel\s+key=\{project\.id\}/);
  assert.match(snapshot, /'BOQ', 'Measured work', 'Valuation', 'Certificate', 'Payment status'/);
  assert.match(snapshot, /pendingInspections/);
  assert.match(settings, /Google Drive & document storage/);
  assert.match(settings, /Team access/);
  assert.match(page, /projectId=\{project\.id\}/);
});

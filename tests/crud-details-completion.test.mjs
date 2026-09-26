import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = (file) => fs.readFileSync(file, 'utf8');

test('existing transactional workspaces expose the shared active-project details pattern', () => {
  for (const file of [
    'src/components/DailyReportingDashboard.tsx',
    'src/components/ProcurementStoresDashboard.tsx',
    'src/components/OperationalControlDashboard.tsx',
    'src/components/IpcValuationWorkspace.tsx',
    'src/components/PaymentCertificateWorkspace.tsx',
    'src/components/CommercialControlWorkspace.tsx',
    'src/components/EvidenceVault.tsx',
  ]) {
    const ui = source(file);
    assert.match(ui, /RecordDetailsDialog/);
    assert.match(ui, /View details/);
  }
});

test('commercial editing remains draft-only and server-authorized', () => {
  const ui = source('src/components/CommercialControlWorkspace.tsx');
  const api = source('src/app/api/commercial/route.ts');
  assert.match(ui, /action: 'update'/);
  assert.match(ui, /workflow_status === 'draft'/);
  assert.match(api, /authorizeProjectRequest\(request, projectId, 'claims', 'write'\)/);
  assert.match(api, /loaded\.data\.workflow_status !== 'draft'/);
  assert.match(api, /loaded\.data\.created_by !== actor\.userId/);
  assert.match(api, /organization_id.*project_id/);
});

test('payment-certificate deductions can only be changed while draft and certification remains immutable', () => {
  const ui = source('src/components/PaymentCertificateWorkspace.tsx');
  const api = source('src/app/api/ipc/certificates/route.ts');
  assert.match(ui, /action: 'remove_deduction'/);
  assert.match(ui, /certificate\.status === 'draft'/);
  assert.match(api, /current\.status !== 'draft'/);
  assert.match(api, /authorizeProjectRequest\(request, projectId, 'ipc', 'write'\)/);
  assert.match(api, /validCertificateTransition/);
  assert.match(api, /actor\.role !== 'project_director'/);
});

test('project-sensitive record workspaces reload from the active project and retain server scope', () => {
  const valuation = source('src/components/IpcValuationWorkspace.tsx');
  const certificates = source('src/components/PaymentCertificateWorkspace.tsx');
  const commercial = source('src/components/CommercialControlWorkspace.tsx');
  for (const ui of [valuation, certificates, commercial]) {
    assert.match(ui, /projectId=\$\{encodeURIComponent\(projectId\)\}/);
    assert.match(ui, /useEffect\(\(\) => \{ void load\(\); \}, \[projectId\]\)/);
  }
});

test('MD aliases retain Project Director authority under the established normalization boundary', () => {
  const permissions = source('src/lib/permissions.ts');
  const authorization = source('src/lib/server/projectAuthorization.ts');
  assert.match(permissions, /managing_director/);
  assert.match(permissions, /md:\s*'project_director'/);
  assert.match(authorization, /normalizeRole\(sourceRole\)/);
});

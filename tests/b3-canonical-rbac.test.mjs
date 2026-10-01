import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('B3 establishes one active organization boundary before project access', async () => {
  const auth = await read('src/lib/server/projectAuthorization.ts');
  assert.match(auth, /authorizeActiveOrganizationMember/);
  assert.match(auth, /member\.data\.status !== 'active'/);
  assert.match(auth, /authorizeActiveOrganizationMember\(admin, userId, organizationId\)/);
  assert.match(auth, /project_users.*projectId.*auth_user_id/s);
  assert.doesNotMatch(auth, /organizationMember\.data\?\.role === 'business_admin'/);
});

test('B3 keeps assignment metadata out of the access authority', async () => {
  const auth = await read('src/lib/server/projectAuthorization.ts');
  assert.doesNotMatch(auth, /project_person_assignments/);
});

test('B3 Google authorization requires active organization and project membership', async () => {
  const google = await read('src/lib/server/googleConnection.ts');
  const upload = await read('src/app/api/google/upload/route.ts');
  assert.match(google, /authorizeActiveOrganizationMember/);
  assert.match(google, /project_users.*projectId.*auth_user_id/s);
  assert.match(google, /authorizeGoogleUploadRequest/);
  assert.match(google, /upload_evidence/);
  assert.match(upload, /authorizeGoogleUploadRequest/);
});

test('B3 Company Admin uses the same active organization check', async () => {
  const company = await read('src/lib/server/companyAdmin.ts');
  assert.match(company, /authorizeActiveOrganizationMember/);
  assert.match(company, /business_admin.*project_director/);
});

test('B3 exposes existing entitlement records without enabling broad enforcement', async () => {
  const auth = await read('src/lib/server/projectAuthorization.ts');
  assert.match(auth, /hasOrganizationModuleEntitlement/);
  assert.match(auth, /organization_module_entitlements/);
  assert.match(auth, /subscription_plan_module_entitlements/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('B4 resolves override, plan and legacy-safe entitlement states server-side', async () => {
  const auth = await read('src/lib/server/projectAuthorization.ts');
  assert.match(auth, /organization_module_entitlements/);
  assert.match(auth, /subscription_plan_module_entitlements/);
  assert.match(auth, /configured\.count.*=== 0/);
  assert.match(auth, /FEATURE_MODULE/);
  assert.match(auth, /hasOrganizationModuleEntitlement\(admin, organizationId, FEATURE_MODULE\[feature\]\)/);
});

test('B4 keeps the existing organization, project and staff checks ahead of module access', async () => {
  const auth = await read('src/lib/server/projectAuthorization.ts');
  assert.match(auth, /authorizeActiveOrganizationMember/);
  assert.match(auth, /project_users.*projectId.*auth_user_id/s);
  assert.match(auth, /if \(!can\(role, feature, permissions, access\)\)/);
});

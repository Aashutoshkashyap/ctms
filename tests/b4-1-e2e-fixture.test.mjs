import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, assertSafeTarget, PRODUCTION_PROJECT_REF } from '../scripts/provision-e2e-tenant.mjs';

test('B4.1 fixture is deterministic and uses established roles only', () => {
  assert.equal(fixture.organization.id, 'ctms-e2e-test-org');
  assert.equal(fixture.project.id, 'ctms-e2e-test-project');
  assert.equal(Object.keys(fixture.users).length, 4);
  assert.ok(Object.values(fixture.users).every((email) => email.endsWith('@testing.invalid')));
});

test('B4.1 refuses the known production Supabase project before provisioning', () => {
  assert.throws(() => assertSafeTarget(`https://${PRODUCTION_PROJECT_REF}.supabase.co`));
  assert.throws(() => assertSafeTarget(''));
  assert.doesNotThrow(() => assertSafeTarget('https://nonproduction-example.supabase.co'));
});

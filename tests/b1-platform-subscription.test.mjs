import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const migration = fs.readFileSync('supabase_b1_platform_subscription.sql', 'utf8');
const preflight = fs.readFileSync('supabase_b1_platform_subscription_preflight.sql', 'utf8');
const platformRoute = fs.readFileSync('src/app/api/platform/overview/route.ts', 'utf8');
const proofRoute = fs.readFileSync('src/app/api/platform/payment-proof/route.ts', 'utf8');
const usersRoute = fs.readFileSync('src/app/api/admin/users/route.ts', 'utf8');
const cron = fs.readFileSync('src/app/api/cron/subscription-alerts/route.ts', 'utf8');

function lifecycle() {
  const file = path.resolve('src/lib/subscriptionLifecycle.ts');
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loadedModule = { exports: {} };
  new vm.Script(output, { filename: file }).runInNewContext({ module: loadedModule, exports: loadedModule.exports });
  return loadedModule.exports;
}

test('subscription lifecycle accepts only explicit organization and payment transitions', () => {
  const { canTransitionSubscription, validPaymentTransition } = lifecycle();
  assert.equal(canTransitionSubscription('trial', 'active'), true);
  assert.equal(canTransitionSubscription('active', 'past_due'), true);
  assert.equal(canTransitionSubscription('suspended', 'active'), true);
  assert.equal(canTransitionSubscription('active', 'trial'), false);
  assert.equal(canTransitionSubscription('cancelled', 'suspended'), false);
  assert.equal(validPaymentTransition('pending', 'verified'), true);
  assert.equal(validPaymentTransition('pending', 'rejected'), true);
  assert.equal(validPaymentTransition('verified', 'verified'), true);
  assert.equal(validPaymentTransition('rejected', 'verified'), false);
});

test('B1 migration is additive and creates versioned plans and entitlement foundations', () => {
  assert.match(migration, /create table if not exists subscription_plan_versions/i);
  assert.match(migration, /create table if not exists subscription_plan_module_entitlements/i);
  assert.match(migration, /create table if not exists organization_module_entitlements/i);
  assert.match(migration, /has_organization_module_entitlement/);
  assert.match(migration, /alter table organizations add column if not exists plan_version/i);
  assert.doesNotMatch(migration, /drop table|truncate\s/i);
  assert.match(preflight, /information_schema\.tables/);
  assert.match(preflight, /subscription_transactions/);
});

test('payment verification is a server-only atomic lifecycle transition', () => {
  assert.match(migration, /create or replace function private\.verify_subscription_payment/);
  assert.match(migration, /for update/);
  assert.match(migration, /transaction_row\.status <> 'pending'/);
  assert.match(migration, /update subscription_transactions[\s\S]*status = 'verified'/);
  assert.match(migration, /update organizations[\s\S]*subscription_status = 'active'/);
  assert.match(migration, /update projects[\s\S]*access_until = effective_access_until/);
  assert.match(migration, /organization_notifications/);
  assert.match(migration, /subscription_email_deliveries/);
  assert.match(migration, /revoke all on function private\.verify_subscription_payment[\s\S]*authenticated/);
  assert.match(migration, /grant execute on function private\.verify_subscription_payment[\s\S]*service_role/);
  assert.match(platformRoute, /rpc\('verify_subscription_payment'/);
  assert.match(platformRoute, /idempotent: outcome\?\.result === 'already_verified'/);
  assert.doesNotMatch(migration, /ipc_payments/);
});

test('project reactivation and membership reassignment cannot bypass quotas', () => {
  assert.match(migration, /before insert or update of status, organization_id on projects/);
  assert.match(migration, /old\.status, 'active'\) <> 'archived'/);
  assert.match(migration, /before insert or update of project_id, auth_user_id on project_users/);
  assert.match(migration, /existing\.id <> old\.id/);
});

test('platform payment proof validates the tenant before private storage upload', () => {
  assert.match(proofRoute, /from\('organizations'\)\.select\('id'\)\.eq\('id', organizationId\)/);
  assert.match(proofRoute, /Business tenant was not found/);
  assert.match(proofRoute, /storage\.from\('subscription-payments'\)\.upload/);
  assert.match(platformRoute, /proofStoragePath\.startsWith\(`\$\{organizationId\}\/`\)/);
});

test('admin user create and edit use the shared active-organization authorization boundary', () => {
  const calls = usersRoute.match(/authorizeProjectRequest\(request, (projectId|body\.projectId), 'manage_users', 'write'\)/g) || [];
  assert.equal(calls.length, 2);
  assert.match(usersRoute, /if \('error' in authorized\) return Response\.json/);
  assert.doesNotMatch(usersRoute, /createClient\(/);
});

test('renewal notifications retain idempotent T-5, T-3, T-1 and T0 behavior', () => {
  assert.match(cron, /\[5, 3, 1, 0\]/);
  assert.match(cron, /onConflict: 'organization_id,kind,alert_for_date,days_before'/);
  assert.match(cron, /onConflict: 'organization_id,recipient,scheduled_for,days_before'/);
  assert.match(cron, /CRON_SECRET/);
});

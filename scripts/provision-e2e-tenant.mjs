import { createClient } from '@supabase/supabase-js';

export const PRODUCTION_PROJECT_REF = 'eabovphqhdpjzfqburtk';
export const fixture = Object.freeze({
  organization: { id: 'ctms-e2e-test-org', name: 'CTMS E2E Test Organization' },
  project: { id: 'ctms-e2e-test-project', name: 'CTMS E2E Test Project' },
  users: {
    companyAdmin: 'ctms-e2e-company-admin@testing.invalid',
    projectAdmin: 'ctms-e2e-project-admin@testing.invalid',
    projectUser: 'ctms-e2e-project-user@testing.invalid',
    restrictedUser: 'ctms-e2e-restricted@testing.invalid',
  },
});

export function assertSafeTarget(url) {
  if (!url || !/^https:\/\//.test(url) || url.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error('Refusing E2E provisioning: configure a dedicated non-production Supabase URL.');
  }
}

const required = ['CTMS_E2E_SUPABASE_URL', 'CTMS_E2E_SUPABASE_SERVICE_ROLE_KEY', 'CTMS_E2E_PASSWORD'];
export async function provision({ url = process.env.CTMS_E2E_SUPABASE_URL, key = process.env.CTMS_E2E_SUPABASE_SERVICE_ROLE_KEY, password = process.env.CTMS_E2E_PASSWORD } = {}) {
  assertSafeTarget(url);
  if (!key || !password) throw new Error(`Missing ${required.filter((name) => !process.env[name]).join(', ')}.`);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = {};
  for (const [kind, email] of Object.entries(fixture.users)) {
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    let user = listed.data.users.find((candidate) => candidate.email === email);
    if (!user) {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { ctms_e2e: true, kind } });
      if (created.error || !created.data.user) throw created.error || new Error('Could not create E2E user.');
      user = created.data.user;
    }
    users[kind] = user;
  }
  const companyAdmin = users.companyAdmin;
  const upsert = (table, values, onConflict) => admin.from(table).upsert(values, { onConflict });
  const organization = await upsert('organizations', { id: fixture.organization.id, name: fixture.organization.name, contact_email: fixture.users.companyAdmin, plan: 'enterprise_trial', plan_version: 1, subscription_status: 'trial', access_until: '2099-12-31', seat_limit: 10, project_limit: 2, created_by: companyAdmin.id }, 'id');
  if (organization.error) throw organization.error;
  const roles = { companyAdmin: 'business_admin', projectAdmin: 'project_director', projectUser: 'project_manager', restrictedUser: 'field_employee' };
  const members = Object.entries(users).map(([kind, user]) => ({ id: `${fixture.organization.id}-${user.id}`, organization_id: fixture.organization.id, auth_user_id: user.id, email: user.email, name: `E2E ${kind}`, role: roles[kind], status: 'active' }));
  const memberResult = await upsert('organization_members', members, 'organization_id,auth_user_id');
  if (memberResult.error) throw memberResult.error;
  const project = await upsert('projects', { id: fixture.project.id, name: fixture.project.name, organization_id: fixture.organization.id, organization_name: fixture.organization.name, status: 'active', created_by: companyAdmin.id }, 'id');
  if (project.error) throw project.error;
  const projectUsers = ['projectAdmin', 'projectUser'].map((kind) => ({ id: `${fixture.project.id}-${users[kind].id}`, project_id: fixture.project.id, auth_user_id: users[kind].id, email: users[kind].email, name: `E2E ${kind}`, role: roles[kind], feature_permissions: {} }));
  const projectResult = await upsert('project_users', projectUsers, 'project_id,email');
  if (projectResult.error) throw projectResult.error;
  const entitlement = await upsert('organization_module_entitlements', ['home','projects','people','work','fleet','inventory','purchases','commercial','quality_safety','document_vault','reports','settings'].map((module_key) => ({ organization_id: fixture.organization.id, module_key, enabled: true, source: 'platform_override' })), 'organization_id,module_key');
  if (entitlement.error) throw entitlement.error;
  return { ...fixture, provisioned: true };
}

if (process.argv[1] && process.argv[1].endsWith('provision-e2e-tenant.mjs')) provision().then((value) => console.log(JSON.stringify(value))).catch((error) => { console.error(error.message); process.exitCode = 1; });

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('B2 uses existing organization membership rather than a second tenant user system', async () => {
  const auth = await read('src/lib/server/companyAdmin.ts');
  const api = await read('src/app/api/company-admin/route.ts');
  assert.match(auth, /organization_members/);
  assert.match(auth, /status', 'active'/);
  assert.match(api, /eq\('id', auth\.organizationId\)/);
  assert.doesNotMatch(api, /organizationId.*body/);
});

test('B2 invitation migration is additive, scoped, expiring and single-use ready', async () => {
  const sql = await read('supabase_b2_company_admin_onboarding.sql');
  assert.match(sql, /create table if not exists organization_invitations/);
  assert.match(sql, /organization_id text not null references organizations/);
  assert.match(sql, /token_hash text not null/);
  assert.match(sql, /expires_at timestamptz not null/);
  assert.match(sql, /status text not null default 'invited'/);
  assert.match(sql, /enable row level security/);
  assert.doesNotMatch(sql, /drop table|truncate|delete from/i);
});

test('B2 invitation acceptance is authenticated and cannot activate an expired or foreign invite', async () => {
  const accept = await read('src/app/api/company-admin/invitations/accept/route.ts');
  assert.match(accept, /bearerToken/);
  assert.match(accept, /auth\.getUser/);
  assert.match(accept, /expires_at/);
  assert.match(accept, /eq\('email', email\)/);
  assert.match(accept, /status: 'accepted'/);
});

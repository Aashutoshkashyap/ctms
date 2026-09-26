import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadPermissions() {
  const source = fs.readFileSync('src/lib/permissions.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new vm.Script(compiled).runInNewContext({ module: loaded, exports: loaded.exports });
  return loaded.exports;
}

test('legacy Managing Director identities resolve to the established Project Director authority', () => {
  const permissions = loadPermissions();
  for (const role of ['managing_director', 'Managing Director', 'MD', 'director']) {
    assert.equal(permissions.normalizeRole(role), 'project_director');
    assert.equal(permissions.can(role, 'manage_users', {}, 'write'), true);
  }
  assert.equal(permissions.can('field_employee', 'manage_users', {}, 'write'), false);
});

test('server authorization normalizes legacy director data without admitting unknown roles', () => {
  const authorization = fs.readFileSync('src/lib/server/projectAuthorization.ts', 'utf8');
  assert.match(authorization, /normalizeRole\(sourceRole\)/);
  assert.match(authorization, /sourceRole !== 'employer_viewer'/);
  assert.match(authorization, /can\(role, feature, permissions, access\)/);
});

test('evidence API keeps uploads and retrieval server-authorized and project-scoped', () => {
  const route = fs.readFileSync('src/app/api/evidence/route.ts', 'utf8');
  const storage = fs.readFileSync('src/lib/storage.ts', 'utf8');
  assert.match(route, /authorizeProjectRequest\(request, projectId, 'view_evidence', 'read'\)/);
  assert.match(route, /authorizeProjectRequest\(request, projectId, 'upload_evidence', 'write'\)/);
  assert.match(route, /\.eq\('project_id', projectId\)/);
  assert.match(route, /daily_reports'.*\.eq\('id', reportId\).*\.eq\('project_id', projectId\)/);
  assert.match(route, /createSignedUrl\(path, 3600\)/);
  assert.match(route, /storagePath = `\$\{projectId\}\/\$\{reportId\}/);
  assert.match(storage, /fetch\('\/api\/evidence'/);
  assert.match(storage, /fetch\(`\/api\/evidence\?projectId=/);
});

test('evidence is append-only at this lifecycle boundary and does not expose a browser delete path', () => {
  const route = fs.readFileSync('src/app/api/evidence/route.ts', 'utf8');
  assert.doesNotMatch(route, /export async function DELETE/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentProject, projectIdFromUrl, workspaceUrl } from '../src/lib/projectContext.ts';

test('Project A to Project B keeps URL and authoritative context aligned', () => {
  assert.equal(projectIdFromUrl('?project=project-b&tab=daily'), 'project-b');
  assert.equal(workspaceUrl('https://ctms.test/?project=project-a&tab=daily', 'project-b', 'dashboard'), '/?project=project-b');
  assert.equal(isCurrentProject('project-b', 'project-b'), true);
});

test('a stale Project A refresh cannot commit after Project B is active', () => {
  assert.equal(isCurrentProject('project-a', 'project-b'), false);
});

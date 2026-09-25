import assert from 'node:assert/strict'; import test from 'node:test'; import { isCurrentProject, projectIdFromUrl, workspaceUrl } from '../src/lib/projectContext.ts';
test('switching Project A to Project B uses one URL and active context',()=>{assert.equal(projectIdFromUrl('?project=B'),'B');assert.equal(workspaceUrl('https://ctms.test/?project=A&tab=daily','B'),'/?project=B');assert.equal(isCurrentProject('B','B'),true);});
test('a stale Project A refresh cannot render after Project B is selected',()=>assert.equal(isCurrentProject('A','B'),false));

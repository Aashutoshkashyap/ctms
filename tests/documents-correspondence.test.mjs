import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/documentLifecycle.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
Function('module', 'exports', compiled)(loaded, loaded.exports);
const { canTransitionDocument, cleanDocumentText, isDocumentStatus, validDocumentDate } = loaded.exports;

test('controlled document lifecycle is one-way and approved documents are immutable', () => {
  assert.equal(canTransitionDocument('draft', 'under_review'), true);
  assert.equal(canTransitionDocument('under_review', 'approved'), true);
  assert.equal(canTransitionDocument('under_review', 'rejected'), true);
  assert.equal(canTransitionDocument('approved', 'draft'), false);
  assert.equal(canTransitionDocument('rejected', 'under_review'), true);
});

test('document input helpers reject malformed lifecycle data and bound user text', () => {
  assert.equal(isDocumentStatus('approved'), true);
  assert.equal(isDocumentStatus('deleted'), false);
  assert.equal(validDocumentDate('2026-09-26'), true);
  assert.equal(validDocumentDate('26/09/2026'), false);
  assert.equal(cleanDocumentText(`  ${'x'.repeat(20)}  `, 12), 'xxxxxxxxxxxx');
});

test('document API remains server-authorized and project-scoped', () => {
  const route = fs.readFileSync('src/app/api/documents/route.ts', 'utf8');
  const ui = fs.readFileSync('src/components/DocumentTracker.tsx', 'utf8');
  assert.match(route, /authorizeProjectRequest\(request, projectId, 'documents', 'read'\)/);
  assert.match(route, /authorizeProjectRequest\(request, projectId, 'documents', 'write'\)/);
  assert.match(route, /\.eq\('project_id', projectId\)/);
  assert.match(route, /Only an authorized project manager may edit a draft or rejected document/);
  assert.match(route, /Only the Project Director, Project Manager or Business Admin can decide this document/);
  assert.match(ui, /View details/);
  assert.match(ui, /Edit details/);
  assert.match(ui, /api\/documents\?projectId=/);
});

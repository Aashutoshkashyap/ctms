import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');

function loadOutbox() {
  const source = fs.readFileSync(path.join(root, 'src/lib/durableMutationOutbox.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiledModule = { exports: {} };
  new vm.Script(compiled, { filename: 'durableMutationOutbox.ts' }).runInNewContext({ module: compiledModule, exports: compiledModule.exports, JSON, Date, Math, crypto });
  return compiledModule.exports;
}

function memoryStore() {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}

function mutation(overrides = {}) {
  return {
    id: 'op-1', kind: 'daily_work_update', projectId: 'project-a', organizationId: 'tenant-a', actorId: 'user-a',
    targetId: 'report-1', affectedLocalKeys: ['bt_daily_reports', 'bt_daily_work_items'], payload: { report: { id: 'report-1' } },
    ...overrides,
  };
}

test('pending mutation survives a reload and retains its original identity for retry', () => {
  const { DurableMutationOutbox } = loadOutbox();
  const store = memoryStore();
  const first = new DurableMutationOutbox(store);
  first.enqueue(mutation());
  first.markFailed('op-1', 'offline');
  const reloaded = new DurableMutationOutbox(store);
  assert.deepEqual(reloaded.pendingForProject('project-a', 'user-a').map(item => item.id), ['op-1']);
  assert.equal(reloaded.pendingForProject('project-a', 'user-a')[0].lastError, 'offline');
  assert.equal(reloaded.enqueue(mutation()).id, 'op-1');
  assert.equal(reloaded.pendingForProject('project-a', 'user-a').length, 1);
});

test('unacknowledged conflicts protect local rows from a cloud refresh', () => {
  const { DurableMutationOutbox } = loadOutbox();
  const outbox = new DurableMutationOutbox(memoryStore());
  outbox.enqueue(mutation());
  outbox.markConflict('op-1', 'the cloud copy changed');
  assert.equal(outbox.protectedLocalKeys('project-a').has('bt_daily_reports'), true);
  assert.equal(outbox.summaryForProject('project-a', 'user-a').conflicts, 1);
  assert.equal(outbox.unacknowledgedForProject('project-a', 'user-a').length, 1);
});

test('project and actor scope prevent a pending operation from replaying in another context', () => {
  const { DurableMutationOutbox } = loadOutbox();
  const outbox = new DurableMutationOutbox(memoryStore());
  outbox.enqueue(mutation());
  assert.equal(outbox.pendingForProject('project-b', 'user-a').length, 0);
  assert.equal(outbox.pendingForProject('project-a', 'user-b').length, 0);
  assert.equal(outbox.pendingForProject('project-a', 'user-a').length, 1);
});

test('a tombstone remains durable until the deletion is acknowledged', () => {
  const { DurableMutationOutbox } = loadOutbox();
  const store = memoryStore();
  const outbox = new DurableMutationOutbox(store);
  outbox.enqueue(mutation({ id: 'delete-1', kind: 'daily_report_delete', tombstone: { localKey: 'bt_daily_reports', recordId: 'report-1' } }));
  assert.equal(outbox.hasTombstone('project-a', 'bt_daily_reports', 'report-1'), true);
  const reloaded = new DurableMutationOutbox(store);
  assert.equal(reloaded.hasTombstone('project-a', 'bt_daily_reports', 'report-1'), true);
  reloaded.acknowledge('delete-1');
  assert.equal(reloaded.hasTombstone('project-a', 'bt_daily_reports', 'report-1'), false);
});

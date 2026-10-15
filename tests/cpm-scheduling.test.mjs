import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function loadCpmModule() {
  const file = path.resolve('src/lib/cpm.ts');
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  new vm.Script(compiled, { filename: file }).runInNewContext({
    module: loadedModule,
    exports: loadedModule.exports,
    Date,
    Math,
    Map,
    Set,
    Array,
    Infinity,
    console,
  });
  return loadedModule.exports;
}

test('CPM validateDependency rejects self-dependencies, duplicates, and cycles', () => {
  const { validateDependency } = loadCpmModule();

  const deps = [
    { id: 'd1', predecessor_id: 'act-1', successor_id: 'act-2', type: 'FS', lag: 0 },
    { id: 'd2', predecessor_id: 'act-2', successor_id: 'act-3', type: 'FS', lag: 0 },
    { id: 'd3', predecessor_id: 'act-3', successor_id: 'act-4', type: 'FS', lag: 0 },
  ];

  // Self loop
  const selfLoop = validateDependency(deps, { predecessor_id: 'act-1', successor_id: 'act-1' });
  assert.equal(selfLoop.valid, false);
  assert.match(selfLoop.reason, /cannot depend on itself/i);

  // Duplicate
  const duplicate = validateDependency(deps, { predecessor_id: 'act-1', successor_id: 'act-2' });
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.reason, /already exists/i);

  // Direct 2-node cycle (act-2 -> act-1 when act-1 -> act-2 exists)
  const directCycle = validateDependency(deps, { predecessor_id: 'act-2', successor_id: 'act-1' });
  assert.equal(directCycle.valid, false);
  assert.match(directCycle.reason, /circular dependency cycle/i);

  // Multi-node cycle (act-4 -> act-1 when act-1 -> act-2 -> act-3 -> act-4 exists)
  const multiCycle = validateDependency(deps, { predecessor_id: 'act-4', successor_id: 'act-1' });
  assert.equal(multiCycle.valid, false);
  assert.match(multiCycle.reason, /circular dependency cycle/i);

  // Valid branch dependency (act-1 -> act-5, act-5 -> act-4)
  const validBranch1 = validateDependency(deps, { predecessor_id: 'act-1', successor_id: 'act-5' });
  assert.equal(validBranch1.valid, true);

  const depsWithBranch = [...deps, { id: 'd4', predecessor_id: 'act-1', successor_id: 'act-5', type: 'FS', lag: 0 }];
  const validBranch2 = validateDependency(depsWithBranch, { predecessor_id: 'act-5', successor_id: 'act-4' });
  assert.equal(validBranch2.valid, true);
});

test('CPM calculateCPM accurately computes forward pass, backward pass, floats, and critical path', () => {
  const { calculateCPM } = loadCpmModule();

  const project = {
    start_date: '2026-01-01',
    target_completion_date: '2026-01-21',
  };

  // Linear path of 3 activities:
  // Act 1: 10 days (2026-01-01 to 2026-01-11)
  // Act 2: 10 days (2026-01-11 to 2026-01-21)
  // Parallel Act 3: 5 days starting from Act 1 finish (2026-01-11 to 2026-01-16) - has 5 days of float
  const activities = [
    {
      id: 'a1',
      wbs_code: '1.1',
      name: 'Site Clearing',
      baseline_start: '2026-01-01',
      baseline_finish: '2026-01-11',
      planned_duration: 10,
      planned_quantity: 100,
      actual_quantity: 0,
      unit: 'm2',
      weightage: 30,
      status: 'not_started',
    },
    {
      id: 'a2',
      wbs_code: '1.2',
      name: 'Main Excavation',
      baseline_start: '2026-01-11',
      baseline_finish: '2026-01-21',
      planned_duration: 10,
      planned_quantity: 500,
      actual_quantity: 0,
      unit: 'm3',
      weightage: 50,
      status: 'not_started',
    },
    {
      id: 'a3',
      wbs_code: '1.3',
      name: 'Perimeter Fencing (Parallel)',
      baseline_start: '2026-01-11',
      baseline_finish: '2026-01-16',
      planned_duration: 5,
      planned_quantity: 200,
      actual_quantity: 0,
      unit: 'm',
      weightage: 20,
      status: 'not_started',
    },
  ];

  const dependencies = [
    { id: 'd1', predecessor_id: 'a1', successor_id: 'a2', type: 'FS', lag: 0 },
    { id: 'd2', predecessor_id: 'a1', successor_id: 'a3', type: 'FS', lag: 0 },
  ];

  const result = calculateCPM(project, activities, dependencies);
  const a1 = result.find(a => a.id === 'a1');
  const a2 = result.find(a => a.id === 'a2');
  const a3 = result.find(a => a.id === 'a3');

  assert.ok(a1 && a2 && a3);

  // a1 starts at project start
  assert.equal(a1.early_start, '2026-01-01');
  assert.equal(a1.early_finish, '2026-01-11');

  // a2 follows a1
  assert.equal(a2.early_start, '2026-01-11');
  assert.equal(a2.early_finish, '2026-01-21');

  // a3 also starts after a1
  assert.equal(a3.early_start, '2026-01-11');
  assert.equal(a3.early_finish, '2026-01-16');

  // a1 and a2 form the longest path (20 days total), so a2 is critical
  assert.equal(a2.is_critical, true);
  assert.equal(a2.total_float, 0);

  // a1 is on critical path
  assert.equal(a1.is_critical, true);
  assert.equal(a1.total_float, 0);

  // a3 has 5 days of float
  assert.equal(a3.is_critical, false);
  assert.equal(a3.total_float, 5);
  assert.equal(a3.is_near_critical, true); // <= 7 days float
});

test('CPM projectProgress forecasts remaining duration based on productivity', () => {
  const { projectProgress } = loadCpmModule();

  const activity = {
    id: 'act-1',
    wbs_code: '2.1',
    name: 'Foundation Concrete',
    baseline_start: '2026-01-01',
    baseline_finish: '2026-01-11',
    planned_duration: 10,
    planned_quantity: 100,
    actual_quantity: 20,
    unit: 'm3',
    weightage: 10,
    productivity_rate: 10,
    status: 'in_progress',
  };

  const update = {
    activityId: 'act-1',
    date: '2026-01-03',
    quantityCompletedToday: 10,
    elapsedWorkingDays: 3,
  };

  const result = projectProgress(activity, update);
  // Total completed = 20 + 10 = 30 out of 100 => 30%
  assert.equal(result.actualProgressToday, 0.3);
  // Remaining = 100 - 30 = 70
  assert.equal(result.remainingQuantity, 70);
  // Productivity = 30 / 3 days = 10 units/day
  assert.equal(result.actualProductivity, 10);
  // Remaining duration = 70 / 10 = 7 days
  assert.equal(result.forecastRemainingDuration, 7);
  // Finish date = 2026-01-03 + 7 days = 2026-01-10
  assert.equal(result.forecastFinishDate, '2026-01-10');
});

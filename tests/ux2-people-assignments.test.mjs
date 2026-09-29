import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { assignmentStatus, suggestedFeatureAccess } from '../src/lib/projectAssignments.ts';

test('assignment access period has scheduled, active and expired states', () => {
  assert.equal(assignmentStatus({ start_date: '2026-10-02', end_date: null }, '2026-10-01'), 'scheduled');
  assert.equal(assignmentStatus({ start_date: '2026-09-01', end_date: '2026-10-02' }, '2026-10-01'), 'active');
  assert.equal(assignmentStatus({ start_date: '2026-09-01', end_date: '2026-09-30' }, '2026-10-01'), 'expired');
});

test('project role suggestions are editable feature suggestions, not authorization grants', () => {
  assert.equal(suggestedFeatureAccess('Site Engineer').daily_reports, 'write');
  const source = fs.readFileSync('src/app/api/project-assignments/route.ts', 'utf8');
  assert.match(source, /authorizeProjectRequest\(request, projectId, 'manage_users', access\)/);
  assert.match(source, /project_users/);
});

test('assignment storage is project scoped, period-safe and does not create browser write access', () => {
  const sql = fs.readFileSync('supabase_ux2_project_assignments.sql', 'utf8');
  assert.match(sql, /unique\(project_id, person_id\)/);
  assert.match(sql, /end_date is null or end_date >= start_date/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /never grants application access/);
});

test('people workspace retains UX-1 navigation and provides simple assignment actions', () => {
  const page = fs.readFileSync('src/app/page.tsx', 'utf8');
  const people = fs.readFileSync('src/components/PeopleAssignments.tsx', 'utf8');
  assert.match(page, /label="People"/); assert.match(page, /Professional tools/);
  for (const label of ['Assign Person', 'Project Role', 'capabilities', 'Reports To', 'End Assignment']) assert.match(people, new RegExp(label));
  assert.match(people, /\[projectId\]/);
});

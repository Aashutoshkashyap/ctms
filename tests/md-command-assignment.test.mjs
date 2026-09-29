import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { assignmentStatus, departmentName, validDepartmentKey } from '../src/lib/projectAssignments.ts';

test('department context is a bounded organizational value and assignment dates remain canonical', () => {
  assert.equal(validDepartmentKey('procurement'), true);
  assert.equal(validDepartmentKey('unknown-department'), false);
  assert.equal(departmentName('commercial'), 'Commercial / QS');
  assert.equal(assignmentStatus({ start_date: '2026-10-02', end_date: null }, '2026-10-01'), 'scheduled');
  assert.equal(assignmentStatus({ start_date: '2026-09-01', end_date: '2026-09-30' }, '2026-10-01'), 'expired');
});

test('management API remains project-scoped and capability selection cannot exceed actual access', () => {
  const route = fs.readFileSync('src/app/api/project-assignments/route.ts', 'utf8');
  assert.match(route, /authorizeProjectRequest\(request, projectId, 'manage_users', access\)/);
  assert.match(route, /validDepartmentKey/);
  assert.match(route, /can\(role, feature as Feature, permissions, 'read'\)/);
  assert.match(route, /eq\('project_id', projectId\)/);
  assert.match(route, /activePeople/);
});

test('department roster reuses the protected assignment route and only management users load it', () => {
  const workspace = fs.readFileSync('src/components/DepartmentsWorkspace.tsx', 'utf8');
  assert.match(workspace, /canManage/);
  assert.match(workspace, /\/api\/project-assignments\?projectId=/);
  assert.match(workspace, /People assigned to this department/);
  assert.match(workspace, /Department is organizational context/);
});

test('responsibility is attached to an existing procurement record, not a generic task', () => {
  const route = fs.readFileSync('src/app/api/procurement/route.ts', 'utf8');
  const adapter = fs.readFileSync('src/lib/workAdapter.ts', 'utf8');
  assert.match(route, /responsible_person_id/);
  assert.match(route, /active assignment in this project/);
  assert.match(route, /PROCUREMENT_ORDER_ASSIGNED/);
  assert.match(adapter, /assignee: item\.responsible_person_id/);
  assert.doesNotMatch(route, /generic_task|task_status|create_task/i);
});

test('migration is additive, retains RLS, and does not fabricate legacy department history', () => {
  const sql = fs.readFileSync('supabase_md_command_assignment.sql', 'utf8');
  assert.match(sql, /add column if not exists department_key/);
  assert.match(sql, /add column if not exists responsible_person_id/);
  assert.match(sql, /enable row level security/);
  assert.doesNotMatch(sql, /\btruncate\b|\bupdate\s+\w/i);
});

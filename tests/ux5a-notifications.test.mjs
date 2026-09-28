import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { activeAssignmentPeople } from '../src/lib/workflowRecipients.ts';

test('recipient resolver uses only active, assigned people for its department', () => {
  const rows = [
    { person_id: 'p1', project_role: 'Procurement Officer', start_date: '2026-01-01', end_date: null },
    { person_id: 'p2', project_role: 'Accountant', start_date: '2026-01-01', end_date: null },
    { person_id: 'p3', project_role: 'Store Officer', start_date: '2026-01-01', end_date: '2026-01-31' },
    { person_id: 'p1', project_role: 'Procurement Officer', start_date: '2026-01-01', end_date: null },
  ];
  assert.deepEqual(activeAssignmentPeople(rows, 'procurement', '2026-09-28'), ['p1']);
  assert.deepEqual(activeAssignmentPeople(rows, 'finance', '2026-09-28'), ['p2']);
});

test('server event service deduplicates events and notifications by stable keys', () => {
  const source = fs.readFileSync('src/lib/server/workflowEvents.ts', 'utf8');
  assert.match(source, /onConflict: 'organization_id,dedupe_key'/);
  assert.match(source, /onConflict: 'event_id,recipient_user_id'/);
  assert.match(source, /\[\.\.\.new Set\(recipientUserIds\)\]/);
});

test('notification API is authenticated, project scoped and only changes the recipient row', () => {
  const route = fs.readFileSync('src/app/api/notifications/route.ts', 'utf8');
  assert.match(route, /authorizeProjectMembershipRequest/);
  assert.match(route, /\.eq\('project_id', projectId\)\.eq\('recipient_user_id', auth\.userId\)/);
  assert.match(route, /\.eq\('id', notificationId\)\.eq\('project_id', projectId\)\.eq\('recipient_user_id', auth\.userId\)/);
  assert.doesNotMatch(route, /export async function POST/);
});

test('the notification workspace refreshes for the active project and does not use local storage as data', () => {
  const center = fs.readFileSync('src/components/NotificationCenter.tsx', 'utf8');
  const storage = fs.readFileSync('src/lib/storage.ts', 'utf8');
  assert.match(center, /\[projectId\]/);
  assert.match(center, /api\/notifications\?projectId=/);
  assert.match(center, /No server-confirmed notifications/);
  assert.doesNotMatch(center, /getNotifications\(/);
  assert.doesNotMatch(storage, /appendNotification\(key\);/);
  assert.doesNotMatch(storage, /\['app_notifications', 'bt_notifications'\]/);
});

test('migration retains legacy rows but removes browser policies and guards tenant/project consistency', () => {
  const sql = fs.readFileSync('supabase_ux5a_workflow_notifications.sql', 'utf8');
  assert.match(sql, /unique \(organization_id, dedupe_key\)/);
  assert.match(sql, /app_notifications_event_recipient_unique/);
  assert.match(sql, /workflow event project must belong to its organization/);
  assert.match(sql, /notification project must match its workflow event/);
  assert.match(sql, /drop policy if exists "notifications add"/);
  assert.match(sql, /drop policy if exists "phase1a tenant scope"/);
  assert.doesNotMatch(sql, /delete from app_notifications/i);
});

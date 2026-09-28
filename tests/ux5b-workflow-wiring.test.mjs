import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { activeAssignmentPeople } from '../src/lib/workflowRecipients.ts';

const siteRoute = fs.readFileSync('src/app/api/site-work/route.ts', 'utf8');
const procurementRoute = fs.readFileSync('src/app/api/procurement/route.ts', 'utf8');
const storage = fs.readFileSync('src/lib/storage.ts', 'utf8');
const events = fs.readFileSync('src/lib/server/workflowEvents.ts', 'utf8');

test('daily site work is confirmed by the protected server mutation before its one submission event is emitted', () => {
  assert.match(siteRoute, /authorizeProjectRequest\(request, projectId, 'daily_reports', 'write'\)/);
  assert.match(siteRoute, /if \(savedReport\.error \|\| !savedReport\.data\) return fail/);
  assert.match(siteRoute, /if \(!current\) \{/);
  assert.match(siteRoute, /eventType: 'PROJECT_SITE_WORK_REPORTED'/);
  assert.ok(siteRoute.indexOf('if (savedReport.error') < siteRoute.indexOf("eventType: 'PROJECT_SITE_WORK_REPORTED'"));
  assert.match(siteRoute, /dedupeKey: `project:\$\{projectId\}:daily-report:\$\{report\.id\}:submitted`/);
  assert.match(siteRoute, /resolveWorkflowRecipients\(actor\.admin, event\)/);
  assert.match(siteRoute, /recordWorkflowEvent\(actor\.admin, event, recipients\)/);
});

test('daily durable replay sends the original scoped operation to the server rather than emitting a client notification', () => {
  assert.match(storage, /fetch\('\/api\/site-work'/);
  assert.match(storage, /projectId: mutation\.projectId, operationId: mutation\.id/);
  assert.match(storage, /sync = await syncDailyWorkMutationToCloud\(mutation\)/);
  assert.doesNotMatch(storage, /appendNotification\(/);
});

test('daily site work rejects foreign activities and field staff cannot overwrite another reporter', () => {
  assert.match(siteRoute, /\.eq\('project_id', projectId\)\.in\('id', activityIds\)/);
  assert.match(siteRoute, /You may only update your own daily reports/);
  assert.match(siteRoute, /Valid project-scoped daily work values are required/);
});

test('only actual procurement approval and ordering transitions emit server events after the update succeeds', () => {
  assert.match(procurementRoute, /if\(saved\.error\)return fail\('Procurement record could not be updated\.'/);
  assert.match(procurementRoute, /current\.data\.status !== saved\.data\.status/);
  assert.match(procurementRoute, /draft_to_approved/);
  assert.match(procurementRoute, /approved_to_ordered/);
  assert.match(procurementRoute, /PROCUREMENT_ORDER_APPROVED/);
  assert.match(procurementRoute, /PROCUREMENT_ORDER_ORDERED/);
  assert.match(procurementRoute, /dedupeKey: `project:\$\{projectId\}:procurement-order:\$\{id\}:\$\{transition\}`/);
  assert.ok(procurementRoute.indexOf("if(saved.error)return fail('Procurement record could not be updated.'") < procurementRoute.indexOf('const transition ='));
});

test('recipient resolution remains UX-2 project scoped and produces one row per active person', () => {
  assert.match(events, /\.eq\('organization_id', event\.organizationId\)\.eq\('project_id', event\.projectId\)/);
  const recipients = activeAssignmentPeople([
    { person_id: 'site-a', project_role: 'Site Engineer', start_date: '2026-01-01', end_date: null },
    { person_id: 'procurement-a', project_role: 'Procurement Officer', start_date: '2026-01-01', end_date: null },
  ], 'site', '2026-09-28');
  assert.deepEqual(recipients, ['site-a']);
  assert.match(events, /\[\.\.\.new Set\(recipientUserIds\)\]/);
  assert.match(events, /onConflict: 'event_id,recipient_user_id'/);
});

test('workflow events are not writable from a browser endpoint and inbox ownership remains recipient-specific', () => {
  const notificationRoute = fs.readFileSync('src/app/api/notifications/route.ts', 'utf8');
  assert.doesNotMatch(siteRoute, /localStorage|window\./);
  assert.doesNotMatch(procurementRoute, /localStorage|window\./);
  assert.doesNotMatch(notificationRoute, /export async function POST/);
  assert.match(notificationRoute, /recipient_user_id', auth\.userId/);
});

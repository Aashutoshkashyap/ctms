import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync('src/app/page.tsx', 'utf8');
const experience = fs.readFileSync('src/components/ProjectExperience.tsx', 'utf8');

test('project-centric navigation exposes the simple workspace and keeps professional tools reachable', () => {
  for (const label of ['Home', 'Projects', 'People', 'Work', 'Departments', 'Notifications', 'Reports', 'Settings']) assert.match(page, new RegExp(`label="${label}"`));
  assert.match(page, /label="Administration"/);
  assert.match(page, /Professional tools/);
  for (const toolLabel of ['BOQ & Work Schedule', 'Procurement & Stores', 'IPC Billing & Certificates', 'Documents', 'Evidence Vault']) assert.match(page, new RegExp(`label="${toolLabel}"`));
});

test('home is project-scoped and presents project progress, money, attention and work entry points', () => {
  for (const label of ['Current project', 'Overall progress', 'Money', 'Work requiring attention', 'Progress']) assert.match(experience, new RegExp(label));
  assert.match(page, /<ProjectHome[\s\S]*project=\{project\}/);
  assert.match(experience, /storage\.getProcurementOrders\(\)/);
});

test('project switching retains the active-project stale-response guard and clears local project data', () => {
  assert.match(page, /setActivities\(\[\]\);[\s\S]*setExpenses\(\[\]\);/);
  assert.match(page, /workspaceUrl\(window\.location\.href, id\)/);
  assert.match(page, /isCurrentProject\(switchTo, storage\.getActiveProjectId\(\)\)/);
});

test('role navigation and department links remain gated by the existing authorization boundary', () => {
  assert.match(page, /const canAccess = .*can\(authUser\.role, feature, activePermissions, access\)/);
  assert.match(page, /canAccess\('operations'\).*tab="people"/);
  assert.match(page, /canAccess\('daily_reports'\).*tab="work"/);
  assert.match(page, /normalizeRole\(authUser\.role\) === 'project_director'/);
  for (const tab of ['procurement', 'budget', 'documents', 'claims']) assert.match(experience, new RegExp(`tab:'${tab}'`));
});

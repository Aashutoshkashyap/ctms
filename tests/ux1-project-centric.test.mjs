import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync('src/app/page.tsx', 'utf8');
const experience = fs.readFileSync('src/components/ProjectExperience.tsx', 'utf8');

test('primary navigation exposes exactly the twelve management modules', () => {
  const registry = page.slice(page.indexOf('const MANAGEMENT_MODULES:'), page.indexOf('const moduleForTab'));
  const labels = [...registry.matchAll(/\{ id: '[^']+', label: '([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(labels, ['Home', 'Projects', 'People', 'Work', 'Fleet', 'Inventory', 'Purchases', 'Commercial', 'Quality & Safety', 'Document Vault', 'Reports', 'Settings']);
  assert.match(page, /aria-label="Primary navigation"/);
  assert.match(page, /MANAGEMENT_MODULES\.map\(module =>/);
  assert.doesNotMatch(page, /Professional tools/);
  assert.match(page, /aria-label="Open notifications"/);
});

test('legacy tab IDs remain nested and authorized through their parent module', () => {
  const registry = page.slice(page.indexOf('const MANAGEMENT_MODULES:'), page.indexOf('const moduleForTab'));
  for (const [module, tab] of [['work', 'cpm'], ['work', 'daily'], ['inventory', 'stores'], ['purchases', 'procurement'], ['commercial', 'ipc'], ['commercial', 'claims'], ['document-vault', 'evidence'], ['settings', 'subscription']]) {
    const line = registry.split('\n').find(row => row.includes(`id: '${module}'`));
    assert.ok(line?.includes(`tab: '${tab}'`), `${tab} should be nested in ${module}`);
  }
  assert.match(page, /module\.views\.find\(view => isAllowedTab\(view\.tab\)\)/);
  assert.match(page, /visibleViews\.map\(view =>/);
  assert.match(page, /isKnownTab\(tab\) && isAllowedTab\(tab\)/);
  assert.match(page, /initialView=\{activeTab === 'stores' \? 'stores' : 'procurement'\}/);
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
  assert.match(page, /const isAllowedTab = .*canAccess\(TAB_FEATURES\[tab\]!\)/);
  assert.match(page, /const visibleViews = activeModule\?\.views\.filter\(view => isAllowedTab\(view\.tab\)\)/);
  assert.match(page, /normalizeRole\(authUser\.role\) === 'project_director'/);
  for (const tab of ['procurement', 'budget', 'documents', 'claims']) assert.match(experience, new RegExp(`tab:'${tab}'`));
});

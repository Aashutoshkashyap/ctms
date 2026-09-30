import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(path, 'utf8');

test('Home uses existing scoped records and only charts real project work', () => {
  const home = read('src/components/ManagementHome.tsx');
  const page = read('src/app/page.tsx');
  assert.match(home, /item\.project_id && projectIds\.has\(item\.project_id\)/);
  assert.match(home, /portfolio && projectRows\.filter\(row => row\.progress !== null\)\.length > 1/);
  assert.match(home, /<BarChart/);
  assert.match(home, /No work progress to show/);
  assert.match(page, /entries=\{homeEntries\}/);
  assert.match(page, /module\.views\.find\(view => isAllowedTab\(view\.tab\)\)/);
});

test('Projects keeps the authoritative project switch and permission-aware entry points', () => {
  const page = read('src/app/page.tsx');
  const home = read('src/components/ManagementHome.tsx');
  assert.match(page, /handleSwitchProject\(item\.id\)/);
  assert.match(page, /disabled=\{projectSwitching\}/);
  assert.match(home, /entries\.map\(\(\{ tab, label \}\)/);
  assert.match(home, /item\.project_id === project\.id/);
  assert.match(page, /Portfolio controls and archived projects/);
});

test('Inventory and Purchases keep one server-authoritative workspace with obvious stock actions', () => {
  const page = read('src/app/page.tsx');
  const workspace = read('src/components/ProcurementStoresDashboard.tsx');
  assert.match(page, /initialView=\{activeTab === 'stores' \? 'stores' : 'procurement'\}/);
  assert.match(workspace, /\/api\/stores\/inventory/);
  assert.match(workspace, /\/api\/procurement/);
  for (const label of ['Receive', 'Issue', 'Adjust', 'View details']) assert.match(workspace, new RegExp(label));
  assert.match(workspace, /setItems\(inventory\.items\|\|\[\]\)/);
});

test('new visual shell preserves the twelve-module navigation and protected notifications', () => {
  const page = read('src/app/page.tsx');
  const registry = page.slice(page.indexOf('const MANAGEMENT_MODULES:'), page.indexOf('const moduleForTab'));
  assert.equal([...registry.matchAll(/\{ id: '[^']+', label: '[^']+'/g)].length, 12);
  assert.match(page, /aria-label="Primary navigation"/);
  assert.match(page, /aria-label="Open notifications"/);
  assert.match(page, /const isAllowedTab = .*canAccess\(TAB_FEATURES\[tab\]!\)/);
});

#!/usr/bin/env node
/**
 * Read-only Supabase schema inspector via REST API (no psql required).
 * Uses the Supabase management API and PostgREST to enumerate tables, RLS, and RPCs.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const envPath = path.resolve(__dirname, '../.env.local');
const env = fs.readFileSync(envPath, 'utf8');
function getEnv(key) {
  const line = env.split('\n').find(l => l.startsWith(key + '='));
  return line ? line.slice(key.length + 1).trim().replace(/^"|"$/g, '') : null;
}

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const serviceKey = getEnv('SUPABASE_SECRET_KEY');
const ref = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!supabaseUrl || !serviceKey) { console.error('Missing env vars'); process.exit(1); }

console.log(`Supabase project ref: ${ref}`);
console.log(`REST endpoint: ${supabaseUrl}/rest/v1/`);

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { headers, timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function httpsPost(url, headers, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000
    }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

const authHeaders = {
  'apikey': serviceKey,
  'Authorization': `Bearer ${serviceKey}`,
  'Accept': 'application/json'
};

async function main() {
  // 1. Check connectivity via REST root
  console.log('\n=== 1. REST API CONNECTIVITY ===');
  try {
    const r = await httpsGet(`${supabaseUrl}/rest/v1/`, authHeaders);
    console.log(`Status: ${r.status} ${r.status === 200 ? 'OK' : 'FAILED'}`);
  } catch (e) { console.log('FAILED:', e.message); }

  // 2. Use Supabase Management API to list tables
  console.log('\n=== 2. TABLES VIA MANAGEMENT API ===');
  try {
    const r = await httpsGet(`https://api.supabase.com/v1/projects/${ref}/database/tables?schema=public`, {
      'Authorization': `Bearer ${serviceKey}`,
      'Accept': 'application/json'
    });
    console.log(`Management API status: ${r.status}`);
    if (r.status === 200) {
      const tables = JSON.parse(r.body);
      if (Array.isArray(tables)) {
        console.log('Tables found:', tables.map(t => t.name || t.table_name || JSON.stringify(t)).join(', '));
      } else console.log('Response:', r.body.slice(0, 300));
    } else console.log('Response:', r.body.slice(0, 300));
  } catch (e) { console.log('Management API error:', e.message); }

  // 3. Use query endpoint if available
  console.log('\n=== 3. SCHEMA VIA /rest/v1/rpc/query ===');
  const queries = [
    { name: 'public_tables', sql: "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name" },
    { name: 'public_functions', sql: "SELECT routine_name FROM information_schema.routines WHERE routine_schema='public' ORDER BY routine_name" },
  ];
  for (const q of queries) {
    try {
      const r = await httpsPost(`${supabaseUrl}/rest/v1/rpc/query`, authHeaders, { query: q.sql });
      console.log(`${q.name}: status=${r.status}, body=${r.body.slice(0,200)}`);
    } catch (e) { console.log(`${q.name}: error=${e.message}`); }
  }

  // 4. Try direct table access to check which tables exist
  console.log('\n=== 4. TABLE EXISTENCE VIA REST (HEAD requests) ===');
  const REQUIRED = [
    'platform_admins','organizations','organization_members','project_users','projects',
    'activities','dependencies','daily_reports','budget_heads',
    'ipc_valuation_periods','ipc_valuation_lines','ipc_valuation_measurement_links',
    'boq_contract_rates','boq_item_measurements',
    'payment_certificates','payment_certificate_deductions',
    'variations_and_claims','commercial_action_history',
    'employee_records','employee_project_assignments',
    'business_inquiries','subscription_transactions',
    'procurement_orders','store_items','vendors',
  ];

  const exists = [];
  const missing = [];

  for (const table of REQUIRED) {
    try {
      const r = await httpsGet(`${supabaseUrl}/rest/v1/${table}?limit=1`, {
        ...authHeaders,
        'Prefer': 'count=exact'
      });
      if (r.status === 200 || r.status === 206) {
        exists.push(table);
      } else if (r.status === 404 || r.status === 400) {
        const body = JSON.parse(r.body || '{}');
        if (body.code === 'PGRST116' || body.message?.includes('relation') || r.status === 404) {
          missing.push(table);
        } else {
          exists.push(table + `(status=${r.status})`);
        }
      } else {
        console.log(`  ${table}: status=${r.status}`);
      }
    } catch (e) {
      console.log(`  ${table}: error=${e.message}`);
    }
  }

  console.log('\nEXISTS:', exists.join(', ') || '(none)');
  console.log('\nMISSING:', missing.join(', ') || '(none — all found)');

  // 5. Check specific RPC
  console.log('\n=== 5. phase1g_apply_daily_report_update RPC CHECK ===');
  try {
    // Call with empty body — expect 400 (wrong params) not 404 (missing)
    const r = await httpsPost(`${supabaseUrl}/rest/v1/rpc/phase1g_apply_daily_report_update`, authHeaders, {});
    console.log(`Status: ${r.status}`);
    if (r.status === 404) console.log('MISSING: RPC does not exist');
    else if (r.status === 400 || r.status === 422) console.log('EXISTS: RPC present (parameter validation error expected)');
    else console.log('Response:', r.body.slice(0, 200));
  } catch (e) { console.log('RPC check error:', e.message); }

  // 6. Row counts for core tables
  console.log('\n=== 6. ROW COUNTS (existing tables) ===');
  for (const table of exists.filter(t => !t.includes('status='))) {
    try {
      const r = await httpsGet(`${supabaseUrl}/rest/v1/${table}?select=count`, {
        ...authHeaders, 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0'
      });
      const count = r.headers?.['content-range'] || 'unknown';
      // Parse content-range header
      const raw = JSON.parse(r.body || '[]');
      console.log(`  ${table}: ${raw.length} rows returned (limit=1 request)`);
    } catch (e) { /* skip */ }
  }

  console.log('\nInspection complete.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

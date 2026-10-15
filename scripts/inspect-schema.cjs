#!/usr/bin/env node
// Safe read-only Supabase schema inspector — CommonJS
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const env = fs.readFileSync(envPath, 'utf8');
function getEnv(key) {
  const line = env.split('\n').find(l => l.startsWith(key + '='));
  return line ? line.slice(key.length + 1).trim().replace(/^"|"$/g, '') : null;
}

const dbUrl = getEnv('SUPABASE_DB_URL');
if (!dbUrl) { console.error('SUPABASE_DB_URL not set'); process.exit(1); }
console.log('Connecting to: postgresql:***@' + dbUrl.replace(/.*@/, ''));

function psql(sql) {
  const tmp = '/tmp/ctms_schema_query.sql';
  fs.writeFileSync(tmp, sql);
  try {
    return execSync(`psql "${dbUrl}" --no-password -t -A -f /tmp/ctms_schema_query.sql 2>&1`, {
      timeout: 30000, encoding: 'utf8'
    }).trim();
  } catch (e) { return 'ERROR: ' + (e.stdout || e.message || '').slice(0, 300); }
}

console.log('\n=== 1. ALL PUBLIC TABLES ===');
console.log(psql(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name;`));

console.log('\n=== 2. RLS STATUS ===');
console.log(psql(`SELECT relname, CASE WHEN relrowsecurity THEN 'RLS_ON' ELSE 'RLS_OFF' END FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY relname;`));

console.log('\n=== 3. PUBLIC FUNCTIONS / RPCs ===');
console.log(psql(`SELECT routine_name, data_type FROM information_schema.routines WHERE routine_schema='public' ORDER BY routine_name;`));

console.log('\n=== 4. MIGRATION HISTORY ===');
const mig = psql(`SELECT version, name, executed_at::date FROM supabase_migrations.schema_migrations ORDER BY executed_at;`);
console.log(mig.startsWith('ERROR') ? 'No supabase_migrations schema: ' + mig : mig);

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

console.log('\n=== 5. REQUIRED TABLE EXISTENCE ===');
const inList = REQUIRED.map(t => `'${t}'`).join(',');
const found = psql(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN (${inList}) ORDER BY table_name;`);
console.log(found || '(none)');

const foundNames = found.split('\n').map(l => l.trim()).filter(Boolean);
const missing = [...new Set(REQUIRED)].filter(t => !foundNames.includes(t));
console.log('\n=== 6. MISSING REQUIRED TABLES ===');
console.log(missing.length ? missing.join('\n') : '(ALL REQUIRED TABLES EXIST)');

console.log('\n=== 7. phase1g_apply_daily_report_update RPC ===');
console.log(psql(`SELECT routine_name, data_type FROM information_schema.routines WHERE routine_schema='public' AND routine_name='phase1g_apply_daily_report_update';`));

console.log('\n=== 8. EXTENSIONS ===');
console.log(psql(`SELECT extname, extversion FROM pg_extension ORDER BY extname;`));

console.log('\n=== 9. ROW COUNTS (core tables, sanity check) ===');
const coreTables = ['organizations','projects','project_users','activities','daily_reports'];
for (const t of coreTables) {
  const r = psql(`SELECT COUNT(*) FROM ${t};`);
  console.log(`  ${t}: ${r}`);
}

console.log('\nInspection complete.');

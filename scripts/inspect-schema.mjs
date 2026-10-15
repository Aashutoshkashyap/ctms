/**
 * Safe read-only schema inspector for CTMS Supabase staging verification.
 * Queries: tables, RLS status, RPCs, indexes, and migration history.
 * Prints ONLY schema metadata — never credential values.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
const env = readFileSync(envPath, 'utf8');

function getEnv(key) {
  const line = env.split('\n').find(l => l.startsWith(key + '='));
  return line ? line.slice(key.length + 1).trim().replace(/^"|"$/g, '') : null;
}

const dbUrl = getEnv('SUPABASE_DB_URL');
if (!dbUrl) { console.error('SUPABASE_DB_URL not set'); process.exit(1); }

// Mask credentials in output
const safeDbUrl = dbUrl.replace(/:[^@]+@/, ':***@');
console.log('Connecting to:', safeDbUrl);

function psql(sql) {
  try {
    return execSync(`psql "${dbUrl}" --no-password -t -A -c "${sql.replace(/"/g, '\\"')}"`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    }).toString().trim();
  } catch (e) {
    return `ERROR: ${e.stderr?.toString().slice(0, 200) || e.message}`;
  }
}

function psqlFile(sql) {
  try {
    const tmp = '/tmp/ctms_inspect_query.sql';
    require('fs').writeFileSync(tmp, sql);
    return execSync(`psql "${dbUrl}" --no-password -t -A -f "${tmp}"`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    }).toString().trim();
  } catch (e) {
    return `ERROR: ${e.stderr?.toString().slice(0, 200) || e.message}`;
  }
}

import { writeFileSync } from 'node:fs';
function psqlSql(sql) {
  const tmp = '/tmp/ctms_inspect.sql';
  writeFileSync(tmp, sql);
  try {
    return execSync(`psql "${dbUrl}" --no-password -t -A -f /tmp/ctms_inspect.sql`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    }).toString().trim();
  } catch (e) {
    return `ERROR: ${e.stderr?.toString().slice(0, 200) || e.message}`;
  }
}

console.log('\n=== 1. EXISTING PUBLIC TABLES ===');
const tables = psqlSql(`
  SELECT table_name, 
         (SELECT COUNT(*) FROM information_schema.columns c2 WHERE c2.table_name = t.table_name AND c2.table_schema = 'public') AS col_count
  FROM information_schema.tables t 
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE' 
  ORDER BY table_name;
`);
console.log(tables || '(none)');

console.log('\n=== 2. RLS STATUS PER TABLE ===');
const rls = psqlSql(`
  SELECT relname AS table_name,
         CASE WHEN relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END AS rls_status,
         CASE WHEN relforcerowsecurity THEN 'FORCED' ELSE 'not-forced' END AS force_status
  FROM pg_class 
  WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
  ORDER BY relname;
`);
console.log(rls || '(none)');

console.log('\n=== 3. EXISTING FUNCTIONS / RPCs ===');
const rpcs = psqlSql(`
  SELECT routine_name, routine_type, data_type AS return_type
  FROM information_schema.routines
  WHERE routine_schema = 'public'
  ORDER BY routine_name;
`);
console.log(rpcs || '(none)');

console.log('\n=== 4. MIGRATION HISTORY (supabase_migrations schema) ===');
const migrations = psqlSql(`
  SELECT version, name, executed_at::date
  FROM supabase_migrations.schema_migrations
  ORDER BY executed_at
  LIMIT 50;
`);
console.log(migrations || '(none or schema not found)');

console.log('\n=== 5. CHECK REQUIRED TABLES EXIST ===');
const required = [
  'platform_admins', 'organizations', 'organization_members',
  'project_users', 'projects', 'activities', 'dependencies',
  'daily_reports', 'budget_heads', 'ipc_valuation_periods',
  'ipc_valuation_lines', 'ipc_valuation_measurement_links',
  'boq_contract_rates', 'boq_item_measurements',
  'payment_certificates', 'payment_certificate_deductions',
  'variations_and_claims', 'commercial_action_history',
  'employee_records', 'employee_project_assignments',
  'openwa_provider_configurations',
  'procurement_orders', 'store_items', 'vendors',
  'platform_admins', 'business_inquiries', 'subscription_transactions',
];
const reqCheck = psqlSql(`
  SELECT table_name, 'EXISTS' AS status
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    AND table_name IN (${required.map(t => `'${t}'`).join(',')})
  ORDER BY table_name;
`);
console.log(reqCheck || '(none of the required tables exist)');

console.log('\n=== 6. MISSING REQUIRED TABLES ===');
const existingNames = reqCheck.split('\n').map(l => l.split('|')[0]);
const missing = required.filter((t, i, arr) => arr.indexOf(t) === i && !existingNames.includes(t));
console.log(missing.length ? missing.join('\n') : '(all required tables exist)');

console.log('\n=== 7. CHECK REQUIRED RPC: phase1g_apply_daily_report_update ===');
const rpcCheck = psqlSql(`
  SELECT routine_name, data_type AS return_type,
         pg_get_functiondef(p.oid) IS NOT NULL AS has_definition
  FROM information_schema.routines r
  JOIN pg_proc p ON p.proname = r.routine_name AND p.pronamespace = 'public'::regnamespace
  WHERE routine_schema = 'public' AND routine_name = 'phase1g_apply_daily_report_update';
`);
console.log(rpcCheck || 'MISSING: phase1g_apply_daily_report_update not found');

console.log('\n=== 8. SUPABASE SCHEMA VERSION / EXTENSIONS ===');
const ext = psqlSql(`SELECT extname, extversion FROM pg_extension ORDER BY extname;`);
console.log(ext || '(none)');

console.log('\nDone.');

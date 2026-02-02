/**
 * Lists all app_users and their Supabase Auth migration status.
 * Run from project root: node scripts/check-auth-status.js
 *
 * Reads .env / .env.local for NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * (or NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY).
 */

const fs = require('fs');
const path = require('path');

function loadEnvFile(dir, fileName) {
  const envPath = path.resolve(dir, fileName);
  if (!fs.existsSync(envPath)) return false;
  let content = fs.readFileSync(envPath, 'utf8');
  content = content.replace(/^\uFEFF/, '');
  content.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
  return true;
}

const scriptRoot = path.resolve(__dirname, '..');
const cwdRoot = process.cwd();
for (const root of [scriptRoot, cwdRoot]) {
  loadEnvFile(root, '.env');
  loadEnvFile(root, '.env.local');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env or .env.local');
  process.exit(1);
}

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: users, error } = await supabase
    .from('app_users')
    .select('username, role, auth_user_id')
    .order('username');

  if (error) {
    console.error('Database error:', error.message);
    process.exit(1);
  }

  console.log('\nBrukere og innloggingsstatus:\n');
  let migrated = 0;
  let notMigrated = 0;

  for (const u of users || []) {
    const status = u.auth_user_id ? 'Migrert (Supabase Auth)' : 'Ikke migrert (gammelt passord ved første innlogging)';
    if (u.auth_user_id) migrated++;
    else notMigrated++;
    console.log(`  ${u.username.padEnd(20)} ${u.role.padEnd(14)} ${status}`);
  }

  console.log('\n---');
  console.log(`Totalt: ${users?.length || 0} brukere. Migrert: ${migrated}. Ikke migrert ennå: ${notMigrated}`);
  console.log('\nIkke-migrerte brukere kan logge inn med sitt nåværende passord; de migreres automatisk første gang.');
  console.log('Migrerte brukere bruker passordet som er satt i Supabase Auth (satt ved første innlogging eller via "Sett passord").\n');
}

main();

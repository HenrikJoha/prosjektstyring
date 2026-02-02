/**
 * One-time: update Supabase Auth user emails from *@prosjektstyring.internal
 * to *@prosjektstyring.example.com so Supabase's email validator accepts them.
 *
 * Run from project root: node scripts/update-auth-emails-to-example.js
 *
 * Reads .env / .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_).
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
    .select('username, auth_user_id')
    .not('auth_user_id', 'is', null);

  if (error) {
    console.error('Database error:', error.message);
    process.exit(1);
  }

  const newDomain = 'prosjektstyring.example.com';
  let updated = 0;

  for (const u of users || []) {
    const newEmail = `${u.username.toLowerCase()}@${newDomain}`;
    const { error: updateError } = await supabase.auth.admin.updateUserById(u.auth_user_id, {
      email: newEmail,
    });
    if (updateError) {
      console.error(`Failed to update ${u.username}:`, updateError.message);
      continue;
    }
    console.log('Updated:', u.username, '->', newEmail);
    updated++;
  }

  console.log('\nDone. Updated', updated, 'user(s) to @' + newDomain);
  console.log('Redeploy the app so the client uses the new domain for login.');
}

main();

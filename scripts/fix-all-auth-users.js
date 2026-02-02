/**
 * Fix all migrated users: update their Auth email to the transliterated version
 * AND set their password to the given value (default: Passord123).
 *
 * Run: node scripts/fix-all-auth-users.js [password]
 * Default password: Passord123
 *
 * This fixes users who were migrated with old email format or different password.
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
const password = process.argv[2] || 'Passord123';

if (!url || !serviceRoleKey) {
  console.error('Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env or .env.local');
  process.exit(1);
}

const EMAIL_DOMAIN = 'prosjektstyring.example.com';

function usernameToAuthEmail(username) {
  const TRANSLIT = { å: 'a', æ: 'ae', ø: 'o', ä: 'a', ö: 'o', ü: 'u', é: 'e', è: 'e', ê: 'e', ë: 'e', ñ: 'n', ß: 'ss' };
  const normalized = String(username).toLowerCase().trim();
  let local = '';
  for (let i = 0; i < normalized.length; i++) {
    local += TRANSLIT[normalized[i]] ?? normalized[i];
  }
  local = local.replace(/[^a-z0-9._-]/g, '');
  return local ? local + '@' + EMAIL_DOMAIN : 'user@' + EMAIL_DOMAIN;
}

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Get all users that have been migrated (have auth_user_id)
  const { data: users, error: fetchError } = await supabase
    .from('app_users')
    .select('id, username, auth_user_id')
    .not('auth_user_id', 'is', null)
    .order('username');

  if (fetchError) {
    console.error('Database error:', fetchError.message);
    process.exit(1);
  }

  console.log('\nFix all migrated Auth users');
  console.log('Password will be set to:', password);
  console.log('Users to fix:', (users || []).length);
  console.log('');

  if (!users || users.length === 0) {
    console.log('No migrated users found.\n');
    return;
  }

  let ok = 0;
  let fail = 0;

  for (const u of users) {
    const correctEmail = usernameToAuthEmail(u.username);

    // Update both email and password
    const { error: updateError } = await supabase.auth.admin.updateUserById(u.auth_user_id, {
      email: correctEmail,
      password: password,
    });

    if (updateError) {
      console.error('FAIL', u.username, '-', updateError.message);
      fail++;
      continue;
    }

    console.log('OK', u.username, '-> email:', correctEmail, ', password: set');
    ok++;
  }

  console.log('\nDone. Fixed:', ok, 'Failed:', fail);
  console.log('All users can now log in with their username (e.g. ståle) and password:', password, '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

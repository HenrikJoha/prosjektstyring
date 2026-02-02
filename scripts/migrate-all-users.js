/**
 * Migrate all app_users that are not yet migrated: create Supabase Auth user
 * with the given password and link auth_user_id. Skips users who already have auth_user_id.
 *
 * Run: node scripts/migrate-all-users.js [password]
 * Default password: Passord123
 *
 * Example: node scripts/migrate-all-users.js
 * Example: node scripts/migrate-all-users.js Passord123
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

  const { data: users, error: fetchError } = await supabase
    .from('app_users')
    .select('id, username, auth_user_id')
    .order('username');

  if (fetchError) {
    console.error('Database error:', fetchError.message);
    process.exit(1);
  }

  const toMigrate = (users || []).filter((u) => !u.auth_user_id);
  const alreadyMigrated = (users || []).filter((u) => u.auth_user_id);

  console.log('\nMigrate all users (password:', password + ')');
  console.log('Already migrated (skipped):', alreadyMigrated.length);
  console.log('To migrate:', toMigrate.length);
  console.log('');

  if (toMigrate.length === 0) {
    console.log('Nothing to do. All users are already migrated.\n');
    return;
  }

  let ok = 0;
  let fail = 0;

  for (const u of toMigrate) {
    const email = usernameToAuthEmail(u.username);
    const { data: authData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      console.error('FAIL', u.username, '-', createError.message);
      fail++;
      continue;
    }

    const { error: linkError } = await supabase
      .from('app_users')
      .update({ auth_user_id: authData.user.id })
      .eq('id', u.id);

    if (linkError) {
      console.error('FAIL', u.username, '(link)', linkError.message);
      await supabase.auth.admin.deleteUser(authData.user.id);
      fail++;
      continue;
    }

    console.log('OK', u.username, '->', email);
    ok++;
  }

  console.log('\nDone. Migrated:', ok, 'Failed:', fail);
  console.log('All migrated users can log in with their username and password:', password, '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

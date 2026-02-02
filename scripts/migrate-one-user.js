/**
 * Force-migrate one user: create Supabase Auth user with given password and link to app_users.
 * Use when the normal migrate flow fails (e.g. password hash mismatch).
 *
 * Run: node scripts/migrate-one-user.js <username> <password>
 * Example: node scripts/migrate-one-user.js ståle passord
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
const usernameArg = process.argv[2];
const passwordArg = process.argv[3];

if (!url || !serviceRoleKey) {
  console.error('Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env or .env.local');
  process.exit(1);
}
if (!usernameArg || !passwordArg) {
  console.error('Usage: node scripts/migrate-one-user.js <username> <password>');
  console.error('Example: node scripts/migrate-one-user.js ståle passord');
  process.exit(1);
}

const EMAIL_DOMAIN = 'prosjektstyring.example.com';

// Same as src/utils/auth-email.ts - Supabase rejects non-ASCII in email
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

  // Try exact username first, then lowercase (DB might store "Ståle" or "ståle")
  const candidates = [usernameArg.trim(), usernameArg.trim().toLowerCase()];
  let appUser = null;

  for (const u of candidates) {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, username, auth_user_id')
      .eq('username', u)
      .maybeSingle();
    if (error) {
      console.error('Database error:', error.message);
      process.exit(1);
    }
    if (data) {
      appUser = data;
      break;
    }
  }

  if (!appUser) {
    console.error('User not found in app_users:', usernameArg);
    console.error('Tried:', candidates.join(', '));
    process.exit(1);
  }

  const email = usernameToAuthEmail(appUser.username);

  if (appUser.auth_user_id) {
    // Already migrated: just set the password
    const { error } = await supabase.auth.admin.updateUserById(appUser.auth_user_id, {
      password: passwordArg,
    });
    if (error) {
      console.error('Failed to set password:', error.message);
      process.exit(1);
    }
    console.log('User', appUser.username, 'was already migrated. Password updated to the one you provided.');
    console.log('They can now log in with username:', appUser.username, 'and the new password.');
    return;
  }

  // Not migrated: create Auth user and link
  const { data: authData, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: passwordArg,
    email_confirm: true,
  });

  if (createError) {
    console.error('Failed to create Auth user:', createError.message);
    process.exit(1);
  }

  const { error: linkError } = await supabase
    .from('app_users')
    .update({ auth_user_id: authData.user.id })
    .eq('id', appUser.id);

  if (linkError) {
    console.error('Failed to link app_users:', linkError.message);
    await supabase.auth.admin.deleteUser(authData.user.id);
    process.exit(1);
  }

  console.log('Migrated user:', appUser.username);
  console.log('Auth email:', email);
  console.log('They can now log in with username:', appUser.username, 'and password:', passwordArg);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

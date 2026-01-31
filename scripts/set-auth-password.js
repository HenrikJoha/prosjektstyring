/**
 * One-off script to set a Supabase Auth user's password by app_users username.
 * Use when you're locked out (e.g. admin password no longer works).
 *
 * Run from project root:
 *   node scripts/set-auth-password.js <username> <new_password>
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env or .env.local.
 */

const fs = require('fs');
const path = require('path');

function loadEnvFile(dir, fileName) {
  const envPath = path.resolve(dir, fileName);
  if (!fs.existsSync(envPath)) return false;
  let content = fs.readFileSync(envPath, 'utf8');
  content = content.replace(/^\uFEFF/, ''); // strip BOM
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

// Try script directory then current working directory (same as Next.js)
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
const username = process.argv[2];
const newPassword = process.argv[3];

if (!url || !serviceRoleKey) {
  console.error('Missing env: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) in .env or .env.local');
  const check = (dir) => ({
    dir,
    '.env': fs.existsSync(path.resolve(dir, '.env')),
    '.env.local': fs.existsSync(path.resolve(dir, '.env.local')),
  });
  console.error('Looked in:', JSON.stringify([check(scriptRoot), check(cwdRoot)], null, 2));
  process.exit(1);
}
if (!username || !newPassword) {
  console.error('Usage: node scripts/set-auth-password.js <username> <new_password>');
  console.error('Example: node scripts/set-auth-password.js admin MyNewPassword');
  process.exit(1);
}

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const normalizedUsername = username.toLowerCase().trim();
  const { data: appUser, error: fetchError } = await supabase
    .from('app_users')
    .select('auth_user_id, username')
    .eq('username', normalizedUsername)
    .maybeSingle();

  if (fetchError) {
    console.error('Database error:', fetchError.message);
    process.exit(1);
  }
  if (!appUser) {
    console.error('User not found:', normalizedUsername);
    process.exit(1);
  }
  if (!appUser.auth_user_id) {
    console.error('User is not linked to Supabase Auth (no auth_user_id). Run migration first.');
    process.exit(1);
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(appUser.auth_user_id, {
    password: newPassword,
  });

  if (updateError) {
    console.error('Failed to set password:', updateError.message);
    process.exit(1);
  }

  console.log('Password updated for user:', appUser.username);
  console.log('You can now log in with this username and the new password.');
}

main();

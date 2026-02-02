/**
 * Debug login for a specific user - shows exactly where/why login fails.
 * Run: node scripts/debug-login.js <username> <password>
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

const username = process.argv[2];
const password = process.argv[3];

if (!url || !serviceRoleKey || !anonKey) {
  console.error('Missing env vars');
  process.exit(1);
}
if (!username || !password) {
  console.error('Usage: node scripts/debug-login.js <username> <password>');
  process.exit(1);
}

// Same hash function as in src/lib/hash.ts
async function hashPassword(pwd) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pwd + 'prosjektstyring_salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  
  const supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  
  const supabaseAnon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const normalizedUsername = username.toLowerCase().trim();
  const EMAIL_DOMAIN = 'prosjektstyring.example.com';
  const TRANSLIT = { å: 'a', æ: 'ae', ø: 'o', ä: 'a', ö: 'o', ü: 'u', é: 'e', è: 'e', ê: 'e', ë: 'e', ñ: 'n', ß: 'ss' };
  function toLocal(s) {
    const n = String(s).toLowerCase().trim();
    let local = '';
    for (let i = 0; i < n.length; i++) local += TRANSLIT[n[i]] ?? n[i];
    return local.replace(/[^a-z0-9._-]/g, '') || 'user';
  }
  const email = toLocal(normalizedUsername) + '@' + EMAIL_DOMAIN;

  console.log('\n=== DEBUG LOGIN ===');
  console.log('Username:', normalizedUsername);
  console.log('Email for Auth:', email);
  console.log('Password length:', password.length);
  console.log('');

  // Step 1: Check app_users
  console.log('--- Step 1: Check app_users ---');
  const { data: appUser, error: appError } = await supabaseAdmin
    .from('app_users')
    .select('id, username, password_hash, auth_user_id, role')
    .eq('username', normalizedUsername)
    .maybeSingle();

  if (appError) {
    console.log('ERROR fetching app_users:', appError.message);
    return;
  }
  if (!appUser) {
    console.log('NOT FOUND: No user with username "' + normalizedUsername + '" in app_users');
    console.log('Check: Is the username spelled correctly? Is it lowercase in the database?');
    return;
  }
  console.log('Found in app_users:');
  console.log('  id:', appUser.id);
  console.log('  username:', appUser.username);
  console.log('  role:', appUser.role);
  console.log('  auth_user_id:', appUser.auth_user_id || '(not set - not migrated)');
  console.log('  password_hash (first 20 chars):', (appUser.password_hash || '').substring(0, 20) + '...');
  console.log('');

  // Step 2: Check password hash
  console.log('--- Step 2: Check password hash ---');
  const computedHash = await hashPassword(password);
  console.log('Computed hash (first 20 chars):', computedHash.substring(0, 20) + '...');
  const hashMatches = computedHash === appUser.password_hash;
  console.log('Hash matches app_users.password_hash:', hashMatches ? 'YES' : 'NO');
  if (!hashMatches && !appUser.auth_user_id) {
    console.log('PROBLEM: Password hash does not match and user is not migrated.');
    console.log('This means the password you entered is different from what is stored in app_users.password_hash.');
    console.log('Either the password is wrong, or the original hash was created differently.');
  }
  console.log('');

  // Step 3: Check Supabase Auth
  console.log('--- Step 3: Check Supabase Auth ---');
  if (appUser.auth_user_id) {
    // Get Auth user details
    const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(appUser.auth_user_id);
    if (authUserError) {
      console.log('ERROR fetching Auth user:', authUserError.message);
    } else if (authUserData?.user) {
      console.log('Found Auth user:');
      console.log('  id:', authUserData.user.id);
      console.log('  email:', authUserData.user.email);
      console.log('  email_confirmed:', authUserData.user.email_confirmed_at ? 'YES' : 'NO');
      
      if (authUserData.user.email !== email) {
        console.log('');
        console.log('PROBLEM: Auth user email does not match expected email!');
        console.log('  Auth user email:', authUserData.user.email);
        console.log('  Expected email:', email);
        console.log('  The login will try to sign in with "' + email + '" but the Auth user has "' + authUserData.user.email + '"');
        console.log('  FIX: Run "npm run update-auth-emails" to update Auth emails to the new domain.');
      }
    }
    console.log('');

    // Try to sign in with anon client
    console.log('--- Step 4: Try Supabase Auth sign-in ---');
    const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      console.log('SIGN-IN FAILED:', signInError.message);
      console.log('');
      if (signInError.message.includes('Invalid login credentials')) {
        console.log('This means either:');
        console.log('  1. The email does not exist in Supabase Auth (check email mismatch above)');
        console.log('  2. The password is wrong for this Supabase Auth user');
        console.log('');
        console.log('If email matches, the password in Supabase Auth is different from what you entered.');
        console.log('FIX: Use "npm run set-password -- ' + normalizedUsername + ' <new_password>" to set a new password.');
      }
    } else {
      console.log('SIGN-IN SUCCESSFUL!');
      console.log('User:', signInData.user?.email);
      console.log('');
      console.log('If login still fails in the app, the issue might be client-side (cookies, localStorage, etc.).');
    }
  } else {
    console.log('User is NOT migrated (no auth_user_id).');
    console.log('When they log in, the app will try to migrate them.');
    console.log('');
    if (hashMatches) {
      console.log('Password hash MATCHES. Migration should work.');
      console.log('If login fails, check Vercel logs for errors in the migrate API.');
    } else {
      console.log('Password hash DOES NOT MATCH. Migration will fail.');
      console.log('');
      console.log('POSSIBLE CAUSES:');
      console.log('  1. The password you entered is wrong.');
      console.log('  2. The original password_hash in app_users was created with a different hash function.');
      console.log('');
      console.log('To check what hash is expected, look at app_users.password_hash for this user.');
      console.log('If the original system used a different hashing method, you may need to:');
      console.log('  - Manually set auth_user_id for this user, OR');
      console.log('  - Use "npm run set-password" after manually creating an Auth user');
    }
  }

  console.log('\n=== END DEBUG ===\n');
}

main().catch(console.error);

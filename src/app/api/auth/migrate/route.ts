import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hashPassword } from '@/lib/hash';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL_DOMAIN = 'prosjektstyring.internal';

/**
 * Migrate a user from old password hash to Supabase Auth.
 * Called when user's first login attempt to Supabase Auth fails.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = typeof body.username === 'string' ? body.username.toLowerCase().trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      return NextResponse.json({ error: 'Brukernavn og passord er påkrevd' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find user in app_users
    const { data: appUser, error: fetchError } = await supabaseAdmin
      .from('app_users')
      .select('id, username, password_hash, auth_user_id')
      .eq('username', username)
      .maybeSingle();

    if (fetchError || !appUser) {
      return NextResponse.json({ error: 'Feil brukernavn eller passord' }, { status: 401 });
    }

    // If already migrated, tell client to use Supabase Auth directly
    if (appUser.auth_user_id) {
      return NextResponse.json({ error: 'Feil brukernavn eller passord' }, { status: 401 });
    }

    // Verify old password hash
    const oldHash = await hashPassword(password);
    if (oldHash !== appUser.password_hash) {
      return NextResponse.json({ error: 'Feil brukernavn eller passord' }, { status: 401 });
    }

    // Create Supabase Auth user with synthetic email
    const email = `${username}@${EMAIL_DOMAIN}`;
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Skip email confirmation
    });

    if (createError || !authData.user) {
      console.error('Error creating auth user:', createError);
      return NextResponse.json({ error: 'Kunne ikke opprette bruker' }, { status: 500 });
    }

    // Link app_users to auth user
    const { error: linkError } = await supabaseAdmin
      .from('app_users')
      .update({ auth_user_id: authData.user.id })
      .eq('id', appUser.id);

    if (linkError) {
      console.error('Error linking user:', linkError);
      // Try to clean up the auth user we just created
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: 'Kunne ikke koble bruker' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, email });
  } catch (err) {
    console.error('Migration error:', err);
    return NextResponse.json({ error: 'En feil oppstod' }, { status: 500 });
  }
}

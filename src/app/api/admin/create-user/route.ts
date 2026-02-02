import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { usernameToAuthEmail } from '@/utils/auth-email';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: Request) {
  try {
    if (!serviceRoleKey) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY on server');
      return NextResponse.json({ error: 'Server miskonfigurert' }, { status: 500 });
    }
    // Verify caller is admin
    const supabaseAuth = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: {
        headers: {
          cookie: (await cookies()).toString(),
        },
      },
    });
    
    const { data: { user: authUser } } = await supabaseAuth.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if caller is admin
    const { data: callerAppUser } = await supabaseAdmin
      .from('app_users')
      .select('role')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();

    if (!callerAppUser || callerAppUser.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const username = typeof body.username === 'string' ? body.username.toLowerCase().trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = body.role === 'admin' || body.role === 'prosjektleder' ? body.role : 'prosjektleder';
    const workerId = body.workerId ?? null;

    if (!username || !password) {
      return NextResponse.json({ error: 'Brukernavn og passord er påkrevd' }, { status: 400 });
    }

    // Check if username already exists
    const { data: existing } = await supabaseAdmin
      .from('app_users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Brukernavn er allerede i bruk' }, { status: 400 });
    }

    // Create Supabase Auth user (ASCII-only email for Supabase validation)
    const email = usernameToAuthEmail(username);
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError || !authData.user) {
      console.error('Error creating auth user:', createError);
      return NextResponse.json({ error: 'Kunne ikke opprette bruker' }, { status: 500 });
    }

    // Create app_users record
    const { error: insertError } = await supabaseAdmin.from('app_users').insert({
      username,
      password_hash: '', // No longer used, but keep for backwards compat
      role,
      worker_id: workerId,
      auth_user_id: authData.user.id,
    });

    if (insertError) {
      console.error('Error inserting app_user:', insertError);
      // Clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: 'Kunne ikke opprette bruker' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Create user error:', err);
    return NextResponse.json({ error: 'En feil oppstod' }, { status: 500 });
  }
}

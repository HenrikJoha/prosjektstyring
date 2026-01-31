import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Admin-only: set Supabase Auth password for a user by app_users username.
 * Use this for @prosjektstyring.internal users where "Send password recovery" does not work.
 */
export async function POST(request: Request) {
  try {
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
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!username || !newPassword) {
      return NextResponse.json(
        { error: 'Brukernavn og nytt passord er påkrevd' },
        { status: 400 }
      );
    }

    const { data: appUser, error: fetchError } = await supabaseAdmin
      .from('app_users')
      .select('auth_user_id')
      .eq('username', username)
      .maybeSingle();

    if (fetchError || !appUser?.auth_user_id) {
      return NextResponse.json(
        { error: 'Bruker ikke funnet eller ikke koblet til innlogging' },
        { status: 404 }
      );
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      appUser.auth_user_id,
      { password: newPassword }
    );

    if (updateError) {
      console.error('Set password error:', updateError);
      return NextResponse.json(
        { error: 'Kunne ikke oppdatere passord' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Set password error:', err);
    return NextResponse.json({ error: 'En feil oppstod' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

/**
 * Admin-only: set Supabase Auth password for a user by app_users id.
 * Looks up app_users -> auth_user_id, then updates Supabase Authentication (Auth) password.
 * Use this for synthetic-email users where "Send password recovery" does not work.
 */
export async function POST(request: Request) {
  try {
    if (!serviceRoleKey) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY on server');
      return NextResponse.json({ error: 'Server miskonfigurert' }, { status: 500 });
    }
    const authHeader = request.headers.get('Authorization');
    const jwt = authHeader?.replace(/^Bearer\s+/i, '') || undefined;
    const supabaseAuth = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : { cookie: (await cookies()).toString() },
      },
    });

    const { data: { user: authUser } } = jwt
      ? await supabaseAuth.auth.getUser(jwt)
      : await supabaseAuth.auth.getUser();
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
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!userId || !newPassword) {
      return NextResponse.json(
        { error: 'Bruker og nytt passord er påkrevd' },
        { status: 400 }
      );
    }

    const { data: appUser, error: fetchError } = await supabaseAdmin
      .from('app_users')
      .select('auth_user_id')
      .eq('id', userId)
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
      const err = updateError as { message?: string; msg?: string; error_description?: string; status?: number; code?: string };
      let message =
        (typeof err.message === 'string' && err.message.trim()) ||
        (typeof err.msg === 'string' && err.msg.trim()) ||
        (typeof err.error_description === 'string' && err.error_description.trim()) ||
        '';
      if (!message && err.code === 'weak_password') {
        message = 'Passordet er for svakt. Supabase krever minst 6 tegn (og anbefaler et sterkere passord).';
      }
      if (!message) message = 'Kunne ikke oppdatere passord';
      const status = err.status === 400 ? 400 : 500;
      return NextResponse.json(
        { error: message },
        { status }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Set password error:', err);
    return NextResponse.json({ error: 'En feil oppstod' }, { status: 500 });
  }
}

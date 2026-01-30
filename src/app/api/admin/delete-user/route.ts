import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
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
    const userId = body.userId;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Get the user to delete
    const { data: targetUser } = await supabaseAdmin
      .from('app_users')
      .select('id, auth_user_id')
      .eq('id', userId)
      .maybeSingle();

    if (!targetUser) {
      return NextResponse.json({ error: 'Bruker ikke funnet' }, { status: 404 });
    }

    // Don't allow deleting yourself
    if (targetUser.auth_user_id === authUser.id) {
      return NextResponse.json({ error: 'Du kan ikke slette din egen bruker' }, { status: 400 });
    }

    // Delete app_users record first
    const { error: deleteAppError } = await supabaseAdmin
      .from('app_users')
      .delete()
      .eq('id', userId);

    if (deleteAppError) {
      console.error('Error deleting app_user:', deleteAppError);
      return NextResponse.json({ error: 'Kunne ikke slette bruker' }, { status: 500 });
    }

    // Delete Supabase Auth user if exists
    if (targetUser.auth_user_id) {
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(
        targetUser.auth_user_id
      );
      if (deleteAuthError) {
        console.error('Error deleting auth user:', deleteAuthError);
        // App user is already deleted, just log the error
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Delete user error:', err);
    return NextResponse.json({ error: 'En feil oppstod' }, { status: 500 });
  }
}

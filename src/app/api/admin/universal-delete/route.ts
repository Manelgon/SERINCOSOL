import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Server-side admin client (bypasses RLS)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        const { id, email, password, type } = await request.json();

        if (!id || !email || !password || !type) {
            return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
        }

        // 1. Verify credentials by attempting to sign in (stateless)
        const tempClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data: authData, error: authError } = await tempClient.auth.signInWithPassword({
            email,
            password,
        });

        if (authError || !authData.user) {
            return NextResponse.json({ error: 'Credenciales de administrador inválidas' }, { status: 401 });
        }

        // 2. Verify authorization (must be admin)
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('rol')
            .eq('user_id', authData.user.id)
            .single();

        if (profile?.rol !== 'admin') {
            return NextResponse.json({ error: 'No tienes permisos de administrador para realizar esta acción' }, { status: 403 });
        }

        // 3. Perform Deletion based on type
        let deleteError = null;

        if (type === 'incidencia') {
            const { error } = await supabaseAdmin.from('incidencias').delete().eq('id', id);
            deleteError = error;
        } else if (type === 'morosidad') {
            const { error } = await supabaseAdmin.from('morosidad').delete().eq('id', id);
            deleteError = error;
        } else if (type === 'comunidad') {
            const { error } = await supabaseAdmin.from('comunidades').delete().eq('id', id);
            deleteError = error;
        } else if (type === 'perfil') {
            // Check if trying to delete self
            if (id === authData.user.id) {
                return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta mientras estás logueado' }, { status: 400 });
            }
            // Delete from Auth (Triggers cascade to profiles usually, or we delete profile manually)
            // Supabase Auth Admin deleteUser is best
            const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
            deleteError = error;
        } else if (type === 'document') {
            const { error } = await supabaseAdmin.from('doc_submissions').delete().eq('id', id);
            deleteError = error;
        } else if (type === 'proveedor') {
            const { error } = await supabaseAdmin.from('proveedores').delete().eq('id', id);
            deleteError = error;
        } else {
            return NextResponse.json({ error: 'Tipo de entidad no válido' }, { status: 400 });
        }

        if (deleteError) {
            console.error('Delete error:', deleteError);
            return NextResponse.json({ error: 'Error al eliminar: ' + deleteError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('API error:', error);
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
}

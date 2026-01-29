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

        // 3. Fetch details for logging before deletion
        let entityName = "Desconocido";
        let entityDetails = {};

        if (type === 'incidencia') {
            const { data } = await supabaseAdmin.from('incidencias').select('nombre_cliente').eq('id', id).single();
            entityName = data?.nombre_cliente || `Ticket #${id}`;
        } else if (type === 'morosidad') {
            const { data } = await supabaseAdmin.from('morosidad').select('nombre_cliente, titulo').eq('id', id).single();
            entityName = data?.titulo || data?.nombre_cliente || `Morosidad #${id}`;
        } else if (type === 'comunidad') {
            const { data } = await supabaseAdmin.from('comunidades').select('nombre_cdad').eq('id', id).single();
            entityName = data?.nombre_cdad || `Comunidad #${id}`;
        } else if (type === 'perfil') {
            const { data } = await supabaseAdmin.from('profiles').select('nombre').eq('user_id', id).single();
            entityName = data?.nombre || `Usuario #${id}`;
        } else if (type === 'document') {
            const { data } = await supabaseAdmin.from('doc_submissions').select('title, payload').eq('id', id).single();
            entityName = data?.title || `Documento #${id}`;
            entityDetails = {
                titulo: data?.title,
                cliente: data?.payload?.["Nombre Cliente"] || data?.payload?.["Nombre"]
            };
        } else if (type === 'proveedor') {
            const { data } = await supabaseAdmin.from('proveedores').select('nombre_proveedor').eq('id', id).single();
            entityName = data?.nombre_proveedor || `Proveedor #${id}`;
        }

        // 4. Perform Deletion based on type
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

        // 5. Log activity
        await supabaseAdmin.from('activity_logs').insert({
            user_id: authData.user.id,
            user_name: authData.user.user_metadata?.nombre || authData.user.email || 'Admin',
            action: 'delete',
            entity_type: type === 'document' ? 'documento' : type,
            entity_id: typeof id === 'number' ? id : null, // profile id is uuid string
            entity_name: entityName,
            details: JSON.stringify({
                ...entityDetails,
                id: id, // Explicitly add ID for consistency as requested
                deleted_by: email,
                entity_id: id // Store original ID (numeric or uuid) in details
            })
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('API error:', error);
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
}

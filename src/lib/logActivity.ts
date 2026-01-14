import { supabase } from './supabaseClient';

export type ActivityAction = 'create' | 'update' | 'delete' | 'mark_paid' | 'toggle_active' | 'update_password' | 'clock_in' | 'clock_out' | 'generate';
export type EntityType = 'comunidad' | 'incidencia' | 'morosidad' | 'profile' | 'fichaje' | 'documento';

interface LogActivityParams {
    action: ActivityAction;
    entityType: EntityType;
    entityId?: number;
    entityName?: string;
    details?: any;
}

export async function logActivity({
    action,
    entityType,
    entityId,
    entityName,
    details
}: LogActivityParams) {
    try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get user profile for name
        const { data: profile } = await supabase
            .from('profiles')
            .select('nombre')
            .eq('user_id', user.id)
            .single();

        // Insert activity log
        await supabase.from('activity_logs').insert({
            user_id: user.id,
            user_name: profile?.nombre || user.email || 'Usuario',
            action,
            entity_type: entityType,
            entity_id: entityId,
            entity_name: entityName,
            details: details ? JSON.stringify(details) : null,
        });
    } catch (error) {
        console.error('Error logging activity:', error);
        // Don't throw - logging should not break the main operation
    }
}

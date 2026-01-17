import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { data, error } = await supabaseAdmin.rpc('auto_close_stale_sessions');

        if (error) {
            console.error('Error in auto_close_stale_sessions:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            closed_sessions: data?.[0]?.closed_count ?? 0
        });
    } catch (err: any) {
        console.error('Cron error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

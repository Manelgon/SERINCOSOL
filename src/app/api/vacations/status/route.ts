import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const year = searchParams.get('year') || new Date().getFullYear().toString();

        if (!userId) {
            return NextResponse.json({ error: 'Falta userId' }, { status: 400 });
        }

        // 1) Fetch Balance
        const { data: balance, error: balanceError } = await supabaseAdmin
            .from('vacation_balances')
            .select('*')
            .eq('user_id', userId)
            .eq('year', parseInt(year))
            .maybeSingle();

        if (balanceError) throw balanceError;

        // 2) If no balance exists, create one (default values)
        let finalBalance = balance;
        if (!balance) {
            const { data: newBalance, error: createError } = await supabaseAdmin
                .from('vacation_balances')
                .insert({
                    user_id: userId,
                    year: parseInt(year)
                })
                .select()
                .single();
            if (createError) throw createError;
            finalBalance = newBalance;
        }

        // 3) Fetch Policy
        const { data: policy, error: policyError } = await supabaseAdmin
            .from('vacation_policies')
            .select('*')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

        if (policyError) throw policyError;

        // 4) Fetch Pending Counts to calculate "Reserved"
        const { data: pendingRequests, error: pendingError } = await supabaseAdmin
            .from('vacation_requests')
            .select('type, days_count')
            .eq('user_id', userId)
            .eq('status', 'PENDIENTE');

        if (pendingError) throw pendingError;

        const reserved = {
            VACACIONES: 0,
            RETRIBUIDO: 0,
            NO_RETRIBUIDO: 0
        };

        pendingRequests?.forEach(r => {
            if (r.type === 'VACACIONES') reserved.VACACIONES += Number(r.days_count);
            if (r.type === 'RETRIBUIDO') reserved.RETRIBUIDO += Number(r.days_count);
            if (r.type === 'NO_RETRIBUIDO') reserved.NO_RETRIBUIDO += Number(r.days_count);
        });

        return NextResponse.json({
            balance: {
                vacaciones: {
                    total: finalBalance.vacaciones_total,
                    used: finalBalance.vacaciones_usados,
                    pending: reserved.VACACIONES
                },
                retribuidos: {
                    total: finalBalance.retribuidos_total,
                    used: finalBalance.retribuidos_usados,
                    pending: reserved.RETRIBUIDO
                },
                noRetribuidos: {
                    total: finalBalance.no_retribuidos_total,
                    used: finalBalance.no_retribuidos_usados,
                    pending: reserved.NO_RETRIBUIDO
                }
            },
            policy: policy || { max_approved_per_day: 1, count_holidays: false, count_weekends: false }
        });

    } catch (error: any) {
        console.error('Vacation status error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

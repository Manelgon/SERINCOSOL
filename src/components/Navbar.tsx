'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function Navbar() {
    const [stats, setStats] = useState({ comunidades: 0, incidencias: 0, morosidad: 0 });

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        const [com, inc, mor] = await Promise.all([
            supabase.from('comunidades').select('id', { count: 'exact', head: true }),
            supabase.from('incidencias').select('id', { count: 'exact', head: true }).eq('resuelto', false),
            supabase.from('morosidad').select('id', { count: 'exact', head: true }).eq('estado', 'Pendiente'),
        ]);

        setStats({
            comunidades: com.count || 0,
            incidencias: inc.count || 0,
            morosidad: mor.count || 0,
        });
    };

    return (
        <header className="border-b border-neutral-200 bg-white px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="font-semibold text-neutral-900">
                    Comunidades Activas: <span className="font-bold">{stats.comunidades}</span>
                </div>
                <div className="font-semibold text-neutral-900">
                    Incidencias Pendientes: <span className="font-bold">{stats.incidencias}</span>
                </div>
                <div className="font-semibold text-neutral-900">
                    Deudas Pendientes: <span className="font-bold">{stats.morosidad}</span>
                </div>
            </div>
        </header>
    );
}

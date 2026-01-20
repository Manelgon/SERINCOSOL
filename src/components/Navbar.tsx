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
        <div className="flex flex-wrap items-center justify-center md:justify-end gap-x-6 gap-y-2 text-xs md:text-sm">
            <div className="flex items-center gap-2 text-neutral-600">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                <span className="font-medium">Comunidades:</span>
                <span className="font-bold text-neutral-900">{stats.comunidades}</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-600">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                <span className="font-medium">Tickets:</span>
                <span className="font-bold text-neutral-900">{stats.incidencias}</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-600">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                <span className="font-medium">Deudas:</span>
                <span className="font-bold text-neutral-900">{stats.morosidad}</span>
            </div>
        </div>
    );
}

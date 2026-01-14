'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Building, AlertCircle, FileText, LogOut, Activity, Users, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function Sidebar() {
    const pathname = usePathname();
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const checkRole = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data } = await supabase
                    .from('profiles')
                    .select('rol')
                    .eq('user_id', session.user.id)
                    .single();

                if (data?.rol === 'admin') {
                    setIsAdmin(true);
                }
            }
        };
        checkRole();
    }, []);

    const menuItems = [
        { name: 'Dashboard', href: '/dashboard', icon: Home },
        { name: 'Comunidades', href: '/dashboard/comunidades', icon: Building },
        { name: 'Incidencias', href: '/dashboard/incidencias', icon: AlertCircle },
        { name: 'Morosidad', href: '/dashboard/morosidad', icon: FileText },
        { name: 'Fichaje', href: '/dashboard/fichaje', icon: Clock },
        { name: 'Documentos', href: '/dashboard/documentos', icon: FileText },
        ...(isAdmin ? [
            { name: 'Actividad', href: '/dashboard/actividad', icon: Activity },
            { name: 'Perfiles', href: '/dashboard/perfiles', icon: Users }
        ] : []),
    ];

    return (
        <aside className="w-64 shrink-0 border-r border-white/10 bg-neutral-900 min-h-screen flex flex-col">
            <div className="px-4 py-4 border-b border-white/10">
                <h1 className="text-sm font-bold tracking-wide text-yellow-400">
                    SERINCOSOL PANEL
                </h1>
            </div>

            <nav className="flex-1 px-2 py-4 text-sm">
                {menuItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={[
                                'group flex items-center gap-3 rounded-md px-3 py-2 mb-1 transition-colors',
                                isActive
                                    ? 'bg-yellow-400 text-neutral-950 font-semibold'
                                    : 'text-white/80 hover:bg-white/5 hover:text-white'
                            ].join(' ')}
                        >
                            <span className={[
                                'h-2 w-2 rounded-full',
                                isActive ? 'bg-neutral-950' : 'bg-white/30 group-hover:bg-yellow-400/80'
                            ].join(' ')} />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-white/10">
                <button
                    onClick={async () => {
                        const { supabase } = await import('@/lib/supabaseClient');
                        await supabase.auth.signOut();
                        window.location.href = '/auth/login';
                    }}
                    className="flex items-center gap-3 px-3 py-2 text-white/80 hover:bg-white/5 hover:text-white rounded-md w-full transition-colors text-sm"
                >
                    <LogOut className="w-4 h-4" />
                    <span>Cerrar Sesión</span>
                </button>
            </div>
        </aside>
    );
}

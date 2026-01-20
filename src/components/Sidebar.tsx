'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Building, AlertCircle, FileText, LogOut, Activity, Users, Clock, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import NotificationsBell from '@/components/NotificationsBell';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
    const pathname = usePathname();
    const [isAdmin, setIsAdmin] = useState(false);
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');

    useEffect(() => {
        const checkRole = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                // setUserName(session.user.user_metadata?.nombre || '');
                setUserEmail(session.user.email || '');

                const { data } = await supabase
                    .from('profiles')
                    .select('rol, nombre, apellido')
                    .eq('user_id', session.user.id)
                    .single();

                if (data) {
                    const fullName = [data.nombre, data.apellido].filter(Boolean).join(' ');
                    setUserName(fullName || session.user.user_metadata?.nombre || '');

                    if (data.rol === 'admin') {
                        setIsAdmin(true);
                    }
                }
            }
        };
        checkRole();
    }, []);

    const menuItems = [
        { name: 'Dashboard', href: '/dashboard', icon: Home },
        { name: 'Comunidades', href: '/dashboard/comunidades', icon: Building },
        { name: 'Gestión de Tickets', href: '/dashboard/incidencias', icon: AlertCircle },
        { name: 'Morosidad', href: '/dashboard/morosidad', icon: FileText },
        { name: 'Fichaje', href: '/dashboard/fichaje', icon: Clock },
        { name: 'Documentos', href: '/dashboard/documentos', icon: FileText },
        { name: 'Avisos', href: '/dashboard/avisos', icon: AlertCircle },
        ...(isAdmin ? [
            { name: 'Actividad', href: '/dashboard/actividad', icon: Activity },
            { name: 'Perfiles', href: '/dashboard/perfiles', icon: Users }
        ] : []),
    ];

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = '/auth/login';
    };

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed md:static inset-y-0 left-0 z-50
                    w-64 shrink-0 border-r border-white/10 bg-neutral-900 
                    min-h-screen flex flex-col
                    transform transition-transform duration-300 ease-in-out
                    ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                `}
            >
                {/* Header with close button for mobile */}
                <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between">
                    <h1 className="text-sm font-bold tracking-wide text-yellow-400">
                        SERINCOSOL PANEL
                    </h1>
                    <div className="md:block hidden">
                        <NotificationsBell align="left" />
                    </div>
                    <button
                        onClick={onClose}
                        className="md:hidden text-white/80 hover:text-white p-1"
                        aria-label="Close menu"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* User Info */}
                <div className="px-4 py-3 border-b border-white/10 mb-2 flex justify-between items-center group">
                    <div className="min-w-0 pr-2">
                        {userName && (
                            <div className="text-sm font-medium text-white truncate">
                                {userName}
                            </div>
                        )}
                        {userEmail && (
                            <div className="text-xs text-white/50 truncate">
                                {userEmail}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleLogout}
                        className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-all flex-shrink-0"
                        title="Cerrar Sesión"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>

                <nav className="flex-1 px-2 py-4 text-sm overflow-y-auto custom-scrollbar">
                    {menuItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                onClick={() => onClose()} // Close sidebar on mobile when clicking a link
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
            </aside>
        </>
    );
}

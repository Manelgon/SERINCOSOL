"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { Check, CheckCheck, Bell } from 'lucide-react';
import DataTable, { Column } from '@/components/DataTable';
// import { logActivity } from '@/lib/logActivity'; // Optional if we want to log reads

interface Notification {
    id: string;
    created_at: string;
    title: string;
    body: string;
    is_read: boolean;
    entity_type: string;
    entity_id: number;
    user_id: string;
}

export default function AvisosPage() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterState, setFilterState] = useState<'all' | 'unread' | 'read'>('all');

    useEffect(() => {
        fetchNotifications();
    }, []);

    const fetchNotifications = async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            toast.error('Error cargando avisos');
        } else {
            setNotifications(data || []);
        }
        setLoading(false);
    };

    const markAsRead = async (id: string) => {
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', id);

            if (error) throw error;

            toast.success('Marcado como leído');
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        } catch (error) {
            toast.error('Error al actualizar aviso');
        }
    };

    const markAllRead = async () => {
        try {
            await fetch("/api/notifications/read-all", { method: "POST" });
            toast.success('Todos marcados como leídos');
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } catch (error) {
            toast.error('Error al marcar todo como leído');
        }
    };

    const filteredNotifications = notifications.filter(n => {
        if (filterState === 'unread') return !n.is_read;
        if (filterState === 'read') return n.is_read;
        return true;
    });

    const columns: Column<Notification>[] = [
        {
            key: 'is_read',
            label: 'Estado',
            render: (row) => (
                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${row.is_read
                        ? 'bg-neutral-100 text-neutral-600'
                        : 'bg-yellow-400 text-neutral-950'
                    }`}>
                    {row.is_read ? 'Leído' : 'Nuevo'}
                </span>
            ),
            sortable: true
        },
        {
            key: 'created_at',
            label: 'Fecha',
            render: (row) => new Date(row.created_at).toLocaleString(),
            sortable: true
        },
        {
            key: 'title',
            label: 'Título',
            sortable: true
        },
        {
            key: 'body',
            label: 'Mensaje',
            render: (row) => (
                <div className="max-w-md truncate" title={row.body}>
                    {row.body}
                </div>
            )
        },
        {
            key: 'entity_type',
            label: 'Origen',
            render: (row) => (
                <span className="capitalize text-xs text-neutral-500">{row.entity_type} #{row.entity_id}</span>
            )
        },
        {
            key: 'actions', // Virtual key for actions
            label: 'Acciones',
            render: (row) => !row.is_read && (
                <button
                    onClick={() => markAsRead(row.id)}
                    title="Marcar como leído"
                    className="p-1.5 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-colors"
                >
                    <Check className="w-4 h-4" />
                </button>
            )
        }
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <Bell className="w-6 h-6 text-yellow-500" />
                    <h1 className="text-xl font-bold text-neutral-900">Mis Avisos</h1>
                </div>

                <div className="flex gap-2">
                    {/* Mark All Button */}
                    <button
                        onClick={markAllRead}
                        className="bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-2 rounded-md flex items-center gap-2 transition font-semibold text-sm"
                    >
                        <CheckCheck className="w-4 h-4" />
                        Marcar todo leído
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                <button
                    onClick={() => setFilterState('all')}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition ${filterState === 'all' ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}
                >
                    Todos
                </button>
                <button
                    onClick={() => setFilterState('unread')}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition ${filterState === 'unread' ? 'bg-yellow-400 text-neutral-950' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}
                >
                    No leídos
                </button>
                <button
                    onClick={() => setFilterState('read')}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition ${filterState === 'read' ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}
                >
                    Leídos
                </button>
            </div>

            <DataTable
                data={filteredNotifications}
                columns={columns}
                keyExtractor={(row) => row.id}
                loading={loading}
                emptyMessage="No tienes avisos."
                storageKey='avisos-table'
            />
        </div>
    );
}

"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { Check, CheckCheck, Bell, X, Paperclip } from 'lucide-react';
import DataTable, { Column } from '@/components/DataTable';
import { logActivity } from '@/lib/logActivity';

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
    const [filterState, setFilterState] = useState<'all' | 'unread' | 'read'>('unread');

    // Detail Modal State
    const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [entityData, setEntityData] = useState<any>(null);
    const [loadingEntity, setLoadingEntity] = useState(false);

    const handleRowClick = async (notification: Notification) => {
        setSelectedNotification(notification);
        setShowDetailModal(true);
        setEntityData(null);

        // Auto-mark as read when opening
        if (!notification.is_read) {
            markAsRead(notification.id);
        }

        // Fetch related entity data
        if (notification.entity_type && notification.entity_id) {
            setLoadingEntity(true);
            try {
                let query;
                if (notification.entity_type === 'incidencia') {
                    query = supabase
                        .from('incidencias')
                        .select(`
                            *,
                            comunidades (nombre_cdad, codigo),
                            receptor:profiles!quien_lo_recibe (nombre),
                            gestor:profiles!gestor_asignado (nombre),
                            resolver:profiles!resuelto_por (nombre)
                        `)
                        .eq('id', notification.entity_id)
                        .single();
                } else if (notification.entity_type === 'morosidad') {
                    query = supabase
                        .from('morosidad')
                        .select(`
                            *,
                            comunidades (nombre_cdad, codigo),
                            gestor_profile:profiles!gestor (nombre),
                            resolver:profiles!resuelto_por (nombre)
                        `)
                        .eq('id', notification.entity_id)
                        .single();
                } else {
                    setLoadingEntity(false);
                    return;
                }

                const { data, error } = await query;
                if (!error && data) {
                    setEntityData(data);
                }
            } catch (error) {
                console.error('Error fetching entity:', error);
            } finally {
                setLoadingEntity(false);
            }
        }
    };

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

            // Log read activity
            const n = notifications.find(notif => notif.id === id);
            await logActivity({
                action: 'read',
                entityType: 'aviso',
                entityId: n?.entity_id,
                entityName: n?.title,
                details: { notification_id: id }
            });

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
    ];

    const [exporting, setExporting] = useState(false);

    const handleExport = async (notification: Notification) => {
        setExporting(true);
        try {
            const res = await fetch('/api/avisos/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: [notification.id],
                    type: 'pdf',
                    layout: 'detail'
                })
            });

            if (!res.ok) throw new Error('Export failed');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            // Filename: AVISO_ID_DATE
            const now = new Date();
            const dateStr = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`;
            a.download = `AVISO_${notification.id.substring(0, 8)}_${dateStr}.pdf`;

            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast.success('Descarga completada');
        } catch (error) {
            console.error(error);
            toast.error('Error al descargar PDF');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
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
                <button
                    onClick={() => setFilterState('all')}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition ${filterState === 'all' ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}
                >
                    Todos
                </button>
            </div>

            <DataTable
                data={filteredNotifications}
                columns={columns}
                keyExtractor={(row) => row.id}
                loading={loading}
                emptyMessage="No tienes avisos."
                storageKey='avisos-table'
                onRowClick={handleRowClick}
            />

            {/* Detail Modal */}
            {showDetailModal && selectedNotification && (
                <div
                    className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 md:p-8 backdrop-blur-sm"
                    onClick={() => setShowDetailModal(false)}
                >
                    <div
                        className="bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-gray-900/10 w-full max-w-2xl max-h-[80vh] md:max-h-[95vh] overflow-y-auto custom-scrollbar flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-6 py-8 border-b border-gray-100 flex justify-between items-start bg-gray-50 flex-shrink-0 rounded-t-xl">
                            <div>
                                <h3 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                                    <Bell className="w-5 h-5" />
                                    {selectedNotification.title}
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    {new Date(selectedNotification.created_at).toLocaleString()}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleExport(selectedNotification)}
                                    className="text-gray-400 hover:text-blue-600 transition p-1 hover:bg-blue-50 rounded-full"
                                    title="Descargar PDF"
                                    disabled={exporting}
                                >
                                    {exporting ? <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full" /> : <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-download"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>}
                                </button>
                                <button
                                    onClick={() => setShowDetailModal(false)}
                                    className="text-gray-400 hover:text-gray-600 transition p-1 hover:bg-gray-200 rounded-full"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="px-6 pb-6 pt-2 space-y-6 flex-grow">
                            {/* Status Bar */}
                            <div className="flex flex-wrap items-center gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-gray-500">Estado:</span>
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-medium ${selectedNotification.is_read
                                        ? 'bg-gray-100 text-gray-700'
                                        : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                        {selectedNotification.is_read ? <Check className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                                        {selectedNotification.is_read ? 'Leído' : 'Nuevo'}
                                    </span>
                                </div>

                                <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>

                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-gray-500">Origen:</span>
                                    <span className="font-medium text-gray-900 capitalize">
                                        {selectedNotification.entity_type} #{selectedNotification.entity_id}
                                    </span>
                                </div>
                            </div>


                            {/* Message Content */}
                            <div>
                                <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 border-b pb-2">
                                    Mensaje del Aviso
                                </h4>
                                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                                    {selectedNotification.body}
                                </div>
                            </div>

                            {/* Entity Details */}
                            {loadingEntity && (
                                <div className="text-center py-8 text-gray-500">
                                    Cargando detalles...
                                </div>
                            )}

                            {!loadingEntity && entityData && selectedNotification.entity_type === 'incidencia' && (
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b pb-2">
                                        Detalles de la Incidencia
                                    </h4>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <span className="text-xs text-gray-500 uppercase tracking-wide">Comunidad</span>
                                            <p className="font-medium text-gray-900">
                                                {entityData.comunidades?.codigo ? `${entityData.comunidades.codigo} - ${entityData.comunidades.nombre_cdad}` : entityData.comunidades?.nombre_cdad || '-'}
                                            </p>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <span className="text-xs text-gray-500 uppercase tracking-wide">Cliente</span>
                                            <p className="font-medium text-gray-900">{entityData.nombre_cliente || '-'}</p>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <span className="text-xs text-gray-500 uppercase tracking-wide">Teléfono</span>
                                            <p className="font-medium text-gray-900">{entityData.telefono || '-'}</p>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <span className="text-xs text-gray-500 uppercase tracking-wide">Email</span>
                                            <p className="font-medium text-gray-900 text-sm">{entityData.email || '-'}</p>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-lg md:col-span-2">
                                            <span className="text-xs text-gray-500 uppercase tracking-wide">Mensaje</span>
                                            <p className="font-medium text-gray-900">{entityData.mensaje || '-'}</p>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <span className="text-xs text-gray-500 uppercase tracking-wide">Urgencia</span>
                                            <p className="font-medium text-gray-900">{entityData.urgencia || '-'}</p>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <span className="text-xs text-gray-500 uppercase tracking-wide">Estado</span>
                                            <p className="font-medium text-gray-900">{entityData.resuelto ? 'Resuelto' : 'Pendiente'}</p>
                                        </div>
                                        {entityData.gestor && (
                                            <div className="bg-gray-50 p-3 rounded-lg">
                                                <span className="text-xs text-gray-500 uppercase tracking-wide">Gestor Asignado</span>
                                                <p className="font-medium text-gray-900">{entityData.gestor?.nombre || '-'}</p>
                                            </div>
                                        )}
                                        {entityData.adjuntos && entityData.adjuntos.length > 0 && (
                                            <div className="bg-gray-50 p-3 rounded-lg md:col-span-2">
                                                <span className="text-xs text-gray-500 uppercase tracking-wide block mb-2">Adjuntos</span>
                                                <div className="flex flex-wrap gap-2">
                                                    {entityData.adjuntos.map((url: string, i: number) => (
                                                        <a
                                                            key={i}
                                                            href={url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-700 hover:bg-gray-100 transition"
                                                        >
                                                            <Paperclip className="w-3 h-3" />
                                                            Adjunto {i + 1}
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {!loadingEntity && entityData && selectedNotification.entity_type === 'morosidad' && (
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b pb-2">
                                        Detalles de la Deuda
                                    </h4>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <span className="text-xs text-gray-500 uppercase tracking-wide">Comunidad</span>
                                            <p className="font-medium text-gray-900">
                                                {entityData.comunidades?.codigo ? `${entityData.comunidades.codigo} - ${entityData.comunidades.nombre_cdad}` : entityData.comunidades?.nombre_cdad || '-'}
                                            </p>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <span className="text-xs text-gray-500 uppercase tracking-wide">Deudor</span>
                                            <p className="font-medium text-gray-900">{`${entityData.nombre_deudor || ''} ${entityData.apellidos || ''}`.trim() || '-'}</p>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <span className="text-xs text-gray-500 uppercase tracking-wide">Teléfono</span>
                                            <p className="font-medium text-gray-900">{entityData.telefono_deudor || '-'}</p>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <span className="text-xs text-gray-500 uppercase tracking-wide">Email</span>
                                            <p className="font-medium text-gray-900 text-sm">{entityData.email_deudor || '-'}</p>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <span className="text-xs text-gray-500 uppercase tracking-wide">Concepto</span>
                                            <p className="font-medium text-gray-900">{entityData.titulo_documento || '-'}</p>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <span className="text-xs text-gray-500 uppercase tracking-wide">Importe</span>
                                            <p className="font-bold text-gray-900">{entityData.importe}€</p>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <span className="text-xs text-gray-500 uppercase tracking-wide">Estado</span>
                                            <p className="font-medium text-gray-900">{entityData.estado || '-'}</p>
                                        </div>
                                        <div className="bg-gray-50 p-3 rounded-lg">
                                            <span className="text-xs text-gray-500 uppercase tracking-wide">Fecha Pago</span>
                                            <p className="font-medium text-gray-900">{entityData.fecha_pago ? new Date(entityData.fecha_pago).toLocaleDateString() : '-'}</p>
                                        </div>
                                        {entityData.observaciones && (
                                            <div className="bg-gray-50 p-3 rounded-lg md:col-span-2">
                                                <span className="text-xs text-gray-500 uppercase tracking-wide">Observaciones</span>
                                                <p className="font-medium text-gray-900">{entityData.observaciones}</p>
                                            </div>
                                        )}
                                        {entityData.documento && (
                                            <div className="bg-gray-50 p-3 rounded-lg md:col-span-2">
                                                <span className="text-xs text-gray-500 uppercase tracking-wide block mb-2">Documento</span>
                                                <a
                                                    href={entityData.documento}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-700 hover:bg-gray-100 transition"
                                                >
                                                    <Paperclip className="w-3 h-3" />
                                                    Ver documento
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>


                    </div>
                </div>
            )}
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import DataTable, { Column } from '@/components/DataTable';

interface ActivityLog {
    id: number;
    user_name: string;
    action: string;
    entity_type: string;
    entity_id: number;
    entity_name: string;
    details: any;
    created_at: string;
}

export default function ActividadPage() {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching logs:', error);
        } else {
            setLogs(data || []);
        }
        setLoading(false);
    };

    const getActionLabel = (action: string) => {
        const labels: Record<string, string> = {
            create: 'Crear',
            update: 'Actualizar',
            delete: 'Eliminar',
            mark_paid: 'Marcar Pagado',
            toggle_active: 'Cambiar Estado',
            clock_in: 'Fichaje Entrada',
            clock_out: 'Fichaje Salida',
            generate: 'Generar',
        };
        return labels[action] || action;
    };

    const getEntityLabel = (entityType: string) => {
        const labels: Record<string, string> = {
            comunidad: 'Comunidad',
            incidencia: 'Incidencia',
            morosidad: 'Morosidad',
            profile: 'Perfil de Usuario',
            fichaje: 'Control Horario',
            documento: 'Documento',
        };
        return labels[entityType] || entityType;
    };

    const getActionColor = (action: string) => {
        const colors: Record<string, string> = {
            create: 'bg-green-100 text-green-800',
            update: 'bg-blue-100 text-blue-800',
            delete: 'bg-red-100 text-red-800',
            mark_paid: 'bg-yellow-100 text-yellow-800',
            toggle_active: 'bg-purple-100 text-purple-800',
            clock_in: 'bg-emerald-100 text-emerald-800',
            clock_out: 'bg-amber-100 text-amber-800',
            generate: 'bg-indigo-100 text-indigo-800',
        };
        return colors[action] || 'bg-gray-100 text-gray-800';
    };

    const columns: Column<ActivityLog>[] = [
        {
            key: 'created_at',
            label: 'Fecha',
            render: (row) => new Date(row.created_at).toLocaleString('es-ES', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            }),
        },
        {
            key: 'user_name',
            label: 'Usuario',
        },
        {
            key: 'action',
            label: 'Acción',
            render: (row) => (
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getActionColor(row.action)}`}>
                    {getActionLabel(row.action)}
                </span>
            ),
        },
        {
            key: 'entity_type',
            label: 'Tipo',
            render: (row) => getEntityLabel(row.entity_type),
        },
        {
            key: 'entity_name',
            label: 'Entidad',
            render: (row) => row.entity_name || '-',
        },
        {
            key: 'entity_id',
            label: 'ID',
            defaultVisible: false,
        },
        {
            key: 'details',
            label: 'Detalles',
            render: (row) => {
                if (!row.details) return '-';
                try {
                    const details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;

                    if (Object.keys(details).length === 0) return '-';

                    return (
                        <div className="flex flex-col gap-1 text-xs">
                            {Object.entries(details).map(([key, value]) => (
                                <div key={key} className="flex items-start gap-1">
                                    <span className="font-semibold text-neutral-600 capitalize">
                                        {key.replace(/_/g, ' ')}:
                                    </span>
                                    <span className="text-neutral-900 truncate max-w-[200px]" title={String(value)}>
                                        {String(value)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    );
                } catch {
                    return '-';
                }
            },
            defaultVisible: true,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-xl font-bold text-neutral-900">Registro de Actividad</h1>
            </div>

            <DataTable
                data={logs}
                columns={columns}
                keyExtractor={(row) => row.id}
                storageKey="actividad"
                loading={loading}
                emptyMessage="No hay registros de actividad"
            />
        </div>
    );
}

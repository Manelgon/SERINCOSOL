
'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { Plus, Check, RotateCcw, Paperclip, Trash2, X, FileText, Download, Loader2 } from 'lucide-react';
import DataTable, { Column } from '@/components/DataTable';
import SearchableSelect from '@/components/SearchableSelect';
import { logActivity } from '@/lib/logActivity';
import TimelineChat from '@/components/TimelineChat';

interface Incidencia {
    id: number;
    comunidad_id: number;
    nombre_cliente: string;
    telefono: string;
    email: string;
    mensaje: string;
    urgencia?: 'Baja' | 'Media' | 'Alta'; // Optional, not set during creation
    resuelto: boolean;
    created_at: string;
    comunidades?: { nombre_cdad: string; codigo?: string };

    // New fields
    quien_lo_recibe?: string;
    comunidad?: string; // String representation if needed
    gestor_asignado?: string;
    gestor?: { nombre: string }; // Joined profile
    sentimiento?: string;
    categoria?: string;
    nota_gestor?: string;
    nota_propietario?: string;
    todas_notas_propietario?: string;
    dia_resuelto?: string;
    resuelto_por?: string;
    resolver?: { nombre: string }; // Joined profile
    adjuntos?: string[];
    aviso?: string | boolean;
    id_email_gestion?: string;
}

export default function IncidenciasPage() {
    const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
    const [comunidades, setComunidades] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [filterEstado, setFilterEstado] = useState('pendiente');
    const [filterGestor, setFilterGestor] = useState('all');

    // Selection & Export
    const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
    const [exporting, setExporting] = useState(false);

    const [profiles, setProfiles] = useState<any[]>([]);
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [enviarAviso, setEnviarAviso] = useState<boolean | null>(null);

    const [formData, setFormData] = useState({
        comunidad_id: '',
        nombre_cliente: '',
        telefono: '',
        email: '',
        mensaje: '',
        // urgencia removed from creation
        recibido_por: '',
        gestor_asignado: '',
        proveedor: '', // Placeholder
    });

    // Delete state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<number | null>(null);
    const [deleteEmail, setDeleteEmail] = useState('');
    const [deletePassword, setDeletePassword] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    // Detail Modal State
    const [selectedDetailIncidencia, setSelectedDetailIncidencia] = useState<Incidencia | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [isUpdatingRecord, setIsUpdatingRecord] = useState(false);
    const detailFileInputRef = useRef<HTMLInputElement>(null);

    // PDF Notes Modal State
    const [showExportModal, setShowExportModal] = useState(false);
    const [pendingExportParams, setPendingExportParams] = useState<{ type: 'csv' | 'pdf', ids?: number[], includeNotes?: boolean } | null>(null);

    const handleRowClick = (incidencia: Incidencia) => {
        setSelectedDetailIncidencia(incidencia);
        setShowDetailModal(true);
    };

    useEffect(() => {
        fetchInitialData();

        // Subscribe to real-time changes
        const channel = supabase
            .channel('incidencias-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'incidencias' },
                () => {
                    // Re-fetch all data to ensure joined fields (profiles, etc.) are correct.
                    // This is simpler and safer than manually merging updates with joined data.
                    fetchIncidencias();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Prevent body scroll when any modal is open
    useEffect(() => {
        if (showForm || showDeleteModal || showExportModal || showDetailModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showForm, showDeleteModal, showExportModal, showDetailModal]);

    const fetchInitialData = async () => {
        setLoading(true);
        await Promise.all([fetchComunidades(), fetchIncidencias(), fetchProfiles()]);
        setLoading(false);
    };

    const fetchProfiles = async () => {
        const { data } = await supabase.from('profiles').select('user_id, nombre, rol').eq('activo', true);
        if (data) setProfiles(data);
    };

    const fetchComunidades = async () => {
        const { data } = await supabase.from('comunidades').select('id, nombre_cdad, codigo').eq('activo', true);
        if (data) setComunidades(data);
    };

    const fetchIncidencias = async () => {
        const { data, error } = await supabase
            .from('incidencias')
            .select(`
                *,
                comunidades (nombre_cdad, codigo),
                receptor:profiles!quien_lo_recibe (nombre),
                gestor:profiles!gestor_asignado (nombre),
                resolver:profiles!resuelto_por (nombre)
            `)
            .order('created_at', { ascending: false });

        if (error) {
            toast.error('Error cargando incidencias');
        } else {
            setIncidencias(data || []);
        }
    };

    const handleFileUploads = async () => {
        if (files.length === 0) return [];
        setUploading(true);
        const urls: string[] = [];
        try {
            for (const file of files) {
                const fileExt = file.name.split('.').pop();
                const timestamp = Date.now();
                const randomStr = Math.random().toString(36).substring(2, 15);
                const fileName = `${timestamp}_${randomStr}.${fileExt}`;
                const filePath = `${fileName}`;
                const { error: uploadError } = await supabase.storage.from('documentos').upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: file.type
                });

                if (uploadError) {
                    console.error('Error uploading file:', uploadError);
                    continue;
                }

                const { data } = supabase.storage.from('documentos').getPublicUrl(filePath);
                urls.push(data.publicUrl);
            }
        } catch (error) {
            console.error('Upload error:', error);
            toast.error('Error al subir algunos archivos');
        } finally {
            setUploading(false);
        }
        return urls;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.comunidad_id) return toast.error('Selecciona una comunidad');

        // Validation for notification
        if (enviarAviso === true && !formData.telefono && !formData.email) {
            return toast.error('Para enviar aviso debe proporcionar Teléfono o Email');
        }

        // Regex Validation
        const phoneRegex = /^\d{9}$/;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (formData.telefono && !phoneRegex.test(formData.telefono)) {
            return toast.error('El teléfono debe tener exactamente 9 dígitos');
        }
        if (formData.email && !emailRegex.test(formData.email)) {
            return toast.error('El formato del email no es válido');
        }

        try {
            const adjuntos = await handleFileUploads();

            // Note: Assuming 'adjuntos' column exists or mapped to observations if not
            // For now, we'll try to insert standard fields and new ones.
            // If DB schema doesn't match, this might fail on specific columns. 
            // We'll proceed assuming schema update or loose schema.

            const { data: insertedData, error } = await supabase.from('incidencias').insert([{
                comunidad_id: parseInt(formData.comunidad_id),
                nombre_cliente: formData.nombre_cliente,
                telefono: formData.telefono,
                email: formData.email,
                mensaje: formData.mensaje,
                // urgencia removed from creation
                quien_lo_recibe: formData.recibido_por || null,
                // @ts-ignore
                adjuntos: adjuntos,
                // @ts-ignore
                gestor_asignado: formData.gestor_asignado || null,
                aviso: enviarAviso
            }]).select();

            if (error) throw error;

            const incidenciaId = insertedData?.[0]?.id;

            toast.success('Incidencia creada');

            // Log activity
            const comunidad = comunidades.find(c => c.id === parseInt(formData.comunidad_id));
            await logActivity({
                action: 'create',
                entityType: 'incidencia',
                entityName: `Incidencia - ${formData.nombre_cliente}`,
                details: {
                    comunidad: comunidad?.nombre_cdad,
                    // urgencia removed
                    mensaje: formData.mensaje,
                    asignado_a: formData.gestor_asignado
                }
            });

            // Trigger Webhook
            try {
                const webhookUrl = "https://serinwebhook.afcademia.com/webhook/c38663f7-31e9-417d-b0aa-acf60ccd8c5c";
                const webhookPayload = new FormData();
                webhookPayload.append('nombre_cliente', formData.nombre_cliente);
                webhookPayload.append('telefono', formData.telefono);
                webhookPayload.append('email', formData.email);
                webhookPayload.append('mensaje', formData.mensaje);
                // urgencia removed from webhook

                // Comunidad: ID, Name and Code
                webhookPayload.append('comunidad_id', formData.comunidad_id);
                webhookPayload.append('comunidad_nombre', comunidad?.nombre_cdad || '');
                webhookPayload.append('codigo_comunidad', comunidad?.codigo || '');

                // Gestor Asignado: UUID and Name
                const gestorObj = profiles.find(p => p.user_id === formData.gestor_asignado);
                webhookPayload.append('gestor_asignado', formData.gestor_asignado || '');
                webhookPayload.append('gestor_asignado_nombre', gestorObj?.nombre || '');

                // Recibido Por: UUID and Name
                const receptorObj = profiles.find(p => p.user_id === formData.recibido_por);
                webhookPayload.append('recibido_por', formData.recibido_por || '');
                webhookPayload.append('recibido_por_nombre', receptorObj?.nombre || '');

                webhookPayload.append('fecha', new Date().toISOString());
                if (incidenciaId) {
                    webhookPayload.append('incidencia_id', incidenciaId.toString());
                }
                webhookPayload.append('notificacion', enviarAviso ? 'true' : 'false');

                // Append attachment count and filenames
                webhookPayload.append('adjuntos_count', files.length.toString());
                files.forEach((file, index) => {
                    webhookPayload.append(`adjunto_nombre_${index + 1}`, file.name);
                });

                // Append Binary Files
                files.forEach((file) => {
                    webhookPayload.append('adjuntos', file);
                });

                await fetch(webhookUrl, {
                    method: 'POST',
                    body: webhookPayload
                });
            } catch (webhookError) {
                console.error('Webhook trigger failed:', webhookError);
                // Don't block success just because webhook failed
            }

            setShowForm(false);
            setFormData({
                comunidad_id: '',
                nombre_cliente: '',
                telefono: '',
                email: '',
                mensaje: '',
                // urgencia removed
                recibido_por: '',
                gestor_asignado: '',
                proveedor: '',
            });
            setFiles([]);
            setEnviarAviso(null);
            fetchIncidencias();
        } catch (error: any) {
            toast.error('Error: ' + error.message);
        }
    };

    const handleDetailFileUpload = async (files: FileList) => {
        if (!selectedDetailIncidencia) return;

        setIsUpdatingRecord(true);
        const loadingToast = toast.loading('Subiendo archivos...');

        try {
            const newUrls: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileExt = file.name.split('.').pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const filePath = `incidencias/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('documentos')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data } = supabase.storage.from('documentos').getPublicUrl(filePath);
                newUrls.push(data.publicUrl);
            }

            const currentAdjuntos = selectedDetailIncidencia.adjuntos || [];
            const updatedAdjuntos = [...currentAdjuntos, ...newUrls];

            const { error: updateError } = await supabase
                .from('incidencias')
                .update({ adjuntos: updatedAdjuntos })
                .eq('id', selectedDetailIncidencia.id);

            if (updateError) throw updateError;

            setSelectedDetailIncidencia({
                ...selectedDetailIncidencia,
                adjuntos: updatedAdjuntos
            });

            setIncidencias(prev => prev.map(i => i.id === selectedDetailIncidencia.id ? { ...i, adjuntos: updatedAdjuntos } : i));

            toast.success('Archivos añadidos hoy', { id: loadingToast });
        } catch (error: any) {
            console.error(error);
            toast.error('Error al subir archivos', { id: loadingToast });
        } finally {
            setIsUpdatingRecord(false);
        }
    };

    const toggleResuelto = async (id: number, currentStatus: boolean) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase
                .from('incidencias')
                .update({
                    resuelto: !currentStatus,
                    dia_resuelto: !currentStatus ? new Date().toISOString() : null,
                    resuelto_por: !currentStatus ? user?.id : null
                })
                .eq('id', id);

            if (error) throw error;

            toast.success(currentStatus ? 'Marcado como pendiente' : 'Marcado como resuelto');

            // Get resolver name if marking as resolved
            let resolverName = '';
            if (!currentStatus && user) {
                // Try to find name in profiles array if available, or fetch it? 
                // Actually fetchIncidencias re-runs on realtime, but for immediate optimistic update likely need name. 
                // Simpler: Just rely on fetchIncidencias or simple optimistic update with null/undefined for now and let realtime catch up.
            }

            setIncidencias(prev => prev.map(i => i.id === id ? {
                ...i,
                resuelto: !currentStatus,
                dia_resuelto: !currentStatus ? new Date().toISOString() : undefined,
                resuelto_por: !currentStatus ? user?.id : undefined
            } : i));

            // Log activity
            const incidencia = incidencias.find(i => i.id === id);
            await logActivity({
                action: 'update',
                entityType: 'incidencia',
                entityId: id,
                entityName: `Incidencia - ${incidencia?.nombre_cliente}`,
                details: {
                    comunidad: incidencia?.comunidades?.nombre_cdad,
                    resuelto: !currentStatus
                }
            });

            // Trigger Resolved Webhook
            if (!currentStatus) {
                setTimeout(() => {
                    try {
                        fetch('/api/webhooks/trigger-resolved-ticket', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: id,
                                // Backend now fetches fresh data, but we can pass resolver info if needed immediately
                                // though backend fetching handles joined profiles too.
                            })
                        }).catch(e => console.error('Resolved Webhook Error:', e));
                    } catch (e) {
                        console.error('Resolved Webhook Trigger Error:', e);
                    }
                }, 2000);
            }
        } catch (error) {
            toast.error('Error al actualizar estado');
        }
    };

    const handleExport = async (type: 'csv' | 'pdf', idsOverride?: number[], includeNotesFromModal?: boolean) => {
        const idsToExport = idsOverride || Array.from(selectedIds);
        if (idsToExport.length === 0) return;

        // If overriding IDs (from modal), imply detail view if single item
        const isDetailView = !!idsOverride && idsToExport.length === 1 && type === 'pdf';

        // Custom Modal Logic
        if (isDetailView && includeNotesFromModal === undefined) {
            setPendingExportParams({ type, ids: idsOverride });
            setShowExportModal(true);
            return;
        }

        const includeNotes = includeNotesFromModal !== undefined ? includeNotesFromModal : false;

        setExporting(true);
        try {
            const res = await fetch('/api/incidencias/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: idsToExport,
                    type,
                    layout: isDetailView ? 'detail' : 'list',
                    includeNotes
                })
            });

            if (!res.ok) throw new Error('Export failed');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            // Filename Logic
            const now = new Date();
            const dateStr = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`;

            if (isDetailView) {
                a.download = `ticket_${idsToExport[0]}_${dateStr}.pdf`;
            } else {
                a.download = `listado_incidencias_${dateStr}.${type === 'csv' ? 'csv' : 'pdf'}`;
            }

            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast.success('Exportación completada');
        } catch (error) {
            console.error(error);
            toast.error('Error al exportar');
        } finally {
            setExporting(false);
        }
    };

    const handleDeleteClick = (id: number) => {
        setItemToDelete(id);
        setDeleteEmail('');
        setDeletePassword('');
        setShowDeleteModal(true);
    };

    const confirmDelete = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!itemToDelete || !deleteEmail || !deletePassword) return;

        setIsDeleting(true);
        try {
            const res = await fetch('/api/admin/universal-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: itemToDelete,
                    email: deleteEmail,
                    password: deletePassword,
                    type: 'incidencia'
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Error al eliminar');
            }

            toast.success('Incidencia eliminada correctamente');
            setIncidencias(prev => prev.filter(i => i.id !== itemToDelete));
            setShowDeleteModal(false);

            // Log delete activity
            await logActivity({
                action: 'delete',
                entityType: 'incidencia',
                entityId: itemToDelete,
                entityName: `Incidencia Deleted`,
                details: { deleted_by_admin: deleteEmail }
            });

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredIncidencias = incidencias.filter(inc => {
        const matchesEstado = filterEstado === 'pendiente' ? !inc.resuelto :
            filterEstado === 'resuelto' ? inc.resuelto : true;

        const matchesGestor = filterGestor === 'all' ? true : inc.gestor_asignado === filterGestor;

        return matchesEstado && matchesGestor;
    });

    const columns: Column<Incidencia>[] = [
        {
            key: 'id',
            label: 'ID',
        },
        {
            key: 'codigo',
            label: 'Código',
            render: (row) => (
                <div className="flex items-start gap-3">
                    <span className={`mt-1 h-3.5 w-1.5 rounded-full ${row.resuelto ? 'bg-neutral-900' : 'bg-yellow-400'}`} />
                    <span className="font-semibold">{row.comunidades?.codigo || '-'}</span>
                </div>
            ),
        },
        {
            key: 'comunidad',
            label: 'Comunidad',
            render: (row) => row.comunidad || (row.comunidades?.nombre_cdad) || '-',
        },
        {
            key: 'nombre_cliente',
            label: 'Cliente',
        },
        {
            key: 'telefono',
            label: 'Teléfono',
        },
        {
            key: 'email',
            label: 'Email',
            render: (row) => <span className="text-xs">{row.email || '-'}</span>,
        },
        {
            key: 'mensaje',
            label: 'Mensaje',
            render: (row) => (
                <div className="max-w-xs truncate text-xs" title={row.mensaje}>
                    {row.mensaje}
                </div>
            ),
        },
        {
            key: 'nota_gestor',
            label: 'Nota Gestor',
            defaultVisible: false,
        },
        {
            key: 'nota_propietario',
            label: 'Nota Prop.',
            defaultVisible: false,
        },
        {
            key: 'adjuntos',
            label: 'Adjuntos',
            render: (row) => (
                <div className="flex flex-wrap gap-1">
                    {row.adjuntos && row.adjuntos.length > 0 ? (
                        row.adjuntos.map((url, i) => (
                            <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-full bg-yellow-50 text-yellow-600 hover:bg-yellow-100 transition-colors"
                                title={`Ver adjunto ${i + 1}`}
                            >
                                <FileText className="w-4 h-4" />
                            </a>
                        ))
                    ) : '-'}
                </div>
            ),
        },
        {
            key: 'created_at',
            label: 'Fecha',
            render: (row) => new Date(row.created_at).toLocaleDateString(),
        },
        {
            key: 'gestor_asignado',
            label: 'Gestor',
            render: (row) => {
                const joinedName = (row as any).gestor?.nombre;
                if (joinedName) return joinedName;
                const localProfile = profiles.find(p => p.user_id === row.gestor_asignado);
                return localProfile?.nombre || row.gestor_asignado || '-';
            },
        },
        {
            key: 'quien_lo_recibe',
            label: 'Receptor',
            render: (row) => {
                const joinedName = (row as any).receptor?.nombre;
                if (joinedName) return joinedName;
                const localProfile = profiles.find(p => p.user_id === row.quien_lo_recibe);
                return localProfile?.nombre || row.quien_lo_recibe || '-';
            },
        },
        {
            key: 'aviso',
            label: 'Aviso',
            render: (row) => {
                const isSent = row.aviso === true || row.aviso === 'true';
                const isNotSent = row.aviso === false || row.aviso === 'false';
                const hasValue = row.aviso && !isSent && !isNotSent;

                return (
                    <div className="flex justify-center">
                        {isSent ? (
                            <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold">ENVIADO</span>
                        ) : isNotSent ? (
                            <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[10px] font-bold">NO ENVIADO</span>
                        ) : hasValue ? (
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">{String(row.aviso)}</span>
                        ) : (
                            <span className="text-slate-400">-</span>
                        )}
                    </div>
                );
            },
        },
        {
            key: 'categoria',
            label: 'Categoría',
        },
        {
            key: 'urgencia',
            label: 'Urgencia',
            render: (row) => (
                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${row.urgencia === 'Alta' ? 'bg-red-100 text-red-700' :
                    row.urgencia === 'Media' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-blue-100 text-blue-700'
                    }`}>
                    {row.urgencia}
                </span>
            ),
        },
        {
            key: 'sentimiento',
            label: 'Sentimiento',
        },
        {
            key: 'resuelto',
            label: 'Estado',
            render: (row) => (
                <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${row.resuelto
                    ? 'bg-neutral-900 text-white'
                    : 'bg-yellow-400 text-neutral-950'
                    }`}
                >
                    {row.resuelto ? 'Resuelto' : 'Pendiente'}
                </span>
            ),
            sortable: false,
        },
        {
            key: 'dia_resuelto',
            label: 'Día Res.',
            render: (row) => row.dia_resuelto ? new Date(row.dia_resuelto).toLocaleDateString() : '-',
            defaultVisible: false,
        },
        {
            key: 'resuelto_por',
            label: 'Resuelto Por',
            render: (row) => row.resolver?.nombre || '-',
            defaultVisible: false,
        },
        {
            key: 'actions',
            label: 'Acciones',
            render: (row) => (
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleResuelto(row.id, row.resuelto);
                        }}
                        title={row.resuelto ? 'Reabrir incidencia' : 'Resolver incidencia'}
                        className={`p-1.5 rounded-full transition-colors ${row.resuelto
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : 'bg-green-100 text-green-600 hover:bg-green-200'
                            }`}
                    >
                        {row.resuelto ? <RotateCcw className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(row.id);
                        }}
                        title="Eliminar incidencia"
                        className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ),
        }
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center gap-4">
                <h1 className="text-xl font-bold text-neutral-900">Gestión de Tickets</h1>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="bg-yellow-400 hover:bg-yellow-500 text-neutral-950 px-4 py-2 rounded-md flex items-center gap-2 transition font-semibold text-sm"
                >
                    <Plus className="w-4 h-4" />
                    Nuevo Ticket
                </button>
            </div>

            {/* Filters and Actions */}
            <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
                <div className="flex gap-2">
                    <button
                        onClick={() => setFilterEstado('pendiente')}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition ${filterEstado === 'pendiente' ? 'bg-yellow-400 text-neutral-950' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}
                    >
                        Pendientes
                    </button>
                    <button
                        onClick={() => setFilterEstado('resuelto')}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition ${filterEstado === 'resuelto' ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}
                    >
                        Resueltas
                    </button>
                    <button
                        onClick={() => setFilterEstado('all')}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition ${filterEstado === 'all' ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}
                    >
                        Todas
                    </button>
                </div>

                {/* Export Actions (Visible only if selection) */}
                {selectedIds.size > 0 && (
                    <div className="flex gap-2 items-center animate-in fade-in slide-in-from-bottom-2">
                        <span className="text-sm font-medium text-neutral-500 mr-2">{selectedIds.size} seleccionados</span>

                        <button
                            onClick={() => handleExport('csv')}
                            disabled={exporting}
                            className="bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition disabled:opacity-50"
                        >
                            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4 text-green-600" />}
                            CSV
                        </button>

                        <button
                            onClick={() => handleExport('pdf')}
                            disabled={exporting}
                            className="bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50 px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition disabled:opacity-50"
                        >
                            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-red-600" />}
                            PDF
                        </button>
                    </div>
                )}
            </div>

            {/* Form Modal */}
            {showForm && (
                <div
                    className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-0 sm:p-4 md:p-8 backdrop-blur-sm overflow-y-auto"
                    onClick={() => setShowForm(false)}
                >
                    <div
                        className="w-full sm:w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[85vh] bg-white rounded-none sm:rounded-xl shadow-xl flex flex-col animate-in fade-in zoom-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-slate-900">
                                Registrar Nuevo Ticket
                            </h2>
                            <button
                                onClick={() => setShowForm(false)}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar">
                            <form id="incidencia-form" onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                                {/* Row 1: Quien lo recibe */}
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Quién lo recibe <span className="text-red-600">*</span></label>
                                    <SearchableSelect
                                        value={formData.recibido_por}
                                        onChange={(val) => setFormData({ ...formData, recibido_por: String(val) })}
                                        options={profiles.map(p => ({
                                            value: p.user_id,
                                            label: p.nombre
                                        }))}
                                        placeholder="Buscar persona..."
                                    />
                                </div>

                                {/* Row 2: Teléfono | Nombre Cliente */}
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Teléfono Cliente</label>
                                    <input
                                        type="tel"
                                        placeholder="Ej: 600000000"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                                        value={formData.telefono}
                                        onChange={e => setFormData({ ...formData, telefono: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Nombre Cliente <span className="text-red-600">*</span></label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="Nombre completo"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                                        value={formData.nombre_cliente}
                                        onChange={e => setFormData({ ...formData, nombre_cliente: e.target.value })}
                                    />
                                </div>

                                {/* Row 3: Comunidad */}
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Comunidad <span className="text-red-600">*</span></label>
                                    <SearchableSelect
                                        value={formData.comunidad_id}
                                        onChange={(val) => setFormData({ ...formData, comunidad_id: String(val) })}
                                        options={comunidades.map(cd => ({
                                            value: String(cd.id),
                                            label: cd.codigo ? `${cd.codigo} - ${cd.nombre_cdad}` : cd.nombre_cdad
                                        }))}
                                        placeholder="Buscar comunidad par nombre o código..."
                                    />
                                </div>

                                {/* Row 4: Email */}
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Email Cliente</label>
                                    <input
                                        type="email"
                                        placeholder="ejemplo@correo.com"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>

                                {/* Row 5: Mensaje */}
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Mensaje <span className="text-red-600">*</span></label>
                                    <textarea
                                        required
                                        rows={3}
                                        placeholder="Detalles de la incidencia..."
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 min-h-[120px] resize-y"
                                        value={formData.mensaje}
                                        onChange={e => setFormData({ ...formData, mensaje: e.target.value })}
                                    />
                                </div>

                                {/* Row 6: Gestor Asignado */}
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Gestor Asignado <span className="text-red-600">*</span></label>
                                    <SearchableSelect
                                        value={formData.gestor_asignado}
                                        onChange={(val) => setFormData({ ...formData, gestor_asignado: String(val) })}
                                        options={profiles.map(p => ({
                                            value: p.user_id,
                                            label: `${p.nombre} (${p.rol})`
                                        }))}
                                        placeholder="Buscar un gestor..."
                                    />
                                </div>

                                {/* Row 7: Proveedor (Placeholder) */}
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Enviar email a Proveedor</label>
                                    <select
                                        disabled
                                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400 focus:outline-none cursor-not-allowed"
                                        value={formData.proveedor}
                                        onChange={e => setFormData({ ...formData, proveedor: e.target.value })}
                                    >
                                        <option value="">Próximamente disponible...</option>
                                    </select>
                                </div>

                                {/* Row 8: Adjuntos */}
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Adjuntar documentos (pueden ser varios)</label>
                                    <input
                                        type="file"
                                        multiple
                                        className="block w-full text-sm text-slate-500
                                        file:mr-4 file:py-2 file:px-4
                                        file:rounded-full file:border-0
                                        file:text-sm file:font-semibold
                                        file:bg-slate-100 file:text-slate-700
                                        hover:file:bg-slate-200 cursor-pointer"
                                        onChange={(e) => {
                                            if (e.target.files) {
                                                setFiles(Array.from(e.target.files));
                                            }
                                        }}
                                    />
                                    {files.length > 0 && (
                                        <p className="mt-1 text-xs text-slate-500">{files.length} archivos seleccionados</p>
                                    )}
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                                        Enviar notificación al propietario <span className="text-red-600">*</span>
                                    </label>
                                    <div className="flex items-center gap-6 mt-2">
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="radio"
                                                name="enviarAviso"
                                                checked={enviarAviso === true}
                                                onChange={() => setEnviarAviso(true)}
                                                className="w-4 h-4 text-slate-900 border-slate-300 focus:ring-slate-900/20"
                                            />
                                            <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">Sí</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="radio"
                                                name="enviarAviso"
                                                checked={enviarAviso === false}
                                                onChange={() => setEnviarAviso(false)}
                                                className="w-4 h-4 text-slate-900 border-slate-300 focus:ring-slate-900/20"
                                            />
                                            <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">No</span>
                                        </label>
                                    </div>
                                    {enviarAviso === null && (
                                        <p className="mt-1 text-xs text-red-600">Debe seleccionar una opción</p>
                                    )}
                                </div>
                            </form>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100">
                            <button
                                form="incidencia-form"
                                type="submit"
                                disabled={
                                    uploading ||
                                    enviarAviso === null ||
                                    !formData.recibido_por ||
                                    !formData.nombre_cliente ||
                                    !formData.comunidad_id ||
                                    !formData.mensaje ||
                                    !formData.gestor_asignado ||
                                    !!(enviarAviso === true && !formData.telefono && !formData.email) ||
                                    !!(formData.telefono && !/^\d{9}$/.test(formData.telefono)) ||
                                    !!(formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
                                }
                                className="w-full sm:w-auto h-12 px-8 bg-yellow-400 hover:bg-yellow-500 text-neutral-950 rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm hover:shadow-md active:scale-[0.98]"
                            >
                                {uploading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Subiendo archivos...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-5 h-5" />
                                        Registrar Ticket
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
                        <button
                            onClick={() => setShowDeleteModal(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="mb-6 text-center">
                            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                                <Trash2 className="w-6 h-6 text-red-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Confirmar Eliminación</h3>
                            <p className="text-sm text-gray-500 mt-2">
                                Para eliminar esta incidencia, es necesaria la autorización de un administrador.
                            </p>
                        </div>

                        <form onSubmit={confirmDelete} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email Administrador</label>
                                <input
                                    type="email"
                                    required
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                    value={deleteEmail}
                                    onChange={e => setDeleteEmail(e.target.value)}
                                    placeholder="admin@ejemplo.com"
                                    autoComplete="off"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña Administrador</label>
                                <input
                                    type="password"
                                    required
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                    value={deletePassword}
                                    onChange={e => setDeletePassword(e.target.value)}
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteModal(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isDeleting}
                                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50"
                                >
                                    {isDeleting ? 'Verificando...' : 'Eliminar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Export Notes Modal */}
            {showExportModal && (
                <div
                    className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 backdrop-blur-sm"
                    onClick={() => {
                        setShowExportModal(false);
                        setPendingExportParams(null);
                    }}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 relative overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="text-center">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Exportar PDF</h3>
                            <p className="text-sm text-gray-600 mb-8 px-2">
                                ¿Desea incluir las notas de gestión en el documento PDF?
                            </p>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => {
                                        const params = pendingExportParams;
                                        setPendingExportParams(null);
                                        setShowExportModal(false);
                                        if (params) {
                                            handleExport(params.type, params.ids, true);
                                        }
                                    }}
                                    className="w-full py-3 bg-yellow-400 text-neutral-950 rounded-full font-bold hover:bg-yellow-500 transition shadow-md"
                                >
                                    SÍ
                                </button>
                                <button
                                    onClick={() => {
                                        const params = pendingExportParams;
                                        setPendingExportParams(null);
                                        setShowExportModal(false);
                                        if (params) {
                                            handleExport(params.type, params.ids, false);
                                        }
                                    }}
                                    className="w-full py-3 bg-gray-200 text-red-600 rounded-full font-bold hover:bg-gray-300 transition"
                                >
                                    NO
                                </button>
                                <button
                                    onClick={() => {
                                        setPendingExportParams(null);
                                        setShowExportModal(false);
                                    }}
                                    className="w-full py-3 bg-gray-200 text-gray-700 rounded-full font-bold hover:bg-gray-300 transition"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <DataTable
                data={filteredIncidencias}
                columns={columns}
                keyExtractor={(row) => row.id}
                storageKey="incidencias"
                loading={loading}
                emptyMessage="No hay incidencias en esta vista"
                selectable={true}
                selectedKeys={selectedIds}
                onSelectionChange={(keys) => setSelectedIds(keys)}
                onRowClick={handleRowClick}
                extraFilters={
                    <SearchableSelect
                        value={filterGestor === 'all' ? '' : filterGestor}
                        onChange={(val) => setFilterGestor(val === '' ? 'all' : String(val))}
                        options={profiles.map(p => ({
                            value: p.user_id,
                            label: p.nombre
                        }))}
                        placeholder="Todos los Gestores"
                        className="min-w-[200px]"
                    />
                }
            />

            {/* Detail Modal */}
            {showDetailModal && selectedDetailIncidencia && (
                <div
                    className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-0 sm:p-4 md:p-8 backdrop-blur-sm"
                    onClick={() => setShowDetailModal(false)}
                >
                    <div
                        className="bg-white rounded-none sm:rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-gray-900/10 w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col animate-in fade-in zoom-in duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex justify-between items-center bg-white flex-shrink-0 rounded-t-xl">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                    Ticket #{selectedDetailIncidencia.id}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Creado el {new Date(selectedDetailIncidencia.created_at).toLocaleString()}
                                </p>
                                {selectedDetailIncidencia.resuelto && selectedDetailIncidencia.dia_resuelto && (
                                    <p className="text-xs text-green-600 mt-0.5 font-medium flex items-center gap-1">
                                        Resuelto el {new Date(selectedDetailIncidencia.dia_resuelto).toLocaleString()}
                                        {selectedDetailIncidencia.resolver?.nombre && (
                                            <span className="text-slate-400 font-normal">
                                                ({selectedDetailIncidencia.resolver.nombre})
                                            </span>
                                        )}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="file"
                                    multiple
                                    className="hidden"
                                    ref={detailFileInputRef}
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files.length > 0) {
                                            handleDetailFileUpload(e.target.files);
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => detailFileInputRef.current?.click()}
                                    className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                                    title="Adjuntar archivos"
                                    disabled={isUpdatingRecord}
                                >
                                    {isUpdatingRecord ? <Loader2 className="w-5 h-5 animate-spin text-slate-600" /> : <Paperclip className="w-5 h-5" />}
                                </button>
                                <button
                                    onClick={() => handleExport('pdf', [selectedDetailIncidencia.id])}
                                    className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400 hover:text-slate-600"
                                    title="Descargar PDF"
                                    disabled={exporting}
                                >
                                    {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                </button>
                                <button
                                    onClick={() => setShowDetailModal(false)}
                                    className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="p-4 sm:p-6 space-y-8 flex-grow">
                            {/* Top Status Bar */}
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                                <div className="space-y-1">
                                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado</span>
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold ${selectedDetailIncidencia.resuelto
                                        ? 'bg-slate-100 text-slate-700'
                                        : 'bg-yellow-100/50 text-yellow-700 border border-yellow-200/50'
                                        }`}>
                                        {selectedDetailIncidencia.resuelto ? <Check className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                                        {selectedDetailIncidencia.resuelto ? 'Resuelto' : 'Pendiente'}
                                    </span>
                                </div>

                                <div className="space-y-1">
                                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Urgencia</span>
                                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${selectedDetailIncidencia.urgencia === 'Alta' ? 'bg-red-50 text-red-700 border border-red-100' :
                                        selectedDetailIncidencia.urgencia === 'Media' ? 'bg-orange-50 text-orange-700 border border-orange-100' :
                                            'bg-blue-50 text-blue-700 border border-blue-100'
                                        }`}>
                                        {selectedDetailIncidencia.urgencia || 'No definida'}
                                    </span>
                                </div>

                                <div className="space-y-1">
                                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Categoría</span>
                                    <span className="text-sm font-semibold text-slate-700">{selectedDetailIncidencia.categoria || '-'}</span>
                                </div>

                                <div className="space-y-1">
                                    <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aviso Propietario</span>
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${selectedDetailIncidencia.aviso === true
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : selectedDetailIncidencia.aviso === false
                                            ? 'bg-slate-100 text-slate-500'
                                            : 'bg-slate-50 text-slate-400'
                                        }`}>
                                        {selectedDetailIncidencia.aviso === true ? 'ENVIADO' : selectedDetailIncidencia.aviso === false ? 'NO ENVIADO' : 'N/A'}
                                    </span>
                                </div>
                            </div>

                            {/* Tables Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-10">
                                {/* Left Column: Cliente & Comunidad */}
                                <div className="space-y-6">
                                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                                        <span className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-base">👤</span>
                                        Contacto y Ubicación
                                    </h4>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center text-sm border-b border-slate-50 pb-3">
                                            <span className="text-slate-500">Cliente</span>
                                            <span className="font-semibold text-slate-900">{selectedDetailIncidencia.nombre_cliente}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm border-b border-slate-50 pb-3">
                                            <span className="text-slate-500">Teléfono</span>
                                            <span className="font-semibold text-slate-900">{selectedDetailIncidencia.telefono}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm border-b border-slate-50 pb-3">
                                            <span className="text-slate-500">Email</span>
                                            <span className="text-slate-900">{selectedDetailIncidencia.email || '-'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-500">Comunidad</span>
                                            <span className="font-semibold text-slate-900">
                                                {selectedDetailIncidencia.comunidad || selectedDetailIncidencia.comunidades?.nombre_cdad || '-'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Gestión Interna */}
                                <div className="space-y-6">
                                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                                        <span className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-base">📋</span>
                                        Gestión Interna
                                    </h4>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center text-sm border-b border-slate-50 pb-3">
                                            <span className="text-slate-500">Recibido por</span>
                                            <span className="font-semibold text-slate-900">
                                                {(selectedDetailIncidencia as any).receptor?.nombre || selectedDetailIncidencia.quien_lo_recibe || '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm border-b border-slate-50 pb-3">
                                            <span className="text-slate-500">Gestor Asignado</span>
                                            <span className="font-semibold text-slate-900">
                                                {(selectedDetailIncidencia as any).gestor?.nombre || selectedDetailIncidencia.gestor_asignado || '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm border-b border-slate-50 pb-3">
                                            <span className="text-slate-500">Sentimiento</span>
                                            <span className="font-semibold text-slate-900">{selectedDetailIncidencia.sentimiento || '-'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-500">Fecha Creación</span>
                                            <span className="text-slate-900">{new Date(selectedDetailIncidencia.created_at).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Message */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    Mensaje del Cliente
                                </h4>
                                <div className="bg-slate-50/50 p-6 rounded-xl border border-slate-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap italic">
                                    "{selectedDetailIncidencia.mensaje}"
                                </div>
                            </div>

                            {/* Attachments */}
                            {selectedDetailIncidencia.adjuntos && selectedDetailIncidencia.adjuntos.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                        📎 Archivos Adjuntos
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {selectedDetailIncidencia.adjuntos.map((url, i) => (
                                            <a
                                                key={i}
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 bg-white border border-slate-200 p-3 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:shadow-sm transition group"
                                            >
                                                <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-slate-100 transition">
                                                    <Paperclip className="w-5 h-5 text-slate-400 group-hover:text-slate-600" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-semibold">Archivo {i + 1}</span>
                                                    <span className="text-[10px] text-slate-400">Clic para ver</span>
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Timeline Chat */}
                            <div className="space-y-4 pt-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    Timeline de Gestión
                                </h4>
                                <TimelineChat
                                    entityType="incidencia"
                                    entityId={selectedDetailIncidencia.id}
                                />
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 bg-slate-50/30 rounded-b-xl flex justify-between items-center flex-shrink-0">
                            <button
                                onClick={() => {
                                    handleDeleteClick(selectedDetailIncidencia.id);
                                    setShowDetailModal(false);
                                }}
                                className="flex items-center gap-2 text-red-500 hover:text-red-600 hover:bg-red-50/50 px-4 py-2 rounded-xl transition font-semibold text-sm"
                            >
                                <Trash2 className="w-4 h-4" />
                                <span>Eliminar Ticket</span>
                            </button>

                            <button
                                onClick={() => {
                                    toggleResuelto(selectedDetailIncidencia.id, selectedDetailIncidencia.resuelto);
                                    if (!selectedDetailIncidencia.resuelto) {
                                        setShowDetailModal(false);
                                    } else {
                                        setSelectedDetailIncidencia({
                                            ...selectedDetailIncidencia,
                                            resuelto: !selectedDetailIncidencia.resuelto,
                                            dia_resuelto: !selectedDetailIncidencia.resuelto ? new Date().toISOString() : undefined
                                        });
                                    }
                                }}
                                className={`h-11 px-6 rounded-xl font-bold shadow-sm transition flex items-center gap-2 ${selectedDetailIncidencia.resuelto
                                    ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                                    : 'bg-yellow-400 text-neutral-950 hover:bg-yellow-500 shadow-yellow-200/50 hover:shadow-lg'
                                    }`}
                            >
                                {selectedDetailIncidencia.resuelto ? (
                                    <>
                                        <RotateCcw className="w-4 h-4" />
                                        Reabrir Ticket
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-4 h-4" />
                                        Marcar Resuelto
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

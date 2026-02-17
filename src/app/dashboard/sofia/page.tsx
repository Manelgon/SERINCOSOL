'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { supabaseSecondary } from '@/lib/supabaseSecondaryClient';
import { toast } from 'react-hot-toast';
import { Check, RotateCcw, Paperclip, Trash2, X, FileText, Download, Loader2, Building, Users, Clock, UserCog, Save } from 'lucide-react';
import DeleteConfirmationModal from '@/components/DeleteConfirmationModal';
import DataTable, { Column } from '@/components/DataTable';
import SearchableSelect from '@/components/SearchableSelect';
import { logActivity } from '@/lib/logActivity';
import TimelineChat from '@/components/TimelineChat';
import { getSecureUrl } from '@/lib/storage';

interface Incidencia {
    id: number;
    comunidad_id: number;
    nombre_cliente: string;
    telefono: string;
    email: string;
    mensaje: string;
    urgencia?: 'Baja' | 'Media' | 'Alta';
    resuelto: boolean;
    created_at: string;
    comunidades?: { nombre_cdad: string; codigo?: string };

    // New fields
    quien_lo_recibe?: string;
    comunidad?: string;
    codigo?: string;
    gestor_asignado?: string;
    gestor?: { nombre: string };
    sentimiento?: string;
    categoria?: string;
    nota_gestor?: string;
    nota_propietario?: string;
    todas_notas_propietario?: string;
    dia_resuelto?: string;
    resuelto_por?: string;
    resolver?: { nombre: string };
    adjuntos?: string[];
    aviso?: string | boolean;
    id_email_gestion?: string;
}

export default function SofiaPage() {
    const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
    const [comunidades, setComunidades] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isLocal, setIsLocal] = useState(true);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const local = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            setIsLocal(local);
            if (!local) {
                window.location.href = '/dashboard';
            }
        }
    }, []);

    const [filterEstado, setFilterEstado] = useState('pendiente');
    const [filterGestor, setFilterGestor] = useState('all');
    const [filterComunidad, setFilterComunidad] = useState('all');

    // Selection & Export
    const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
    const [exporting, setExporting] = useState(false);

    const [profiles, setProfiles] = useState<any[]>([]);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<number | null>(null);

    // Delete state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<number | null>(null);
    const [deleteEmail, setDeleteEmail] = useState('');
    const [deletePassword, setDeletePassword] = useState('');
    const [isReassigning, setIsReassigning] = useState(false);
    const [newGestorId, setNewGestorId] = useState('');
    const [newComunidadId, setNewComunidadId] = useState<number | ''>('');
    const [isUpdatingGestor, setIsUpdatingGestor] = useState(false);
    const [showReassignSuccessModal, setShowReassignSuccessModal] = useState(false);
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

        // Check if the IDs coming from Sofia DB exist in our Panel DB lists
        const communityMatch = comunidades.find(c => c.id === incidencia.comunidad_id);
        const gestorMatch = profiles.find(p => p.user_id === incidencia.gestor_asignado);

        setNewComunidadId(communityMatch ? incidencia.comunidad_id : '');
        setNewGestorId(gestorMatch ? (incidencia.gestor_asignado || '') : '');
        setShowDetailModal(true);
    };

    useEffect(() => {
        fetchInitialData();

        // Subscribe to real-time changes in secondary Supabase
        const channel = supabaseSecondary
            .channel('sofia-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'incidencias_serincobot' },
                () => {
                    fetchIncidencias();
                }
            )
            .subscribe();

        return () => {
            supabaseSecondary.removeChannel(channel);
        };
    }, []);

    // Prevent body scroll when any modal is open
    useEffect(() => {
        if (showDeleteModal || showExportModal || showDetailModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showDeleteModal, showExportModal, showDetailModal]);

    const fetchInitialData = async () => {
        setLoading(true);
        // Metadata from primary, tickets from secondary
        const [cdads, profs] = await Promise.all([fetchComunidades(), fetchProfiles()]);
        await fetchIncidencias(cdads || [], profs || []);
        setLoading(false);
    };

    const fetchProfiles = async () => {
        const { data } = await supabase.from('profiles').select('user_id, nombre, rol').eq('activo', true);
        if (data) {
            const filtered = data.filter(p => p.nombre !== 'Sofia-Bot');
            setProfiles(filtered);
            return filtered;
        }
        return [];
    };

    const fetchComunidades = async () => {
        const { data } = await supabase.from('comunidades').select('id, nombre_cdad, codigo').eq('activo', true);
        if (data) {
            setComunidades(data);
            return data;
        }
        return [];
    };

    const fetchIncidencias = async (passedComunidades?: any[], passedProfiles?: any[]) => {
        const currentComunidades = passedComunidades || comunidades;
        const currentProfiles = passedProfiles || profiles;

        console.log('Fetching incidencias from secondary...', (supabaseSecondary as any).supabaseUrl);
        // Fetch from secondary Supabase
        const { data, error } = await supabaseSecondary
            .from('incidencias_serincobot')
            .select('*');

        if (error) {
            toast.error('Error cargando datos de Sofia');
            console.error('Sofia fetch error:', error);
        } else {
            if (data && data.length > 0) {
                console.log('Sofia schema sample keys:', Object.keys(data[0]));
            }
            // Sort in memory if created_at is missing or use a fallback
            const dataToSort = data || [];
            // Many tables use 'id' or another numeric field if created_at is missing
            const sortedData = [...dataToSort].sort((a: any, b: any) => (b.created_at || b.id || 0) - (a.created_at || a.id || 0));

            // Map data and enrich with metadata from primary Supabase (profiles, comunidades)
            const formattedData = sortedData.map((item: any) => {
                // Secondary DB fallbacks (Case-insensitive discovery)
                const findValue = (regex: RegExp) => {
                    const key = Object.keys(item).find(k => regex.test(k));
                    return key ? item[key] : null;
                };

                const rawBuilding = item.comunidad || findValue(/comunida/i) || findValue(/edificio/i) || '';
                const rawDate = item.created_at || findValue(/solicitud/i) || findValue(/fecha/i) || findValue(/created/i) || '';
                const rawGestor = item.gestor_asignado || item.gestor || findValue(/gestor/i) || '';

                const cdad = currentComunidades.find((c: any) => c.id === item.comunidad_id);
                const gestorProf = currentProfiles.find((p: any) => p.user_id === rawGestor);
                const receptorProf = currentProfiles.find((p: any) => p.user_id === item.quien_lo_recibe);
                const resolverProf = currentProfiles.find((p: any) => p.user_id === item.resuelto_por);

                return {
                    ...item,
                    comunidades: cdad ? { nombre_cdad: cdad.nombre_cdad, codigo: cdad.codigo } : undefined,
                    comunidad: cdad?.nombre_cdad || rawBuilding || '',
                    created_at: rawDate,
                    codigo: cdad?.codigo || '',
                    gestor: gestorProf ? { nombre: gestorProf.nombre } : undefined,
                    receptor: receptorProf ? { nombre: receptorProf.nombre } : undefined,
                    resolver: resolverProf ? { nombre: resolverProf.nombre } : undefined
                };
            });
            setIncidencias(formattedData);
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
                const filePath = `sofia/${fileName}`;

                const formData = new FormData();
                formData.append('file', file);
                formData.append('path', 'sofia');
                formData.append('bucket', 'documentos');

                const res = await fetch('/api/storage/upload', {
                    method: 'POST',
                    body: formData
                });

                if (!res.ok) {
                    const error = await res.json();
                    throw new Error(error.error || 'Error al subir archivo');
                }

                const data = await res.json();
                newUrls.push(data.publicUrl);
            }

            const currentAdjuntos = selectedDetailIncidencia.adjuntos || [];
            const updatedAdjuntos = [...currentAdjuntos, ...newUrls];

            const { error: updateError } = await supabaseSecondary
                .from('incidencias_serincobot')
                .update({ adjuntos: updatedAdjuntos })
                .eq('id', selectedDetailIncidencia.id);

            if (updateError) throw updateError;

            setSelectedDetailIncidencia({
                ...selectedDetailIncidencia,
                adjuntos: updatedAdjuntos
            });

            setIncidencias(prev => prev.map(i => i.id === selectedDetailIncidencia.id ? { ...i, adjuntos: updatedAdjuntos } : i));

            // Log activity in primary
            await logActivity({
                action: 'update',
                entityType: 'sofia_incidencia',
                entityId: selectedDetailIncidencia.id,
                entityName: `Sofia - ${selectedDetailIncidencia.nombre_cliente}`,
                details: {
                    id: selectedDetailIncidencia.id,
                    action: 'adjuntar_archivos',
                    archivos_nuevos: newUrls.length,
                    total_archivos: updatedAdjuntos.length
                }
            });

            toast.success('Archivos añadidos', { id: loadingToast });
        } catch (error: any) {
            console.error(error);
            toast.error('Error al subir archivos', { id: loadingToast });
        } finally {
            setIsUpdatingRecord(false);
        }
    };

    const handleDeleteAttachment = async (urlToDelete: string) => {
        if (!selectedDetailIncidencia) return;

        const isConfirmed = window.confirm('¿Estás seguro de que deseas eliminar este documento?');
        if (!isConfirmed) return;

        setIsUpdatingRecord(true);
        const loadingToast = toast.loading('Eliminando archivo...');

        try {
            const updatedAdjuntos = (selectedDetailIncidencia.adjuntos || []).filter(url => url !== urlToDelete);

            const { error: updateError } = await supabaseSecondary
                .from('incidencias_serincobot')
                .update({ adjuntos: updatedAdjuntos })
                .eq('id', selectedDetailIncidencia.id);

            if (updateError) throw updateError;

            setSelectedDetailIncidencia({
                ...selectedDetailIncidencia,
                adjuntos: updatedAdjuntos
            });

            setIncidencias(prev => prev.map(i => i.id === selectedDetailIncidencia.id ? { ...i, adjuntos: updatedAdjuntos } : i));

            // Log activity in primary
            await logActivity({
                action: 'update',
                entityType: 'sofia_incidencia',
                entityId: selectedDetailIncidencia.id,
                entityName: `Sofia - ${selectedDetailIncidencia.nombre_cliente}`,
                details: {
                    id: selectedDetailIncidencia.id,
                    action: 'eliminar_archivo',
                    url: urlToDelete
                }
            });

            toast.success('Archivo eliminado', { id: loadingToast });
        } catch (error: any) {
            console.error(error);
            toast.error('Error al eliminar archivo', { id: loadingToast });
        } finally {
            setIsUpdatingRecord(false);
        }
    };

    const toggleResuelto = async (id: number, currentStatus: boolean) => {
        if (isUpdatingStatus === id) return;
        setIsUpdatingStatus(id);
        try {
            console.log('Toggling Sofia Ticket:', { id, currentStatus });
            const { data: { user } } = await supabase.auth.getUser();
            console.log('Current User for update:', user?.id);

            const updatePayload = {
                resuelto: !currentStatus,
                dia_resuelto: !currentStatus ? new Date().toISOString() : null,
                resuelto_por: !currentStatus ? (user?.id || 'manual_user') : null
            };
            console.log('Update Payload:', updatePayload);

            const { data, error, status, statusText } = await supabaseSecondary
                .from('incidencias_serincobot')
                .update(updatePayload)
                .eq('id', id)
                .select();

            console.log('Supabase update response:', { data, error, status, statusText });

            if (error) throw error;

            toast.success(currentStatus ? 'Marcado como pendiente' : 'Marcado como resuelto');

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
                entityType: 'sofia_incidencia',
                entityId: id,
                entityName: `Sofia - ${incidencia?.nombre_cliente}`,
                details: {
                    id: id,
                    comunidad: incidencia?.comunidades?.nombre_cdad,
                    resuelto: !currentStatus
                }
            });

            // Close modal after successful resolution
            setShowDetailModal(false);
        } catch (error: any) {
            console.error('Error toggling resuelto:', error);
            if (error?.message) console.error('Error message:', error.message);
            if (error?.details) console.error('Error details:', error.details);
            if (error?.hint) console.error('Error hint:', error.hint);
            toast.error(`Error al actualizar estado: ${error.message || 'Error desconocido'}`);
        } finally {
            setIsUpdatingStatus(null);
        }
    };

    const handleExport = async (type: 'csv' | 'pdf', idsOverride?: number[], includeNotesFromModal?: boolean) => {
        const idsToExport = idsOverride || Array.from(selectedIds);
        if (idsToExport.length === 0) return;

        const isDetailView = !!idsOverride && idsToExport.length === 1 && type === 'pdf';

        if (isDetailView && includeNotesFromModal === undefined) {
            setPendingExportParams({ type, ids: idsOverride });
            setShowExportModal(true);
            return;
        }

        const includeNotes = includeNotesFromModal !== undefined ? includeNotesFromModal : false;

        setExporting(true);
        try {
            // Note: If export API depends on primary DB, this might need an update to handle secondary DB
            const res = await fetch('/api/incidencias/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: idsToExport,
                    type,
                    layout: isDetailView ? 'detail' : 'list',
                    includeNotes,
                    table: 'incidencias_serincobot',
                    isSecondary: true
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Export failed');
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            const now = new Date();
            const dateStr = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`;

            if (isDetailView) {
                a.download = `sofia_ticket_${idsToExport[0]}_${dateStr}.pdf`;
            } else {
                a.download = `listado_sofia_${dateStr}.${type === 'csv' ? 'csv' : 'pdf'}`;
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

    const handleConfirmDelete = async ({ email, password }: any) => {
        if (!itemToDelete || !email || !password) return;

        setIsDeleting(true);
        try {
            const res = await fetch('/api/admin/universal-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: itemToDelete,
                    email,
                    password,
                    type: 'sofia_incidencia',
                    table: 'incidencias_serincobot',
                    isSecondary: true
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Error al eliminar');
            }

            toast.success('Incidencia eliminada correctamente');
            setIncidencias(prev => prev.filter(i => i.id !== itemToDelete));
            setShowDeleteModal(false);

            await logActivity({
                action: 'delete',
                entityType: 'sofia_incidencia',
                entityId: itemToDelete,
                entityName: `Sofia Deleted`,
                details: { id: itemToDelete, deleted_by_admin: email }
            });

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleUpdateGestor = async () => {
        if (!selectedDetailIncidencia || !newGestorId || !newComunidadId) {
            toast.error('Selecciona una comunidad y un gestor');
            return;
        }

        setIsUpdatingGestor(true);
        const loadingToast = toast.loading('Transfiriendo ticket a gestión...');
        try {
            const res = await fetch('/api/sofia/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sofiaId: selectedDetailIncidencia.id,
                    gestorId: newGestorId,
                    comunidadId: newComunidadId
                })
            });

            const data = await res.json();

            if (!res.ok) {
                const err = new Error(data.error || 'Error al transferir ticket') as any;
                err.details = data.details;
                throw err;
            }

            // Successfully transferred
            toast.success('Ticket transferido a Gestión de Tickets', { id: loadingToast });

            // Remove from Sofia UI
            setIncidencias(prev => prev.filter(inc => inc.id !== selectedDetailIncidencia.id));
            setShowDetailModal(false);
            setSelectedDetailIncidencia(null);
            setIsReassigning(false);
            setNewGestorId('');
            setNewComunidadId('');

            // Note: We don't log locally here because the API logs the move or the new ticket creation
            // if logActivity is needed, it should be called for the NEW ticket id

        } catch (error: any) {
            console.error('Error transferring ticket:', error);
            const errorMessage = error.message || 'Error al reasignar gestor';
            toast.error(errorMessage, { id: loadingToast });
            if (error.details) {
                console.error('Detailed DB Error:', error.details);
            }
        } finally {
            setIsUpdatingGestor(false);
        }
    };

    const filteredIncidencias = incidencias.filter(inc => {
        const matchesEstado = filterEstado === 'pendiente' ? !inc.resuelto :
            filterEstado === 'resuelto' ? inc.resuelto : true;

        const matchesGestor = filterGestor === 'all' ? true : inc.gestor_asignado === filterGestor;
        const matchesComunidad = filterComunidad === 'all' ? true : inc.comunidad_id === Number(filterComunidad);

        return matchesEstado && matchesGestor && matchesComunidad;
    });

    const columns: Column<Incidencia>[] = [
        { key: 'id', label: 'ID' },
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
            label: 'Edificio',
            render: (row) => row.comunidad || '-',
        },
        { key: 'nombre_cliente', label: 'Cliente' },
        { key: 'telefono', label: 'Teléfono' },
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
            key: 'adjuntos',
            label: 'Adjuntos',
            render: (row) => (
                <div className="flex flex-wrap gap-1">
                    {row.adjuntos && row.adjuntos.length > 0 ? (
                        row.adjuntos.map((url, i) => (
                            <a
                                key={i}
                                href={getSecureUrl(url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-full bg-yellow-50 text-yellow-600 hover:bg-yellow-100 transition-colors"
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
            render: (row) => row.created_at ? new Date(row.created_at).toLocaleDateString() : '-',
        },
        {
            key: 'gestor_asignado',
            label: 'Gestor',
            render: (row) => row.gestor?.nombre || row.gestor_asignado || '-',
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
                        disabled={isUpdatingStatus === row.id}
                        className={`p-1.5 rounded-full transition-colors ${row.resuelto ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-600'}`}
                    >
                        {isUpdatingStatus === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : row.resuelto ? <RotateCcw className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(row.id);
                        }}
                        className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100"
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
                <h1 className="text-xl font-bold text-neutral-900">Sofia - Gestión Bot</h1>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
                <div className="flex gap-2">
                    {['pendiente', 'resuelto', 'all'].map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterEstado(status)}
                            className={`px-3 py-1 rounded-full text-sm font-medium transition ${filterEstado === status ? 'bg-yellow-400 text-neutral-950' : 'bg-neutral-200'}`}
                        >
                            {status === 'pendiente' ? 'Pendientes' : status === 'resuelto' ? 'Resueltas' : 'Todas'}
                        </button>
                    ))}
                </div>

                {selectedIds.size > 0 && (
                    <div className="flex gap-2 items-center">
                        <span className="text-sm font-medium text-neutral-500">{selectedIds.size} seleccionados</span>
                        <button onClick={() => handleExport('csv')} className="bg-white border px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium">
                            <FileText className="w-4 h-4 text-green-600" /> CSV
                        </button>
                        <button onClick={() => handleExport('pdf')} className="bg-white border px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium">
                            <Download className="w-4 h-4 text-red-600" /> PDF
                        </button>
                    </div>
                )}
            </div>

            <DataTable
                data={filteredIncidencias}
                columns={columns}
                keyExtractor={(row) => row.id}
                storageKey="sofia_tickets"
                loading={loading}
                emptyMessage="No hay registros de Sofia"
                selectable={true}
                selectedKeys={selectedIds}
                onSelectionChange={(keys) => setSelectedIds(keys)}
                onRowClick={handleRowClick}
                extraFilters={
                    <div className="flex items-center gap-2">
                        <SearchableSelect
                            value={filterComunidad === 'all' ? '' : Number(filterComunidad)}
                            onChange={(val) => setFilterComunidad(val === '' ? 'all' : String(val))}
                            options={comunidades.map(c => ({ value: c.id, label: `${c.codigo || ''} - ${c.nombre_cdad}` }))}
                            placeholder="Todas las Comunidades"
                            className="w-[240px]"
                        />
                        <SearchableSelect
                            value={filterGestor === 'all' ? '' : filterGestor}
                            onChange={(val) => setFilterGestor(val === '' ? 'all' : String(val))}
                            options={profiles.map(p => ({ value: p.user_id, label: p.nombre }))}
                            placeholder="Todos los Gestores"
                            className="w-[200px]"
                        />
                    </div>
                }
            />

            {/* Detail Modal (Cloned from Incidencias) */}
            {showDetailModal && selectedDetailIncidencia && (
                <div className="fixed inset-0 bg-neutral-900/60 z-[100] flex items-center justify-center p-0 sm:p-4 backdrop-blur-md" onClick={() => setShowDetailModal(false)}>
                    <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl w-full sm:max-w-4xl h-full sm:h-auto sm:max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="px-6 py-5 border-b flex justify-between items-center bg-neutral-50/50">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-amber-400 rounded-xl flex items-center justify-center text-neutral-900">
                                    <FileText className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-neutral-900 uppercase">Sofia Ticket #{selectedDetailIncidencia.id}</h3>
                                    <p className="text-xs text-neutral-500 font-medium uppercase">Registrado el {selectedDetailIncidencia.created_at && !isNaN(new Date(selectedDetailIncidencia.created_at).getTime()) ? new Date(selectedDetailIncidencia.created_at).toLocaleString().toUpperCase() : (selectedDetailIncidencia.created_at || 'FECHA NO DISPONIBLE')}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="file" multiple className="hidden" ref={detailFileInputRef} onChange={(e) => e.target.files && handleDetailFileUpload(e.target.files)} />
                                <div className="flex bg-white rounded-lg border p-1 shadow-sm">
                                    <button onClick={() => detailFileInputRef.current?.click()} className="p-2 hover:bg-neutral-50 rounded-md border-r"><Paperclip className="w-5 h-5 text-neutral-400" /></button>
                                    <button onClick={() => handleExport('pdf', [selectedDetailIncidencia.id])} className="p-2 hover:bg-neutral-50 rounded-md border-r"><Download className="w-5 h-5 text-neutral-400" /></button>
                                    <button onClick={() => setShowDetailModal(false)} className="p-2 hover:bg-red-50 rounded-md"><X className="w-5 h-5 text-neutral-400 hover:text-red-600" /></button>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                <div className="space-y-4">
                                    <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest border-b-2 border-neutral-900 pb-1.5">Identificación</h4>
                                    <div className="divide-y text-sm">
                                        <div className="py-2 flex justify-between items-center bg-yellow-50/50 px-3 rounded-lg mb-2 -mx-3 border border-yellow-100">
                                            <span className="font-bold text-amber-700 uppercase text-[10px]">Edificio Origen (Sofia)</span>
                                            <span className="font-black text-neutral-900 uppercase">{selectedDetailIncidencia.comunidad}</span>
                                        </div>
                                        <div className="py-2 flex justify-between items-center"><span className="font-bold text-neutral-400 uppercase">Comunidad</span>
                                            <div className="w-48">
                                                <SearchableSelect
                                                    value={newComunidadId}
                                                    onChange={(val) => setNewComunidadId(Number(val))}
                                                    options={comunidades.map(c => ({ value: c.id, label: `${c.codigo || ''} - ${c.nombre_cdad}` }))}
                                                    placeholder="Asignar Comunidad"
                                                />
                                            </div>
                                        </div>
                                        <div className="py-2 flex justify-between"><span className="font-bold text-neutral-400 uppercase">Propietario</span><span className="uppercase">{selectedDetailIncidencia.nombre_cliente}</span></div>
                                        <div className="py-2 flex justify-between"><span className="font-bold text-neutral-400 uppercase">Teléfono</span><span>{selectedDetailIncidencia.telefono}</span></div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest border-b-2 border-neutral-900 pb-1.5">Gestión</h4>
                                    <div className="divide-y text-sm">
                                        <div className="py-2 flex justify-between items-center"><span className="font-bold text-neutral-400 uppercase">Gestor</span>
                                            <div className="w-48">
                                                <SearchableSelect
                                                    value={newGestorId}
                                                    onChange={(val) => setNewGestorId(String(val))}
                                                    options={profiles.map(p => ({ value: p.user_id, label: p.nombre }))}
                                                    placeholder="Asignar Gestor"
                                                />
                                            </div>
                                        </div>
                                        <div className="py-2 flex justify-between"><span className="font-bold text-neutral-400 uppercase">Urgencia</span><span className="uppercase">{selectedDetailIncidencia.urgencia || 'Media'}</span></div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest border-b-2 border-neutral-900 pb-1.5">Mensaje</h4>
                                <p className="text-neutral-800 text-base leading-relaxed uppercase">{selectedDetailIncidencia.mensaje}</p>
                            </div>

                            {/* Documentation Section */}
                            {(selectedDetailIncidencia.adjuntos && selectedDetailIncidencia.adjuntos.length > 0) && (
                                <div className="space-y-4">
                                    <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest border-l-4 border-neutral-900 pl-4">Anexos y Documentación Adjunta</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {selectedDetailIncidencia.adjuntos.map((url: string, i: number) => (
                                            <div key={i} className="group relative">
                                                <a
                                                    href={getSecureUrl(url)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center justify-between bg-white border border-neutral-200 p-4 rounded-xl hover:border-neutral-900 transition-all shadow-sm pr-12"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-lg bg-neutral-50 flex items-center justify-center text-neutral-400 group-hover:bg-neutral-900 group-hover:text-white transition-colors">
                                                            <FileText className="w-5 h-5" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-normal text-neutral-900 truncate max-w-[150px] md:max-w-xs">
                                                                Documento Adjunto {i + 1}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">Ver archivo oficial</span>
                                                        </div>
                                                    </div>
                                                    <Download className="w-4 h-4 text-neutral-300 group-hover:text-neutral-900" />
                                                </a>
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleDeleteAttachment(url);
                                                    }}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-neutral-400 hover:text-red-600 transition-colors"
                                                    title="Eliminar documento"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4 pt-6">
                                <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest border-b-2 border-neutral-900 pb-2">Chat de Gestores (Sofia)</h4>
                                <TimelineChat entityType="sofia_incidencia" entityId={selectedDetailIncidencia.id} />
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t bg-white flex justify-between items-center">
                            <button onClick={() => { handleDeleteClick(selectedDetailIncidencia.id); setShowDetailModal(false); }} className="text-xs font-bold text-neutral-400 hover:text-red-600 uppercase flex items-center gap-2"><Trash2 className="w-4 h-4" /> Eliminar Registro</button>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleUpdateGestor}
                                    disabled={!newGestorId || !newComunidadId || isUpdatingGestor}
                                    className={`h-12 px-8 rounded-xl font-black text-xs uppercase shadow-lg transition-all flex items-center gap-2 ${(!newGestorId || !newComunidadId || isUpdatingGestor) ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed opacity-70' : 'bg-green-600 text-white hover:bg-green-700 active:scale-95'}`}
                                >
                                    {isUpdatingGestor ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                    TRAPASAR A GESTIÓN
                                </button>
                                <button onClick={() => toggleResuelto(selectedDetailIncidencia.id, selectedDetailIncidencia.resuelto)} className={`h-12 px-8 rounded-xl font-black text-xs uppercase transition-all ${selectedDetailIncidencia.resuelto ? 'bg-white border-2 border-neutral-900' : 'bg-amber-400 hover:bg-amber-500'}`}>
                                    {selectedDetailIncidencia.resuelto ? 'Reabrir Ticket' : 'RESOLVER TICKET'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals for delete, reassign success, and export (same as incidencias but adapted) */}
            {/* ... simplified for brevity or similar to incidencias ... */}
            {/* Delete Confirmation Modal */}
            <DeleteConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setItemToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                itemType="incidencia de Sofia"
                isDeleting={isDeleting}
            />

            {showReassignSuccessModal && (
                <div className="fixed inset-0 bg-neutral-900/60 z-[110] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"><Check className="w-8 h-8 text-green-600" /></div>
                        <h3 className="text-xl font-bold mb-2">Gestor Reasignado</h3>
                        <button onClick={() => setShowReassignSuccessModal(false)} className="w-full py-3 bg-neutral-900 text-white rounded-xl font-bold">Aceptar</button>
                    </div>
                </div>
            )}
        </div>
    );
}

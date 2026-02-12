'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { Trash2, FileText, Check, Plus, Paperclip, Download, X, RotateCcw, Building, Users, Clock, Search, Filter, Loader2, AlertCircle, Eye, RefreshCw, Send, Save, Share2, MoreHorizontal, MessageSquare, ChevronDown, UserCog } from 'lucide-react';
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
    urgencia?: 'Baja' | 'Media' | 'Alta'; // Optional, not set during creation
    resuelto: boolean;
    created_at: string;
    comunidades?: { nombre_cdad: string; codigo?: string };

    // New fields
    quien_lo_recibe?: string;
    comunidad?: string; // String representation if needed
    codigo?: string; // Add codigo for sorting
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
    const [filterComunidad, setFilterComunidad] = useState('all');

    // Selection & Export
    const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
    const [exporting, setExporting] = useState(false);

    const [profiles, setProfiles] = useState<any[]>([]);
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [enviarAviso, setEnviarAviso] = useState<boolean | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<number | null>(null);

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
    const [isReassigning, setIsReassigning] = useState(false);
    const [newGestorId, setNewGestorId] = useState('');
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
            // Map data to flatten nested objects for sorting
            const formattedData = (data || []).map((item: any) => ({
                ...item,
                comunidad: item.comunidades?.nombre_cdad || '',
                codigo: item.comunidades?.codigo || ''
            }));
            setIncidencias(formattedData);
        }
    };

    const handleFileUploads = async () => {
        if (files.length === 0) return [];
        setUploading(true);
        const urls: string[] = [];
        try {
            for (const file of files) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('path', `incidencias/${Date.now()}`); // Folder per timestamp
                formData.append('bucket', 'documentos');

                const res = await fetch('/api/storage/upload', {
                    method: 'POST',
                    body: formData
                });

                if (!res.ok) {
                    const error = await res.json();
                    console.error('Error uploading file via API:', error);
                    continue;
                }

                const data = await res.json();
                if (data.publicUrl) {
                    urls.push(data.publicUrl);
                }
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

        if (isSubmitting) return;
        setIsSubmitting(true);
        const loadingToastId = toast.loading('Creando ticket... espere');

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
            const gestorAsignado = profiles.find(p => p.user_id === formData.gestor_asignado);
            const gestorAsignadoNombre = gestorAsignado?.nombre || formData.gestor_asignado;
            await logActivity({
                action: 'create',
                entityType: 'incidencia',
                entityId: incidenciaId,
                entityName: `Incidencia - ${formData.nombre_cliente}`,
                details: {
                    id: incidenciaId,
                    comunidad: comunidad?.nombre_cdad,
                    mensaje: formData.mensaje,
                    asignado_a: gestorAsignadoNombre
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
        } finally {
            toast.dismiss(loadingToastId);
            setIsSubmitting(false);
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
                const formData = new FormData();
                formData.append('file', file);
                formData.append('path', `incidencias/${selectedDetailIncidencia.id}`);
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
                if (data.publicUrl) {
                    newUrls.push(data.publicUrl);
                }
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

            // Log activity
            await logActivity({
                action: 'update',
                entityType: 'incidencia',
                entityId: selectedDetailIncidencia.id,
                entityName: `Incidencia - ${selectedDetailIncidencia.nombre_cliente}`,
                details: {
                    id: selectedDetailIncidencia.id,
                    action: 'adjuntar_archivos',
                    archivos_nuevos: newUrls.length,
                    total_archivos: updatedAdjuntos.length
                }
            });

            toast.success('Archivos añadidos hoy', { id: loadingToast });
        } catch (error: any) {
            console.error(error);
            toast.error('Error al subir archivos', { id: loadingToast });
        } finally {
            setIsUpdatingRecord(false);
        }
    };

    const toggleResuelto = async (id: number, currentStatus: boolean) => {
        if (isUpdatingStatus === id) return;
        setIsUpdatingStatus(id);
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
                    id: id,
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
            console.error(error);
            toast.error('Error al actualizar estado');
        } finally {
            setIsUpdatingStatus(null);
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

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Export failed');
            }

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
            setItemToDelete(null);

            // Log delete activity
            await logActivity({
                action: 'delete',
                entityType: 'incidencia',
                entityId: itemToDelete,
                entityName: `Incidencia Deleted`,
                details: {
                    id: itemToDelete,
                    deleted_by_admin: email
                }
            });

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleUpdateGestor = async () => {
        if (!selectedDetailIncidencia || !newGestorId) return;

        setIsUpdatingGestor(true);
        try {
            // Obtener info del usuario actual
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Usuario no autenticado');

            const { error } = await supabase
                .from('incidencias')
                .update({ gestor_asignado: newGestorId })
                .eq('id', selectedDetailIncidencia.id);

            if (error) throw error;

            // toast.success('Gestor reasignado correctamente'); // Replaced by modal

            // Actualizar estado local
            const newGestorProfile = profiles.find(p => p.user_id === newGestorId);
            const oldGestorName = selectedDetailIncidencia.gestor?.nombre || 'Sin asignar';
            const newGestorName = newGestorProfile?.nombre || 'Desconocido';

            setSelectedDetailIncidencia({
                ...selectedDetailIncidencia,
                gestor_asignado: newGestorId,
                gestor: newGestorProfile ? { nombre: newGestorProfile.nombre } : selectedDetailIncidencia.gestor
            });

            // Actualizar lista principal
            setIncidencias(prev => prev.map(inc =>
                inc.id === selectedDetailIncidencia.id
                    ? { ...inc, gestor_asignado: newGestorId, gestor: newGestorProfile ? { nombre: newGestorProfile.nombre } : inc.gestor }
                    : inc
            ));

            // 1. Insertar mensaje en el Timeline (Chat)
            await supabase
                .from('record_messages')
                .insert({
                    entity_type: 'incidencia',
                    entity_id: selectedDetailIncidencia.id,
                    user_id: user.id,
                    content: `🔄 TICKET REASIGNADO\nDe: ${oldGestorName}\nA: ${newGestorName}`
                });

            // 2. Crear Notificación para el nuevo gestor
            if (newGestorId !== user.id) { // No notificarse a sí mismo si se autoasigna
                await supabase
                    .from('notifications')
                    .insert({
                        user_id: newGestorId,
                        type: 'assignment',
                        title: 'Nueva Asignación de Ticket',
                        content: `Se te ha asignado la incidencia #${selectedDetailIncidencia.id} (Reasignado por reasignación)`,
                        entity_id: selectedDetailIncidencia.id,
                        entity_type: 'incidencia',
                        link: `/dashboard/incidencias?id=${selectedDetailIncidencia.id}`,
                        is_read: false
                    });
            }

            // 3. Log de Actividad del Sistema
            await logActivity({
                action: 'update',
                entityType: 'incidencia',
                entityId: selectedDetailIncidencia.id,
                entityName: `Incidencia #${selectedDetailIncidencia.id}`,
                details: {
                    change: 'reasignacion',
                    old_gestor: oldGestorName,
                    new_gestor: newGestorName,
                    by: user.id
                }
            });

            setIsReassigning(false);
            setNewGestorId('');
            setShowReassignSuccessModal(true);

        } catch (error: any) {
            console.error('Error updating gestor:', error);
            toast.error('Error al reasignar gestor');
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
                                href={getSecureUrl(url)}
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
                        disabled={isUpdatingStatus === row.id}
                        title={row.resuelto ? 'Reabrir incidencia' : 'Resolver incidencia'}
                        className={`p-1.5 rounded-full transition-colors ${row.resuelto
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : 'bg-green-100 text-green-600 hover:bg-green-200'
                            } ${isUpdatingStatus === row.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isUpdatingStatus === row.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : row.resuelto ? (
                            <RotateCcw className="w-4 h-4" />
                        ) : (
                            <Check className="w-4 h-4" />
                        )}
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
                                    <p className="mt-1 text-xs text-slate-500">(Sin espacios y sin prefijo)</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Nombre Propietario <span className="text-red-600">*</span></label>
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
                                    isSubmitting ||
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
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Creando ticket...
                                    </>
                                ) : uploading ? (
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
            <DeleteConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setItemToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                itemType="incidencia"
                isDeleting={isDeleting}
            />

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
                    <div className="flex items-center gap-2">
                        <SearchableSelect
                            value={filterComunidad === 'all' ? '' : Number(filterComunidad)}
                            onChange={(val) => setFilterComunidad(val === '' ? 'all' : String(val))}
                            options={comunidades.map(c => ({
                                value: c.id,
                                label: `${c.codigo || ''} - ${c.nombre_cdad}`
                            }))}
                            placeholder="Todas las Comunidades"
                            className="w-[240px]"
                        />
                        <SearchableSelect
                            value={filterGestor === 'all' ? '' : filterGestor}
                            onChange={(val) => setFilterGestor(val === '' ? 'all' : String(val))}
                            options={profiles.map(p => ({
                                value: p.user_id,
                                label: p.nombre
                            }))}
                            placeholder="Todos los Gestores"
                            className="w-[200px]"
                        />
                    </div>
                }
            />

            {/* Detail Modal - Rediseño Administrativo */}
            {showDetailModal && selectedDetailIncidencia && (
                <div
                    className="fixed inset-0 bg-neutral-900/60 z-[100] flex items-center justify-center p-0 sm:p-4 backdrop-blur-md"
                    onClick={() => setShowDetailModal(false)}
                >
                    <div
                        className="bg-white rounded-none sm:rounded-2xl shadow-2xl border border-neutral-200 w-full sm:max-w-4xl h-full sm:h-auto sm:max-h-[92vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Administrative Header */}
                        <div className="px-6 py-5 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50 flex-shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-amber-400 rounded-xl flex items-center justify-center text-neutral-900 shadow-lg shadow-amber-200/50">
                                    <FileText className="w-6 h-6" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xl font-black text-neutral-900 tracking-tight uppercase">
                                            Ticket #{selectedDetailIncidencia.id}
                                        </h3>
                                    </div>
                                    <p className="text-xs text-neutral-500 font-medium mt-0.5 uppercase">
                                        Registrado el {new Date(selectedDetailIncidencia.created_at).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' }).toUpperCase()}
                                        {selectedDetailIncidencia.resuelto && selectedDetailIncidencia.dia_resuelto && (
                                            <> — RESUELTO EL {new Date(selectedDetailIncidencia.dia_resuelto as string).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' }).toUpperCase()} ({selectedDetailIncidencia.resolver?.nombre?.trim().toUpperCase() || 'SISTEMA'})</>
                                        )}
                                    </p>
                                </div>
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
                                <div className="flex bg-white rounded-lg border border-neutral-200 p-1 shadow-sm">
                                    <button
                                        onClick={() => detailFileInputRef.current?.click()}
                                        className="p-2 hover:bg-neutral-50 rounded-md transition-colors text-neutral-400 hover:text-neutral-900 border-r border-neutral-100"
                                        title="Adjuntar documentación"
                                        disabled={isUpdatingRecord}
                                    >
                                        {isUpdatingRecord ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                                    </button>
                                    <button
                                        onClick={() => handleExport('pdf', [selectedDetailIncidencia.id])}
                                        className="p-2 hover:bg-neutral-50 rounded-md transition-colors text-neutral-400 hover:text-neutral-900 border-r border-neutral-100"
                                        title="Generar Informe PDF"
                                        disabled={exporting}
                                    >
                                        {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                    </button>
                                    <button
                                        onClick={() => setShowDetailModal(false)}
                                        className="p-2 hover:bg-red-50 rounded-md transition-colors text-neutral-400 hover:text-red-600"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Navigation / Quick Stats Tab-style Header */}
                        <div className="flex px-6 border-b border-neutral-100 bg-white justify-between items-center overflow-x-auto no-scrollbar min-h-[44px]">
                            <div className="flex space-x-8">
                                {(selectedDetailIncidencia.adjuntos && selectedDetailIncidencia.adjuntos.length > 0) && (
                                    <div className="py-2.5 border-b-2 border-amber-400 text-sm font-bold text-neutral-900 cursor-pointer whitespace-nowrap uppercase tracking-wider">
                                        Documentación ({selectedDetailIncidencia.adjuntos.length})
                                    </div>
                                )}
                            </div>

                            <div className="hidden lg:flex flex-1 items-center justify-between ml-12 pr-4">
                                {/* Estado */}
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Estado</span>
                                    <span className={`text-[10px] font-bold ${selectedDetailIncidencia.resuelto ? 'text-emerald-700' : 'text-amber-700'}`}>
                                        {selectedDetailIncidencia.resuelto ? 'RESUELTO' : 'EN TRÁMITE'}
                                    </span>
                                </div>
                                {/* Prioridad */}
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Prioridad</span>
                                    <span className={`text-[10px] font-bold ${selectedDetailIncidencia.urgencia === 'Alta' ? 'text-red-700' :
                                        selectedDetailIncidencia.urgencia === 'Media' ? 'text-orange-700' :
                                            'text-blue-700'}`}>
                                        {(selectedDetailIncidencia.urgencia || 'ORDINARIA').toUpperCase()}
                                    </span>
                                </div>
                                {/* A. Sentimiento */}
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">A. Sentimiento</span>
                                    <span className="text-[10px] font-bold text-neutral-900 uppercase">
                                        {(selectedDetailIncidencia.sentimiento || 'Neutral').toUpperCase()}
                                    </span>
                                </div>
                                {/* Aviso */}
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Aviso</span>
                                    <span className={`text-[10px] font-bold ${selectedDetailIncidencia.aviso ? 'text-indigo-700' : 'text-neutral-400'}`}>
                                        {selectedDetailIncidencia.aviso && typeof selectedDetailIncidencia.aviso === 'string'
                                            ? selectedDetailIncidencia.aviso.toUpperCase()
                                            : selectedDetailIncidencia.aviso === true ? 'EJECUTADA' : 'PENDIENTE'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Scrollable Content Area */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-neutral-50/30">
                            <div className="p-6 md:p-8 space-y-6">

                                {/* Mobile Status Bar (Show on small screens where header grid is hidden) */}
                                <div className="lg:hidden grid grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Estado</span>
                                        <span className={`text-[10px] font-bold ${selectedDetailIncidencia.resuelto ? 'text-emerald-700' : 'text-amber-700'}`}>
                                            {selectedDetailIncidencia.resuelto ? 'RESUELTO' : 'EN TRÁMITE'}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">Prioridad</span>
                                        <span className={`text-[10px] font-bold ${selectedDetailIncidencia.urgencia === 'Alta' ? 'text-red-700' : 'text-blue-700'}`}>
                                            {(selectedDetailIncidencia.urgencia || 'ORDINARIA').toUpperCase()}
                                        </span>
                                    </div>
                                </div>

                                {/* Main Data Sections */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">

                                    {/* Column 1: Identification & Location */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 border-b-2 border-neutral-900 pb-1.5">
                                            <div className="w-7 h-7 rounded-md bg-neutral-100 flex items-center justify-center text-neutral-600">
                                                <Building className="w-3.5 h-3.5" />
                                            </div>
                                            <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest">Identificación y Ubicación</h4>
                                        </div>

                                        <div className="divide-y divide-neutral-100">
                                            <div className="py-1.5 flex items-center gap-4">
                                                <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Comunidad</span>
                                                <span className="text-sm font-normal text-neutral-900 uppercase">
                                                    {(selectedDetailIncidencia.comunidad || selectedDetailIncidencia.comunidades?.nombre_cdad || 'N/A').toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="py-1.5 flex items-center gap-4">
                                                <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Propietario</span>
                                                <span className="text-sm font-normal text-neutral-900 uppercase">
                                                    {selectedDetailIncidencia.nombre_cliente.toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="py-1.5 flex items-center gap-4">
                                                <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Teléfono</span>
                                                <span className="text-sm font-normal text-neutral-900">
                                                    {selectedDetailIncidencia.telefono}
                                                </span>
                                            </div>
                                            <div className="py-1.5 flex items-center gap-4">
                                                <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Correo</span>
                                                <span className="text-sm font-normal text-neutral-600 uppercase">
                                                    {(selectedDetailIncidencia.email || 'SIN ESPECIFICAR').toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Column 2: Management Info */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 border-b-2 border-neutral-900 pb-1.5">
                                            <div className="w-7 h-7 rounded-md bg-neutral-100 flex items-center justify-center text-neutral-600">
                                                <Users className="w-3.5 h-3.5" />
                                            </div>
                                            <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest">Gestión</h4>
                                        </div>

                                        <div className="divide-y divide-neutral-100">
                                            <div className="py-1.5 flex items-center gap-4">
                                                <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Recepción Inicial</span>
                                                <span className="text-sm font-normal text-neutral-900 uppercase">
                                                    {((selectedDetailIncidencia as any).receptor?.nombre || selectedDetailIncidencia.quien_lo_recibe || 'AUTOMÁTICA').toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="py-1.5 flex items-center gap-4">
                                                <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Respon. Asignado</span>
                                                <div className="flex-1 flex items-center justify-between gap-2">
                                                    {isReassigning ? (
                                                        <div className="flex items-center gap-2 w-full animate-in fade-in slide-in-from-left-2">
                                                            <div className="flex-1">
                                                                <SearchableSelect
                                                                    value={newGestorId}
                                                                    onChange={(val) => setNewGestorId(String(val))}
                                                                    options={profiles.map(p => ({
                                                                        value: p.user_id,
                                                                        label: `${p.nombre} (${p.rol})`
                                                                    }))}
                                                                    placeholder="Nuevo gestor..."
                                                                    className="text-xs"
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={handleUpdateGestor}
                                                                disabled={!newGestorId || isUpdatingGestor}
                                                                className="p-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                title="Guardar cambios"
                                                            >
                                                                {isUpdatingGestor ? (
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                ) : (
                                                                    <Save className="w-3.5 h-3.5" />
                                                                )}
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setIsReassigning(false);
                                                                    setNewGestorId('');
                                                                }}
                                                                disabled={isUpdatingGestor}
                                                                className="p-1.5 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                title="Cancelar"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <span className="text-sm font-normal text-neutral-900 uppercase">
                                                                {((selectedDetailIncidencia as any).gestor?.nombre || selectedDetailIncidencia.gestor_asignado || 'PENDIENTE').toUpperCase()}
                                                            </span>
                                                            <button
                                                                onClick={() => {
                                                                    setNewGestorId(selectedDetailIncidencia.gestor_asignado || '');
                                                                    setIsReassigning(true);
                                                                }}
                                                                className="ml-2 p-1.5 bg-yellow-400 hover:bg-yellow-500 text-neutral-950 rounded-md border border-yellow-500 shadow-sm transition-all"
                                                                title="Reasignar gestor"
                                                            >
                                                                <UserCog className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="py-1.5 flex items-center gap-4">
                                                <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Urgencia</span>
                                                <span className="text-sm font-normal text-neutral-900 uppercase">
                                                    {(selectedDetailIncidencia.urgencia || 'Media').toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="py-1.5 flex items-center gap-4">
                                                <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Clasificación</span>
                                                <span className="text-sm font-normal text-neutral-900 uppercase">
                                                    {(selectedDetailIncidencia.categoria || 'INCIDENCIAS').toUpperCase()}
                                                </span>
                                            </div>
                                            {/* Resolution rows removed from here as they are now in the header */}
                                        </div>
                                    </div>
                                </div>

                                {/* Report Description Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center border-b-2 border-neutral-900 pb-2">
                                        <h4 className="text-sm font-black text-neutral-900 uppercase tracking-[0.2em]">Mensaje</h4>
                                    </div>
                                    <div className="py-2">
                                        <p className="text-neutral-800 text-base leading-relaxed font-normal text-justify uppercase">
                                            {selectedDetailIncidencia.mensaje.toUpperCase()}
                                        </p>
                                    </div>
                                </div>

                                {/* Documentation Section */}
                                {(selectedDetailIncidencia.adjuntos && selectedDetailIncidencia.adjuntos.length > 0) && (
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest border-l-4 border-neutral-900 pl-4">Anexos y Documentación Adjunta</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {selectedDetailIncidencia.adjuntos.map((url: string, i: number) => (
                                                <a
                                                    key={i}
                                                    href={getSecureUrl(url)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="group flex items-center justify-between bg-white border border-neutral-200 p-4 rounded-xl hover:border-neutral-900 transition-all shadow-sm"
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
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Audit Log / Timeline */}
                                <div className="space-y-4 pt-10">
                                    <div className="flex items-center border-b-2 border-neutral-900 pb-2 mb-6">
                                        <h4 className="text-sm font-black text-neutral-900 uppercase tracking-[0.2em]">Chat de Gestores</h4>
                                    </div>
                                    <div className="overflow-hidden">
                                        <TimelineChat
                                            entityType="incidencia"
                                            entityId={selectedDetailIncidencia.id}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Administrative Footer Actions */}
                        <div className="px-6 py-4 border-t border-neutral-100 bg-white flex flex-col sm:flex-row justify-between items-center gap-4 flex-shrink-0">
                            <button
                                onClick={() => {
                                    handleDeleteClick(selectedDetailIncidencia.id);
                                    setShowDetailModal(false);
                                }}
                                className="flex items-center gap-2 text-neutral-400 hover:text-red-600 transition-all font-bold text-xs uppercase tracking-widest px-4 py-2 hover:bg-red-50 rounded-lg"
                            >
                                <Trash2 className="w-4 h-4" />
                                <span>Eliminar Registro del Sistema</span>
                            </button>

                            <div className="flex items-center gap-3 w-full sm:w-auto">
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
                                    className={`flex-1 sm:flex-none h-12 px-8 rounded-xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-lg flex items-center justify-center gap-3 ${selectedDetailIncidencia.resuelto
                                        ? 'bg-white border-2 border-neutral-900 text-neutral-900 hover:bg-neutral-50'
                                        : 'bg-amber-400 text-neutral-900 hover:bg-amber-500 shadow-amber-200/50'
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
                                            RESOLVER TICKET
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Reassign Success Modal */}
            {showReassignSuccessModal && (
                <div
                    className="fixed inset-0 bg-neutral-900/60 z-[110] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 relative flex flex-col items-center text-center animate-in zoom-in-95 duration-200"
                    >
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                            <Check className="w-8 h-8 text-green-600" />
                        </div>
                        <h3 className="text-xl font-bold text-neutral-900 mb-2">
                            Gestor Reasignado
                        </h3>
                        <p className="text-neutral-500 mb-6">
                            La incidencia ha sido reasignada al nuevo gestor correctamente.
                        </p>
                        <button
                            onClick={() => setShowReassignSuccessModal(false)}
                            className="w-full py-3 bg-neutral-900 hover:bg-black text-white rounded-xl font-bold transition-transform active:scale-[0.98]"
                        >
                            Aceptar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

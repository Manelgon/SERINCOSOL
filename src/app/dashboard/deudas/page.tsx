
'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { Plus, FileText, Check, Trash2, X, RotateCcw, Paperclip, Download, Loader2, Users, RotateCcw as RotateCcwIcon } from 'lucide-react';
import DeleteConfirmationModal from '@/components/DeleteConfirmationModal';
import DataTable, { Column } from '@/components/DataTable';
import SearchableSelect from '@/components/SearchableSelect';
import { logActivity } from '@/lib/logActivity';
import TimelineChat from '@/components/TimelineChat';
import { getSecureUrl } from '@/lib/storage';

interface Morosidad {
    id: number;
    comunidad_id: number;
    nombre_deudor: string;
    apellidos: string;
    telefono_deudor: string;
    email_deudor: string;
    titulo_documento: string;
    fecha_notificacion: string;
    importe: number;
    observaciones: string;
    ref?: string;
    estado: 'Pendiente' | 'Pagado' | 'En disputa';
    fecha_pago: string;
    gestor: string;
    aviso?: string | null;
    id_email_deuda?: string;
    documento: string;
    created_at: string;
    comunidades?: { nombre_cdad: string; codigo?: string };
    resuelto_por?: string;
    fecha_resuelto?: string;
    resolver?: { nombre: string };
}

export default function MorosidadPage() {
    const [morosos, setMorosos] = useState<Morosidad[]>([]);
    const [comunidades, setComunidades] = useState<any[]>([]);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteEmail, setDeleteEmail] = useState('');
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [filterEstado, setFilterEstado] = useState('pendiente');
    const [filterGestor, setFilterGestor] = useState('all');
    const [filterComunidad, setFilterComunidad] = useState('all');

    // Detail Modal State
    const [selectedDetailMorosidad, setSelectedDetailMorosidad] = useState<Morosidad | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const [isUpdatingRecord, setIsUpdatingRecord] = useState(false);
    const detailFileInputRef = useRef<HTMLInputElement>(null);

    // PDF Notes Modal State
    const [showExportModal, setShowExportModal] = useState(false);
    const [pendingExportParams, setPendingExportParams] = useState<{ type: 'csv' | 'pdf', ids?: number[], includeNotes?: boolean } | null>(null);

    // Selection & Export
    const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
    const [exporting, setExporting] = useState(false);
    const [enviarNotificacion, setEnviarNotificacion] = useState<boolean | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<number | null>(null);

    const handleRowClick = (morosidad: Morosidad) => {
        setSelectedDetailMorosidad(morosidad);
        setShowDetailModal(true);
    };

    const [formData, setFormData] = useState({
        comunidad_id: '',
        nombre_deudor: '',
        apellidos: '',
        telefono_deudor: '',
        email_deudor: '',
        titulo_documento: '',
        fecha_notificacion: '',
        importe: '',
        observaciones: '',
        gestor: '',
        documento: '',
        aviso: null as string | null,
        id_email_deuda: '',
    });

    const [file, setFile] = useState<File | null>(null);

    useEffect(() => {
        fetchInitialData();

        // Subscribe to real-time changes
        const channel = supabase
            .channel('morosidad-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'morosidad' },
                () => {
                    fetchMorosidad();
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
        await Promise.all([fetchComunidades(), fetchMorosidad(), fetchProfiles()]);
        setLoading(false);
    };

    const fetchComunidades = async () => {
        const { data } = await supabase.from('comunidades').select('id, nombre_cdad, codigo, direccion').eq('activo', true);
        if (data) setComunidades(data);
    };

    const fetchProfiles = async () => {
        const { data } = await supabase.from('profiles').select('user_id, nombre, rol').eq('activo', true);
        if (data) setProfiles(data);
    };

    const fetchMorosidad = async () => {
        const { data, error } = await supabase
            .from('morosidad')
            .select(`
                *,
                comunidades (nombre_cdad, codigo),
                resolver:profiles!resuelto_por (nombre)
            `)
            .order('created_at', { ascending: false });

        if (error) {
            toast.error('Error cargando registros');
        } else {
            setMorosos(data || []);
        }
    };

    const handleFileUpload = async (file: File) => {
        try {
            setUploading(true);
            const formData = new FormData();
            formData.append('file', file);
            formData.append('path', 'morosidad');
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
            return data.publicUrl;
        } catch (error: any) {
            toast.error('Error subiendo archivo: ' + error.message);
            console.error(error);
            return null;
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.comunidad_id) return toast.error('Selecciona una comunidad');

        // Regex Validation
        const phoneRegex = /^\d{9}$/;

        if (isSubmitting) return;

        // Manual Validation
        if (!formData.comunidad_id) return toast.error('Debe seleccionar una Comunidad');
        if (!formData.nombre_deudor) return toast.error('Debe indicar el Nombre del Deudor');
        if (!formData.titulo_documento) return toast.error('Debe seleccionar un Título del Documento');
        if (!formData.fecha_notificacion) return toast.error('Debe indicar la Fecha de Notificación');
        if (!formData.importe) return toast.error('Debe indicar el Importe');
        if (enviarNotificacion === null) return toast.error('Debe seleccionar si desea enviar notificación al propietario');

        if (enviarNotificacion === true && !formData.telefono_deudor && !formData.email_deudor) {
            return toast.error('Para enviar aviso debe proporcionar Teléfono o Email');
        }

        if (formData.telefono_deudor && !/^\d{9}$/.test(formData.telefono_deudor)) {
            return toast.error('El teléfono debe tener 9 dígitos numéricos');
        }

        if (formData.email_deudor && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email_deudor)) {
            return toast.error('El formato del email no es válido');
        }

        setIsSubmitting(true);
        const loadingToastId = toast.loading(editingId ? 'Actualizando deuda...' : 'Guardando deuda... espere');

        let docUrl = formData.documento;
        if (file) {
            const url = await handleFileUpload(file);
            if (!url) return;
            docUrl = url;
        }

        if (editingId) {
            // Update existing
            try {
                const { error } = await supabase.from('morosidad').update({
                    ...formData,
                    comunidad_id: parseInt(formData.comunidad_id),
                    importe: parseFloat(formData.importe.toString().replace(',', '.')),
                    documento: docUrl,
                    id_email_deuda: formData.id_email_deuda || null,
                    gestor: formData.gestor || null,
                }).eq('id', editingId);

                if (error) throw error;

                toast.success('Registro actualizado');

                // Log activity
                const comunidad = comunidades.find(c => c.id === parseInt(formData.comunidad_id));
                await logActivity({
                    action: 'update',
                    entityType: 'morosidad',
                    entityId: editingId,
                    entityName: `${formData.nombre_deudor} ${formData.apellidos}`,
                    details: {
                        comunidad: comunidad?.nombre_cdad,
                        importe: formData.importe,
                        estado: formData.importe // Note: keeping state management simple, though update usually implies changes
                    }
                });

                setShowForm(false);
                setEditingId(null);
                setFormData({
                    comunidad_id: '',
                    nombre_deudor: '',
                    apellidos: '',
                    telefono_deudor: '',
                    email_deudor: '',
                    titulo_documento: '',
                    fecha_notificacion: '',
                    importe: '',
                    observaciones: '',
                    gestor: '',
                    documento: '',
                    aviso: null,
                    id_email_deuda: '',
                });
                setFile(null);
                fetchMorosidad();
            } catch (error: any) {
                toast.error('Error al actualizar: ' + error.message);
            } finally {
                toast.dismiss(loadingToastId);
                setIsSubmitting(false);
            }
        } else {
            // Create new
            try {
                // Generate automatic Ref
                const now = new Date();
                const timestamp = now.getFullYear().toString() +
                    (now.getMonth() + 1).toString().padStart(2, '0') +
                    now.getDate().toString().padStart(2, '0') + '-' +
                    now.getHours().toString().padStart(2, '0') +
                    now.getMinutes().toString().padStart(2, '0') +
                    now.getSeconds().toString().padStart(2, '0');
                const initials = (formData.nombre_deudor || '').substring(0, 3).toUpperCase();
                const autoRef = `DEV-${timestamp}-${initials}`;

                const { data: newDebt, error } = await supabase.from('morosidad').insert([{
                    ...formData,
                    comunidad_id: parseInt(formData.comunidad_id),
                    importe: parseFloat(formData.importe.replace(',', '.')),
                    documento: docUrl,
                    id_email_deuda: formData.id_email_deuda || null,
                    gestor: formData.gestor || null,
                    ref: autoRef || null,
                }]).select().single();

                if (error) throw error;

                toast.success('Registro de morosidad creado');

                // Log activity
                const comunidad = comunidades.find(c => c.id === parseInt(formData.comunidad_id));
                await logActivity({
                    action: 'create',
                    entityType: 'morosidad',
                    entityId: newDebt.id,
                    entityName: `${formData.nombre_deudor} ${formData.apellidos}`,
                    details: {
                        comunidad: comunidad?.nombre_cdad,
                        importe: formData.importe,
                        concepto: formData.titulo_documento
                    }
                });

                const gestorProfile = profiles.find(p => p.user_id === formData.gestor);

                // Trigger Webhook (Fire and forget, don't block UI)
                const webhookPayload = new FormData();
                Object.entries(formData).forEach(([key, value]) => {
                    webhookPayload.append(key, value || '');
                });
                webhookPayload.append('id', newDebt.id.toString());
                webhookPayload.append('comunidad_nombre', comunidad?.nombre_cdad || '');
                webhookPayload.append('comunidad_codigo', comunidad?.codigo || '');
                webhookPayload.append('comunidad_direccion', comunidad?.direccion || '');
                webhookPayload.append('gestor_nombre', gestorProfile?.nombre || 'Desconocido');
                webhookPayload.append('documento_url', docUrl || '');
                webhookPayload.append('notificacion', enviarNotificacion ? 'true' : 'false');

                const count = file ? 1 : 0;
                webhookPayload.append('adjuntos_count', count.toString());

                if (file) {
                    webhookPayload.append('adjunto', file);
                }

                fetch('/api/webhooks/trigger-debt', {
                    method: 'POST',
                    body: webhookPayload
                }).catch(err => console.error('Webhook trigger error:', err));

                setShowForm(false);
                setFormData({
                    comunidad_id: '',
                    nombre_deudor: '',
                    apellidos: '',
                    telefono_deudor: '',
                    email_deudor: '',
                    titulo_documento: '',
                    fecha_notificacion: '',
                    importe: '',
                    observaciones: '',
                    gestor: '',
                    documento: '',
                    aviso: null,
                    id_email_deuda: '',
                });
                setEnviarNotificacion(null);
                setFile(null);
                fetchMorosidad();
            } catch (error: any) {
                toast.error('Error: ' + error.message);
            } finally {
                toast.dismiss(loadingToastId);
                setIsSubmitting(false);
            }
        }
    };

    const handleDetailFileUpload = async (file: File) => {
        if (!selectedDetailMorosidad) return;

        setIsUpdatingRecord(true);
        const loadingToast = toast.loading('Subiendo archivo...');

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('path', 'morosidad');
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
            const docUrl = data.publicUrl;

            const { error: updateError } = await supabase
                .from('morosidad')
                .update({ documento: docUrl })
                .eq('id', selectedDetailMorosidad.id);

            if (updateError) throw updateError;

            setSelectedDetailMorosidad({
                ...selectedDetailMorosidad,
                documento: docUrl
            });

            setMorosos(prev => prev.map(m => m.id === selectedDetailMorosidad.id ? { ...m, documento: docUrl } : m));

            toast.success('Documento actualizado', { id: loadingToast });
        } catch (error: any) {
            console.error(error);
            toast.error('Error al subir archivo', { id: loadingToast });
        } finally {
            setIsUpdatingRecord(false);
        }
    };

    const markAsPaid = async (id: number) => {
        if (isUpdatingStatus === id) return;
        setIsUpdatingStatus(id);
        try {
            const moroso = morosos.find(m => m.id === id);
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase
                .from('morosidad')
                .update({
                    estado: 'Pagado',
                    fecha_pago: new Date().toISOString(),
                    resuelto_por: user?.id,
                    fecha_resuelto: new Date().toISOString()
                })
                .eq('id', id);

            if (error) throw error;

            toast.success('Marcado como pagado');

            // Trigger Resolved Webhook
            setTimeout(() => {
                try {
                    // Destructure to exclude the nested comunidades object
                    const { comunidades: _cdad, ...morosoData } = moroso || {};

                    fetch('/api/webhooks/trigger-resolved-debt', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: id,
                            // Backend fetches full details to ensure freshness and security
                        })
                    }).catch(e => console.error('Resolved Debt Webhook Error:', e));
                } catch (e) {
                    console.error('Resolved Debt Webhook Trigger Error:', e);
                }
            }, 2000);

            // Log activity
            await logActivity({
                action: 'mark_paid',
                entityType: 'morosidad',
                entityId: id,
                entityName: `${moroso?.nombre_deudor} ${moroso?.apellidos}`,
                details: {
                    comunidad: moroso?.comunidades?.nombre_cdad,
                    importe: moroso?.importe
                }
            });

            fetchMorosidad();
        } catch (error) {
            console.error(error);
            toast.error('Error al actualizar');
        } finally {
            setIsUpdatingStatus(null);
        }
    };

    const handleDeleteClick = (id: number) => {
        setDeleteId(id);
        setShowDeleteModal(true);
        setDeletePassword('');
    };

    const handleConfirmDelete = async ({ email, password }: any) => {
        if (deleteId === null || !email || !password) return;

        setIsDeleting(true);

        try {
            const res = await fetch('/api/admin/universal-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: deleteId,
                    email,
                    password,
                    type: 'morosidad'
                })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Error al eliminar');

            toast.success('Registro eliminado');
            setMorosos(prev => prev.filter(m => m.id !== deleteId));

            // Log activity
            const deleted = morosos.find(m => m.id === deleteId);
            await logActivity({
                action: 'delete',
                entityType: 'morosidad',
                entityId: deleteId,
                entityName: `${deleted?.nombre_deudor} ${deleted?.apellidos}`,
                details: {
                    comunidad: deleted?.comunidades?.nombre_cdad,
                    importe: deleted?.importe,
                    deleted_by_admin: email
                }
            });

            setShowDeleteModal(false);
            setDeleteId(null);
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleExport = async (type: 'csv' | 'pdf', idsOverride?: number[], includeNotesFromModal?: boolean) => {
        const idsToExport = (idsOverride || Array.from(selectedIds)).map(Number);
        if (idsToExport.length === 0) return;

        // If overriding IDs (from modal), imply detail view if single item
        const isDetailView = !!idsOverride && idsToExport.length === 1 && type === 'pdf';

        // Custom Modal Logic
        if (isDetailView && includeNotesFromModal === undefined) {
            setPendingExportParams({ type, ids: idsToExport });
            setShowExportModal(true);
            return;
        }

        const includeNotes = includeNotesFromModal !== undefined ? includeNotesFromModal : false;

        setExporting(true);
        try {
            const res = await fetch('/api/morosidad/export', {
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
                // "DEV_id_fecha"
                a.download = `DEV_${idsToExport[0]}_${dateStr}.pdf`;
            } else {
                a.download = `listado_deudas_${dateStr}.${type === 'csv' ? 'csv' : 'pdf'}`;
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

    const handleEdit = (moroso: Morosidad) => {
        setEditingId(moroso.id);
        setFormData({
            comunidad_id: moroso.comunidad_id.toString(),
            nombre_deudor: moroso.nombre_deudor,
            apellidos: moroso.apellidos || '',
            telefono_deudor: moroso.telefono_deudor || '',
            email_deudor: moroso.email_deudor || '',
            titulo_documento: moroso.titulo_documento,
            fecha_notificacion: moroso.fecha_notificacion ? moroso.fecha_notificacion.split('T')[0] : '',
            importe: moroso.importe.toString(),
            observaciones: moroso.observaciones || '',
            gestor: moroso.gestor || '',
            documento: moroso.documento || '',
            aviso: moroso.aviso || null,
            id_email_deuda: moroso.id_email_deuda || '',
        });
        setShowForm(true);
    };

    const columns: Column<Morosidad>[] = [
        {
            key: 'id',
            label: 'ID',
        },
        {
            key: 'ref',
            label: 'Ref',
            render: (row) => <span className="font-medium text-slate-600">{row.ref || '-'}</span>,
        },
        {
            key: 'codigo',
            label: 'Código',
            render: (row) => (
                <div className="flex items-start gap-3">
                    <span className={`mt-1 h-3.5 w-1.5 rounded-full ${row.estado === 'Pendiente' ? 'bg-yellow-400' : 'bg-neutral-900'}`} />
                    <span className="font-semibold">{row.comunidades?.codigo || '-'}</span>
                </div>
            ),
        },
        {
            key: 'comunidades',
            label: 'Comunidad',
            render: (row) => row.comunidades?.nombre_cdad || '-',
        },
        {
            key: 'nombre_deudor',
            label: 'Nombre',
        },
        {
            key: 'apellidos',
            label: 'Apellidos',
            defaultVisible: false,
        },
        {
            key: 'telefono_deudor',
            label: 'Teléfono',
            defaultVisible: false,
        },
        {
            key: 'email_deudor',
            label: 'Email',
            defaultVisible: false,
        },
        {
            key: 'titulo_documento',
            label: 'Concepto',
        },
        {
            key: 'documento',
            label: 'Adjuntos',
            render: (row) => (
                <div className="flex justify-center">
                    {row.documento ? (
                        <a
                            href={getSecureUrl(row.documento)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-full bg-yellow-50 text-yellow-600 hover:bg-yellow-100 transition-colors"
                            title="Ver Documento"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <FileText className="w-4 h-4" />
                        </a>
                    ) : (
                        <span className="text-slate-400">-</span>
                    )}
                </div>
            ),
        },
        {
            key: 'importe',
            label: 'Importe',
            render: (row) => <span className="font-bold">{row.importe}€</span>,
        },
        {
            key: 'observaciones',
            label: 'Observaciones',
            render: (row) => (
                <div className="max-w-xs truncate" title={row.observaciones}>
                    {row.observaciones || '-'}
                </div>
            ),
            defaultVisible: false,
        },
        {
            key: 'estado',
            label: 'Estado',
            render: (row) => (
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${row.estado === 'Pagado' ? 'bg-neutral-900 text-white' :
                    row.estado === 'En disputa' ? 'bg-neutral-200 text-neutral-900' :
                        'bg-yellow-400 text-neutral-950'
                    }`}>
                    {row.estado}
                </span>
            ),
        },
        {
            key: 'aviso',
            label: 'Aviso',
            defaultVisible: false,
        },
        {
            key: 'fecha_notificacion',
            label: 'Fecha Notificación',
            render: (row) => row.fecha_notificacion ? new Date(row.fecha_notificacion).toLocaleDateString() : '-',
            defaultVisible: false,
        },
        {
            key: 'gestor',
            label: 'Gestor',
            // Lookup name from profiles if gestor contains a UUID
            render: (row) => {
                if (!row.gestor) return '-';
                const p = profiles.find(p => p.user_id === row.gestor);
                // If found, show name. If not found (maybe legacy data or deleted), show raw value or fallback
                return p ? p.nombre : (row.gestor.length > 20 ? 'Usuario desconocido' : row.gestor);
            },
            defaultVisible: false,
        },
        {
            key: 'fecha_pago',
            label: 'Fecha Pago',
            render: (row) => row.fecha_pago ? new Date(row.fecha_pago).toLocaleDateString() : '-',
            defaultVisible: false,
        },
        {
            key: 'resuelto_por',
            label: 'Resuelto Por',
            render: (row) => row.resolver?.nombre || '-',
            defaultVisible: false,
        },
        {
            key: 'created_at',
            label: 'Fecha Creación',
            render: (row) => new Date(row.created_at).toLocaleDateString(),
            defaultVisible: false,
        },
        {
            key: 'fecha_resuelto',
            label: 'Fecha Resuelto',
            render: (row) => row.fecha_resuelto ? new Date(row.fecha_resuelto).toLocaleDateString() : '-',
            defaultVisible: false,
        },
        {
            key: 'actions',
            label: 'Acciones',
            sortable: false,
            render: (row) => (
                <div className="flex items-center gap-1">
                    {row.estado !== 'Pagado' && (
                        <button
                            onClick={() => handleEdit(row)}
                            className="p-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                            title="Editar"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                    )}
                    {row.estado !== 'Pagado' && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                markAsPaid(row.id);
                            }}
                            disabled={isUpdatingStatus === row.id}
                            className={`p-1.5 rounded-full transition-colors ${isUpdatingStatus === row.id
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-green-100 text-green-600 hover:bg-green-200'
                                }`}
                            title="Marcar como Pagado"
                        >
                            {isUpdatingStatus === row.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Check className="w-4 h-4" />
                            )}
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(row.id);
                        }}
                        className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                        title="Eliminar"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ),
        },
    ];

    const filteredMorosidad = morosos.filter(m => {
        const matchesEstado = filterEstado === 'pendiente' ? m.estado !== 'Pagado' :
            filterEstado === 'resuelto' ? m.estado === 'Pagado' : true;

        const matchesGestor = filterGestor === 'all' ? true : m.gestor === filterGestor;
        const matchesComunidad = filterComunidad === 'all' ? true : m.comunidad_id === Number(filterComunidad);

        return matchesEstado && matchesGestor && matchesComunidad;
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center gap-4">
                <h1 className="text-xl font-bold text-neutral-900">Gestión de Deudas</h1>
                <button
                    onClick={() => {
                        setShowForm(!showForm);
                        if (showForm) {
                            setEditingId(null);
                            setFormData({
                                comunidad_id: '',
                                nombre_deudor: '',
                                apellidos: '',
                                telefono_deudor: '',
                                email_deudor: '',
                                titulo_documento: '',
                                fecha_notificacion: '',
                                importe: '',
                                observaciones: '',
                                gestor: '',
                                documento: '',
                                aviso: null,
                                id_email_deuda: '',
                            });
                        }
                    }}
                    className="bg-yellow-400 hover:bg-yellow-500 text-neutral-950 px-4 py-2 rounded-md flex items-center gap-2 transition font-semibold text-sm"
                >
                    <Plus className={`w-4 h-4 ${showForm ? 'rotate-45' : ''} transition-transform`} />
                    {showForm ? 'Cancelar' : 'Registrar Deuda'}
                </button>
            </div>

            {/* Filters */}
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
                                {editingId ? 'Editar Registro de Deuda' : 'Registrar Nueva Deuda'}
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
                            <form id="morosidad-form" onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Comunidad <span className="text-red-600">*</span></label>
                                    <SearchableSelect
                                        value={formData.comunidad_id}
                                        onChange={(val) => setFormData({ ...formData, comunidad_id: String(val) })}
                                        options={comunidades.map(cd => ({
                                            value: String(cd.id),
                                            label: cd.codigo ? `${cd.codigo} - ${cd.nombre_cdad}` : cd.nombre_cdad
                                        }))}
                                        placeholder="Selecciona una comunidad..."
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Nombre Deudor <span className="text-red-600">*</span></label>
                                    <input
                                        type="text"
                                        placeholder="Ej: Juan"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                                        value={formData.nombre_deudor}
                                        onChange={e => setFormData({ ...formData, nombre_deudor: e.target.value })}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Apellidos</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: García Pérez"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                                        value={formData.apellidos}
                                        onChange={e => setFormData({ ...formData, apellidos: e.target.value })}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                                        Teléfono {enviarNotificacion && !formData.email_deudor && <span className="text-red-600">*</span>}
                                    </label>
                                    <input
                                        type="tel"
                                        placeholder="Ej: 600000000"
                                        className={`w-full rounded-lg border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 ${enviarNotificacion && !formData.telefono_deudor && !formData.email_deudor ? 'border-red-300' : 'border-slate-200'}`}
                                        value={formData.telefono_deudor}
                                        onChange={e => setFormData({ ...formData, telefono_deudor: e.target.value })}
                                        disabled={isSubmitting}
                                    />
                                    <p className="mt-1 text-xs text-slate-500">(Sin espacios y sin prefijo)</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                                        Email {enviarNotificacion && !formData.telefono_deudor && <span className="text-red-600">*</span>}
                                    </label>
                                    <input
                                        type="email"
                                        placeholder="ejemplo@correo.com"
                                        className={`w-full rounded-lg border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 ${enviarNotificacion && !formData.email_deudor && !formData.telefono_deudor ? 'border-red-300' : 'border-slate-200'}`}
                                        value={formData.email_deudor}
                                        onChange={e => setFormData({ ...formData, email_deudor: e.target.value })}
                                        disabled={isSubmitting}
                                    />
                                </div>



                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Título del Documento <span className="text-red-600">*</span></label>
                                    <SearchableSelect
                                        value={formData.titulo_documento}
                                        onChange={(val) => setFormData({ ...formData, titulo_documento: String(val) })}
                                        options={[
                                            { value: 'Recibo Comunidad', label: 'Recibo comunidad' }
                                        ]}
                                        placeholder="Selecciona un tipo..."
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Fecha de Notificación <span className="text-red-600">*</span></label>
                                    <input
                                        type="date"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                                        value={formData.fecha_notificacion}
                                        onChange={e => setFormData({ ...formData, fecha_notificacion: e.target.value })}
                                        disabled={isSubmitting}
                                    />
                                </div>


                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Importe (€) <span className="text-red-600">*</span></label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0,00"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                                        value={formData.importe}
                                        onChange={e => {
                                            // Permitimos números y comas/puntos
                                            const val = e.target.value.replace(',', '.');
                                            if (/^\d*\.?\d*$/.test(val) || val === '') {
                                                setFormData({ ...formData, importe: e.target.value });
                                            }
                                        }}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Gestor</label>
                                    <SearchableSelect
                                        value={formData.gestor}
                                        onChange={(val) => setFormData({ ...formData, gestor: String(val) })}
                                        options={profiles.map(profile => ({
                                            value: profile.user_id,
                                            label: `${profile.nombre} (${profile.rol})`
                                        }))}
                                        placeholder="Selecciona un gestor..."
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                                        Enviar notificación al propietario <span className="text-red-600">*</span>
                                    </label>
                                    <div className="flex items-center gap-6 mt-2">
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="radio"
                                                name="enviarNotificacion"
                                                checked={enviarNotificacion === true}
                                                onChange={() => setEnviarNotificacion(true)}
                                                className="w-4 h-4 text-slate-900 border-slate-300 focus:ring-slate-900/20"
                                                disabled={isSubmitting}
                                            />
                                            <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">Sí</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="radio"
                                                name="enviarNotificacion"
                                                checked={enviarNotificacion === false}
                                                onChange={() => setEnviarNotificacion(false)}
                                                className="w-4 h-4 text-slate-900 border-slate-300 focus:ring-slate-900/20"
                                                disabled={isSubmitting}
                                            />
                                            <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">No</span>
                                        </label>
                                    </div>
                                    {enviarNotificacion === true && !formData.email_deudor && !formData.telefono_deudor && (
                                        <p className="mt-1 text-xs text-red-500">Debe indicar email o teléfono para enviar la notificación</p>
                                    )}
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Observaciones</label>
                                    <textarea
                                        rows={3}
                                        placeholder="Notas adicionales..."
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 min-h-[120px] resize-y"
                                        value={formData.observaciones}
                                        onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Documento Adjunto (Opcional)</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="file"
                                            className="block w-full text-sm text-slate-500
                                                file:mr-4 file:py-2 file:px-4
                                                file:rounded-full file:border-0
                                                file:text-sm file:font-semibold
                                                file:bg-slate-100 file:text-slate-700
                                                hover:file:bg-slate-200 cursor-pointer"
                                            onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                                            disabled={isSubmitting}
                                        />
                                        {uploading && <span className="text-sm text-slate-600 animate-pulse">Subiendo...</span>}
                                    </div>
                                </div>
                            </form>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100">
                            <button
                                form="morosidad-form"
                                type="submit"
                                disabled={isSubmitting || uploading}
                                className="w-full sm:w-auto h-12 px-8 bg-yellow-400 hover:bg-yellow-500 text-neutral-950 rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm hover:shadow-md active:scale-[0.98]"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Guardando...
                                    </>
                                ) : uploading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Registrando...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-5 h-5" />
                                        {editingId ? 'Guardar Cambios' : 'Registrar Deuda'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}



            {(() => {
                return (
                    <>
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
                            data={filteredMorosidad}
                            columns={columns}
                            keyExtractor={(row) => row.id}
                            storageKey="morosidad"
                            loading={loading}
                            emptyMessage="No hay registros de morosidad en esta vista"
                            onRowClick={handleRowClick}
                            selectable={true}
                            selectedKeys={selectedIds}
                            onSelectionChange={(keys) => setSelectedIds(keys)}
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
                    </>
                );
            })()}

            {/* Delete Confirmation Modal */}
            <DeleteConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setDeleteId(null);
                }}
                onConfirm={handleConfirmDelete}
                itemType="registro de deuda"
                isDeleting={isDeleting}
            />

            {/* Detail Modal - Rediseño Administrativo */}
            {showDetailModal && selectedDetailMorosidad && (
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
                                            Deuda #{selectedDetailMorosidad.id}
                                        </h3>
                                    </div>
                                    <p className="text-xs text-neutral-500 font-medium mt-0.5 uppercase">
                                        Registrado el {new Date(selectedDetailMorosidad.created_at).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' }).toUpperCase()}
                                        {selectedDetailMorosidad.estado === 'Pagado' && selectedDetailMorosidad.fecha_resuelto && (
                                            <> — PAGADO EL {new Date(selectedDetailMorosidad.fecha_resuelto).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' }).toUpperCase()} ({selectedDetailMorosidad.resolver?.nombre?.trim().toUpperCase() || 'SISTEMA'})</>
                                        )}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="file"
                                    className="hidden"
                                    ref={detailFileInputRef}
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files.length > 0) {
                                            handleDetailFileUpload(e.target.files[0]);
                                        }
                                    }}
                                />
                                <div className="flex bg-white rounded-lg border border-neutral-200 p-1 shadow-sm">
                                    <button
                                        onClick={() => detailFileInputRef.current?.click()}
                                        className="p-2 hover:bg-neutral-50 rounded-md transition-colors text-neutral-400 hover:text-neutral-900 border-r border-neutral-100"
                                        title="Actualizar documento"
                                        disabled={isUpdatingRecord}
                                    >
                                        {isUpdatingRecord ? <Loader2 className="w-5 h-5 animate-spin text-neutral-600" /> : <Paperclip className="w-5 h-5" />}
                                    </button>
                                    <button
                                        onClick={() => handleExport('pdf', [selectedDetailMorosidad.id])}
                                        className="p-2 hover:bg-neutral-50 rounded-md transition-colors text-neutral-400 hover:text-neutral-900 border-r border-neutral-100"
                                        title="Descargar PDF"
                                        disabled={exporting}
                                    >
                                        {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                    </button>
                                    <button
                                        onClick={() => setShowDetailModal(false)}
                                        className="p-2 hover:bg-neutral-50 rounded-md transition-colors text-neutral-400 hover:text-red-500"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="p-4 sm:p-6 space-y-8 flex-1 overflow-y-auto custom-scrollbar bg-neutral-50/30">
                            {/* Main Data Sections */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                {/* Left Column: Deudor Info */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b-2 border-neutral-900 pb-1.5">
                                        <div className="w-7 h-7 rounded-md bg-neutral-100 flex items-center justify-center text-neutral-600">
                                            <Users className="w-3.5 h-3.5" />
                                        </div>
                                        <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest">Información del Deudor</h4>
                                    </div>

                                    <div className="divide-y divide-neutral-100">
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Nombre</span>
                                            <span className="text-sm font-normal text-neutral-900 uppercase">{selectedDetailMorosidad.nombre_deudor.toUpperCase()}</span>
                                        </div>
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Apellidos</span>
                                            <span className="text-sm font-normal text-neutral-900 uppercase">{selectedDetailMorosidad.apellidos?.toUpperCase() || '-'}</span>
                                        </div>
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Teléfono</span>
                                            <span className="text-sm font-normal text-neutral-900">{selectedDetailMorosidad.telefono_deudor || '-'}</span>
                                        </div>
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Email</span>
                                            <span className="text-sm font-normal text-neutral-600 uppercase">{(selectedDetailMorosidad.email_deudor || 'SIN ESPECIFICAR').toUpperCase()}</span>
                                        </div>
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Comunidad</span>
                                            <span className="text-sm font-normal text-neutral-900 uppercase">{(selectedDetailMorosidad.comunidades?.nombre_cdad || '-').toUpperCase()}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Gestión */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b-2 border-neutral-900 pb-1.5">
                                        <div className="w-7 h-7 rounded-md bg-neutral-100 flex items-center justify-center text-neutral-600">
                                            <div className="w-3.5 h-3.5 bg-neutral-600 rounded-sm" />
                                        </div>
                                        <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest">Gestión</h4>
                                    </div>

                                    <div className="divide-y divide-neutral-100">
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Estado</span>
                                            <span className={`text-sm font-bold uppercase ${selectedDetailMorosidad.estado === 'Pagado' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                                {selectedDetailMorosidad.estado.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Referencia</span>
                                            <span className="text-sm font-bold text-indigo-700 uppercase">
                                                {(selectedDetailMorosidad.ref || '-').toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Gestor</span>
                                            <span className="text-sm font-normal text-neutral-900 uppercase">
                                                {(() => {
                                                    if (!selectedDetailMorosidad.gestor) return '-';
                                                    const p = profiles.find(p => p.user_id === selectedDetailMorosidad.gestor);
                                                    return (p ? p.nombre : (selectedDetailMorosidad.gestor.length > 20 ? 'Usuario desconocido' : selectedDetailMorosidad.gestor)).toUpperCase();
                                                })()}
                                            </span>
                                        </div>
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">F. Notificación</span>
                                            <span className="text-sm font-normal text-neutral-900 uppercase">
                                                {selectedDetailMorosidad.fecha_notificacion ? new Date(selectedDetailMorosidad.fecha_notificacion).toLocaleDateString().toUpperCase() : '-'}
                                            </span>
                                        </div>
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">F. Pago</span>
                                            <span className="text-sm font-normal text-neutral-900 uppercase">
                                                {selectedDetailMorosidad.fecha_pago ? new Date(selectedDetailMorosidad.fecha_pago).toLocaleDateString().toUpperCase() : '-'}
                                            </span>
                                        </div>
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Aviso</span>
                                            <span className="text-sm font-normal text-neutral-900 uppercase">{selectedDetailMorosidad.aviso?.toUpperCase() || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Concepto e Importe */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 border-b-2 border-neutral-900 pb-1.5">
                                        <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest">Concepto</h4>
                                    </div>
                                    <div className="text-neutral-800 text-sm font-normal uppercase">
                                        {selectedDetailMorosidad.titulo_documento.toUpperCase()}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 border-b-2 border-neutral-900 pb-1.5">
                                        <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest">Importe</h4>
                                    </div>
                                    <div className="text-neutral-800 text-sm font-bold uppercase">
                                        {selectedDetailMorosidad.importe}€
                                    </div>
                                </div>
                            </div>
                            {/* Observaciones */}
                            {selectedDetailMorosidad.observaciones && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 border-b-2 border-neutral-900 pb-1.5">
                                        <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest">Observaciones</h4>
                                    </div>
                                    <p className="text-neutral-800 text-sm leading-relaxed font-normal text-justify uppercase italic">
                                        "{selectedDetailMorosidad.observaciones.toUpperCase()}"
                                    </p>
                                </div>
                            )}
                            {/* Document */}
                            {selectedDetailMorosidad.documento && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b-2 border-neutral-900 pb-1.5">
                                        <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest">Documentación</h4>
                                    </div>
                                    <a
                                        href={getSecureUrl(selectedDetailMorosidad.documento)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-4 group p-1 w-fit"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-neutral-50 flex items-center justify-center text-neutral-400 group-hover:bg-neutral-900 group-hover:text-white transition-colors">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-normal text-neutral-900 uppercase">
                                                DOCUMENTO ADJUNTO
                                            </span>
                                            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">Ver archivo oficial</span>
                                        </div>
                                    </a>
                                </div>
                            )}
                            {/* Timeline Chat */}
                            <div className="space-y-4 pt-4">
                                <div className="flex items-center gap-2 border-b-2 border-neutral-900 pb-1.5">
                                    <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest">Chat de Gestores</h4>
                                </div>
                                <TimelineChat
                                    entityType="morosidad"
                                    entityId={selectedDetailMorosidad.id}
                                />
                            </div>
                        </div>

                        {/* Administrative Footer Actions */}
                        <div className="px-8 py-6 border-t border-neutral-100 bg-neutral-50/30 flex justify-between items-center flex-shrink-0">
                            <button
                                onClick={() => {
                                    handleDeleteClick(selectedDetailMorosidad.id);
                                    setShowDetailModal(false);
                                }}
                                className="flex items-center gap-2 text-neutral-400 hover:text-red-600 transition-colors font-bold text-[10px] uppercase tracking-[0.2em]"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                ELIMINAR REGISTRO DEL SISTEMA
                            </button>

                            {selectedDetailMorosidad.estado !== 'Pagado' && (
                                <button
                                    onClick={() => {
                                        markAsPaid(selectedDetailMorosidad.id);
                                        setShowDetailModal(false);
                                    }}
                                    className="h-12 px-8 bg-yellow-400 text-neutral-900 rounded-xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-lg hover:bg-yellow-500 shadow-amber-200/50 flex items-center justify-center gap-3"
                                >
                                    <Check className="w-4 h-4" />
                                    MARCAR COMO PAGADO
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

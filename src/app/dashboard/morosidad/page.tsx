
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { Plus, FileText, Check, Trash2 } from 'lucide-react';
import DataTable, { Column } from '@/components/DataTable';
import SearchableSelect from '@/components/SearchableSelect';
import { logActivity } from '@/lib/logActivity';

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
    estado: 'Pendiente' | 'Pagado' | 'En disputa';
    fecha_pago: string;
    gestor: string;
    aviso?: string | null;
    documento: string;
    created_at: string;
    comunidades?: { nombre_cdad: string };
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
    const [filterEstado, setFilterEstado] = useState('all');

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

    const fetchInitialData = async () => {
        setLoading(true);
        await Promise.all([fetchComunidades(), fetchMorosidad(), fetchProfiles()]);
        setLoading(false);
    };

    const fetchComunidades = async () => {
        const { data } = await supabase.from('comunidades').select('id, nombre_cdad, codigo, direccion');
        if (data) setComunidades(data);
    };

    const fetchProfiles = async () => {
        const { data } = await supabase.from('profiles').select('user_id, nombre, rol').eq('activo', true);
        if (data) setProfiles(data);
    };

    const fetchMorosidad = async () => {
        const { data, error } = await supabase
            .from('morosidad')
            .select(`*, comunidades (nombre_cdad)`)
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
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('documentos')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('documentos').getPublicUrl(filePath);
            return data.publicUrl;
        } catch (error: any) {
            toast.error('Error subiendo archivo. Asegúrate de que el bucket "documentos" exista y sea público.');
            console.error(error);
            return null;
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.comunidad_id) return toast.error('Selecciona una comunidad');

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
                    importe: parseFloat(formData.importe),
                    documento: docUrl,
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
                });
                setFile(null);
                fetchMorosidad();
            } catch (error: any) {
                toast.error('Error al actualizar: ' + error.message);
            }
        } else {
            // Create new
            try {
                const { data: newDebt, error } = await supabase.from('morosidad').insert([{
                    ...formData,
                    comunidad_id: parseInt(formData.comunidad_id),
                    importe: parseFloat(formData.importe),
                    documento: docUrl,
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
                fetch('/api/webhooks/trigger-debt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...formData,
                        id: newDebt.id,
                        comunidad_nombre: comunidad?.nombre_cdad,
                        comunidad_codigo: comunidad?.codigo,
                        comunidad_direccion: comunidad?.direccion,
                        gestor_nombre: gestorProfile?.nombre || 'Desconocido',
                        documento_url: docUrl
                    })
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
                });
                setFile(null);
                fetchMorosidad();
            } catch (error: any) {
                toast.error('Error: ' + error.message);
            }
        }
    };

    const markAsPaid = async (id: number) => {
        try {
            const { error } = await supabase
                .from('morosidad')
                .update({ estado: 'Pagado', fecha_pago: new Date().toISOString() })
                .eq('id', id);

            if (error) throw error;

            toast.success('Marcado como pagado');

            // Log activity
            const moroso = morosos.find(m => m.id === id);
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
            toast.error('Error al actualizar');
        }
    };

    const handleDeleteClick = (id: number) => {
        setDeleteId(id);
        setShowDeleteModal(true);
        setDeletePassword('');
    };

    const handleDeleteConfirm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (deleteId === null || !deleteEmail || !deletePassword) return;

        setIsDeleting(true);

        try {
            const res = await fetch('/api/admin/universal-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: deleteId,
                    email: deleteEmail,
                    password: deletePassword,
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
                    deleted_by_admin: deleteEmail
                }
            });

            setShowDeleteModal(false);
            setDeleteId(null);
            setDeleteEmail('');
            setDeletePassword('');
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsDeleting(false);
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
        });
        setShowForm(true);
    };

    const columns: Column<Morosidad>[] = [
        {
            key: 'comunidades',
            label: 'Comunidad',
            render: (row) => (
                <div className="flex items-start gap-3">
                    <span className={`mt-1 h-3.5 w-1.5 rounded-full ${row.estado === 'Pendiente' ? 'bg-yellow-400' : 'bg-neutral-900'}`} />
                    <span className="font-semibold">{row.comunidades?.nombre_cdad || '-'}</span>
                </div>
            ),
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
            render: (row) => (
                <div className="flex items-center gap-2">
                    <span>{row.titulo_documento}</span>
                    {row.documento && (
                        <a href={row.documento} target="_blank" rel="noopener noreferrer" className="text-yellow-600 hover:text-yellow-800">
                            <FileText className="w-4 h-4" />
                        </a>
                    )}
                </div>
            ),
        },
        {
            key: 'fecha_notificacion',
            label: 'Fecha Notificación',
            render: (row) => row.fecha_notificacion ? new Date(row.fecha_notificacion).toLocaleDateString() : '-',
            defaultVisible: false,
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
            key: 'created_at',
            label: 'Fecha Creación',
            render: (row) => new Date(row.created_at).toLocaleDateString(),
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
            key: 'fecha_pago',
            label: 'Fecha Pago',
            render: (row) => row.fecha_pago ? new Date(row.fecha_pago).toLocaleDateString() : '-',
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
            key: 'aviso',
            label: 'Aviso',
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
                            onClick={() => markAsPaid(row.id)}
                            className="p-1.5 rounded-full bg-green-100 text-green-600 hover:bg-green-200 transition-colors"
                            title="Marcar como Pagado"
                        >
                            <Check className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={() => handleDeleteClick(row.id)}
                        className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                        title="Eliminar"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-xl font-bold text-neutral-900">Gestión de Morosidad</h1>
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
                            });
                        }
                    }}
                    className="bg-yellow-400 hover:bg-yellow-500 text-neutral-950 px-4 py-2 rounded-md flex items-center gap-2 transition font-semibold text-sm"
                >
                    <Plus className="w-4 h-4" />
                    Registrar Deuda
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                <button
                    onClick={() => setFilterEstado('all')}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition ${filterEstado === 'all' ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}
                >
                    Todas
                </button>
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
            </div>

            {showForm && (
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Comunidad</label>
                            <SearchableSelect
                                value={formData.comunidad_id}
                                onChange={(val) => setFormData({ ...formData, comunidad_id: String(val) })}
                                options={comunidades.map(cd => ({
                                    value: String(cd.id),
                                    label: cd.codigo ? `${cd.codigo} - ${cd.nombre_cdad}` : cd.nombre_cdad
                                }))}
                                placeholder="Selecciona una comunidad..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre Deudor</label>
                            <input
                                required
                                type="text"
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                                value={formData.nombre_deudor}
                                onChange={e => setFormData({ ...formData, nombre_deudor: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Apellidos</label>
                            <input
                                type="text"
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                                value={formData.apellidos}
                                onChange={e => setFormData({ ...formData, apellidos: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Teléfono</label>
                            <input
                                type="tel"
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                                value={formData.telefono_deudor}
                                onChange={e => setFormData({ ...formData, telefono_deudor: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                            <input
                                type="email"
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                                value={formData.email_deudor}
                                onChange={e => setFormData({ ...formData, email_deudor: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Título del Documento</label>
                            <input
                                required
                                type="text"
                                placeholder="Ej. Recibo de Comunidad"
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                                value={formData.titulo_documento}
                                onChange={e => setFormData({ ...formData, titulo_documento: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Fecha de Notificación</label>
                            <input
                                type="date"
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                                value={formData.fecha_notificacion}
                                onChange={e => setFormData({ ...formData, fecha_notificacion: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Importe (€)</label>
                            <input
                                required
                                type="number"
                                step="0.01"
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                                value={formData.importe}
                                onChange={e => setFormData({ ...formData, importe: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Gestor</label>
                            <SearchableSelect
                                value={formData.gestor}
                                onChange={(val) => setFormData({ ...formData, gestor: String(val) })}
                                options={profiles.map(profile => ({
                                    value: profile.user_id,
                                    label: `${profile.nombre} (${profile.rol})`
                                }))}
                                placeholder="Selecciona un gestor..."
                            />
                        </div>



                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                            <textarea
                                rows={3}
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                                value={formData.observaciones}
                                onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Documento Adjunto (Opcional)</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="file"
                                    className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-full file:border-0
                    file:text-sm file:font-semibold
                    file:bg-yellow-50 file:text-yellow-700
                    hover:file:bg-yellow-100
                  "
                                    onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                                />
                                {uploading && <span className="text-sm text-yellow-600">Subiendo...</span>}
                            </div>
                        </div>

                        <div className="md:col-span-2 pt-2">
                            <button type="submit" disabled={uploading} className="w-full bg-yellow-400 hover:bg-yellow-500 text-neutral-950 py-2 rounded-md font-semibold transition disabled:opacity-50">
                                Guardar Registro
                            </button>
                        </div>
                    </form>
                </div>
            )}



            {(() => {
                const filteredMorosidad = morosos.filter(m => {
                    if (filterEstado === 'pendiente') return m.estado !== 'Pagado';
                    if (filterEstado === 'resuelto') return m.estado === 'Pagado';
                    return true;
                });

                return (
                    <DataTable
                        data={filteredMorosidad}
                        columns={columns}
                        keyExtractor={(row) => row.id}
                        storageKey="morosidad"
                        loading={loading}
                        emptyMessage="No hay registros de morosidad en esta vista"
                    />
                );
            })()}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                        <h3 className="text-lg font-bold text-neutral-900 mb-4">Confirmar Eliminación</h3>
                        <p className="text-neutral-600 mb-4">
                            Esta acción no se puede deshacer. Para confirmar, ingresa credenciales de administrador:
                        </p>
                        <form onSubmit={handleDeleteConfirm} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email Administrador</label>
                                <input
                                    type="email"
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                    placeholder="admin@ejemplo.com"
                                    value={deleteEmail}
                                    onChange={(e) => setDeleteEmail(e.target.value)}
                                    autoComplete="off"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña Administrador</label>
                                <input
                                    type="password"
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                    placeholder="••••••••"
                                    value={deletePassword}
                                    onChange={(e) => setDeletePassword(e.target.value)}
                                    autoComplete="new-password"
                                />
                            </div>
                            <div className="flex gap-3 justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowDeleteModal(false);
                                        setDeletePassword('');
                                        setDeleteEmail('');
                                        setDeleteId(null);
                                    }}
                                    className="px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isDeleting}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium shadow-sm disabled:opacity-50"
                                >
                                    {isDeleting ? 'Eliminando...' : 'Eliminar Registro'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

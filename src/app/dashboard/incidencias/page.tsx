
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { Plus, Check, RotateCcw, Paperclip, Trash2, X } from 'lucide-react';
import DataTable, { Column } from '@/components/DataTable';
import { logActivity } from '@/lib/logActivity';

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
    comunidades?: { nombre_cdad: string };

    // New fields
    quien_lo_recibe?: string;
    comunidad?: string; // String representation if needed
    gestor_asignado?: string;
    sentimiento?: string;
    categoria?: string;
    nota_gestor?: string;
    nota_propietario?: string;
    todas_notas_propietario?: string;
    dia_resuelto?: string;
    adjuntos?: string[];
}

export default function IncidenciasPage() {
    const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
    const [comunidades, setComunidades] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [filterEstado, setFilterEstado] = useState('all');

    const [profiles, setProfiles] = useState<any[]>([]);
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);

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

    useEffect(() => {
        fetchInitialData();
    }, []);

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
        const { data } = await supabase.from('comunidades').select('id, nombre_cdad');
        if (data) setComunidades(data);
    };

    const fetchIncidencias = async () => {
        const { data, error } = await supabase
            .from('incidencias')
            .select(`
                *,
                comunidades (nombre_cdad),
                receptor:profiles!quien_lo_recibe (nombre),
                gestor:profiles!gestor_asignado (nombre)
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
                gestor_asignado: formData.gestor_asignado ? profiles.find(p => p.nombre === formData.gestor_asignado)?.user_id : null
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

                // Comunidad: ID and Name
                webhookPayload.append('comunidad_id', formData.comunidad_id);
                webhookPayload.append('comunidad_nombre', comunidad?.nombre_cdad || '');

                // Gestor Asignado: UUID and Name
                const gestorObj = formData.gestor_asignado ? profiles.find(p => p.nombre === formData.gestor_asignado) : null;
                webhookPayload.append('gestor_asignado', gestorObj?.user_id || '');
                webhookPayload.append('gestor_asignado_nombre', formData.gestor_asignado || '');

                // Recibido Por: UUID and Name
                const receptorObj = profiles.find(p => p.user_id === formData.recibido_por);
                webhookPayload.append('recibido_por', formData.recibido_por || '');
                webhookPayload.append('recibido_por_nombre', receptorObj?.nombre || '');

                webhookPayload.append('fecha', new Date().toISOString());
                if (incidenciaId) {
                    webhookPayload.append('incidencia_id', incidenciaId.toString());
                }

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
            fetchIncidencias();
        } catch (error: any) {
            toast.error('Error: ' + error.message);
        }
    };

    const toggleResuelto = async (id: number, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('incidencias')
                .update({
                    resuelto: !currentStatus,
                    dia_resuelto: !currentStatus ? new Date().toISOString() : null
                })
                .eq('id', id);

            if (error) throw error;

            toast.success(currentStatus ? 'Marcado como pendiente' : 'Marcado como resuelto');
            setIncidencias(prev => prev.map(i => i.id === id ? {
                ...i,
                resuelto: !currentStatus,
                dia_resuelto: !currentStatus ? new Date().toISOString() : undefined
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
        } catch (error) {
            toast.error('Error al actualizar estado');
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
        if (filterEstado === 'pendiente') return !inc.resuelto;
        if (filterEstado === 'resuelto') return inc.resuelto;
        return true;
    });

    const columns: Column<Incidencia>[] = [
        {
            key: 'id',
            label: 'ID',
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
            key: 'telefono',
            label: 'Teléfono',
        },
        {
            key: 'nombre_cliente',
            label: 'Cliente',
        },
        {
            key: 'comunidad',
            label: 'Comunidad',
            render: (row) => row.comunidad || (row.comunidades?.nombre_cdad) || '-',
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
                                className="text-gray-500 hover:text-yellow-600 transition-colors p-1"
                                title={`Ver adjunto ${i + 1}`}
                            >
                                <Paperclip className="w-4 h-4" />
                            </a>
                        ))
                    ) : '-'}
                </div>
            ),
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
            key: 'sentimiento',
            label: 'Sentimiento',
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
            key: 'categoria',
            label: 'Categoría',
        },
        {
            key: 'created_at',
            label: 'Fecha',
            render: (row) => new Date(row.created_at).toLocaleDateString(),
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
            key: 'actions',
            label: 'Acciones',
            render: (row) => (
                <div className="flex gap-1">
                    <button
                        onClick={() => toggleResuelto(row.id, row.resuelto)}
                        title={row.resuelto ? 'Reabrir incidencia' : 'Resolver incidencia'}
                        className={`p-1.5 rounded-full transition-colors ${row.resuelto
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : 'bg-green-100 text-green-600 hover:bg-green-200'
                            }`}
                    >
                        {row.resuelto ? <RotateCcw className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={() => handleDeleteClick(row.id)}
                        title="Eliminar incidencia"
                        className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
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
            key: 'dia_resuelto',
            label: 'Día Res.',
            render: (row) => row.dia_resuelto ? new Date(row.dia_resuelto).toLocaleDateString() : '-',
            defaultVisible: false,
        }
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-xl font-bold text-neutral-900">Gestión de Incidencias</h1>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="bg-yellow-400 hover:bg-yellow-500 text-neutral-950 px-4 py-2 rounded-md flex items-center gap-2 transition font-semibold text-sm"
                >
                    <Plus className="w-4 h-4" />
                    Nueva Incidencia
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

            {/* Form */}
            {showForm && (
                <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Row 1: Quien lo recibe */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Quién lo recibe</label>
                            <select
                                className="w-full px-3 py-2 border rounded-lg bg-white"
                                value={formData.recibido_por}
                                onChange={e => setFormData({ ...formData, recibido_por: e.target.value })}
                            >
                                <option value="">Selecciona quién recibe...</option>
                                {profiles.map(p => (
                                    <option key={p.user_id} value={p.user_id}>{p.nombre}</option>
                                ))}
                            </select>
                        </div>

                        {/* Row 2: Teléfono | Nombre Cliente */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono Cliente</label>
                            <input
                                type="tel"
                                className="w-full px-3 py-2 border rounded-lg"
                                value={formData.telefono}
                                onChange={e => setFormData({ ...formData, telefono: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Cliente</label>
                            <input
                                required
                                type="text"
                                className="w-full px-3 py-2 border rounded-lg"
                                value={formData.nombre_cliente}
                                onChange={e => setFormData({ ...formData, nombre_cliente: e.target.value })}
                            />
                        </div>

                        {/* Row 3: Comunidad */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Comunidad</label>
                            <select
                                required
                                className="w-full px-3 py-2 border rounded-lg bg-white"
                                value={formData.comunidad_id}
                                onChange={e => setFormData({ ...formData, comunidad_id: e.target.value })}
                            >
                                <option value="">Selecciona una comunidad...</option>
                                {comunidades.map(cd => (
                                    <option key={cd.id} value={cd.id}>{cd.nombre_cdad}</option>
                                ))}
                            </select>
                        </div>

                        {/* Row 4: Email */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email Cliente</label>
                            <input
                                type="email"
                                className="w-full px-3 py-2 border rounded-lg"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>

                        {/* Row 5: Mensaje */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje</label>
                            <textarea
                                required
                                rows={3}
                                className="w-full px-3 py-2 border rounded-lg"
                                value={formData.mensaje}
                                onChange={e => setFormData({ ...formData, mensaje: e.target.value })}
                            />
                        </div>

                        {/* Urgency field removed from creation form */}

                        {/* Row 6: Gestor Asignado */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Gestor Asignado</label>
                            <select
                                className="w-full px-3 py-2 border rounded-lg bg-white"
                                value={formData.gestor_asignado}
                                onChange={e => setFormData({ ...formData, gestor_asignado: e.target.value })}
                            >
                                <option value="">Selecciona un gestor...</option>
                                {profiles.map(p => (
                                    <option key={p.user_id} value={p.nombre}>{p.nombre} ({p.rol})</option>
                                ))}
                            </select>
                        </div>

                        {/* Row 7: Proveedor (Placeholder) */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Enviar email a Proveedor</label>
                            <select
                                disabled
                                className="w-full px-3 py-2 border rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                                value={formData.proveedor}
                                onChange={e => setFormData({ ...formData, proveedor: e.target.value })}
                            >
                                <option value="">Próximamente disponible...</option>
                            </select>
                        </div>

                        {/* Row 8: Adjuntos */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Adjuntar documentos (pueden ser varios)</label>
                            <input
                                type="file"
                                multiple
                                className="block w-full text-sm text-gray-500
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-full file:border-0
                                file:text-sm file:font-semibold
                                file:bg-yellow-50 file:text-yellow-700
                                hover:file:bg-yellow-100"
                                onChange={(e) => {
                                    if (e.target.files) {
                                        setFiles(Array.from(e.target.files));
                                    }
                                }}
                            />
                            {files.length > 0 && (
                                <p className="mt-1 text-xs text-neutral-500">{files.length} archivos seleccionados</p>
                            )}
                        </div>

                        <div className="md:col-span-2 pt-4">
                            <button type="submit" disabled={uploading} className="w-full bg-yellow-400 hover:bg-yellow-500 text-neutral-950 py-3 rounded-md font-bold transition disabled:opacity-50 flex justify-center gap-2">
                                {uploading ? 'Subiendo archivos...' : (
                                    <>
                                        <Plus className="w-5 h-5" />
                                        Registrar Incidencia
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
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

            <DataTable
                data={filteredIncidencias}
                columns={columns}
                keyExtractor={(row) => row.id}
                storageKey="incidencias"
                loading={loading}
                emptyMessage="No hay incidencias en esta vista"
            />
        </div>
    );
}

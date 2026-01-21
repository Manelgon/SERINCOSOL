'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { Plus, Trash2, X, Edit2, Phone, Mail } from 'lucide-react';
import DataTable, { Column } from '@/components/DataTable';
import { logActivity } from '@/lib/logActivity';

interface Proveedor {
    id: number;
    nombre: string;
    telefono: string;
    email: string;
    cif: string;
    direccion: string;
    cp: string;
    ciudad: string;
    provincia: string;
    activo: boolean;
}

export default function ProveedoresPage() {
    const [proveedores, setProveedores] = useState<Proveedor[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteEmail, setDeleteEmail] = useState('');
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [formData, setFormData] = useState({
        nombre: '',
        telefono: '',
        email: '',
        cif: '',
        direccion: '',
        cp: '',
        ciudad: '',
        provincia: ''
    });

    const [filterEstado, setFilterEstado] = useState<'all' | 'activo' | 'inactivo'>('activo');

    const filteredProveedores = proveedores.filter(p => {
        if (filterEstado === 'all') return true;
        if (filterEstado === 'activo') return p.activo;
        if (filterEstado === 'inactivo') return !p.activo;
        return true;
    });

    useEffect(() => {
        fetchProveedores();
    }, []);

    const fetchProveedores = async () => {
        try {
            const { data, error } = await supabase
                .from('proveedores')
                .select('*')
                .order('nombre', { ascending: true });

            if (error) throw error;
            setProveedores(data || []);
        } catch (error: any) {
            toast.error('Error cargando proveedores');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (editingId) {
            try {
                const { error } = await supabase
                    .from('proveedores')
                    .update(formData)
                    .eq('id', editingId);

                if (error) throw error;

                toast.success('Proveedor actualizado correctamente');

                await logActivity({
                    action: 'update',
                    entityType: 'proveedor',
                    entityId: editingId,
                    entityName: formData.nombre,
                    details: { email: formData.email }
                });

                setShowForm(false);
                setEditingId(null);
                setFormData({ nombre: '', telefono: '', email: '', cif: '', direccion: '', cp: '', ciudad: '', provincia: '' });
                fetchProveedores();
            } catch (error: any) {
                toast.error('Error al actualizar: ' + error.message);
            }
        } else {
            try {
                const { data, error } = await supabase
                    .from('proveedores')
                    .insert([{
                        ...formData,
                        activo: true
                    }])
                    .select();

                if (error) throw error;

                toast.success('Proveedor creado correctamente');

                await logActivity({
                    action: 'create',
                    entityType: 'proveedor',
                    entityName: formData.nombre,
                    details: { email: formData.email }
                });

                setShowForm(false);
                setFormData({ nombre: '', telefono: '', email: '', cif: '', direccion: '', cp: '', ciudad: '', provincia: '' });
                fetchProveedores();
            } catch (error: any) {
                toast.error('Error al crear: ' + (error.message || 'Error desconocido'));
            }
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
                    type: 'proveedor'
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al eliminar');

            toast.success('Proveedor eliminado correctamente');
            const deleted = proveedores.find(p => p.id === deleteId);
            setProveedores(proveedores.filter(p => p.id !== deleteId));

            await logActivity({
                action: 'delete',
                entityType: 'proveedor',
                entityId: deleteId,
                entityName: deleted?.nombre,
                details: { deleted_by_admin: deleteEmail }
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

    const toggleActive = async (id: number, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('proveedores')
                .update({ activo: !currentStatus })
                .eq('id', id);

            if (error) throw error;

            toast.success(currentStatus ? 'Proveedor desactivado' : 'Proveedor activado');
            setProveedores(prev => prev.map(p => p.id === id ? { ...p, activo: !currentStatus } : p));

            const proveedor = proveedores.find(p => p.id === id);
            await logActivity({
                action: 'toggle_active',
                entityType: 'proveedor',
                entityId: id,
                entityName: proveedor?.nombre,
                details: { activo: !currentStatus }
            });
        } catch (error: any) {
            toast.error('Error al actualizar estado');
        }
    };

    const handleEdit = (proveedor: Proveedor) => {
        setEditingId(proveedor.id);
        setFormData({
            nombre: proveedor.nombre,
            telefono: proveedor.telefono || '',
            email: proveedor.email || '',
            cif: proveedor.cif || '',
            direccion: proveedor.direccion || '',
            cp: proveedor.cp || '',
            ciudad: proveedor.ciudad || '',
            provincia: proveedor.provincia || ''
        });
        setShowForm(true);
    };

    const columns: Column<Proveedor>[] = [
        {
            key: 'id',
            label: 'ID',
            render: (row) => <span className="text-slate-500 font-mono text-xs">#{row.id}</span>,
        },
        {
            key: 'nombre',
            label: 'Nombre',
            render: (row) => (
                <div className="flex items-start gap-3">
                    <span className="mt-1 h-3.5 w-1.5 rounded-full bg-yellow-400" />
                    <span className="font-semibold">{row.nombre}</span>
                </div>
            ),
        },
        {
            key: 'telefono',
            label: 'Teléfono',
            render: (row) => (
                <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{row.telefono || '-'}</span>
                </div>
            )
        },
        {
            key: 'email',
            label: 'Email',
            render: (row) => (
                <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{row.email || '-'}</span>
                </div>
            )
        },
        {
            key: 'cif',
            label: 'CIF',
        },
        {
            key: 'ciudad',
            label: 'Ciudad',
        },
        {
            key: 'activo',
            label: 'Estado',
            render: (row) => (
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${row.activo
                    ? 'bg-yellow-400 text-neutral-950'
                    : 'bg-neutral-900 text-white'
                    }`}>
                    {row.activo ? 'Activo' : 'Inactivo'}
                </span>
            ),
        },
        {
            key: 'actions',
            label: 'Acciones',
            sortable: false,
            render: (row) => (
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => handleEdit(row)}
                        className="p-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                        title="Editar"
                    >
                        <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => toggleActive(row.id, row.activo)}
                        className={`p-1.5 rounded-full transition-colors ${row.activo
                            ? 'bg-green-100 text-green-600 hover:bg-green-200'
                            : 'bg-red-50 text-red-600 hover:bg-red-100'
                            }`}
                        title={row.activo ? 'Desactivar' : 'Activar'}
                    >
                        {row.activo ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        )}
                    </button>
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
            <div className="flex justify-between items-center">
                <h1 className="text-xl font-bold text-neutral-900">Gestión de Proveedores</h1>
                <button
                    onClick={() => {
                        setShowForm(!showForm);
                        if (showForm) {
                            setEditingId(null);
                            setFormData({ nombre: '', telefono: '', email: '', cif: '', direccion: '', cp: '', ciudad: '', provincia: '' });
                        }
                    }}
                    className="bg-yellow-400 hover:bg-yellow-500 text-neutral-950 px-4 py-2 rounded-md flex items-center gap-2 transition font-semibold text-sm"
                >
                    <Plus className="w-4 h-4" />
                    {showForm ? 'Cancelar' : 'Nuevo Proveedor'}
                </button>
            </div>

            <div className="flex gap-2">
                <button
                    onClick={() => setFilterEstado('activo')}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition ${filterEstado === 'activo' ? 'bg-yellow-400 text-neutral-950' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}
                >
                    Activos
                </button>
                <button
                    onClick={() => setFilterEstado('inactivo')}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition ${filterEstado === 'inactivo' ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}
                >
                    Inactivos
                </button>
                <button
                    onClick={() => setFilterEstado('all')}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition ${filterEstado === 'all' ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}
                >
                    Todos
                </button>
            </div>

            {showForm && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
                    <div
                        className="w-[calc(100vw-24px)] sm:w-full sm:max-w-2xl max-h-[calc(100vh-24px)] bg-white rounded-xl shadow-xl flex flex-col animate-in fade-in zoom-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="px-6 sm:px-8 pt-6 sm:pt-7 pb-4 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-slate-900">
                                {editingId ? 'Editar Proveedor' : 'Registrar Nuevo Proveedor'}
                            </h2>
                            <button
                                onClick={() => setShowForm(false)}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 sm:p-8 overflow-y-auto custom-scrollbar">
                            <form id="proveedor-form" onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Nombre / Razón Social <span className="text-red-600">*</span></label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="e.g. Servicios Integrales S.L."
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                        value={formData.nombre}
                                        onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Teléfono</label>
                                    <input
                                        type="tel"
                                        placeholder="e.g. 600000000"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                        value={formData.telefono}
                                        onChange={e => setFormData({ ...formData, telefono: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
                                    <input
                                        type="email"
                                        placeholder="e.g. admin@servicios.com"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">CIF</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. B12345678"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                        value={formData.cif}
                                        onChange={e => setFormData({ ...formData, cif: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">CP</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 29001"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                        value={formData.cp}
                                        onChange={e => setFormData({ ...formData, cp: e.target.value })}
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Dirección</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Polígono Industrial Nave 4"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                        value={formData.direccion}
                                        onChange={e => setFormData({ ...formData, direccion: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Ciudad</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Málaga"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                        value={formData.ciudad}
                                        onChange={e => setFormData({ ...formData, ciudad: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Provincia</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Málaga"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                        value={formData.provincia}
                                        onChange={e => setFormData({ ...formData, provincia: e.target.value })}
                                    />
                                </div>
                            </form>
                        </div>

                        <div className="px-6 sm:px-8 pb-6 sm:pb-7 pt-4 border-t border-slate-100">
                            <button
                                form="proveedor-form"
                                type="submit"
                                disabled={!formData.nombre}
                                className="w-full sm:w-auto h-12 px-8 bg-yellow-400 hover:bg-yellow-500 text-neutral-950 rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm hover:shadow-md active:scale-[0.98]"
                            >
                                <Plus className="w-5 h-5" />
                                {editingId ? 'Guardar Cambios' : 'Guardar Proveedor'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <DataTable
                data={filteredProveedores}
                columns={columns}
                keyExtractor={(row) => row.id}
                storageKey="proveedores"
                loading={loading}
                emptyMessage="No hay proveedores registrados"
            />

            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                        <h3 className="text-lg font-bold mb-4 text-neutral-900">Confirmar Eliminación</h3>
                        <p className="text-gray-600 mb-4">
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
                                    className="px-4 py-2 border border-gray-300 text-neutral-700 rounded-lg hover:bg-gray-50 transition font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isDeleting}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium shadow-sm disabled:opacity-50"
                                >
                                    {isDeleting ? 'Eliminando...' : 'Eliminar Proveedor'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

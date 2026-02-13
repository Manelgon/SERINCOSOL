'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { Plus, Trash2, X, Edit2, Phone, Mail, MapPin, Building2, CreditCard, Clock, Loader2 } from 'lucide-react';
import DeleteConfirmationModal from '@/components/DeleteConfirmationModal';
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

    // Detail Modal
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedDetailProveedor, setSelectedDetailProveedor] = useState<Proveedor | null>(null);

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

    // Prevent body scroll when any modal is open
    useEffect(() => {
        if (showForm || showDetailModal || showDeleteModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showForm, showDetailModal, showDeleteModal]);

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
                details: { deleted_by_admin: email }
            });

            setShowDeleteModal(false);
            setDeleteId(null);

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
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-0 sm:p-4 md:p-8 backdrop-blur-sm overflow-y-auto">
                    <div
                        className="w-full sm:w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[85vh] bg-white rounded-none sm:rounded-xl shadow-xl flex flex-col animate-in fade-in zoom-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex justify-between items-center">
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

                        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar">
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
                                    <p className="mt-1 text-xs text-slate-500">(Sin espacios y sin prefijo)</p>
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
                                        pattern="[A-Za-z0-9]{1,9}"
                                        maxLength={9}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 uppercase"
                                        value={formData.cif}
                                        onChange={e => {
                                            const value = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                                            setFormData({ ...formData, cif: value });
                                        }}
                                    />
                                    <p className="mt-1 text-xs text-slate-500">Sin espacios, solo letras y números, máximo 9 caracteres</p>
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

                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100">
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
                onRowClick={(row) => {
                    setSelectedDetailProveedor(row);
                    setShowDetailModal(true);
                }}
            />

            {/* Detail Modal */}
            {showDetailModal && selectedDetailProveedor && (
                <div
                    className="fixed inset-0 bg-neutral-900/60 z-[100] flex items-center justify-center p-0 sm:p-4 md:p-8 backdrop-blur-md"
                    onClick={() => setShowDetailModal(false)}
                >
                    <div
                        className="bg-white rounded-none sm:rounded-2xl shadow-2xl border border-neutral-200 w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-neutral-100 bg-neutral-50/50 flex justify-between items-center sticky top-0 z-10">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-amber-400 flex items-center justify-center shadow-lg shadow-amber-200 ring-4 ring-amber-50">
                                    <Building2 className="w-6 h-6 text-neutral-900" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-neutral-900 tracking-tight uppercase">
                                        Proveedor #{selectedDetailProveedor.id}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className={`text-[10px] font-black ${selectedDetailProveedor.activo ? 'text-amber-600' : 'text-neutral-400'} uppercase tracking-widest`}>
                                            {selectedDetailProveedor.activo ? 'ACTIVO' : 'INACTIVO'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center bg-white rounded-lg border border-neutral-200 p-1 shadow-sm">
                                <button
                                    onClick={() => {
                                        handleEdit(selectedDetailProveedor);
                                        setShowDetailModal(false);
                                    }}
                                    className="p-2 hover:bg-neutral-50 rounded-md transition-all text-neutral-400 hover:text-blue-600 active:scale-95"
                                    title="Editar Proveedor"
                                >
                                    <Edit2 className="w-5 h-5" />
                                </button>
                                <div className="w-px h-6 bg-neutral-100 mx-1" />
                                <button
                                    onClick={() => setShowDetailModal(false)}
                                    className="p-2 hover:bg-neutral-50 rounded-md transition-all text-neutral-400 hover:text-neutral-900 active:scale-95"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="p-4 sm:p-6 space-y-8 flex-grow overflow-y-auto custom-scrollbar">
                            {/* Information Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Left: Contact Info */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b-2 border-neutral-900 pb-1.5">
                                        <Phone className="w-4 h-4 text-neutral-900" />
                                        <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest">Contacto</h4>
                                    </div>
                                    <div className="divide-y divide-neutral-100">
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Nombre</span>
                                            <span className="text-sm font-normal text-neutral-900 uppercase">{selectedDetailProveedor.nombre}</span>
                                        </div>
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Teléfono</span>
                                            <span className="text-sm font-normal text-neutral-900 uppercase">{selectedDetailProveedor.telefono || '-'}</span>
                                        </div>
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Email</span>
                                            <span className="text-sm font-normal text-neutral-900 uppercase">{selectedDetailProveedor.email || '-'}</span>
                                        </div>
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">CIF</span>
                                            <span className="text-sm font-bold text-neutral-900 uppercase">{selectedDetailProveedor.cif || '-'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Location Info */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b-2 border-neutral-900 pb-1.5">
                                        <MapPin className="w-4 h-4 text-neutral-900" />
                                        <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest">Ubicación</h4>
                                    </div>
                                    <div className="divide-y divide-neutral-100">
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Dirección</span>
                                            <span className="text-sm font-normal text-neutral-900 uppercase">{selectedDetailProveedor.direccion || '-'}</span>
                                        </div>
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">CP</span>
                                            <span className="text-sm font-normal text-neutral-900 uppercase">{selectedDetailProveedor.cp || '-'}</span>
                                        </div>
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Ciudad</span>
                                            <span className="text-sm font-normal text-neutral-900 uppercase">{selectedDetailProveedor.ciudad || '-'}</span>
                                        </div>
                                        <div className="py-1.5 flex items-center gap-4">
                                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-tighter w-32 shrink-0">Provincia</span>
                                            <span className="text-sm font-normal text-neutral-900 uppercase">{selectedDetailProveedor.provincia || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50/30 flex justify-between items-center bg-white flex-shrink-0">
                            <button
                                onClick={() => {
                                    handleDeleteClick(selectedDetailProveedor.id);
                                    setShowDetailModal(false);
                                }}
                                className="flex items-center gap-2 text-neutral-400 hover:text-red-600 transition-colors font-bold text-[10px] uppercase tracking-[0.2em]"
                            >
                                <Trash2 className="w-4 h-4" />
                                <span>Eliminar Proveedor</span>
                            </button>

                            <button
                                onClick={() => {
                                    toggleActive(selectedDetailProveedor.id, selectedDetailProveedor.activo);
                                    setSelectedDetailProveedor({
                                        ...selectedDetailProveedor,
                                        activo: !selectedDetailProveedor.activo
                                    });
                                }}
                                className={`h-12 px-8 rounded-xl font-black text-xs uppercase tracking-[0.15em] shadow-sm transition-all active:scale-95 ${selectedDetailProveedor.activo
                                    ? 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                                    : 'bg-yellow-400 text-neutral-900 hover:bg-yellow-500 shadow-yellow-100'
                                    }`}
                            >
                                {selectedDetailProveedor.activo ? (
                                    <div className="flex items-center gap-2">
                                        <X className="w-4 h-4" />
                                        <span>Desactivar Proveedor</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <Plus className="w-4 h-4" />
                                        <span>Activar Proveedor</span>
                                    </div>
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
                    setDeleteId(null);
                }}
                onConfirm={handleConfirmDelete}
                itemType="proveedor"
                isDeleting={isDeleting}
            />
        </div>
    );
}

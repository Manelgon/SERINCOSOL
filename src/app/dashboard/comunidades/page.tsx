
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { Plus, Trash2, X, Edit2, Eye, MapPin, Hash, Building2, Clock } from 'lucide-react';
import DataTable, { Column } from '@/components/DataTable';
import { logActivity } from '@/lib/logActivity';

interface Comunidad {
    id: number;
    codigo: string;
    nombre_cdad: string;
    direccion: string;
    cp: string;
    ciudad: string;
    provincia: string;
    cif: string;
    activo: boolean;
}

export default function ComunidadesPage() {
    const [comunidades, setComunidades] = useState<Comunidad[]>([]);
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
    const [selectedDetailComunidad, setSelectedDetailComunidad] = useState<Comunidad | null>(null);

    const [formData, setFormData] = useState({
        codigo: '',
        nombre_cdad: '',
        direccion: '',
        cp: '',
        ciudad: '',
        provincia: '',
        cif: ''
    });

    const [filterEstado, setFilterEstado] = useState<'all' | 'activo' | 'inactivo'>('activo');

    const filteredComunidades = comunidades.filter(c => {
        if (filterEstado === 'all') return true;
        if (filterEstado === 'activo') return c.activo;
        if (filterEstado === 'inactivo') return !c.activo;
        return true;
    });

    useEffect(() => {
        fetchComunidades();
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

    const fetchComunidades = async () => {
        try {
            const { data, error } = await supabase
                .from('comunidades')
                .select('*')
                .order('id', { ascending: true });

            if (error) throw error;
            setComunidades(data || []);
        } catch (error: any) {
            toast.error('Error cargando comunidades');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (editingId) {
            // Update existing
            try {
                const { error } = await supabase
                    .from('comunidades')
                    .update(formData)
                    .eq('id', editingId);

                if (error) throw error;

                toast.success('Comunidad actualizada correctamente');

                // Log activity
                await logActivity({
                    action: 'update',
                    entityType: 'comunidad',
                    entityId: editingId,
                    entityName: formData.nombre_cdad,
                    details: { codigo: formData.codigo }
                });

                setShowForm(false);
                setEditingId(null);
                setFormData({ codigo: '', nombre_cdad: '', direccion: '', cp: '', ciudad: '', provincia: '', cif: '' });
                fetchComunidades();
            } catch (error: any) {
                toast.error('Error al actualizar: ' + error.message);
            }
        } else {
            // Create new
            try {
                const { data, error } = await supabase
                    .from('comunidades')
                    .insert([{
                        ...formData,
                        activo: true
                    }])
                    .select();

                if (error) {
                    console.error('Supabase error:', error);

                    // Check if it's a duplicate key error
                    if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
                        toast.error('El código de comunidad ya existe. Por favor, usa un código diferente.');
                        setLoading(false);
                        return;
                    }

                    throw error;
                }

                toast.success('Comunidad creada correctamente');

                // Log activity
                await logActivity({
                    action: 'create',
                    entityType: 'comunidad',
                    entityName: formData.nombre_cdad,
                    details: { codigo: formData.codigo }
                });

                setShowForm(false);
                setFormData({ codigo: '', nombre_cdad: '', direccion: '', cp: '', ciudad: '', provincia: '', cif: '' });
                fetchComunidades();
            } catch (error: any) {
                console.error('Error completo:', error);

                // Check for duplicate key error
                if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
                    toast.error('El código de comunidad ya existe. Por favor, usa un código diferente.');
                } else {
                    toast.error('Error al crear: ' + (error.message || 'Error desconocido'));
                }
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
                    type: 'comunidad'
                })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Error al eliminar');

            toast.success('Comunidad eliminada correctamente');
            setComunidades(comunidades.filter(c => c.id !== deleteId));
            setShowDeleteModal(false);
            setDeleteId(null);
            setDeleteEmail('');
            setDeletePassword('');

            // Log activity
            const deleted = comunidades.find(c => c.id === deleteId);
            await logActivity({
                action: 'delete',
                entityType: 'comunidad',
                entityId: deleteId,
                entityName: deleted?.nombre_cdad,
                details: { codigo: deleted?.codigo, deleted_by_admin: deleteEmail }
            });

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsDeleting(false);
        }
    };

    const toggleActive = async (id: number, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('comunidades')
                .update({ activo: !currentStatus })
                .eq('id', id);

            if (error) throw error;

            toast.success(currentStatus ? 'Comunidad desactivada' : 'Comunidad activada');
            setComunidades(prev => prev.map(c => c.id === id ? { ...c, activo: !currentStatus } : c));

            // Log activity
            const comunidad = comunidades.find(c => c.id === id);
            await logActivity({
                action: 'toggle_active',
                entityType: 'comunidad',
                entityId: id,
                entityName: comunidad?.nombre_cdad,
                details: { activo: !currentStatus }
            });
        } catch (error: any) {
            toast.error('Error al actualizar estado');
        }
    };

    const handleEdit = (comunidad: Comunidad) => {
        setEditingId(comunidad.id);
        setFormData({
            codigo: comunidad.codigo,
            nombre_cdad: comunidad.nombre_cdad,
            direccion: comunidad.direccion || '',
            cp: comunidad.cp || '',
            ciudad: comunidad.ciudad || '',
            provincia: comunidad.provincia || '',
            cif: comunidad.cif || '',
        });
        setShowForm(true);
    };

    const columns: Column<Comunidad>[] = [
        {
            key: 'codigo',
            label: 'Código',
            render: (row) => (
                <div className="flex items-start gap-3">
                    <span className="mt-1 h-3.5 w-1.5 rounded-full bg-yellow-400" />
                    <span className="font-semibold">{row.codigo}</span>
                </div>
            ),
        },
        {
            key: 'nombre_cdad',
            label: 'Nombre',
        },
        {
            key: 'direccion',
            label: 'Dirección',
            defaultVisible: false,
        },
        {
            key: 'cp',
            label: 'CP',
            defaultVisible: false,
        },
        {
            key: 'ciudad',
            label: 'Ciudad',
        },
        {
            key: 'provincia',
            label: 'Provincia',
            defaultVisible: false,
        },
        {
            key: 'cif',
            label: 'CIF',
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
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                    <button
                        onClick={() => toggleActive(row.id, row.activo)}
                        className={`p-1.5 rounded-full transition-colors ${row.activo
                            ? 'bg-green-100 text-green-600 hover:bg-green-200'
                            : 'bg-red-50 text-red-600 hover:bg-red-100' // Or neutral? User used Red for Inactive status badge.
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
                <h1 className="text-xl font-bold text-neutral-900">Gestión de Comunidades</h1>
                <button
                    onClick={() => {
                        setShowForm(!showForm);
                        if (showForm) {
                            setEditingId(null);
                            setFormData({ codigo: '', nombre_cdad: '', direccion: '', cp: '', ciudad: '', provincia: '', cif: '' });
                        }
                    }}
                    className="bg-yellow-400 hover:bg-yellow-500 text-neutral-950 px-4 py-2 rounded-md flex items-center gap-2 transition font-semibold text-sm"
                >
                    <Plus className="w-4 h-4" />
                    {showForm ? 'Cancelar' : 'Nueva Comunidad'}
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                <button
                    onClick={() => setFilterEstado('activo')}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition ${filterEstado === 'activo' ? 'bg-yellow-400 text-neutral-950' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}
                >
                    Activas
                </button>
                <button
                    onClick={() => setFilterEstado('inactivo')}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition ${filterEstado === 'inactivo' ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}
                >
                    Inactivas
                </button>
                <button
                    onClick={() => setFilterEstado('all')}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition ${filterEstado === 'all' ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300'}`}
                >
                    Todas
                </button>
            </div>

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-0 sm:p-4 md:p-8 backdrop-blur-sm overflow-y-auto">
                    <div
                        className="w-full sm:w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[85vh] bg-white rounded-none sm:rounded-xl shadow-xl flex flex-col animate-in fade-in zoom-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-slate-900">
                                {editingId ? 'Editar Comunidad' : 'Registrar Nueva Comunidad'}
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
                            <form id="comunidad-form" onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Código <span className="text-red-600">*</span></label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="e.g. 001"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                                        value={formData.codigo}
                                        onChange={e => setFormData({ ...formData, codigo: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Nombre Comunidad <span className="text-red-600">*</span></label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="e.g. Edificio Central"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                                        value={formData.nombre_cdad}
                                        onChange={e => setFormData({ ...formData, nombre_cdad: e.target.value })}
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Dirección</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. C/ Mayor 123"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                                        value={formData.direccion}
                                        onChange={e => setFormData({ ...formData, direccion: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">CP</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 29001"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                                        value={formData.cp}
                                        onChange={e => setFormData({ ...formData, cp: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Ciudad</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Málaga"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                                        value={formData.ciudad}
                                        onChange={e => setFormData({ ...formData, ciudad: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Provincia</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Málaga"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                                        value={formData.provincia}
                                        onChange={e => setFormData({ ...formData, provincia: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">CIF</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. H12345678"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
                                        value={formData.cif}
                                        onChange={e => setFormData({ ...formData, cif: e.target.value })}
                                    />
                                </div>
                            </form>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100">
                            <button
                                form="comunidad-form"
                                type="submit"
                                disabled={!formData.codigo || !formData.nombre_cdad}
                                className="w-full sm:w-auto h-12 px-8 bg-yellow-400 hover:bg-yellow-500 text-neutral-950 rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm hover:shadow-md active:scale-[0.98]"
                            >
                                <Plus className="w-5 h-5" />
                                {editingId ? 'Guardar Cambios' : 'Guardar Comunidad'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <DataTable
                data={filteredComunidades}
                columns={columns}
                keyExtractor={(row) => row.id}
                storageKey="comunidades"
                loading={loading}
                emptyMessage="No hay comunidades registradas"
                onRowClick={(row) => {
                    setSelectedDetailComunidad(row);
                    setShowDetailModal(true);
                }}
            />

            {/* Detail Modal */}
            {showDetailModal && selectedDetailComunidad && (
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
                                    Comunidad #{selectedDetailComunidad.id}
                                </h3>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${selectedDetailComunidad.activo
                                        ? 'bg-yellow-400 text-neutral-950'
                                        : 'bg-neutral-900 text-white'
                                        }`}>
                                        {selectedDetailComunidad.activo ? 'ACTIVO' : 'INACTIVO'}
                                    </span>
                                    <span className="text-xs text-slate-500 font-mono">[{selectedDetailComunidad.codigo}]</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        handleEdit(selectedDetailComunidad);
                                        setShowDetailModal(false);
                                    }}
                                    className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400 hover:text-blue-600"
                                    title="Editar Comunidad"
                                >
                                    <Edit2 className="w-5 h-5" />
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
                            {/* Information Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Left: Basic Info */}
                                <div className="space-y-6">
                                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                                            <Building2 className="w-4 h-4 text-indigo-600" />
                                        </div>
                                        Datos Generales
                                    </h4>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nombre Comunidad</span>
                                            <span className="text-sm font-semibold text-slate-900">{selectedDetailComunidad.nombre_cdad}</span>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Código Interno</span>
                                            <span className="text-sm font-mono font-bold text-slate-900">{selectedDetailComunidad.codigo}</span>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">CIF</span>
                                            <span className="text-sm font-mono text-slate-900">{selectedDetailComunidad.cif || '-'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Location Info */}
                                <div className="space-y-6">
                                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                                        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                                            <MapPin className="w-4 h-4 text-emerald-600" />
                                        </div>
                                        Ubicación
                                    </h4>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dirección</span>
                                            <span className="text-sm text-slate-900">{selectedDetailComunidad.direccion || '-'}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">CP</span>
                                                <span className="text-sm text-slate-900">{selectedDetailComunidad.cp || '-'}</span>
                                            </div>
                                            <div className="space-y-1">
                                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ciudad</span>
                                                <span className="text-sm text-slate-900">{selectedDetailComunidad.ciudad || '-'}</span>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Provincia</span>
                                            <span className="text-sm text-slate-900">{selectedDetailComunidad.provincia || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 bg-slate-50/30 rounded-b-xl flex justify-between items-center flex-shrink-0">
                            <button
                                onClick={() => {
                                    handleDeleteClick(selectedDetailComunidad.id);
                                    setShowDetailModal(false);
                                }}
                                className="flex items-center gap-2 text-red-500 hover:text-red-600 hover:bg-red-50/50 px-4 py-2 rounded-xl transition font-semibold text-sm"
                            >
                                <Trash2 className="w-4 h-4" />
                                <span>Eliminar Comunidad</span>
                            </button>

                            <button
                                onClick={() => {
                                    toggleActive(selectedDetailComunidad.id, selectedDetailComunidad.activo);
                                    setSelectedDetailComunidad({
                                        ...selectedDetailComunidad,
                                        activo: !selectedDetailComunidad.activo
                                    });
                                }}
                                className={`h-11 px-6 rounded-xl font-bold shadow-sm transition flex items-center gap-2 ${selectedDetailComunidad.activo
                                    ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                                    : 'bg-yellow-400 text-neutral-950 hover:bg-yellow-500 shadow-yellow-200/50 hover:shadow-lg'
                                    }`}
                            >
                                {selectedDetailComunidad.activo ? (
                                    <>
                                        <X className="w-4 h-4 text-red-500" />
                                        Desactivar Comunidad
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-4 h-4" />
                                        Activar Comunidad
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
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
                                    {isDeleting ? 'Eliminando...' : 'Eliminar Comunidad'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

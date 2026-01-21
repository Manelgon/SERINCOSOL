'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import DataTable, { Column } from '@/components/DataTable';
import { toast } from 'react-hot-toast';
import { Plus, UserPlus } from 'lucide-react';
import { logActivity } from '@/lib/logActivity';

interface Profile {
    user_id: string;
    nombre: string;
    email: string;
    rol: 'admin' | 'empleado' | 'gestor';
    activo: boolean;
    created_at: string;
}

export default function PerfilesPage() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal States
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    const [processing, setProcessing] = useState(false);
    const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);

    // Create User Form State
    const [createFormData, setCreateFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        nombre: '',
        apellido: '',
        telefono: '',
        rol: 'gestor' as 'admin' | 'empleado' | 'gestor',
    });

    // Edit User Form State
    const [editFormData, setEditFormData] = useState({
        email: '',
        nombre: '',
        apellido: '',
        telefono: '',
        rol: 'gestor' as 'admin' | 'empleado' | 'gestor',
    });

    // Password Reset Form State
    const [passwordFormData, setPasswordFormData] = useState({
        password: '',
        confirmPassword: ''
    });

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<Profile | null>(null);
    const [deleteEmail, setDeleteEmail] = useState('');
    const [deletePassword, setDeletePassword] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchProfiles();
    }, []);

    const fetchProfiles = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            toast.error('Error al cargar perfiles');
            console.error(error);
        } else {
            setProfiles(data || []);
        }
        setLoading(false);
    };

    const handleOpenCreate = () => {
        setCreateFormData({
            email: '',
            password: '',
            confirmPassword: '',
            nombre: '',
            apellido: '',
            telefono: '',
            rol: 'gestor',
        });
        setShowCreateModal(true);
    };

    const handleOpenEdit = (profile: Profile) => {
        setSelectedProfile(profile);
        setEditFormData({
            email: profile.email,
            nombre: profile.nombre || '',
            apellido: profile.apellido || '',
            telefono: profile.telefono || '',
            rol: profile.rol,
        });
        setShowEditModal(true);
    };

    const handleOpenPasswordReset = (profile: Profile) => {
        setSelectedProfile(profile);
        setPasswordFormData({
            password: '',
            confirmPassword: ''
        });
        setShowPasswordModal(true);
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();

        if (createFormData.password !== createFormData.confirmPassword) {
            toast.error('Las contraseñas no coinciden');
            return;
        }
        if (createFormData.password.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        // Regex Validation
        const phoneRegex = /^\d{9}$/;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (createFormData.telefono && !phoneRegex.test(createFormData.telefono)) {
            toast.error('El teléfono debe tener exactamente 9 dígitos');
            return;
        }
        if (!emailRegex.test(createFormData.email)) {
            toast.error('El formato del email no es válido');
            return;
        }

        setProcessing(true);

        try {
            const session = (await supabase.auth.getSession()).data.session;
            const response = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    email: createFormData.email,
                    password: createFormData.password,
                    nombre: createFormData.nombre,
                    apellido: createFormData.apellido,
                    telefono: createFormData.telefono,
                    rol: createFormData.rol,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Error al crear usuario');
            }

            toast.success('Usuario creado correctamente');

            await logActivity({
                action: 'create',
                entityType: 'profile',
                entityName: createFormData.nombre,
                details: { ...createFormData, password: undefined }
            });

            setShowCreateModal(false);
            fetchProfiles();

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setProcessing(false);
        }
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProfile) return;

        // Regex Validation
        const phoneRegex = /^\d{9}$/;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (editFormData.telefono && !phoneRegex.test(editFormData.telefono)) {
            toast.error('El teléfono debe tener exactamente 9 dígitos');
            return;
        }
        if (editFormData.email && !emailRegex.test(editFormData.email)) {
            toast.error('El formato del email no es válido');
            return;
        }

        setProcessing(true);

        try {
            const session = (await supabase.auth.getSession()).data.session;
            const response = await fetch('/api/admin/update-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    userId: selectedProfile.user_id,
                    email: editFormData.email, // Kept for consistency, though possibly read-only in UI
                    nombre: editFormData.nombre,
                    apellido: editFormData.apellido,
                    telefono: editFormData.telefono,
                    rol: editFormData.rol,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Error al actualizar perfil');
            }

            toast.success('Perfil actualizado correctamente');

            await logActivity({
                action: 'update',
                entityType: 'profile',
                entityName: editFormData.nombre,
                details: { userId: selectedProfile.user_id, ...editFormData }
            });

            setShowEditModal(false);
            fetchProfiles();

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setProcessing(false);
        }
    };

    const handleSavePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedProfile) return;

        if (passwordFormData.password !== passwordFormData.confirmPassword) {
            toast.error('Las contraseñas no coinciden');
            return;
        }
        if (passwordFormData.password.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        setProcessing(true);

        try {
            const session = (await supabase.auth.getSession()).data.session;
            const response = await fetch('/api/admin/update-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    userId: selectedProfile.user_id,
                    password: passwordFormData.password
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Error al actualizar contraseña');
            }

            toast.success('Contraseña actualizada correctamente');

            await logActivity({
                action: 'update_password',
                entityType: 'profile',
                entityName: selectedProfile.nombre,
                details: { userId: selectedProfile.user_id }
            });

            setShowPasswordModal(false);

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setProcessing(false);
        }
    };

    const handleToggleStatus = async (profile: Profile) => {
        if (!window.confirm(`¿Estás seguro de que deseas ${profile.activo ? 'desactivar' : 'activar'} a ${profile.nombre}?`)) {
            return;
        }

        const loadingToast = toast.loading('Actualizando estado...');

        try {
            const session = (await supabase.auth.getSession()).data.session;
            const response = await fetch('/api/admin/update-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    userId: profile.user_id,
                    activo: !profile.activo // Toggle value
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Error al actualizar estado');
            }

            toast.success(`Usuario ${profile.activo ? 'desactivado' : 'activado'} correctamente`, { id: loadingToast });
            fetchProfiles();

            await logActivity({
                action: 'toggle_active',
                entityType: 'profile',
                entityName: profile.nombre,
                details: { previousStatus: profile.activo, newStatus: !profile.activo }
            });

        } catch (error: any) {
            toast.error(error.message, { id: loadingToast });
        }
    };

    const handleDeleteConfirm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userToDelete || !deleteEmail || !deletePassword) return;

        setIsDeleting(true);
        try {
            const res = await fetch('/api/admin/universal-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: userToDelete.user_id,
                    email: deleteEmail,
                    password: deletePassword,
                    type: 'perfil'
                })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Error al eliminar');

            toast.success('Usuario eliminado correctamente');

            // Log activity
            await logActivity({
                action: 'delete',
                entityType: 'profile',
                entityId: 0,
                entityName: userToDelete.nombre,
                details: { deleted_by_admin: deleteEmail }
            });

            // Refresh
            setTimeout(() => {
                window.location.reload();
            }, 1000);

        } catch (error: any) {
            toast.error(error.message);
            setIsDeleting(false);
        }
    };

    const openDeleteModal = (profile: Profile) => {
        setUserToDelete(profile);
        setDeleteEmail('');
        setDeletePassword('');
        setDeleteModalOpen(true);
    };

    interface Profile {
        user_id: string;
        nombre: string;
        apellido?: string;
        email: string;
        telefono?: string;
        rol: 'admin' | 'empleado' | 'gestor';
        activo: boolean;
        created_at: string;
    }



    const columns: Column<Profile>[] = [
        {
            key: 'nombre',
            label: 'Nombre',
            render: (row) => (
                <div>
                    <div className="font-medium text-gray-900">{row.nombre} {row.apellido || ''}</div>
                    <div className="text-xs text-gray-400">ID: {row.user_id.slice(0, 8)}...</div>
                </div>
            ),
        },
        {
            key: 'telefono',
            label: 'Teléfono',
            render: (row) => <span className="text-gray-600">{row.telefono || '-'}</span>,
        },
        {
            key: 'email',
            label: 'Email',
            render: (row) => <span className="text-gray-600">{row.email}</span>,
        },
        {
            key: 'rol',
            label: 'Rol',
            render: (row) => (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize
                    ${row.rol === 'admin' ? 'bg-purple-100 text-purple-800' :
                        row.rol === 'gestor' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                    {row.rol}
                </span>
            ),
        },
        {
            key: 'activo',
            label: 'Estado',
            render: (row) => (
                <button
                    onClick={() => handleToggleStatus(row)}
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer transition hover:opacity-80
                    ${row.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                    title="Click para cambiar estado"
                >
                    {row.activo ? 'Activo' : 'Inactivo'}
                </button>
            ),
        },
        {
            key: 'user_id', // Virtual key for actions
            label: 'Acciones',
            render: (row) => (
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => handleOpenEdit(row)}
                        className="p-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                        title="Editar Datos"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                    <button
                        onClick={() => handleOpenPasswordReset(row)}
                        className="p-1.5 rounded-full bg-yellow-50 text-yellow-600 hover:bg-yellow-100 transition-colors"
                        title="Restablecer Contraseña"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11.536 17l-2.071-2.071 2.828-2.828-2.828-2.828-2.828 2.828L5 11l4.293-4.293A6 6 0 0115 7z" />
                        </svg>
                    </button>
                    <button
                        onClick={() => openDeleteModal(row)}
                        className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                        title="Eliminar Usuario"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-xl font-bold text-neutral-900">
                    Gestión de Perfiles
                </h1>
                <button
                    onClick={handleOpenCreate}
                    className="flex items-center gap-2 bg-yellow-400 text-neutral-950 px-4 py-2 rounded-lg hover:bg-yellow-500 transition font-medium shadow-sm"
                >
                    <UserPlus className="w-5 h-5" />
                    Nuevo Usuario
                </button>
            </div>

            <DataTable
                data={profiles}
                columns={columns}
                keyExtractor={(row) => row.user_id}
                storageKey="perfiles"
                loading={loading}
                emptyMessage="No hay usuarios registrados"
            />

            {/* Create User Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-neutral-900">
                                Crear Nuevo Usuario
                            </h3>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="text-gray-400 hover:text-gray-600 font-bold text-xl"
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleCreateUser} className="p-6 space-y-4" autoComplete="off">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition"
                                        value={createFormData.nombre}
                                        onChange={e => setCreateFormData({ ...createFormData, nombre: e.target.value })}
                                        placeholder="Ej. Juan"
                                        autoComplete="off"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Apellido (Opcional)</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition"
                                        value={createFormData.apellido}
                                        onChange={e => setCreateFormData({ ...createFormData, apellido: e.target.value })}
                                        placeholder="Ej. Pérez"
                                        autoComplete="off"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono (Opcional)</label>
                                <input
                                    type="tel"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition"
                                    value={createFormData.telefono}
                                    onChange={e => setCreateFormData({ ...createFormData, telefono: e.target.value })}
                                    placeholder="600 000 000"
                                    autoComplete="off"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition"
                                    value={createFormData.email}
                                    onChange={e => setCreateFormData({ ...createFormData, email: e.target.value })}
                                    placeholder="usuario@serincosol.com"
                                    autoComplete="off"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                                    <input
                                        type="password"
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition"
                                        value={createFormData.password}
                                        onChange={e => setCreateFormData({ ...createFormData, password: e.target.value })}
                                        placeholder="******"
                                        minLength={6}
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar</label>
                                    <input
                                        type="password"
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition"
                                        value={createFormData.confirmPassword}
                                        onChange={e => setCreateFormData({ ...createFormData, confirmPassword: e.target.value })}
                                        placeholder="******"
                                        minLength={6}
                                        autoComplete="new-password"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                                <select
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none bg-white font-medium"
                                    value={createFormData.rol}
                                    onChange={e => setCreateFormData({ ...createFormData, rol: e.target.value as any })}
                                >
                                    <option value="gestor">Gestor</option>
                                    <option value="admin">Administrador</option>
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                    {createFormData.rol === 'admin' ? '⚠️ Acceso total al sistema' :
                                        'ℹ️ Gestión de incidencias, morosidad y comunidades asignadas'}
                                </p>
                            </div>

                            <div className="pt-4 flex gap-3 justify-end border-t border-gray-100 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="px-6 py-2 bg-yellow-400 text-neutral-950 rounded-lg hover:bg-yellow-500 transition font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {processing ? (
                                        <>
                                            <span className="animate-spin h-4 w-4 border-2 border-neutral-950 border-t-transparent rounded-full"></span>
                                            Creando...
                                        </>
                                    ) : (
                                        <>
                                            <UserPlus className="w-4 h-4" />
                                            Crear Usuario
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {showEditModal && selectedProfile && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-neutral-900">
                                Editar Usuario
                            </h3>
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="text-gray-400 hover:text-gray-600 font-bold text-xl"
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleUpdateProfile} className="p-6 space-y-4" autoComplete="off">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition"
                                        value={editFormData.nombre}
                                        onChange={e => setEditFormData({ ...editFormData, nombre: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Apellido</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition"
                                        value={editFormData.apellido}
                                        onChange={e => setEditFormData({ ...editFormData, apellido: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                                <input
                                    type="tel"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition"
                                    value={editFormData.telefono}
                                    onChange={e => setEditFormData({ ...editFormData, telefono: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-xs text-gray-400">(No editable)</span></label>
                                <input
                                    type="email"
                                    disabled
                                    className="w-full px-3 py-2 border border-gray-200 bg-gray-100 rounded-lg text-gray-500 cursor-not-allowed"
                                    value={editFormData.email}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                                <select
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none bg-white font-medium"
                                    value={editFormData.rol}
                                    onChange={e => setEditFormData({ ...editFormData, rol: e.target.value as any })}
                                >
                                    <option value="gestor">Gestor</option>
                                    <option value="admin">Administrador</option>
                                </select>
                            </div>

                            <div className="pt-4 flex gap-3 justify-end border-t border-gray-100 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowEditModal(false)}
                                    className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="px-6 py-2 bg-yellow-400 text-neutral-950 rounded-lg hover:bg-yellow-500 transition font-bold shadow-sm disabled:opacity-50 flex items-center gap-2"
                                >
                                    {processing ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Password Reset Modal */}
            {showPasswordModal && selectedProfile && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <div>
                                <h3 className="text-lg font-bold text-neutral-900">
                                    Restablecer Contraseña
                                </h3>
                                <p className="text-xs text-gray-500">Para: {selectedProfile.nombre}</p>
                            </div>
                            <button
                                onClick={() => setShowPasswordModal(false)}
                                className="text-gray-400 hover:text-gray-600 font-bold text-xl"
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleSavePassword} className="p-6 space-y-4" autoComplete="off">
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label>
                                    <input
                                        type="password"
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition"
                                        value={passwordFormData.password}
                                        onChange={e => setPasswordFormData({ ...passwordFormData, password: e.target.value })}
                                        placeholder="Min. 6 caracteres"
                                        minLength={6}
                                        autoComplete="new-password"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar</label>
                                    <input
                                        type="password"
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition"
                                        value={passwordFormData.confirmPassword}
                                        onChange={e => setPasswordFormData({ ...passwordFormData, confirmPassword: e.target.value })}
                                        placeholder="Repetir contraseña"
                                        minLength={6}
                                        autoComplete="new-password"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3 justify-end border-t border-gray-100 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowPasswordModal(false)}
                                    className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="px-6 py-2 bg-yellow-400 text-neutral-950 rounded-lg hover:bg-yellow-500 transition font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {processing ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteModalOpen && userToDelete && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                        <h3 className="text-lg font-bold mb-4 text-neutral-900">Confirmar Eliminación</h3>
                        <p className="text-gray-600 mb-4">
                            ¿Estás seguro de que deseas ELIMINAR DEFINITIVAMENTE al usuario <span className="font-bold">{userToDelete.nombre}</span>?
                            <br /><br />
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
                                        setDeleteModalOpen(false);
                                        setDeleteEmail('');
                                        setDeletePassword('');
                                        setUserToDelete(null);
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
                                    {isDeleting ? 'Eliminando...' : 'Eliminar Usuario'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

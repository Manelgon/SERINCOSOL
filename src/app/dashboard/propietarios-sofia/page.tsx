'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { supabaseSecondary } from '@/lib/supabaseSecondaryClient';
import { toast } from 'react-hot-toast';
import { Users, Building, Plus, X, Loader2, Power, Send, RotateCcw, MessageSquare } from 'lucide-react';
import DataTable, { Column } from '@/components/DataTable';
import SearchableSelect from '@/components/SearchableSelect';

interface Propietario {
    id: number;
    id_comunidad: number | null;
    codigo_comunidad: string | null;
    comunidad: string | null;
    nombre_cliente: string | null;
    apellid_cliente: string | null;
    direccion_postal: string | null;
    mail: string | null;
    telefono: string | null;
    contestacion: boolean | string | null;
}

interface Comunidad {
    id: number;
    nombre_cdad: string;
    codigo: string;
}

export default function PropietariosSofiaPage() {
    const [propietarios, setPropietarios] = useState<Propietario[]>([]);
    const [comunidades, setComunidades] = useState<Comunidad[]>([]);
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

    const [isUpdatingStatus, setIsUpdatingStatus] = useState<number | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        id_comunidad: '',
        codigo_comunidad: '',
        comunidad: '',
        nombre_cliente: '',
        apellid_cliente: '',
        mail: '',
        telefono: '',
        direccion_postal: '',
        contestacion: 'Activada'
    });

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            await Promise.all([fetchComunidades(), fetchPropietarios()]);
            setLoading(false);
        };
        fetchData();
    }, []);

    const fetchComunidades = async () => {
        try {
            const { data, error } = await supabase
                .from('comunidades')
                .select('id, nombre_cdad, codigo')
                .eq('activo', true);

            if (error) throw error;
            setComunidades(data || []);
        } catch (err) {
            console.error('Error fetching communities:', err);
        }
    };

    const fetchPropietarios = async () => {
        try {
            const { data, error } = await supabaseSecondary
                .from('propietarios')
                .select('*')
                .order('id', { ascending: false });

            if (error) {
                console.error('Error fetching propietarios:', error);
                toast.error('Error al cargar propietarios de Sofia');
            } else {
                setPropietarios(data || []);
            }
        } catch (err) {
            console.error('Fetch error:', err);
            toast.error('Error de conexión');
        }
    };

    const toggleContestacion = async (id: number, newValue: boolean | null) => {
        if (isUpdatingStatus === id) return;
        setIsUpdatingStatus(id);

        try {
            const { error } = await supabaseSecondary
                .from('propietarios')
                .update({ contestacion: newValue })
                .eq('id', id);

            if (error) throw error;

            const statusLabel = newValue === true ? 'Activada' : (newValue === false ? 'Desactivada' : 'Pendiente');
            toast.success(`Estado actualizado a ${statusLabel}`);
            setPropietarios(prev => prev.map(p => p.id === id ? { ...p, contestacion: newValue } : p));
        } catch (error: any) {
            console.error('Error updating status:', error);
            toast.error('Error al actualizar estado');
        } finally {
            setIsUpdatingStatus(null);
        }
    };

    const columns: Column<Propietario>[] = [
        { key: 'id', label: 'ID' },
        {
            key: 'codigo_comunidad',
            label: 'Código',
            render: (row) => {
                const isLinked = comunidades.some(c => c.codigo === row.codigo_comunidad);
                return (
                    <div className="flex items-start gap-3 text-xs">
                        <span className={`mt-1 h-3.5 w-1.5 rounded-full ${isLinked ? 'bg-neutral-900' : 'bg-yellow-400'}`} />
                        <span className="font-semibold">{row.codigo_comunidad || '-'}</span>
                    </div>
                );
            }
        },
        {
            key: 'id_comunidad' as any,
            label: 'Comunidad (Panel)',
            render: (row) => {
                const cdad = comunidades.find(c => c.codigo === row.codigo_comunidad);
                if (cdad) {
                    return (
                        <div className="flex items-center gap-2 font-medium bg-neutral-100 px-3 py-1 rounded-full text-[13px]">
                            <Building className="w-3.5 h-3.5 text-neutral-600" />
                            <span>{cdad.nombre_cdad}</span>
                        </div>
                    );
                }
                return <span className="text-neutral-400 italic text-xs">No enlazada</span>;
            }
        },
        {
            key: 'nombre_cliente',
            label: 'Propietario',
            render: (row) => (
                <div className="flex flex-col">
                    <span className="font-semibold text-neutral-900 text-[13px]">{row.nombre_cliente} {row.apellid_cliente}</span>
                    <span className="text-[11px] text-neutral-500 uppercase tracking-wider">{row.mail || '-'}</span>
                </div>
            )
        },
        {
            key: 'telefono',
            label: 'Teléfono',
            render: (row) => <span className="text-xs font-medium">{row.telefono || '-'}</span>
        },
        {
            key: 'direccion_postal',
            label: 'Dirección',
            render: (row) => <div className="max-w-[200px] truncate text-[11px] text-neutral-500" title={row.direccion_postal || ''}>{row.direccion_postal || '-'}</div>
        },
        {
            key: 'contestacion',
            label: 'Contestación',
            render: (row) => {
                const isTrue = row.contestacion === true || row.contestacion === 'true';
                const isFalse = row.contestacion === false || row.contestacion === 'false';

                return (
                    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${isTrue
                        ? 'bg-emerald-100 text-emerald-700'
                        : isFalse ? 'bg-red-100 text-red-700' : 'bg-yellow-400 text-neutral-950'
                        }`}
                    >
                        {isTrue ? 'Activada' : (isFalse ? 'Desactivada' : 'Pendiente')}
                    </span>
                );
            }
        },
        {
            key: 'actions' as any,
            label: 'Acciones',
            render: (row) => {
                const isTrue = row.contestacion === true || row.contestacion === 'true';
                const isFalse = row.contestacion === false || row.contestacion === 'false';

                return (
                    <div className="flex items-center gap-2">
                        {isTrue && (
                            <button
                                onClick={() => toggleContestacion(row.id, false)}
                                disabled={isUpdatingStatus === row.id}
                                className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                                title="Desactivar"
                            >
                                {isUpdatingStatus === row.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Power className="w-4 h-4" />
                                )}
                            </button>
                        )}
                        {isFalse && (
                            <>
                                <button
                                    onClick={() => toggleContestacion(row.id, true)}
                                    disabled={isUpdatingStatus === row.id}
                                    className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-colors"
                                    title="Volver a Activar"
                                >
                                    {isUpdatingStatus === row.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <RotateCcw className="w-4 h-4" />
                                    )}
                                </button>
                                <button
                                    onClick={() => toast.success('Función de envío de mensaje próximamente')}
                                    className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                                    title="Enviar Mensaje"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </>
                        )}
                        {!isTrue && !isFalse && (
                            <button
                                onClick={() => toggleContestacion(row.id, true)}
                                disabled={isUpdatingStatus === row.id}
                                className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-colors"
                                title="Activar (Provisional)"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                );
            }
        }
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.id_comunidad) return toast.error('Selecciona una comunidad');
        if (!formData.nombre_cliente) return toast.error('Escribe el nombre del propietario');

        setIsSubmitting(true);
        const loadingToastId = toast.loading('Guardando propietario...');

        try {
            const { error } = await supabaseSecondary.from('propietarios').insert([{
                codigo_comunidad: formData.codigo_comunidad,
                comunidad: formData.comunidad,
                nombre_cliente: formData.nombre_cliente,
                apellid_cliente: formData.apellid_cliente,
                mail: formData.mail,
                telefono: formData.telefono,
                direccion_postal: formData.direccion_postal,
                contestacion: formData.contestacion === 'Activada' ? true : (formData.contestacion === 'Desactivada' ? false : null)
                // id_comunidad is omitted intentionally to avoid FK error with empty communities table in secondary DB
            }]);

            if (error) throw error;

            toast.success('Propietario guardado correctamente');
            setShowForm(false);
            setFormData({
                id_comunidad: '',
                codigo_comunidad: '',
                comunidad: '',
                nombre_cliente: '',
                apellid_cliente: '',
                mail: '',
                telefono: '',
                direccion_postal: '',
                contestacion: 'Activada'
            });
            fetchPropietarios();
        } catch (error: any) {
            console.error('Error saving propietario:', error);
            toast.error('Error al guardar: ' + error.message);
        } finally {
            toast.dismiss(loadingToastId);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center gap-4">
                <h1 className="text-xl font-bold text-neutral-900">Propietarios Sofia</h1>
                <button
                    onClick={() => setShowForm(true)}
                    className="bg-yellow-400 hover:bg-yellow-500 text-neutral-950 px-4 py-2 rounded-md flex items-center gap-2 transition font-semibold text-sm"
                >
                    <Plus className="w-4 h-4" />
                    Nuevo Propietario
                </button>
            </div>

            {showForm && (
                <div
                    className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-0 sm:p-4 md:p-8 backdrop-blur-sm overflow-y-auto"
                    onClick={() => setShowForm(false)}
                >
                    <div
                        className="w-full sm:w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[85vh] bg-white rounded-none sm:rounded-xl shadow-xl flex flex-col animate-in fade-in zoom-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-slate-900">
                                Registrar Nuevo Propietario
                            </h2>
                            <button
                                onClick={() => setShowForm(false)}
                                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar">
                            <form id="propietario-form" onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Comunidad <span className="text-red-600">*</span></label>
                                    <SearchableSelect
                                        value={formData.id_comunidad}
                                        onChange={(val) => {
                                            const cdad = comunidades.find(c => String(c.id) === String(val));
                                            setFormData({
                                                ...formData,
                                                id_comunidad: String(val),
                                                codigo_comunidad: cdad?.codigo || '',
                                                comunidad: cdad?.nombre_cdad || ''
                                            });
                                        }}
                                        options={comunidades.map(cd => ({
                                            value: String(cd.id),
                                            label: cd.codigo ? `${cd.codigo} - ${cd.nombre_cdad}` : cd.nombre_cdad
                                        }))}
                                        placeholder="Buscar comunidad por nombre o código..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Nombre <span className="text-red-600">*</span></label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="Nombre"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                        value={formData.nombre_cliente}
                                        onChange={e => setFormData({ ...formData, nombre_cliente: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Apellidos</label>
                                    <input
                                        type="text"
                                        placeholder="Apellidos"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                        value={formData.apellid_cliente}
                                        onChange={e => setFormData({ ...formData, apellid_cliente: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Teléfono</label>
                                    <input
                                        type="tel"
                                        placeholder="Ej: 600000000"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                        value={formData.telefono}
                                        onChange={e => setFormData({ ...formData, telefono: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
                                    <input
                                        type="email"
                                        placeholder="ejemplo@correo.com"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                        value={formData.mail}
                                        onChange={e => setFormData({ ...formData, mail: e.target.value })}
                                    />
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Dirección Postal</label>
                                    <input
                                        type="text"
                                        placeholder="Calle, número, piso..."
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                        value={formData.direccion_postal}
                                        onChange={e => setFormData({ ...formData, direccion_postal: e.target.value })}
                                    />
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Contestación / Estado</label>
                                    <div className="flex items-center gap-6 mt-2">
                                        {['Activada', 'Desactivada'].map((option) => (
                                            <label key={option} className="flex items-center gap-2 cursor-pointer group">
                                                <input
                                                    type="radio"
                                                    name="contestacion"
                                                    checked={formData.contestacion === option}
                                                    onChange={() => setFormData({ ...formData, contestacion: option })}
                                                    className="w-4 h-4 text-slate-900 border-slate-300 focus:ring-slate-900/20"
                                                />
                                                <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">{option}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </form>
                        </div>

                        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100">
                            <button
                                form="propietario-form"
                                type="submit"
                                disabled={isSubmitting || !formData.id_comunidad || !formData.nombre_cliente}
                                className="w-full sm:w-auto h-12 px-8 bg-yellow-400 hover:bg-yellow-500 text-neutral-950 rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm hover:shadow-md active:scale-[0.98]"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-5 h-5" />
                                        Guardar Propietario
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <DataTable
                data={propietarios}
                columns={columns}
                keyExtractor={(row) => row.id}
                storageKey="sofia_propietarios_v2"
                loading={loading}
                emptyMessage="No hay propietarios registrados"
                selectable={false}
            />
        </div>
    );
}

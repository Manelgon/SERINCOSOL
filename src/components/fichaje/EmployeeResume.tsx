import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Download, FileText, Calendar, Clock, AlertCircle, Send, X, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ResumeData {
    user: string;
    month: string;
    total_hours: number;
    worked_days: number;
    days: {
        date: string;
        hours: number;
        entries: { start: string; end: string | null; closed_by: string }[];
    }[];
}

interface EmployeeResumeProps {
    userId?: string;
    allowExport?: boolean;
}

export default function EmployeeResume({ userId, allowExport = false }: EmployeeResumeProps) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<ResumeData | null>(null);
    const [month, setMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    // Send Modal State
    const [showSendModal, setShowSendModal] = useState(false);
    const [email, setEmail] = useState('');
    const [sending, setSending] = useState(false);

    useEffect(() => {
        fetchResume();
    }, [month, userId]);

    const fetchResume = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const targetId = userId || user.id;

            const res = await fetch(`/api/fichaje/resumen?user_id=${targetId}&month=${month}`);
            if (!res.ok) throw new Error("Error cargando resumen");
            const json = await res.json();
            setData(json);
        } catch (error) {
            console.error(error);
            toast.error("Error al cargar el resumen");
        } finally {
            setLoading(false);
        }
    };

    const handleExport = (type: 'csv' | 'pdf') => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;
            const targetId = userId || user.id;
            const url = `/api/fichaje/export/${type}?user_id=${targetId}&month=${month}`;

            const a = document.createElement('a');
            a.href = url;
            a.download = `resumen_${month}.${type}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    };

    const handleSendClick = () => {
        setShowSendModal(true);
    };

    const confirmSend = async () => {
        if (!email) {
            toast.error("Introduce un email");
            return;
        }
        setSending(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const targetId = userId || user?.id;

            const res = await fetch('/api/fichaje/export/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: targetId,
                    month,
                    toEmail: email
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Error enviando email");
            }

            toast.success("Resumen enviado correctamente");
            setShowSendModal(false);
            setEmail('');
        } catch (error: any) {
            console.error(error);
            toast.error(error.message);
        } finally {
            setSending(false);
        }
    };

    if (loading && !data) {
        return <div className="p-8 text-center text-neutral-500">Cargando resumen...</div>;
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500 relative">
            {/* Filters & Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-neutral-100">
                <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-neutral-500" />
                    <input
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="border-neutral-200 rounded-md text-sm focus:ring-yellow-400 focus:border-yellow-400"
                    />
                </div>

                {allowExport && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleExport('csv')}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-700 rounded-lg text-sm font-medium transition"
                        >
                            <FileText className="w-4 h-4 text-green-600" />
                            CSV
                        </button>
                        <button
                            onClick={() => handleExport('pdf')}
                            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-sm font-medium transition"
                        >
                            <Download className="w-4 h-4 text-yellow-400" />
                            PDF
                        </button>
                        <button
                            onClick={handleSendClick}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
                        >
                            <Send className="w-4 h-4" />
                            Enviar
                        </button>
                    </div>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-neutral-100">
                    <p className="text-sm text-neutral-500 mb-1">Total Horas</p>
                    <p className="text-2xl font-bold text-neutral-900">{data?.total_hours || 0} h</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-neutral-100">
                    <p className="text-sm text-neutral-500 mb-1">Días Trabajados</p>
                    <p className="text-2xl font-bold text-neutral-900">{data?.worked_days || 0}</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-neutral-100">
                    <p className="text-sm text-neutral-500 mb-1">Media Diaria</p>
                    <p className="text-2xl font-bold text-neutral-900">
                        {data?.worked_days ? (data.total_hours / data.worked_days).toFixed(2) : 0} h/día
                    </p>
                </div>
            </div>

            {/* Detail Table */}
            <div className="bg-white rounded-xl shadow-sm border border-neutral-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-neutral-50 text-neutral-500 font-semibold border-b border-neutral-100">
                            <tr>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4">Entradas / Salidas</th>
                                <th className="px-6 py-4">Total Día</th>
                                <th className="px-6 py-4">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {data?.days.map((day) => (
                                <tr key={day.date} className="hover:bg-neutral-50 transition">
                                    <td className="px-6 py-4 font-medium text-neutral-900">
                                        {new Date(day.date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="space-y-1">
                                            {day.entries.map((entry, idx) => (
                                                <div key={idx} className="flex items-center gap-2 text-neutral-600">
                                                    <Clock className="w-3 h-3" />
                                                    <span>{entry.start} - {entry.end || 'En curso'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-bold text-neutral-900">
                                        {day.hours.toFixed(2)} h
                                    </td>
                                    <td className="px-6 py-4">
                                        {day.entries.some(e => e.closed_by === 'auto') ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs">
                                                <AlertCircle className="w-3 h-3" />
                                                Autocierre
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                                                Correcto
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {!data?.days.length && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-neutral-400">
                                        No hay registros para este mes
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* SEND MODAL */}
            {showSendModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden p-6">
                        <div className="flex justify-between items-start mb-6">
                            <h3 className="text-xl font-bold text-neutral-900">Enviar Documento</h3>
                            <button
                                onClick={() => setShowSendModal(false)}
                                className="text-neutral-400 hover:text-neutral-600 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4 mb-8">
                            <div className="space-y-2">
                                <label className="text-sm text-neutral-600">Enviar a:</label>
                                <input
                                    type="email"
                                    autoFocus
                                    className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowSendModal(false)}
                                className="px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition"
                                disabled={sending}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmSend}
                                disabled={sending}
                                className="px-5 py-2 text-sm font-medium text-neutral-950 bg-yellow-400 hover:bg-yellow-500 rounded-lg transition flex items-center gap-2 disabled:opacity-50 shadow-sm"
                            >
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Enviar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

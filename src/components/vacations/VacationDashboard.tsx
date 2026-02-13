"use client";

import { useEffect, useState } from "react";
import { Calendar, CheckCircle2, Clock, AlertCircle, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "react-hot-toast";
import RequestVacationModal from "./RequestVacationModal";

interface VacationStatus {
    balance: {
        vacaciones: { total: number; used: number; pending: number };
        retribuidos: { total: number; used: number; pending: number };
        noRetribuidos: { total: number; used: number; pending: number };
    };
    policy: { count_holidays: boolean; count_weekends: boolean };
}

export default function VacationDashboard() {
    const [status, setStatus] = useState<VacationStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<any[]>([]);
    const [activeMonth, setActiveMonth] = useState(new Date());
    const [dayColors, setDayColors] = useState<Record<string, { color: string; count: number; reason?: string }>>({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        fetchCalendar();
    }, [activeMonth]);

    const fetchData = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return;
            setUserId(session.user.id);

            const [statusRes, historyRes] = await Promise.all([
                fetch(`/api/vacations/status?userId=${session.user.id}`),
                fetch(`/api/vacations/requests?userId=${session.user.id}`)
            ]);

            const statusData = await statusRes.json();
            const historyData = await historyRes.json();

            setStatus(statusData);
            setHistory(historyData);
        } catch (error) {
            toast.error("Error al cargar datos de vacaciones");
        } finally {
            setLoading(false);
        }
    };

    const fetchCalendar = async () => {
        const monthStr = activeMonth.toISOString().slice(0, 7);
        try {
            const res = await fetch(`/api/vacations/calendar?month=${monthStr}`);
            const data = await res.json();
            setDayColors(data.days || {});
        } catch (error) {
            console.error("Calendar fetch error", error);
        }
    };

    const renderCalendar = () => {
        const year = activeMonth.getFullYear();
        const month = activeMonth.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const startOffset = firstDay === 0 ? 6 : firstDay - 1;

        const days = [];
        for (let i = 0; i < startOffset; i++) {
            days.push(<div key={`empty-${i}`} className="h-10 md:h-16" />);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
            const dayInfo = dayColors[dateStr] || { color: 'green' };

            const colorClasses = {
                green: "bg-green-50 border-green-200 text-green-700",
                amber: "bg-amber-50 border-amber-200 text-amber-700",
                red: "bg-red-50 border-red-200 text-red-700",
            };

            days.push(
                <div
                    key={i}
                    className={`h-10 md:h-16 border rounded-lg p-1 md:p-2 flex flex-col justify-between transition-colors ${colorClasses[dayInfo.color as keyof typeof colorClasses]}`}
                    title={dayInfo.reason || ""}
                >
                    <span className="text-xs md:text-sm font-bold">{i}</span>
                </div>
            );
        }

        return days;
    };

    if (loading) return <div className="p-8 text-center text-neutral-500">Cargando vacaciones...</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Row 1: Calendar + Narrow Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-8 gap-6">
                {/* Main Calendar Card */}
                <div className="lg:col-span-7 bg-white p-6 rounded-xl shadow-md border border-neutral-100 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-yellow-500" />
                            Disponibilidad
                        </h2>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1 text-[10px] md:text-xs">
                                <div className="w-3 h-3 bg-green-100 border border-green-200 rounded" /> Libre
                                <div className="w-3 h-3 bg-amber-100 border border-amber-200 rounded ml-2" /> Ocupado
                                <div className="w-3 h-3 bg-red-100 border border-red-200 rounded ml-2" /> Lleno
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setActiveMonth(new Date(activeMonth.getFullYear(), activeMonth.getMonth() - 1))}
                                    className="p-1 hover:bg-neutral-100 rounded"
                                >
                                    <ChevronLeft className="w-4 h-4 md:w-5 h-5" />
                                </button>
                                <span className="text-xs md:text-sm font-bold min-w-[100px] text-center capitalize">
                                    {activeMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                                </span>
                                <button
                                    onClick={() => setActiveMonth(new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1))}
                                    className="p-1 hover:bg-neutral-100 rounded"
                                >
                                    <ChevronRight className="w-4 h-4 md:w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
                        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                            <div key={d} className="text-center text-[10px] font-bold text-neutral-400 py-2 uppercase">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 md:gap-2 flex-grow">
                        {renderCalendar()}
                    </div>

                    <button
                        className="w-full mt-6 bg-yellow-400 hover:bg-yellow-500 text-neutral-950 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition"
                        onClick={() => setIsModalOpen(true)}
                    >
                        <Plus className="w-5 h-5" /> Solicitar Días
                    </button>
                </div>

                <div className="lg:col-span-1 flex flex-col gap-4">
                    {/* Balance Cards distributed to fill the height */}
                    {[
                        { label: "Vacaciones", val: status?.balance.vacaciones },
                        { label: "Retribuidos", val: status?.balance.retribuidos },
                        { label: "No Retrib.", val: status?.balance.noRetribuidos }
                    ].map((item, idx) => (
                        <div key={idx} className="p-3 rounded-xl border border-neutral-100 shadow-sm bg-white flex flex-col justify-center min-h-[120px]">
                            <p className="text-[9px] font-bold text-neutral-400 uppercase mb-2">{item.label}</p>
                            <div className="space-y-2">
                                <div className="flex items-baseline justify-between border-b border-neutral-50 pb-1">
                                    <span className="text-xl font-bold text-neutral-900">
                                        {item.val ? item.val.total - item.val.used - item.val.pending : 0}
                                    </span>
                                    <span className="text-[9px] font-bold text-neutral-400 uppercase">disp.</span>
                                </div>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-xl font-bold text-blue-600">
                                        {item.val?.used || 0}
                                    </span>
                                    <span className="text-[9px] font-bold text-neutral-400 uppercase">usados</span>
                                </div>
                                {item.val && item.val.pending > 0 && (
                                    <div className="flex justify-between items-center pt-1">
                                        <span className="text-[8px] font-bold text-amber-600 uppercase">Pendiente</span>
                                        <span className="text-xs font-bold text-amber-600">{item.val.pending}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Row 2: My Requests below */}
            <div className="grid grid-cols-1 lg:grid-cols-8 gap-6">
                <div className="lg:col-span-7 bg-white p-6 rounded-xl shadow-md border border-neutral-100">
                    <h2 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-neutral-400" />
                        Mis Solicitudes
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {history.length === 0 ? (
                            <p className="text-sm text-neutral-400 text-center py-8 col-span-full">No tienes solicitudes pendientes ni pasadas.</p>
                        ) : (
                            history.map((req: any) => (
                                <div key={req.id} className="p-3 rounded-lg border border-neutral-100 bg-neutral-50/50">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{req.type}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${req.status === 'APROBADA' ? 'bg-green-100 text-green-700' :
                                            req.status === 'RECHAZADA' ? 'bg-red-100 text-red-700' :
                                                'bg-yellow-100 text-yellow-700'
                                            }`}>
                                            {req.status}
                                        </span>
                                    </div>
                                    <p className="text-sm font-semibold text-neutral-800">
                                        {new Date(req.date_from).toLocaleDateString()} - {new Date(req.date_to).toLocaleDateString()}
                                    </p>
                                    <p className="text-xs text-neutral-500">{req.days_count} días naturales</p>
                                    {req.comment_admin && (
                                        <div className="mt-2 p-2 bg-white rounded border border-neutral-100 text-[10px] text-neutral-600 italic">
                                            Admin: {req.comment_admin}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {status && userId && (
                <RequestVacationModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={fetchData}
                    userId={userId}
                    policy={status.policy}
                />
            )}
        </div>
    );
}

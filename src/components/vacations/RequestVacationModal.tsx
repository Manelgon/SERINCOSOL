"use client";

import { useState, useEffect } from "react";
import { X, Calendar, AlertCircle } from "lucide-react";
import { toast } from "react-hot-toast";

interface BalanceInfo {
    total: number;
    used: number;
    pending: number;
}

interface RequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    userId: string;
    policy: { count_holidays: boolean; count_weekends: boolean };
    balance: {
        vacaciones: BalanceInfo;
        retribuidos: BalanceInfo;
        noRetribuidos: BalanceInfo;
    };
}

export default function RequestVacationModal({ isOpen, onClose, onSuccess, userId, policy, balance }: RequestModalProps) {
    const [type, setType] = useState("VACACIONES");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [daysCount, setDaysCount] = useState(0);
    const [comment, setComment] = useState("");
    const [loading, setLoading] = useState(false);

    const getAvailable = () => {
        if (type === "VACACIONES") return balance.vacaciones.total - balance.vacaciones.used - balance.vacaciones.pending;
        if (type === "RETRIBUIDO") return balance.retribuidos.total - balance.retribuidos.used - balance.retribuidos.pending;
        return 99; // No limit for non-paid
    };

    const available = getAvailable();
    const isOverLimit = type !== "NO_RETRIBUIDO" && daysCount > available;

    useEffect(() => {
        if (dateFrom && dateTo) {
            calculateDays();
        } else {
            setDaysCount(0);
        }
    }, [dateFrom, dateTo]);

    const calculateDays = () => {
        const start = new Date(dateFrom);
        const end = new Date(dateTo);
        if (end < start) return setDaysCount(0);

        let count = 0;
        let current = new Date(start);
        while (current <= end) {
            const dayOfWeek = current.getDay(); // 0 = Sunday, 6 = Saturday
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            // Logic: only count if policy says so, or if it's a weekday
            if (!isWeekend || policy.count_weekends) {
                count++;
            }
            current.setDate(current.getDate() + 1);
        }
        setDaysCount(count);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (daysCount <= 0) return toast.error("El rango de fechas no es válido");
        if (isOverLimit) return toast.error("No tienes suficientes días disponibles");

        setLoading(true);
        try {
            const res = await fetch("/api/vacations/requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    type,
                    dateFrom,
                    dateTo,
                    daysCount,
                    commentUser: comment
                })
            });

            const data = await res.json();
            if (res.ok) {
                toast.success("Solicitud enviada correctamente");
                onSuccess();
                onClose();
            } else {
                toast.error(data.error || "Error al enviar solicitud");
            }
        } catch (error) {
            toast.error("Error de red");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-neutral-50">
                    <h3 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-yellow-500" />
                        Solicitar Días
                    </h3>
                    <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="flex justify-between items-end gap-4">
                        <div className="flex-grow space-y-1">
                            <label className="text-xs font-bold text-neutral-500 uppercase">Tipo de Solicitud</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                                className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-yellow-400 outline-none transition"
                            >
                                <option value="VACACIONES">Vacaciones Anuales</option>
                                <option value="RETRIBUIDO">Días Retribuidos (Propios)</option>
                                <option value="NO_RETRIBUIDO">Días No Retribuidos</option>
                            </select>
                        </div>
                        <div className="shrink-0 text-right pb-1">
                            <p className="text-[10px] font-bold text-neutral-400 uppercase">Disponible</p>
                            <p className={`text-lg font-bold ${available <= 0 ? 'text-red-500' : 'text-green-600'}`}>
                                {available} {available === 1 ? 'día' : 'días'}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-neutral-500 uppercase">Desde</label>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-yellow-400 outline-none transition"
                                required
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-neutral-500 uppercase">Hasta</label>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-yellow-400 outline-none transition"
                                required
                            />
                        </div>
                    </div>

                    {daysCount > 0 && (
                        <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${isOverLimit ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${isOverLimit ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                                    {daysCount}
                                </div>
                                <div>
                                    <p className={`text-sm font-semibold ${isOverLimit ? 'text-red-900' : 'text-blue-900'}`}>
                                        {isOverLimit ? 'Superas los días disponibles' : 'Total de días a solicitar'}
                                    </p>
                                    <p className="text-[10px] text-neutral-500 uppercase">
                                        {policy.count_weekends ? "Incluye fines de semana" : "Solo días laborables"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-neutral-500 uppercase">Comentario (Opcional)</label>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-yellow-400 outline-none transition h-24 resize-none"
                            placeholder="Ej: Necesito estos días para trámites personales..."
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 px-4 border border-neutral-200 text-neutral-600 rounded-xl font-bold hover:bg-neutral-50 transition"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading || daysCount <= 0 || isOverLimit}
                            className="flex-[2] py-3 px-4 bg-yellow-400 text-neutral-950 rounded-xl font-bold hover:bg-yellow-500 transition shadow-lg shadow-yellow-200 disabled:opacity-50 disabled:bg-neutral-200 disabled:shadow-none"
                        >
                            {loading ? "Enviando..." : "Enviar Solicitud"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

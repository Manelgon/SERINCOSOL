"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Download, Loader2, FileText, Plus } from "lucide-react";
import SearchableSelect from "@/components/SearchableSelect";
import { createBrowserClient } from "@supabase/ssr";

interface Comunidad {
    id: number;
    codigo: string;
    nombre_cdad: string;
    cif: string;
    direccion: string;
    cp: string;
    ciudad: string;
    provincia: string;
}

export default function VariosForm({ onSuccess }: { onSuccess?: () => void }) {
    const [values, setValues] = useState<Record<string, any>>({
        // Inicializar filas vacías
        fecha_emision: new Date().toISOString().split('T')[0],
        // iva1: 0, iva2: 0, iva3: 0  <-- REMOVED default initialization with 0
    });
    const [status, setStatus] = useState<"idle" | "generating" | "ready" | "sending" | "error">("idle");
    const [pdfUrls, setPdfUrls] = useState<{ factura: string; certificado: string } | null>(null);
    const [submissionIds, setSubmissionIds] = useState<{ factura: number; certificado: number } | null>(null);
    const [toEmail, setToEmail] = useState("");
    const [communities, setCommunities] = useState<Comunidad[]>([]);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        const fetchCommunities = async () => {
            try {
                const { data, error } = await supabase
                    .from('comunidades')
                    .select('*')
                    .eq('activo', true)
                    .order('codigo', { ascending: true });

                if (error) throw error;
                setCommunities(data || []);
            } catch (error) {
                console.error('Error fetching communities:', error);
                toast.error('Error cargando comunidades');
            }
        };
        fetchCommunities();
    }, []);

    const handleChange = (field: string, val: string | number) => {
        setValues(prev => {
            const next = { ...prev, [field]: val };
            // Recalcular autumáticamente
            return calculate(next);
        });
    };

    const handleCommunityChange = (codigo: string) => {
        const comunidad = communities.find(c => c.codigo === codigo);

        setValues(prev => {
            const next = {
                ...prev,
                codigo: codigo,
                nombre_comunidad: comunidad?.nombre_cdad || "",
            };

            if (comunidad) {
                Object.assign(next, {
                    cliente: comunidad.nombre_cdad,
                    // nif: comunidad.cif,  <-- REMOVED as per user request
                    domicilio: comunidad.direccion,
                    cp: comunidad.cp,
                    ciudad: comunidad.ciudad,
                    provincia: comunidad.provincia,
                });
            }

            return calculate(next);
        });
    };

    const calculate = (vals: Record<string, any>) => {
        // Filas
        let sum = 0;
        let vatTotal = 0;

        for (let i = 1; i <= 3; i++) {
            // Helper to parse European numbers (comma -> dot) or fallback to 0
            const n = (v: any) => {
                if (typeof v === "number") return v;
                return Number(String(v || "0").replace(",", ".")) || 0;
            };

            const qty = n(vals[`und${i}`]);
            const price = n(vals[`importe${i}`]);
            const vatRate = n(vals[`iva${i}`]); // Uses row specific VAT

            const sub = qty * price;
            const vat = sub * (vatRate / 100);
            const total = sub + vat;

            vals[`suma${i}`] = total.toFixed(2);

            if (vals[`descripcion${i}`] || qty > 0 || price > 0) { // Sum if active
                sum += sub; // Base Imponible accumulation
                vatTotal += vat;
            }
        }

        vals["importe_total"] = sum.toFixed(2); // Base Imponible
        vals["iva_total"] = vatTotal.toFixed(2);
        vals["suma_final"] = (sum + vatTotal).toFixed(2); // Total Factura

        return vals;
    };

    const generate = async () => {
        setStatus("generating");
        setSubmissionIds(null);
        setPdfUrls(null);

        try {
            const res = await fetch("/api/documentos/varios/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error generando PDF");

            setPdfUrls({
                factura: data.pdfUrlFactura,
                certificado: data.pdfUrlCertificado,
            });
            setSubmissionIds({
                factura: data.submissionIdFactura,
                certificado: data.submissionIdCertificado,
            });

            setStatus("ready");
            toast.success("Documentos generados correctamente ✅");
        } catch (error: any) {
            console.error(error);
            setStatus("error");
            toast.error(error.message);
        }
    };

    const downloadFactura = () => {
        if (pdfUrls?.factura) window.open(pdfUrls.factura, "_blank");
    };

    const downloadCertificado = () => {
        if (pdfUrls?.certificado) window.open(pdfUrls.certificado, "_blank");
    };

    const sendEmail = async () => {
        if (!submissionIds?.factura || !submissionIds?.certificado) return;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!toEmail || !emailRegex.test(toEmail)) {
            toast.error("Introduce un email de destino válido");
            return;
        }

        setStatus("sending");

        try {
            const res = await fetch("/api/documentos/varios/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    submissionIdFactura: submissionIds.factura,
                    submissionIdCertificado: submissionIds.certificado,
                    toEmail
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "Error enviando email");

            setStatus("ready");
            toast.success("Email enviado correctamente ✅");
        } catch (e: any) {
            setStatus("ready");
            toast.error(e?.message || "Error enviando");
        }
    };

    if (status === "ready" || status === "sending") {
        return (
            <div className="flex flex-col h-full overflow-hidden">
                <div className="flex-grow overflow-y-auto custom-scrollbar">
                    <div className="flex flex-col items-center justify-center p-6 sm:p-12 text-center space-y-8 max-w-3xl mx-auto">
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shrink-0 animate-in zoom-in duration-300">
                            <Download className="w-8 h-8" />
                        </div>

                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold text-slate-900">¡Documentos Generados!</h2>
                            <p className="text-slate-600">
                                Se han generado la factura y el certificado correctamente.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 max-w-md mx-auto w-full">
                            <button
                                onClick={downloadFactura}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12 rounded-xl font-bold shadow-sm transition flex items-center justify-center gap-2 active:scale-[0.98]"
                            >
                                <Download className="w-5 h-5" />
                                Descargar Factura
                            </button>

                            <button
                                onClick={downloadCertificado}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12 rounded-xl font-bold shadow-sm transition flex items-center justify-center gap-2 active:scale-[0.98]"
                            >
                                <Download className="w-5 h-5" />
                                Descargar Certificado
                            </button>

                            <div className="h-2"></div>

                            <button
                                onClick={() => { setStatus("idle"); setSubmissionIds(null); setPdfUrls(null); }}
                                className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 h-12 rounded-xl font-bold transition flex items-center justify-center gap-2 active:scale-[0.98]"
                            >
                                Volver al formulario
                            </button>
                            <a
                                href="/dashboard/documentos"
                                className="w-full text-slate-400 hover:text-slate-600 text-sm font-medium transition underline"
                            >
                                Ir al listado
                            </a>
                        </div>

                        {/* Email Section */}
                        <div className="max-w-md mx-auto pt-8 border-t border-slate-100 w-full">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 text-left">Enviar por email</p>
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    placeholder="cliente@ejemplo.com"
                                    value={toEmail}
                                    onChange={(e) => setToEmail(e.target.value)}
                                    className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 transition-all"
                                />
                                <button
                                    onClick={sendEmail}
                                    disabled={status === "sending"}
                                    className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2 rounded-xl text-sm font-bold transition disabled:opacity-50 flex items-center gap-2 shadow-sm"
                                >
                                    {status === "sending" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    Enviar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    const isDisabled = status === "generating";
    const canGenerate = values.codigo && values.cliente && values.nombre_apellidos && values.nif;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Body */}
            <div className="flex-grow overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                <div className="space-y-8 max-w-4xl mx-auto">
                    {/* Cliente */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-base">👤</span>
                            Información del Cliente
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                            <div className="sm:col-span-2 lg:col-span-1">
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Comunidad</label>
                                <SearchableSelect
                                    value={values.codigo || ""}
                                    onChange={(val) => handleCommunityChange(String(val))}
                                    options={communities.map(c => ({
                                        value: c.codigo,
                                        label: `${c.codigo} - ${c.nombre_cdad}`
                                    }))}
                                    placeholder="Selecciona comunidad..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Cliente / Comunidad</label>
                                <input
                                    disabled={isDisabled}
                                    type="text"
                                    placeholder="Nombre de la comunidad"
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                                    value={values.cliente || ""}
                                    onChange={e => handleChange("cliente", e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Nombre y Apellidos</label>
                                <input
                                    disabled={isDisabled}
                                    type="text"
                                    placeholder="Ej: Juan Pérez"
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                                    value={values.nombre_apellidos || ""}
                                    onChange={e => handleChange("nombre_apellidos", e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Tipo Inmueble</label>
                                <select
                                    disabled={isDisabled}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 appearance-none disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                                    value={values.tipo_inmueble || ""}
                                    onChange={(e) => handleChange("tipo_inmueble", e.target.value)}
                                >
                                    <option value="">Seleccionar tipo...</option>
                                    <option value="Vivienda">Vivienda</option>
                                    <option value="Trastero">Trastero</option>
                                    <option value="Aparcamiento">Aparcamiento</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">NIF</label>
                                <input
                                    disabled={isDisabled}
                                    type="text"
                                    placeholder="Ej: 12345678Z"
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                                    value={values.nif || ""}
                                    onChange={e => handleChange("nif", e.target.value)}
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Domicilio</label>
                                <input
                                    disabled={isDisabled}
                                    type="text"
                                    placeholder="Ej: C/ Mayor 123"
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                                    value={values.domicilio || ""}
                                    onChange={e => handleChange("domicilio", e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">C.P</label>
                                <input
                                    disabled={isDisabled}
                                    type="text"
                                    placeholder="Ej: 29001"
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                                    value={values.cp || ""}
                                    onChange={e => handleChange("cp", e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Ciudad</label>
                                <input
                                    disabled={isDisabled}
                                    type="text"
                                    placeholder="Ej: Málaga"
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                                    value={values.ciudad || ""}
                                    onChange={e => handleChange("ciudad", e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Provincia</label>
                                <input
                                    disabled={isDisabled}
                                    type="text"
                                    placeholder="Ej: Málaga"
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                                    value={values.provincia || ""}
                                    onChange={e => handleChange("provincia", e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Fecha Emisión</label>
                                <input
                                    disabled={isDisabled}
                                    type="date"
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                                    value={values.fecha_emision || ""}
                                    onChange={e => handleChange("fecha_emision", e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Factura Lines */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-base">📋</span>
                            Conceptos Factura
                        </h3>

                        {[1, 2, 3].map(i => (
                            <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                                <div className="sm:col-span-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Und</label>
                                    <input
                                        disabled={isDisabled}
                                        type="number"
                                        placeholder="0"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                                        value={values[`und${i}`] || ""}
                                        onChange={e => handleChange(`und${i}`, e.target.value)}
                                    />
                                </div>
                                <div className="sm:col-span-5">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Descripción {i}</label>
                                    <input
                                        disabled={isDisabled}
                                        type="text"
                                        placeholder="Concepto..."
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                                        value={values[`descripcion${i}`] || ""}
                                        onChange={e => handleChange(`descripcion${i}`, e.target.value)}
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Importe</label>
                                    <input
                                        disabled={isDisabled}
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                                        value={values[`importe${i}`] || ""}
                                        onChange={e => handleChange(`importe${i}`, e.target.value)}
                                    />
                                </div>
                                <div className="sm:col-span-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">IVA%</label>
                                    <input
                                        disabled={isDisabled}
                                        type="number"
                                        placeholder="21"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 transition-all"
                                        value={values[`iva${i}`] ?? ""}
                                        onChange={e => handleChange(`iva${i}`, e.target.value)}
                                    />
                                </div>
                                <div className="sm:col-span-3">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Total (Auto)</label>
                                    <input
                                        disabled
                                        readOnly
                                        type="text"
                                        className="w-full rounded-lg border border-slate-100 bg-slate-100/50 px-3 py-2 text-sm text-right font-semibold text-slate-600 focus:outline-none"
                                        value={values[`suma${i}`] || 0}
                                    />
                                </div>
                            </div>
                        ))}

                        {/* Totals Section */}
                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 mt-6">
                            <div className="flex flex-col sm:flex-row justify-end gap-6 sm:gap-12">
                                <div className="text-right">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Base Imponible</p>
                                    <p className="text-lg font-bold text-slate-900">{values.importe_total || "0.00"} €</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">IVA Total</p>
                                    <p className="text-lg font-bold text-slate-900">{values.iva_total || "0.00"} €</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Total Factura</p>
                                    <p className="text-2xl font-black text-slate-900">{values.suma_final || "0.00"} €</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Fixed Footer */}
            <div className="p-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 bg-white shrink-0 flex justify-end">
                <button
                    type="button"
                    onClick={generate}
                    disabled={status === "generating" || !canGenerate}
                    className="w-full sm:w-auto h-12 px-8 bg-yellow-400 hover:bg-yellow-500 text-neutral-950 rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm hover:shadow-md active:scale-[0.98]"
                >
                    {status === "generating" ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Generando...
                        </>
                    ) : (
                        <>
                            <Plus className="w-5 h-5" />
                            Generar Factura + Certificado
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

function Send({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
        </svg>
    )
}

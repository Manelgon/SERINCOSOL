"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Download, Loader2 } from "lucide-react";
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

export default function VariosForm() {
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
        if (!toEmail) {
            toast.error("Introduce un email destino");
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
            <div className="bg-white p-12 rounded-xl border border-neutral-200 shadow-sm text-center space-y-6 max-w-2xl mx-auto">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                    <Download className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-neutral-900">¡Documentos Generados!</h2>
                    <p className="text-neutral-600">
                        Se han generado la factura y el certificado correctamente.
                    </p>
                </div>

                <div className="flex flex-col gap-3 max-w-md mx-auto w-full">
                    <button
                        onClick={downloadFactura}
                        className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold shadow-sm transition flex items-center justify-center gap-2"
                    >
                        <Download className="w-5 h-5" />
                        Descargar Factura
                    </button>

                    <button
                        onClick={downloadCertificado}
                        className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold shadow-sm transition flex items-center justify-center gap-2"
                    >
                        <Download className="w-5 h-5" />
                        Descargar Certificado
                    </button>

                    <div className="h-4"></div>

                    <button
                        onClick={() => { setStatus("idle"); setSubmissionIds(null); setPdfUrls(null); }}
                        className="w-full bg-white border-2 border-neutral-200 hover:border-neutral-300 text-neutral-600 hover:text-neutral-900 px-6 py-3 rounded-lg font-semibold transition"
                    >
                        Volver al formulario
                    </button>
                    <a
                        href="/dashboard/documentos"
                        className="w-full text-neutral-500 hover:text-neutral-900 text-sm font-medium transition underline"
                    >
                        Ir al listado
                    </a>
                </div>

                {/* Email Section */}
                <div className="max-w-md mx-auto pt-6 border-t border-neutral-100 w-full">
                    <p className="text-sm font-medium text-neutral-700 mb-3 text-left">Enviar por email</p>
                    <div className="flex gap-2">
                        <input
                            type="email"
                            placeholder="cliente@ejemplo.com"
                            value={toEmail}
                            onChange={(e) => setToEmail(e.target.value)}
                            className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                        />
                        <button
                            onClick={sendEmail}
                            disabled={status === "sending"}
                            className="bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 flex items-center gap-2"
                        >
                            {status === "sending" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Enviar
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    const isDisabled = status === "generating";

    return (
        <div className="space-y-6">
            {/* Cliente */}
            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm space-y-4">
                <h3 className="text-lg font-semibold text-neutral-900 border-b pb-2">Datos Cliente</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-gray-700">Código</span>
                        <SearchableSelect
                            value={values.codigo || ""}
                            onChange={(val) => handleCommunityChange(String(val))}
                            options={communities.map(c => ({
                                value: c.codigo,
                                label: `${c.codigo} - ${c.nombre_cdad}`
                            }))}
                            placeholder="Seleccionar código"
                        />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-gray-700">Cliente / Comunidad</span>
                        <input
                            disabled={isDisabled}
                            type="text"
                            className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                            value={values.cliente || ""}
                            onChange={e => handleChange("cliente", e.target.value)}
                        />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-gray-700">Nombre y Apellidos</span>
                        <input
                            disabled={isDisabled}
                            type="text"
                            className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                            value={values.nombre_apellidos || ""}
                            onChange={e => handleChange("nombre_apellidos", e.target.value)}
                        />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-gray-700">Tipo Inmueble</span>
                        <select
                            disabled={isDisabled}
                            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 appearance-none disabled:bg-neutral-100"
                            value={values.tipo_inmueble || ""}
                            onChange={(e) => handleChange("tipo_inmueble", e.target.value)}
                        >
                            <option value="">Seleccionar tipo...</option>
                            <option value="Vivienda">Vivienda</option>
                            <option value="Trastero">Trastero</option>
                            <option value="Aparcamiento">Aparcamiento</option>
                        </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-gray-700">NIF</span>
                        <input
                            disabled={isDisabled}
                            type="text"
                            className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                            value={values.nif || ""}
                            onChange={e => handleChange("nif", e.target.value)}
                        />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-gray-700">Domicilio</span>
                        <input
                            disabled={isDisabled}
                            type="text"
                            className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                            value={values.domicilio || ""}
                            onChange={e => handleChange("domicilio", e.target.value)}
                        />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-gray-700">C.P</span>
                        <input
                            disabled={isDisabled}
                            type="text"
                            className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                            value={values.cp || ""}
                            onChange={e => handleChange("cp", e.target.value)}
                        />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-gray-700">Ciudad</span>
                        <input
                            disabled={isDisabled}
                            type="text"
                            className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                            value={values.ciudad || ""}
                            onChange={e => handleChange("ciudad", e.target.value)}
                        />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-gray-700">Provincia</span>
                        <input
                            disabled={isDisabled}
                            type="text"
                            className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                            value={values.provincia || ""}
                            onChange={e => handleChange("provincia", e.target.value)}
                        />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-gray-700">Fecha Emisión</span>
                        <input
                            disabled={isDisabled}
                            type="date"
                            className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                            value={values.fecha_emision || ""}
                            onChange={e => handleChange("fecha_emision", e.target.value)}
                        />
                    </label>
                </div>
            </div>

            {/* Factura Lines */}
            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm space-y-4">
                <h3 className="text-lg font-semibold text-neutral-900 border-b pb-2">Conceptos Factura</h3>

                {[1, 2, 3].map(i => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-3 rounded">
                        <div className="col-span-1">
                            <label className="text-xs text-gray-500">Und</label>
                            <input
                                disabled={isDisabled}
                                type="number"
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                                value={values[`und${i}`] || ""}
                                onChange={e => handleChange(`und${i}`, e.target.value)}
                            />
                        </div>
                        <div className="col-span-5">
                            <label className="text-xs text-gray-500">Descripción {i}</label>
                            <input
                                disabled={isDisabled}
                                type="text"
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                                value={values[`descripcion${i}`] || ""}
                                onChange={e => handleChange(`descripcion${i}`, e.target.value)}
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs text-gray-500">Importe</label>
                            <input
                                disabled={isDisabled}
                                type="number"
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                                value={values[`importe${i}`] || ""}
                                onChange={e => handleChange(`importe${i}`, e.target.value)}
                            />
                        </div>
                        <div className="col-span-1">
                            <label className="text-xs text-gray-500">IVA%</label>
                            <input
                                disabled={isDisabled}
                                type="number"
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-100"
                                value={values[`iva${i}`] ?? ""}
                                onChange={e => handleChange(`iva${i}`, e.target.value)}
                            />
                        </div>
                        <div className="col-span-3">
                            <label className="text-xs text-gray-500">Total (Auto)</label>
                            <input
                                disabled
                                readOnly
                                type="text"
                                className="w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm text-right font-medium text-neutral-500 focus:outline-none"
                                value={values[`suma${i}`] || 0}
                            />
                        </div>
                    </div>
                ))}

                {/* Totals */}
                <div className="flex justify-end gap-6 pt-4 border-t">
                    <div className="text-right">
                        <p className="text-xs text-gray-500">Base Imponible</p>
                        <p className="font-semibold">{values.importe_total || "0.00"} €</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-gray-500">IVA Total</p>
                        <p className="font-semibold">{values.iva_total || "0.00"} €</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-gray-500">Total Factura</p>
                        <p className="text-xl font-bold text-yellow-600">{values.suma_final || "0.00"} €</p>
                    </div>
                </div>
            </div>

            <div className="flex pt-4">
                <button
                    onClick={generate}
                    disabled={status === "generating"}
                    className="ml-auto bg-yellow-400 hover:bg-yellow-500 text-neutral-950 px-8 py-3 rounded-lg font-bold shadow-lg transition disabled:opacity-50 flex items-center gap-2"
                >
                    {status === "generating" ? <Loader2 className="animate-spin" /> : <Download />}
                    Generar Factura + Certificado
                </button>
            </div>
        </div>
    );
}

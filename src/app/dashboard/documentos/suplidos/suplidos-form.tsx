"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Download, Send, Loader2 } from "lucide-react";
import SearchableSelect from "@/components/SearchableSelect";
import { createBrowserClient } from "@supabase/ssr";

type Field = { label: string; type?: "text" | "number" | "date" };

const FIELDS: Field[] = [
    { label: "Nombre Cliente", type: "text" },
    { label: "Código", type: "text" }, // Will be rendered as dropdown
    { label: "Provincia", type: "text" },
    { label: "Domicilio", type: "text" },
    { label: "NIF", type: "text" },
    { label: "Fecha emisión", type: "date" },
    { label: "Descripcion", type: "text" },

    { label: "Número de Cartas", type: "number" },
    { label: "Copias", type: "number" },
    { label: "Total copias", type: "number" }, // AUTO-CALCULATED

    { label: "Cantidad Sobre normal", type: "number" },
    { label: "Precio 1", type: "number" },
    { label: "Total 1", type: "number" }, // AUTO-CALCULATED

    { label: "Cantidad Sobre A5", type: "number" },
    { label: "Precio 2", type: "number" },
    { label: "Total 2", type: "number" }, // AUTO-CALCULATED

    { label: "Papel corporativo", type: "number" },
    { label: "Precio 3", type: "number" },
    { label: "Total 3", type: "number" }, // AUTO-CALCULATED

    { label: "Etiqueta manipulación", type: "number" },
    { label: "Precio 4", type: "number" },
    { label: "Total 4", type: "number" }, // AUTO-CALCULATED

    { label: "Imprimir B/N", type: "number" },
    { label: "Precio 5", type: "number" },
    { label: "Total 5", type: "number" }, // AUTO-CALCULATED

    { label: "Franqueo postal", type: "number" },
    { label: "Precio 6", type: "number" },
    { label: "Total 6", type: "number" }, // AUTO-CALCULATED

    { label: "Suma final", type: "number" }, // AUTO-CALCULATED
];

type Status = "idle" | "generating" | "ready" | "sending" | "error";

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

// Auto-calculated fields (read-only) + Locked Prices
const LOCKED_FIELDS = new Set([
    // Campos calculados
    "Total copias",
    "Total 1",
    "Total 2",
    "Total 3",
    "Total 4",
    "Total 5",
    "Total 6",
    "Suma final",
    // Precios fijos (desde servidor)
    "Precio 1",
    "Precio 2",
    "Precio 3",
    "Precio 4",
    "Precio 5",
    "Precio 6",
]);

// Helper: safe number conversion
const num = (v: any) => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
};

// Helper: round to 2 decimals
const money = (n: number) => Math.round(n * 100) / 100;

// Compute all auto-calculated fields
const compute = (vals: Record<string, any>) => {
    const numeroCartas = num(vals["Número de Cartas"]);
    const copias = num(vals["Copias"]);
    const totalCopias = numeroCartas * copias;

    const qty1 = num(vals["Cantidad Sobre normal"]);
    const p1 = num(vals["Precio 1"]);
    const total1 = money(qty1 * p1);

    const qty2 = num(vals["Cantidad Sobre A5"]);
    const p2 = num(vals["Precio 2"]);
    const total2 = money(qty2 * p2);

    const qty3 = num(vals["Papel corporativo"]);
    const p3 = num(vals["Precio 3"]);
    const total3 = money(qty3 * p3);

    const qty4 = num(vals["Etiqueta manipulación"]);
    const p4 = num(vals["Precio 4"]);
    const total4 = money(qty4 * p4);

    const qty5 = num(vals["Imprimir B/N"]);
    const p5 = num(vals["Precio 5"]);
    const total5 = money(qty5 * p5);

    const qty6 = num(vals["Franqueo postal"]);
    const p6 = num(vals["Precio 6"]);
    const total6 = money(qty6 * p6);

    const sumaFinal = money(total1 + total2 + total3 + total4 + total5 + total6);

    return {
        "Total copias": totalCopias,
        "Total 1": total1,
        "Total 2": total2,
        "Total 3": total3,
        "Total 4": total4,
        "Total 5": total5,
        "Total 6": total6,
        "Suma final": sumaFinal,
    };
};

export default function SuplidosForm() {
    const [values, setValues] = useState<Record<string, any>>({
        "Número de Cartas": "",
        "Copias": "",
        "Cantidad Sobre normal": "",
        "Cantidad Sobre A5": "",
        "Papel corporativo": "",
        "Etiqueta manipulación": "", // Computed/Locked, but init as empty or 0 is fine. Let's start empty.
        "Imprimir B/N": "",         // Computed/Locked.
        "Franqueo postal": "",
    });
    const [status, setStatus] = useState<Status>("idle");
    const [pdfUrl, setPdfUrl] = useState<string>("");
    const [submissionId, setSubmissionId] = useState<number | null>(null);
    const [toEmail, setToEmail] = useState("");
    const [communities, setCommunities] = useState<Comunidad[]>([]);

    // Initialize Supabase client
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const res = await fetch("/api/documentos/settings?doc_key=suplidos");
                if (!res.ok) throw new Error("Error fetching settings");

                const data = await res.json();

                setValues((prev) => {
                    const next = {
                        ...prev,
                        "Precio 1": data.settings?.precio_1 ?? prev["Precio 1"] ?? 0,
                        "Precio 2": data.settings?.precio_2 ?? prev["Precio 2"] ?? 0,
                        "Precio 3": data.settings?.precio_3 ?? prev["Precio 3"] ?? 0,
                        "Precio 4": data.settings?.precio_4 ?? prev["Precio 4"] ?? 0,
                        "Precio 5": data.settings?.precio_5 ?? prev["Precio 5"] ?? 0,
                        "Precio 6": data.settings?.precio_6 ?? prev["Precio 6"] ?? 0,
                    };
                    return { ...next, ...compute(next) };
                });
            } catch (error) {
                console.error("Error loading settings", error);
                toast.error("Error cargando precios fijos");
            }
        };

        loadSettings();
        fetchCommunities();
    }, []);

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

    const handleCommunityChange = (codigo: string) => {
        const comunidad = communities.find(c => c.codigo === codigo);

        setValues(prev => {
            const next = {
                ...prev,
                "Código": codigo,
            };

            if (comunidad) {
                Object.assign(next, {
                    "Nombre Cliente": comunidad.nombre_cdad,
                    "NIF": comunidad.cif,
                    "Provincia": comunidad.provincia,
                    "Domicilio": comunidad.direccion,
                    // Could also add CP or City if fields existed
                });
            }

            const computed = compute(next);
            return { ...next, ...computed };
        });
    };

    const onChange = (label: string, raw: string, type?: string) => {
        // Prevent editing locked fields
        if (LOCKED_FIELDS.has(label)) return;

        // Handle special case for Code selection
        if (label === "Código") {
            handleCommunityChange(raw);
            return;
        }

        let v: any = raw;
        if (type === "number") v = raw === "" ? "" : Number(raw);

        setValues((prev) => {
            const next = { ...prev, [label]: v };

            // Lógica de autocompletado inteligente
            const numeroCartas = num(next["Número de Cartas"]);
            const copias = num(next["Copias"]);
            const totalCopias = numeroCartas * copias;

            // Si cambiamos Cartas o Copias, actualizamos los campos dependientes
            if (label === "Número de Cartas" || label === "Copias") {
                // AUTOMATION REQUESTED: Imprimir B/N = Total Copias
                next["Imprimir B/N"] = totalCopias;
                // AUTOMATION REQUESTED: Etiqueta manipulación = Total Copias
                next["Etiqueta manipulación"] = totalCopias;
            }

            /*
               REMOVED ALL AUTOMATIONS PER USER REQUEST.
               Now all quantities are fully manual.
            */
            // if (label === "Número de Cartas" || label === "Copias") {
            // REMOVED: Sobre Normal auto-fill (User request)

            // REMOVED: Etiqueta manipulación auto-fill (User request)

            // REMOVED: Imprimir B/N = Total Copias (User request)

            // REMOVED: Franqueo postal = Copias (User request)
            // }

            const computed = compute(next);
            return { ...next, ...computed };
        });
    };

    const generate = async () => {
        setStatus("generating");
        setPdfUrl("");
        setSubmissionId(null);

        try {
            // Ensure all calculated fields are up-to-date before sending
            const rawPayload = { ...values, ...compute(values) };
            // Sanitize: convert empty strings to 0 for the API
            const payload = Object.fromEntries(
                Object.entries(rawPayload).map(([k, v]) => [k, (v as any) === "" ? 0 : v])
            );

            const res = await fetch("/api/documentos/suplidos/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "Error generando PDF");

            setPdfUrl(data.pdfUrl);
            setSubmissionId(data.submissionId);
            setStatus("ready");
            toast.success("PDF generado y guardado en historial ✅");
        } catch (e: any) {
            setStatus("error");
            toast.error(e?.message || "Error inesperado");
        }
    };

    const download = () => {
        if (!pdfUrl) return;
        window.open(pdfUrl, "_blank");
    };

    const sendEmail = async () => {
        if (!submissionId) return;
        if (!toEmail) {
            toast.error("Introduce un email destino");
            return;
        }

        setStatus("sending");

        try {
            const res = await fetch("/api/documentos/suplidos/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ submissionId, toEmail }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "Error enviando email");

            // Don't change status to 'ready' because we are already in 'ready' view technically, 
            // but we want to show success. Actually, 'ready' is the lock state.
            // Let's just toast.
            setStatus("ready");
            toast.success("Email enviado correctamente ✅");
        } catch (e: any) {
            // If email fails, we are still 'ready' (pdf generated), just email failed. 
            // We set status back to ready so UI doesn't break, maybe? 
            // Or 'error' sends us back to form? No, we don't want to edit.
            // Let's keep it 'ready' but toast error.
            setStatus("ready");
            toast.error(e?.message || "Error enviando");
        }
    };

    // VISTA DE ÉXITO (Bloqueada)
    if (status === "ready" || status === "sending") {
        return (
            <div className="bg-white p-12 rounded-xl border border-neutral-200 shadow-sm text-center space-y-8 max-w-3xl mx-auto">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                    <Download className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-neutral-900">¡Suplido Generado!</h2>
                    <p className="text-neutral-600">
                        El documento se ha creado correctamente. <br />
                        Puedes descargarlo o enviarlo por email ahora.
                    </p>
                </div>

                <div className="flex flex-col gap-3 max-w-md mx-auto w-full">
                    <button
                        onClick={download}
                        className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold shadow-sm transition flex items-center justify-center gap-2"
                    >
                        <Download className="w-5 h-5" />
                        Descargar PDF
                    </button>

                    <button
                        onClick={() => { setStatus("idle"); setSubmissionId(null); setPdfUrl(""); }}
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

                {/* Email Section in Success View */}
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
                            {status === "sending" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Enviar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const isDisabled = status === "generating";


    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm space-y-6">
                {/* --- SECCIÓN 1: DATOS CLIENTE --- */}
                <h3 className="text-lg font-semibold text-neutral-900 border-b pb-2">Datos Cliente</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                    {/* Código (Select) */}
                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-gray-700">Código</span>
                        <SearchableSelect
                            value={values["Código"] ?? ""}
                            onChange={(val) => onChange("Código", String(val))}
                            options={communities.map(c => ({
                                value: c.codigo,
                                label: `${c.codigo} - ${c.nombre_cdad}`
                            }))}
                            placeholder="Seleccionar código"
                        />
                    </label>

                    <Field
                        label="Nombre Cliente"
                        value={values["Nombre Cliente"] ?? ""}
                        onChange={(v) => onChange("Nombre Cliente", v)}
                        disabled={isDisabled}
                    />

                    <Field
                        label="Provincia"
                        value={values["Provincia"] ?? ""}
                        onChange={(v) => onChange("Provincia", v)}
                        disabled={isDisabled}
                    />

                    <Field
                        label="Domicilio"
                        value={values["Domicilio"] ?? ""}
                        onChange={(v) => onChange("Domicilio", v)}
                        disabled={isDisabled}
                    />

                    <Field
                        label="NIF"
                        value={values["NIF"] ?? ""}
                        onChange={(v) => onChange("NIF", v)}
                        disabled={isDisabled}
                    />

                    <Field
                        label="Fecha emisión"
                        value={values["Fecha emisión"] ?? ""}
                        onChange={(v) => onChange("Fecha emisión", v)}
                        disabled={isDisabled}
                        type="date"
                    />

                    {/* Descripción (Full width) */}
                    <div className="md:col-span-2 lg:col-span-3">
                        <Field
                            label="Descripción"
                            value={values["Descripcion"] ?? ""}
                            onChange={(v) => onChange("Descripcion", v)}
                            disabled={isDisabled}
                        />
                    </div>
                </div>

                {/* --- SECCIÓN 2: DATOS SUPLIDO --- */}
                <h3 className="text-lg font-semibold text-neutral-900 border-b pb-2 pt-4">Datos Suplido</h3>

                {/* Parámetros de Producción (Cartas/Copias) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-neutral-50 rounded-lg">
                    <Field
                        label="Número de Cartas"
                        value={values["Número de Cartas"]}
                        onChange={(v) => onChange("Número de Cartas", v, "number")}
                        disabled={isDisabled}
                        type="number"
                    />
                    <Field
                        label="Copias"
                        value={values["Copias"]}
                        onChange={(v) => onChange("Copias", v, "number")}
                        disabled={isDisabled}
                        type="number"
                    />
                    <Field
                        label="Total Copias (Auto)"
                        value={values["Total copias"] ?? 0}
                        onChange={() => { }}
                        readOnly
                        disabled
                        type="number"
                        className="bg-neutral-100 text-neutral-600 cursor-not-allowed"
                    />
                </div>

                {/* Tabla de Conceptos (3 Columbas: Cantidad | Precio | Total) */}
                <div className="overflow-x-auto border rounded-xl border-neutral-100">
                    <table className="w-full text-sm text-left text-neutral-700">
                        <thead className="text-xs text-neutral-500 uppercase bg-neutral-50 border-b border-neutral-200">
                            <tr>
                                <th className="px-4 py-3 font-medium">Concepto</th>
                                <th className="px-4 py-3 font-medium w-32">Cantidad</th>
                                <th className="px-4 py-3 font-medium w-32">Precio</th>
                                <th className="px-4 py-3 font-medium w-32 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {[
                                { label: "Sobre Normal", qty: "Cantidad Sobre normal", price: "Precio 1", total: "Total 1" },
                                { label: "Sobre A5", qty: "Cantidad Sobre A5", price: "Precio 2", total: "Total 2" },
                                { label: "Papel Corporativo", qty: "Papel corporativo", price: "Precio 3", total: "Total 3" },
                                { label: "Etiqueta Manipulación", qty: "Etiqueta manipulación", price: "Precio 4", total: "Total 4" },
                                { label: "Imprimir B/N", qty: "Imprimir B/N", price: "Precio 5", total: "Total 5" },
                                { label: "Franqueo Postal", qty: "Franqueo postal", price: "Precio 6", total: "Total 6" },
                            ].map((row) => (
                                <tr key={row.label} className="hover:bg-neutral-50/50">
                                    <td className="px-4 py-3 font-medium text-neutral-900">{row.label}</td>
                                    <td className="px-4 py-3">
                                        <input
                                            disabled={isDisabled || row.qty === "Imprimir B/N" || row.qty === "Etiqueta manipulación"} // LOCKED fields
                                            type="number"
                                            value={values[row.qty]}
                                            onChange={(e) => onChange(row.qty, e.target.value, "number")}
                                            className={`w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed`}
                                        />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="relative">
                                            <input
                                                type="number"
                                                readOnly
                                                disabled
                                                value={values[row.price] ?? 0}
                                                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-neutral-600 cursor-not-allowed pr-6 text-right text-sm"
                                            />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">€</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold text-neutral-900">
                                        {(values[row.total] ?? 0).toFixed(2)} €
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="border-t border-neutral-200 bg-neutral-50 font-semibold text-neutral-900">
                            <tr>
                                <td colSpan={3} className="px-4 py-3 text-right">Suma Final</td>
                                <td className="px-4 py-3 text-right text-base text-black bg-yellow-100 border-l border-yellow-200">
                                    {(values["Suma final"] ?? 0).toFixed(2)} €
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Actions (Botón de generar) */}
            <div className="flex flex-col md:flex-row items-start gap-3">
                <button
                    type="button"
                    onClick={generate}
                    disabled={status === "generating"}
                    className="bg-yellow-400 hover:bg-yellow-500 text-neutral-950 px-5 py-2.5 rounded-md text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {status === "generating" ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generando...
                        </>
                    ) : (
                        "Generar PDF"
                    )}
                </button>
            </div>
        </div>
    );
}

function Field({
    label,
    value,
    onChange,
    type = "text",
    disabled = false,
    readOnly = false,
    className = ""
}: {
    label: string;
    value: any;
    onChange: (v: string) => void;
    type?: string;
    disabled?: boolean;
    readOnly?: boolean;
    className?: string;
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <input
                type={type}
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                readOnly={readOnly}
                className={`w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none disabled:bg-neutral-50 ${className}`}
            />
        </label>
    );
}


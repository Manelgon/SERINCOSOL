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

type RecordData = {
    Apellidos: string;
    Nombre: string;
    Nif: string;
    "Dirección 2": string;
    Piso: string;
    CP: string;
    Poblacion: string;
    DIAS: string;
    "%": string;
    Participación: string;
    Ganancia: string;
    Retenciones: string;
    Provincia: string;
    "Clave 1": string;
    Subclave: string;
    "Clave 2": string;
    Naturaleza: string;
    Situación: string;
    Declarado: string;
    Mail: string;
};

const INITIAL_DATA: RecordData = {
    Apellidos: "",
    Nombre: "",
    Nif: "",
    "Dirección 2": "",
    Piso: "",
    CP: "",
    Poblacion: "",
    DIAS: "",
    "%": "",
    Participación: "",
    Ganancia: "",
    Retenciones: "",
    Provincia: "",
    "Clave 1": "",
    Subclave: "",
    "Clave 2": "",
    Naturaleza: "",
    Situación: "",
    Declarado: "",
    Mail: "",
};

export default function CertificadoForm() {
    const [values, setValues] = useState<RecordData>(INITIAL_DATA);
    const [status, setStatus] = useState<"idle" | "generating" | "ready" | "sending" | "error">("idle");
    const [submissionId, setSubmissionId] = useState<number | null>(null);
    const [toEmail, setToEmail] = useState("");
    const [pdfUrl, setPdfUrl] = useState<string>("");
    const [communities, setCommunities] = useState<Comunidad[]>([]);
    const [selectedCode, setSelectedCode] = useState("");

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

    const handleChange = (key: keyof RecordData, val: string) => {
        setValues((prev) => ({ ...prev, [key]: val }));
    };

    const handleCommunityChange = (codigo: string) => {
        setSelectedCode(codigo);
        const comunidad = communities.find(c => c.codigo === codigo);

        if (comunidad) {
            setValues(prev => ({
                ...prev,
                "Código": codigo,
                "Nombre Comunidad": comunidad.nombre_cdad,
                // Apellidos/Nombre/Nif removed per user request (only address data)
                "Dirección 2": comunidad.direccion,
                CP: comunidad.cp,
                Poblacion: comunidad.ciudad,
                Provincia: comunidad.provincia
            }));
        }
    };

    const generate = async () => {
        setStatus("generating");
        setPdfUrl("");
        setSubmissionId(null);

        try {
            const res = await fetch("/api/documentos/certificado-renta/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "Error generando PDF");

            setPdfUrl(data.pdfUrl);
            setSubmissionId(data.submissionId);
            setStatus("ready");
            toast.success("PDF generado correctamente ✅");
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
            const res = await fetch("/api/documentos/certificado-renta/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ submissionId, toEmail }),
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

    // SUCCESS VIEW
    if (status === "ready" || status === "sending") {
        return (
            <div className="bg-white p-12 rounded-xl border border-neutral-200 shadow-sm text-center space-y-8 max-w-3xl mx-auto">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                    <Download className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-neutral-900">¡Certificado Generado!</h2>
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
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm space-y-6">
                <h3 className="text-lg font-semibold text-neutral-900 border-b pb-2">Datos del Declarante</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-gray-700">Código</span>
                        <SearchableSelect
                            value={selectedCode}
                            onChange={(val) => handleCommunityChange(String(val))}
                            options={communities.map(c => ({
                                value: c.codigo,
                                label: `${c.codigo} - ${c.nombre_cdad}`
                            }))}
                            placeholder="Seleccionar código"
                        />
                    </label>

                    <Field label="Apellidos" value={values.Apellidos} onChange={(v) => handleChange("Apellidos", v)} />
                    <Field label="Nombre" value={values.Nombre} onChange={(v) => handleChange("Nombre", v)} />
                    <Field label="NIF" value={values.Nif} onChange={(v) => handleChange("Nif", v)} />

                    <Field label="Dirección" value={values["Dirección 2"]} onChange={(v) => handleChange("Dirección 2", v)} />
                    <Field label="Piso/Puerta" value={values.Piso} onChange={(v) => handleChange("Piso", v)} />
                    <Field label="Código Postal" value={values.CP} onChange={(v) => handleChange("CP", v)} />

                    <Field label="Población" value={values.Poblacion} onChange={(v) => handleChange("Poblacion", v)} />
                    <Field label="Provincia" value={values.Provincia} onChange={(v) => handleChange("Provincia", v)} />
                    <Field label="Mail" value={values.Mail} onChange={(v) => handleChange("Mail", v)} type="email" />
                </div>

                <h3 className="text-lg font-semibold text-neutral-900 border-b pb-2 pt-4">Datos Económicos</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <Field label="DIAS" value={values.DIAS} onChange={(v) => handleChange("DIAS", v)} type="number" />
                    <Field label="%" value={values["%"]} onChange={(v) => handleChange("%", v)} type="number" />
                    <Field label="Participación" value={values.Participación} onChange={(v) => handleChange("Participación", v)} />
                    <Field label="Ganancia" value={values.Ganancia} onChange={(v) => handleChange("Ganancia", v)} type="number" />
                    <Field label="Retenciones" value={values.Retenciones} onChange={(v) => handleChange("Retenciones", v)} type="number" />
                </div>

                <h3 className="text-lg font-semibold text-neutral-900 border-b pb-2 pt-4">Claves Fiscales</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Clave 1" value={values["Clave 1"]} onChange={(v) => handleChange("Clave 1", v)} />
                    <Field label="Subclave" value={values.Subclave} onChange={(v) => handleChange("Subclave", v)} />
                    <Field label="Clave 2" value={values["Clave 2"]} onChange={(v) => handleChange("Clave 2", v)} />
                    <Field label="Naturaleza" value={values.Naturaleza} onChange={(v) => handleChange("Naturaleza", v)} />
                    <Field label="Situación" value={values.Situación} onChange={(v) => handleChange("Situación", v)} />
                    <Field label="Declarado" value={values.Declarado} onChange={(v) => handleChange("Declarado", v)} />
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={generate}
                    disabled={status === "generating"}
                    className="bg-yellow-400 hover:bg-yellow-500 text-neutral-950 px-5 py-2.5 rounded-md text-sm font-semibold transition disabled:opacity-50 flex items-center gap-2"
                >
                    {status === "generating" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {status === "generating" ? "Generando..." : "Generar PDF"}
                </button>
            </div>
        </div>
    );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <input
                type={type}
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none"
            />
        </label>
    );
}

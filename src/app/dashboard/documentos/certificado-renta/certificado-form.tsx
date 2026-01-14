"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { Download, Loader2 } from "lucide-react";

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
    const [status, setStatus] = useState<"idle" | "generating" | "ready" | "error">("idle");
    const [pdfUrl, setPdfUrl] = useState<string>("");

    const handleChange = (key: keyof RecordData, val: string) => {
        setValues((prev) => ({ ...prev, [key]: val }));
    };

    const generate = async () => {
        setStatus("generating");
        setPdfUrl("");

        try {
            const res = await fetch("/api/documentos/certificado-renta/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "Error generando PDF");

            setPdfUrl(data.pdfUrl);
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

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-sm space-y-6">
                <h3 className="text-lg font-semibold text-neutral-900 border-b pb-2">Datos del Declarante</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

                {pdfUrl && (
                    <button
                        onClick={download}
                        className="bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-900 px-5 py-2.5 rounded-md text-sm font-semibold transition flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Descargar
                    </button>
                )}
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
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 focus:outline-none"
            />
        </label>
    );
}

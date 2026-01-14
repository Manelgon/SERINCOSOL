"use client";

import { useState } from "react";
import { Search, User, FileText } from "lucide-react";

type HistoryType = "varios" | "suplidos" | "certificado-renta";

interface ClientHistoryTableProps {
    entries: any[];
    type: HistoryType;
}

export default function ClientHistoryTable({ entries, type }: ClientHistoryTableProps) {
    const [search, setSearch] = useState("");

    const filtered = entries.filter((r) => {
        const term = search.toLowerCase();

        // Common fields
        if (r.title?.toLowerCase().includes(term)) return true;

        const u = r.profiles;
        const who = u ? `${u.nombre ?? ""} ${u.apellido ?? ""}` : (r.user_id || "");
        if (who.toLowerCase().includes(term)) return true;

        const date = new Date(r.created_at).toLocaleDateString("es-ES");
        if (date.includes(term)) return true;

        // Payload fields
        const p = r.payload || {};

        // Search in all payload values (simple approach)
        const payloadValues = Object.values(p).map(v => String(v).toLowerCase());
        if (payloadValues.some(v => v.includes(term))) return true;

        return false;
    });

    return (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
            {/* Search Bar */}
            <div className="p-4 border-b border-gray-100 bg-neutral-50/50">
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-neutral-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wide">Fecha</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wide">Generado por</th>

                            {type === "varios" && (
                                <>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wide">Tipo</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wide">Cliente</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wide">Total</th>
                                </>
                            )}

                            {type === "suplidos" && (
                                <>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wide">Código</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wide">Descripción</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wide">Total</th>
                                </>
                            )}

                            {type === "certificado-renta" && (
                                <>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wide">Declarante</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wide">NIF</th>
                                </>
                            )}

                            <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wide">PDF</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="px-4 py-12 text-center text-neutral-500">
                                    {entries.length === 0 ? "No hay documentos" : "No se encontraron resultados"}
                                </td>
                            </tr>
                        ) : (
                            filtered.map((r) => {
                                const u = r.profiles;
                                const who = u ? `${u.nombre ?? ""} ${u.apellido ?? ""}`.trim() : (r.user_id || "Sistema");
                                const fecha = new Date(r.created_at);
                                const payload = r.payload || {};

                                // --- VARIOS ---
                                const clientVarios = payload.cliente || "Desconocido";
                                const totalVarios = payload.suma_final || "-";
                                // Type badge logic
                                const lowerTitle = (r.title || "").toLowerCase();
                                let typeBadge = <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Otro</span>;
                                if (lowerTitle.includes("factura")) typeBadge = <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">Factura</span>;
                                else if (lowerTitle.includes("certificado")) typeBadge = <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">Certificado</span>;

                                // --- SUPLIDOS ---
                                const codigoSup = payload["Código"] || "-";
                                const descSup = payload["Descripcion"] || "-";
                                const totalSup = payload["Suma final"] ? parseFloat(payload["Suma final"]).toLocaleString("es-ES", { style: "currency", currency: "EUR" }) : "-";

                                // --- RENTA ---
                                const nombreRenta = `${payload.Apellidos || ""} ${payload.Nombre || ""}`.trim();
                                const nifRenta = payload.Nif || "-";

                                return (
                                    <tr key={r.id} className="hover:bg-neutral-50 transition-colors">
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="font-medium text-neutral-900">{fecha.toLocaleDateString("es-ES")}</span>
                                                <span className="text-neutral-500 text-xs">{fecha.toLocaleTimeString("es-ES", { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <User className="w-4 h-4 text-neutral-400" />
                                                <span className="text-neutral-900">{who}</span>
                                            </div>
                                        </td>

                                        {type === "varios" && (
                                            <>
                                                <td className="px-4 py-3 whitespace-nowrap">{typeBadge}</td>
                                                <td className="px-4 py-3 font-medium text-neutral-800">{clientVarios}</td>
                                                <td className="px-4 py-3 text-right font-mono text-neutral-900">{totalVarios} €</td>
                                            </>
                                        )}

                                        {type === "suplidos" && (
                                            <>
                                                <td className="px-4 py-3 font-mono text-xs text-neutral-600">{codigoSup}</td>
                                                <td className="px-4 py-3 max-w-xs truncate text-neutral-600" title={descSup}>{descSup}</td>
                                                <td className="px-4 py-3 text-right font-semibold text-neutral-900">{totalSup}</td>
                                            </>
                                        )}

                                        {type === "certificado-renta" && (
                                            <>
                                                <td className="px-4 py-3 font-medium text-neutral-800">{nombreRenta || "Desconocido"}</td>
                                                <td className="px-4 py-3 text-neutral-600 font-mono text-xs">{nifRenta}</td>
                                            </>
                                        )}

                                        <td className="px-4 py-3">
                                            <a
                                                href={`/api/documentos/${type}/signed-url?id=${r.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 rounded-md bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-yellow-500 transition"
                                            >
                                                <FileText className="w-3.5 h-3.5" />
                                                Ver PDF
                                            </a>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {filtered.length > 0 && (
                <div className="p-3 border-t border-gray-100 text-center text-xs text-neutral-500">
                    Mostrando {filtered.length} de {entries.length} registro(s)
                </div>
            )}
        </div>
    );
}

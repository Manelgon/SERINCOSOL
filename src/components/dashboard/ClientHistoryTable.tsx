"use client";

import { useState } from "react";
import { Search, User, FileText, Trash2, Send, Download, X } from "lucide-react";
import { toast } from "react-hot-toast";

type HistoryType = "varios" | "suplidos" | "certificado-renta";

interface ClientHistoryTableProps {
    entries: any[];
    type: HistoryType;
}

export default function ClientHistoryTable({ entries, type }: ClientHistoryTableProps) {
    const [search, setSearch] = useState("");

    // Delete State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [docToDelete, setDocToDelete] = useState<any>(null);
    const [adminEmail, setAdminEmail] = useState("");
    const [adminPass, setAdminPass] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);

    // Send State
    const [sendModalOpen, setSendModalOpen] = useState(false);
    const [docToSend, setDocToSend] = useState<any>(null);
    const [targetEmail, setTargetEmail] = useState("");
    const [isSending, setIsSending] = useState(false);

    const handleDeleteClick = (doc: any) => {
        setDocToDelete(doc);
        setAdminEmail("");
        setAdminPass("");
        setDeleteModalOpen(true);
    };

    const confirmDelete = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!docToDelete) return;

        setIsDeleting(true);
        try {
            const res = await fetch("/api/admin/universal-delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: docToDelete.id,
                    email: adminEmail,
                    password: adminPass,
                    type: "document"
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error al eliminar");

            toast.success("Documento eliminado correctamente");
            setDeleteModalOpen(false);
            window.location.reload();
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSendClick = (doc: any) => {
        setDocToSend(doc);
        setTargetEmail("");
        setSendModalOpen(true);
    };

    const confirmSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!docToSend) return;

        setIsSending(true);
        try {
            try {
                let endpoint = "";
                let payload: any = {
                    submissionId: docToSend.id,
                    toEmail: targetEmail
                };

                switch (type) {
                    case "suplidos":
                        endpoint = "/api/documentos/suplidos/send";
                        break;
                    case "certificado-renta":
                        endpoint = "/api/documentos/certificado-renta/send";
                        break;
                    case "varios":
                        // Use the new single-send endpoint for individual history items
                        endpoint = "/api/documentos/varios/send-single";
                        break;
                    default:
                        throw new Error("Tipo de documento no soportado para envío");
                }

                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Error al enviar");

                toast.success("Documento enviado correctamente");
                setSendModalOpen(false);
            } catch (err: any) {
                toast.error("Funcionalidad de envío limitada para este tipo de documento o error: " + err.message);
            } finally {
                setIsSending(false);
            }
        };

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

                                <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wide">Acciones</th>
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

                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {/* Download/View - Blue */}
                                                    <a
                                                        href={`/api/documentos/${type}/signed-url?id=${r.id}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                                        title="Ver/Descargar PDF"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </a>

                                                    {/* Send (Only Suplidos for now fully supported, but button visible) - Yellow */}
                                                    <button
                                                        onClick={() => handleSendClick(r)}
                                                        className="p-1.5 rounded-full bg-yellow-50 text-yellow-600 hover:bg-yellow-100 transition-colors"
                                                        title="Enviar por Email"
                                                    >
                                                        <Send className="w-4 h-4" />
                                                    </button>

                                                    {/* Delete - Red */}
                                                    <button
                                                        onClick={() => handleDeleteClick(r)}
                                                        className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                                        title="Eliminar Documento"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
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

                {/* DELETE MODAL */}
                {deleteModalOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm"
                        onClick={() => setDeleteModalOpen(false)}
                    >
                        <div
                            className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="text-lg font-bold text-neutral-900 mb-4">Confirmar Eliminación</h3>
                            <p className="text-neutral-600 mb-4">
                                Estás a punto de eliminar el documento: <span className="font-semibold">{docToDelete?.title}</span>. <br />
                                Esta acción no se puede deshacer. Para confirmar, ingresa credenciales de administrador:
                            </p>
                            <form onSubmit={confirmDelete} className="space-y-4" autoComplete="off">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Administrador</label>
                                    <input
                                        type="email"
                                        required
                                        placeholder=""
                                        autoComplete="off"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                        value={adminEmail}
                                        onChange={e => setAdminEmail(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña Administrador</label>
                                    <input
                                        type="password"
                                        required
                                        placeholder=""
                                        autoComplete="new-password"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                        value={adminPass}
                                        onChange={e => setAdminPass(e.target.value)}
                                    />
                                </div>
                                <div className="flex gap-3 justify-end pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setDeleteModalOpen(false)}
                                        className="px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition font-medium"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isDeleting}
                                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium shadow-sm disabled:opacity-50"
                                    >
                                        {isDeleting ? 'Eliminando...' : 'Eliminar Registro'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* SEND MODAL */}
                {sendModalOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                        onClick={() => setSendModalOpen(false)}
                    >
                        <div
                            className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-neutral-900">Enviar Documento</h3>
                                <button onClick={() => setSendModalOpen(false)} className="text-neutral-400 hover:text-neutral-600"><X className="w-5 h-5" /></button>
                            </div>

                            <form onSubmit={confirmSend} className="space-y-4" autoComplete="off">
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">Enviar a:</label>
                                    <input
                                        type="email"
                                        required
                                        placeholder=""
                                        autoComplete="off"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                                        value={targetEmail}
                                        onChange={e => setTargetEmail(e.target.value)}
                                    />
                                </div>
                                <div className="flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSendModalOpen(false)}
                                        className="px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-md"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSending}
                                        className="px-3 py-2 text-sm bg-yellow-400 text-neutral-950 font-medium rounded-md hover:bg-yellow-500 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {isSending ? "Enviando..." : <><Send className="w-3 h-3" /> Enviar</>}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

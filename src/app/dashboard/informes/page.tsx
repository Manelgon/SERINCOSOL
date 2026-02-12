'use client';

import { useState, useEffect } from 'react';
import { Plus, Mail, Building, Clock, Filter, Trash2, FileText, Loader2, Download, ExternalLink, CheckCircle2, AlertCircle, Eye, ChevronUp, ChevronDown } from 'lucide-react';
import DeleteConfirmationModal from '@/components/DeleteConfirmationModal';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabaseClient';

interface Folder {
    name?: string;
    displayName?: string;
    id: string;
}

interface HistoricalReport {
    id: string;
    community_id: string;
    community_name: string;
    title: string;
    period_start: string;
    period_end: string;
    pdf_path: string;
    emails_count: number;
    created_at: string;
}

export default function InformesEmailPage() {
    // State for folders (generator)
    const [folders, setFolders] = useState<Folder[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string>('');
    const [fechaInicio, setFechaInicio] = useState<string>('');
    const [fechaFin, setFechaFin] = useState<string>('');
    const [isAdmin, setIsAdmin] = useState(false);

    // Deletion Modal State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [reportToDelete, setReportToDelete] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // State for history
    const [historicalReports, setHistoricalReports] = useState<HistoricalReport[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [filterCommunity, setFilterCommunity] = useState<string>('all');
    const [sortConfig, setSortConfig] = useState<{ key: keyof HistoricalReport; direction: 'asc' | 'desc' }>({
        key: 'created_at',
        direction: 'desc'
    });

    // UI State
    const [isGenerating, setIsGenerating] = useState(false);
    const [loadingFolders, setLoadingFolders] = useState(false);
    const [showGenerator, setShowGenerator] = useState(false);
    const [successModal, setSuccessModal] = useState<{
        open: boolean;
        pdfUrl: string;
        community: string;
    }>({ open: false, pdfUrl: '', community: '' });

    useEffect(() => {
        const checkRole = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data } = await supabase
                    .from('profiles')
                    .select('rol')
                    .eq('user_id', session.user.id)
                    .single();
                if (data?.rol === 'admin') setIsAdmin(true);
            }
        };
        checkRole();
        fetchHistory();
        // Set default dates
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - 1);
        setFechaFin(end.toISOString().split('T')[0]);
        setFechaInicio(start.toISOString().split('T')[0]);
    }, []);

    const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
            const { data, error } = await supabase
                .from('email_reports')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setHistoricalReports(data || []);
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar el histórico de informes');
        } finally {
            setLoadingHistory(false);
        }
    };

    const fetchFolders = async () => {
        setLoadingFolders(true);
        try {
            const response = await fetch('/api/onedrive/folders');
            if (!response.ok) throw new Error('Error al cargar comunidades');
            const data = await response.json();
            setFolders(data || []);
            setShowGenerator(true);
        } catch (error) {
            console.error(error);
            toast.error('No se pudieron cargar las carpetas de Outlook');
        } finally {
            setLoadingFolders(false);
        }
    };

    const handleGenerateReport = async () => {
        if (!selectedFolder || !fechaInicio || !fechaFin) {
            toast.error('Datos incompletos');
            return;
        }

        setIsGenerating(true);
        try {
            const folder = folders.find(f => f.id === selectedFolder);
            const communityName = folder?.displayName || folder?.name || 'Comunidad';

            // 1) Get AI Summary from n8n
            const n8nResponse = await fetch('https://serinwebhook.afcademia.com/webhook/135d1aad-2cd5-42b6-b51e-4307a4be5444', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    comunidad_nombre: communityName,
                    comunidad_id: selectedFolder,
                    fecha_inicio: fechaInicio,
                    fecha_fin: fechaFin,
                    timestamp: new Date().toISOString()
                })
            });

            if (!n8nResponse.ok) throw new Error('Error en la conexión con n8n');
            let n8nData = await n8nResponse.json();
            if (Array.isArray(n8nData)) n8nData = n8nData[0];

            if (!n8nData.structured) throw new Error('La IA no devolvió un informe estructurado');

            // 2) Generate PDF and Archival on Backend
            const pdfResponse = await fetch('/api/reports/email/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    structured: n8nData.structured,
                    communityId: selectedFolder,
                    communityName: communityName,
                    fechaInicio,
                    fechaFin
                })
            });

            if (!pdfResponse.ok) {
                const errorData = await pdfResponse.json().catch(() => ({}));
                throw new Error(errorData.error || 'Error al generar el PDF certificado');
            }
            const pdfData = await pdfResponse.json();

            // 3) Show Success Modal
            setSuccessModal({
                open: true,
                pdfUrl: pdfData.pdfUrl,
                community: communityName
            });

            // 4) Refresh History
            fetchHistory();
            setShowGenerator(false);

        } catch (error: any) {
            console.error(error);
            toast.error(error.message || 'Error en el proceso');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDeleteReport = (id: string) => {
        setReportToDelete(id);
        setShowDeleteModal(true);
    };

    const handleConfirmDelete = async ({ email, password }: any) => {
        if (!reportToDelete) return;

        setIsDeleting(true);
        try {
            const response = await fetch('/api/reports/email/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: reportToDelete,
                    email,
                    password
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Error al eliminar el informe');

            toast.success('Informe eliminado correctamente');
            setShowDeleteModal(false);
            setReportToDelete(null);
            fetchHistory();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsDeleting(false);
        }
    };

    const requestSort = (key: keyof HistoricalReport) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleViewPdf = async (path: string) => {
        try {
            const { data, error } = await supabase.storage
                .from('documentos')
                .createSignedUrl(path, 3600);
            if (error) throw error;
            window.open(data.signedUrl, '_blank');
        } catch (error) {
            toast.error('No se pudo abrir el PDF');
        }
    };

    const handleDownloadPdf = async (path: string, fileName: string) => {
        try {
            const { data, error } = await supabase.storage
                .from('documentos')
                .createSignedUrl(path, 3600);
            if (error) throw error;

            const response = await fetch(data.signedUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            toast.error('No se pudo descargar el PDF');
        }
    };

    const communities = Array.from(new Set(historicalReports.map(r => r.community_name))).sort();

    // Sort and Filter Logic
    const sortedAndFilteredReports = [...historicalReports]
        .filter(r => filterCommunity === 'all' || r.community_name === filterCommunity)
        .sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];

            if (aValue < bValue) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (aValue > bValue) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });

    const getSortIcon = (key: keyof HistoricalReport) => {
        if (sortConfig.key !== key) return <ChevronUp className="w-3 h-3 text-neutral-300" />;
        return sortConfig.direction === 'asc'
            ? <ChevronUp className="w-3 h-3 text-yellow-500" />
            : <ChevronDown className="w-3 h-3 text-yellow-500" />;
    };

    return (
        <div className="space-y-6 md:space-y-8 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
                        Historial de Informes Email
                    </h1>
                    <p className="text-neutral-500 text-sm">Consulta y genera resúmenes inteligentes de Outlook.</p>
                </div>
                <button
                    onClick={fetchFolders}
                    disabled={loadingFolders || isGenerating}
                    className="bg-yellow-400 text-neutral-900 px-5 py-2.5 rounded-lg text-sm font-bold shadow-sm hover:bg-yellow-500 transition flex items-center gap-2 disabled:opacity-50"
                >
                    {loadingFolders ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Nuevo Informe
                </button>
            </div>

            {/* Main Content: History */}
            {!showGenerator ? (
                <div className="space-y-6">
                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl border border-neutral-200">
                        <div className="flex items-center gap-2 text-sm text-neutral-500 mr-2">
                            <Filter className="w-4 h-4" /> Filtrar por:
                        </div>
                        <select
                            value={filterCommunity}
                            onChange={(e) => setFilterCommunity(e.target.value)}
                            className="bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-yellow-400 outline-none transition"
                        >
                            <option value="all">Todas las comunidades</option>
                            {communities.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-neutral-50 border-b border-neutral-200">
                                <tr>
                                    <th
                                        className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-wider cursor-pointer hover:bg-neutral-100 transition-colors"
                                        onClick={() => requestSort('created_at')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Fecha Informe {getSortIcon('created_at')}
                                        </div>
                                    </th>
                                    <th
                                        className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-wider cursor-pointer hover:bg-neutral-100 transition-colors"
                                        onClick={() => requestSort('community_name')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Comunidad / Folder {getSortIcon('community_name')}
                                        </div>
                                    </th>
                                    <th
                                        className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-wider cursor-pointer hover:bg-neutral-100 transition-colors"
                                        onClick={() => requestSort('period_start')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Periodo Analizado {getSortIcon('period_start')}
                                        </div>
                                    </th>
                                    <th
                                        className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-wider cursor-pointer hover:bg-neutral-100 transition-colors"
                                        onClick={() => requestSort('emails_count')}
                                    >
                                        <div className="flex items-center gap-1">
                                            Emails {getSortIcon('emails_count')}
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-wider text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 italic md:not-italic">
                                {loadingHistory ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-neutral-400">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                            Cargando histórico...
                                        </td>
                                    </tr>
                                ) : sortedAndFilteredReports.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-neutral-400">
                                            No hay informes generados para esta comunidad.
                                        </td>
                                    </tr>
                                ) : (
                                    sortedAndFilteredReports.map((report) => (
                                        <tr key={report.id} className="hover:bg-neutral-50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-neutral-900">{new Date(report.created_at).toLocaleDateString()}</span>
                                                    <span className="text-[10px] text-neutral-400">{new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center">
                                                        <Building className="w-4 h-4 text-yellow-600" />
                                                    </div>
                                                    <span className="text-sm font-medium text-neutral-700">{report.community_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-neutral-500">
                                                {new Date(report.period_start).toLocaleDateString()} al {new Date(report.period_end).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium text-neutral-600">
                                                {report.emails_count} correos
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => handleViewPdf(report.pdf_path)}
                                                        className="p-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                                        title="Ver PDF"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDownloadPdf(report.pdf_path, report.title)}
                                                        className="p-1.5 rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                                        title="Descargar PDF"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                    </button>
                                                    {isAdmin && (
                                                        <button
                                                            onClick={() => handleDeleteReport(report.id)}
                                                            className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                                            title="Eliminar informe"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                /* Generator Form */
                <div className="bg-white p-8 rounded-xl border border-neutral-200 shadow-sm max-w-4xl mx-auto space-y-8 animate-in slide-in-from-top-4 duration-300">
                    <div className="flex justify-between items-center">
                        <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                            <Plus className="w-5 h-5 text-yellow-500" /> Nuevo Proceso de Informe
                        </h2>
                        <button onClick={() => setShowGenerator(false)} className="text-neutral-400 hover:text-neutral-600">
                            <Trash2 className="w-4 h-4" /> Cancelar
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-neutral-700">Comunidad de Outlook (Carpeta)</label>
                            <select
                                value={selectedFolder}
                                onChange={(e) => setSelectedFolder(e.target.value)}
                                className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-yellow-400"
                            >
                                <option value="">Selecciona...</option>
                                {folders.map(f => <option key={f.id} value={f.id}>{f.displayName || f.name}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-neutral-700">Desde</label>
                                <input
                                    type="date"
                                    value={fechaInicio}
                                    onChange={(e) => setFechaInicio(e.target.value)}
                                    className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-yellow-400"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-neutral-700">Hasta</label>
                                <input
                                    type="date"
                                    value={fechaFin}
                                    onChange={(e) => setFechaFin(e.target.value)}
                                    className="w-full bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-yellow-400"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-neutral-50 p-4 rounded-lg flex items-start gap-3 border border-neutral-100">
                        <AlertCircle className="w-5 h-5 text-neutral-400 mt-0.5" />
                        <p className="text-xs text-neutral-500 leading-relaxed">
                            Al hacer clic en generar, el sistema solicitará a la IA que lea todos los correos del periodo seleccionado. Este proceso generará un PDF automático que se archivará en el historial.
                        </p>
                    </div>

                    <button
                        onClick={handleGenerateReport}
                        disabled={isGenerating || !selectedFolder}
                        className="w-full bg-neutral-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-neutral-800 transition shadow-lg shadow-neutral-200 disabled:opacity-50"
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Procesando Emails con IA... (Esto puede tardar)
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-5 h-5 text-yellow-400" />
                                Iniciar Generación Certificada
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* Success Modal */}
            {successModal.open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" onClick={() => setSuccessModal({ ...successModal, open: false })} />
                    <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center space-y-6 animate-in zoom-in-95 duration-200">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle2 className="w-10 h-10 text-green-600" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold text-neutral-900">¡Informe Generado!</h3>
                            <p className="text-neutral-500 mt-2">
                                El resumen de <strong>{successModal.community}</strong> ha sido procesado y archivado correctamente en el sistema.
                            </p>
                        </div>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={async () => {
                                    try {
                                        const response = await fetch(successModal.pdfUrl);
                                        const blob = await response.blob();
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `Informe_${successModal.community.replace(/[^a-z0-9]/gi, '_')}.pdf`;
                                        document.body.appendChild(a);
                                        a.click();
                                        window.URL.revokeObjectURL(url);
                                        document.body.removeChild(a);
                                    } catch (err) {
                                        toast.error("No se pudo descargar el archivo");
                                    }
                                }}
                                className="bg-neutral-900 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-neutral-800 transition"
                            >
                                <Download className="w-4 h-4" /> Descargar PDF
                            </button>
                            <button
                                onClick={() => window.open(successModal.pdfUrl, '_blank')}
                                className="bg-neutral-100 text-neutral-900 py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-neutral-200 transition"
                            >
                                <ExternalLink className="w-4 h-4" /> Ver Online
                            </button>
                            <button
                                onClick={() => setSuccessModal({ ...successModal, open: false })}
                                className="text-neutral-400 text-sm font-medium hover:text-neutral-600 mt-2"
                            >
                                Cerrar Ventana
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Blocking Loader */}
            {isGenerating && (
                <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-neutral-900/80 backdrop-blur-md">
                    <div className="relative w-24 h-24 mb-6">
                        <div className="absolute inset-0 border-4 border-yellow-400/20 rounded-full" />
                        <div className="absolute inset-0 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                        <Mail className="absolute inset-0 m-auto w-10 h-10 text-yellow-400 animate-pulse" />
                    </div>
                    <div className="text-center space-y-2">
                        <h3 className="text-xl font-bold text-white tracking-tight">Procesando Informe con IA</h3>
                        <p className="text-neutral-400 text-sm max-w-xs px-6">
                            Estamos leyendo los emails y generando tu PDF certificado.
                            Por favor, no cierres esta ventana.
                        </p>
                    </div>
                </div>
            )}
            {/* Deletion Modal */}
            <DeleteConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setReportToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                itemType="informe"
                isDeleting={isDeleting}
                description="Se eliminará permanentemente tanto el registro histórico como el archivo PDF del servidor."
            />
        </div>
    );
}

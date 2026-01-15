import Link from 'next/link';
import { FileText, Settings, History } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase/server';

export default async function DocumentosPage() {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    let isAdmin = false;
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('rol')
            .eq('user_id', user.id)
            .single();
        isAdmin = profile?.rol === 'admin';
    }

    const documentTypes = [
        {
            key: "suplidos",
            title: "Suplidos",
            desc: "Genera el documento de suplidos en PDF (descargar / enviar).",
            href: "/dashboard/documentos/suplidos",
            settingsHref: "/dashboard/documentos/ajustes",
            historyHref: "/dashboard/documentos/suplidos/historial",
            available: true,
        },
        {
            key: "certificado_renta",
            title: "Certificado Renta",
            desc: "Certificado de imputación de rentas (datos económicos y fiscales).",
            href: "/dashboard/documentos/certificado-renta",
            settingsHref: "#",
            historyHref: "/dashboard/documentos/certificado-renta/historial",
            available: true,
        },
        {
            key: "varios",
            title: "Varios Facturas Suplidos",
            desc: "Genera facturas varias y certificado de pagos al día en un único PDF.",
            href: "/dashboard/documentos/varios",
            settingsHref: "#",
            historyHref: "/dashboard/documentos/varios/historial",
            available: true,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-yellow-500" />
                <h1 className="text-xl font-bold text-neutral-900">Documentos</h1>
            </div>

            <p className="text-sm text-neutral-600">
                Selecciona el tipo de documento que quieres generar.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {documentTypes.map((doc) => (
                    <div
                        key={doc.key}
                        className={[
                            "relative flex flex-col justify-between rounded-xl border bg-white p-6 transition-all",
                            doc.available ? "border-neutral-200 shadow-sm" : "border-neutral-100 opacity-60",
                        ].join(" ")}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                                <h3 className="text-base font-semibold text-neutral-900">{doc.title}</h3>
                                <p className="mt-2 text-sm text-neutral-600">{doc.desc}</p>
                            </div>

                            <div className="flex items-center gap-1">
                                {/* History Icon */}
                                {doc.available && doc.historyHref && (
                                    <Link
                                        href={doc.historyHref}
                                        title="Historial de documentos"
                                        className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition"
                                    >
                                        <History className="w-5 h-5" />
                                    </Link>
                                )}

                                {/* Settings Icon (Only for Admin) */}
                                {isAdmin && doc.available && (
                                    <Link
                                        href={doc.settingsHref}
                                        title="Ajustes de precios"
                                        className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition"
                                    >
                                        <Settings className="w-5 h-5" />
                                    </Link>
                                )}
                            </div>
                        </div>

                        <div className="mt-6">
                            {doc.available ? (
                                <Link
                                    href={doc.href}
                                    className="inline-flex rounded-md bg-yellow-400 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-yellow-500 transition shadow-sm hover:shadow"
                                >
                                    Crear documento
                                </Link>
                            ) : (
                                <div className="inline-flex rounded-md bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-500">
                                    Próximamente
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

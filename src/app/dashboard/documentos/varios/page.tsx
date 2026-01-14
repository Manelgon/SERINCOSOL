
import Link from "next/link";
import { ArrowLeft, History, FileText } from "lucide-react";
import VariosForm from "./varios-form";

export default function VariosFacturasPage() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <Link
                        href="/dashboard/documentos"
                        className="p-2 -ml-2 rounded-full hover:bg-neutral-100 transition text-neutral-500 hover:text-neutral-900"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-neutral-900">Varios Facturas Suplidos</h1>
                        <p className="text-sm text-neutral-600 mt-1">
                            Genera factura y certificado de pago en un solo documento.
                        </p>
                    </div>
                </div>

                <Link
                    href="/dashboard/documentos/varios/historial"
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-md text-sm font-semibold text-neutral-900 hover:bg-neutral-50 transition"
                >
                    <History className="w-4 h-4" />
                    Historial
                </Link>
            </div>

            <VariosForm />
        </div>
    );
}

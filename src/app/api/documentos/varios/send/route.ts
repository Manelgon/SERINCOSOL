import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route";

/**
 * POST /api/documentos/varios/send
 * Trigger Webhook with document data (No Email sent via Resend)
 * Body: { submissionIdFactura: number, submissionIdCertificado: number, toEmail: string }
 */
export async function POST(req: Request) {
    const supabase = await supabaseRouteClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const { submissionIdFactura, submissionIdCertificado, toEmail } = body || {};

    if ((!submissionIdFactura && !submissionIdCertificado) || !toEmail) {
        return NextResponse.json(
            { error: "Faltan datos (IDs de envíos o email)" },
            { status: 400 }
        );
    }

    try {
        // Fetch submissions
        let subFactura = null;
        let subCertificado = null;

        if (submissionIdFactura) {
            const { data, error } = await supabase
                .from("doc_submissions")
                .select("*")
                .eq("id", submissionIdFactura)
                .single();
            if (!error) subFactura = data;
        }

        if (submissionIdCertificado) {
            const { data, error } = await supabase
                .from("doc_submissions")
                .select("*")
                .eq("id", submissionIdCertificado)
                .single();
            if (!error) subCertificado = data;
        }

        // --- Webhook Trigger (Dual) ---
        const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
        if (webhookUrl) {
            const sendToWebhook = async (sub: any, type: string) => {
                if (!sub) return;
                try {
                    const formData = new FormData();
                    formData.append("to_email", toEmail);
                    formData.append("document_id", sub.id.toString());
                    formData.append("type", type);
                    formData.append("filename", sub.pdf_path.split('/').pop() || `${type}.pdf`);

                    // Send payload data instead of binary file
                    formData.append("data", JSON.stringify(sub.payload));

                    await fetch(webhookUrl, {
                        method: "POST",
                        body: formData,
                    });
                } catch (err) {
                    console.error(`Webhook failed for ${type}:`, err);
                }
            };

            // Trigger both concurrently without blocking
            Promise.allSettled([
                sendToWebhook(subFactura, "varios-factura"),
                sendToWebhook(subCertificado, "varios-certificado")
            ]);
        } else {
            console.warn("EMAIL_WEBHOOK_URL not configured. No action taken.");
        }

        return NextResponse.json({ ok: true });

    } catch (err: any) {
        console.error("Error processing request:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

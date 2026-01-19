import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route";
import { Resend } from "resend";

// Lazy initialization
const getResend = () => new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/documentos/varios/send-single
 * Sends a single Varios document (Invoice or Certificate) based on submissionId.
 * Body: { submissionId: number, toEmail: string }
 */
export async function POST(req: Request) {
    const supabase = await supabaseRouteClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body?.submissionId || !body?.toEmail) {
        return NextResponse.json(
            { error: "Faltan datos (submissionId, toEmail)" },
            { status: 400 }
        );
    }

    try {
        // 1. Get submission
        const sub = await supabase
            .from("doc_submissions")
            .select("id, title, pdf_path, payload")
            .eq("id", body.submissionId)
            .single();

        if (sub.error || !sub.data) {
            return NextResponse.json({ error: "No existe ese envío" }, { status: 404 });
        }

        // 2. Generate signed URL (24 hours) from 'documentos_administrativos'
        const signed = await supabase.storage
            .from("documentos_administrativos")
            .createSignedUrl(sub.data.pdf_path, 60 * 60 * 24);

        if (signed.error) {
            return NextResponse.json({ error: signed.error.message }, { status: 500 });
        }

        const from = process.env.EMAIL_FROM;
        if (!from) {
            return NextResponse.json({ error: "Falta EMAIL_FROM en variables de entorno" }, { status: 500 });
        }

        // Payload info
        const cliente = sub.data.payload?.["cliente"] || sub.data.payload?.["Cliente"] || "Cliente";
        const title = sub.data.title || "Documento Varios";

        // 3. Send Email
        const { error } = await getResend().emails.send({
            from,
            to: body.toEmail,
            subject: `Documento ${title} - ${cliente}`,
            html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333">
          <h2 style="margin:0 0 16px;color:#1a1a1a">Documento Disponible</h2>
          
          <div style="margin:0 0 20px">
            <p style="margin:0 0 8px">Hola,</p>
            <p style="margin:0 0 8px">Se ha generado el siguiente documento para <strong>${cliente}</strong>:</p>
            <ul style="color:#555">
                <li><strong>Tipo:</strong> ${title}</li>
            </ul>
          </div>
          
          <div style="margin:0 0 24px;padding:16px;background-color:#fef3c7;border-left:4px solid:#f59e0b;border-radius:4px">
            <p style="margin:0">
              Puedes descargar el documento PDF desde el siguiente botón (enlace válido 24h):
              <br/><br/>
              <a 
                href="${signed.data.signedUrl}" 
                style="display:inline-block;padding:10px 20px;background-color:#facc15;color:#18181b;text-decoration:none;border-radius:6px;font-weight:600"
              >
                Descargar Documento
              </a>
            </p>
          </div>
          
          <p style="color:#666;font-size:12px;margin:24px 0 0">
            SERINCOSOL PANEL - Sistema de Gestión
          </p>
        </div>
      `,
        });

        if (error) {
            console.error("Resend error:", error);
            return NextResponse.json({ error: error.message }, { status: 502 });
        }

        // --- Webhook Trigger ---
        // --- Webhook Trigger ---
        const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
        if (webhookUrl) {
            try {
                const formData = new FormData();
                formData.append("to_email", body.toEmail);
                formData.append("document_id", sub.data.id.toString());
                formData.append("type", "varios-single"); // Distinguish from the batched "varios-factura"
                formData.append("filename", sub.data.pdf_path.split('/').pop() || "documento.pdf");

                // Send payload data instead of binary file
                formData.append("data", JSON.stringify(sub.data.payload));

                fetch(webhookUrl, {
                    method: "POST",
                    body: formData,
                }).catch(err => console.error("Webhook trigger failed:", err));
            } catch (webhookError) {
                console.error("Error preparing webhook payload:", webhookError);
            }
        }

        return NextResponse.json({ ok: true });

    } catch (error: any) {
        console.error("Error sending email:", error);
        return NextResponse.json({ error: error.message || "Error enviando email" }, { status: 500 });
    }
}

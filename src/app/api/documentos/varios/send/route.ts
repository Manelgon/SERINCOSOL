import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route";
import { Resend } from "resend";

const getResend = () => new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/documentos/varios/send
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

    if (!submissionIdFactura || !submissionIdCertificado || !toEmail) {
        return NextResponse.json(
            { error: "Faltan datos (IDs de envíos o email)" },
            { status: 400 }
        );
    }

    try {
        // 1. Get submissions
        const { data: subs, error: subError } = await supabase
            .from("doc_submissions")
            .select("id, title, pdf_path, payload")
            .in("id", [submissionIdFactura, submissionIdCertificado]);

        if (subError || !subs || subs.length !== 2) {
            return NextResponse.json({ error: "No se encontraron los envíos especificados" }, { status: 404 });
        }

        const subFactura = subs.find(s => s.id === submissionIdFactura);
        const subCertificado = subs.find(s => s.id === submissionIdCertificado);

        if (!subFactura || !subCertificado) {
            return NextResponse.json({ error: "No se pudieron identificar los documentos" }, { status: 404 });
        }

        // 2. Generate signed URLs (24 hours) from 'documentos_administrativos'
        const signed1 = await supabase.storage
            .from("documentos_administrativos")
            .createSignedUrl(subFactura.pdf_path, 60 * 60 * 24);

        const signed2 = await supabase.storage
            .from("documentos_administrativos")
            .createSignedUrl(subCertificado.pdf_path, 60 * 60 * 24);

        if (signed1.error || signed2.error) {
            return NextResponse.json({ error: "Error generando enlaces seguros" }, { status: 500 });
        }

        const from = process.env.EMAIL_FROM;
        if (!from) {
            return NextResponse.json({ error: "Falta EMAIL_FROM en variables de entorno" }, { status: 500 });
        }

        // Payload info (Taken from Factura, assumes same client)
        const cliente = subFactura.payload?.["cliente"] || subFactura.payload?.["Cliente"] || "Cliente";

        // 3. Send Email
        const { error } = await getResend().emails.send({
            from,
            to: toEmail,
            subject: `Documentación Varios - ${cliente}`,
            html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333">
          <h2 style="margin:0 0 16px;color:#1a1a1a">Documentación Generada</h2>
          
          <div style="margin:0 0 20px">
            <p style="margin:0 0 8px">Hola,</p>
            <p style="margin:0 0 8px">Se han generado los siguientes documentos para <strong>${cliente}</strong>:</p>
          </div>
          
          <div style="margin:0 0 24px;padding:16px;background-color:#fef3c7;border-left:4px solid:#f59e0b;border-radius:4px">
            <p style="margin:0 0 12px">Puedes descargar los archivos PDF desde los siguientes enlaces (válidos 24 horas):</p>
            
            <div style="margin-bottom: 12px;">
                <a 
                    href="${signed1.data?.signedUrl}" 
                    style="display:inline-block;padding:10px 20px;background-color:#facc15;color:#18181b;text-decoration:none;border-radius:6px;font-weight:600"
                >
                    Descargar Factura
                </a>
            </div>

            <div>
                <a 
                    href="${signed2.data?.signedUrl}" 
                    style="display:inline-block;padding:10px 20px;background-color:#fff;border:1px solid #ccc;color:#18181b;text-decoration:none;border-radius:6px;font-weight:600"
                >
                    Descargar Certificado
                </a>
            </div>
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

        return NextResponse.json({ ok: true });

    } catch (error: any) {
        console.error("Error sending email:", error);
        return NextResponse.json({ error: error.message || "Error enviando email" }, { status: 500 });
    }
}

import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route";
import { Resend } from "resend";

// Lazy initialization to avoid build-time errors
const getResend = () => new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/documentos/suplidos/send
 * Send PDF via email using Resend
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
    // Load submission record
    const sub = await supabase
      .from("doc_submissions")
      .select("id, title, pdf_path, payload")
      .eq("id", body.submissionId)
      .single();

    if (sub.error || !sub.data) {
      return NextResponse.json({ error: "No existe ese envío" }, { status: 404 });
    }

    // Generate signed URL (24 hours)
    const signed = await supabase.storage
      .from("documents")
      .createSignedUrl(sub.data.pdf_path, 60 * 60 * 24);

    if (signed.error) {
      return NextResponse.json({ error: signed.error.message }, { status: 500 });
    }

    // Get email sender from env
    const from = process.env.EMAIL_FROM;
    if (!from) {
      return NextResponse.json({ error: "Falta EMAIL_FROM en variables de entorno" }, { status: 500 });
    }

    // Extract payload info
    const nombre = sub.data.payload?.["Nombre Cliente"] ?? "";
    const fecha = sub.data.payload?.["Fecha emisión"] ?? "";
    const sumaFinal = sub.data.payload?.["Suma final"] ?? "";

    // Send email with Resend
    const { error } = await getResend().emails.send({
      from,
      to: body.toEmail,
      subject: `Documento Suplidos ${nombre ? `- ${nombre}` : ""}`.trim(),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333">
          <h2 style="margin:0 0 16px;color:#1a1a1a">Documento de Suplidos</h2>
          
          <div style="margin:0 0 20px">
            <p style="margin:0 0 8px"><strong>Cliente:</strong> ${nombre}</p>
            <p style="margin:0 0 8px"><strong>Fecha emisión:</strong> ${fecha}</p>
            ${sumaFinal ? `<p style="margin:0 0 8px"><strong>Suma final:</strong> ${sumaFinal}</p>` : ""}
          </div>
          
          <div style="margin:0 0 24px;padding:16px;background-color:#fef3c7;border-left:4px solid:#f59e0b;border-radius:4px">
            <p style="margin:0">
              Puedes descargar el PDF desde este enlace (válido 24 horas):
              <br/><br/>
              <a 
                href="${signed.data.signedUrl}" 
                style="display:inline-block;padding:10px 20px;background-color:#facc15;color:#18181b;text-decoration:none;border-radius:6px;font-weight:600"
              >
                Descargar PDF
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
    const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const fileData = await supabase.storage.from("documents").download(sub.data.pdf_path);

        if (fileData.data) {
          const formData = new FormData();
          formData.append("to_email", body.toEmail);
          formData.append("document_id", sub.data.id.toString());
          formData.append("type", "suplidos");
          formData.append("filename", sub.data.pdf_path.split('/').pop() || "suplidos.pdf");
          formData.append("file", fileData.data);

          // Non-blocking fetch
          fetch(webhookUrl, {
            method: "POST",
            body: formData,
          }).catch(err => console.error("Webhook trigger failed:", err));
        }
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

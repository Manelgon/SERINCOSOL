import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route";

/**
 * POST /api/documentos/certificado-renta/send
 * Trigger Webhook with document data (No Email sent via Resend)
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

    // --- Webhook Trigger ---
    const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const formData = new FormData();
        formData.append("to_email", body.toEmail);
        formData.append("document_id", sub.data.id.toString());
        formData.append("type", "certificado-renta");
        formData.append("filename", sub.data.pdf_path.split('/').pop() || "certificado.pdf");

        // Send payload data instead of binary file
        formData.append("data", JSON.stringify(sub.data.payload));

        await fetch(webhookUrl, {
          method: "POST",
          body: formData,
        }).catch(err => console.error("Webhook trigger failed:", err));
      } catch (webhookError) {
        console.error("Error preparing webhook payload:", webhookError);
      }
    } else {
      console.warn("EMAIL_WEBHOOK_URL not configured. No action taken.");
    }

    return NextResponse.json({ ok: true });

  } catch (error: any) {
    console.error("Error processing request:", error);
    return NextResponse.json({ error: error.message || "Error procesando solicitud" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import path from "path";
import { logActivity } from "@/lib/logActivity";

// Constants
const A4 = { w: 595.28, h: 841.89 };
// App-matched color palette: neutral-900 headers, yellow-400 accents
const BRAND_DARK = rgb(0.09, 0.09, 0.11);    // neutral-900
const BRAND_YELLOW = rgb(0.98, 0.84, 0.40);  // yellow-400
const BRAND_YELLOW_LIGHT = rgb(0.99, 0.95, 0.84); // yellow-50
const BORDER = rgb(0.90, 0.90, 0.90);         // neutral-200
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.3, 0.3, 0.3);
const LIGHT_GRAY = rgb(0.5, 0.5, 0.5);
const WHITE = rgb(1, 1, 1);
const SECTION_BG = rgb(0.97, 0.97, 0.97);     // neutral-50
const TABLE_HEADER_BG = rgb(0.09, 0.09, 0.11); // neutral-900
const ALT_ROW_BG = rgb(0.98, 0.98, 0.98);     // neutral-100
const ACCENT_TEXT = rgb(0.56, 0.49, 0.02);     // yellow-800

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "-";
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch {
        return dateStr;
    }
}

function truncateText(text: string, maxLen: number): string {
    if (!text) return "-";
    return text.length > maxLen ? text.substring(0, maxLen - 3) + "..." : text;
}

// Strip numeric code prefix from community name: "002 CARLINDA 4" -> "CARLINDA 4"
function stripCodePrefix(name: string): string {
    if (!name) return 'Desconocida';
    return name.replace(/^\d+\s*[-–]?\s*/, '').trim() || name;
}

// Native pie chart drawing with pdf-lib
function drawPieChart(
    page: any,
    cx: number, cy: number, radius: number,
    slices: { label: string; value: number; color: any }[],
    font: any, bold: any
) {
    const total = slices.reduce((s, sl) => s + sl.value, 0);
    if (total === 0) {
        page.drawText("Sin datos", { x: cx - 20, y: cy - 4, size: 8, font, color: LIGHT_GRAY });
        return;
    }

    // Draw pie slices using filled triangles (approximation with small arc segments)
    let startAngle = -Math.PI / 2; // Start from top
    const segments = 60; // segments per full circle

    for (const slice of slices) {
        if (slice.value === 0) continue;
        const sliceAngle = (slice.value / total) * 2 * Math.PI;
        const segCount = Math.max(2, Math.ceil((sliceAngle / (2 * Math.PI)) * segments));
        const angleStep = sliceAngle / segCount;

        for (let s = 0; s < segCount; s++) {
            const a1 = startAngle + s * angleStep;
            const a2 = startAngle + (s + 1) * angleStep;
            // Draw triangle from center to two points on circumference
            const x1 = cx + radius * Math.cos(a1);
            const y1 = cy + radius * Math.sin(a1);
            const x2 = cx + radius * Math.cos(a2);
            const y2 = cy + radius * Math.sin(a2);

            // Use lines to simulate filled triangle
            page.drawLine({ start: { x: cx, y: cy }, end: { x: x1, y: y1 }, thickness: radius * 0.03, color: slice.color });
            page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: radius * 0.03, color: slice.color });
            // Fill with concentric circles approach
            for (let r = 1; r <= radius; r += 1.2) {
                const fx1 = cx + r * Math.cos(a1);
                const fy1 = cy + r * Math.sin(a1);
                const fx2 = cx + r * Math.cos(a2);
                const fy2 = cy + r * Math.sin(a2);
                page.drawLine({ start: { x: fx1, y: fy1 }, end: { x: fx2, y: fy2 }, thickness: 1.5, color: slice.color });
            }
        }
        startAngle += sliceAngle;
    }

    // Draw white donut hole
    const innerR = radius * 0.55;
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
        const x1 = cx + innerR * Math.cos(a);
        const y1 = cy + innerR * Math.sin(a);
        const x2 = cx + innerR * Math.cos(a + 0.03);
        const y2 = cy + innerR * Math.sin(a + 0.03);
        page.drawLine({ start: { x: cx, y: cy }, end: { x: x1, y: y1 }, thickness: innerR * 0.8, color: WHITE });
    }
    // Clean inner circle
    page.drawCircle({ x: cx, y: cy, size: innerR - 2, color: WHITE });

    // Legend below the chart
    let legendY = cy - radius - 18;
    let legendX = cx - radius;
    for (const slice of slices) {
        if (slice.value === 0) continue;
        const pct = Math.round((slice.value / total) * 100);
        page.drawRectangle({ x: legendX, y: legendY - 3, width: 8, height: 8, color: slice.color });
        page.drawText(`${slice.label}: ${slice.value} (${pct}%)`, { x: legendX + 12, y: legendY - 2, size: 7, font, color: GRAY });
        legendY -= 14;
    }
}

// Helper: draw wrapped text and return new Y
function drawWrappedText(
    page: any, text: string, x: number, y: number, maxWidth: number,
    font: any, size: number, lineHeight: number, color: any,
    pdfDoc: any
): { y: number; page: any } {
    const words = (text || "").split(' ');
    let line = '';
    let currentY = y;
    let currentPage = page;

    for (const word of words) {
        const testLine = line + word + ' ';
        const width = font.widthOfTextAtSize(testLine, size);
        if (width > maxWidth && line.length > 0) {
            currentPage.drawText(line.trim(), { x, y: currentY, size, font, color });
            currentY -= lineHeight;
            line = word + ' ';
            if (currentY < 60) {
                currentPage = pdfDoc.addPage([A4.w, A4.h]);
                currentY = A4.h - 50;
            }
        } else {
            line = testLine;
        }
    }
    if (line.trim()) {
        currentPage.drawText(line.trim(), { x, y: currentY, size, font, color });
        currentY -= lineHeight;
    }
    return { y: currentY, page: currentPage };
}

// Helper: draw a section title bar
function drawSectionTitle(page: any, title: string, x: number, y: number, w: number, bold: any) {
    const h = 32;
    // Dark header bar matching app's neutral-900 style
    page.drawRectangle({ x, y: y - h, width: w, height: h, color: BRAND_DARK });
    // Yellow accent bar on left
    page.drawRectangle({ x, y: y - h, width: 4, height: h, color: BRAND_YELLOW });
    page.drawText(title, { x: x + 16, y: y - 21, size: 11, font: bold, color: WHITE });
    return y - h - 12;
}

// Helper: draw table header row
function drawTableHeader(page: any, columns: { label: string; width: number }[], x: number, y: number, bold: any) {
    const rowH = 24;
    let totalW = columns.reduce((sum, c) => sum + c.width, 0);
    // Subtle light header matching app's neutral-100 bg with bottom border
    page.drawRectangle({ x, y: y - rowH, width: totalW, height: rowH, color: SECTION_BG });
    page.drawLine({ start: { x, y: y - rowH }, end: { x: x + totalW, y: y - rowH }, thickness: 1, color: BRAND_YELLOW });

    let cx = x;
    for (const col of columns) {
        page.drawText(col.label.toUpperCase(), { x: cx + 6, y: y - 16, size: 7, font: bold, color: BRAND_DARK });
        cx += col.width;
    }
    return y - rowH;
}

// Helper: draw table data row
function drawTableRow(page: any, values: string[], columns: { label: string; width: number }[], x: number, y: number, font: any, isAlt: boolean) {
    const rowH = 20;
    let totalW = columns.reduce((sum, c) => sum + c.width, 0);
    if (isAlt) {
        page.drawRectangle({ x, y: y - rowH, width: totalW, height: rowH, color: ALT_ROW_BG });
    }
    page.drawLine({ start: { x, y: y - rowH }, end: { x: x + totalW, y: y - rowH }, thickness: 0.3, color: BORDER });

    let cx = x;
    for (let i = 0; i < values.length; i++) {
        const maxChars = Math.floor(columns[i].width / 4.5);
        page.drawText(truncateText(values[i] || "-", maxChars), { x: cx + 6, y: y - 14, size: 7.5, font, color: GRAY });
        cx += columns[i].width;
    }
    return y - rowH;
}

export async function POST(req: Request) {
    console.log("[CommunityReport] Starting combined PDF generation...");

    try {
        const supabase = await supabaseRouteClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

        const body = await req.json();
        const { communityId: inputId, communityName, communityCode, includeEmails, includeDebts, includeTickets, startDate, endDate, saveToHistory } = body;

        if (!inputId) return NextResponse.json({ error: "Comunidad requerida" }, { status: 400 });

        // Default dates if not provided
        const finalStartDate = startDate || new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0];
        const finalEndDate = endDate || new Date().toISOString().split('T')[0];

        // 1) Logic to find actual community ID in Supabase if inputId is an OneDrive ID
        let communityId = inputId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inputId);

        console.log(`[CommunityReport] Lookup Strategy for: "${communityName}"`);

        if (!isUuid) {
            // Extract code: "010 - Test" -> "010"
            const codeMatch = communityName.match(/^(\d+)/);
            const extractedCode = codeMatch ? codeMatch[1] : communityCode;

            // Search by code or exact name
            const { data: commData } = await supabaseAdmin
                .from('comunidades')
                .select('id, nombre_cdad, codigo')
                .or(`codigo.eq."${extractedCode}",nombre_cdad.eq."${communityName}"`)
                .maybeSingle();

            if (commData) {
                communityId = commData.id;
                console.log(`[CommunityReport] Redirected ${inputId} -> Supabase ID ${communityId} (${commData.nombre_cdad})`);
            } else {
                console.warn(`[CommunityReport] Community not found for "${communityName}". Using fallback.`);
            }
        }

        // 2) Initialize PDF
        const pdfDoc = await PDFDocument.create();
        let page = pdfDoc.addPage([A4.w, A4.h]);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const marginX = 40;
        const contentW = A4.w - marginX * 2;
        let currentY = A4.h - 40;

        // 3) Logo
        try {
            const logoPath = path.join(process.cwd(), "public", "logo-retenciones.png");
            const logoBytes = await fs.readFile(logoPath);
            const img = await pdfDoc.embedPng(logoBytes);
            const targetW = A4.w - 20;
            const targetH = (img.height / img.width) * targetW;
            page.drawImage(img, { x: 10, y: A4.h - 10 - targetH, width: targetW, height: targetH });
            currentY = A4.h - 20 - targetH - 25;
        } catch (e) {
            console.warn("[CommunityReport] Logo skip:", e);
        }

        // 4) Header - strip code prefix from community name
        const cleanName = stripCodePrefix(communityName || '');
        page.drawText(`Informe de: ${cleanName}`, { x: marginX, y: currentY, size: 18, font: bold, color: BRAND_DARK });
        currentY -= 22;
        page.drawText(`Periodo: ${formatDate(finalStartDate)} al ${formatDate(finalEndDate)}`, { x: marginX, y: currentY, size: 10, font, color: GRAY });
        currentY -= 14;

        const now = new Date();
        const dateStr = formatDate(now.toISOString());
        const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        page.drawText(`Fecha del Informe: ${dateStr} ${timeStr}`, { x: marginX, y: currentY, size: 10, font, color: GRAY });
        currentY -= 25;

        // Sections Summary
        const sections: string[] = [];
        if (includeTickets) sections.push("Tickets");
        if (includeDebts) sections.push("Deudas");
        if (includeEmails) sections.push("Emails");
        page.drawText(`Secciones: ${sections.join(", ")}`, { x: marginX, y: currentY, size: 9, font, color: LIGHT_GRAY });
        currentY -= 30;

        // ===== SECCION 1: TICKETS (Incidencias) =====
        if (includeTickets) {
            console.log("[CommunityReport] Section: Tickets");
            if (currentY < 150) { page = pdfDoc.addPage([A4.w, A4.h]); currentY = A4.h - 50; }
            currentY = drawSectionTitle(page, "INCIDENCIAS / TICKETS", marginX, currentY, contentW, bold);

            try {
                const { data: tickets, error: tErr } = await supabaseAdmin
                    .from('incidencias')
                    .select('id, nombre_cliente, mensaje, urgencia, sentimiento, resuelto, created_at, profiles:gestor_asignado(nombre)')
                    .eq('comunidad_id', communityId)
                    .gte('created_at', finalStartDate)
                    .lte('created_at', finalEndDate + 'T23:59:59')
                    .order('created_at', { ascending: false });

                if (tErr) throw tErr;

                if (tickets && tickets.length > 0) {
                    // Stats summary with yellow accent
                    const resueltas = tickets.filter((t: any) => t.resuelto).length;
                    const pendientes = tickets.filter((t: any) => !t.resuelto).length;
                    const statsText = `Total: ${tickets.length}  |  Resueltas: ${resueltas}  |  Pendientes: ${pendientes}`;
                    page.drawText(statsText, { x: marginX + 5, y: currentY, size: 8.5, font: bold, color: ACCENT_TEXT });
                    currentY -= 18;

                    const cols = [
                        { label: "ID", width: 35 },
                        { label: "Cliente", width: 100 },
                        { label: "Descripción", width: 120 },
                        { label: "Urgencia", width: 55 },
                        { label: "Estado", width: 55 },
                        { label: "Gestor", width: 75 },
                        { label: "Fecha", width: 65 },
                    ];
                    currentY = drawTableHeader(page, cols, marginX, currentY, bold);

                    for (let i = 0; i < tickets.length; i++) {
                        if (currentY < 60) {
                            page = pdfDoc.addPage([A4.w, A4.h]); currentY = A4.h - 50;
                            currentY = drawTableHeader(page, cols, marginX, currentY, bold);
                        }
                        const t = tickets[i];
                        const prof = Array.isArray(t.profiles) ? t.profiles[0] : t.profiles;
                        currentY = drawTableRow(page, [
                            String(t.id),
                            t.nombre_cliente || "-",
                            t.mensaje || "-",
                            t.urgencia || "-",
                            t.resuelto ? "Resuelta" : "Pendiente",
                            (prof as any)?.nombre || "-",
                            formatDate(t.created_at)
                        ], cols, marginX, currentY, font, i % 2 === 1);
                    }
                    // ===== CHARTS: Tickets =====
                    currentY -= 15;
                    if (currentY < 250) { page = pdfDoc.addPage([A4.w, A4.h]); currentY = A4.h - 50; }

                    // Chart title
                    page.drawText("Resumen Visual de Tickets", { x: marginX + 5, y: currentY, size: 10, font: bold, color: BRAND_DARK });
                    currentY -= 15;

                    const chartRadius = 50;
                    const chartCenterY = currentY - chartRadius - 10;

                    // Pie 1: Estado (Resueltas vs Pendientes)
                    const pie1X = marginX + chartRadius + 30;
                    page.drawText("Estado", { x: pie1X - 15, y: currentY, size: 8, font: bold, color: GRAY });
                    drawPieChart(page, pie1X, chartCenterY, chartRadius, [
                        { label: "Resuelta", value: resueltas, color: rgb(0, 0.77, 0.62) },
                        { label: "Pendiente", value: pendientes, color: BRAND_YELLOW }
                    ], font, bold);

                    // Pie 2: Urgencia
                    const urgMap: Record<string, number> = { 'Alta': 0, 'Media': 0, 'Baja': 0 };
                    tickets.forEach((t: any) => { if (t.urgencia && urgMap.hasOwnProperty(t.urgencia)) urgMap[t.urgencia]++; });
                    const pie2X = marginX + chartRadius * 2 + 140;
                    page.drawText("Urgencia", { x: pie2X - 20, y: currentY, size: 8, font: bold, color: GRAY });
                    drawPieChart(page, pie2X, chartCenterY, chartRadius, [
                        { label: "Alta", value: urgMap['Alta'], color: rgb(1, 0.5, 0.26) },
                        { label: "Media", value: urgMap['Media'], color: BRAND_YELLOW },
                        { label: "Baja", value: urgMap['Baja'], color: rgb(0, 0.77, 0.62) }
                    ], font, bold);

                    // Pie 3: Sentimiento
                    const sentMap: Record<string, number> = {};
                    tickets.forEach((t: any) => { const s = t.sentimiento || 'Neutral'; sentMap[s] = (sentMap[s] || 0) + 1; });
                    const pie3X = marginX + chartRadius * 4 + 250;
                    page.drawText("Sentimiento", { x: pie3X - 25, y: currentY, size: 8, font: bold, color: GRAY });
                    drawPieChart(page, pie3X, chartCenterY, chartRadius, [
                        { label: "Positivo", value: sentMap['Positivo'] || 0, color: rgb(0, 0.77, 0.62) },
                        { label: "Neutral", value: sentMap['Neutral'] || 0, color: BRAND_YELLOW },
                        { label: "Negativo", value: sentMap['Negativo'] || 0, color: rgb(1, 0.5, 0.26) }
                    ], font, bold);

                    // Space after charts + legends
                    const maxLegendItems = Math.max(
                        2,
                        Object.values(urgMap).filter(v => v > 0).length,
                        Object.keys(sentMap).length
                    );
                    currentY = chartCenterY - chartRadius - 18 - (maxLegendItems * 14) - 10;

                } else {
                    page.drawText("No se encontraron incidencias en este periodo.", { x: marginX + 5, y: currentY, size: 9, font, color: GRAY });
                    currentY -= 20;
                }
            } catch (e: any) {
                page.drawText(`Error de datos (Tickets): ${e.message}`, { x: marginX + 5, y: currentY, size: 9, font, color: rgb(0.8, 0, 0) });
                currentY -= 20;
            }
            currentY -= 20;
        }

        // ===== SECCION 2: DEUDAS (Morosidad) =====
        if (includeDebts) {
            console.log("[CommunityReport] Section: Debts");
            if (currentY < 150) { page = pdfDoc.addPage([A4.w, A4.h]); currentY = A4.h - 50; }
            currentY = drawSectionTitle(page, "DEUDAS / MOROSIDAD", marginX, currentY, contentW, bold);

            try {
                const { data: debts, error: dErr } = await supabaseAdmin
                    .from('morosidad')
                    .select('nombre_deudor, apellidos, titulo_documento, importe, estado, fecha_notificacion, created_at')
                    .eq('comunidad_id', communityId)
                    .gte('created_at', finalStartDate)
                    .lte('created_at', finalEndDate + 'T23:59:59')
                    .order('created_at', { ascending: false });

                if (dErr) throw dErr;

                if (debts && debts.length > 0) {
                    const totalDeuda = debts.reduce((s: number, d: any) => s + (d.importe || 0), 0);
                    page.drawText(`Registros: ${debts.length}  |  Importe Total: ${totalDeuda.toLocaleString('es-ES')} EUR`, { x: marginX + 5, y: currentY, size: 8.5, font: bold, color: ACCENT_TEXT });
                    currentY -= 18;

                    const cols = [
                        { label: "Deudor", width: 140 },
                        { label: "Concepto", width: 120 },
                        { label: "Importe", width: 70 },
                        { label: "Estado", width: 60 },
                        { label: "Fecha Notif.", width: 70 },
                    ];
                    currentY = drawTableHeader(page, cols, marginX, currentY, bold);

                    for (let i = 0; i < debts.length; i++) {
                        if (currentY < 60) {
                            page = pdfDoc.addPage([A4.w, A4.h]); currentY = A4.h - 50;
                            currentY = drawTableHeader(page, cols, marginX, currentY, bold);
                        }
                        const d = debts[i];
                        currentY = drawTableRow(page, [
                            `${d.nombre_deudor || ''} ${d.apellidos || ''}`.trim(),
                            d.titulo_documento || "-",
                            `${(d.importe || 0).toLocaleString('es-ES')} €`,
                            d.estado || "-",
                            formatDate(d.fecha_notificacion)
                        ], cols, marginX, currentY, font, i % 2 === 1);
                    }
                    // ===== CHART: Deudas =====
                    currentY -= 15;
                    if (currentY < 250) { page = pdfDoc.addPage([A4.w, A4.h]); currentY = A4.h - 50; }

                    page.drawText("Resumen Visual de Deudas", { x: marginX + 5, y: currentY, size: 10, font: bold, color: BRAND_DARK });
                    currentY -= 15;

                    const debtChartRadius = 50;
                    const debtChartY = currentY - debtChartRadius - 10;

                    // Pie: Estado Deuda
                    const debtPendiente = debts.filter((d: any) => d.estado === 'Pendiente').reduce((s: number, d: any) => s + (d.importe || 0), 0);
                    const debtPagado = debts.filter((d: any) => d.estado === 'Pagado').reduce((s: number, d: any) => s + (d.importe || 0), 0);
                    const debtOtros = totalDeuda - debtPendiente - debtPagado;

                    const debtPie1X = marginX + debtChartRadius + 30;
                    page.drawText("Estado de Deuda", { x: debtPie1X - 30, y: currentY, size: 8, font: bold, color: GRAY });
                    drawPieChart(page, debtPie1X, debtChartY, debtChartRadius, [
                        { label: "Pendiente", value: debtPendiente, color: BRAND_YELLOW },
                        { label: "Pagado", value: debtPagado, color: rgb(0, 0.77, 0.62) },
                        ...(debtOtros > 0 ? [{ label: "Otros", value: debtOtros, color: LIGHT_GRAY }] : [])
                    ], font, bold);

                    // Pie 2: Count by status
                    const debtCountPendiente = debts.filter((d: any) => d.estado === 'Pendiente').length;
                    const debtCountPagado = debts.filter((d: any) => d.estado === 'Pagado').length;
                    const debtCountOtros = debts.length - debtCountPendiente - debtCountPagado;

                    const debtPie2X = marginX + debtChartRadius * 2 + 140;
                    page.drawText("Recibos", { x: debtPie2X - 15, y: currentY, size: 8, font: bold, color: GRAY });
                    drawPieChart(page, debtPie2X, debtChartY, debtChartRadius, [
                        { label: "Pendiente", value: debtCountPendiente, color: BRAND_YELLOW },
                        { label: "Pagado", value: debtCountPagado, color: rgb(0, 0.77, 0.62) },
                        ...(debtCountOtros > 0 ? [{ label: "Otros", value: debtCountOtros, color: LIGHT_GRAY }] : [])
                    ], font, bold);

                    const debtLegendItems = Math.max(2, (debtOtros > 0 ? 3 : 2));
                    currentY = debtChartY - debtChartRadius - 18 - (debtLegendItems * 14) - 10;

                } else {
                    page.drawText("No se encontraron deudas en este periodo.", { x: marginX + 5, y: currentY, size: 9, font, color: GRAY });
                    currentY -= 20;
                }
            } catch (e: any) {
                page.drawText(`Error de datos (Deudas): ${e.message}`, { x: marginX + 5, y: currentY, size: 9, font, color: rgb(0.8, 0, 0) });
                currentY -= 20;
            }
            currentY -= 20;
        }

        // ===== SECCION 3: EMAILS =====
        if (includeEmails) {
            console.log("[CommunityReport] Section: Emails");
            if (currentY < 150) { page = pdfDoc.addPage([A4.w, A4.h]); currentY = A4.h - 50; }
            currentY = drawSectionTitle(page, "GESTIÓN DE COMUNICACIONES (IA)", marginX, currentY, contentW, bold);

            try {
                const n8nRes = await fetch('https://serinwebhook.afcademia.com/webhook/135d1aad-2cd5-42b6-b51e-4307a4be5444', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        comunidad_nombre: communityName,
                        comunidad_id: inputId, // Still use OneDrive ID for n8n
                        fecha_inicio: finalStartDate,
                        fecha_fin: finalEndDate,
                    })
                });

                if (n8nRes.ok) {
                    let n8nData = await n8nRes.json();
                    if (Array.isArray(n8nData)) n8nData = n8nData[0];

                    if (n8nData.structured?.emails?.length > 0) {
                        const emails = n8nData.structured.emails;
                        page.drawText(`Emails analizados por IA: ${emails.length}`, { x: marginX + 5, y: currentY, size: 8, font, color: GRAY });
                        currentY -= 15;

                        for (const email of emails) {
                            if (currentY < 100) { page = pdfDoc.addPage([A4.w, A4.h]); currentY = A4.h - 50; }

                            page.drawText(`REMITENTE: ${email.remitente_nombre || email.remitente_email} (${formatDate(email.fecha)})`, {
                                x: marginX + 5, y: currentY, size: 8, font: bold, color: BRAND_DARK
                            });
                            currentY -= 12;

                            const wrap = drawWrappedText(page, email.resumen || "-", marginX + 15, currentY, contentW - 20, font, 8, 11, GRAY, pdfDoc);
                            currentY = wrap.y - 10;
                            page = wrap.page;
                        }
                    } else {
                        page.drawText("No se detectaron comunicaciones relevantes en este periodo.", { x: marginX + 5, y: currentY, size: 9, font, color: GRAY });
                        currentY -= 20;
                    }
                } else {
                    throw new Error("Conexión con n8n fallida");
                }
            } catch (e: any) {
                page.drawText(`Error de comunicaciones: ${e.message}`, { x: marginX + 5, y: currentY, size: 9, font, color: GRAY });
                currentY -= 20;
            }
        }

        // 5) Footers with brand styling
        const pages = pdfDoc.getPages();
        for (let i = 0; i < pages.length; i++) {
            const p = pages[i];
            // Yellow accent line at footer
            p.drawLine({ start: { x: marginX, y: 38 }, end: { x: A4.w - marginX, y: 38 }, thickness: 0.5, color: BRAND_YELLOW });
            p.drawText(`Página ${i + 1} de ${pages.length}  |  Serincosol AI Report  |  ${formatDate(new Date().toISOString())}`, {
                x: A4.w / 2 - 90, y: 25, size: 7, font, color: LIGHT_GRAY
            });
        }

        const pdfBytes = await pdfDoc.save();

        if (saveToHistory) {
            const safeName = (communityName || 'Comunidad').replace(/[^a-z0-9]/gi, '_');
            const timestamp = Date.now();
            const filePath = `community-reports/${safeName}/${timestamp}_informe.pdf`;

            await supabaseAdmin.storage.from("documentos").upload(filePath, pdfBytes, { contentType: 'application/pdf' });

            const { data: record } = await supabaseAdmin.from('email_reports').insert({
                community_id: inputId,
                community_name: communityName,
                title: `Informe Global: ${sections.join(", ")}`,
                period_start: finalStartDate,
                period_end: finalEndDate,
                pdf_path: filePath,
                emails_count: sections.length
            }).select().single();

            const { data: sign } = await supabaseAdmin.storage.from("documentos").createSignedUrl(filePath, 3600);

            return NextResponse.json({ success: true, pdfUrl: sign?.signedUrl, reportId: record?.id });
        }

        return new Response(pdfBytes as any, {
            headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Informe_${communityName.replace(/\s/g, '_')}.pdf"` }
        });

    } catch (err: any) {
        console.error("[CommunityReport] Fatal:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

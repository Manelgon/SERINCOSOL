
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const payload = await req.json();
        // Priority: Env variable > Hardcoded fallback (if any)
        const webhookUrl = process.env.RESOLVED_TICKET_WEBHOOK;

        if (!webhookUrl) {
            console.error('❌ RESOLVED_TICKET_WEBHOOK is not configured in .env.local');
            return NextResponse.json({
                error: 'Webhook URL not configured',
                details: 'Please add RESOLVED_TICKET_WEBHOOK to your .env.local file'
            }, { status: 500 });
        }

        console.log(`📡 Triggering Resolved Webhook to: ${webhookUrl}`);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event: 'ticket_resolved',
                timestamp: new Date().toISOString(),
                ...payload
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Webhook failed upstream (${response.status}):`, errorText);
            return NextResponse.json({ error: 'Webhook failed upstream', status: response.status }, { status: 502 });
        }

        console.log('✅ Webhook triggered successfully');
        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error triggering resolved ticket webhook:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

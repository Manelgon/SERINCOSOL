
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const payload = await req.json();
        const webhookUrl = process.env.DEBT_WEBHOOK_URL;

        if (!webhookUrl) {
            console.warn('DEBT_WEBHOOK_URL is not configured');
            // We don't fail the request to the client if webhook is missing, just log it
            return NextResponse.json({ skipped: true, reason: 'No webhook configured' });
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                event: 'debt_created',
                timestamp: new Date().toISOString(),
                data: payload
            }),
        });

        if (!response.ok) {
            console.error('Webhook failed:', response.status, await response.text());
            return NextResponse.json({ error: 'Webhook failed upstream' }, { status: 502 });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error triggering debt webhook:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

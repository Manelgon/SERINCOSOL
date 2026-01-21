
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const payload = await req.json();
        const webhookUrl = process.env.RESOLVED_DEBT_WEBHOOK;

        if (!webhookUrl) {
            console.error('❌ RESOLVED_DEBT_WEBHOOK is not configured in .env.local');
            return NextResponse.json({
                error: 'Webhook URL not configured',
                details: 'Please add RESOLVED_DEBT_WEBHOOK to your .env.local file'
            }, { status: 500 });
        }

        console.log(`📡 Triggering Resolved Debt Webhook to: ${webhookUrl}`);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event: 'debt_resolved',
                timestamp: new Date().toISOString(),
                ...payload
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Resolved Debt Webhook failed upstream (${response.status}):`, errorText);
            return NextResponse.json({ error: 'Webhook failed upstream', status: response.status }, { status: 502 });
        }

        console.log('✅ Resolved Debt Webhook triggered successfully');
        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error triggering resolved debt webhook:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

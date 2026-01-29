import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
    const supabase = supabaseAdmin;

    const url = new URL(req.url);
    const path = url.searchParams.get("path") || "";

    console.log("Listing bucket 'FACTURAS' at path:", path);

    try {
        const { data, error } = await supabase.storage
            .from("FACTURAS")
            .list(path, {
                limit: 100,
                offset: 0,
                sortBy: { column: 'name', order: 'asc' },
            });

        if (error) {
            console.error("Supabase Storage Error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log("Bucket items found:", data?.length || 0);
        return NextResponse.json({ items: data });
    } catch (error: any) {
        console.error("Error listing bucket contents:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

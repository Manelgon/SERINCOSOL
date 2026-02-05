const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dxpufxpzplkltljhevug.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4cHVmeHB6cGxrbHRsamhldnVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODIwMjgyNiwiZXhwIjoyMDgzNzc4ODI2fQ.79CrJ_5oov9alN2q1MVO03UzX31i-MkLWUSi-r3Lu1k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log("--- Testing direct query on storage.objects ---");
    const { data, error } = await supabase
        .from('objects')
        .select('name, bucket_id')
        .eq('bucket_id', 'FACTURAS');

    if (error) {
        console.error("Error querying storage.objects:", error);
    } else {
        console.log("Total objects in FACTURAS:", data?.length);
        data?.slice(0, 10).forEach(obj => console.log(`- ${obj.name}`));
    }
}

debug();

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dxpufxpzplkltljhevug.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4cHVmeHB6cGxrbHRsamhldnVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODIwMjgyNiwiZXhwIjoyMDgzNzc4ODI2fQ.79CrJ_5oov9alN2q1MVO03UzX31i-MkLWUSi-r3Lu1k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log("--- Testing recursive list inside '000_NOCIF' ---");
    const { data: items, error } = await supabase.storage.from('FACTURAS').list('000_NOCIF', { recursive: true });

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Items found in 000_NOCIF (recursive):", items?.length);
        items?.forEach(item => console.log(`- ${item.name} (${item.metadata ? 'FILE' : 'FOLDER'})`));
    }
}

debug();

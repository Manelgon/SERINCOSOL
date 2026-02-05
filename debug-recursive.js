const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dxpufxpzplkltljhevug.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4cHVmeHB6cGxrbHRsamhldnVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODIwMjgyNiwiZXhwIjoyMDgzNzc4ODI2fQ.79CrJ_5oov9alN2q1MVO03UzX31i-MkLWUSi-r3Lu1k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log("--- Testing non-recursive list at root ---");
    const { data: rootItems } = await supabase.storage.from('FACTURAS').list('');
    console.log("Root items counts:", rootItems?.length);
    if (rootItems) {
        rootItems.slice(0, 3).forEach(item => console.log(`- ${item.name} (${item.metadata ? 'FILE' : 'FOLDER'})`));
    }

    console.log("\n--- Testing recursive list at root ---");
    const { data: allItems, error } = await supabase.storage.from('FACTURAS').list('', { recursive: true });

    if (error) {
        console.error("Error in recursive list:", error);
    } else {
        console.log("Total items found (recursive):", allItems?.length);
        if (allItems) {
            // Find counts for folders we saw at root
            if (rootItems) {
                const folders = rootItems.filter(i => !i.metadata);
                folders.forEach(folder => {
                    const prefix = folder.name + '/';
                    const count = allItems.filter(f => f.name.startsWith(prefix) && f.metadata).length;
                    console.log(`Folder "${folder.name}" has ${count} files recursively.`);
                });
            }

            console.log("\nSample recursive items:");
            allItems.slice(0, 10).forEach(item => console.log(`- ${item.name} (${item.metadata ? 'FILE' : 'FOLDER'})`));
        }
    }
}

debug();

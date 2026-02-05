const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://dxpufxpzplkltljhevug.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4cHVmeHB6cGxrbHRsamhldnVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODIwMjgyNiwiZXhwIjoyMDgzNzc4ODI2fQ.79CrJ_5oov9alN2q1MVO03UzX31i-MkLWUSi-r3Lu1k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    const results = [];
    const { data: buckets } = await supabase.storage.listBuckets();

    for (const bucket of buckets) {
        const { data: items } = await supabase.storage.from(bucket.name).list('');
        results.push({
            bucket: bucket.name,
            items: items || []
        });
    }

    fs.writeFileSync('debug-all-buckets.json', JSON.stringify(results, null, 2));
}

debug();

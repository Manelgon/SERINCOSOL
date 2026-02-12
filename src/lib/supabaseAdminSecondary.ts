import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SECONDARY_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.NEXT_PUBLIC_SECONDARY_SUPABASE_SERVICE_ROLE_KEY || 'placeholder';

// Create a service role client that bypasses RLS
export const supabaseAdminSecondary = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

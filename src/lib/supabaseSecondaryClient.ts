import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zobnskexzcermtpgqfjq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvYm5za2V4emNlcm10cGdxZmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwMTAxMDYsImV4cCI6MjA3MzU4NjEwNn0.Qr0e2hQCaSJjmYor-Zsug8PdyKdMVWGDJbIwBYsT1M8';

console.log('Initializing supabaseSecondary', { url: supabaseUrl, hasKey: !!supabaseKey });
export const supabaseSecondary = createClient(supabaseUrl, supabaseKey);

export const useSupabaseSecondary = () => {
    return { supabaseSecondary };
};

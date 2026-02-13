import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ibkskmriavpvyueudjhx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlia3NrbXJpYXZwdnl1ZXVkamh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MTY0MjYsImV4cCI6MjA4NjQ5MjQyNn0.t3yVQ3yNVbQ1RreXksC6zKAeyiqtYZPjNv24Ium7iXc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

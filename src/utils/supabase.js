
import { createClient } from '@supabase/supabase-js';

// Using provided credentials directly to ensure availability in production
// URL: https://gqatjazyjdxrfpnmggta.supabase.co
// Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxYXRqYXp5amR4cmZwbm1nZ3RhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgwODEsImV4cCI6MjA4Njk3NDA4MX0.m6jiD7UTcfvFQlNOTNUB0lI8kGitK0LYoqcO-r5W2mE

const supabaseUrl = 'https://gqatjazyjdxrfpnmggta.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxYXRqYXp5amR4cmZwbm1nZ3RhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTgwODEsImV4cCI6MjA4Njk3NDA4MX0.m6jiD7UTcfvFQlNOTNUB0lI8kGitK0LYoqcO-r5W2mE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL = https://yzhrhemoklvpglmrgald.supabase.co
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6aHJoZW1va2x2cGdsbXJnYWxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NDIxNjUsImV4cCI6MjA5NjUxODE2NX0.hqTHdT2gu60uH-JCRCWRkaOt-8IFuq2ianw06kRQRHU

export const supabase = createClient(supabaseUrl, supabaseKey)
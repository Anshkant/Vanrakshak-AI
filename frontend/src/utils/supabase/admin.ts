import { createClient } from '@supabase/supabase-js'

// IMPORTANT: This client uses the service_role key and MUST ONLY be used on the server.
// It bypasses Row Level Security (RLS).
export const createAdminClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

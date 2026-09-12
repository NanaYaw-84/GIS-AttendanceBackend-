import { createClient } from "@supabase/supabase-js"

// Server-side client used by API routes. Uses the service_role/secret key
// (bypasses RLS) — routes importing this are responsible for their own
// authorization checks. Do not import from client-side code.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SECRET_KEY || ""
)

// True anon-key client, safe for browser/client-side use if ever needed.
export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
)

// SMTP_HOST=
// SMTP_PORT=587
// SMTP_SECURE=false
// SMTP_USER=
// SMTP_PASSWORD=
// SMTP_FROM=
// SMTP_TO=
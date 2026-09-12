import { createClient } from "@supabase/supabase-js"

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set")
  }
  return url
}

function getServiceRoleKey() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY is not set")
  }
  return key
}

// Server-only Supabase client. Uses the service_role/secret key, which
// bypasses Row Level Security entirely — every route that imports this is
// responsible for its own authorization checks. Never import this from
// client-side code.
export const supabaseAdmin = createClient(getSupabaseUrl(), getServiceRoleKey(), {
  auth: { persistSession: false },
})

// Headers for routes that hand-roll PostgREST fetch() calls instead of
// using the SDK client above.
export function getSupabaseRestHeaders() {
  const key = getServiceRoleKey()
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  }
}

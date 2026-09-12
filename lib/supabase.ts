type OfficerProfile = {
  id: string
  officer_id: string
  full_name: string
  email: string
  face_image_path?: string
  face_image_url?: string
  is_active?: boolean
  department?: string | null
  position?: string | null
  phone_number?: string | null
  password_hash?: string | null
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!url || !key) {
    throw new Error(
      "Supabase configuration is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    )
  }

  return { url: url.replace(/\/$/, ""), key }
}

async function requestSupabaseRest<T>(path: string, accessToken: string, method: "GET" | "POST" = "GET", body?: Record<string, unknown>) {
  const { url, key } = getSupabaseConfig()

  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
  }

  const resolvedToken = accessToken?.trim() || key
  if (resolvedToken) {
    headers.Authorization = `Bearer ${resolvedToken}`
  }

  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!response.ok) {
    const message =
      typeof (data as any)?.message === "string"
        ? (data as any).message
        : "Supabase request failed"

    throw new Error(message)
  }

  return data as T
}

export async function createOfficerProfile(accessToken: string, profile: OfficerProfile) {
  return requestSupabaseRest<OfficerProfile[]>("officers", accessToken, "POST", profile)
}

export async function createOfficerRegistration(accessToken: string, registration: Record<string, unknown>) {
  return requestSupabaseRest<Record<string, unknown>[]>("officer_registrations", accessToken, "POST", registration)
}

export async function getOfficerProfile(accessToken: string, userId: string) {
  return requestSupabaseRest<OfficerProfile[]>(`officers?id=eq.${userId}&select=*`, accessToken, "GET")
}

export async function getOfficerProfileByOfficerId(accessToken: string, officerId: string) {
  return requestSupabaseRest<OfficerProfile[]>(`officers?officer_id=eq.${encodeURIComponent(officerId)}&select=*`, accessToken, "GET")
}

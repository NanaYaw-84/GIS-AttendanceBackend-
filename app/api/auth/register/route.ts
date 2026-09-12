import { NextResponse, NextRequest } from "next/server"
import { withApiLogging } from "@/lib/logger"
import { hashPassword } from "@/lib/crypto"
import { createOfficerProfile, createOfficerRegistration } from "@/lib/supabase"
import { getSupabaseRestHeaders } from "@/lib/supabaseAdmin"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

/** Look up an officers row by officer_id, or null. */
async function findOfficerByOfficerId(officerId: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/officers?officer_id=eq.${encodeURIComponent(officerId)}&select=id,officer_id,password_hash,is_active`,
    { method: "GET", headers: getSupabaseRestHeaders() }
  )
  if (!res.ok) return null
  const rows = (await res.json().catch(() => [])) as Array<Record<string, unknown>>
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
}

export const OPTIONS = withApiLogging(async (req: NextRequest) => {
  const res = new NextResponse(null, { status: 204 })
  res.headers.set("Access-Control-Allow-Origin", "*")
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", req.headers.get("access-control-request-headers") || "Content-Type, Authorization")
  res.headers.set("Access-Control-Max-Age", "86400")
  return res
}, "auth/register:OPTIONS")

export const POST = withApiLogging(async (req: NextRequest) => {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const { email, password, name, department, position, phone_number, officer_id } = body as {
      officer_id?: string
      email?: string
      password?: string
      name?: string
      department?: string
      position?: string
      phone_number?: string
    }

    if (!email || !password) {
      return NextResponse.json({ message: "Email and password required" }, { status: 400 })
    }

    const accessToken = ""
    const trimmedOfficerId = officer_id?.trim() || ""
    let officerId: string | null = null

    // An admin can pre-seed an officers row (POST /api/officers) with no
    // password — a "directory entry" the person then claims here. The
    // mobile RegisterScreen requires that entry to exist (its step 1 looks
    // it up). So: if the row already exists, CLAIM it (set the password)
    // rather than inserting a duplicate officer_id.
    const existing = trimmedOfficerId
      ? await findOfficerByOfficerId(trimmedOfficerId)
      : null

    if (existing && existing.password_hash) {
      return NextResponse.json(
        { message: "This officer ID is already registered. Try logging in." },
        { status: 409 }
      )
    }

    const passwordHash = await hashPassword(password)

    try {
      if (existing) {
        // Claim the existing directory entry. Keep its is_active as set by
        // the admin who created it (pre-seeded rows are active).
        const patch: Record<string, unknown> = {
          password_hash: passwordHash,
          updated_at: new Date().toISOString(),
        }
        if (name?.trim()) patch.full_name = name.trim()
        if (email.trim()) patch.email = email.trim()
        if (department?.trim()) patch.department = department.trim()
        if (position?.trim()) patch.position = position.trim()
        if (phone_number?.trim()) patch.phone_number = phone_number.trim()

        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/officers?officer_id=eq.${encodeURIComponent(trimmedOfficerId)}`,
          { method: "PATCH", headers: getSupabaseRestHeaders(), body: JSON.stringify(patch) }
        )
        if (!res.ok) {
          console.warn("Officer claim failed", await res.text())
          return NextResponse.json({ message: "Registration failed" }, { status: 500 })
        }
      } else {
        const officerPayload = {
          id: crypto.randomUUID(),
          officer_id: trimmedOfficerId,
          full_name: name?.trim() || email,
          email: email.trim(),
          face_image_path: "",
          face_image_url: "",
          // Brand-new self-registrations require admin approval before login.
          is_active: false,
          department: department?.trim() || null,
          position: position?.trim() || null,
          phone_number: phone_number?.trim() || null,
          password_hash: passwordHash,
        }
        await createOfficerProfile(accessToken, officerPayload)
      }

      await createOfficerRegistration(accessToken, {
        officer_id: trimmedOfficerId || null,
        user_id: trimmedOfficerId || null,
        full_name: name?.trim() || email,
        email: email.trim(),
        face_image_path: "",
        face_image_url: "",
        status: existing ? "claimed" : "pending",
      }).catch((e) => console.warn("officer_registrations write failed", e))

      officerId = trimmedOfficerId || null
    } catch (profileError) {
      console.warn("Officer profile creation failed", profileError)
      return NextResponse.json({ message: "Registration failed" }, { status: 500 })
    }

    return NextResponse.json({
      code: "000",
      message: "Registration successful",
      data: {
        name: name || email,
        email: email.trim(),
        department: department?.trim() || null,
        officer_id: officerId,
      },
    })
  } catch (err: any) {
    console.error("Register error:", err)
    const msg = String(err?.message || "")
    if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already exists") || msg.toLowerCase().includes("user already")) {
      return NextResponse.json({ message: "Email already registered" }, { status: 409 })
    }
    return NextResponse.json({ message: "Registration failed" }, { status: 500 })
  }
}, "auth/register:POST")


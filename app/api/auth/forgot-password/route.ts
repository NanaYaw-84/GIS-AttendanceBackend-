// File: /api/auth/forgot-password/route.ts
// Admin-initiated password reset. Requires a valid admin bearer token
// (obtained via /api/auth/login for an officer with role: "admin").
// There is no self-service reset — resetting a password now requires
// proof of admin identity, not just knowledge of an officer_id.
import { NextResponse, NextRequest } from "next/server"
import { withApiLogging } from "@/lib/logger"
import { hashPassword } from "@/lib/crypto"
import { getSupabaseRestHeaders } from "@/lib/supabaseAdmin"
import { requireAdmin } from "@/lib/adminAuth"

export const OPTIONS = withApiLogging(async (req: NextRequest) => {
  const res = new NextResponse(null, { status: 204 })
  res.headers.set("Access-Control-Allow-Origin", "*")
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", req.headers.get("access-control-request-headers") || "Content-Type, Authorization")
  res.headers.set("Access-Control-Max-Age", "86400")
  return res
}, "auth/forgot-password:OPTIONS")

// POST - Admin resets an officer's password by officer_id
export const POST = withApiLogging(async (req: NextRequest) => {
  try {
    const auth = requireAdmin(req)
    if (auth instanceof NextResponse) return auth

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const officerId = String(body.officer_id || "").trim()
    const newPassword = String(body.new_password || "")

    if (!officerId) {
      return NextResponse.json({ message: "officer_id is required" }, { status: 400 })
    }

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { message: "new_password is required and must be at least 6 characters" },
        { status: 400 }
      )
    }

    const headers = getSupabaseRestHeaders()
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    // 1. Confirm the officer actually exists before allowing a reset
    const lookupRes = await fetch(
      `${baseUrl}/rest/v1/officers?officer_id=eq.${encodeURIComponent(officerId)}&select=id,officer_id,is_active`,
      { method: "GET", headers }
    )

    if (!lookupRes.ok) {
      const errText = await lookupRes.text()
      console.error("❌ Officer lookup failed:", errText)
      return NextResponse.json(
        { message: "Failed to verify officer", debug: errText },
        { status: 500 }
      )
    }

    const officers = (await lookupRes.json()) as Array<Record<string, unknown>>

    if (!officers || officers.length === 0) {
      return NextResponse.json({ message: "Officer not found" }, { status: 404 })
    }

    if (officers[0].is_active === false) {
      return NextResponse.json(
        { message: "This account is inactive. Approve it before resetting the password." },
        { status: 403 }
      )
    }

    // 2. Hash and update the password
    const passwordHash = await hashPassword(newPassword)

    const updateRes = await fetch(
      `${baseUrl}/rest/v1/officers?officer_id=eq.${encodeURIComponent(officerId)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ password_hash: passwordHash }),
      }
    )

    if (!updateRes.ok) {
      const errText = await updateRes.text()
      console.error("❌ Password update failed:", errText)
      return NextResponse.json(
        { message: "Failed to reset password", debug: errText },
        { status: 500 }
      )
    }

    console.log(`✅ Password reset for officer ${officerId} by admin ${auth.officer_id}`)

    return NextResponse.json({
      code: "000",
      message: "Password reset successfully",
      officer_id: officerId,
    })
  } catch (error) {
    console.error("❌ Forgot password error:", error)
    return NextResponse.json(
      { message: "Failed to reset password", error: String(error) },
      { status: 500 }
    )
  }
}, "auth/forgot-password:POST")

import { NextResponse, NextRequest } from "next/server"
import { withApiLogging } from "@/lib/logger"
import { hashPassword, verifyPassword, passwordNeedsUpgrade } from "@/lib/crypto"
import { getOfficerProfileByOfficerId } from "@/lib/supabase"
import { getSupabaseRestHeaders } from "@/lib/supabaseAdmin"
import { signAdminToken } from "@/lib/adminAuth"

export const OPTIONS = withApiLogging(async (req: NextRequest) => {
  const res = new NextResponse(null, { status: 204 })
  res.headers.set("Access-Control-Allow-Origin", "*")
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", req.headers.get("access-control-request-headers") || "Content-Type, Authorization")
  res.headers.set("Access-Control-Max-Age", "86400")
  return res
}, "auth/login:OPTIONS")

export const POST = async (req: NextRequest) => {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const officerId = String(body.officer_id || "").trim()
    const password = String(body.password || "").trim()

    if (!officerId || !password) {
      return NextResponse.json({ message: "Officer ID and password required" }, { status: 400 })
    }

    let profile: any = null

    try {
      const officerProfileResult = await getOfficerProfileByOfficerId("", officerId)
      profile = officerProfileResult?.[0] || null
    } catch (profileError) {
      console.warn("Officer profile lookup failed", profileError)
    }

    if (!profile?.email) {
      return NextResponse.json({ message: "Officer not found" }, { status: 404 })
    }

    if (!profile.password_hash) {
      return NextResponse.json(
        { message: "Password reset required — contact an administrator" },
        { status: 401 }
      )
    }

    if (!(await verifyPassword(password, profile.password_hash))) {
      return NextResponse.json({ message: "Invalid officer ID or password" }, { status: 401 })
    }

    // Legacy SHA-256 accounts: transparently re-hash to bcrypt now that
    // we've confirmed the password. Best-effort — a failed upgrade must
    // never block a valid login.
    if (passwordNeedsUpgrade(profile.password_hash)) {
      try {
        const upgraded = await hashPassword(password)
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/officers?officer_id=eq.${encodeURIComponent(
            profile.officer_id || officerId
          )}`,
          {
            method: "PATCH",
            headers: getSupabaseRestHeaders(),
            body: JSON.stringify({ password_hash: upgraded }),
          }
        )
        if (!res.ok) {
          console.warn("Password hash upgrade failed:", officerId, await res.text())
        } else {
          console.log("✅ Upgraded password hash to bcrypt for", officerId)
        }
      } catch (e) {
        console.warn("Password hash upgrade threw:", officerId, e)
      }
    }

    if (profile.is_active === false) {
      return NextResponse.json({ message: "Account pending approval" }, { status: 403 })
    }

    const respUser: Record<string, unknown> = {
      name: profile?.full_name || profile?.email,
      username: profile?.officer_id || officerId,
      email: profile?.email || officerId,
      department: profile?.department || null,
      officer_id: profile?.officer_id || officerId,
      directory: profile,
    }

    if (profile.role === "admin") {
      respUser.admin_token = signAdminToken(profile.officer_id || officerId, "admin")
    }

    return NextResponse.json({ code: "000", message: "Login successful", data: respUser })
  } catch (err: any) {
    console.error("Login error:", err)
    const msg = String(err?.message || "")
    if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("credentials") || msg.toLowerCase().includes("email")) {
      return NextResponse.json({ message: "Invalid officer ID or password" }, { status: 401 })
    }
    return NextResponse.json({ message: "Authentication error" }, { status: 500 })
  }
}
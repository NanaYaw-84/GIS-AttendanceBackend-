import crypto from "node:crypto"
import { NextResponse } from "next/server"

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours

export type AdminClaims = {
  officer_id: string
  role: string
  exp: number
}

function getSecret() {
  const secret = process.env.ADMIN_TOKEN_SECRET
  if (!secret) {
    throw new Error("ADMIN_TOKEN_SECRET is not set")
  }
  return secret
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url")
}

export function signAdminToken(officer_id: string, role: string) {
  const claims: AdminClaims = { officer_id, role, exp: Date.now() + TOKEN_TTL_MS }
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url")
  return `${payload}.${sign(payload)}`
}

function verifyAdminToken(token: string): AdminClaims | null {
  const [payload, signature] = token.split(".")
  if (!payload || !signature) return null

  const expected = sign(payload)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminClaims
    if (typeof claims.exp !== "number" || Date.now() > claims.exp) return null
    return claims
  } catch {
    return null
  }
}

// Verifies the Authorization: Bearer <token> header belongs to an admin.
// Returns the claims on success, or a NextResponse to return directly on
// failure — callers should do: `const auth = requireAdmin(req); if (auth
// instanceof NextResponse) return auth`.
export function requireAdmin(req: Request): AdminClaims | NextResponse {
  const header = req.headers.get("authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : ""

  if (!token) {
    return NextResponse.json({ message: "Admin authorization required" }, { status: 401 })
  }

  const claims = verifyAdminToken(token)
  if (!claims) {
    return NextResponse.json({ message: "Invalid or expired admin token" }, { status: 401 })
  }

  if (claims.role !== "admin") {
    return NextResponse.json({ message: "Admin role required" }, { status: 403 })
  }

  return claims
}

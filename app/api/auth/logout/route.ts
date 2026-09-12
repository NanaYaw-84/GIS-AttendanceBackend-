import { NextResponse } from "next/server"
import { withApiLogging } from "@/lib/logger"

export const POST = withApiLogging(async () => {
  try {
    const res = NextResponse.json({ success: true })
    const common = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 0,
    }
    res.cookies.set("user", "", common)
    res.cookies.set("user_email", "", common)
    return res
  } catch (error) {
    console.error("Logout API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}, "auth/logout:POST")



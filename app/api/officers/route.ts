import { NextResponse, NextRequest } from "next/server"
import { withApiLogging } from "@/lib/logger"
import { hashPassword } from "@/lib/crypto"
import { getSupabaseRestHeaders as getSupabaseHeaders } from "@/lib/supabaseAdmin"
import { requireAdmin } from "@/lib/adminAuth"
import { OFFICER_PUBLIC_COLUMNS } from "@/lib/officers"

export const OPTIONS = withApiLogging(async (req: NextRequest) => {
  const res = new NextResponse(null, { status: 204 })
  res.headers.set("Access-Control-Allow-Origin", "*")
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", req.headers.get("access-control-request-headers") || "Content-Type, Authorization")
  return res
}, "officers:OPTIONS")

// GET all officers OR get by ID if query param provided
export const GET = withApiLogging(async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url)
    const officerId = searchParams.get("officer_id")

    let query = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/officers?select=${OFFICER_PUBLIC_COLUMNS}`

    if (officerId) {
      query += `&officer_id=eq.${encodeURIComponent(officerId)}`
    }

    const response = await fetch(query, {
      method: "GET",
      headers: getSupabaseHeaders(),
    })

    const data = await response.json().catch(() => [])

    if (!response.ok) {
      return NextResponse.json({ message: "Failed to fetch officers" }, { status: 500 })
    }

    return NextResponse.json({ code: "000", data })
  } catch (error) {
    console.error("Fetch officers error:", error)
    return NextResponse.json({ message: "Failed to fetch officers" }, { status: 500 })
  }
}, "officers:GET")

// POST - Create a new officer
export const POST = withApiLogging(async (req: NextRequest) => {
  try {
    const auth = requireAdmin(req)
    if (auth instanceof NextResponse) return auth

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const officerId = String(body.officer_id || "").trim()
    const fullName = String(body.full_name || "").trim()
    const email = String(body.email || "").trim()

    if (!officerId || !fullName || !email) {
      return NextResponse.json({ message: "officer_id, full_name, email are required" }, { status: 400 })
    }

    const payload: Record<string, unknown> = {
      id: body.id ? String(body.id) : crypto.randomUUID(),
      officer_id: officerId,
      full_name: fullName,
      email,
      face_image_path: "",
      face_image_url: "",
      is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
      department: body.department ? String(body.department) : null,
      position: body.position ? String(body.position) : null,
      phone_number: body.phone_number ? String(body.phone_number) : null,
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/officers`, {
      method: "POST",
      headers: getSupabaseHeaders(),
      body: JSON.stringify(payload),
    })

    const responseText = await response.text()

    if (!response.ok) {
      console.error("Insert officer failed", responseText)
      return NextResponse.json({ message: "Failed to insert officer" }, { status: 500 })
    }

    return NextResponse.json({ code: "000", message: "Officer inserted successfully", data: payload })
  } catch (error) {
    console.error("Insert officers error:", error)
    return NextResponse.json({ message: "Failed to insert officer" }, { status: 500 })
  }
}, "officers:POST")

// PATCH - Partial update (update specific fields)
export const PATCH = withApiLogging(async (req: NextRequest) => {
  try {
    const auth = requireAdmin(req)
    if (auth instanceof NextResponse) return auth

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const officerId = String(body.officer_id || "").trim()

    if (!officerId) {
      return NextResponse.json({ message: "officer_id is required" }, { status: 400 })
    }

    const payload: Record<string, unknown> = {}

    if (body.full_name) payload.full_name = String(body.full_name)
    if (body.email) payload.email = String(body.email)
    if (body.department !== undefined) payload.department = body.department ? String(body.department) : null
    if (body.position !== undefined) payload.position = body.position ? String(body.position) : null
    if (body.phone_number !== undefined) payload.phone_number = body.phone_number ? String(body.phone_number) : null
    if (body.is_active !== undefined) payload.is_active = Boolean(body.is_active)
    if (body.face_image_path !== undefined) payload.face_image_path = String(body.face_image_path)
    if (body.face_image_url !== undefined) payload.face_image_url = String(body.face_image_url)
    if (body.password) payload.password_hash = await hashPassword(String(body.password))

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ message: "No valid update fields provided" }, { status: 400 })
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/officers?officer_id=eq.${encodeURIComponent(officerId)}`, {
      method: "PATCH",
      headers: getSupabaseHeaders(),
      body: JSON.stringify(payload),
    })

    const responseText = await response.text()

    if (!response.ok) {
      console.error("Update officer failed", responseText)
      return NextResponse.json({ message: "Failed to update officer" }, { status: 500 })
    }

    return NextResponse.json({ code: "000", message: "Officer updated successfully", data: { officer_id: officerId, ...payload } })
  } catch (error) {
    console.error("Update officers error:", error)
    return NextResponse.json({ message: "Failed to update officer" }, { status: 500 })
  }
}, "officers:PATCH")

// PUT - Full replace of an officer record
export const PUT = withApiLogging(async (req: NextRequest) => {
  try {
    const auth = requireAdmin(req)
    if (auth instanceof NextResponse) return auth

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const officerId = String(body.officer_id || "").trim()
    const fullName = String(body.full_name || "").trim()
    const email = String(body.email || "").trim()

    if (!officerId || !fullName || !email) {
      return NextResponse.json({ message: "officer_id, full_name, email are required for full replace" }, { status: 400 })
    }

    // Full replacement payload - all fields required
    const payload: Record<string, unknown> = {
      officer_id: officerId,
      full_name: fullName,
      email,
      face_image_path: body.face_image_path ? String(body.face_image_path) : "",
      face_image_url: body.face_image_url ? String(body.face_image_url) : "",
      is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
      department: body.department ? String(body.department) : null,
      position: body.position ? String(body.position) : null,
      phone_number: body.phone_number ? String(body.phone_number) : null,
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/officers?officer_id=eq.${encodeURIComponent(officerId)}`, {
      method: "PUT",
      headers: getSupabaseHeaders(),
      body: JSON.stringify(payload),
    })

    const responseText = await response.text()

    if (!response.ok) {
      console.error("Replace officer failed", responseText)
      return NextResponse.json({ message: "Failed to replace officer" }, { status: 500 })
    }

    return NextResponse.json({ code: "000", message: "Officer replaced successfully", data: payload })
  } catch (error) {
    console.error("Replace officer error:", error)
    return NextResponse.json({ message: "Failed to replace officer" }, { status: 500 })
  }
}, "officers:PUT")

// DELETE - Remove an officer
export const DELETE = withApiLogging(async (req: NextRequest) => {
  try {
    const auth = requireAdmin(req)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(req.url)
    const officerId = searchParams.get("officer_id")

    if (!officerId) {
      return NextResponse.json({ message: "officer_id query parameter is required" }, { status: 400 })
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/officers?officer_id=eq.${encodeURIComponent(officerId)}`, {
      method: "DELETE",
      headers: getSupabaseHeaders(),
    })

    if (!response.ok) {
      console.error("Delete officer failed")
      return NextResponse.json({ message: "Failed to delete officer" }, { status: 500 })
    }

    return NextResponse.json({ code: "000", message: "Officer deleted successfully", officer_id: officerId })
  } catch (error) {
    console.error("Delete officer error:", error)
    return NextResponse.json({ message: "Failed to delete officer" }, { status: 500 })
  }
}, "officers:DELETE")
import { NextResponse, NextRequest } from "next/server"
import { withApiLogging } from "@/lib/logger"
import { hashPassword } from "@/lib/crypto"
import { getSupabaseRestHeaders as getSupabaseHeaders } from "@/lib/supabaseAdmin"
import { requireAdmin } from "@/lib/adminAuth"
import { OFFICER_PUBLIC_COLUMNS } from "@/lib/officers"

export const OPTIONS = withApiLogging(async (req: NextRequest) => {
  const res = new NextResponse(null, { status: 204 })
  res.headers.set("Access-Control-Allow-Origin", "*")
  res.headers.set("Access-Control-Allow-Methods", "GET, PATCH, PUT, DELETE, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", req.headers.get("access-control-request-headers") || "Content-Type, Authorization")
  return res
}, "officers:OPTIONS")

// GET a single officer by ID
export const GET = withApiLogging(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  try {
    // Handle both old and new Next.js versions (params might be a Promise)
    const resolvedParams = await Promise.resolve(params)
    const { id } = resolvedParams

    console.log("🔍 DEBUG - Received params:", { id, type: typeof id, length: id?.length })

    // Better validation
    if (!id || String(id).trim() === "") {
      console.error("❌ Invalid ID:", id)
      return NextResponse.json({ message: "Officer ID is required", debug: { id, type: typeof id } }, { status: 400 })
    }

    const idString = String(id).trim()
    const query = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/officers?id=eq.${encodeURIComponent(idString)}&select=${OFFICER_PUBLIC_COLUMNS}`

    console.log("📍 Fetching from:", query)

    const response = await fetch(query, {
      method: "GET",
      headers: getSupabaseHeaders(),
    })

    const data = await response.json().catch(() => [])

    console.log("📦 Supabase response:", { status: response.status, dataLength: Array.isArray(data) ? data.length : 'not array' })

    if (!response.ok) {
      console.error("❌ Supabase error:", response.status)
      return NextResponse.json({ message: "Failed to fetch officer", debug: { status: response.status } }, { status: 500 })
    }

    if (!data || data.length === 0) {
      console.warn("⚠️ Officer not found for ID:", idString)
      return NextResponse.json({ message: "Officer not found", debug: { searchedId: idString } }, { status: 404 })
    }

    console.log("✅ Officer found:", data[0].id)
    return NextResponse.json({ code: "000", data: data[0] })
  } catch (error) {
    console.error("❌ Fetch officer error:", error)
    return NextResponse.json({ message: "Failed to fetch officer", error: String(error) }, { status: 500 })
  }
}, "officers:GET_BY_ID")

// PATCH - Partial update of a specific officer
export const PATCH = withApiLogging(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  try {
    const auth = requireAdmin(req)
    if (auth instanceof NextResponse) return auth

    const resolvedParams = await Promise.resolve(params)
    const { id } = resolvedParams
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    console.log("🔍 DEBUG - PATCH params:", { id, bodyKeys: Object.keys(body) })

    if (!id || String(id).trim() === "") {
      return NextResponse.json({ message: "Officer ID is required" }, { status: 400 })
    }

    const idString = String(id).trim()
    const payload: Record<string, unknown> = {}

    if (body.officer_id) payload.officer_id = String(body.officer_id)
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

    console.log("📝 Updating with payload:", Object.keys(payload))

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/officers?id=eq.${encodeURIComponent(idString)}`, {
      method: "PATCH",
      headers: getSupabaseHeaders(),
      body: JSON.stringify(payload),
    })

    const responseText = await response.text()

    if (!response.ok) {
      console.error("❌ Update officer failed", responseText)
      return NextResponse.json({ message: "Failed to update officer", error: responseText }, { status: 500 })
    }

    console.log("✅ Officer updated successfully")
    return NextResponse.json({ code: "000", message: "Officer updated successfully", data: { id: idString, ...payload } })
  } catch (error) {
    console.error("❌ Update officer error:", error)
    return NextResponse.json({ message: "Failed to update officer", error: String(error) }, { status: 500 })
  }
}, "officers:PATCH_BY_ID")

// PUT - Full replace of a specific officer
export const PUT = withApiLogging(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  try {
    const auth = requireAdmin(req)
    if (auth instanceof NextResponse) return auth

    const resolvedParams = await Promise.resolve(params)
    const { id } = resolvedParams
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    console.log("🔍 DEBUG - PUT params:", { id })

    if (!id || String(id).trim() === "") {
      return NextResponse.json({ message: "Officer ID is required" }, { status: 400 })
    }

    const idString = String(id).trim()
    const officerId = String(body.officer_id || "").trim()
    const fullName = String(body.full_name || "").trim()
    const email = String(body.email || "").trim()

    if (!officerId || !fullName || !email) {
      return NextResponse.json({ message: "officer_id, full_name, email are required for full replace" }, { status: 400 })
    }

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

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/officers?id=eq.${encodeURIComponent(idString)}`, {
      method: "PUT",
      headers: getSupabaseHeaders(),
      body: JSON.stringify(payload),
    })

    const responseText = await response.text()

    if (!response.ok) {
      console.error("❌ Replace officer failed", responseText)
      return NextResponse.json({ message: "Failed to replace officer", error: responseText }, { status: 500 })
    }

    console.log("✅ Officer replaced successfully")
    return NextResponse.json({ code: "000", message: "Officer replaced successfully", data: { id: idString, ...payload } })
  } catch (error) {
    console.error("❌ Replace officer error:", error)
    return NextResponse.json({ message: "Failed to replace officer", error: String(error) }, { status: 500 })
  }
}, "officers:PUT_BY_ID")

// DELETE - Remove a specific officer
export const DELETE = withApiLogging(async (req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) => {
  try {
    const auth = requireAdmin(req)
    if (auth instanceof NextResponse) return auth

    const resolvedParams = await Promise.resolve(params)
    const { id } = resolvedParams

    console.log("🔍 DEBUG - DELETE params:", { id })

    if (!id || String(id).trim() === "") {
      return NextResponse.json({ message: "Officer ID is required" }, { status: 400 })
    }

    const idString = String(id).trim()

    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/officers?id=eq.${encodeURIComponent(idString)}`, {
      method: "DELETE",
      headers: getSupabaseHeaders(),
    })

    if (!response.ok) {
      console.error("❌ Delete officer failed")
      return NextResponse.json({ message: "Failed to delete officer" }, { status: 500 })
    }

    console.log("✅ Officer deleted successfully")
    return NextResponse.json({ code: "000", message: "Officer deleted successfully", id: idString })
  } catch (error) {
    console.error("❌ Delete officer error:", error)
    return NextResponse.json({ message: "Failed to delete officer", error: String(error) }, { status: 500 })
  }
}, "officers:DELETE_BY_ID")
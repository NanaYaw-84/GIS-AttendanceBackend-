// /api/attendance/history/[id]  — per-officer attendance, on attendance_summary
import { NextResponse, NextRequest } from "next/server"
import { withApiLogging } from "@/lib/logger"
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin"

export const OPTIONS = withApiLogging(async (req: NextRequest) => {
  const res = new NextResponse(null, { status: 204 })
  res.headers.set("Access-Control-Allow-Origin", "*")
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", req.headers.get("access-control-request-headers") || "Content-Type, Authorization")
  return res
}, "attendance/history:OPTIONS")

// GET — one officer's full attendance history, newest day first.
export const GET = withApiLogging(async (req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
  try {
    let id = ""
    if (context?.params) {
      try {
        const resolved = await context.params
        id = resolved?.id ?? ""
      } catch {
        id = ""
      }
    }
    if (!id) id = req.nextUrl.searchParams.get("id") ?? ""
    id = id.trim()

    if (!id) {
      return NextResponse.json({ message: "Invalid or missing officer_id parameter" }, { status: 400 })
    }

    // The caller may pass the business officer_id ("P/012/2025") or the
    // internal uuid. Older summary rows were keyed by the uuid, so match
    // on whichever identifiers this officer has.
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    const { data: officer } = await supabase
      .from("officers")
      .select("id, officer_id")
      .or(isUuid ? `officer_id.eq.${id},id.eq.${id}` : `officer_id.eq.${id}`)
      .maybeSingle()

    const keys = Array.from(
      new Set([id, officer?.officer_id, officer?.id].filter(Boolean) as string[])
    )

    const { data, error } = await supabase
      .from("attendance_summary")
      .select("*")
      .in("officer_id", keys)
      .order("date", { ascending: false })

    if (error) {
      console.error("❌ Supabase error:", error)
      return NextResponse.json(
        { message: "Failed to fetch attendance history", debug: error.message },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ message: "No attendance history recorded" }, { status: 404 })
    }

    return NextResponse.json({ code: "000", data })
  } catch (error) {
    console.error("❌ Fetch attendance history error:", error)
    return NextResponse.json(
      { message: "Failed to fetch attendance history", error: String(error) },
      { status: 500 }
    )
  }
}, "attendance/history:GET")

// POST — admin: create a summary row (officer_id, date, optional times).
export const POST = withApiLogging(async (req: NextRequest) => {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const officer_id = String(body.officer_id || "").trim()
    const date = body.date ? String(body.date) : new Date().toISOString().split("T")[0]

    if (!officer_id) {
      return NextResponse.json({ message: "officer_id is required" }, { status: 400 })
    }

    const checkIn = body.check_in_time ? String(body.check_in_time) : new Date().toISOString()

    const { data, error } = await supabase
      .from("attendance_summary")
      .insert([{
        officer_id,
        date,
        check_in_time: checkIn,
        check_out_time: body.check_out_time ? String(body.check_out_time) : null,
        status: body.status ? String(body.status) : "in_progress",
      }])
      .select()

    if (error) {
      console.error("❌ Insert failed:", error)
      return NextResponse.json(
        { message: "Failed to create attendance record", debug: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ code: "000", message: "Record created", data: data[0] })
  } catch (error) {
    console.error("❌ Create record error:", error)
    return NextResponse.json({ message: "Failed to create record", error: String(error) }, { status: 500 })
  }
}, "attendance:POST_RECORD")

// PATCH — admin: correct a row. `attendance_id` (summary row id) required.
// Sets check_out_time (+ recomputed duration, status) when asked, or any
// of check_in_time / status / duration_minutes explicitly.
export const PATCH = withApiLogging(async (req: NextRequest) => {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const rowId = String(body.attendance_id || body.id || "").trim()

    if (!rowId) {
      return NextResponse.json({ message: "attendance_id is required" }, { status: 400 })
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.check_in_time !== undefined) patch.check_in_time = body.check_in_time
    if (body.status !== undefined) patch.status = body.status
    if (body.duration_minutes !== undefined) patch.duration_minutes = body.duration_minutes

    // The common case: close an open row now.
    const closeNow = body.check_out_time === undefined ? true : Boolean(body.check_out_time)
    if (body.check_out_time !== undefined || closeNow) {
      const checkOut = body.check_out_time ? String(body.check_out_time) : new Date().toISOString()
      patch.check_out_time = checkOut
      patch.status = patch.status ?? "completed"

      // recompute duration from the stored check_in_time
      const { data: existing } = await supabase
        .from("attendance_summary")
        .select("check_in_time")
        .eq("id", rowId)
        .maybeSingle()
      if (existing?.check_in_time && patch.duration_minutes === undefined) {
        patch.duration_minutes = Math.max(
          0,
          Math.round((new Date(checkOut).getTime() - new Date(existing.check_in_time).getTime()) / 60000)
        )
      }
    }

    const { data, error } = await supabase
      .from("attendance_summary")
      .update(patch)
      .eq("id", rowId)
      .select()

    if (error) {
      console.error("❌ Update failed:", error)
      return NextResponse.json(
        { message: "Failed to update attendance", debug: error.message },
        { status: 500 }
      )
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ message: "Attendance record not found" }, { status: 404 })
    }

    return NextResponse.json({ code: "000", message: "Attendance updated", data: data[0] })
  } catch (error) {
    console.error("❌ Update record error:", error)
    return NextResponse.json({ message: "Failed to update attendance", error: String(error) }, { status: 500 })
  }
}, "attendance:PATCH_RECORD")

// DELETE — admin: remove a summary row. ?id=<summary row id>
export const DELETE = withApiLogging(async (req: NextRequest) => {
  try {
    const rowId = new URL(req.url).searchParams.get("id")
    if (!rowId) {
      return NextResponse.json({ message: "id query parameter is required" }, { status: 400 })
    }

    const { error } = await supabase.from("attendance_summary").delete().eq("id", rowId)

    if (error) {
      console.error("❌ Delete failed:", error)
      return NextResponse.json(
        { message: "Failed to delete attendance record", debug: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ code: "000", message: "Attendance record deleted", id: rowId })
  } catch (error) {
    console.error("❌ Delete error:", error)
    return NextResponse.json({ message: "Failed to delete attendance record", error: String(error) }, { status: 500 })
  }
}, "attendance:DELETE_RECORD")

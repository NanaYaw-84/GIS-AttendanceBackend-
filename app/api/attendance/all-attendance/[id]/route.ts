// File: /api/attendance/history/[id]/route.ts
import { NextResponse, NextRequest } from "next/server"
import { withApiLogging } from "@/lib/logger"
import { supabase } from "@/lib/supabase-client"

export const OPTIONS = withApiLogging(async (req: NextRequest) => {
  const res = new NextResponse(null, { status: 204 })
  res.headers.set("Access-Control-Allow-Origin", "*")
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", req.headers.get("access-control-request-headers") || "Content-Type, Authorization")
  return res
}, "attendance/history:OPTIONS")

// GET attendance history by officer ID
export const GET = withApiLogging(async (req: NextRequest, context: { params: Promise<{ id: String }> }) => {
  try {
  const { id } = await context.params

    if (!id || id.trim() === "") {
      return NextResponse.json(
        { message: "Invalid or missing officer_id parameter" },
        { status: 400 }
      )
    }

    console.log("📍 Fetching attendance for officer:", id)

    const { data, error } = await supabase
      .from("attendance_summary")
      .select("*")
      .eq("officer_id", id)
      .order("date", { ascending: false })

    if (error) {
      console.error("❌ Supabase error:", error)
      return NextResponse.json(
        { message: "Failed to fetch attendance history", debug: error.message },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { message: "No attendance history recorded" },
        { status: 404 }
      )
    }

    console.log("✅ Attendance records found:", data.length)
    return NextResponse.json({ code: "000", data })
  } catch (error) {
    console.error("❌ Fetch attendance history error:", error)
    return NextResponse.json(
      { message: "Failed to fetch attendance history", error: String(error) },
      { status: 500 }
    )
  }
}, "attendance/history:GET")

// POST - Clock in
export const POST = withApiLogging(async (req: NextRequest) => {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const officer_id = String(body.officer_id || "").trim()
    const date = body.date ? String(body.date) : new Date().toISOString().split("T")[0]

    if (!officer_id) {
      return NextResponse.json(
        { message: "officer_id is required" },
        { status: 400 }
      )
    }

    const payload = {
      officer_id,
      date,
      attendance_type: body.attendance_type ? String(body.attendance_type) : "clock_in",
      clock_in: new Date().toISOString(),
      location: body.location ? String(body.location) : null,
      notes: body.notes ? String(body.notes) : null,
    }

    console.log("📝 Creating attendance record:", payload)

    const { data, error } = await supabase
      .from("attendance")
      .insert([payload])
      .select()

    if (error) {
      console.error("❌ Insert failed:", error)
      return NextResponse.json(
        { message: "Failed to create attendance record", debug: error.message },
        { status: 500 }
      )
    }

    console.log("✅ Attendance record created:", data[0]?.id)
    return NextResponse.json({
      code: "000",
      message: "Clocked in successfully",
      data: data[0],
    })
  } catch (error) {
    console.error("❌ Clock in error:", error)
    return NextResponse.json(
      { message: "Failed to clock in", error: String(error) },
      { status: 500 }
    )
  }
}, "attendance:POST_CLOCK_IN")

// PATCH - Clock out
export const PATCH = withApiLogging(async (req: NextRequest) => {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const attendance_id = String(body.attendance_id || "").trim()

    if (!attendance_id) {
      return NextResponse.json(
        { message: "attendance_id is required" },
        { status: 400 }
      )
    }

    const payload = {
      clock_out: new Date().toISOString(),
      notes: body.notes ? String(body.notes) : null,
    }

    console.log("📝 Updating attendance record:", attendance_id)

    const { data, error } = await supabase
      .from("attendance")
      .update(payload)
      .eq("id", attendance_id)
      .select()

    if (error) {
      console.error("❌ Update failed:", error)
      return NextResponse.json(
        { message: "Failed to update attendance", debug: error.message },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { message: "Attendance record not found" },
        { status: 404 }
      )
    }

    console.log("✅ Attendance record updated:", data[0]?.id)
    return NextResponse.json({
      code: "000",
      message: "Clocked out successfully",
      data: data[0],
    })
  } catch (error) {
    console.error("❌ Clock out error:", error)
    return NextResponse.json(
      { message: "Failed to clock out", error: String(error) },
      { status: 500 }
    )
  }
}, "attendance:PATCH_CLOCK_OUT")

// DELETE - Remove attendance record
export const DELETE = withApiLogging(async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url)
    const attendance_id = searchParams.get("id")

    if (!attendance_id) {
      return NextResponse.json(
        { message: "id query parameter is required" },
        { status: 400 }
      )
    }

    console.log("🗑️ Deleting attendance record:", attendance_id)

    const { error } = await supabase
      .from("attendance")
      .delete()
      .eq("id", attendance_id)

    if (error) {
      console.error("❌ Delete failed:", error)
      return NextResponse.json(
        { message: "Failed to delete attendance record", debug: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      code: "000",
      message: "Attendance record deleted successfully",
      attendance_id,
    })
  } catch (error) {
    console.error("❌ Delete error:", error)
    return NextResponse.json(
      { message: "Failed to delete attendance record", error: String(error) },
      { status: 500 }
    )
  }
}, "attendance:DELETE")
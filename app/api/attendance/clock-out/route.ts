import { NextRequest, NextResponse } from "next/server"
import { withApiLogging } from "@/lib/logger"
import { getSupabaseRestHeaders as getSupabaseHeaders } from "@/lib/supabaseAdmin"

// POST /api/attendance/clock-out   { id: officer_id, comment?: string }
//
// Sets check_out_time on today's `attendance_summary` row for the
// officer, plus duration_minutes and status='completed'. Rejects when:
//  - no row / no check_in_time today -> 400 "clock in first"
//  - check_out_time already set      -> 400 "already clocked out"
export const POST = withApiLogging(async (req: NextRequest) => {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const id = String(body.id || "").trim()
    const comment = body.comment ? String(body.comment) : null

    if (!id) {
      return NextResponse.json({ message: "Officer ID is required" }, { status: 400 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const headers = getSupabaseHeaders()
    const now = new Date().toISOString()
    const today = now.split("T")[0]

    const res = await fetch(
      `${baseUrl}/rest/v1/attendance_summary?officer_id=eq.${encodeURIComponent(id)}&date=eq.${today}&select=*&limit=1`,
      { method: "GET", headers }
    )

    if (!res.ok) {
      const debug = await res.text()
      console.error("❌ clock-out: summary lookup failed:", debug)
      return NextResponse.json(
        { message: "Failed to look up attendance", debug },
        { status: 500 }
      )
    }

    const rows = (await res.json()) as Array<Record<string, unknown>>
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null

    if (!row || !row.check_in_time) {
      return NextResponse.json(
        { message: "No clock-in found for today. Please clock in first." },
        { status: 400 }
      )
    }

    if (row.check_out_time) {
      return NextResponse.json(
        { message: "You have already clocked out today.", data: row },
        { status: 400 }
      )
    }

    const checkIn = new Date(String(row.check_in_time)).getTime()
    const durationMinutes = Math.max(
      0,
      Math.round((new Date(now).getTime() - checkIn) / 60000)
    )

    const existingNote = row.notes ? String(row.notes) : ""
    const notes = [existingNote, comment].filter(Boolean).join(" | ") || null

    const updateRes = await fetch(
      `${baseUrl}/rest/v1/attendance_summary?id=eq.${row.id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          check_out_time: now,
          duration_minutes: durationMinutes,
          status: "completed",
          notes,
          updated_at: now,
        }),
      }
    )

    if (!updateRes.ok) {
      const debug = await updateRes.text()
      console.error("❌ clock-out: summary patch failed:", debug)
      return NextResponse.json({ message: "Failed to record clock out", debug }, { status: 500 })
    }

    const updated = (await updateRes.json().catch(() => [])) as Array<Record<string, unknown>>

    return NextResponse.json({
      code: "000",
      message: "Clock out successful",
      data:
        Array.isArray(updated) && updated.length > 0
          ? updated[0]
          : { ...row, check_out_time: now, duration_minutes: durationMinutes, status: "completed" },
    })
  } catch (error) {
    console.error("❌ Clock out error:", error)
    return NextResponse.json(
      { message: "Failed to clock out", error: String(error) },
      { status: 500 }
    )
  }
}, "attendance/clock-out:POST")

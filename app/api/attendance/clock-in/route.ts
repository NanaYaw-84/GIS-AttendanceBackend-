import { NextRequest, NextResponse } from "next/server"
import { withApiLogging } from "@/lib/logger"
import { getSupabaseRestHeaders as getSupabaseHeaders } from "@/lib/supabaseAdmin"

// POST /api/attendance/clock-in   { id: officer_id, comment?: string }
//
// Attendance lives in `attendance_summary` — one row per officer per day
// (unique officer_id + date). Clock-in creates that row with
// check_in_time set. Rejects a second clock-in for the same day:
//  - open row (no check_out_time) -> 409 "already clocked in"
//  - completed row (check_out_time set) -> 409 "already done for today"
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

    const existingRes = await fetch(
      `${baseUrl}/rest/v1/attendance_summary?officer_id=eq.${encodeURIComponent(id)}&date=eq.${today}&select=*&limit=1`,
      { method: "GET", headers }
    )

    if (!existingRes.ok) {
      const debug = await existingRes.text()
      console.error("❌ clock-in: summary lookup failed:", debug)
      return NextResponse.json(
        { message: "Failed to check attendance state", debug },
        { status: 500 }
      )
    }

    const rows = (await existingRes.json()) as Array<Record<string, unknown>>
    const existing = Array.isArray(rows) && rows.length > 0 ? rows[0] : null

    if (existing && existing.check_in_time) {
      return NextResponse.json(
        {
          message: existing.check_out_time
            ? "You have already completed your attendance for today."
            : "You are already clocked in. Clock out before clocking in again.",
          data: existing,
        },
        { status: 409 }
      )
    }

    let record: Record<string, unknown>

    if (existing) {
      // Row exists but was never clocked in (e.g. created by a clock-out
      // fallback) — fill it in.
      const patchRes = await fetch(
        `${baseUrl}/rest/v1/attendance_summary?id=eq.${existing.id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            check_in_time: now,
            status: "in_progress",
            notes: comment,
            updated_at: now,
          }),
        }
      )
      if (!patchRes.ok) {
        const debug = await patchRes.text()
        console.error("❌ clock-in: summary patch failed:", debug)
        return NextResponse.json({ message: "Failed to record clock in", debug }, { status: 500 })
      }
      const patched = (await patchRes.json().catch(() => [])) as Array<Record<string, unknown>>
      record = patched[0] ?? { ...existing, check_in_time: now }
    } else {
      const insertRes = await fetch(`${baseUrl}/rest/v1/attendance_summary`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: crypto.randomUUID(),
          officer_id: id,
          date: today,
          check_in_time: now,
          status: "in_progress",
          notes: comment,
        }),
      })
      if (!insertRes.ok) {
        const debug = await insertRes.text()
        console.error("❌ clock-in: summary insert failed:", debug)
        return NextResponse.json({ message: "Failed to record clock in", debug }, { status: 500 })
      }
      const inserted = (await insertRes.json().catch(() => [])) as Array<Record<string, unknown>>
      record = inserted[0] ?? { officer_id: id, date: today, check_in_time: now, status: "in_progress" }
    }

    return NextResponse.json({ code: "000", message: "Clock in successful", data: record })
  } catch (error) {
    console.error("❌ Clock in error:", error)
    return NextResponse.json(
      { message: "Failed to clock in", error: String(error) },
      { status: 500 }
    )
  }
}, "attendance/clock-in:POST")

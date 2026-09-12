import { NextResponse, NextRequest } from "next/server"
import { withApiLogging } from "@/lib/logger"
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin"
import { requireAdmin } from "@/lib/adminAuth"
import { resolveOfficers } from "@/lib/officers"

// GET /api/attendance/summary  — 🔒 admin
// Every officer's attendance history from attendance_summary, newest day
// first, with officer name/department merged in. Filters:
//   ?officer_id=P/014/2025   one officer
//   ?date=2026-09-07         one day
//   ?from=2026-09-01&to=2026-09-07  inclusive range
//   ?limit= (default 100, max 500)  &offset=
export const GET = withApiLogging(async (req: NextRequest) => {
  try {
    const auth = requireAdmin(req)
    if (auth instanceof NextResponse) return auth

    const sp = req.nextUrl.searchParams
    const officerId = sp.get("officer_id")?.trim()
    const date = sp.get("date")?.trim()
    const from = sp.get("from")?.trim()
    const to = sp.get("to")?.trim()
    const limit = Math.min(Math.max(parseInt(sp.get("limit") || "100", 10) || 100, 1), 500)
    const offset = Math.max(parseInt(sp.get("offset") || "0", 10) || 0, 0)

    let query = supabase
      .from("attendance_summary")
      .select("*", { count: "exact" })
      .order("date", { ascending: false })
      .order("check_in_time", { ascending: false })
      .range(offset, offset + limit - 1)

    if (officerId) query = query.eq("officer_id", officerId)
    if (date) query = query.eq("date", date)
    if (from) query = query.gte("date", from)
    if (to) query = query.lte("date", to)

    const { data: rows, error, count } = await query

    if (error) {
      console.error("❌ summary query failed:", error)
      return NextResponse.json(
        { message: "Failed to fetch attendance summary", debug: error.message },
        { status: 500 }
      )
    }

    const list = rows ?? []
    const byOfficer = await resolveOfficers(
      supabase,
      list.map((r) => r.officer_id)
    )

    const data = list.map((r) => {
      const o = byOfficer[r.officer_id]
      return {
        ...r,
        // canonical business id ("P/..."), even when the row stored a uuid
        officer_id: o?.officer_id ?? r.officer_id,
        full_name: o?.full_name ?? null,
        department: o?.department ?? null,
        is_open: r.check_out_time == null,
      }
    })

    return NextResponse.json({
      code: "000",
      total: count ?? data.length,
      limit,
      offset,
      data,
    })
  } catch (error) {
    console.error("❌ summary error:", error)
    return NextResponse.json(
      { message: "Failed to fetch attendance summary", error: String(error) },
      { status: 500 }
    )
  }
}, "attendance/summary:GET")

import { NextResponse, NextRequest } from "next/server"
import { withApiLogging } from "@/lib/logger"
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin"
import { requireAdmin } from "@/lib/adminAuth"
import { resolveOfficers } from "@/lib/officers"

// GET /api/attendance/today  — 🔒 admin
// Today's attendance_summary rows across all officers, with the officer's
// name/department merged in and an is_open flag.
export const GET = withApiLogging(async (req: NextRequest) => {
  try {
    const auth = requireAdmin(req)
    if (auth instanceof NextResponse) return auth

    const today = new Date().toISOString().split("T")[0]

    const { data: rows, error } = await supabase
      .from("attendance_summary")
      .select("*")
      .eq("date", today)
      .order("check_in_time", { ascending: false })

    if (error) {
      console.error("❌ today attendance query failed:", error)
      return NextResponse.json(
        { message: "Failed to fetch today's attendance", debug: error.message },
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
        officer_id: o?.officer_id ?? r.officer_id,
        full_name: o?.full_name ?? null,
        department: o?.department ?? null,
        is_open: r.check_out_time == null,
      }
    })

    return NextResponse.json({
      code: "000",
      date: today,
      count: data.length,
      open_count: data.filter((r) => r.is_open).length,
      data,
    })
  } catch (error) {
    console.error("❌ today attendance error:", error)
    return NextResponse.json(
      { message: "Failed to fetch today's attendance", error: String(error) },
      { status: 500 }
    )
  }
}, "attendance/today:GET")

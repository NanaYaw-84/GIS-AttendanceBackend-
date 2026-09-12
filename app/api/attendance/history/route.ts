import { NextResponse, NextRequest } from "next/server"
import { withApiLogging } from "@/lib/logger"
import { supabase } from "@/lib/supabase-client"

export const OPTIONS = withApiLogging(async (req: NextRequest) => {
  const res = new NextResponse(null, { status: 204 })
  res.headers.set("Access-Control-Allow-Origin", "*")
  res.headers.set("Access-Control-Allow-Methods", "GET")
  res.headers.set("Access-Control-Allow-Headers", req.headers.get("access-control-request-headers") || "Content-Type, Authorization")
  return res
}, "attendance/all-attendance:OPTIONS")

// GET a single officer by ID
export const GET = withApiLogging(async (req: NextRequest) => {
  try {
    // Get ID from query string instead of params
    const id = req.nextUrl.searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { message: "Missing id query parameter" },
        { status: 400 }
      )
    }

    // Returns the officer's most recent attendance_summary row.
    const { data, error } = await supabase
      .from("attendance_summary")
      .select("*")
      .eq("officer_id", id)
      .order("date", { ascending: false })

    console.log("📦 Supabase response:", { dataLength: Array.isArray(data) ? data.length : 'not array', data: data })
    if (error) {
      console.error("❌ Supabase error:", error)
      return NextResponse.json(
        { message: "Failed to fetch attendance history", debug: error.message },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { message: "No attendance History recorded" },
        { status: 404 }
      )
    }

    console.log("✅ Attendance history found:", data[0].id)
    return NextResponse.json({ code: "000", data: data[0] })
  } catch (error) {
    console.error("❌ Fetch attendance history error:", error)
    return NextResponse.json(
      { message: "Failed to fetch attendance history", error: String(error) },
      { status: 500 }
    )
  }
}, "attendance/history:GET")

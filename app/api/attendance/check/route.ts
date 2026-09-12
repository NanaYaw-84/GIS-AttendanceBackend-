/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/attendance/check/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withApiLogging } from "@/lib/logger"
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin"

const FACEPLUSPLUS_API_KEY = process.env.FACE_API_KEY || ''
const FACEPLUSPLUS_API_SECRET = process.env.FACE_API_SECRET || ''
const FACESET_OUTER_ID = process.env.FACESET_OUTER_ID || ''
const FACE_CONFIDENCE_THRESHOLD = parseFloat(process.env.FACE_CONFIDENCE_THRESHOLD || '80.0')
const SUPABASE_BUCKET = process.env.SUPABASE_FACE_BUCKET || 'face-images'

if (!FACEPLUSPLUS_API_KEY || !FACEPLUSPLUS_API_SECRET || !FACESET_OUTER_ID) {
  throw new Error('Face++ environment variables are not set')
}

/**
 * Upload image to Supabase Storage bucket
 */
async function uploadImageToStorage(imageBuffer: Blob, fileName: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(`${Date.now()}-${fileName}`, imageBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      })

    if (error) {
      console.error("❌ Supabase upload error:", error)
      return null
    }

    console.log("✅ Image uploaded to Supabase:", data.path)
    return data.path
  } catch (error) {
    console.error("❌ Upload error:", error)
    return null
  }
}

/**
 * Get public URL for uploaded image
 */
function getPublicImageUrl(path: string): string {
  const { data } = supabase.storage
    .from(SUPABASE_BUCKET)
    .getPublicUrl(path)
  return data.publicUrl
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * DIRECT IMAGE SEARCH — searches Face++ faceset. Retries on the free
 * tier's CONCURRENCY_LIMIT_EXCEEDED with backoff.
 */
async function searchFaceDirect(imageBuffer: Blob): Promise<any | null> {
  let data: any = {}
  for (let i = 0; i < 4; i++) {
    const formData = new FormData()
    formData.append("api_key", FACEPLUSPLUS_API_KEY)
    formData.append("api_secret", FACEPLUSPLUS_API_SECRET)
    formData.append("outer_id", FACESET_OUTER_ID || "attendance_faceset")
    formData.append("image_file", imageBuffer, "face.jpg")

    try {
      const response = await fetch("https://api-us.faceplusplus.com/facepp/v3/search", {
        method: "POST",
        body: formData as any,
      })
      data = await response.json().catch(() => ({}))
    } catch (e) {
      console.error("❌ Face++ Search fetch failed:", e)
      await sleep(700 * (i + 1))
      continue
    }

    if (String(data.error_message || "").includes("CONCURRENCY_LIMIT_EXCEEDED")) {
      await sleep(900 * (i + 1))
      continue
    }
    break
  }

  // Debug for errors
  if (data.error_message) {
    console.error("❌ Face++ Search Error:", data.error_message)
    return null
  }

  if (!data.results || data.results.length === 0) {
    console.warn("⚠️ No face results from Face++")
    return null
  }

  // Find a match with confidence > threshold
  const bestMatch = data.results.find((result: any) => result.confidence > FACE_CONFIDENCE_THRESHOLD)
  if (!bestMatch) {
    console.warn("⚠️ No matches above confidence threshold")
    return null
  }

  return bestMatch
}

/**
 * Find officer by face_token in Supabase
 */
async function findOfficerByFaceToken(faceToken: string): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from("officers")
      .select("*")
      .eq("face_token", faceToken)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        // No row found
        console.warn("⚠️ No officer found with this face token")
        return null
      }
      console.error("❌ Supabase query error:", error)
      return null
    }

    console.log("✅ Officer found:", data.officer_id)
    return data
  } catch (error) {
    console.error("❌ Error finding officer:", error)
    return null
  }
}

/** Any attendance_summary row for this officer on this date, or null. */
async function getDaySummary(officer_id: string, date: string): Promise<any | null> {
  const { data } = await supabase
    .from("attendance_summary")
    .select("*")
    .eq("officer_id", officer_id)
    .eq("date", date)
    .maybeSingle()
  return data ?? null
}

/** Insert today's clock-in row. */
async function createSummaryClockIn(officer_id: string, date: string): Promise<any | null> {
  const { data, error } = await supabase
    .from("attendance_summary")
    .insert([{
      officer_id,
      date,
      check_in_time: new Date().toISOString(),
      status: "in_progress",
    }])
    .select()
    .single()
  if (error) {
    console.error("❌ Error creating attendance_summary:", error)
    return null
  }
  return data
}

/** Close an open row: set check_out_time, duration, status. */
async function closeSummary(row: any): Promise<any | null> {
  const now = new Date().toISOString()
  const duration = row?.check_in_time
    ? Math.max(0, Math.round((Date.parse(now) - Date.parse(row.check_in_time)) / 60000))
    : null
  const { data, error } = await supabase
    .from("attendance_summary")
    .update({
      check_out_time: now,
      duration_minutes: duration,
      status: "completed",
      updated_at: now,
    })
    .eq("id", row.id)
    .select()
    .single()
  if (error) {
    console.error("❌ Error updating attendance_summary:", error)
    return null
  }
  return data
}

// POST captured image and verifies with Face++ + Supabase
export const POST = withApiLogging(async (req: NextRequest) => {
  try {
    const formData = await req.formData()
    const imageFile = formData.get("image") as Blob | null
    const action = formData.get("action") as string || "clock_in" // clock_in or clock_out

    if (!imageFile) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      )
    }

    console.log("📸 Processing image for:", action)

    // 🔍 Search face directly in Face++ faceset
    const faceMatch = await searchFaceDirect(imageFile)

    if (!faceMatch) {
      return NextResponse.json({
        success: false,
        hasFace: false,
        officer: null,
        message: "No matching face found or confidence too low.",
        confidence: 0,
      })
    }

    console.log("✅ Face found with confidence:", faceMatch.confidence)

    // Find officer by face_token in Supabase
    const officer = await findOfficerByFaceToken(faceMatch.face_token)

    if (!officer) {
      return NextResponse.json({
        success: false,
        hasFace: true,
        officer: null,
        message: "Face matched but officer not found in system.",
        confidence: faceMatch.confidence,
      })
    }

    // Upload image to Supabase Storage
    const imagePath = await uploadImageToStorage(imageFile, `${officer.officer_id}-${Date.now()}.jpg`)
    const imageUrl = imagePath ? getPublicImageUrl(imagePath) : null

    const today = new Date().toISOString().split("T")[0]

    // Check action
    if (action === "clock_in") {
      // Reject a repeat clock-in for today (open or already completed).
      const dayRow = await getDaySummary(officer.officer_id, today)

      if (dayRow && dayRow.check_in_time) {
        return NextResponse.json({
          success: false,
          hasFace: true,
          officer: {
            officer_id: officer.officer_id,
            full_name: officer.full_name,
            email: officer.email,
          },
          message: dayRow.check_out_time
            ? "You have already completed your attendance for today."
            : "Already clocked in today. Use clock_out to finish.",
          attendance: dayRow,
          confidence: faceMatch.confidence,
        })
      }

      // Create new attendance record
      const attendance = await createSummaryClockIn(officer.officer_id, today)

      if (!attendance) {
        return NextResponse.json({
          success: false,
          hasFace: true,
          officer: {
            officer_id: officer.officer_id,
            full_name: officer.full_name,
            email: officer.email,
          },
          message: "Face verified but failed to create attendance record.",
          confidence: faceMatch.confidence,
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        hasFace: true,
        officer: {
          officer_id: officer.officer_id,
          full_name: officer.full_name,
          email: officer.email,
          department: officer.department,
        },
        message: "Clocked in successfully.",
        attendance,
        imageUrl,
        confidence: faceMatch.confidence,
      })
    } else if (action === "clock_out") {
      const dayRow = await getDaySummary(officer.officer_id, today)

      if (!dayRow || !dayRow.check_in_time) {
        return NextResponse.json({
          success: false,
          hasFace: true,
          officer: {
            officer_id: officer.officer_id,
            full_name: officer.full_name,
            email: officer.email,
          },
          message: "No clock-in found for today. Please clock in first.",
          confidence: faceMatch.confidence,
        }, { status: 400 })
      }

      if (dayRow.check_out_time) {
        return NextResponse.json({
          success: false,
          hasFace: true,
          officer: {
            officer_id: officer.officer_id,
            full_name: officer.full_name,
            email: officer.email,
          },
          message: "You have already clocked out today.",
          attendance: dayRow,
          confidence: faceMatch.confidence,
        }, { status: 400 })
      }

      // Update attendance record
      const updatedAttendance = await closeSummary(dayRow)

      if (!updatedAttendance) {
        return NextResponse.json({
          success: false,
          hasFace: true,
          officer: {
            officer_id: officer.officer_id,
            full_name: officer.full_name,
            email: officer.email,
          },
          message: "Face verified but failed to clock out.",
          confidence: faceMatch.confidence,
        }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        hasFace: true,
        officer: {
          officer_id: officer.officer_id,
          full_name: officer.full_name,
          email: officer.email,
          department: officer.department,
        },
        message: "Clocked out successfully.",
        attendance: updatedAttendance,
        imageUrl,
        confidence: faceMatch.confidence,
      })
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'clock_in' or 'clock_out'." },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error("❌ Error in /api/attendance/check:", error)
    const msg = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Failed to process image", details: msg },
      { status: 500 }
    )
  }
}, "attendance/check:POST")
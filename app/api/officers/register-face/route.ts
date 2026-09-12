/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/officers/register-face/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withApiLogging } from "@/lib/logger"
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin"

const FACEPLUSPLUS_API_KEY = process.env.FACE_API_KEY || ''
const FACEPLUSPLUS_API_SECRET = process.env.FACE_API_SECRET || ''
const FACESET_OUTER_ID = process.env.FACESET_OUTER_ID || ''
const SUPABASE_BUCKET = process.env.SUPABASE_FACE_BUCKET || 'face-images'

if (!FACEPLUSPLUS_API_KEY || !FACEPLUSPLUS_API_SECRET || !FACESET_OUTER_ID) {
  throw new Error('Face++ environment variables are not set')
}

const FACEPP_BASE = "https://api-us.faceplusplus.com/facepp/v3"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * POST to a Face++ endpoint with the api_key/secret attached, retrying on
 * the free tier's CONCURRENCY_LIMIT_EXCEEDED (and transient 5xx) with
 * backoff. `fields` is appended to a fresh FormData per attempt.
 */
async function faceppPost(
  path: string,
  fields: Array<[string, string] | [string, Blob, string]>,
  attempts = 4
): Promise<any> {
  let lastErr = ""
  for (let i = 0; i < attempts; i++) {
    const form = new FormData()
    form.append("api_key", FACEPLUSPLUS_API_KEY)
    form.append("api_secret", FACEPLUSPLUS_API_SECRET)
    for (const f of fields) {
      if (f.length === 3) form.append(f[0], f[1], f[2])
      else form.append(f[0], f[1])
    }

    let data: any = {}
    try {
      const res = await fetch(`${FACEPP_BASE}/${path}`, { method: "POST", body: form as any })
      data = await res.json().catch(() => ({}))
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      await sleep(600 * (i + 1))
      continue
    }

    const msg = String(data.error_message || "")
    if (msg.includes("CONCURRENCY_LIMIT_EXCEEDED") || /^INTERNAL_ERROR|^SERVER/.test(msg)) {
      lastErr = msg
      await sleep(900 * (i + 1)) // 0.9s, 1.8s, 2.7s
      continue
    }
    return data
  }
  return { error_message: lastErr || "Face++ request failed after retries" }
}

/**
 * Detect face in image using Face++
 */
async function detectFace(imageBuffer: Blob): Promise<any | null> {
  const data = await faceppPost("detect", [
    ["image_file", imageBuffer, "face.jpg"],
    ["return_landmark", "0"],
    ["return_attributes", "age,gender"],
  ])

  if (data.error_message) {
    console.error("❌ Face++ Detect Error:", data.error_message)
    return null
  }

  if (!data.faces || data.faces.length === 0) {
    console.warn("⚠️ No faces detected in image")
    return null
  }

  return data.faces[0]
}

/**
 * Ensure the Face++ FaceSet identified by `outerID` exists.
 *
 * `faceset/addface` fails if the set was never created, and Face++ does
 * not auto-create on addface. Creating an existing set returns the
 * `FACESET_EXIST` error, which we treat as success.
 */
/**
 * Add a face to the FaceSet, creating the set if it doesn't exist yet
 * (`create_if_not_exist`). A single call — no separate faceset/create —
 * which keeps us under the free tier's request-rate ceiling.
 */
async function addFaceToFaceset(
  faceToken: string,
  outerID: string
): Promise<{ ok: boolean; error?: string }> {
  const data = await faceppPost("faceset/addface", [
    ["face_tokens", faceToken],
    ["outer_id", outerID],
    ["create_if_not_exist", "1"],
  ])

  if (data.error_message) {
    console.error("❌ Face++ AddFace Error:", data.error_message)
    return { ok: false, error: `faceset/addface: ${data.error_message}` }
  }

  console.log("✅ Face added to faceset:", faceToken, "added:", data.face_added)
  return { ok: true }
}

/** Create the storage bucket if it doesn't exist yet (public). */
async function ensureBucket(name: string): Promise<void> {
  try {
    const { data } = await supabase.storage.getBucket(name)
    if (data) return
    const { error } = await supabase.storage.createBucket(name, {
      public: true,
      fileSizeLimit: "10MB",
    })
    if (error && !/already exists/i.test(error.message)) {
      console.error("❌ createBucket failed:", error.message)
    } else {
      console.log("✅ Storage bucket ready:", name)
    }
  } catch (e) {
    console.error("❌ ensureBucket threw:", e)
  }
}

/**
 * Upload image to Supabase Storage. Returns { path } on success or
 * { error } with the real Supabase message so the caller can surface it.
 */
async function uploadImageToStorage(
  imageBuffer: Blob,
  officer_id: string
): Promise<{ path?: string; error?: string }> {
  // officer_id can contain "/" (e.g. "P/012/2025") — not valid in an
  // object key segment, so flatten it.
  const safeId = officer_id.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
  const objectPath = `officers/${safeId}-${Date.now()}.jpg`

  const doUpload = () =>
    supabase.storage.from(SUPABASE_BUCKET).upload(objectPath, imageBuffer, {
      contentType: "image/jpeg",
      upsert: true,
    })

  try {
    const first = await doUpload()
    let result = first

    // Bucket missing on first use — create it and retry once.
    if (first.error && /bucket not found|not exist/i.test(first.error.message)) {
      await ensureBucket(SUPABASE_BUCKET)
      result = await doUpload()
    }

    if (result.error || !result.data) {
      console.error("❌ Supabase upload error:", result.error)
      return { error: result.error?.message ?? "upload returned no path" }
    }

    console.log("✅ Image uploaded:", result.data.path)
    return { path: result.data.path }
  } catch (error) {
    console.error("❌ Upload error:", error)
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Get public URL for image
 */
function getPublicImageUrl(path: string): string {
  const { data } = supabase.storage
    .from(SUPABASE_BUCKET)
    .getPublicUrl(path)
  return data.publicUrl
}

/**
 * Update officer with face_token in Supabase
 */
async function updateOfficerFaceToken(officer_id: string, face_token: string, image_path: string, image_url: string, confidence: number): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from("officers")
      .update({
        face_token,
        face_image_path: image_path,
        // Persist the public URL too — the mobile app reads
        // `face_image_url` to show the avatar; without this the photo
        // saves but never displays.
        face_image_url: image_url,
        face_confidence: confidence,
        updated_at: new Date().toISOString(),
      })
      .eq("officer_id", officer_id)
      .select()
      .single()

    if (error) {
      console.error("❌ Supabase update error:", error)
      return null
    }

    console.log("✅ Officer updated with face token:", officer_id)
    return data
  } catch (error) {
    console.error("❌ Error updating officer:", error)
    return null
  }
}

/**
 * Register officer face - detect, upload, add to faceset
 */
export const POST = withApiLogging(async (req: NextRequest) => {
  try {
    const formData = await req.formData()
    const imageFile = formData.get("image") as Blob | null
    const officer_id = formData.get("officer_id") as string | null

    if (!imageFile) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      )
    }

    if (!officer_id) {
      return NextResponse.json(
        { error: "officer_id is required" },
        { status: 400 }
      )
    }

    console.log("📸 Registering face for officer:", officer_id)

    // Step 1: Detect face in image
    const faceData = await detectFace(imageFile)

    if (!faceData) {
      return NextResponse.json({
        success: false,
        message: "No face detected in image. Please provide a clear face image.",
      }, { status: 400 })
    }

    const faceToken = faceData.face_token
    const confidence = faceData.confidence
    const faceRectangle = faceData.face_rectangle

    console.log("✅ Face detected, token:", faceToken, "confidence:", confidence)

    // Step 2: Upload image to Supabase
    const upload = await uploadImageToStorage(imageFile, officer_id)

    if (!upload.path) {
      return NextResponse.json({
        success: false,
        message: `Failed to upload image to storage: ${upload.error ?? "unknown error"}`,
      }, { status: 500 })
    }

    const imagePath = upload.path
    const imageUrl = getPublicImageUrl(imagePath)

    // Step 3: Add face to the faceset that /api/attendance/check searches.
    // Must be FACESET_OUTER_ID — registering into a per-officer set would
    // make the 1:N search at clock-in never find this face. addface
    // creates the set on first use.
    const added = await addFaceToFaceset(faceToken, FACESET_OUTER_ID)

    if (!added.ok) {
      const reason = added.error || "unknown Face++ error"
      console.error("❌ addface failed:", reason, "outer_id:", FACESET_OUTER_ID)
      return NextResponse.json({
        success: false,
        message: `Face detected and uploaded, but couldn't be added to the faceset: ${reason}`,
        imagePath,
        outer_id: FACESET_OUTER_ID,
      }, { status: 500 })
    }

    // Step 4: Update officer in database
    const updatedOfficer = await updateOfficerFaceToken(officer_id, faceToken, imagePath, imageUrl, confidence)

    if (!updatedOfficer) {
      return NextResponse.json({
        success: false,
        message: "Face registered in Face++, but failed to update officer record.",
        faceToken,
        imagePath,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Face registered successfully.",
      officer: {
        officer_id: updatedOfficer.officer_id,
        full_name: updatedOfficer.full_name,
        email: updatedOfficer.email,
      },
      face: {
        face_token: faceToken,
        confidence: confidence,
        rectangle: faceRectangle,
      },
      imageUrl,
    })

  } catch (error) {
    console.error("❌ Error registering face:", error)
    const msg = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Failed to register face", details: msg },
      { status: 500 }
    )
  }
}, "officers/register-face:POST")

// Optional: GET to check if officer has face registered
export const GET = withApiLogging(async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url)
    const officer_id = searchParams.get("officer_id")

    if (!officer_id) {
      return NextResponse.json(
        { error: "officer_id query parameter is required" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("officers")
      .select("officer_id, full_name, email, face_token, face_image_path, face_confidence")
      .eq("officer_id", officer_id)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { message: "Officer not found" },
          { status: 404 }
        )
      }
      console.error("❌ Supabase error:", error)
      return NextResponse.json(
        { error: "Failed to fetch officer", details: error.message },
        { status: 500 }
      )
    }

    if (!data.face_token) {
      return NextResponse.json({
        has_face: false,
        officer: {
          officer_id: data.officer_id,
          full_name: data.full_name,
          email: data.email,
        },
        message: "Officer found but no face registered yet.",
      })
    }

    const imageUrl = data.face_image_path ? getPublicImageUrl(data.face_image_path) : null

    return NextResponse.json({
      has_face: true,
      officer: {
        officer_id: data.officer_id,
        full_name: data.full_name,
        email: data.email,
      },
      face: {
        face_token: data.face_token,
        confidence: data.face_confidence,
        image_path: data.face_image_path,
        imageUrl,
      },
    })

  } catch (error) {
    console.error("❌ Error fetching officer face:", error)
    return NextResponse.json(
      { error: "Failed to fetch officer face", details: String(error) },
      { status: 500 }
    )
  }
}, "officers/register-face:GET")
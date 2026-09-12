// app/api/upload/route.ts
// Generic file upload to Supabase Storage. Not admin-gated (mobile client
// compatibility) — validation below limits what an unauthenticated caller
// can do with it.
import { NextRequest, NextResponse } from "next/server"
import { withApiLogging } from "@/lib/logger"
import { supabaseAdmin } from "@/lib/supabaseAdmin"

const BUCKET = process.env.SUPABASE_UPLOAD_BUCKET || "uploads"
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
])

function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    case "application/pdf":
      return "pdf"
    default:
      return "bin"
  }
}

export const POST = withApiLogging(async (req: NextRequest) => {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as Blob | null
    const folderInput = formData.get("folder")
    const folder = typeof folderInput === "string" ? folderInput.replace(/[^a-zA-Z0-9/_-]/g, "") : ""

    if (!file) {
      return NextResponse.json({ message: "No file provided" }, { status: 400 })
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { message: `Unsupported file type: ${file.type || "unknown"}` },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { message: `File too large. Max size is ${MAX_SIZE_BYTES / (1024 * 1024)}MB` },
        { status: 400 }
      )
    }

    const fileName = `${Date.now()}-${crypto.randomUUID()}.${extensionFor(file.type)}`
    const path = folder ? `${folder}/${fileName}` : fileName

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })

    if (error) {
      console.error("❌ Upload error:", error)
      return NextResponse.json({ message: "Failed to upload file" }, { status: 500 })
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(data.path)

    return NextResponse.json({
      code: "000",
      message: "File uploaded successfully",
      path: data.path,
      url: publicUrlData.publicUrl,
    })
  } catch (error) {
    console.error("❌ Upload route error:", error)
    return NextResponse.json(
      { message: "Failed to upload file", error: String(error) },
      { status: 500 }
    )
  }
}, "upload:POST")

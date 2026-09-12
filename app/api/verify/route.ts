/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { withApiLogging } from "@/lib/logger";
import { supabaseAdmin, getSupabaseRestHeaders } from "@/lib/supabaseAdmin";

const FACE_API_KEY = process.env.FACE_API_KEY || "";
const FACE_API_SECRET = process.env.FACE_API_SECRET || "";
const FACE_COMPARE_URL = "https://api-us.faceplusplus.com/facepp/v3/compare";
const FACE_DETECT_URL = "https://api-us.faceplusplus.com/facepp/v3/detect";

// Same bucket registration writes to (app/api/officers/register-face).
const FACE_BUCKET = process.env.SUPABASE_FACE_BUCKET || "face-images";
// 1:1 match threshold. Kept in sync with app/api/attendance/check.
const MATCH_THRESHOLD = parseFloat(process.env.FACE_CONFIDENCE_THRESHOLD || "80");

// Verifies a captured face against the officer's registered face.
//
// The reference is whatever registration stored on the `officers` row:
//   - `face_token`  — a Face++ token kept alive by the officer faceset
//                     (app/api/officers/register-face). Preferred: no
//                     storage round-trip and no image decoding.
//   - `face_image_path` — a JPEG in the `face-images` bucket. Fallback
//                     for officers registered before face_token existed.
//
// POST /api/verify  { id, imageBase64 }  ->  { success, confidence, is_match, id }
export const POST = withApiLogging(async (request: Request) => {
  try {
    const body = await request.json();
    const { id, imageBase64 } = body;

    if (!id || !imageBase64) {
      return NextResponse.json(
        { error: "Missing id or imageBase64" },
        { status: 400 }
      );
    }

    // The mobile client sends the business officer_id ("P/012/2025"); a
    // uuid is also accepted. Only match on `id` when the value actually
    // looks like a uuid — `id.eq.<non-uuid>` errors the whole query.
    const raw = String(id);
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
    const idValue = encodeURIComponent(raw);
    const filter = isUuid
      ? `or=(id.eq.${idValue},officer_id.eq.${idValue})`
      : `officer_id=eq.${idValue}`;
    const metaResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/officers` +
        `?select=id,officer_id,face_token,face_image_path&${filter}`,
      {
        method: "GET",
        headers: getSupabaseRestHeaders(),
      }
    );

    const metaRows = await metaResponse.json().catch(() => []);

    if (!metaResponse.ok || !Array.isArray(metaRows) || metaRows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const officer = metaRows[0];
    const faceToken: string | null = officer.face_token || null;
    const imagePath: string | null = officer.face_image_path || null;

    if (!faceToken && !imagePath) {
      return NextResponse.json(
        {
          error: "User has no registered face",
          details:
            "This officer has not completed face registration. Add a face image in Settings.",
        },
        { status: 400 }
      );
    }

    const capturedBase64 = String(imageBase64).includes(",")
      ? String(imageBase64).split(",")[1]
      : String(imageBase64);

    // 1) Confirm the captured frame actually contains a face, so the user
    //    gets "no face detected" rather than a confusing low-confidence miss.
    const detectForm = new URLSearchParams({
      api_key: FACE_API_KEY,
      api_secret: FACE_API_SECRET,
      image_base64: capturedBase64,
      return_attributes: "facequality",
    });

    const detectResponse = await fetch(FACE_DETECT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: detectForm,
    });

    const detectResult = await detectResponse.json();

    if (detectResult.error_message) {
      console.error("Face++ Detect Error:", detectResult.error_message);
      return NextResponse.json(
        { error: "Face detection failed", details: detectResult.error_message },
        { status: 400 }
      );
    }

    if (!detectResult.faces || detectResult.faces.length === 0) {
      return NextResponse.json(
        { error: "No face detected in captured image" },
        { status: 400 }
      );
    }

    // 2) Compare captured face against the registered reference.
    const compareForm = new URLSearchParams({
      api_key: FACE_API_KEY,
      api_secret: FACE_API_SECRET,
      image_base64_1: capturedBase64,
    });

    if (faceToken) {
      compareForm.set("face_token2", faceToken);
    } else {
      // Fallback: pull the stored reference JPEG from Storage.
      const { data: storedFile, error: downloadError } = await supabaseAdmin.storage
        .from(FACE_BUCKET)
        .download(imagePath as string);

      if (downloadError || !storedFile) {
        console.error("Storage download failed", downloadError);
        return NextResponse.json(
          { error: "Failed to load registered image" },
          { status: 500 }
        );
      }

      const storedArrayBuffer = await storedFile.arrayBuffer();
      compareForm.set(
        "image_base64_2",
        Buffer.from(storedArrayBuffer).toString("base64")
      );
    }

    const response = await fetch(FACE_COMPARE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: compareForm,
    });

    const result = await response.json();

    if (result.error_message) {
      console.error("Face++ Compare Error:", result.error_message);
      return NextResponse.json(
        { error: "Face++ API error", details: result.error_message },
        { status: 500 }
      );
    }

    const confidence = result.confidence || 0;
    const is_match = confidence >= MATCH_THRESHOLD;

    return NextResponse.json({
      success: true,
      confidence,
      is_match,
      id,
      face_box: detectResult.faces[0].face_rectangle,
    });
  } catch (err: any) {
    console.error("Face verification error:", err);
    return NextResponse.json(
      { error: "Server error", details: err.message },
      { status: 500 }
    );
  }
}, "verify:POST");

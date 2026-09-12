const endpoint = process.env.AZURE_FACE_ENDPOINT!;
const key = process.env.AZURE_FACE_KEY!;

// 🔹 Detect face
export async function detectFace(imageBuffer: Buffer) {
  const res = await fetch(`${endpoint}/face/v1.0/detect`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/octet-stream"
    },
    body: new Uint8Array(imageBuffer) // ✅ FIX
  });

  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("No face detected");
  }

  return data[0].faceId;
}

// 🔹 Verify faces
export async function verifyFaces(faceId1: string, faceId2: string) {
  const res = await fetch(`${endpoint}/face/v1.0/verify`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      faceId1,
      faceId2
    })
  });

  return res.json();
}
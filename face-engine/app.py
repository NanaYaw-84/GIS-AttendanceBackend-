from flask import Flask, request, jsonify
from deepface import DeepFace
import base64
import tempfile
import os
import sys
import numpy as np

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
sys.stdout.reconfigure(encoding='utf-8')

app = Flask(__name__)

# 🔥 Preload model (Speeds up verification)
print("Loading DeepFace model...")
DeepFace.build_model("Facenet")
print("Model loaded.")

# Helper to save base64 image to temp file
def save_temp_image(b64: str):
    img_data = base64.b64decode(b64)
    temp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    temp.write(img_data)
    temp.close()
    return temp.name

@app.route("/verify", methods=["POST"])
def verify():
    try:
        data = request.json
        image1 = data.get("image1")
        image2 = data.get("image2")
        user_id = data.get("user_id", None)

        if not image1 or not image2:
            return jsonify({"error": "Missing images"}), 400

        img1_path = save_temp_image(image1.split(",")[1] if "," in image1 else image1)
        img2_path = save_temp_image(image2.split(",")[1] if "," in image2 else image2)

        result = DeepFace.verify(
            img1_path,
            img2_path,
            model_name="Facenet",
            # detector_backend="retinaface",  # 🔥 better detection
            enforce_detection=False
        )

        # verified = result.get("verified", False)
        distance = float(result.get("distance", 0))
        threshold =float(result.get("threshold"))
        confidence =float(result.get("confidence"))
        full_result = result
        verified = distance < 0.65

        return jsonify({
            "success": True,
            "verified": verified,
            "distance": distance,
            "threshold": threshold,
            "confidence": confidence,
            "user_id": user_id,
            "fullResult": full_result
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        # Clean up temp files
        for path in [img1_path, img2_path]:
            if os.path.exists(path):
                os.remove(path)


@app.route("/embed", methods=["POST"])
def embed():
    try:
        data = request.json
        image = data.get("image")

        if not image:
            return jsonify({"error": "Missing image"}), 400

        image = image.split(",")[1] if "," in image else image

        img_path = save_temp_image(image)

        embedding = DeepFace.represent(
            img_path,
            model_name="ArcFace",
            detector_backend="retinaface",
            enforce_detection=False
        )[0]["embedding"]

        return jsonify({
            "success": True,
            "embedding": embedding
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        if img_path and os.path.exists(img_path):
            os.remove(img_path)


@app.route("/health", methods=["GET"])
def health():
    return {"status": "running", "uptime":""}



if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

    # pm2 start app.py --name deepface --interpreter python
    # ALTER TABLE images ADD COLUMN embedding TEXT;
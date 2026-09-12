import sys
import json
import base64
import tempfile
from deepface import DeepFace

try:
    # Inputs from Node
    image1_base64 = sys.argv[1]  # captured image
    image2_base64 = sys.argv[2]  # stored image

    # Decode base64 → temp files
    def save_temp_image(b64):
        img_data = base64.b64decode(b64)
        temp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
        temp.write(img_data)
        temp.close()
        return temp.name

    img1_path = save_temp_image(image1_base64)
    img2_path = save_temp_image(image2_base64)

    result = DeepFace.verify(
        img1_path=img1_path,
        img2_path=img2_path,
        model_name="Facenet",
        enforce_detection=False
    )

    print(json.dumps({
        "verified": result["verified"],
        "distance": float(result["distance"])
    }))

except Exception as e:
    print(json.dumps({
        "error": str(e)
    }))
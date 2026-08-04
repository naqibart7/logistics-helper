"""
Example hosted OCR endpoint that satisfies the UNLIMITED_OCR_URL contract.

The client (browser / Vercel serverless function / Express proxy) POSTs a PDF or
image as multipart/form-data with a `file` field, and expects JSON back:

    { "text": "OCR line 1\nOCR line 2", "pages": 3 }

Run on your GPU box where the vision model lives:

    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8000

Then set UNLIMITED_OCR_URL=http://<your-host>:8000/v1/ocr (public HTTPS in
production) and redeploy the Vercel app.
"""

import asyncio
from fastapi import FastAPI, UploadFile, File

app = FastAPI(title="Unlimited-OCR bridge")


# ─── YOUR MODEL CALL ──────────────────────────────────────────────────────────
# Replace `extract_text_with_your_model` with whatever your inference stack needs.
# Keep the signature: bytes in -> str out. Examples:
#
#   A) Call a local vLLM OpenAI-compatible vision endpoint:
#        import httpx, base64
#        async def extract_text_with_your_model(data: bytes) -> str:
#            b64 = base64.b64encode(data).decode()
#            resp = await httpx.AsyncClient().post(
#                "http://localhost:8000/v1/chat/completions",
#                json={
#                    "model": "your-vlm",
#                    "messages": [{
#                        "role": "user",
#                        "content": [
#                            {"type": "image_url", "image_url": {"url": f"data:file;base64,{b64}"}},
#                            {"type": "text", "text": "Extract all text, keep line breaks."},
#                        ],
#                    }],
#                },
#                timeout=60,
#            )
#            return resp.json()["choices"][0]["message"]["content"]
#
#   B) Use an HF pipeline synchronously and run it on a thread.
#   C) Just echo a stub so the plumbing can be tested end-to-end.
async def extract_text_with_your_model(data: bytes) -> str:
    # Placeholder — remove in production.
    await asyncio.sleep(0)
    return (
        "UNLIMITED_OCR_STUB\n"
        "Replace extract_text_with_your_model() with your real vision model call."
    )


def page_count(data: bytes) -> int:
    # Naive page counter for PDFs: count /Type /Page markers. For images return 1.
    try:
        return max(1, data.count(b"/Type /Page"))
    except Exception:
        return 1


@app.post("/v1/ocr")
async def ocr(file: UploadFile = File(...)) -> dict:
    data = await file.read()
    text = await extract_text_with_your_model(data)
    return {"text": text, "pages": page_count(data)}
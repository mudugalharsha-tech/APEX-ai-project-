import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, List, Optional

import httpx
from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from rag_pipeline import MissingAPIKeyError, RAGPipeline, get_device_collection_name

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB upload limit

app = FastAPI(title="Multi-Format RAG Chatbot API", version="1.0.0")

allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "*").strip()
allowed_origins = (
    ["*"]
    if allowed_origins_env == "*"
    else [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allowed_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cache-Control"] = "no-store"
    return response


def _require_device_credentials(
    x_device_id: Optional[str], x_device_secret: Optional[str]
) -> tuple[str, str]:
    try:
        get_device_collection_name(x_device_id or "", x_device_secret or "")
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return x_device_id or "", x_device_secret or ""

pipeline = RAGPipeline()


class URLUploadRequest(BaseModel):
    url: str = Field(..., min_length=1, description="Web URL or YouTube link to ingest")


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, description="User question")
    chat_history: Optional[List[Any]] = Field(
        default_factory=list,
        description="Optional list of {role, content} messages or [user, assistant] pairs",
    )
    api_key: Optional[str] = Field(default=None, description="Optional OpenRouter API key")
    model: Optional[str] = Field(default=None, description="Optional OpenRouter model ID")
    response_style: Optional[str] = Field(
        default="tailored",
        description="Response style: tailored, concise, detailed, bullets, or technical",
    )


def _is_zero_price(val: Any) -> bool:
    if val is None:
        return False
    if isinstance(val, (int, float)):
        return float(val) == 0.0
    try:
        return float(str(val).strip()) == 0.0
    except (ValueError, TypeError):
        return False


@app.get("/")
def health_check() -> dict:
    return {"status": "ok", "service": "Multi-Format RAG Chatbot API"}


@app.get("/models")
def list_openrouter_models() -> dict:
    """Fetch live models from OpenRouter, tagging free models and sorting free-first."""
    try:
        response = httpx.get("https://openrouter.ai/api/v1/models", timeout=15.0)
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Failed to fetch models from OpenRouter: {exc}"
        ) from exc

    parsed_models = []
    for item in payload.get("data", []):
        model_id = item.get("id", "")
        if not model_id:
            continue
        name = item.get("name") or model_id
        pricing = item.get("pricing") or {}
        prompt_price = str(pricing.get("prompt", "0"))
        completion_price = str(pricing.get("completion", "0"))
        is_free = (
            _is_zero_price(prompt_price) and _is_zero_price(completion_price)
        ) or model_id.endswith(":free")

        parsed_models.append(
            {
                "id": model_id,
                "name": name,
                "context_length": item.get("context_length"),
                "prompt_price": prompt_price,
                "completion_price": completion_price,
                "is_free": is_free,
            }
        )

    parsed_models.sort(key=lambda m: (not m["is_free"], m["name"].lower()))
    return {"models": parsed_models}


@app.post("/upload-file")
async def upload_file(
    file: UploadFile = File(...),
    x_device_id: Optional[str] = Header(default=None),
    x_device_secret: Optional[str] = Header(default=None),
) -> dict:
    device_id, device_secret = _require_device_credentials(x_device_id, x_device_secret)
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    suffix = Path(file.filename).suffix
    tmp_path = None
    try:
        content = await file.read()
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail="File too large. Maximum allowed size is 25 MB.",
            )

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        result = pipeline.ingest_file(tmp_path, file.filename, device_id, device_secret)
        return result
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {exc}") from exc
    finally:
        await file.close()
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post("/upload-url")
def upload_url(
    payload: URLUploadRequest,
    x_device_id: Optional[str] = Header(default=None),
    x_device_secret: Optional[str] = Header(default=None),
) -> dict:
    device_id, device_secret = _require_device_credentials(x_device_id, x_device_secret)
    try:
        return pipeline.ingest_url(payload.url.strip(), device_id, device_secret)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to process URL: {exc}") from exc


@app.post("/chat")
def chat(
    payload: ChatRequest,
    x_device_id: Optional[str] = Header(default=None),
    x_device_secret: Optional[str] = Header(default=None),
) -> dict:
    device_id, device_secret = _require_device_credentials(x_device_id, x_device_secret)
    try:
        return pipeline.query_rag(
            question=payload.question,
            device_id=device_id,
            device_secret=device_secret,
            chat_history=payload.chat_history,
            api_key=payload.api_key,
            model=payload.model,
            response_style=payload.response_style,
        )
    except MissingAPIKeyError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Chat failed: {exc}") from exc


@app.delete("/reset")
def reset_knowledge_base(
    x_device_id: Optional[str] = Header(default=None),
    x_device_secret: Optional[str] = Header(default=None),
) -> dict:
    device_id, device_secret = _require_device_credentials(x_device_id, x_device_secret)
    try:
        pipeline.reset(device_id, device_secret)
        return {"status": "reset", "message": "Device knowledge base cleared successfully."}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Reset failed: {exc}") from exc

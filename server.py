"""
Локальный backend трекера Docs as Code.
Отдаёт статику фронтенда и предоставляет API для проверки ответов через ИИ.
API-ключи читаются из .env и никогда не передаются в браузер.

Запуск:
    pip install -r requirements.txt
    python -m uvicorn server:app --host 127.0.0.1 --port 8000
"""

import os
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
GROQ_API_KEY     = os.getenv("GROQ_API_KEY", "")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")


def key_ok(k: str) -> bool:
    return bool(k) and not k.upper().startswith("X") and len(k) > 10


MODELS: dict = {
    "deepseek": {
        "provider": "deepseek",
        "model":    "deepseek-chat",
        "label":    "DeepSeek Chat",
        "key":      DEEPSEEK_API_KEY,
    },
    "groq": {
        "provider": "groq",
        "model":    "llama-3.3-70b-versatile",
        "label":    "Llama 3.3 70B (Groq)",
        "key":      GROQ_API_KEY,
    },
}

app = FastAPI(title="Docs as Code Tracker API")


# ── /api/models ──────────────────────────────────────────────────────────────
@app.get("/api/models")
async def list_models():
    return {"models": [
        {"id": mid, "label": m["label"], "available": key_ok(m["key"])}
        for mid, m in MODELS.items()
    ]}


# ── /api/config ───────────────────────────────────────────────────────────────
@app.get("/api/config")
async def get_config():
    return {"googleClientId": GOOGLE_CLIENT_ID}


# ── /api/evaluate ─────────────────────────────────────────────────────────────
class EvaluateRequest(BaseModel):
    model_id:   str
    prompt:     str
    max_tokens: int = 1500


class EvaluateResponse(BaseModel):
    text:        str
    model_label: str


@app.post("/api/evaluate", response_model=EvaluateResponse)
async def evaluate(req: EvaluateRequest):
    info = MODELS.get(req.model_id)
    if not info:
        raise HTTPException(400, f"Неизвестная модель: {req.model_id}")
    if not key_ok(info["key"]):
        raise HTTPException(400, f"Ключ для {info['label']} не настроен в .env")

    try:
        base = {
            "deepseek": "https://api.deepseek.com/v1",
            "groq":     "https://api.groq.com/openai/v1",
        }[info["provider"]]
        text = await _call_openai_compat(base, info["key"], info["model"], req.prompt, req.max_tokens)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Ошибка вызова модели: {e}")

    return EvaluateResponse(text=text, model_label=info["label"])


async def _call_openai_compat(base_url: str, key: str, model: str, prompt: str, max_tokens: int) -> str:
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model":      model,
                "max_tokens": max_tokens,
                "messages":   [{"role": "user", "content": prompt}],
            },
        )
    if r.status_code != 200:
        raise HTTPException(r.status_code, f"API error ({model}): {r.text}")
    return r.json()["choices"][0]["message"]["content"]


# Статика — ПОСЛЕ всех API-роутов
app.mount("/", StaticFiles(directory=".", html=True), name="static")

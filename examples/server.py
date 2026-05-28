"""
Локальный backend для трекера Docs as Code.

Заменяет `python -m http.server`: отдаёт статические файлы фронтенда
И предоставляет эндпоинт /api/evaluate для проверки ответов через ИИ.

Ключи API читаются из файла .env и НИКОГДА не передаются в браузер.

Запуск:
    pip install -r requirements.txt
    uvicorn server:app --host 127.0.0.1 --port 8000

Затем открыть http://localhost:8000
"""

import os
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# === Ключи из окружения (.env) ===
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# === Реестр моделей: id для фронтенда -> (провайдер, имя модели в API) ===
MODELS = {
    "claude-sonnet": {
        "provider": "anthropic",
        "model": "claude-sonnet-4-6",
        "label": "Claude Sonnet 4.6",
    },
    "claude-opus": {
        "provider": "anthropic",
        "model": "claude-opus-4-6",
        "label": "Claude Opus 4.6",
    },
    "deepseek": {
        "provider": "deepseek",
        "model": "deepseek-chat",
        "label": "DeepSeek Chat",
    },
    "gpt": {
        "provider": "openai",
        "model": "gpt-4o",  # заменить на актуальную модель при необходимости
        "label": "GPT (OpenAI)",
    },
}

app = FastAPI(title="Docs as Code Tracker Backend")


class EvaluateRequest(BaseModel):
    model_id: str          # ключ из MODELS
    prompt: str            # готовый промпт оценки (формируется на фронте из шаблона)
    max_tokens: int = 1500


class EvaluateResponse(BaseModel):
    text: str
    model_label: str


@app.get("/api/models")
async def list_models():
    """Возвращает список доступных моделей для выпадающего списка на фронте.
    Помечает, для каких моделей реально есть ключ."""
    result = []
    for mid, info in MODELS.items():
        provider = info["provider"]
        has_key = {
            "anthropic": bool(ANTHROPIC_API_KEY),
            "deepseek": bool(DEEPSEEK_API_KEY),
            "openai": bool(OPENAI_API_KEY),
        }.get(provider, False)
        result.append({
            "id": mid,
            "label": info["label"],
            "available": has_key,
        })
    return {"models": result}


async def call_anthropic(model: str, prompt: str, max_tokens: int) -> str:
    if not ANTHROPIC_API_KEY:
        raise HTTPException(400, "ANTHROPIC_API_KEY не задан в .env")
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
    if r.status_code != 200:
        raise HTTPException(r.status_code, f"Anthropic error: {r.text}")
    data = r.json()
    return "".join(block.get("text", "") for block in data.get("content", []))


async def call_openai_compatible(base_url: str, api_key: str, key_name: str,
                                  model: str, prompt: str, max_tokens: int) -> str:
    """Работает для OpenAI и DeepSeek — у обоих OpenAI-совместимый формат."""
    if not api_key:
        raise HTTPException(400, f"{key_name} не задан в .env")
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
    if r.status_code != 200:
        raise HTTPException(r.status_code, f"{key_name} error: {r.text}")
    data = r.json()
    return data["choices"][0]["message"]["content"]


@app.post("/api/evaluate", response_model=EvaluateResponse)
async def evaluate(req: EvaluateRequest):
    info = MODELS.get(req.model_id)
    if not info:
        raise HTTPException(400, f"Неизвестная модель: {req.model_id}")

    provider = info["provider"]
    model = info["model"]

    try:
        if provider == "anthropic":
            text = await call_anthropic(model, req.prompt, req.max_tokens)
        elif provider == "deepseek":
            text = await call_openai_compatible(
                "https://api.deepseek.com/v1", DEEPSEEK_API_KEY,
                "DEEPSEEK_API_KEY", model, req.prompt, req.max_tokens,
            )
        elif provider == "openai":
            text = await call_openai_compatible(
                "https://api.openai.com/v1", OPENAI_API_KEY,
                "OPENAI_API_KEY", model, req.prompt, req.max_tokens,
            )
        else:
            raise HTTPException(400, f"Неподдерживаемый провайдер: {provider}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Ошибка вызова модели: {e}")

    return EvaluateResponse(text=text, model_label=info["label"])


# === Раздача статики фронтенда (должно идти ПОСЛЕ объявления API-роутов) ===
# Папка с index.html, app.js и т.д. Подставьте свой путь, если фронт лежит в подпапке.
app.mount("/", StaticFiles(directory=".", html=True), name="static")

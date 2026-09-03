from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    DATABASE_URL: str = "sqlite:///./food_research.db"

    # AI provider — pick ONE:
    #   vertexai  : Vertex AI (ADC + GCP project must have aiplatform.user IAM role)
    #   google_ai : Google AI Studio API key (free key from aistudio.google.com)
    #   openai    : OpenAI API key
    #   anthropic : Anthropic API key
    AI_PROVIDER: str = "vertexai"

    # --- Vertex AI (ADC / service account) ---
    VERTEX_PROJECT: str = "joinagent-8467d"
    VERTEX_LOCATION: str = "us-central1"
    VERTEX_MODEL: str = "gemini-2.5-flash"

    # --- Google AI Studio (free API key, no GCP IAM needed) ---
    # Used as the fallback provider in food_extractor.py when Groq's free-tier
    # quota is exhausted (see _groq_call). gemini-2.0-flash was the original
    # default but isn't in this key's available-models list as of 2026-09-03 —
    # gemini-2.5-flash is confirmed available and, being natively multimodal,
    # covers both the text-extraction and chart-reading fallback with one model.
    GOOGLE_API_KEY: str = ""
    GOOGLE_AI_MODEL: str = "gemini-2.5-flash"

    # --- OpenAI ---
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    # --- Anthropic ---
    ANTHROPIC_API_KEY: str = ""

    # --- Groq (free tier, no billing needed) ---
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "groq/compound"
    # llama-3.3-70b-versatile was retired from Groq's catalog (confirmed via GET /v1/models
    # returning model_not_found) — switched directly to openai/gpt-oss-120b, which supports
    # json_mode/structured_outputs natively. Re-check GET /v1/models if this ever 404s again;
    # Groq's catalog has already changed once under this codebase.
    GROQ_FOOD_MODEL: str = "openai/gpt-oss-120b"
    # Vision-capable model for reading chart figures directly (replaces the old local
    # PP-Chart2Table model, which took minutes per figure on CPU-only hardware).
    GROQ_VISION_MODEL: str = "qwen/qwen3.8-27b"

    AI_MAX_TOKENS: int = 16384

    MAX_UPLOAD_SIZE_MB: int = 50
    MAX_PAPERS_PER_UPLOAD: int = 10
    UPLOAD_DIR: str = "uploads"

    # Docling / PP-Chart2Table cache directories (relative to backend root)
    DOCLING_CACHE_DIR: str = "uploads/docling_cache"
    CHART_CACHE_DIR: str = "uploads/chart_cache"
    # Bump DOCLING_CACHE_VERSION to invalidate all cached extractions
    DOCLING_CACHE_VERSION: str = "1"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

BASE_DIR = Path(__file__).resolve().parent.parent.parent
UPLOAD_PATH = BASE_DIR / settings.UPLOAD_DIR
UPLOAD_PATH.mkdir(exist_ok=True)

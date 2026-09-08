"""
Generic single-turn LLM text completion — "prompt in, text out", no JSON-row
extraction contract. Shared by the paper-summary and ask-this-paper features
so they don't each hand-roll provider dispatch; reuses the same
AI_PROVIDER/API-key configuration app/services/ai_extractor.py already uses,
kept as a separate module since that one is tightly coupled to its
schema-row extraction prompt and response parsing.
"""
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def ask_llm(system_prompt: str, user_prompt: str, max_tokens: int = 900) -> str:
    """Routes to the configured AI provider. Raises on failure — callers
    decide how to present that to the user (these are optional,
    LLM-enhanced features, not the core extraction pipeline)."""
    provider = settings.AI_PROVIDER.lower()
    dispatch = {
        "groq": _ask_groq,
        "openai": _ask_openai,
        "anthropic": _ask_anthropic,
        "google_ai": _ask_google_ai,
        "vertexai": _ask_vertexai,
    }
    if provider not in dispatch:
        raise RuntimeError(f"Unknown AI_PROVIDER '{provider}'.")
    try:
        return dispatch[provider](system_prompt, user_prompt, max_tokens)
    except Exception as exc:
        logger.error("ask_llm failed (provider=%s): %s", provider, exc, exc_info=True)
        raise


def _ask_groq(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    if not settings.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY is not set in backend/.env")
    from openai import OpenAI
    client = OpenAI(api_key=settings.GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")
    resp = client.chat.completions.create(
        model=settings.GROQ_MODEL, max_tokens=max_tokens, temperature=0.2,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return (resp.choices[0].message.content or "").strip()


def _ask_openai(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set in backend/.env")
    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    resp = client.chat.completions.create(
        model=settings.OPENAI_MODEL, max_tokens=max_tokens, temperature=0.2,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return (resp.choices[0].message.content or "").strip()


def _ask_anthropic(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not set in backend/.env")
    import anthropic
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    msg = client.messages.create(
        model="claude-sonnet-4-6", max_tokens=max_tokens, system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return msg.content[0].text.strip() if msg.content else ""


def _ask_google_ai(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    if not settings.GOOGLE_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY is not set in backend/.env")
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    config = types.GenerateContentConfig(max_output_tokens=max_tokens, temperature=0.2,
                                          system_instruction=system_prompt)
    resp = client.models.generate_content(model=settings.GOOGLE_AI_MODEL, contents=user_prompt, config=config)
    return (resp.text or "").strip()


def _ask_vertexai(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    from google import genai
    from google.genai import types
    client = genai.Client(vertexai=True, project=settings.VERTEX_PROJECT, location=settings.VERTEX_LOCATION)
    config = types.GenerateContentConfig(max_output_tokens=max_tokens, temperature=0.2,
                                          system_instruction=system_prompt)
    resp = client.models.generate_content(model=settings.VERTEX_MODEL, contents=user_prompt, config=config)
    return (resp.text or "").strip()

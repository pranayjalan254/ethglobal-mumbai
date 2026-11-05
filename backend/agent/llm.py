"""
LLM client initialization for Groq.
"""

from __future__ import annotations

import logging
from typing import Optional
from langchain_groq import ChatGroq

from config import DEFAULT_GROQ_MODEL, GROQ_API_KEY, GROQ_FALLBACK_MODELS

logger = logging.getLogger(__name__)


def get_groq_llm(
    model: Optional[str] = None,
    temperature: float = 0.1,
) -> ChatGroq:
    """
    Instantiate a ChatGroq LLM instance.

    Uses model specified or DEFAULT_GROQ_MODEL, configured with low temperature
    for deterministic schema and JSON extraction.
    """
    model_name = model or DEFAULT_GROQ_MODEL
    return ChatGroq(
        model=model_name,
        temperature=temperature,
        groq_api_key=GROQ_API_KEY,
        max_retries=2,
    )


def test_groq_connection() -> str:
    """Verify Groq API connectivity and return the active model name."""
    for candidate in GROQ_FALLBACK_MODELS:
        try:
            llm = get_groq_llm(model=candidate)
            response = llm.invoke("ping")
            if response.content:
                return candidate
        except Exception as e:
            logger.warning("Groq model %s failed: %s", candidate, e)
    raise RuntimeError("No Groq model could be reached with the current API key.")

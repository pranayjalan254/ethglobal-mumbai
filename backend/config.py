"""
Configuration module for SlotPay Backend.
Reads environment variables from .env without requiring third-party dotenv dependencies.
"""

from __future__ import annotations

import os
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent / ".env"

def load_env_file(path: Path) -> None:
    """Load key-value pairs from .env into os.environ if not already set."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'\"")
        os.environ.setdefault(key, value)

load_env_file(ENV_PATH)

# Groq settings
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
# Primary model tested on the current Groq API tier
DEFAULT_GROQ_MODEL: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
# Fallback models available on this tier if primary is busy or unavailable
GROQ_FALLBACK_MODELS: list[str] = [
    DEFAULT_GROQ_MODEL,
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-20b",
    "llama-3.3-70b-versatile",
]

# Canonical SlotPay service categories
CATEGORIES: list[str] = [
    "Engineering",
    "Security",
    "Design",
    "Legal",
    "Research",
    "Finance",
]

DEFAULT_CURRENCY: str = "HBAR"

# Arkiv settings
ARKIV_RABDI_RPC: str = os.getenv("ARKIV_RABDI_RPC", "https://rpc.rabdi.db-chain.testnet.arkiv.network")
ARKIV_ACCESS_KEY: str = os.getenv("ARKIV_ACCESS_KEY", "")
ARKIV_PLATFORM_WALLET: str = os.getenv("ARKIV_PLATFORM_WALLET", "")
ARKIV_PLATFORM_PRIVATE_KEY: str = os.getenv("ARKIV_PLATFORM_PRIVATE_KEY", "")


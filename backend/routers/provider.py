"""
Provider router for OASIS FastAPI backend.
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Query

from schemas.api import ProviderStatsSchema
from services.stats_service import stats_service

router = APIRouter(prefix="/api/provider", tags=["Provider"])


@router.get("/stats", response_model=ProviderStatsSchema)
def get_provider_stats(owner: Optional[str] = Query(None)) -> dict:
    """Retrieve provider dashboard analytics."""
    return stats_service.get_provider_stats(owner)


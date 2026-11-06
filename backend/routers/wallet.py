"""
Wallet router for SlotPay FastAPI backend.
"""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Query

from schemas.api import WalletTransactionSchema
from services.stats_service import stats_service

router = APIRouter(prefix="/api/wallet", tags=["Wallet"])


@router.get("/transactions", response_model=list[WalletTransactionSchema])
def get_wallet_transactions(wallet: Optional[str] = Query(None)) -> list[dict]:
    """Retrieve wallet transaction ledger entries."""
    return stats_service.get_wallet_transactions(wallet)


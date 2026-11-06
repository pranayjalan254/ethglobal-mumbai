"""
LangGraph state definitions for the SlotPay Autonomous Commerce Agent.
"""

from __future__ import annotations

from typing import Any, Optional, TypedDict
from schemas.arkiv import ArkivQueryFilter
from schemas.request import ParsedServiceRequest


class QueryParserState(TypedDict, total=False):
    """Complete State passed through the LangGraph agent nodes."""
    raw_query: str
    client_wallet: str             # Buyer/Agent wallet address
    reference_date: str            # ISO date string representing 'now'
    extracted_data: Optional[dict[str, Any]]
    parsed_request: Optional[ParsedServiceRequest]
    arkiv_filter: Optional[ArkivQueryFilter]
    validation_errors: list[str]
    needs_clarification: bool
    clarification_message: Optional[str]
    steps_executed: list[str]

    # Discovery & Selection State
    discovered_services: list[dict[str, Any]]
    selected_service: Optional[dict[str, Any]]
    selected_slot: Optional[dict[str, Any]]

    # Hedera x402 Autonomous Payment State
    x402_challenge: Optional[dict[str, Any]]
    payment_settled: bool
    requires_approval: bool
    settlement_receipt: Optional[dict[str, Any]]
    confirmed_reservation: Optional[dict[str, Any]]
    error_message: Optional[str]

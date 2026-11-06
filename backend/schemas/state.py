"""
LangGraph state definitions for the OASIS Autonomous Commerce Agent.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict
from schemas.arkiv import ArkivQueryFilter
from schemas.request import ParsedServiceRequest


class QueryParserState(TypedDict, total=False):
    """Complete State passed through the LangGraph agent nodes."""
    raw_query: str
    client_wallet: str             # Buyer/Agent wallet address
    reference_date: str            # ISO date string representing 'now'
    extracted_data: Optional[Dict[str, Any]]
    parsed_request: Optional[ParsedServiceRequest]
    arkiv_filter: Optional[ArkivQueryFilter]
    validation_errors: List[str]
    needs_clarification: bool
    clarification_message: Optional[str]
    steps_executed: List[str]

    # Discovery & Selection State
    discovered_services: List[Dict[str, Any]]
    selected_service: Optional[Dict[str, Any]]
    selected_slot: Optional[Dict[str, Any]]

    # Hedera x402 Autonomous Payment State
    x402_challenge: Optional[Dict[str, Any]]
    payment_settled: bool
    requires_approval: bool
    settlement_receipt: Optional[Dict[str, Any]]
    confirmed_reservation: Optional[Dict[str, Any]]
    error_message: Optional[str]

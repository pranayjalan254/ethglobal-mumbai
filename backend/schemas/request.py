"""
Parsed service request, agent decisions, and x402 booking schemas.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field

from schemas.arkiv import ArkivQueryFilter, Currency


class AgentAction(str, Enum):
    AUTO_BOOK = "auto_book"
    SEARCH_AND_RECOMMEND = "search_and_recommend"
    BROWSE = "browse"


class SelectionStrategy(str, Enum):
    BEST_AVAILABLE = "best_available"
    LOWEST_PRICE = "lowest_price"
    HIGHEST_RATING = "highest_rating"
    EARLIEST_SLOT = "earliest_slot"


class AgentDecision(BaseModel):
    """How the autonomous agent should act on the discovered Arkiv services."""
    action: AgentAction = Field(
        AgentAction.SEARCH_AND_RECOMMEND,
        description="Whether to auto-book, recommend, or just list matching services",
    )
    auto_approve_budget: Optional[float] = Field(
        None,
        description="Maximum spending amount authorized for automatic Hedera x402 checkout",
    )
    selection_strategy: SelectionStrategy = Field(
        SelectionStrategy.BEST_AVAILABLE,
        description="Criteria used to rank and pick provider from Arkiv search results",
    )
    require_confirmation: bool = Field(
        False,
        description="Whether user wants an approval gate before payment settlement",
    )
    reasoning: Optional[str] = Field(
        None,
        description="Explanation of parsed intent and decision rationale",
    )


class ParsedServiceRequest(BaseModel):
    """Complete structured output produced from the user's natural language input."""
    raw_query: str = Field(..., description="Original user prompt")
    arkiv_filter: ArkivQueryFilter = Field(..., description="Arkiv database query criteria")
    agent_decision: AgentDecision = Field(..., description="Agent workflow & booking decisions")
    summary: str = Field(..., description="Human-readable summary of the interpreted request")
    is_actionable: bool = Field(
        True,
        description="True if enough details exist to run the Arkiv search; False if clarification needed",
    )
    missing_fields: list[str] = Field(
        default_factory=list,
        description="List of helpful missing fields if query was incomplete or ambiguous",
    )


# =====================================================================
# x402 Hedera Booking & Slot Burn Schemas
# =====================================================================

class SlotPublishRequest(BaseModel):
    """
    Request from seller to unblock a slot on Arkiv.
    By default, all slots are blocked. Calling this publishes an ArkivSlotEntity.
    """
    service_id: str = Field(..., description="Target service entity key")
    start_time: int = Field(..., description="Unix epoch timestamp in seconds")
    duration_min: int = Field(60, gt=0, description="Session length in minutes")


class SlotBookingRequest(BaseModel):
    """
    Agent/Buyer request to book an open slot.
    Triggers an HTTP 402 Payment Required response with Hedera payment parameters.
    """
    service_id: str = Field(..., description="Service entity key")
    slot_entity_key: str = Field(..., description="Arkiv slot entity key being booked")
    buyer_wallet: str = Field(..., description="Buyer or AI agent's Hedera / EVM wallet address")
    slot_start: int = Field(..., description="Unix epoch timestamp of the slot")


class X402PaymentRequirement(BaseModel):
    """
    HTTP 402 response payload compliant with Hedera x402 specification.
    Returned to the client when requesting to book a slot.
    """
    status: int = Field(402, description="HTTP status code (402 Payment Required)")
    scheme: str = Field("exact", description="x402 scheme")
    amount: str = Field(..., description="Quoted price (e.g. '18.00')")
    token: str = Field("USDC (0.0.456858)", description="Token specification (USDC or HBAR)")
    network: str = Field("hedera-testnet", description="Target Hedera network")
    pay_to: str = Field(..., description="Provider's Hedera Account ID (0.0.xxxxx)")
    facilitator: str = Field("https://x402.org/facilitator", description="Hedera x402 facilitator endpoint")
    resource: str = Field(..., description="Booking endpoint path being accessed")
    max_timeout_seconds: int = Field(300, description="Quote validity period (5 minutes)")
    slot_entity_key: str = Field(..., description="Slot reserved during checkout")


class BookingConfirmation(BaseModel):
    """
    Confirmation receipt returned once payment settles on Hedera.
    The slot entity has now been deleted from Arkiv (reverting to blocked).
    """
    booking_ref: str = Field(..., description="Human-readable booking reference (e.g. SP-49F12A)")
    service_id: str = Field(..., description="Service entity key")
    provider: str = Field(..., description="Provider name or address")
    buyer: str = Field(..., description="Buyer name or address")
    start_time: int = Field(..., description="Booked session start timestamp")
    amount: float = Field(..., description="Total amount paid")
    currency: Currency = Field(Currency.USDC, description="Settlement currency")
    hedera_tx_id: str = Field(..., description="Settled Hedera transaction ID")
    hashscan_url: str = Field(..., description="HashScan testnet explorer URL")
    burned_slot_key: str = Field(..., description="Arkiv slot entity key that was deleted")
    receipt_entity_key: Optional[str] = Field(None, description="Arkiv receipt entity key if logged")

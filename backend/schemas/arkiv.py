"""
Arkiv database query and entity schemas for SlotPay.

Arkiv acts as the open, wallet-owned service-discovery and availability database.
Under the Option B "Vanish / Burn" architecture:
1. All slots for a seller are BLOCKED by default (zero entities in Arkiv).
2. Only when a seller publishes their availability does an ArkivSlotEntity get created.
3. Once a slot is booked & paid via Hedera x402, the seller backend immediately
   deletes the entity (deleteEntity), reverting the slot back to blocked.
4. If a slot is not booked before its start time, Arkiv's native TTL (expiresAt)
   automatically purges it.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


class ProviderType(str, Enum):
    HUMAN = "human"
    AI = "ai"
    ANY = "any"


class Currency(str, Enum):
    USDC = "USDC"
    HBAR = "HBAR"


class TimeWindow(BaseModel):
    """Scheduling & availability preferences for slot matching."""
    target_date: Optional[str] = Field(
        None,
        description="Target date in YYYY-MM-DD or relative terms like 'tomorrow', 'today', 'this week'",
    )
    resolved_date: Optional[str] = Field(
        None,
        description="Calculated ISO-8601 date string (YYYY-MM-DD) resolved from relative terms",
    )
    time_of_day: Optional[str] = Field(
        None,
        description="Time of day preference: 'morning', 'afternoon', 'evening', or specific hour like '14:00'",
    )
    urgency: str = Field(
        "flexible",
        description="'immediate' (today/ASAP), 'scheduled' (specific date), or 'flexible'",
    )


class ArkivQueryFilter(BaseModel):
    """
    Structured query filter to search services on the Arkiv open database.
    Directly aligns with the SlotPay ServiceQuery structure.
    """
    q: Optional[str] = Field(
        None,
        description="Full-text search query across titles, descriptions, and tags",
    )
    category: Optional[str] = Field(
        None,
        description="Category: Engineering, Security, Design, Legal, Research, or Finance",
    )
    skills: list[str] = Field(
        default_factory=list,
        description="List of required technical skills or topics (e.g. ['Python', 'FastAPI'])",
    )
    provider_type: ProviderType = Field(
        ProviderType.ANY,
        description="Type of provider desired: human, ai, or any",
    )
    provider_name: Optional[str] = Field(
        None,
        description="Specific provider or organization name if requested by the user",
    )
    min_price: Optional[float] = Field(
        None,
        ge=0,
        description="Minimum price in currency units",
    )
    max_price: Optional[float] = Field(
        None,
        ge=0,
        description="Maximum price budget in currency units (e.g. 20.0 for '$20')",
    )
    currency: Currency = Field(
        Currency.USDC,
        description="Payment currency: USDC or HBAR",
    )
    duration_min: Optional[int] = Field(
        None,
        gt=0,
        description="Required service session duration in minutes (e.g. 60 for 1-hour consultation)",
    )
    time_window: Optional[TimeWindow] = Field(
        None,
        description="Availability and appointment date/time constraints",
    )

    def to_arkiv_params(self) -> dict[str, Any]:
        """Convert into query dictionary compatible with Arkiv client & frontend API."""
        params: dict[str, Any] = {}
        if self.q:
            params["q"] = self.q
        if self.category:
            params["category"] = self.category
        if self.skills:
            params["skills"] = self.skills
        if self.provider_type != ProviderType.ANY:
            params["provider_type"] = self.provider_type.value
        if self.provider_name:
            params["provider_name"] = self.provider_name
        if self.min_price is not None:
            params["min_price"] = self.min_price
        if self.max_price is not None:
            params["max_price"] = self.max_price
        params["currency"] = self.currency.value
        if self.duration_min is not None:
            params["duration_min"] = self.duration_min
        if self.time_window:
            params["date"] = self.time_window.resolved_date or self.time_window.target_date
            if self.time_window.time_of_day:
                params["time_of_day"] = self.time_window.time_of_day
        return params


# =====================================================================
# Arkiv Native Entity Schemas (SlotPay-Owned Reservation Architecture)
# =====================================================================

class ReservationStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"


class ArkivReservationEntity(BaseModel):
    """
    SlotPay-owned Reservation Entity registered on Arkiv.
    Arkiv Schema: 'slotpay.reservation.v1'

    ARCHITECTURE:
    - Providers own and publish AvailabilitySlot entities.
    - SlotPay platform wallet owns and publishes SlotReservation entities.
    - SlotPay never modifies or deletes provider-owned entities.
    - Marketplaces determine availability by combining provider-owned availability records
      with active SlotPay reservation records.
    - Unexpired pending claims (5-minute TTL) temporarily hold the slot.
    - Confirmed reservations remain active until the appointment has passed.
    """
    type: str = Field("slot_reservation", description="Entity type tag")
    reservationId: str = Field(..., description="Unique reservation identifier")
    slotId: str = Field(..., description="Referenced availability slot ID")
    availabilityEntityKey: str = Field(..., description="Reference to provider's availability entity")
    providerId: str = Field(..., description="Provider ID or wallet address")
    customerWallet: str = Field(..., description="Customer/agent wallet address")
    status: ReservationStatus = Field(ReservationStatus.PENDING, description="pending or confirmed")
    paymentTransactionId: Optional[str] = Field(None, description="Hedera tx ID once payment settles")
    createdAt: str = Field(..., description="Creation ISO-8601 timestamp")
    confirmedAt: Optional[str] = Field(None, description="Confirmation ISO-8601 timestamp")
    expiresAt: Optional[str] = Field(None, description="Expiration timestamp (TTL)")


class ArkivServiceEntity(BaseModel):
    """
    Service Listing Entity registered on Arkiv.
    Arkiv Tag: 'slotpay:service:v1'
    """
    entity_key: Optional[str] = Field(None, description="Unique Arkiv entity key (0x...)")
    tag: str = Field("slotpay:service:v1", description="Arkiv schema tag")
    provider_address: str = Field(..., description="Provider wallet address / Hedera Account ID")
    title: str = Field(..., description="Service title")
    category: str = Field(..., description="Category (Engineering, Security, Design, Legal, etc.)")
    skills: list[str] = Field(default_factory=list, description="Searchable skill tags (indexed)")
    price: float = Field(..., ge=0, description="Rate per session")
    currency: Currency = Field(Currency.USDC, description="Settlement token: USDC or HBAR")
    duration_min: int = Field(..., gt=0, description="Duration in minutes (e.g. 30, 60, 90)")
    provider_type: ProviderType = Field(ProviderType.HUMAN, description="human or ai")
    description: str = Field("", description="Detailed offering description (unindexed)")
    swarm_ref: Optional[str] = Field(None, description="Swarm bzz:// hash for portfolio documents")
    expires_at: Optional[int] = Field(None, description="Arkiv listing TTL in epoch seconds")


class ArkivSlotEntity(BaseModel):
    """
    Available Time Slot Entity registered on Arkiv.
    Arkiv Tag: 'slotpay:slot:v1'

    ARCHITECTURE NOTE (Provider-Owned Availability):
    - Providers own and publish their AvailabilitySlot entities.
    - SlotPay does not modify or delete these provider-owned records.
    - SlotPay determines availability by checking against SlotPay-owned SlotReservation entities.
    """
    entity_key: Optional[str] = Field(None, description="Unique Arkiv slot entity key (0x...)")
    tag: str = Field("slotpay:slot:v1", description="Arkiv schema tag")
    service_id: str = Field(..., description="Foreign key to the parent ArkivServiceEntity key")
    provider_address: str = Field(..., description="Provider wallet address")
    start_time: int = Field(..., description="Unix epoch timestamp (seconds) when session starts")
    duration_min: int = Field(60, gt=0, description="Session duration in minutes")
    expires_at: int = Field(
        ...,
        description="Arkiv TTL deadline",
    )


class ArkivBookingReceiptEntity(BaseModel):
    """
    Settlement & Booking Receipt recorded after Hedera x402 payment settles.
    Arkiv Tag: 'slotpay:receipt:v1'
    """
    entity_key: Optional[str] = Field(None, description="Unique Arkiv receipt entity key (0x...)")
    tag: str = Field("slotpay:receipt:v1", description="Arkiv schema tag")
    service_id: str = Field(..., description="Service entity key")
    provider_address: str = Field(..., description="Provider Hedera account (payTo)")
    buyer_address: str = Field(..., description="Buyer / Agent account that paid")
    slot_time: int = Field(..., description="Unix timestamp of the booked session")
    amount: float = Field(..., ge=0, description="Amount paid")
    currency: Currency = Field(Currency.USDC, description="Payment currency (USDC or HBAR)")
    hedera_tx_id: str = Field(..., description="Hedera testnet transaction ID (e.g. 0.0.400123@173000.1)")
    hashscan_url: str = Field(..., description="Direct HashScan explorer URL for verification")
    created_at: int = Field(..., description="Unix timestamp when payment confirmed")

"""
Arkiv database query schemas for SlotPay.

Arkiv acts as the open, wallet-owned service-discovery database.
These schemas represent query constraints to filter services,
providers, and availability slots published on the Arkiv layer.
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


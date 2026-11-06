"""
Pydantic schemas for the SlotPay FastAPI REST and SSE endpoints.
Matches the SlotPay frontend TypeScript interfaces.
"""

from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


ProviderType = Literal["human", "ai"]
Currency = Literal["USDC", "HBAR"]
ServiceStatus = Literal["draft", "published", "expired"]
SlotStatus = Literal["open", "claimed", "booked", "expired"]
BookingStatus = Literal["confirmed", "completed", "pending", "cancelled"]
StepState = Literal["pending", "running", "complete", "failed", "awaiting"]
AgentStepId = Literal["understand", "discover", "compare", "claim", "pay", "confirm"]


class SwarmDoc(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str
    swarmRef: str = Field(..., alias="swarmRef")


class ProviderSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    name: str
    type: ProviderType
    headline: str
    bio: str
    wallet: str
    rating: float = 5.0
    reviews: int = 0
    credentials: list[str] = Field(default_factory=list)
    documents: list[SwarmDoc] = Field(default_factory=list)


class ServiceSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    title: str
    category: str
    skills: list[str] = Field(default_factory=list)
    description: str
    price: float
    currency: Currency = "HBAR"
    durationMin: int = Field(60, alias="durationMin")
    provider: ProviderSchema
    status: ServiceStatus = "published"
    entityKey: Optional[str] = Field(None, alias="entityKey")
    expiresAt: Optional[str] = Field(None, alias="expiresAt")
    nextSlot: str = Field(..., alias="nextSlot")
    location: Literal["remote"] = "remote"


class ServiceInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    title: str
    category: str
    skills: list[str] = Field(default_factory=list)
    description: str = ""
    price: float
    currency: Currency = "HBAR"
    durationMin: int = Field(60, alias="durationMin")
    providerType: ProviderType = Field("human", alias="providerType")
    owner: Optional[str] = None
    swarmRef: Optional[str] = Field(None, alias="swarmRef")


class LinkSwarmInput(BaseModel):
    owner: Optional[str] = None
    filename: str = "document.pdf"
    swarm_ref: str


class ServicePublishInput(BaseModel):
    days: int = 30
    entity_key: Optional[str] = None
    tx_ref: Optional[str] = None


class ServicePublishResponse(BaseModel):
    entity_key: str
    tx_ref: str
    expires_at: str


class ServiceRenewInput(BaseModel):
    days: int = 30


class ServiceRenewResponse(BaseModel):
    expires_at: str


class SlotSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    serviceId: Optional[str] = Field(None, alias="serviceId")
    start: str
    durationMin: int = Field(60, alias="durationMin")
    status: SlotStatus = "open"
    claimExpiresAt: Optional[str] = Field(None, alias="claimExpiresAt")
    txId: Optional[str] = Field(None, alias="txId")
    bookingRef: Optional[str] = Field(None, alias="bookingRef")
    reservationId: Optional[str] = Field(None, alias="reservationId")
    cellKey: Optional[str] = Field(None, alias="cellKey")


class ClaimSlotResponse(BaseModel):
    claim_id: str
    expires_at: str


class AvailabilityPublishInput(BaseModel):
    cells: list[str]
    owner: Optional[str] = None
    entity_key: Optional[str] = None
    tx_ref: Optional[str] = None


class AvailabilityPublishResponse(BaseModel):
    entity_key: str
    count: int


class PaymentRequirementsSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    status: int = 402
    scheme: str = "exact"
    amount: str
    token: str
    network: str
    payTo: str = Field(..., alias="payTo")
    feePayer: str = Field("0.0.9185802", alias="feePayer")
    facilitator: str
    resource: str
    maxTimeoutSeconds: int = Field(300, alias="maxTimeoutSeconds")


class BookingCreateInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    serviceId: Optional[str] = Field(None, alias="serviceId")
    slotId: Optional[str] = Field(None, alias="slotId")
    buyerWallet: Optional[str] = Field(None, alias="buyerWallet")
    # Also support passing the full service object or slot_id
    service: Optional[dict[str, Any]] = None
    slot_id: Optional[str] = None


class BookingCreateResponse(BaseModel):
    booking_id: str
    payment: PaymentRequirementsSchema


class BookingConfirmInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    serviceId: Optional[str] = Field(None, alias="serviceId")
    slotStart: Optional[str] = Field(None, alias="slotStart")
    txIdOverride: Optional[str] = Field(None, alias="txIdOverride")
    txId: Optional[str] = Field(None, alias="txId")
    service: Optional[dict[str, Any]] = None
    buyer: Optional[str] = "You"


class ReceiptSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    bookingRef: str = Field(..., alias="bookingRef")
    provider: str
    providerType: ProviderType = Field(..., alias="providerType")
    service: str
    start: str
    amount: float
    currency: Currency
    txId: str = Field(..., alias="txId")
    hcsUrl: Optional[str] = Field(None, alias="hcsUrl")


class BookingSchema(ReceiptSchema):
    id: str
    buyer: str
    status: BookingStatus = "confirmed"


class ProviderStatsSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    publishedServices: int = Field(..., alias="publishedServices")
    upcomingBookings: int = Field(..., alias="upcomingBookings")
    earningsUsdc: float = Field(..., alias="earningsUsdc")
    profileViews: int = Field(..., alias="profileViews")


class WalletTransactionSchema(BaseModel):
    id: str
    label: str
    amount: float
    currency: str
    at: str


class AgentStepSchema(BaseModel):
    id: AgentStepId
    index: int
    title: str = ""
    state: StepState
    detail: Optional[dict[str, Any]] = None


class AgentChatRequest(BaseModel):
    message: str
    limit: float = 50.0
    autoApprove: bool = True
    clientWallet: Optional[str] = "0x71c2a0b3c4e5f61a2b3f4e5d6c7b8a9f0e1d2c3b"


class AgentEventSchema(BaseModel):
    type: Literal["text", "step", "approval", "done", "error"]
    text: Optional[str] = None
    step: Optional[AgentStepSchema] = None
    receipt: Optional[ReceiptSchema] = None

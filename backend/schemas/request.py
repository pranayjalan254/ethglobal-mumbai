"""
Parsed service request and agent decision schemas.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field

from schemas.arkiv import ArkivQueryFilter


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


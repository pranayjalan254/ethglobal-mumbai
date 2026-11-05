"""
LangGraph state definitions for the Query Parser Agent.
"""

from __future__ import annotations

from typing import Any, Optional, TypedDict
from schemas.arkiv import ArkivQueryFilter
from schemas.request import ParsedServiceRequest


class QueryParserState(TypedDict, total=False):
    """State passed through the LangGraph nodes during query parsing."""
    raw_query: str
    reference_date: str            # ISO date string representing 'now' for relative date computation
    extracted_data: Optional[dict[str, Any]]
    parsed_request: Optional[ParsedServiceRequest]
    arkiv_filter: Optional[ArkivQueryFilter]
    validation_errors: list[str]
    needs_clarification: bool
    clarification_message: Optional[str]
    steps_executed: list[str]


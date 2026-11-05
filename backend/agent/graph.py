"""
LangGraph StateGraph assembly for the SlotPay Natural Language Query Parser.
"""

from __future__ import annotations

import logging
from typing import Literal, Optional

from langgraph.graph import END, START, StateGraph

from agent.nodes import (
    clarification_node,
    llm_extraction,
    normalize_and_validate,
    preprocess_input,
)
from schemas.request import ParsedServiceRequest
from schemas.state import QueryParserState

logger = logging.getLogger(__name__)


def _route_after_preprocess(state: QueryParserState) -> Literal["clarification", "llm_extract"]:
    if state.get("needs_clarification"):
        return "clarification"
    return "llm_extract"


def _route_after_validate(state: QueryParserState) -> Literal["clarification", "__end__"]:
    if state.get("needs_clarification"):
        return "clarification"
    return END


def create_query_parser_graph() -> StateGraph:
    """Build the compiled LangGraph workflow."""
    workflow = StateGraph(QueryParserState)

    # Add processing nodes
    workflow.add_node("preprocess", preprocess_input)
    workflow.add_node("llm_extract", llm_extraction)
    workflow.add_node("normalize_validate", normalize_and_validate)
    workflow.add_node("clarification", clarification_node)

    # Connect nodes
    workflow.add_edge(START, "preprocess")
    workflow.add_conditional_edges(
        "preprocess",
        _route_after_preprocess,
        {
            "clarification": "clarification",
            "llm_extract": "llm_extract",
        },
    )
    workflow.add_edge("llm_extract", "normalize_validate")
    workflow.add_conditional_edges(
        "normalize_validate",
        _route_after_validate,
        {
            "clarification": "clarification",
            END: END,
        },
    )
    workflow.add_edge("clarification", END)

    return workflow.compile()


# Singleton compiled graph instance
query_parser_agent = create_query_parser_graph()


def parse_service_query(
    query: str,
    reference_date: Optional[str] = None,
) -> ParsedServiceRequest:
    """
    High-level entrypoint for parsing a natural language query into an Arkiv query object.

    Args:
        query: Natural language string, e.g.
               "Find me a Python developer available tomorrow for a one-hour consultation under $20. Choose the best available option and book it."
        reference_date: Optional context date string (e.g. "2026-11-05 (Thursday)")

    Returns:
        ParsedServiceRequest with ArkivQueryFilter and AgentDecision.
    """
    initial_state: QueryParserState = {
        "raw_query": query,
        "reference_date": reference_date or "",
        "steps_executed": [],
    }

    final_state = query_parser_agent.invoke(initial_state)

    parsed = final_state.get("parsed_request")
    if parsed:
        return parsed

    # Return fallback object if clarification was triggered
    from schemas.arkiv import ArkivQueryFilter
    from schemas.request import AgentAction, AgentDecision, SelectionStrategy

    return ParsedServiceRequest(
        raw_query=query,
        arkiv_filter=ArkivQueryFilter(q=query),
        agent_decision=AgentDecision(
            action=AgentAction.SEARCH_AND_RECOMMEND,
            selection_strategy=SelectionStrategy.BEST_AVAILABLE,
            reasoning=final_state.get("clarification_message"),
        ),
        summary=final_state.get("clarification_message") or "Query requires clarification",
        is_actionable=False,
        missing_fields=["more_details"],
    )


"""
LangGraph StateGraph assembly for the SlotPay Autonomous Commerce Agent.
Integrates Arkiv open service discovery and Hedera x402 autonomous payments.
"""

from __future__ import annotations

import logging
from typing import Any, Literal, Optional

from langgraph.graph import END, START, StateGraph

from agent.nodes import (
    claim_slot,
    clarification_node,
    compare_and_select,
    discover_arkiv,
    execute_x402_payment,
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


def _route_after_validate(state: QueryParserState) -> Literal["clarification", "discover_arkiv"]:
    if state.get("needs_clarification"):
        return "clarification"
    return "discover_arkiv"


def _route_after_compare(state: QueryParserState) -> Literal["claim_slot", "__end__"]:
    if not state.get("selected_service"):
        return END
    return "claim_slot"


def create_autonomous_agent_graph() -> StateGraph:
    """Build the compiled LangGraph workflow with Arkiv discovery and Hedera x402 payment."""
    workflow = StateGraph(QueryParserState)

    # 1. Processing nodes
    workflow.add_node("preprocess", preprocess_input)
    workflow.add_node("llm_extract", llm_extraction)
    workflow.add_node("normalize_validate", normalize_and_validate)
    workflow.add_node("clarification", clarification_node)

    # 2. Autonomous commerce nodes
    workflow.add_node("discover_arkiv", discover_arkiv)
    workflow.add_node("compare_and_select", compare_and_select)
    workflow.add_node("claim_slot", claim_slot)
    workflow.add_node("execute_x402_payment", execute_x402_payment)

    # 3. Graph edges
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
            "discover_arkiv": "discover_arkiv",
        },
    )
    workflow.add_edge("discover_arkiv", "compare_and_select")
    workflow.add_conditional_edges(
        "compare_and_select",
        _route_after_compare,
        {
            "claim_slot": "claim_slot",
            END: END,
        },
    )
    workflow.add_edge("claim_slot", "execute_x402_payment")
    workflow.add_edge("execute_x402_payment", END)
    workflow.add_edge("clarification", END)

    return workflow.compile()


# Compiled Singleton Graph
autonomous_agent_workflow = create_autonomous_agent_graph()


def parse_service_query(
    query: str,
    reference_date: Optional[str] = None,
) -> ParsedServiceRequest:
    """Entrypoint for parsing query and generating Arkiv query criteria."""
    initial_state: QueryParserState = {
        "raw_query": query,
        "reference_date": reference_date or "",
        "steps_executed": [],
    }

    final_state = autonomous_agent_workflow.invoke(initial_state)

    parsed = final_state.get("parsed_request")
    if parsed:
        return parsed

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


def execute_autonomous_agent(
    query: str,
    client_wallet: str = "0x71c2a0b3c4e5f61a2b3f4e5d6c7b8a9f0e1d2c3b",
    reference_date: Optional[str] = None,
) -> QueryParserState:
    """
    Execute complete end-to-end autonomous flow:
    Understand -> Arkiv Discover -> Compare & Pick -> Claim Slot -> Hedera x402 Pay -> Confirm.
    """
    initial_state: QueryParserState = {
        "raw_query": query,
        "client_wallet": client_wallet,
        "reference_date": reference_date or "",
        "steps_executed": [],
    }

    return autonomous_agent_workflow.invoke(initial_state)

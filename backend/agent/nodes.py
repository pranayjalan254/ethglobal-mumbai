"""
LangGraph nodes for parsing, validating, and enriching natural language service queries.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import json
import logging
import re
from typing import Any

from langchain_core.output_parsers import JsonOutputParser

from agent.llm import get_groq_llm
from agent.prompts import QUERY_PARSER_PROMPT
from config import CATEGORIES, DEFAULT_CURRENCY, GROQ_FALLBACK_MODELS
from schemas.arkiv import ArkivQueryFilter, Currency, ProviderType, TimeWindow
from schemas.request import AgentAction, AgentDecision, ParsedServiceRequest, SelectionStrategy
from schemas.state import QueryParserState

logger = logging.getLogger(__name__)


def preprocess_input(state: QueryParserState) -> dict[str, Any]:
    """Validate query presence and attach temporal reference context."""
    raw = (state.get("raw_query") or "").strip()
    ref_date = state.get("reference_date") or datetime.now().strftime("%Y-%m-%d (%A)")
    steps = list(state.get("steps_executed") or [])
    steps.append("preprocess_input")

    errors: list[str] = []
    if not raw:
        errors.append("Empty query received.")

    return {
        "raw_query": raw,
        "reference_date": ref_date,
        "validation_errors": errors,
        "needs_clarification": bool(errors),
        "steps_executed": steps,
    }


def llm_extraction(state: QueryParserState) -> dict[str, Any]:
    """Invoke Groq LLM to extract structured entities from natural language."""
    steps = list(state.get("steps_executed") or [])
    steps.append("llm_extraction")

    raw_query = state.get("raw_query", "")
    ref_date = state.get("reference_date", "")

    # Quick short-circuit for empty input
    if not raw_query:
        return {
            "extracted_data": {},
            "steps_executed": steps,
        }

    parser = JsonOutputParser()
    extracted: dict[str, Any] = {}
    last_err: Optional[Exception] = None

    for model_name in GROQ_FALLBACK_MODELS:
        try:
            llm = get_groq_llm(model=model_name)
            chain = QUERY_PARSER_PROMPT | llm | parser
            extracted = chain.invoke({
                "input": raw_query,
                "reference_date": ref_date,
            })
            if extracted and isinstance(extracted, dict):
                break
        except Exception as e:
            last_err = e
            # Try raw text regex recovery on same model
            try:
                llm = get_groq_llm(model=model_name)
                raw_res = (QUERY_PARSER_PROMPT | llm).invoke({
                    "input": raw_query,
                    "reference_date": ref_date,
                })
                text = str(raw_res.content)
                match = re.search(r"\{.*\}", text, re.DOTALL)
                if match:
                    extracted = json.loads(match.group(0))
                    break
            except Exception:
                continue

    if not extracted and last_err:
        extracted = {"raw_error": str(last_err), "is_actionable": False}

    return {
        "extracted_data": extracted,
        "steps_executed": steps,
    }


def _resolve_relative_date(target: Optional[str], ref_str: str) -> Optional[str]:
    """Resolve relative words like 'tomorrow', 'today', 'this week' to YYYY-MM-DD."""
    if not target:
        return None

    t = target.strip().lower()
    try:
        # Extract base date if ref_str contains extra weekday name like "2026-11-05 (Thursday)"
        base_date_match = re.search(r"\d{4}-\d{2}-\d{2}", ref_str)
        ref_dt = datetime.strptime(base_date_match.group(0), "%Y-%m-%d") if base_date_match else datetime.now()
    except Exception:
        ref_dt = datetime.now()

    if "tomorrow" in t:
        return (ref_dt + timedelta(days=1)).strftime("%Y-%m-%d")
    if "today" in t:
        return ref_dt.strftime("%Y-%m-%d")
    if "yesterday" in t:
        return (ref_dt - timedelta(days=1)).strftime("%Y-%m-%d")
    if "next week" in t:
        return (ref_dt + timedelta(days=7)).strftime("%Y-%m-%d")
    if re.match(r"^\d{4}-\d{2}-\d{2}$", target.strip()):
        return target.strip()

    return None


def _normalize_category(cat: Optional[str]) -> Optional[str]:
    """Map arbitrary category strings to canonical SlotPay categories."""
    if not cat:
        return None
    c = cat.strip().lower()
    for canonical in CATEGORIES:
        if canonical.lower() in c or c in canonical.lower():
            return canonical
    if any(k in c for k in ["software", "code", "dev", "python", "backend", "frontend", "api"]):
        return "Engineering"
    if any(k in c for k in ["audit", "solidity", "smart contract", "crypto", "hack", "vuln"]):
        return "Security"
    if any(k in c for k in ["ux", "ui", "product", "graphic", "accessibility"]):
        return "Design"
    if any(k in c for k in ["contract", "compliance", "law", "attorney", "terms"]):
        return "Legal"
    if any(k in c for k in ["brief", "market", "paper", "literature", "report"]):
        return "Research"
    if any(k in c for k in ["accounting", "tax", "ledger", "bookkeeping", "reconciliation"]):
        return "Finance"
    return CATEGORIES[0]


def normalize_and_validate(state: QueryParserState) -> dict[str, Any]:
    """Sanitize, normalize, and construct validated ArkivQueryFilter and ParsedServiceRequest."""
    steps = list(state.get("steps_executed") or [])
    steps.append("normalize_and_validate")

    data = state.get("extracted_data") or {}
    raw_query = state.get("raw_query") or ""
    ref_date = state.get("reference_date") or ""
    errors = list(state.get("validation_errors") or [])

    is_actionable = data.get("is_actionable", True)
    if not data or not is_actionable:
        return {
            "needs_clarification": True,
            "clarification_message": "Could you provide more details about the service you are looking for, such as the skill or category?",
            "steps_executed": steps,
        }

    # 1. Parse Provider Type
    raw_ptype = str(data.get("provider_type") or "any").lower()
    ptype = ProviderType.ANY
    if "human" in raw_ptype:
        ptype = ProviderType.HUMAN
    elif "ai" in raw_ptype or "agent" in raw_ptype:
        ptype = ProviderType.AI

    # 2. Parse Category
    category = _normalize_category(data.get("category"))

    # 3. Parse Skills
    skills = [str(s).strip() for s in (data.get("skills") or []) if s]

    # 4. Parse Price & Currency
    max_price = None
    if data.get("max_price") is not None:
        try:
            max_price = float(data["max_price"])
        except (ValueError, TypeError):
            pass

    min_price = None
    if data.get("min_price") is not None:
        try:
            min_price = float(data["min_price"])
        except (ValueError, TypeError):
            pass

    curr_str = str(data.get("currency") or DEFAULT_CURRENCY).upper()
    currency = Currency.HBAR if "HBAR" in curr_str else Currency.USDC

    # 5. Parse Duration
    duration_min = None
    if data.get("duration_min") is not None:
        try:
            duration_min = int(data["duration_min"])
        except (ValueError, TypeError):
            pass

    # 6. Parse Time Preferences
    tp = data.get("time_preference") or {}
    target_date = tp.get("target_date")
    time_window = None
    if target_date or tp.get("time_of_day"):
        resolved_date = _resolve_relative_date(target_date, ref_date)
        time_window = TimeWindow(
            target_date=target_date,
            resolved_date=resolved_date,
            time_of_day=tp.get("time_of_day"),
            urgency=tp.get("urgency") or ("immediate" if target_date == "today" else "scheduled"),
        )

    # 7. Build ArkivQueryFilter
    arkiv_filter = ArkivQueryFilter(
        q=data.get("service_query") or raw_query,
        category=category,
        skills=skills,
        provider_type=ptype,
        provider_name=data.get("provider_name"),
        min_price=min_price,
        max_price=max_price,
        currency=currency,
        duration_min=duration_min,
        time_window=time_window,
    )

    # 8. Parse Action & Decision
    action_str = str(data.get("action") or "search_and_recommend").lower()
    if "auto_book" in action_str or "book" in action_str:
        action = AgentAction.AUTO_BOOK
    elif "browse" in action_str:
        action = AgentAction.BROWSE
    else:
        action = AgentAction.SEARCH_AND_RECOMMEND

    strategy_str = str(data.get("selection_strategy") or "best_available").lower()
    if "lowest" in strategy_str or "cheap" in strategy_str:
        strategy = SelectionStrategy.LOWEST_PRICE
    elif "rating" in strategy_str or "highest" in strategy_str:
        strategy = SelectionStrategy.HIGHEST_RATING
    elif "earliest" in strategy_str or "slot" in strategy_str or "soon" in strategy_str:
        strategy = SelectionStrategy.EARLIEST_SLOT
    else:
        strategy = SelectionStrategy.BEST_AVAILABLE

    auto_approve_budget = data.get("auto_approve_budget")
    if auto_approve_budget is not None:
        try:
            auto_approve_budget = float(auto_approve_budget)
        except (ValueError, TypeError):
            auto_approve_budget = max_price
    elif action == AgentAction.AUTO_BOOK:
        auto_approve_budget = max_price

    decision = AgentDecision(
        action=action,
        auto_approve_budget=auto_approve_budget,
        selection_strategy=strategy,
        require_confirmation=action != AgentAction.AUTO_BOOK,
        reasoning=f"Interpreted action '{action.value}' with strategy '{strategy.value}'."
        + (f" Pre-approved budget: {auto_approve_budget} {currency.value}." if auto_approve_budget else ""),
    )

    # 9. Build ParsedServiceRequest
    summary = data.get("summary") or f"Looking for {category or 'service'} with skills {skills}"
    missing = list(data.get("missing_information") or [])

    parsed_request = ParsedServiceRequest(
        raw_query=raw_query,
        arkiv_filter=arkiv_filter,
        agent_decision=decision,
        summary=summary,
        is_actionable=True,
        missing_fields=missing,
    )

    return {
        "parsed_request": parsed_request,
        "arkiv_filter": arkiv_filter,
        "needs_clarification": False,
        "steps_executed": steps,
    }


def clarification_node(state: QueryParserState) -> dict[str, Any]:
    """Provide a response when input was empty or too ambiguous."""
    steps = list(state.get("steps_executed") or [])
    steps.append("clarification_node")

    msg = state.get("clarification_message") or (
        "I need a bit more detail to query Arkiv. "
        "Try specifying the service you need (e.g. 'Python developer', 'UX review'), "
        "your budget, or preferred timing."
    )

    return {
        "clarification_message": msg,
        "steps_executed": steps,
    }

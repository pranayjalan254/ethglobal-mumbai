"""
LangGraph nodes for parsing, validating, and enriching natural language service queries.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import json
import logging
import re
from typing import Any, Optional

from langchain_core.output_parsers import JsonOutputParser

from agent.arkiv_client import arkiv_client
from agent.llm import get_groq_llm
from agent.prompts import QUERY_PARSER_PROMPT
from agent.x402_hedera import (
    BudgetExceededError,
    hedera_x402_engine,
)
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
        logger.info("LLM extraction failed (%s); using heuristic query parsing fallback.", last_err)
        extracted = _fallback_heuristic_extraction(raw_query, ref_date)

    return {
        "extracted_data": extracted,
        "steps_executed": steps,
    }


def _fallback_heuristic_extraction(raw_query: str, ref_date: str) -> dict[str, Any]:
    """Deterministic rule-based extractor when LLM API is unavailable or offline."""
    text = (raw_query or "").strip()
    if not text:
        return {"is_actionable": False}

    lowered = text.lower()

    # Category detection
    category = None
    if any(k in lowered for k in ["python", "software", "code", "dev", "backend", "frontend", "api", "django"]):
        category = "Engineering"
    elif any(k in lowered for k in ["audit", "solidity", "smart contract", "security", "vuln"]):
        category = "Security"
    elif any(k in lowered for k in ["ux", "ui", "design", "product flow", "accessibility"]):
        category = "Design"
    elif any(k in lowered for k in ["legal", "contract", "terms", "lawyer", "compliance"]):
        category = "Legal"
    elif any(k in lowered for k in ["research", "brief", "citations", "market"]):
        category = "Research"
    elif any(k in lowered for k in ["accounting", "finance", "reconciliation", "tax", "ledger"]):
        category = "Finance"

    # Skills detection
    skills: list[str] = []
    known_skills = [
        "Python", "FastAPI", "Pandas", "Django", "Solidity", "Hedera",
        "Security Audit", "UX", "Accessibility", "Research", "Agent Payments",
        "Market Analysis", "Accounting", "Contracts", "PostgreSQL", "Rust", "TypeScript",
    ]
    for sk in known_skills:
        if sk.lower() in lowered:
            skills.append(sk)
    if "python" in lowered and "Python" not in skills:
        skills.append("Python")

    # Provider type
    provider_type = "any"
    if any(k in lowered for k in ["developer", "consultant", "engineer", "lawyer", "designer", "human", "pairing"]):
        provider_type = "human"
    elif any(k in lowered for k in ["ai agent", "autonomous", "automated", "ai code-review"]):
        provider_type = "ai"

    # Provider name detection — extract provider name if specified like 'from <Name>' or '<Name>'
    provider_name = None
    from_match = re.search(r"\bfrom\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b", text)
    if from_match:
        provider_name = from_match.group(1)

    # Price detection ($20, under $20, up to $150, 20 USDC)
    max_price = None
    price_match = re.search(r"(?:under|below|up to|budget|max|for)\s*\$?\s*(\d+(?:\.\d+)?)", lowered)
    if not price_match:
        price_match = re.search(r"\$\s*(\d+(?:\.\d+)?)", lowered)
    if not price_match:
        price_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:usdc|dollars|usd)", lowered)
    if price_match:
        try:
            max_price = float(price_match.group(1))
        except ValueError:
            pass

    # Duration detection
    duration_min = None
    if "one-hour" in lowered or "1 hour" in lowered or "one hour" in lowered:
        duration_min = 60
    elif "30-min" in lowered or "30 min" in lowered or "half hour" in lowered:
        duration_min = 30
    elif "90-min" in lowered or "90 min" in lowered:
        duration_min = 90

    # Time preference
    target_date = None
    urgency = "flexible"
    if "tomorrow" in lowered:
        target_date = "tomorrow"
        urgency = "scheduled"
    elif "today" in lowered:
        target_date = "today"
        urgency = "immediate"
    elif "next monday" in lowered:
        target_date = "next Monday"
        urgency = "scheduled"
    elif "this week" in lowered:
        target_date = "this week"
        urgency = "flexible"

    # Action detection
    action = "search_and_recommend"
    if any(k in lowered for k in ["book it", "book and pay", "pay for it", "choose and book", "auto-book", "auto book", "book"]):
        action = "auto_book"
    elif any(k in lowered for k in ["browse", "list", "show all"]):
        action = "browse"

    # Selection strategy
    strategy = "best_available"
    if any(k in lowered for k in ["cheapest", "lowest price"]):
        strategy = "lowest_price"
    elif any(k in lowered for k in ["highest rated", "top rated"]):
        strategy = "highest_rating"
    elif any(k in lowered for k in ["earliest", "fastest", "soonest"]):
        strategy = "earliest_slot"

    auto_approve_budget = max_price if action == "auto_book" else None

    # Determine if actionable
    is_actionable = bool(
        category
        or skills
        or provider_name
        or max_price
        or any(k in lowered for k in ["developer", "audit", "review", "brief", "consultation", "service"])
    )

    return {
        "service_query": text,
        "category": category,
        "skills": skills,
        "provider_type": provider_type,
        "provider_name": provider_name,
        "max_price": max_price,
        "min_price": None,
        "currency": "USDC",
        "duration_min": duration_min,
        "time_preference": {
            "target_date": target_date,
            "time_of_day": None,
            "urgency": urgency,
        },
        "action": action,
        "selection_strategy": strategy,
        "auto_approve_budget": auto_approve_budget,
        "is_actionable": is_actionable,
        "missing_information": [] if is_actionable else ["more details"],
        "summary": f"Request for {category or 'service'} ({', '.join(skills) if skills else text})",
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


def discover_arkiv(state: QueryParserState) -> dict[str, Any]:
    """Query the Arkiv open database using the extracted ArkivQueryFilter."""
    steps = list(state.get("steps_executed") or [])
    steps.append("discover_arkiv")

    arkiv_filter = state.get("arkiv_filter")
    if not arkiv_filter:
        return {"discovered_services": [], "steps_executed": steps}

    services = arkiv_client.query_services(arkiv_filter)
    logger.info("Arkiv discovery returned %d services", len(services))

    return {
        "discovered_services": services,
        "steps_executed": steps,
    }


def compare_and_select(state: QueryParserState) -> dict[str, Any]:
    """Rank discovered Arkiv services and select best candidate based on strategy."""
    steps = list(state.get("steps_executed") or [])
    steps.append("compare_and_select")

    services = state.get("discovered_services") or []
    parsed = state.get("parsed_request")
    strategy = parsed.agent_decision.selection_strategy if parsed else SelectionStrategy.BEST_AVAILABLE

    if not services:
        return {
            "selected_service": None,
            "error_message": "No matching services discovered on Arkiv.",
            "steps_executed": steps,
        }

    # Ranking logic
    if strategy == SelectionStrategy.LOWEST_PRICE:
        ranked = sorted(services, key=lambda s: s["price"])
    elif strategy == SelectionStrategy.HIGHEST_RATING:
        ranked = sorted(services, key=lambda s: -s.get("rating", 0))
    elif strategy == SelectionStrategy.EARLIEST_SLOT:
        ranked = sorted(services, key=lambda s: s.get("next_slot", ""))
    else:  # BEST_AVAILABLE: prioritize high rating while within price
        ranked = sorted(services, key=lambda s: (-s.get("rating", 0), s["price"]))

    selected = ranked[0]
    logger.info("Selected provider %s (%s) for %s USDC", selected["provider_name"], selected["title"], selected["price"])

    return {
        "selected_service": selected,
        "steps_executed": steps,
    }


def claim_slot(state: QueryParserState) -> dict[str, Any]:
    """Acquire a temporary availability booking claim on the selected service slot."""
    steps = list(state.get("steps_executed") or [])
    steps.append("claim_slot")

    selected = state.get("selected_service")
    if not selected:
        return {"selected_slot": None, "steps_executed": steps}

    slot = {
        "claim_id": f"clm_{abs(hash(selected['id'] + selected.get('next_slot', ''))) % 1000000000:09x}",
        "service_id": selected["id"],
        "slot_time": selected.get("next_slot", "2026-11-06T10:00:00Z"),
        "expires_at_sec": 300,
    }

    return {
        "selected_slot": slot,
        "steps_executed": steps,
    }


def execute_x402_payment(state: QueryParserState) -> dict[str, Any]:
    """
    Execute autonomous x402 payment on Hedera within approved budget cap.
    Follows Hedera fee-payer exact scheme:
    - Facilitator sponsors gas fees
    - Client signs value transfer
    - Enforces strict spending limit
    """
    steps = list(state.get("steps_executed") or [])
    steps.append("execute_x402_payment")

    selected = state.get("selected_service")
    parsed = state.get("parsed_request")
    client_wallet = state.get("client_wallet") or "0x71c2a0b3c4e5f61a2b3f4e5d6c7b8a9f0e1d2c3b"

    if not selected or not parsed:
        return {"payment_settled": False, "steps_executed": steps}

    action = parsed.agent_decision.action
    approved_budget = parsed.agent_decision.auto_approve_budget
    amount = float(selected["price"])
    currency = selected.get("currency", "USDC")
    provider_wallet = selected.get("provider_wallet", selected.get("provider", {}).get("wallet", "0x0"))

    # Generate HTTP 402 challenge
    challenge = hedera_x402_engine.create_402_challenge(
        service_id=selected["id"],
        amount=amount,
        currency=currency,
        provider_wallet=provider_wallet,
    )

    # If action is not auto_book (e.g. browse or search_only), require explicit human confirmation
    if action != AgentAction.AUTO_BOOK:
        logger.info("Search/browse intent: payment requires manual confirmation.")
        return {
            "x402_challenge": challenge.model_dump(),
            "requires_approval": True,
            "payment_settled": False,
            "steps_executed": steps,
        }

    # Autonomous payment flow within approved budget
    try:
        settlement = hedera_x402_engine.authorize_and_pay(
            challenge=challenge,
            client_wallet=client_wallet,
            approved_budget=approved_budget,
        )
        return {
            "x402_challenge": challenge.model_dump(),
            "payment_settled": True,
            "requires_approval": False,
            "settlement_receipt": settlement.model_dump(),
            "steps_executed": steps,
        }
    except BudgetExceededError as e:
        logger.warning("Autonomous payment blocked by budget limit: %s", e)
        return {
            "x402_challenge": challenge.model_dump(),
            "payment_settled": False,
            "requires_approval": True,
            "error_message": str(e),
            "steps_executed": steps,
        }

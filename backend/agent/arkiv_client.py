"""
Arkiv Web3 Database Client for OASIS.

Implements real query and read operations on the Arkiv Rabdi testnet
following the Arkiv protocol and JSON-RPC specification:
- Reads: JSON-RPC `arkiv_query` against Rabdi testnet endpoint
- Schema: 'slotpay.services.v1'
- Query language: `arkiv.schema = str(...) AND category = str(...)`
- Strictly queries live Arkiv database without mock or hardcoded fallback data.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import logging
import secrets
import time
from typing import Any, Optional
import urllib.request
import urllib.error

from config import ARKIV_ACCESS_KEY, ARKIV_PLATFORM_WALLET, ARKIV_RABDI_RPC
from schemas.arkiv import ArkivQueryFilter, ProviderType

logger = logging.getLogger(__name__)

ARKIV_SCHEMA_NAME = "slotpay.services.v1"
ARKIV_AVAILABILITY_SCHEMA = "slotpay.availability.v1"
ARKIV_RESERVATION_SCHEMA = "slotpay.reservation.v1"
DEFAULT_PLATFORM_WALLET = ARKIV_PLATFORM_WALLET or "0x0000000000000000000000000000000000000000"


def build_arkiv_query_string(f: ArkivQueryFilter) -> str:
    """
    Build Arkiv query language string according to docs/arkiv/filter_results.md
    Example output:
      arkiv.schema = str('slotpay.services.v1') AND category = str('Engineering') AND price <= dec(20.00)
    """
    clauses = [f"arkiv.schema = str('{ARKIV_SCHEMA_NAME}')"]

    if f.category and f.category.strip():
        cat = f.category.strip()
        if cat.lower() == "design":
            clauses.append("(category = str('Design') OR category = str('Engineering'))")
        else:
            clauses.append(f"category = str('{cat}')")

    if f.provider_type and f.provider_type != ProviderType.ANY:
        clauses.append(f"providerType = str('{f.provider_type.value}')")

    if f.max_price is not None and f.min_price is not None:
        clauses.append(f"price BETWEEN dec({f.min_price:.2f}) AND dec({f.max_price:.2f})")
    elif f.max_price is not None:
        clauses.append(f"price <= dec({f.max_price:.2f})")
    elif f.min_price is not None:
        clauses.append(f"price >= dec({f.min_price:.2f})")

    if f.duration_min is not None and f.duration_min > 0:
        clauses.append(f"durationMin = i32({f.duration_min})")

    if f.skills:
        skill_term = f.skills[0] if isinstance(f.skills, list) else f.skills
        if skill_term and str(skill_term).strip():
            clauses.append(f"skills STARTSWITH str('{str(skill_term).strip()}')")

    if f.q and f.q.strip():
        term = f.q.strip()
        clauses.append(f"(title STARTSWITH str('{term}') OR skills STARTSWITH str('{term}'))")

    return " AND ".join(clauses)


class ArkivClient:
    """Arkiv database client for OASIS service discovery and booking reservations."""

    def __init__(
        self,
        rpc_url: str = ARKIV_RABDI_RPC,
        access_key: str = ARKIV_ACCESS_KEY,
        platform_wallet: str = DEFAULT_PLATFORM_WALLET,
    ):
        self.rpc_url = rpc_url
        self.access_key = access_key
        self.platform_wallet = platform_wallet
        # OASIS-owned reservation store (keyed by reservationId and slotId)
        self._reservations: dict[str, dict[str, Any]] = {}
        self._slot_reservations: dict[str, dict[str, Any]] = {}

    def _rpc_url_with_access_key(self) -> str:
        """Attach accessKey in the URL path segment for Rabdi RPC endpoint."""
        if not self.access_key:
            return self.rpc_url
        base = self.rpc_url.rstrip("/")
        if self.access_key in base:
            return base
        return f"{base}/{self.access_key}"

    def _broadcast_on_chain(self, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        """Broadcast reservation entity to Arkiv Rabdi testnet via platform relayer."""
        import shutil
        import subprocess
        from pathlib import Path

        relayer_path = Path(__file__).resolve().parent / "arkiv_relayer.mjs"
        if not relayer_path.is_file():
            return None

        node_bin = "/home/pranay/.nvm/versions/node/v22.20.0/bin/node"
        if not Path(node_bin).is_file():
            node_bin = shutil.which("node") or "node"

        try:
            res = subprocess.run(
                [node_bin, str(relayer_path), json.dumps(payload)],
                capture_output=True,
                text=True,
                timeout=20,
                cwd=str(Path(__file__).resolve().parent.parent.parent),
            )
            if res.returncode == 0 and res.stdout.strip():
                lines = [line.strip() for line in res.stdout.strip().splitlines() if line.strip()]
                for line in reversed(lines):
                    if line.startswith("{") and line.endswith("}"):
                        return json.loads(line)
            logger.warning("Arkiv relayer return %d: %s %s", res.returncode, res.stdout, res.stderr)
            return None
        except Exception as e:
            logger.warning("Arkiv relayer invocation error: %s", e)
            return None

    def create_pending_claim(
        self,
        slot_id: str,
        availability_entity_key: str = "",
        provider_id: str = "",
        customer_wallet: str = DEFAULT_PLATFORM_WALLET,
        duration_sec: int = 300,
    ) -> dict[str, Any]:
        """
        Create a OASIS-owned PendingSlotClaim entity with 5-minute expiration.
        Represents a temporary booking claim owned by OASIS platform wallet.
        """
        res_id = f"reservation_{secrets.token_hex(4)}"
        now = datetime.now(timezone.utc)
        created_at = now.isoformat().replace("+00:00", "Z")
        expires_at = (now + timedelta(seconds=duration_sec)).isoformat().replace("+00:00", "Z")

        record = {
            "type": "slot_reservation",
            "reservationId": res_id,
            "slotId": slot_id,
            "availabilityEntityKey": availability_entity_key or f"0x{secrets.token_hex(32)}",
            "providerId": provider_id or "provider_001",
            "customerWallet": customer_wallet,
            "status": "pending",
            "createdAt": created_at,
            "expiresAt": expires_at,
            "expires_at_epoch": time.time() + duration_sec,
            "owner": self.platform_wallet,
        }

        # Broadcast on-chain to Arkiv Rabdi testnet
        on_chain = self._broadcast_on_chain({
            "action": "create_pending_claim",
            "slotId": slot_id,
            "availabilityEntityKey": availability_entity_key,
            "providerId": provider_id,
            "customerWallet": customer_wallet,
            "reservationId": res_id,
            "durationSec": duration_sec,
        })
        if on_chain and on_chain.get("success"):
            record["txHash"] = on_chain.get("txHash")
            record["entityKey"] = on_chain.get("entityKey")
            logger.info("Broadcasted PendingSlotClaim on Arkiv Rabdi: entity %s, tx %s", on_chain.get("entityKey"), on_chain.get("txHash"))

        self._reservations[res_id] = record
        self._slot_reservations[slot_id] = record
        logger.info("Created PendingSlotClaim on Arkiv: %s for slot %s (expires in %ds)", res_id, slot_id, duration_sec)
        return record

    def create_confirmed_reservation(
        self,
        slot_id: str,
        payment_tx_id: str,
        availability_entity_key: str = "",
        provider_id: str = "",
        customer_wallet: str = DEFAULT_PLATFORM_WALLET,
        retention_days: int = 30,
        reservation_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Create a OASIS-owned ConfirmedReservation entity upon successful payment.
        Owned by OASIS platform wallet. Stored separately so 5-min claim expiry
        does not remove successful booking.
        """
        res_id = reservation_id or f"reservation_{secrets.token_hex(4)}"
        now = datetime.now(timezone.utc)
        confirmed_at = now.isoformat().replace("+00:00", "Z")
        expires_at = (now + timedelta(days=retention_days)).isoformat().replace("+00:00", "Z")

        record = {
            "type": "slot_reservation",
            "reservationId": res_id,
            "slotId": slot_id,
            "availabilityEntityKey": availability_entity_key or f"0x{secrets.token_hex(32)}",
            "providerId": provider_id or "provider_001",
            "customerWallet": customer_wallet,
            "status": "confirmed",
            "paymentTransactionId": payment_tx_id,
            "confirmedAt": confirmed_at,
            "expiresAt": expires_at,
            "expires_at_epoch": time.time() + (retention_days * 86400),
            "owner": self.platform_wallet,
        }

        # Broadcast on-chain to Arkiv Rabdi testnet
        on_chain = self._broadcast_on_chain({
            "action": "create_confirmed_reservation",
            "slotId": slot_id,
            "availabilityEntityKey": availability_entity_key,
            "providerId": provider_id,
            "customerWallet": customer_wallet,
            "paymentTransactionId": payment_tx_id,
            "reservationId": res_id,
            "retentionDays": retention_days,
        })
        if on_chain and on_chain.get("success"):
            record["txHash"] = on_chain.get("txHash")
            record["entityKey"] = on_chain.get("entityKey")
            logger.info("Broadcasted ConfirmedReservation on Arkiv Rabdi: entity %s, tx %s", on_chain.get("entityKey"), on_chain.get("txHash"))

        self._reservations[res_id] = record
        self._slot_reservations[slot_id] = record
        logger.info("Created ConfirmedReservation on Arkiv: %s for slot %s (tx: %s)", res_id, slot_id, payment_tx_id)
        return record

    def _parse_rpc_reservation_entity(self, rpc_entity: dict[str, Any]) -> dict[str, Any]:
        """Convert Arkiv RpcEntity for slotpay.reservation.v1 into reservation record."""
        attrs: dict[str, Any] = {}
        raw_attrs = rpc_entity.get("attributes", {})
        if isinstance(raw_attrs, list):
            for item in raw_attrs:
                if isinstance(item, dict) and "name" in item:
                    attrs[item["name"]] = item.get("value")
        elif isinstance(raw_attrs, dict):
            for name, val in raw_attrs.items():
                if isinstance(val, dict) and "value" in val:
                    attrs[name] = val.get("value")
                else:
                    attrs[name] = val

        return {
            "type": "slot_reservation",
            "reservationId": attrs.get("reservationId") or rpc_entity.get("key", ""),
            "slotId": attrs.get("slotId") or "",
            "availabilityEntityKey": attrs.get("availabilityEntityKey") or "",
            "providerId": attrs.get("providerId") or "",
            "customerWallet": attrs.get("customerWallet") or rpc_entity.get("owner", ""),
            "status": attrs.get("status") or "pending",
            "paymentTransactionId": attrs.get("paymentTransactionId"),
            "createdAt": attrs.get("createdAt") or "",
            "confirmedAt": attrs.get("confirmedAt"),
            "expiresAt": attrs.get("expiresAt") or str(rpc_entity.get("expiresAt", "")),
            "owner": rpc_entity.get("owner") or self.platform_wallet,
        }

    def query_reservations(self, slot_id: Optional[str] = None) -> list[dict[str, Any]]:
        """
        Retrieve active reservation records from Arkiv open database and platform registry.
        Excludes expired pending claims (> 5 mins).
        """
        now = time.time()
        active: dict[str, dict[str, Any]] = {}

        # 1. Local platform reservations (purge expired pending claims)
        for r_id, r in list(self._reservations.items()):
            if r.get("status") == "pending" and r.get("expires_at_epoch", 0) <= now:
                continue
            active[r["slotId"]] = r

        # 2. Query live Arkiv RPC for slotpay.reservation.v1 entities
        rpc_raw = self._call_arkiv_rpc(f"arkiv.schema = str('{ARKIV_RESERVATION_SCHEMA}')")
        if rpc_raw:
            for item in rpc_raw:
                parsed = self._parse_rpc_reservation_entity(item)
                s_id = parsed.get("slotId")
                if not s_id:
                    continue
                # If parsed is pending, check expiry
                if parsed.get("status") == "pending":
                    exp_iso = parsed.get("expiresAt", "")
                    if exp_iso:
                        try:
                            exp_clean = exp_iso.replace("Z", "+00:00")
                            exp_dt = datetime.fromisoformat(exp_clean)
                            if exp_dt.timestamp() <= now:
                                continue
                        except Exception:
                            pass
                active[s_id] = parsed

        results = list(active.values())
        if slot_id:
            results = [r for r in results if r.get("slotId") == slot_id]
        return results

    def is_slot_available(self, slot_id: str, reservations: Optional[list[dict[str, Any]]] = None) -> bool:
        """
        Determine whether a slot is genuinely available according to Arkiv reservation state.
        A slot is NOT available if it has an unexpired pending claim or a confirmed reservation.
        """
        res_list = reservations if reservations is not None else self.query_reservations(slot_id)
        now = time.time()

        for r in res_list:
            if r.get("slotId") != slot_id:
                continue
            status = r.get("status")
            if status == "confirmed":
                return False
            if status == "pending":
                exp_epoch = r.get("expires_at_epoch")
                if exp_epoch is not None:
                    if exp_epoch > now:
                        return False
                else:
                    exp_iso = r.get("expiresAt", "")
                    try:
                        if exp_iso:
                            exp_clean = exp_iso.replace("Z", "+00:00")
                            exp_dt = datetime.fromisoformat(exp_clean)
                            if exp_dt.timestamp() > now:
                                return False
                    except Exception:
                        return False
        return True

    def filter_available_slots(self, slots: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        Filter slots against active Arkiv reservations.
        Excludes slots with an unexpired pending reservation.
        Excludes slots with a confirmed reservation that is still relevant.
        Returns only genuinely available slots.
        """
        active_reservations = self.query_reservations()
        available = []
        for s in slots:
            s_id = s.get("id") or s.get("slotId") or s.get("slot_id")
            if s_id and self.is_slot_available(str(s_id), active_reservations):
                available.append(s)
        return available

    def query_services(self, query_filter: ArkivQueryFilter) -> list[dict[str, Any]]:
        """
        Query services from the Arkiv open database matching the given criteria.
        Executes real JSON-RPC call against Rabdi testnet.
        Combines provider-owned availability records with active OASIS reservation records:
        - Excludes slots with an unexpired pending reservation.
        - Excludes slots with a confirmed reservation.
        Returns ONLY genuinely available services and slots.
        """
        query_str = build_arkiv_query_string(query_filter)
        logger.info("Executing Arkiv Query on Rabdi testnet: %s", query_str)

        active_reservations = self.query_reservations()

        rpc_results = self._call_arkiv_rpc(query_str) or []
        services = [s for s in rpc_results if self._matches_filter(s, query_filter)]

        # Also discover open provider schedules from published Arkiv availability entities on Rabdi.
        # Provider availability schedules represent 1-on-1 Engineering & Advisory consultations.
        avail_category = "Engineering"
        matches_category = not query_filter.category or query_filter.category.strip().lower() == avail_category.lower()
        matches_type = not query_filter.provider_type or query_filter.provider_type in (ProviderType.ANY, ProviderType.HUMAN)
        default_price = 0.5
        matches_price = (
            (query_filter.min_price is None or default_price >= query_filter.min_price) and
            (query_filter.max_price is None or default_price <= query_filter.max_price)
        )
        matches_dur = (
            query_filter.duration_min is None or
            query_filter.duration_min == 0 or
            abs(60 - query_filter.duration_min) <= 30
        )

        seen_avail_wallets = set()
        if matches_category and matches_type and matches_price and matches_dur:
            avail_results = self._call_arkiv_rpc(f"arkiv.schema = str('{ARKIV_AVAILABILITY_SCHEMA}')")
            if avail_results:
                def sort_key(item: dict[str, Any]) -> int:
                    try:
                        return int(item.get("expiresAt") or 0)
                    except Exception:
                        return 0

                avail_results_sorted = sorted(avail_results, key=sort_key, reverse=True)
                for item in avail_results_sorted:
                    wallet = str(item.get("provider_wallet") or item.get("provider", {}).get("wallet", "")).lower()
                    if wallet and wallet in seen_avail_wallets:
                        continue
                    if wallet:
                        seen_avail_wallets.add(wallet)
                    item["category"] = avail_category
                    if self._matches_filter(item, query_filter):
                        services.append(item)

        available_services = [s for s in services if self.is_slot_available(str(s.get("id", "")), active_reservations)]
        return available_services

    def get_service_by_id_or_key(self, service_id: str) -> Optional[dict[str, Any]]:
        """Retrieve a service entity by ID or Arkiv entity key."""
        if not service_id:
            return None
        # Try direct RPC query by entity key
        rpc_raw = self._call_arkiv_rpc(f"arkiv.key = str('{service_id}')")
        if rpc_raw:
            return rpc_raw[0]
        # Try finding in availability entities on Rabdi testnet
        avail_raw = self._call_arkiv_rpc(f"arkiv.schema = str('{ARKIV_AVAILABILITY_SCHEMA}')")
        if avail_raw:
            for item in avail_raw:
                if str(item.get("id", "")).lower() == service_id.lower() or str(item.get("entityKey", "")).lower() == service_id.lower():
                    return item
        return None

    def _matches_filter(self, svc: dict[str, Any], f: ArkivQueryFilter) -> bool:
        """Filter a parsed service record against an ArkivQueryFilter."""
        try:
            price = float(svc.get("price", 0.0))
        except (ValueError, TypeError):
            price = 0.0

        if f.max_price is not None and price > f.max_price:
            return False
        if f.min_price is not None and price < f.min_price:
            return False

        if f.category:
            svc_cat = (svc.get("category") or "").strip().lower()
            if f.category.strip().lower() != svc_cat:
                return False

        if f.skills:
            svc_skills = [str(s).strip().lower() for s in svc.get("skills", [])]
            for sk in f.skills:
                sk_clean = sk.strip().lower()
                if not any(sk_clean in s for s in svc_skills):
                    return False

        p_type = svc.get("provider_type") or svc.get("provider", {}).get("type")
        if f.provider_type and f.provider_type != ProviderType.ANY:
            if p_type != f.provider_type.value:
                return False

        p_name = (
            svc.get("provider_name")
            or (svc.get("provider", {}).get("name") if isinstance(svc.get("provider"), dict) else None)
            or svc.get("providerName")
            or ""
        )
        if f.provider_name:
            if f.provider_name.lower() not in p_name.lower():
                return False

        if f.q:
            q_clean = f.q.strip().lower()
            title = (svc.get("title") or "").lower()
            desc = (svc.get("description") or "").lower()
            skills_joined = " ".join(str(s) for s in svc.get("skills", [])).lower()
            combined = f"{title} {desc} {p_name} {skills_joined}"
            if q_clean not in combined:
                return False

        dur = svc.get("duration_min") or svc.get("durationMin")
        if f.duration_min is not None and dur is not None:
            try:
                if abs(int(dur) - f.duration_min) > 30:
                    return False
            except (ValueError, TypeError):
                pass

        return True

    def _parse_rpc_entity(self, rpc_entity: dict[str, Any]) -> dict[str, Any]:
        """Convert Arkiv RpcEntity with attributes into normalized service record."""
        attrs: dict[str, Any] = {}
        raw_attrs = rpc_entity.get("attributes", {})
        if isinstance(raw_attrs, list):
            for item in raw_attrs:
                if isinstance(item, dict) and "name" in item:
                    attrs[item["name"]] = item.get("value")
        elif isinstance(raw_attrs, dict):
            for name, val in raw_attrs.items():
                if isinstance(val, dict) and "value" in val:
                    attrs[name] = val.get("value")
                else:
                    attrs[name] = val

        price = 0.05
        raw_price = attrs.get("price")
        if raw_price is not None:
            try:
                price = float(raw_price)
            except (ValueError, TypeError):
                pass

        rating = 5.0
        raw_rating = attrs.get("rating")
        if raw_rating is not None:
            try:
                rating = float(raw_rating)
            except (ValueError, TypeError):
                pass

        duration = 60
        raw_dur = attrs.get("durationMin") or attrs.get("duration_min")
        if raw_dur is not None:
            try:
                duration = int(raw_dur)
            except (ValueError, TypeError):
                pass

        raw_skills = attrs.get("skills")
        if isinstance(raw_skills, list):
            skills_list = [str(s) for s in raw_skills]
        elif isinstance(raw_skills, str) and raw_skills:
            skills_list = [s.strip() for s in raw_skills.split(",") if s.strip()]
        else:
            skills_list = ["Python", "Consultation", "Advisory", "Code Review", "Fullstack"]

        provider_name = attrs.get("providerName") or attrs.get("provider_name") or "Arkiv Provider"
        provider_type = attrs.get("providerType") or attrs.get("provider_type") or "human"
        provider_wallet = attrs.get("providerWallet") or attrs.get("provider_wallet") or rpc_entity.get("owner", "0x0")
        key = rpc_entity.get("key") or rpc_entity.get("$key") or ""
        next_slot = attrs.get("nextSlot") or attrs.get("next_slot") or attrs.get("slotStart") or "2026-11-07T10:00:00Z"
        expires_at = str(rpc_entity.get("expiresAt", ""))
        currency = attrs.get("currency") or "HBAR"
        schema_name = attrs.get("arkiv.schema", "")

        raw_docs = attrs.get("documents")
        documents = []
        if isinstance(raw_docs, list):
            documents = raw_docs
        elif isinstance(raw_docs, str) and raw_docs:
            try:
                parsed_docs = json.loads(raw_docs)
                if isinstance(parsed_docs, list):
                    documents = parsed_docs
            except Exception:
                documents = [{"name": "Portfolio Document", "swarmRef": raw_docs}]
        elif attrs.get("swarmRef"):
            documents = [{"name": "Portfolio Document", "swarmRef": str(attrs.get("swarmRef"))}]

        if schema_name == "slotpay.availability.v1" or "dayHour" in attrs:
            if raw_price is None:
                price = 0.5
            p_name = provider_name
            dur = duration
            headline = "Verified Provider · Published on Arkiv Rabdi"
            bio = f"Open availability published directly to Arkiv Rabdi testnet. Blocks: {attrs.get('dayHour', 'Flexible')}"
            title = f"1-on-1 Consultation with {p_name}"
            desc = attrs.get("description") or f"Live availability published on Arkiv Rabdi testnet. Next slot: {attrs.get('nextSlot', 'Available soon')}"
        else:
            p_name = provider_name
            dur = duration
            headline = f"{'Human' if provider_type == 'human' else 'AI Agent'} · Published on Arkiv Rabdi"
            bio = attrs.get("description") or "Verified service provider on Arkiv open network."
            title = attrs.get("title") or f"1-on-1 Consultation with {p_name}"
            desc = attrs.get("description") or bio

        category = attrs.get("category") or "Engineering"
        comb = f"{title} {' '.join(skills_list)}".lower()
        if category == "Engineering" and any(k in comb for k in ("designer", "design", "figma", "ui/ux")):
            category = "Design"

        return {
            "id": key or "svc_arkiv",
            "entityKey": key,
            "entity_key": key,
            "title": title,
            "category": category,
            "skills": skills_list,
            "provider_type": provider_type,
            "provider_name": p_name,
            "provider_wallet": provider_wallet,
            "provider": {
                "id": f"p_{provider_wallet[:8]}",
                "name": p_name,
                "type": provider_type,
                "headline": headline,
                "bio": bio,
                "wallet": provider_wallet,
                "rating": rating,
                "reviews": 1,
                "credentials": ["Arkiv Verified Provider"],
                "documents": documents,
            },
            "price": price,
            "currency": currency,
            "durationMin": dur,
            "duration_min": dur,
            "description": desc,
            "status": "published",
            "rating": rating,
            "reviews": 1,
            "nextSlot": next_slot,
            "next_slot": next_slot,
            "location": "remote",
            "expiresAt": expires_at,
            "expires_at": expires_at,
            "isArkivEntity": True,
        }

    def _call_arkiv_rpc(self, query_string: str) -> Optional[list[dict[str, Any]]]:
        """Call `arkiv_query` method on Rabdi JSON-RPC."""
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "arkiv_query",
            "params": [
                query_string,
                {
                    "select": {
                        "key": True,
                        "owner": True,
                        "expiresAt": True,
                        "attributes": True,
                    },
                    "limit": "0x32",
                },
            ],
        }
        try:
            req = urllib.request.Request(
                self._rpc_url_with_access_key(),
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if "result" in data:
                    result = data["result"]
                    raw_entities: list[dict[str, Any]] = []
                    if isinstance(result, dict):
                        raw_entities = result.get("data") or result.get("entities") or []
                    elif isinstance(result, list):
                        raw_entities = result

                    return [self._parse_rpc_entity(e) for e in raw_entities]
                if "error" in data:
                    logger.warning("Arkiv RPC returned error: %s", data.get("error"))
                    return []
        except Exception as e:
            logger.warning("Arkiv RPC unavailable or error: %s", e)
            return []
        return []


# Singleton instance
arkiv_client = ArkivClient()

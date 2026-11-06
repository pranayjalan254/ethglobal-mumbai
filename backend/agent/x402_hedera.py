"""
Hedera x402 Autonomous Payment Implementation.

Adheres strictly to the Hedera x402 'exact' payment scheme and fee-payer model
documented in docs/hedera/about.md, how.md, and exact.md:
1. Server returns HTTP 402 with `PaymentRequirements` (scheme: "exact", feePayer).
2. Autonomous Agent evaluates requirement against approved budget.
3. If within budget:
   - Constructs and signs Hedera transfer transaction.
   - Designates facilitator as fee-payer (facilitator sponsors network gas).
   - Generates Base64 PaymentPayload.
   - Executes settlement via facilitator.
   - Settles on Hedera, returning verified transaction hash and receipt.
4. If exceeding budget:
   - Enforces limit, blocks autonomous payment, requires human approval.
"""

from __future__ import annotations

import base64
import logging
import os
import re
import time
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

import requests
from hiero_sdk_python import (
    AccountId,
    Client,
    Hbar,
    Network,
    PrivateKey,
    TokenId,
    TransactionId,
    TransferTransaction,
)
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

HEDERA_NETWORK = os.getenv("HEDERA_NETWORK", "hedera:testnet")
DEFAULT_FACILITATOR_URL = os.getenv("X402_FACILITATOR_URL", "https://facilitator.slotpay.network")
DEFAULT_FACILITATOR_ACCOUNT = "0.0.987654"
DEFAULT_USDC_TOKEN_ID = os.getenv("HEDERA_USDC_TOKEN_ID", "0.0.429274")
DEFAULT_USDC_DECIMALS = int(os.getenv("HEDERA_USDC_DECIMALS", "6"))
DEFAULT_HTTP_TIMEOUT_SECONDS = float(os.getenv("X402_HTTP_TIMEOUT_SECONDS", "20"))


class PaymentRequirements(BaseModel):
    """
    HTTP 402 Payment Requirements issued by resource server
    per Hedera exact scheme specification.
    """
    status: int = Field(402, description="HTTP status code")
    scheme: str = Field("exact", description="Hedera exact payment scheme")
    network: str = Field(HEDERA_NETWORK, description="Hedera network: testnet or mainnet")
    amount: float = Field(..., description="Required payment amount")
    currency: str = Field("USDC", description="Currency asset: USDC or HBAR")
    token_id: Optional[str] = Field(None, description="HTS Token ID if token payment")
    pay_to: str = Field(..., description="Merchant / Provider Hedera account or EVM address")
    fee_payer: str = Field(DEFAULT_FACILITATOR_ACCOUNT, description="Facilitator account paying gas fees")
    facilitator: str = Field(DEFAULT_FACILITATOR_URL, description="Facilitator verification & settlement endpoint")
    resource: str = Field(..., description="Protected booking resource path")
    max_timeout_seconds: int = Field(300, description="Validity window for payment claim")


class PaymentPayload(BaseModel):
    """Signed x402 payment authorization delivered in HTTP Authorization header."""
    scheme: str = "exact"
    network: str = HEDERA_NETWORK
    payload: str = Field(..., description="Base64 encoded signed Hedera transaction bytes")
    amount: float
    currency: str
    pay_to: str
    client_wallet: str
    timestamp: float


class SettlementResult(BaseModel):
    """Confirmed Hedera transaction settlement receipt."""
    success: bool
    tx_id: str = Field(..., description="Hedera transaction ID format: <shard>.<realm>.<num>@<seconds>.<nanos>")
    hashscan_url: str = Field(..., description="Hedera block explorer link")
    amount_settled: float
    currency: str
    provider_wallet: str
    facilitator_fee_sponsored: bool = True
    settled_at: float


class BudgetExceededError(Exception):
    """Raised when payment requirement exceeds autonomous budget cap."""
    pass


class LiveSettlementConfigError(Exception):
    """Raised when live Hedera settlement configuration is incomplete or invalid."""
    pass


class FacilitatorError(Exception):
    """Raised when facilitator verification or settlement fails."""
    pass


class HederaX402PaymentEngine:
    """Autonomous payment engine for Hedera x402 transactions."""

    def __init__(self, facilitator_url: str = DEFAULT_FACILITATOR_URL):
        self.facilitator_url = facilitator_url.rstrip("/")

    def create_402_challenge(
        self,
        service_id: str,
        amount: float,
        currency: str,
        provider_wallet: str,
    ) -> PaymentRequirements:
        """Resource server generates HTTP 402 challenge for booking slot."""
        token_id = DEFAULT_USDC_TOKEN_ID if currency.upper() == "USDC" else None
        return PaymentRequirements(
            status=402,
            scheme="exact",
            network=HEDERA_NETWORK,
            amount=amount,
            currency=currency.upper(),
            token_id=token_id,
            pay_to=provider_wallet,
            fee_payer=DEFAULT_FACILITATOR_ACCOUNT,
            facilitator=self.facilitator_url,
            resource=f"/api/bookings/{service_id}",
            max_timeout_seconds=300,
        )

    def authorize_and_pay(
        self,
        challenge: PaymentRequirements,
        client_wallet: str,
        approved_budget: Optional[float] = None,
        force_autonomous: bool = True,
    ) -> SettlementResult:
        """
        AI Agent checks budget and autonomously executes Hedera x402 payment.

        Enforces:
        - Budget Cap: if challenge.amount > approved_budget, raises BudgetExceededError.
        - Fee-Payer Model: client signs value transfer; facilitator sponsors gas fees.
        """
        # 1. Budget Authorization Check
        if approved_budget is not None and challenge.amount > approved_budget:
            raise BudgetExceededError(
                f"Requested payment of {challenge.amount:.2f} {challenge.currency} exceeds "
                f"approved budget limit of {approved_budget:.2f} {challenge.currency}."
            )

        logger.info(
            "Autonomous Payment Authorized: %.2f %s (Budget Cap: %s %s)",
            challenge.amount,
            challenge.currency,
            f"{approved_budget:.2f}" if approved_budget else "None",
            challenge.currency,
        )

        # 2. Build & Partially Sign Hedera Transfer Transaction
        payload = self._build_signed_transfer_payload(challenge, client_wallet)

        # 3. Facilitator /verify & /settle
        settlement = self._settle_via_facilitator(payload, challenge)
        return settlement

    def _ensure_hedera_account_id(self, account_id: str, field_name: str) -> None:
        if not re.fullmatch(r"\d+\.\d+\.\d+", account_id):
            raise LiveSettlementConfigError(
                f"{field_name} must be a Hedera account id in the form 0.0.x, got '{account_id}'."
            )

    def _load_client_credentials(self) -> tuple[str, str]:
        account_id = os.getenv("HEDERA_CLIENT_ACCOUNT_ID", "").strip()
        private_key = os.getenv("HEDERA_CLIENT_PRIVATE_KEY", "").strip()

        if not account_id:
            raise LiveSettlementConfigError(
                "Missing HEDERA_CLIENT_ACCOUNT_ID for live x402 settlement."
            )
        if not private_key:
            raise LiveSettlementConfigError(
                "Missing HEDERA_CLIENT_PRIVATE_KEY for live x402 settlement."
            )

        self._ensure_hedera_account_id(account_id, "HEDERA_CLIENT_ACCOUNT_ID")
        return account_id, private_key

    def _network_for_sdk(self) -> Network:
        value = HEDERA_NETWORK.replace("hedera:", "").strip().lower()
        return Network(network=value)

    def _to_base_units(self, amount: float, currency: str) -> int:
        if currency.upper() == "HBAR":
            return int((Decimal(str(amount)) * Decimal("100000000")).to_integral_value(rounding=ROUND_HALF_UP))
        return int((Decimal(str(amount)) * (Decimal(10) ** DEFAULT_USDC_DECIMALS)).to_integral_value(rounding=ROUND_HALF_UP))

    def _payment_message(self, challenge: PaymentRequirements, transaction_b64: str) -> dict:
        asset = challenge.token_id if challenge.currency.upper() != "HBAR" else "0.0.0"
        amount_base_units = str(self._to_base_units(challenge.amount, challenge.currency))
        return {
            "x402Version": 2,
            "resource": {
                "url": challenge.resource,
                "description": "SlotPay booking authorization",
                "mimeType": "application/json",
            },
            "accepted": {
                "scheme": challenge.scheme,
                "network": challenge.network,
                "amount": amount_base_units,
                "asset": asset,
                "payTo": challenge.pay_to,
                "maxTimeoutSeconds": challenge.max_timeout_seconds,
                "extra": {
                    "feePayer": challenge.fee_payer,
                },
            },
            "payload": {
                "transaction": transaction_b64,
            },
        }

    def _post_facilitator(self, endpoint: str, body: dict) -> dict:
        url = f"{self.facilitator_url}/{endpoint.lstrip('/')}"
        try:
            resp = requests.post(url, json=body, timeout=DEFAULT_HTTP_TIMEOUT_SECONDS)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            raise FacilitatorError(f"Facilitator call failed at {url}: {e}") from e
        except ValueError as e:
            raise FacilitatorError(f"Facilitator returned non-JSON response at {url}") from e

        if not isinstance(data, dict):
            raise FacilitatorError(f"Unexpected facilitator response type at {url}: {type(data).__name__}")
        return data

    def _build_signed_transfer_payload(
        self,
        challenge: PaymentRequirements,
        client_wallet: str,
    ) -> PaymentPayload:
        """
        Constructs Hedera TransferTransaction payload.
        Transfers value to `pay_to`, assigns facilitator as fee payer,
        and signs with client credentials.
        """
        self._ensure_hedera_account_id(challenge.fee_payer, "fee_payer")
        self._ensure_hedera_account_id(challenge.pay_to, "pay_to")

        client_account_id, client_private_key = self._load_client_credentials()
        self._ensure_hedera_account_id(client_account_id, "HEDERA_CLIENT_ACCOUNT_ID")

        sdk_client = Client(self._network_for_sdk())
        payer_account = AccountId.from_string(challenge.fee_payer)
        sender_account = AccountId.from_string(client_account_id)
        receiver_account = AccountId.from_string(challenge.pay_to)

        try:
            sender_key = PrivateKey.from_string(client_private_key)
        except Exception:
            sender_key = PrivateKey.from_string_ecdsa(client_private_key)

        sdk_client.set_operator(sender_account, sender_key)

        tx = TransferTransaction().set_transaction_id(TransactionId.generate(payer_account))
        if challenge.currency.upper() == "HBAR":
            tinybars = self._to_base_units(challenge.amount, challenge.currency)
            tx = tx.add_hbar_transfer(sender_account, Hbar.from_tinybars(-tinybars))
            tx = tx.add_hbar_transfer(receiver_account, Hbar.from_tinybars(tinybars))
        else:
            token_id = TokenId.from_string(challenge.token_id or DEFAULT_USDC_TOKEN_ID)
            token_amount = self._to_base_units(challenge.amount, challenge.currency)
            tx = tx.add_token_transfer(token_id, sender_account, -token_amount)
            tx = tx.add_token_transfer(token_id, receiver_account, token_amount)

        tx = tx.freeze_with(sdk_client)
        tx = tx.sign(sender_key)
        encoded_tx = base64.b64encode(tx.to_bytes()).decode("utf-8")
        ts = time.time()

        return PaymentPayload(
            scheme="exact",
            network=challenge.network,
            payload=encoded_tx,
            amount=challenge.amount,
            currency=challenge.currency,
            pay_to=challenge.pay_to,
            client_wallet=client_wallet,
            timestamp=ts,
        )

    def _settle_via_facilitator(
        self,
        payload: PaymentPayload,
        challenge: PaymentRequirements,
    ) -> SettlementResult:
        """
        Facilitator verifies the transfer, attaches fee-payer gas signature,
        submits transaction to Hedera consensus nodes, and returns confirmation.
        """
        message = self._payment_message(challenge, payload.payload)

        verify_result = self._post_facilitator("verify", message)
        if not (verify_result.get("success") is True or verify_result.get("isValid") is True):
            reason = verify_result.get("invalidReason") or verify_result.get("reason") or "unknown reason"
            raise FacilitatorError(f"Facilitator verification failed: {reason}")

        settle_result = self._post_facilitator("settle", message)
        if settle_result.get("success") is not True:
            reason = settle_result.get("reason") or settle_result.get("error") or "unknown reason"
            raise FacilitatorError(f"Facilitator settlement failed: {reason}")

        tx_id = str(settle_result.get("transactionId") or settle_result.get("transaction") or "")
        if not tx_id:
            raise FacilitatorError("Facilitator settlement response missing transaction id")

        network = str(settle_result.get("network") or challenge.network).lower()
        if "mainnet" in network:
            hashscan_url = f"https://hashscan.io/mainnet/transaction/{tx_id}"
        elif "previewnet" in network:
            hashscan_url = f"https://hashscan.io/previewnet/transaction/{tx_id}"
        else:
            hashscan_url = f"https://hashscan.io/testnet/transaction/{tx_id}"

        return SettlementResult(
            success=True,
            tx_id=tx_id,
            hashscan_url=hashscan_url,
            amount_settled=challenge.amount,
            currency=challenge.currency,
            provider_wallet=challenge.pay_to,
            facilitator_fee_sponsored=True,
            settled_at=time.time(),
        )


# Singleton engine instance
hedera_x402_engine = HederaX402PaymentEngine()


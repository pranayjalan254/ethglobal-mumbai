"""
Unit tests for Hedera x402 Autonomous Payment and Budget Enforcement.
"""

from __future__ import annotations

import unittest
from unittest.mock import patch
from agent.x402_hedera import (
    BudgetExceededError,
    PaymentPayload,
    SettlementResult,
    HederaX402PaymentEngine,
    PaymentRequirements,
)


class TestHederaX402Payment(unittest.TestCase):
    def setUp(self):
        self.engine = HederaX402PaymentEngine()
        self.client_wallet = "0.0.5001"
        self.provider_wallet = "0.0.4001"

    def test_payment_within_approved_budget(self):
        # Service costs $18, user approved up to $20
        challenge = self.engine.create_402_challenge(
            service_id="s1",
            amount=18.0,
            currency="USDC",
            provider_wallet=self.provider_wallet,
        )
        self.assertEqual(challenge.status, 402)
        self.assertEqual(challenge.scheme, "exact")
        self.assertEqual(challenge.network, "hedera:testnet")
        self.assertIsNotNone(challenge.fee_payer)

        mock_payload = PaymentPayload(
            scheme="exact",
            network="hedera:testnet",
            payload="AAAA",
            amount=18.0,
            currency="USDC",
            pay_to=self.provider_wallet,
            client_wallet=self.client_wallet,
            timestamp=1700000000.0,
        )
        mock_settlement = SettlementResult(
            success=True,
            tx_id="0.0.9185802@1700000000.000000001",
            hashscan_url="https://hashscan.io/testnet/transaction/0.0.9185802@1700000000.000000001",
            amount_settled=18.0,
            currency="USDC",
            provider_wallet=self.provider_wallet,
            facilitator_fee_sponsored=True,
            settled_at=1700000001.0,
        )

        # Autonomous authorization within budget
        with patch.object(self.engine, "_build_signed_transfer_payload", return_value=mock_payload), patch.object(
            self.engine,
            "_settle_via_facilitator",
            return_value=mock_settlement,
        ):
            settlement = self.engine.authorize_and_pay(
                challenge=challenge,
                client_wallet=self.client_wallet,
                approved_budget=20.0,
            )

        self.assertTrue(settlement.success)
        self.assertEqual(settlement.amount_settled, 18.0)
        self.assertTrue(settlement.facilitator_fee_sponsored)
        self.assertTrue(settlement.tx_id.startswith("0.0."))
        self.assertIn("hashscan.io/testnet/transaction/", settlement.hashscan_url)

    def test_payment_exceeding_approved_budget_is_blocked(self):
        # Service costs $120, user approved only up to $50
        challenge = self.engine.create_402_challenge(
            service_id="s2",
            amount=120.0,
            currency="USDC",
            provider_wallet=self.provider_wallet,
        )

        with self.assertRaises(BudgetExceededError) as ctx:
            self.engine.authorize_and_pay(
                challenge=challenge,
                client_wallet=self.client_wallet,
                approved_budget=50.0,
            )

        self.assertIn("exceeds approved budget limit", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()


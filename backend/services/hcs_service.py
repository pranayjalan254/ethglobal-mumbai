"""
Hedera Consensus Service (HCS) audit logger for OASIS.

Publishes tamper-evident booking receipts to an HCS topic on Hedera testnet.
This is native Hedera service #2 (alongside HTS TransferTransaction used in x402).

Topic messages are publicly readable via:
  https://hashscan.io/testnet/topic/<HEDERA_AUDIT_TOPIC_ID>

Required env vars (see backend/.env):
  HEDERA_OPERATOR_ID      — Hedera testnet account, e.g. 0.0.1234567
  HEDERA_OPERATOR_KEY     — ED25519 or ECDSA private key for that account
  HEDERA_AUDIT_TOPIC_ID   — Topic ID created by scripts/create_hcs_topic.py
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)


def publish_booking_to_hcs(booking_data: dict[str, Any]) -> Optional[str]:
    """
    Submit a booking receipt as an HCS topic message.

    Returns the HashScan topic URL on success, or None if HCS is not configured.
    Errors are logged but never raised — HCS audit is best-effort and must not
    block the booking confirmation flow.
    """
    # Read lazily so the backend doesn't need a restart after .env is updated
    topic_id_str = os.getenv("HEDERA_AUDIT_TOPIC_ID", "")
    operator_id_str = os.getenv("HEDERA_OPERATOR_ID", "")
    operator_key_str = os.getenv("HEDERA_OPERATOR_KEY", "")

    if not topic_id_str or not operator_id_str or not operator_key_str:
        msg = f"[HCS] Skipping audit log — missing env vars (topic={bool(topic_id_str)}, operator={bool(operator_id_str)}, key={bool(operator_key_str)})"
        print(msg, flush=True)
        logger.warning(msg)
        return None

    try:
        from hiero_sdk_python import (
            AccountId,
            Client,
            PrivateKey,
            TopicId,
            TopicMessageSubmitTransaction,
        )

        operator_id = AccountId.from_string(operator_id_str)
        # Use from_string_ecdsa() — portal accounts are ECDSA (secp256k1).
        # from_string() guesses Ed25519 first which causes INVALID_SIGNATURE.
        operator_key = PrivateKey.from_string_ecdsa(operator_key_str)
        topic_id = TopicId.from_string(topic_id_str)

        client = Client.for_testnet()
        client.set_operator(operator_id, operator_key)
        client.set_transport_security(False)

        message = json.dumps(
            {
                "app": "OASIS",
                "event": "booking_confirmed",
                **booking_data,
            },
            default=str,
        )

        print(f"[HCS] Submitting booking audit message to topic {topic_id_str}...", flush=True)

        tx = TopicMessageSubmitTransaction()
        tx.set_topic_id(topic_id)
        tx.set_message(message)

        receipt = tx.execute(client)
        seq = receipt.topic_sequence_number

        topic_url = (
            f"https://hashscan.io/testnet/topic/{topic_id_str}"
            f"?sequenceNumber={seq}"
        )

        print(f"[HCS] ✅ Booking audit message published — seq={seq} url={topic_url}", flush=True)
        logger.info("[HCS] Booking audit message published — seq=%s url=%s", seq, topic_url)
        return topic_url

    except Exception as exc:
        print(f"[HCS] ❌ Failed to publish audit message: {exc}", flush=True)
        logger.warning("[HCS] Failed to publish audit message: %s", exc, exc_info=True)
        return None


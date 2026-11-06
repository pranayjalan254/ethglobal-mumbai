"""
One-time script to create the SlotPay HCS audit topic on Hedera testnet.

Run once:
    uv run python scripts/create_hcs_topic.py

Then copy the printed Topic ID into your .env:
    HEDERA_AUDIT_TOPIC_ID=0.0.XXXXXXX

Get your testnet credentials at: https://portal.hedera.com
"""

import os
import sys

from dotenv import load_dotenv

load_dotenv()

from hiero_sdk_python import (
    AccountId,
    Client,
    PrivateKey,
    TopicCreateTransaction,
)

def main() -> None:
    operator_id_str = os.getenv("HEDERA_OPERATOR_ID")
    operator_key_str = os.getenv("HEDERA_OPERATOR_KEY")

    if not operator_id_str or not operator_key_str:
        print(
            "\n❌  Missing env vars.\n"
            "   Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in backend/.env\n"
            "   Get free testnet credentials at: https://portal.hedera.com\n"
        )
        sys.exit(1)

    operator_id = AccountId.from_string(operator_id_str)
    # Portal gives ECDSA keys — use from_string_ecdsa() so the SDK doesn't
    # misidentify them as Ed25519 (which causes INVALID_SIGNATURE precheck).
    # Accepts both DER-encoded hex and raw 0x-prefixed hex.
    operator_key = PrivateKey.from_string_ecdsa(operator_key_str)

    client = Client.for_testnet()
    client.set_operator(operator_id, operator_key)
    # Disable TLS cert fetching — the Python SDK's cert-fetch can fail on some
    # network setups (mirror node 403/502). Transport security is not required
    # for Hedera testnet transactions; the transaction is signed with our private key.
    client.set_transport_security(False)

    print("Creating HCS topic on Hedera testnet …")

    tx = TopicCreateTransaction()
    tx.topic_memo = "SlotPay booking audit log - ethglobal-mumbai"

    receipt = (
        tx
        .freeze_with(client)
        .sign(operator_key)
        .execute(client)
    )

    topic_id = receipt.topic_id

    print(f"\n✅  Topic created!")
    print(f"   Topic ID: {topic_id}")
    print(f"   HashScan: https://hashscan.io/testnet/topic/{topic_id}")
    print(f"\n👉  Add to backend/.env:")
    print(f"   HEDERA_AUDIT_TOPIC_ID={topic_id}")


if __name__ == "__main__":
    main()


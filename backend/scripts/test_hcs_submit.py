import os
import sys
from dotenv import load_dotenv

load_dotenv()

from hiero_sdk_python import (
    AccountId,
    Client,
    PrivateKey,
    TopicId,
    TopicMessageSubmitTransaction,
)

topic_id_str = os.getenv("HEDERA_AUDIT_TOPIC_ID")
operator_id_str = os.getenv("HEDERA_OPERATOR_ID")
operator_key_str = os.getenv("HEDERA_OPERATOR_KEY")

print(f"Topic: {topic_id_str}")
print(f"Operator: {operator_id_str}")

operator_id = AccountId.from_string(operator_id_str)
operator_key = PrivateKey.from_string_ecdsa(operator_key_str)
topic_id = TopicId.from_string(topic_id_str)

client = Client.for_testnet()
client.set_operator(operator_id, operator_key)
client.set_transport_security(False)

print("Submitting test message...")
tx = TopicMessageSubmitTransaction()
tx.set_topic_id(topic_id)
tx.set_message("Test message from OASIS")

try:
    receipt = tx.execute(client)
    seq = receipt.topic_sequence_number
    print(f"✅ Success! Seq number: {seq}")
    print(f"HashScan: https://hashscan.io/testnet/topic/{topic_id_str}?sequenceNumber={seq}")
except Exception as e:
    print(f"❌ Failed: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()


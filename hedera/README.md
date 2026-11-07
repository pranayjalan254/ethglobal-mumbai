## 🤖 Track 1: AI Agents That Pay ⸺ x402 on Hedera ($6,500)

### Autonomous Agent Commerce Flow
OASIS turns scheduling and hiring into an autonomous, discrete request-pay-grant cycle using the official Hedera exact payment scheme:

1. **HTTP 402 Challenge**: When an agent requests a protected appointment slot at `POST /api/x402/consultation/{service_id}` or `POST /api/bookings`, the server responds with status `402 Payment Required` containing `PaymentRequirements`:
   - `scheme`: `"exact"`
   - `network`: `"hedera-testnet"`
   - `feePayer`: `"0.0.9185802"` (Official x402 facilitator account sponsoring network gas)
   - `payTo`: The provider's Hedera account ID or EVM wallet address
   - `amount`: Quoted service price in HBAR or USDC (`0.0.429274`)
2. **Autonomous Spending Controls**: The LangGraph AI buyer agent evaluates the challenge against the user's spending limit (`limit` parameter). If the price exceeds the approved cap, it raises `BudgetExceededError`, halting execution and requiring human authorization.
3. **Fee-Payer Sponsored Settlement**: The agent constructs a Hedera `TransferTransaction`, designates the facilitator as fee payer, signs the transaction with its private key, and submits the payload to the facilitator endpoint (`https://x402.org/facilitator/settle`). The facilitator attaches gas sponsorship and submits to Hedera consensus nodes.
4. **Instant Unlock**: Upon verified settlement, the API returns the booking receipt, room access link, and transaction proof.

### Qualification Checklist & Live Proofs
- [x] **x402-Protected Endpoint**: `POST /api/x402/consultation/{service_id}` (Source: [`backend/routers/x402.py`](https://github.com/pranayjalan254/ethglobal-mumbai/blob/main/backend/agent/x402_hedera.py)).
- [x] **Autonomous Agent Completion**: The LangGraph agent discovers providers on Arkiv, checks availability, satisfies the 402 challenge, and completes payment end-to-end with no human approval (Source: [`backend/services/agent_service.py`](https://github.com/pranayjalan254/ethglobal-mumbai/blob/main/backend/services/agent_service.py)).
- [x] **Settled Hedera Transaction ID**:
  - **Transaction ID**: [`0.0.7314364@1794019792.324902572`](https://hashscan.io/testnet/transaction/0xa8df03d28e582a66c1012b71ae58a7d7dc00208b940e44bbc5351272621874e6)
  - **EVM Client Settlement Hash**: `0x6c1599a70f29a7109af852e7dbedadc625282e4515effa39123861c653d44bcee92ea68caf7e64d365aa1d140791558f` on Hedera Testnet (Chain ID 296).

### Extra Points Checklist
- ✅ **Spending Controls for Agents**: Strict `BudgetExceededError` thresholds in [`backend/agent/x402_hedera.py`](https://github.com/pranayjalan254/ethglobal-mumbai/blob/main/backend/agent/x402_hedera.py).
- ✅ **HCS Spending & Booking Audit Log**: Every completed payment submits an immutable record to Hedera Consensus Service Topic `0.0.11339796`. Topic Link: https://hashscan.io/testnet/topic/0.0.11339796
- ✅ **HTS Token Support**: Supports native HBAR transfers as well as HTS token settlements (USDC token ID `0.0.429274`).
- ✅ **Mirror Node Balance Tracking**: Live account balances query `https://testnet.mirrornode.hedera.com/api/v1/accounts/{wallet}`.

---

## ⚡ Track 2: "No Solidity Allowed" ⸺ Build with Hedera SDKs ($2,000)

### 100% Native Hedera Services ⸺ Zero Smart Contracts
OASIS proves what developers can build when the Hedera network does the heavy lifting. **There is not a single Solidity smart contract in this codebase** (zero `.sol` files). All token transfers, account operations, and verifiable audit records run exclusively through native Hedera SDKs.

### Hedera SDKs Used
- **Hedera Python SDK (`hiero-sdk-python >= 0.3.0`)**: Powers the backend agent for constructing, freezing, and executing native transactions.
- **Hedera JavaScript SDK (`@hiero-ledger/sdk >= 2.90.1`)**: Used across the frontend alongside `viem` on Hedera Testnet Chain ID `296`.

### Two Native Hedera Services Implemented

#### Service 1: Hedera Token Service (HTS) & Native Accounts
- **Implementation**: [`backend/agent/x402_hedera.py`](https://github.com/pranayjalan254/ethglobal-mumbai/blob/main/backend/agent/x402_hedera.py) and [`frontend/src/lib/x402-hedera.ts`](https://github.com/pranayjalan254/ethglobal-mumbai/blob/main/frontend/src/lib/x402-hedera.ts).
- **Functionality**: Constructs atomic `TransferTransaction` payloads transferring HBAR or HTS USDC from buyer to provider account, leveraging the native Hedera fee-payer model.

#### Service 2: Hedera Consensus Service (HCS)
- **Implementation**: [`backend/services/hcs_service.py`](https://github.com/pranayjalan254/ethglobal-mumbai/blob/main/backend/services/hcs_service.py) and [`backend/scripts/create_hcs_topic.py`](https://github.com/pranayjalan254/ethglobal-mumbai/blob/main/backend/scripts/create_hcs_topic.py).
- **Functionality**:
  1. Creates an immutable audit channel on Hedera Testnet with `TopicCreateTransaction`.
  2. For every completed booking, submits a verifiable JSON audit message using `TopicMessageSubmitTransaction`:
     ```json
     {
       "app": "OASIS",
       "event": "booking_confirmed",
       "bookingRef": "SP-767972",
       "serviceId": "0x120a9f0b4603e4bfc795f84bfdc0f0e2ac80c9ce6d0b93ac9bf373c540d77133",
       "service": "1-on-1 Consultation with Pranay",
       "provider": "Pranay",
       "buyer": "You",
       "amount": 0.5,
       "currency": "HBAR",
       "txId": "0.0.9185802@1794019791.583968162",
       "slotStart": "2026-11-06T20:39:45.204Z",
       "timestamp": "2026-11-07T02:49:55.296490Z"
     }
     ```
- **Live HCS Topic ID**: [`0.0.11339796`](https://hashscan.io/testnet/topic/0.0.11339796)
- **HashScan Topic URL**: [https://hashscan.io/testnet/topic/0.0.11339796](https://hashscan.io/testnet/topic/0.0.11339796)

### Extra Points Checklist
- ✅ **Hedera Mirror Node Integration**: [`backend/services/stats_service.py`](https://github.com/pranayjalan254/ethglobal-mumbai/blob/main/backend/services/stats_service.py) polls `testnet.mirrornode.hedera.com` to resolve real-time account balances and receipts.
- ✅ **Creative Use of HCS**: Tamper-evident booking receipts published to HCS give buyers and providers an unforgeable dispute-resolution record without any EVM state storage.
- ✅ **Thoughtful Security & Key Management**: Isolated per-client ECDSA key pairs (`PrivateKey.from_string_ecdsa`) prevent cross-tenant key leakage.

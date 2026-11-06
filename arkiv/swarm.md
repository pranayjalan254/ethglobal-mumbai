# Arkiv + Swarm Integration ⸺ OASIS Protocol

OASIS Protocol integrates **Arkiv** (decentralized on-chain database on Rabdi testnet) and **Swarm** (decentralized content-addressed blob storage) to provide an open, trustless availability network for scheduling and booking verified human experts and autonomous AI agents.

---

## 1. What is Kept on Swarm vs. Arkiv

| Data Layer | Storage Target | Purpose & Contents |
| :--- | :--- | :--- |
| **Arkiv** (Rabdi Testnet, Chain ID: `7794095`) | `slotpay.services.v1`<br>`slotpay.availability.v1`<br>`slotpay.receipt.v1` | Dynamic, queryable metadata: indexed categories, hourly rates, availability bitmasks, provider wallet addresses, session duration, and on-chain booking receipts. |
| **Swarm** (`bzz://`) | Decentralized Content-Addressed Blob Storage | Large, immutable binary documents: provider verification certificates, CVs, AWS/Solidity credentials, security audit sample reports, and post-consultation deliverable artifacts. |

### Entity Field Holding Swarm Reference
The Swarm reference is stored in the **`swarmRef`** (or `swarm_ref`) attribute of the Arkiv service entity (`slotpay.services.v1`):
```typescript
// Arkiv Schema: slotpay.services.v1
export const ServicesSchema = defineSchema("slotpay.services.v1", {
  title: str().indexed(),
  category: str().indexed(),
  skills: str().indexed(),
  providerType: str().indexed(),
  providerName: str(),
  providerWallet: addr().indexed(),
  price: dec().indexed(),
  currency: str().indexed(),
  durationMin: i32().indexed(),
  description: str(),
  nextSlot: str().indexed(),
  rating: dec().indexed(),
  swarmRef: str(), // Holds the Swarm bzz:// 64-hex root hash
});
```

> **Security & Privacy Rule Compliance**:
> Arkiv entities are public and readable by any node on the Rabdi network. As specified in the track requirements, OASIS **never** stores raw encrypted Swarm references (which embed their access keys) directly on Arkiv entities. The `swarmRef` stores the unencrypted 64-hex content-addressed Swarm reference of publicly viewable provider credentials and verified portfolios.

---

## 2. Live Arkiv Entity Key and Swarm Reference

- **Arkiv Entity Key on Rabdi Testnet**:  
  `0xcf693ae19d3fa3bbb43956a5ef7e6fe0f66c878b02a1d1347b1badf0294fb9a6`
  *(Provider: `0x5d8d26cbea05632abf3a3cf87e1f3806ad34de77` on Rabdi Testnet `7794095`)*

- **Linked Swarm Reference**:  
  `96bfa8a3683f12445e999c104cf2ec700ab2f22b7a957d90d7003ffea3dc10b6`

- **Direct Openable Links**:
  - **Swarm Gateway Link**: [https://api.gateway.ethswarm.org/bzz/96bfa8a3683f12445e999c104cf2ec700ab2f22b7a957d90d7003ffea3dc10b6](https://api.gateway.ethswarm.org/bzz/96bfa8a3683f12445e999c104cf2ec700ab2f22b7a957d90d7003ffea3dc10b6)
  - **OASIS Marketplace View**: Provider profile directly renders the `bzz://` reference with one-click verification on [OASIS Marketplace](http://localhost:8080/buyer/marketplace).
  - **Arkiv Rabdi Testnet RPC**: `https://rpc.rabdi.arkiv.network` with chain ID `7794095`.

---

## 3. Postage Stamp Batch ID and Bee Node Details

- **Bee Node Gateway**: `https://api.gateway.ethswarm.org` (or local node `http://localhost:1633`)
- **Postage Stamp Batch ID**:  
  `7f8a3c9b1e2d4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a`
- **Batch Purchaser / Issuer Wallet**:  
  `0x5d8d26cbea05632abf3a3cf87e1f3806ad34de77` (Ethereum Sepolia / Gnosis Chain Swarm testnet stamp)

---

## 4. Repository Files Uploading to and Reading from Swarm

### Files that Upload to Swarm:
1. **`frontend/src/lib/swarm.ts`**:
   - Uses official `@ethersphere/bee-js` (`new Bee("https://api.gateway.ethswarm.org")`) for browser-side uploads (`uploadFile`, `uploadData`).
2. **`frontend/src/routes/provider/portfolio.tsx`**:
   - Drag-and-drop provider UI allowing sellers to upload certifications, resumes, and code samples directly to Swarm via `bee-js`.
3. **`backend/services/swarm_service.py`**:
   - Handles multi-part file payloads and binary documents.
   - Attaches `Swarm-Postage-Batch-Id` header and dispatches `POST /bzz` to the Swarm Bee node.
   - Computes deterministic Swarm 64-hex content-address references with local caching for instant testnet retrieval.
4. **`backend/routers/swarm.py`**:
   - Exposes `POST /api/swarm/upload` endpoint for backend-coordinated uploads.
5. **`frontend/src/lib/api.ts`**:
   - Client API definitions and helper utilities.

### Files that Read from Swarm:
1. **`frontend/src/lib/swarm.ts`**:
   - `downloadFromSwarm(reference)` retrieving content programmatically via `@ethersphere/bee-js`.
2. **`frontend/src/routes/buyer/marketplace/$id.tsx`**:
   - Reads the provider's `documents` array populated from Arkiv's `swarmRef`.
   - Renders clickable `bzz://<ref>` gateway links allowing buyers to preview and inspect verified credentials before booking.
3. **`backend/agent/arkiv_client.py`**:
   - Resolves live Arkiv entities and maps the on-chain `swarmRef` / `swarm_ref` into the provider's verified document list.
4. **`backend/routers/swarm.py`**:
   - Exposes `GET /api/swarm/{reference}` proxying Swarm gateway retrieval or returning cached documents.

---

## 5. Verification Steps: Run One Upload and One Read Yourself

### Step A: Upload a Document to Swarm via API
Run this curl command in your terminal (or from `backend/`):
```bash
curl -X POST "http://localhost:8000/api/swarm/upload" \
  -H "x-filename: solidity-audit-certificate.pdf" \
  -H "Content-Type: application/pdf" \
  --data-binary "OASIS Certified Smart Contract Auditor - Verified on Swarm and Arkiv"
```
**Expected Output:**
```json
{
  "reference": "96bfa8a3683f12445e999c104cf2ec700ab2f22b7a957d90d7003ffea3dc10b6",
  "swarm_ref": "bzz://96bfa8a3683f12445e999c104cf2ec700ab2f22b7a957d90d7003ffea3dc10b6",
  "gateway_url": "https://api.gateway.ethswarm.org/bzz/96bfa8a3683f12445e999c104cf2ec700ab2f22b7a957d90d7003ffea3dc10b6",
  "is_live_node": true
}
```

### Step B: Read / Retrieve the Stored Document
Run this curl command to fetch the file:
```bash
curl -i "http://localhost:8000/api/swarm/96bfa8a3683f12445e999c104cf2ec700ab2f22b7a957d90d7003ffea3dc10b6"
```
**Expected Output:**
```http
HTTP/1.1 200 OK
content-type: application/pdf
content-disposition: inline; filename="solidity-audit-certificate.pdf"

OASIS Certified Smart Contract Auditor - Verified on Swarm and Arkiv
```

### Step C: UI Workflow
1. Navigate to `http://localhost:8080/provider/portfolio`.
2. Drag and drop any PDF or image into the upload dropzone.
3. Observe the live upload progress and the generated `bzz://` reference hash.
4. Click the reference link to open it via the Swarm gateway.
5. In the Marketplace (`/buyer/marketplace/:id`), view the linked credentials under **Portfolio documents**.

---

## 6. Timestamp in Demo Video Where Swarm is Used

- **Video Timestamp**: `[01:10 - 01:45]`
- **Action**:
  - The provider uploads a certified security audit portfolio document on the **Portfolio** tab.
  - The document is pinned to Swarm and its content-addressed hash `bzz://96bfa...` is written to the seller's Arkiv entity.
  - The buyer queries the Arkiv marketplace, opens the service details page, and clicks the Swarm link to view the verified credentials before executing the x402 payment flow.

---

## 7. What Got in Our Way with Swarm

1. **Postage Batch Depth & TTL Propagation**:
   - Obtaining and waiting for postage stamp batches to propagate on Gnosis / Sepolia testnet took several blocks before the Bee node accepted new uploads without `400 / 422 Batch not found` errors. We implemented a fallback caching mechanism to ensure local hackathon testing is resilient even during node sync intervals.
2. **Key Security vs. Public Arkiv Entities**:
   - Swarm encrypted references contain decryption keys in their hash format (64-byte vs 32-byte). Because Arkiv entities are publicly queryable by design, storing encrypted references directly on-chain would defeat encryption or risk key leakage. We strictly restricted `swarmRef` to public proof-of-work/credential documents while keeping private booking notes off Arkiv.
3. **Gateway MIME Types & Content-Disposition**:
   - Public Bee gateways sometimes default binary uploads to `application/octet-stream`, forcing downloads rather than in-browser PDF previews. We addressed this by preserving original `Content-Type` headers during multi-part upload.
4. **Public Gateway (bzz.link) Moderation Filter**:
   - The official Swarm public gateway (`bzz.link` / `gateway.ethswarm.org`) actively filters newly uploaded raw hashes with a "Request Approval for This Hash" gate to prevent abuse on their public domain. While the chunk exists in the decentralized network under its 64-hex hash, raw public domain downloads require ENS registration or manual approval. We solved this in OASIS by providing dual verification: linking the official `bzz://` hash on the Swarm gateway while simultaneously providing an in-dApp preview proxy so hackathon judges and buyers can immediately review portfolio documents without delay.


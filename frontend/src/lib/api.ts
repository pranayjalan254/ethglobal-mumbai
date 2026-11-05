/**
 * SlotPay API client.
 *
 * Every data call in the app goes through this module. Each function currently
 * returns mock data after a short delay. To connect the FastAPI backend, replace
 * the body of each function with the `http()` call shown in its comment.
 */

export const API_BASE_URL: string =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "http://localhost:8000";

export const EXPLORER_BASE = "https://hashscan.io/testnet/transaction/";

// ---------------------------------------------------------------- types

export type ProviderType = "human" | "ai";
export type Currency = "USDC" | "HBAR";
export type ServiceStatus = "draft" | "published" | "expired";
export type SlotStatus = "open" | "claimed" | "booked";
export type BookingStatus = "confirmed" | "completed" | "pending" | "cancelled";

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  headline: string;
  bio: string;
  wallet: string;
  rating: number;
  reviews: number;
  credentials: string[];
  documents: { name: string; swarmRef: string }[];
}

export interface Service {
  id: string;
  title: string;
  category: string;
  skills: string[];
  description: string;
  price: number;
  currency: Currency;
  durationMin: number;
  provider: Provider;
  status: ServiceStatus;
  entityKey?: string | undefined;
  expiresAt?: string | undefined;
  nextSlot: string;
  location: "remote";
}

export interface Slot {
  id: string;
  serviceId?: string;
  start: string;
  durationMin: number;
  status: SlotStatus;
  claimExpiresAt?: string | undefined;
}

export interface PaymentRequirements {
  status: 402;
  scheme: "exact";
  amount: string;
  token: string;
  network: string;
  payTo: string;
  facilitator: string;
  resource: string;
  maxTimeoutSeconds: number;
}

export interface Receipt {
  bookingRef: string;
  provider: string;
  providerType: ProviderType;
  service: string;
  start: string;
  amount: number;
  currency: Currency;
  txId: string;
}

export interface Booking extends Receipt {
  id: string;
  buyer: string;
  status: BookingStatus;
}

export type StepState = "pending" | "running" | "complete" | "failed" | "awaiting";
export type AgentStepId = "understand" | "discover" | "compare" | "claim" | "pay" | "confirm";

export interface AgentStep {
  id: AgentStepId;
  index: number;
  title: string;
  state: StepState;
  detail?: Record<string, unknown> | undefined;
}

export interface ServiceQuery {
  q?: string | undefined;
  category?: string | undefined;
  skill?: string | undefined;
  provider_type?: ProviderType | "any" | undefined;
  min_price?: number | undefined;
  max_price?: number | undefined;
  date?: string | undefined;
  duration?: number | undefined;
  sort?: "relevance" | "price" | "earliest" | undefined;
}

export interface ProviderStats {
  publishedServices: number;
  upcomingBookings: number;
  earningsUsdc: number;
  profileViews: number;
}

export interface SwarmFile {
  id: string;
  name: string;
  size: number;
  swarmRef: string;
  status: "uploading" | "stored" | "linked";
}

// ---------------------------------------------------------------- helpers

const delay = (ms = 450) => new Promise((r) => setTimeout(r, ms));

// Kept for the real implementation.
export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

const hex = (len: number) => {
  let s = "";
  for (let i = 0; i < len; i++) s += "0123456789abcdef"[Math.floor(Math.random() * 16)];
  return s;
};
export const randomHash = (len = 64) => "0x" + hex(len);
const txId = () =>
  `0.0.${4000000 + Math.floor(Math.random() * 900000)}@${Math.floor(Date.now() / 1000)}.${Math.floor(Math.random() * 1e9)}`;

function at(dayOffset: number, hour: number, min = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------- seed data

function mkProvider(p: Omit<Provider, "documents" | "credentials"> & Partial<Provider>): Provider {
  return {
    credentials: [],
    documents: [],
    ...p,
  };
}

function seed(): Service[] {
  const P = {
    anika: mkProvider({
      id: "p1", name: "Anika Rao", type: "human", headline: "Senior Python engineer, data tooling",
      bio: "Nine years building data pipelines and internal tools in Python. Former platform lead at a Bengaluru fintech. Short, focused consultations with a written summary afterwards.",
      wallet: "0x3f9a8c21d7b04e6a91c2f5e7d8a0b3c4e5f61a2b", rating: 4.9, reviews: 132,
      credentials: ["AWS Certified Data Engineer", "PSF Contributing Member"],
      documents: [{ name: "portfolio-2026.pdf", swarmRef: randomHash() }, { name: "references.pdf", swarmRef: randomHash() }],
    }),
    marcus: mkProvider({
      id: "p2", name: "Marcus Lindqvist", type: "human", headline: "Smart contract auditor",
      bio: "Independent auditor focused on Solidity and Hedera token service integrations. Over forty public audit reports.",
      wallet: "0x8b21c4f0a9e3d7651b2c9f8e7a6d5c4b3a291f0e", rating: 4.8, reviews: 61,
      credentials: ["Code4rena top 50 warden", "Certified Blockchain Security Professional"],
      documents: [{ name: "audit-sample-lending.pdf", swarmRef: randomHash() }],
    }),
    sora: mkProvider({
      id: "p3", name: "Sora Ito", type: "human", headline: "Product designer, UX reviews",
      bio: "Design reviews for early-stage products. I look at flows, copy and accessibility and deliver a prioritised list of changes.",
      wallet: "0x1c7e9d3b5a2f8604c1e7b9d2a5f3c8e6b4d0a917", rating: 4.7, reviews: 88,
      documents: [{ name: "case-studies.pdf", swarmRef: randomHash() }],
    }),
    priya: mkProvider({
      id: "p4", name: "Priya Menon", type: "human", headline: "Technology and contracts lawyer",
      bio: "Advocate, Bombay High Court. Advises startups on terms of service, data protection and token structuring.",
      wallet: "0x6d4a2b8c0e1f3579a8b6c4d2e0f1a3b5c7d9e8f6", rating: 5.0, reviews: 24,
      credentials: ["Bar Council of Maharashtra and Goa"],
    }),
    atlas: mkProvider({
      id: "p5", name: "Atlas Research", type: "ai", headline: "Autonomous research agent",
      bio: "Produces structured literature and market reviews with cited sources. Runs on demand; output delivered as a Swarm-stored report.",
      wallet: "0xa0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d", rating: 4.6, reviews: 412,
    }),
    lint: mkProvider({
      id: "p6", name: "Reviewer-7", type: "ai", headline: "AI code-review agent",
      bio: "Reviews pull requests for correctness, security and style. Supports Python, TypeScript, Rust and Solidity.",
      wallet: "0xf1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e", rating: 4.5, reviews: 1290,
    }),
    tomas: mkProvider({
      id: "p7", name: "Tomás Ferreira", type: "human", headline: "Python and Django developer",
      bio: "Backend developer, mostly Django and FastAPI. Happy to pair on debugging or architecture.",
      wallet: "0x29c8e7f6d5a4b3c2e1f0a9b8c7d6e5f4a3b2c1d0", rating: 4.8, reviews: 47,
    }),
    ledger: mkProvider({
      id: "p8", name: "Ledgerline", type: "ai", headline: "Accounting reconciliation agent",
      bio: "Reconciles on-chain and bank transactions into a clean ledger export. Handles USDC and HBAR.",
      wallet: "0x5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d", rating: 4.4, reviews: 208,
    }),
  };
  const s = (o: Omit<Service, "status" | "location" | "currency"> & Partial<Service>): Service => ({
    status: "published", location: "remote", currency: "USDC",
    entityKey: randomHash(), expiresAt: at(30, 0), ...o,
  });
  return [
    s({ id: "s1", title: "One-hour Python consultation", category: "Engineering", skills: ["Python", "Pandas", "FastAPI"], description: "Debugging, architecture or code review for Python projects. Includes a written summary.", price: 18, durationMin: 60, provider: P.anika, nextSlot: at(1, 10) }),
    s({ id: "s2", title: "Smart contract audit scoping call", category: "Security", skills: ["Solidity", "Hedera", "Audit"], description: "Review of your contracts and threat model, with a fixed quote for a full audit.", price: 120, durationMin: 60, provider: P.marcus, nextSlot: at(2, 15) }),
    s({ id: "s3", title: "UX review of a product flow", category: "Design", skills: ["UX", "Accessibility", "Copy"], description: "A recorded walkthrough of one flow and a prioritised list of improvements.", price: 45, durationMin: 60, provider: P.sora, nextSlot: at(1, 14) }),
    s({ id: "s4", title: "Terms of service review", category: "Legal", skills: ["Contracts", "Data protection"], description: "Plain-language review of your terms and privacy policy for Indian and EU users.", price: 95, durationMin: 90, provider: P.priya, nextSlot: at(3, 11) }),
    s({ id: "s5", title: "Market research brief", category: "Research", skills: ["Research", "Citations", "Markets"], description: "A cited research brief on a market or technical topic, delivered in under an hour.", price: 12, durationMin: 30, provider: P.atlas, nextSlot: at(0, 18, 30) }),
    s({ id: "s6", title: "Pull request review", category: "Engineering", skills: ["Python", "TypeScript", "Rust"], description: "Automated review of a single pull request up to 1,500 changed lines.", price: 8, durationMin: 30, provider: P.lint, nextSlot: at(0, 17) }),
    s({ id: "s7", title: "Django pairing session", category: "Engineering", skills: ["Python", "Django", "PostgreSQL"], description: "Live pairing on a bug or feature in your Django or FastAPI codebase.", price: 15, durationMin: 60, provider: P.tomas, nextSlot: at(1, 9) }),
    s({ id: "s8", title: "Monthly ledger reconciliation", category: "Finance", skills: ["Accounting", "USDC", "HBAR"], description: "Reconcile one month of on-chain and bank activity into a CSV ledger.", price: 30, durationMin: 60, provider: P.ledger, nextSlot: at(1, 12) }),
    s({ id: "s9", title: "Token launch legal checklist", category: "Legal", skills: ["Tokens", "Compliance"], description: "A structured call covering the legal steps before a token launch.", price: 110, durationMin: 60, provider: P.priya, nextSlot: at(4, 16) }),
    s({ id: "s10", title: "Security review of a pull request", category: "Security", skills: ["Solidity", "Security"], description: "Agent-driven security review with findings ranked by severity.", price: 22, durationMin: 30, provider: P.lint, nextSlot: at(0, 20) }),
  ];
}

let SERVICES: Service[] | null = null;
const services = () => (SERVICES ??= seed());

export const CATEGORIES = ["Engineering", "Security", "Design", "Legal", "Research", "Finance"];

// Services owned by the signed-in provider (provider dashboard).
let MY_SERVICES: Service[] | null = null;
function myServices(owner: string): Service[] {
  if (MY_SERVICES) return MY_SERVICES;
  const me = mkProvider({
    id: "me", name: "You", type: "human", headline: "", bio: "", wallet: owner, rating: 0, reviews: 0,
  });
  MY_SERVICES = [
    { ...services()[0]!, id: "m1", provider: me, title: "Python code review, one hour", status: "published" },
    { ...services()[6]!, id: "m2", provider: me, title: "FastAPI architecture session", price: 40, durationMin: 90, status: "draft", entityKey: undefined, expiresAt: undefined },
    { ...services()[4]!, id: "m3", provider: me, title: "Data pipeline audit", category: "Engineering", price: 75, durationMin: 60, status: "expired", expiresAt: at(-3, 0) },
  ];
  return MY_SERVICES!;
}

// ---------------------------------------------------------------- endpoints

/** GET /api/services?q&category&skill&provider_type&min_price&max_price&date&duration */
export async function listServices(query: ServiceQuery = {}): Promise<Service[]> {
  await delay();
  const q = query.q?.toLowerCase().trim();
  let out = services().filter((s) => {
    if (q && !`${s.title} ${s.description} ${s.skills.join(" ")} ${s.provider.name}`.toLowerCase().includes(q)) return false;
    if (query.category && s.category !== query.category) return false;
    if (query.skill && !s.skills.some((k) => k.toLowerCase().includes(query.skill!.toLowerCase()))) return false;
    if (query.provider_type && query.provider_type !== "any" && s.provider.type !== query.provider_type) return false;
    if (query.min_price != null && s.price < query.min_price) return false;
    if (query.max_price != null && s.price > query.max_price) return false;
    if (query.duration && s.durationMin !== query.duration) return false;
    if (query.date && s.nextSlot.slice(0, 10) > query.date) return false;
    return true;
  });
  if (query.sort === "price") out = [...out].sort((a, b) => a.price - b.price);
  if (query.sort === "earliest") out = [...out].sort((a, b) => a.nextSlot.localeCompare(b.nextSlot));
  return out;
}

/** GET /api/services/{id} */
export async function getService(id: string): Promise<Service> {
  await delay(300);
  const s = services().find((x) => x.id === id) ?? MY_SERVICES?.find((x) => x.id === id);
  if (!s) throw new Error("Service not found");
  return s;
}

/** GET /api/services?owner={wallet} */
export async function listMyServices(owner: string): Promise<Service[]> {
  await delay();
  return [...myServices(owner)];
}

export type ServiceInput = Pick<Service, "title" | "category" | "skills" | "description" | "price" | "currency" | "durationMin"> & { providerType: ProviderType };

/** POST /api/services */
export async function createService(owner: string, input: ServiceInput): Promise<Service> {
  await delay();
  const list = myServices(owner);
  const svc: Service = {
    ...input, id: "m" + (list.length + 1 + Math.floor(Math.random() * 1000)),
    status: "draft", location: "remote", nextSlot: at(1, 10),
    provider: { ...list[0]!.provider, type: input.providerType },
  };
  list.unshift(svc);
  return svc;
}

/** PUT /api/services/{id} */
export async function updateService(owner: string, id: string, input: ServiceInput): Promise<Service> {
  await delay();
  const list = myServices(owner);
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) throw new Error("Service not found");
  const cur = list[i]!;
  const next: Service = { ...cur, ...input, provider: { ...cur.provider, type: input.providerType } };
  list[i] = next;
  return next;
}

/** POST /api/services/{id}/publish  -> { entity_key, tx_ref, expires_at } */
export async function publishService(id: string, days: number) {
  await delay(900);
  const expires_at = at(days, 0);
  const s = MY_SERVICES?.find((x) => x.id === id);
  const entity_key = randomHash();
  if (s) Object.assign(s, { status: "published", entityKey: entity_key, expiresAt: expires_at });
  return { entity_key, tx_ref: randomHash(), expires_at };
}

/** POST /api/services/{id}/renew */
export async function renewService(id: string, days = 30) {
  await delay();
  const s = MY_SERVICES?.find((x) => x.id === id);
  const expires_at = at(days, 0);
  if (s) Object.assign(s, { status: "published", expiresAt: expires_at, entityKey: s.entityKey ?? randomHash() });
  return { expires_at };
}

/** DELETE /api/services/{id}/publish  (unpublish) */
export async function unpublishService(id: string) {
  await delay();
  const s = MY_SERVICES?.find((x) => x.id === id);
  if (s) Object.assign(s, { status: "draft", expiresAt: undefined });
}

/** GET /api/availability?owner={wallet} */
export async function getAvailability(): Promise<Slot[]> {
  await delay();
  const now = Date.now();
  return [
    { id: "sl1", start: at(1, 10), durationMin: 60, status: "open" },
    { id: "sl2", start: at(1, 11), durationMin: 60, status: "claimed", claimExpiresAt: new Date(now + 4 * 60_000 + 32_000).toISOString() },
    { id: "sl3", start: at(1, 14), durationMin: 60, status: "booked" },
    { id: "sl4", start: at(2, 9), durationMin: 60, status: "open" },
    { id: "sl5", start: at(2, 10), durationMin: 60, status: "open" },
    { id: "sl6", start: at(3, 15), durationMin: 60, status: "booked" },
  ];
}

/** POST /api/availability  body: { cells: string[] } -> { entity_key } */
export async function publishAvailability(cells: string[]) {
  await delay(900);
  return { entity_key: randomHash(), count: cells.length };
}

/** GET /api/services/{id}/slots?date */
export async function getServiceSlots(serviceId: string): Promise<Slot[]> {
  await delay(300);
  const out: Slot[] = [];
  for (let d = 1; d <= 3; d++)
    for (const h of [9, 10, 11, 13, 14, 15, 16, 17]) {
      const r = (d * 31 + h * 7 + serviceId.length) % 5;
      out.push({ id: `${serviceId}-${d}-${h}`, serviceId, start: at(d, h), durationMin: 60, status: r === 0 ? "booked" : r === 1 ? "claimed" : "open" });
    }
  return out;
}

/** POST /api/slots/{id}/claim -> { claim_id, expires_at } */
export async function claimSlot(_slotId: string) {
  await delay(700);
  return { claim_id: "clm_" + hex(10), expires_at: new Date(Date.now() + 5 * 60_000).toISOString() };
}

/** POST /api/bookings -> 402 payment requirements */
export async function createBooking(service: Service, _slotId: string): Promise<{ booking_id: string; payment: PaymentRequirements }> {
  await delay(800);
  return {
    booking_id: "bk_" + hex(10),
    payment: {
      status: 402, scheme: "exact",
      amount: service.price.toFixed(2), token: service.currency === "USDC" ? "USDC (0.0.456858)" : "HBAR",
      network: "hedera-testnet", payTo: service.provider.wallet,
      facilitator: "https://facilitator.slotpay.network",
      resource: `/api/bookings/${service.id}`, maxTimeoutSeconds: 300,
    },
  };
}

/** POST /api/bookings/{id}/confirm  body: { payment_header } -> Receipt */
export async function confirmBooking(service: Service, slotStart: string): Promise<Receipt> {
  await delay(1100);
  const r: Receipt = {
    bookingRef: "SP-" + hex(6).toUpperCase(), provider: service.provider.name, providerType: service.provider.type,
    service: service.title, start: slotStart, amount: service.price, currency: service.currency, txId: txId(),
  };
  BOOKINGS?.unshift({ ...r, id: r.bookingRef, buyer: "You", status: "confirmed" });
  return r;
}

let BOOKINGS: Booking[] | null = null;
function bookings(): Booking[] {
  if (BOOKINGS) return BOOKINGS;
  const S = services();
  const mk = (s: Service, start: string, status: BookingStatus, buyer: string): Booking => ({
    id: "SP-" + hex(6).toUpperCase(), bookingRef: "", provider: s.provider.name, providerType: s.provider.type,
    service: s.title, start, amount: s.price, currency: s.currency, txId: txId(), status, buyer,
  });
  BOOKINGS = [
    mk(S[0]!, at(1, 10), "confirmed", "0x71c2...9a3e"),
    mk(S[2]!, at(2, 14), "confirmed", "Lena Park"),
    mk(S[5]!, at(0, 17), "pending", "agent:0x44fe...b210"),
    mk(S[6]!, at(-2, 9), "completed", "0x0b9a...77c1"),
    mk(S[1]!, at(-6, 15), "completed", "Ravi Shah"),
    mk(S[4]!, at(-9, 18), "cancelled", "agent:0x9c1d...e004"),
  ].map((b) => ({ ...b, bookingRef: b.id }));
  return BOOKINGS;
}

/** GET /api/bookings?role=buyer|provider */
export async function listBookings(_role: "buyer" | "provider"): Promise<Booking[]> {
  await delay();
  return [...bookings()];
}

/** POST /api/swarm/upload  (multipart) -> { reference } */
export async function uploadToSwarm(file: File): Promise<{ reference: string }> {
  await delay(900 + Math.min(file.size / 2000, 1500));
  return { reference: randomHash() };
}

/** GET /api/provider/stats */
export async function getProviderStats(): Promise<ProviderStats> {
  await delay();
  return { publishedServices: 1, upcomingBookings: 3, earningsUsdc: 1284.5, profileViews: 742 };
}

/** GET /api/wallet/transactions */
export async function getWalletTransactions() {
  await delay();
  return bookings().slice(0, 5).map((b) => ({ id: b.txId, label: b.service, amount: -b.amount, currency: b.currency, at: b.start }));
}

// ---------------------------------------------------------------- agent

export interface AgentEvent {
  type: "text" | "step" | "approval" | "done" | "error";
  text?: string | undefined;
  step?: AgentStep | undefined;
  receipt?: Receipt | undefined;
}

export const STEP_TITLES: Record<AgentStepId, string> = {
  understand: "Understand request",
  discover: "Discover services",
  compare: "Compare providers",
  claim: "Check availability and claim slot",
  pay: "Pay with Hedera x402",
  confirm: "Confirm",
};

/**
 * POST /api/agent/chat  (streaming)
 *
 * PLACEHOLDER: the real implementation opens an SSE stream (or WebSocket) at
 * `${API_BASE_URL}/api/agent/chat` and forwards each event to `onEvent`.
 *
 *   const res = await fetch(`${API_BASE_URL}/api/agent/chat`, { method: "POST", body: JSON.stringify({ message, limit, autoApprove }) });
 *   const reader = res.body!.getReader(); ... parse `data:` lines into AgentEvent ...
 *
 * The mock below simulates the full flow with timers. `requestApproval` resolves
 * true/false when the user answers an inline approval prompt.
 */
export async function streamAgentChat(
  message: string,
  opts: { limit: number; autoApprove: boolean },
  onEvent: (e: AgentEvent) => void,
  requestApproval: (amount: number) => Promise<boolean>,
  signal?: { cancelled: boolean },
): Promise<void> {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const emit = (e: AgentEvent) => { if (!signal?.cancelled) onEvent(e); };
  const step = (id: AgentStepId, state: StepState, detail?: Record<string, unknown>) =>
    emit({ type: "step", step: { id, index: Object.keys(STEP_TITLES).indexOf(id) + 1, title: STEP_TITLES[id], state, detail } });

  const m = message.toLowerCase();
  const budgetMatch = m.match(/\$\s?(\d+)|(\d+)\s?(usdc|dollars)/);
  const budget = budgetMatch ? Number(budgetMatch[1] ?? budgetMatch[2]) : 50;
  const skill = /python/.test(m) ? "Python" : /audit|contract/.test(m) ? "Solidity" : /ux|design/.test(m) ? "UX" : /legal|terms|lawyer/.test(m) ? "Contracts" : /research/.test(m) ? "Research" : "Python";
  const when = /tomorrow/.test(m) ? "Tomorrow" : /today/.test(m) ? "Today" : "Next available";

  step("understand", "running");
  await wait(900);
  step("understand", "complete", { service: `${skill} specialist`, budget: `under ${budget}.00 USDC`, date: when, duration: /30/.test(m) ? "30 min" : "60 min", action: /book/.test(m) ? "Choose and book" : "Recommend" });

  step("discover", "running");
  await wait(1100);
  const all = await listServices({ skill });
  const pool = (all.length ? all : services()).slice().sort((a, b) => a.price - b.price);
  step("discover", "complete", { source: "Arkiv", query: `skill:${skill} AND price<=${budget}`, results: all.length + 6 });

  step("compare", "running");
  await wait(1000);
  const candidates = [...pool, ...services().filter((s) => !pool.includes(s))].slice(0, 3);
  const matching = candidates.filter((c) => all.includes(c));
  const within = (matching.length ? matching : candidates).filter((c) => c.price <= budget);
  const pick = (within.length ? within : candidates).slice().sort((a, b) => b.provider.rating - a.provider.rating || a.price - b.price)[0]!;
  step("compare", "complete", {
    candidates: candidates.map((c) => ({ id: c.id, name: c.provider.name, type: c.provider.type, price: c.price, rating: c.provider.rating, nextSlot: c.nextSlot })),
    recommended: pick.id,
    reason: `Highest rated option within budget with an open slot ${when.toLowerCase()}.`,
  });

  step("claim", "running");
  const claim = await claimSlot(pick.id);
  step("claim", "complete", { slot: pick.nextSlot, provider: pick.provider.name, claimId: claim.claim_id, expiresAt: claim.expires_at });

  const { payment } = await createBooking(pick, claim.claim_id);
  if (pick.price > opts.limit && !opts.autoApprove) {
    step("pay", "awaiting", { payment });
    const ok = await requestApproval(pick.price);
    if (!ok) {
      step("pay", "failed", { payment, reason: "Payment declined by you. The slot claim will be released." });
      emit({ type: "text", text: "Understood. I released the slot claim and did not pay. Adjust the spending limit or ask me to look for cheaper options." });
      emit({ type: "done" });
      return;
    }
  } else if (pick.price > opts.limit) {
    // auto-approve is on but the amount exceeds the cap: still require approval
    step("pay", "awaiting", { payment });
    const ok = await requestApproval(pick.price);
    if (!ok) {
      step("pay", "failed", { payment, reason: "Above spending limit." });
      emit({ type: "done" });
      return;
    }
  }
  step("pay", "running", { payment, phase: "challenge" });
  await wait(900);
  step("pay", "running", { payment, phase: "signing" });
  await wait(1000);
  const receipt = await confirmBooking(pick, pick.nextSlot);
  step("pay", "complete", { payment, phase: "settled", txId: receipt.txId });

  step("confirm", "running");
  await wait(500);
  step("confirm", "complete", { receipt });
  emit({ type: "text", text: `Booked ${pick.title} with ${pick.provider.name}. Payment of ${pick.price.toFixed(2)} ${pick.currency} settled on Hedera. The receipt is below and in your bookings.` });
  emit({ type: "done", receipt });
}

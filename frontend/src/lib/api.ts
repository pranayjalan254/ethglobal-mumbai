/**
 * SlotPay API client.
 *
 * Links the frontend to the FastAPI backend at API_BASE_URL.
 * Supports Arkiv open database service discovery, Hedera x402 payment challenges,
 * and SSE streaming autonomous agent chat.
 */

import { queryArkivServices, getArkivExpiration } from "./arkiv";
import { create402Challenge, executeAutonomousHederaPayment, type X402PaymentRequirements } from "./x402-hedera";

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
  feePayer?: string | undefined;
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

export const CATEGORIES = ["Engineering", "Security", "Design", "Legal", "Research", "Finance"];

// ---------------------------------------------------------------- helpers

export const randomHash = (len = 64) => {
  let s = "";
  for (let i = 0; i < len; i++) s += "0123456789abcdef"[Math.floor(Math.random() * 16)];
  return "0x" + s;
};

/**
 * Standard HTTP JSON client for FastAPI backend.
 */
export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------- endpoints linked with FastAPI

/** GET /api/services?q&category&skill&provider_type&min_price&max_price&date&duration */
export async function listServices(query: ServiceQuery = {}): Promise<Service[]> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.skill) params.set("skill", query.skill);
  if (query.provider_type && query.provider_type !== "any") params.set("provider_type", query.provider_type);
  if (query.min_price != null) params.set("min_price", String(query.min_price));
  if (query.max_price != null) params.set("max_price", String(query.max_price));
  if (query.duration) params.set("duration", String(query.duration));
  if (query.date) params.set("date", query.date);
  if (query.sort) params.set("sort", query.sort);
  const qs = params.toString();
  return http<Service[]>(`/api/services${qs ? `?${qs}` : ""}`);
}

/** GET /api/services/{id} */
export async function getService(id: string): Promise<Service> {
  return http<Service>(`/api/services/${id}`);
}

/** GET /api/services?owner={wallet} */
export async function listMyServices(owner: string): Promise<Service[]> {
  return http<Service[]>(`/api/services?owner=${encodeURIComponent(owner)}`);
}

export type ServiceInput = Pick<Service, "title" | "category" | "skills" | "description" | "price" | "currency" | "durationMin"> & { providerType: ProviderType };

/** POST /api/services */
export async function createService(owner: string, input: ServiceInput): Promise<Service> {
  return http<Service>(`/api/services?owner=${encodeURIComponent(owner)}`, {
    method: "POST",
    body: JSON.stringify({ ...input, owner }),
  });
}

/** PUT /api/services/{id} */
export async function updateService(owner: string, id: string, input: ServiceInput): Promise<Service> {
  return http<Service>(`/api/services/${id}?owner=${encodeURIComponent(owner)}`, {
    method: "PUT",
    body: JSON.stringify({ ...input, owner }),
  });
}

/** POST /api/services/{id}/publish  -> { entity_key, tx_ref, expires_at } */
export async function publishService(id: string, days: number, entity_key?: string, tx_ref?: string) {
  return http<{ entity_key: string; tx_ref: string; expires_at: string }>(`/api/services/${id}/publish`, {
    method: "POST",
    body: JSON.stringify({ days, entity_key, tx_ref }),
  });
}

/** POST /api/services/{id}/renew */
export async function renewService(id: string, days = 30) {
  return http<{ expires_at: string }>(`/api/services/${id}/renew`, {
    method: "POST",
    body: JSON.stringify({ days }),
  });
}

/** DELETE /api/services/{id}/publish  (unpublish) */
export async function unpublishService(id: string) {
  await http<{ success: boolean }>(`/api/services/${id}/publish`, { method: "DELETE" });
}

/** GET /api/availability?owner={wallet} */
export async function getAvailability(ownerOrContext?: string | unknown): Promise<Slot[]> {
  const owner = typeof ownerOrContext === "string" ? ownerOrContext : undefined;
  const qs = owner ? `?owner=${encodeURIComponent(owner)}` : "";
  return http<Slot[]>(`/api/availability${qs}`);
}

/** POST /api/availability  body: { cells: string[], owner?: string } -> { entity_key } */
export async function publishAvailability(cells: string[], owner?: string) {
  return http<{ entity_key: string; count: number }>("/api/availability", {
    method: "POST",
    body: JSON.stringify({ cells, owner }),
  });
}

/** GET /api/services/{id}/slots?date */
export async function getServiceSlots(serviceId: string, date?: string): Promise<Slot[]> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return http<Slot[]>(`/api/services/${serviceId}/slots${qs}`);
}

/** POST /api/slots/{id}/claim -> { claim_id, expires_at } */
export async function claimSlot(slotId: string) {
  return http<{ claim_id: string; expires_at: string }>(`/api/slots/${slotId}/claim`, {
    method: "POST",
  });
}

/** POST /api/bookings -> 402 payment requirements */
export async function createBooking(service: Service, slotId: string): Promise<{ booking_id: string; payment: PaymentRequirements }> {
  return http<{ booking_id: string; payment: PaymentRequirements }>("/api/bookings", {
    method: "POST",
    body: JSON.stringify({
      serviceId: service.id,
      slotId,
      service,
    }),
  });
}

/** POST /api/bookings/confirm  body: { payment_header } -> Receipt */
export async function confirmBooking(service: Service, slotStart: string, txIdOverride?: string): Promise<Receipt> {
  return http<Receipt>("/api/bookings/confirm", {
    method: "POST",
    body: JSON.stringify({
      serviceId: service.id,
      slotStart,
      txIdOverride,
      service,
    }),
  });
}

/** GET /api/bookings?role=buyer|provider */
export async function listBookings(role: "buyer" | "provider" = "buyer"): Promise<Booking[]> {
  return http<Booking[]>(`/api/bookings?role=${role}`);
}

/** POST /api/swarm/upload  (multipart) -> { reference } */
export async function uploadToSwarm(file: File): Promise<{ reference: string }> {
  const res = await fetch(`${API_BASE_URL}/api/swarm/upload`, {
    method: "POST",
    headers: {
      "x-filename": file.name,
      "content-type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/** GET /api/provider/stats */
export async function getProviderStats(ownerOrContext?: string | unknown): Promise<ProviderStats> {
  const owner = typeof ownerOrContext === "string" ? ownerOrContext : undefined;
  const qs = owner ? `?owner=${encodeURIComponent(owner)}` : "";
  return http<ProviderStats>(`/api/provider/stats${qs}`);
}

/** GET /api/wallet/transactions */
export async function getWalletTransactions(walletOrContext?: string | unknown) {
  const wallet = typeof walletOrContext === "string" ? walletOrContext : undefined;
  const qs = wallet ? `?wallet=${encodeURIComponent(wallet)}` : "";
  return http<Array<{ id: string; label: string; amount: number; currency: Currency; at: string }>>(`/api/wallet/transactions${qs}`);
}

export async function getWalletBalance(walletOrContext?: string | unknown): Promise<{ hbar: number; usdc: number }> {
  const wallet = typeof walletOrContext === "string" ? walletOrContext : undefined;
  const qs = wallet ? `?wallet=${encodeURIComponent(wallet)}` : "";
  return http<{ hbar: number; usdc: number }>(`/api/wallet/balance${qs}`);
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
 * POST /api/agent/chat  (streaming SSE)
 *
 * Connects to FastAPI endpoint at `${API_BASE_URL}/api/agent/chat` and streams
 * real-time LangGraph agent execution and Hedera x402 payment events to `onEvent`.
 */
export async function streamAgentChat(
  message: string,
  opts: { limit: number; autoApprove: boolean },
  onEvent: (e: AgentEvent) => void,
  requestApproval: (amount: number) => Promise<boolean>,
  signal?: { cancelled: boolean },
  clientWallet?: string,
  onExecuteRealPayment?: (payment: PaymentRequirements) => Promise<string>,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/agent/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "text/event-stream",
    },
    body: JSON.stringify({
      message,
      limit: opts.limit,
      autoApprove: opts.autoApprove,
      clientWallet,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Agent stream request failed with HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    if (signal?.cancelled) {
      await reader.cancel();
      break;
    }

    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed.startsWith("data:")) continue;
      const dataStr = trimmed.replace(/^data:\s*/, "");
      if (!dataStr) continue;

      try {
        const event: AgentEvent = JSON.parse(dataStr);
        if (signal?.cancelled) break;

        const paymentObj = (event.step?.detail && typeof event.step.detail === "object") ? (event.step.detail as Record<string, any>)["payment"] : undefined;
        if (event.type === "approval" && paymentObj) {
          const amount = Number(paymentObj.amount);
          onEvent(event);
          const approved = await requestApproval(amount);
          if (!approved) {
            onEvent({
              type: "step",
              step: {
                id: "pay",
                index: 5,
                title: STEP_TITLES.pay,
                state: "failed",
                detail: { reason: "Payment declined by user. The slot claim will be released." },
              },
            });
            onEvent({
              type: "text",
              text: "Understood. I released the slot claim and did not pay. Adjust the spending limit or ask me to look for cheaper options.",
            });
            onEvent({ type: "done" });
            return;
          }
        } else {
          // If pay step phase is signing and real payment callback provided, trigger real on-chain transaction
          if (
            event.step?.id === "pay" &&
            (event.step.detail as any)?.phase === "signing" &&
            paymentObj &&
            onExecuteRealPayment
          ) {
            onEvent(event);
            try {
              await onExecuteRealPayment(paymentObj as PaymentRequirements);
            } catch (payErr) {
              console.warn("Real payment attempt:", payErr);
            }
          } else {
            onEvent(event);
          }
        }
      } catch (e) {
        console.warn("Could not parse SSE chunk:", chunk, e);
      }
    }
  }
}

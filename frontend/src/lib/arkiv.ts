/**
 * Arkiv Web3 Database Integration for SlotPay.
 *
 * Implements:
 * - Arkiv Rabdi chain connection with publicClient
 * - 'slotpay.services.v1' schema with typed and indexed attributes
 * - Querying services with filtering by category, price, and provider type
 * - Time-scoped publishing using ExpirationTime
 */

import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, desc, eq, lte } from "@arkiv-network/sdk/query";
import { addr, dec, defineSchema, i32, str } from "@arkiv-network/sdk/schema";
import { custom, http } from "viem";

// Canonical SlotPay Services Schema on Arkiv
export const ServicesSchema = defineSchema("slotpay.services.v1", {
  title: str(),
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
});

// Canonical SlotPay Availability Schema on Arkiv
export const AvailabilitySchema = defineSchema("slotpay.availability.v1", {
  providerWallet: addr().indexed(),
  providerName: str(),
  dayHour: str().indexed(),
  status: str().indexed(),
  nextSlot: str().indexed(),
  durationMin: i32().indexed(),
});

const accessKey =
  (typeof import.meta !== "undefined" && import.meta.env
    ? (import.meta.env["VITE_ARKIV_ACCESS_KEY"] as string | undefined)
    : undefined) ??
  (typeof process !== "undefined" && process.env
    ? (process.env["VITE_ARKIV_ACCESS_KEY"] || process.env["ARKIV_ACCESS_KEY"])
    : undefined) ??
  "ark_live_FkBVVU1GhNDlAKQwhXeZSxI5gs6BI7dR";
export const arkivChain = rabdi({ accessKey });

export function getArkivPublicClient() {
  return createPublicClient({
    chain: arkivChain,
    transport: http(),
  });
}

export interface ArkivServiceRecord {
  id: string;
  entityKey: string;
  title: string;
  category: string;
  skills: string[];
  providerType: "human" | "ai";
  providerName: string;
  providerWallet: string;
  price: number;
  currency: "USDC" | "HBAR";
  durationMin: number;
  description: string;
  nextSlot: string;
  rating: number;
  expiresAt?: string;
}

/**
 * Query services published to the Arkiv open network.
 */
export async function queryArkivServices(filter: {
  category?: string;
  providerType?: "human" | "ai" | "any";
  maxPrice?: number;
}): Promise<ArkivServiceRecord[]> {
  try {
    const client = getArkivPublicClient();
    let query = client.select().from(ServicesSchema);

    const conditions = [];
    if (filter.category) {
      conditions.push(eq("category", filter.category));
    }
    if (filter.providerType && filter.providerType !== "any") {
      conditions.push(eq("providerType", filter.providerType));
    }
    if (filter.maxPrice !== undefined) {
      conditions.push(lte("price", dec(filter.maxPrice.toFixed(2))));
    }

    if (conditions.length === 1) {
      query = query.where(conditions[0]!);
    } else if (conditions.length > 1) {
      query = query.where(and(conditions[0]!, ...conditions.slice(1)));
    }

    const { entities } = await query.orderBy(desc("rating")).limit(20).fetch();

    return entities.map((row: any) => ({
      id: row.$key as string,
      entityKey: row.$key as string,
      title: row.title?.value ?? "Consultation",
      category: row.category?.value ?? "Engineering",
      skills: (row.skills?.value ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
      providerType: (row.providerType?.value ?? "human") as "human" | "ai",
      providerName: row.providerName?.value ?? "Provider",
      providerWallet: row.providerWallet?.value ?? "",
      price: Number(row.price?.value ?? 0),
      currency: (row.currency?.value ?? "USDC") as "USDC" | "HBAR",
      durationMin: Number(row.durationMin?.value ?? 60),
      description: row.description?.value ?? "",
      nextSlot: row.nextSlot?.value ?? new Date().toISOString(),
      rating: Number(row.rating?.value ?? 4.8),
      expiresAt: row.$expiresAt ? row.$expiresAt.toString() : undefined,
    }));
  } catch (error) {
    // If Arkiv testnet is not reachable in current network sandbox, return empty array to trigger fallback
    console.warn("[SlotPay] Arkiv public query fell back to local cache:", error);
    return [];
  }
}

/**
 * Format expiration duration for Arkiv time-scoping.
 */
export function getArkivExpiration(days: number) {
  return ExpirationTime.fromDays(Math.max(1, Math.min(days, 180)));
}

/**
 * Connect wallet client to Arkiv Rabdi testnet using Privy or browser EIP-1193 provider.
 */
export async function getArkivWalletClient(provider: any, accountAddress: string) {
  const chainIdHex = `0x${arkivChain.id.toString(16)}`;

  try {
    const currentChainId = await provider.request({ method: "eth_chainId" });
    if (currentChainId !== chainIdHex && parseInt(currentChainId, 16) !== arkivChain.id) {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }],
      });
    }
  } catch (_switchError: any) {
    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: arkivChain.name,
            nativeCurrency: arkivChain.nativeCurrency,
            rpcUrls: arkivChain.rpcUrls.default.http,
            blockExplorerUrls: [arkivChain.blockExplorers.default.url],
          },
        ],
      });
    } catch (addErr) {
      console.warn("[SlotPay] wallet_addEthereumChain notice:", addErr);
    }
  }

  return createWalletClient({
    chain: arkivChain,
    transport: custom(provider),
    account: accountAddress as `0x${string}`,
  });
}

/**
 * Publish a service listing as a real on-chain entity to Arkiv Rabdi testnet.
 */
export async function publishServiceOnChain(
  provider: any,
  accountAddress: string,
  service: {
    title: string;
    category: string;
    skills: string[];
    price: number;
    currency: string;
    durationMin: number;
    description?: string;
    nextSlot?: string;
    provider?: {
      name?: string;
      type?: "human" | "ai";
      rating?: number;
      wallet?: string;
    };
  },
  days: number = 30,
) {
  const walletClient = await getArkivWalletClient(provider, accountAddress);
  const expiration = getArkivExpiration(days);

  const pType = service.provider?.type ?? "human";
  const pName = (service.provider?.name ?? "Provider").slice(0, 100);
  const pRating = service.provider?.rating ?? 4.9;

  const result = await walletClient.createEntity(
    ServicesSchema,
    {
      title: (service.title || "Consultation").slice(0, 120),
      category: (service.category || "Engineering").slice(0, 60),
      skills: (service.skills || []).join(", ").slice(0, 120),
      providerType: pType,
      providerName: pName,
      providerWallet: addr(accountAddress as `0x${string}`),
      price: dec(Number(service.price || 0).toFixed(2)),
      currency: (service.currency || "USDC").slice(0, 10),
      durationMin: i32(Number(service.durationMin || 60)),
      description: (service.description || "").slice(0, 120),
      nextSlot: (service.nextSlot || new Date().toISOString()).slice(0, 30),
      rating: dec(Number(pRating).toFixed(1)),
    },
    { expiration },
  );

  return {
    entity_key: result.entityKey,
    tx_ref: result.txHash,
    expires_at: result.expiresAt ? result.expiresAt.toString() : new Date().toISOString(),
  };
}

/**
 * Publish provider availability blocks as a real on-chain entity to Arkiv Rabdi testnet.
 */
export async function publishAvailabilityOnChain(
  provider: any,
  accountAddress: string,
  cells: string[],
  providerName: string = "Provider",
  days: number = 30,
) {
  const walletClient = await getArkivWalletClient(provider, accountAddress);
  const expiration = getArkivExpiration(days);

  const result = await walletClient.createEntity(
    AvailabilitySchema,
    {
      providerWallet: addr(accountAddress as `0x${string}`),
      providerName: (providerName || "Provider").slice(0, 100),
      dayHour: cells.join(",").slice(0, 120),
      status: "open",
      nextSlot: new Date().toISOString().slice(0, 30),
      durationMin: i32(60),
    },
    { expiration },
  );

  return {
    entity_key: result.entityKey,
    tx_ref: result.txHash,
    expires_at: result.expiresAt ? result.expiresAt.toString() : new Date().toISOString(),
    count: cells.length,
  };
}


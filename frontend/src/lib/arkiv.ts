/**
 * Arkiv Web3 Database Integration for SlotPay.
 *
 * Implements:
 * - Arkiv Rabdi chain connection with publicClient
 * - 'slotpay.services.v1' schema with typed and indexed attributes
 * - Querying services with filtering by category, price, and provider type
 * - Time-scoped publishing using ExpirationTime
 */

import { createPublicClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, desc, eq, lte } from "@arkiv-network/sdk/query";
import { addr, dec, defineSchema, i32, str } from "@arkiv-network/sdk/schema";
import { http } from "viem";

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

const accessKey = (import.meta.env["VITE_ARKIV_ACCESS_KEY"] as string | undefined) ?? "";
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


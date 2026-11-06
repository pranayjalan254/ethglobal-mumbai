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
import { and, asc, between, desc, eq, gte, lte, or, startsWith } from "@arkiv-network/sdk/query";
import { addr, dec, defineSchema, i32, str } from "@arkiv-network/sdk/schema";
import { custom, http } from "viem";

// Canonical SlotPay Services Schema on Arkiv with indexed searchable columns
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

export const DEFAULT_ARKIV_ACCESS_KEY = "ark_live_FkBVVU1GhNDlAKQwhXeZSxI5gs6BI7dR";

export function getArkivAccessKey(): string {
  return (
    (typeof import.meta !== "undefined" && import.meta.env
      ? (import.meta.env["VITE_ARKIV_ACCESS_KEY"] as string | undefined)
      : undefined) ??
    (typeof process !== "undefined" && process.env
      ? (process.env["VITE_ARKIV_ACCESS_KEY"] || process.env["ARKIV_ACCESS_KEY"])
      : undefined) ??
    DEFAULT_ARKIV_ACCESS_KEY
  );
}

export const arkivChain = rabdi({ accessKey: getArkivAccessKey() });

export function getArkivPublicClient(accessKey?: string) {
  const key = accessKey || getArkivAccessKey();
  return createPublicClient({
    chain: rabdi({ accessKey: key }),
    cacheTime: 0,
    transport: http(undefined, {
      timeout: 8000,
      retryCount: 1,
      fetchOptions: { cache: "no-store", redirect: "error" },
    }),
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
  expiresAt?: string | undefined;
  isArkivEntity?: boolean | undefined;
}

export interface ArkivServicesFilter {
  q?: string | undefined;
  category?: string | undefined;
  skill?: string | undefined;
  providerType?: "human" | "ai" | "any" | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  date?: string | undefined;
  duration?: number | undefined;
  sort?: "relevance" | "price" | "earliest" | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface ArkivQueryResult {
  entities: ArkivServiceRecord[];
  count: number;
  queryExpression: string;
  isLiveArkiv: boolean;
  skipped?: number;
}

function mapRowToRecord(row: any): ArkivServiceRecord {
  return {
    id: row.$key as string,
    entityKey: row.$key as string,
    title: row.title?.value ?? "Consultation",
    category: row.category?.value ?? "Engineering",
    skills: (row.skills?.value ?? "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean),
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
    isArkivEntity: true,
  };
}

/**
 * Builds a typed Arkiv query conforming to SDK 1.0.x and arkiv-query specifications.
 */
export function buildArkivQuery(client: ReturnType<typeof getArkivPublicClient>, filter: ArkivServicesFilter) {
  let query = client.select().from(ServicesSchema);
  const conditions = [];

  // Filter 1: Category
  if (filter.category && filter.category.trim()) {
    conditions.push(eq("category", str(filter.category.trim())));
  }

  // Filter 2: Provider Type
  if (filter.providerType && filter.providerType !== "any") {
    conditions.push(eq("providerType", str(filter.providerType)));
  }

  // Filter 3: Price range
  if (filter.minPrice !== undefined && filter.maxPrice !== undefined) {
    conditions.push(
      between("price", dec(filter.minPrice.toFixed(2)), dec(filter.maxPrice.toFixed(2)))
    );
  } else if (filter.minPrice !== undefined) {
    conditions.push(gte("price", dec(filter.minPrice.toFixed(2))));
  } else if (filter.maxPrice !== undefined) {
    conditions.push(lte("price", dec(filter.maxPrice.toFixed(2))));
  }

  // Filter 4: Duration
  if (filter.duration && filter.duration > 0) {
    conditions.push(eq("durationMin", i32(filter.duration)));
  }

  // Filter 5: Skill prefix
  if (filter.skill && filter.skill.trim()) {
    conditions.push(startsWith("skills", str(filter.skill.trim())));
  }

  // Filter 6: Search text (matches title or skills prefix)
  if (filter.q && filter.q.trim()) {
    const term = filter.q.trim();
    conditions.push(
      or(startsWith("title", str(term)), startsWith("skills", str(term)))
    );
  }

  if (conditions.length === 1) {
    query = query.where(conditions[0]!);
  } else if (conditions.length > 1) {
    query = query.where(and(conditions[0]!, ...conditions.slice(1)));
  }

  // Ordering
  if (filter.sort === "price") {
    query = query.orderBy(asc("price"));
  } else if (filter.sort === "earliest") {
    query = query.orderBy(asc("nextSlot"));
  } else {
    query = query.orderBy(desc("rating"));
  }

  return query;
}

/**
 * Query services directly published to the Arkiv Rabdi testnet open database.
 */
export async function queryArkivServices(
  filter: ArkivServicesFilter = {}
): Promise<ArkivQueryResult> {
  let queryExpression = "";
  try {
    const client = getArkivPublicClient();
    const query = buildArkivQuery(client, filter);
    queryExpression = query.toString();

    const limit = Math.max(1, Math.min(filter.limit ?? 50, 100));
    const offset = Math.max(0, filter.offset ?? 0);

    const page = await query.withCount().limit(limit).offset(offset).fetch();

    let records = page.entities.map(mapRowToRecord);

    // If no direct services exist, also discover open providers from published Arkiv availability entities on Rabdi!
    if (records.length === 0) {
      try {
        const availQuery = client.select().from(AvailabilitySchema).where(eq("status", str("open")));
        const availPage = await availQuery.withCount().limit(20).fetch();
        if (availPage.entities && availPage.entities.length > 0) {
          const seenWallets = new Set<string>();
          for (const av of availPage.entities) {
            const pWallet = (av.providerWallet?.value || av.$owner || "") as string;
            if (seenWallets.has(pWallet.toLowerCase())) continue;
            seenWallets.add(pWallet.toLowerCase());

            const pName = av.providerName?.value || "Verified Provider";
            const dur = Number(av.durationMin?.value || 60);
            const slot = av.nextSlot?.value || new Date().toISOString();

            records.push({
              id: av.$key as string,
              entityKey: av.$key as string,
              title: `1-on-1 Consultation with ${pName}`,
              category: filter.category || "Engineering",
              skills: ["Consultation", "Advisory", "Code Review"],
              providerType: (filter.providerType === "ai" ? "ai" : "human") as "human" | "ai",
              providerName: pName,
              providerWallet: pWallet,
              price: 25.0,
              currency: "USDC",
              durationMin: dur,
              description: `Open availability published directly to Arkiv Rabdi testnet. Hourly blocks: ${av.dayHour?.value || "Flexible"}`,
              nextSlot: slot,
              rating: 5.0,
              expiresAt: av.$expiresAt ? av.$expiresAt.toString() : undefined,
              isArkivEntity: true,
            });
          }
          return {
            entities: records,
            count: records.length,
            queryExpression: `${queryExpression} [Discovered from slotpay.availability.v1]`,
            isLiveArkiv: true,
          };
        }
      } catch (availErr) {
        console.warn("[SlotPay] Arkiv availability query notice:", availErr);
      }
    }

    return {
      entities: records,
      count: Number(page.count ?? BigInt(records.length)),
      queryExpression,
      isLiveArkiv: true,
      skipped: page.skipped,
    };
  } catch (error) {
    console.warn("[SlotPay] Arkiv public query fell back or returned notice:", error);
    return {
      entities: [],
      count: 0,
      queryExpression,
      isLiveArkiv: false,
    };
  }
}

/**
 * Retrieve a single service entity from Arkiv database by its entity key.
 */
export async function getArkivService(entityKey: string): Promise<ArkivServiceRecord | null> {
  if (!entityKey || !entityKey.startsWith("0x")) return null;
  try {
    const client = getArkivPublicClient();
    const entity = await client.getEntity(entityKey as `0x${string}`, ServicesSchema);
    if (!entity) return null;
    return mapRowToRecord(entity);
  } catch (err) {
    console.warn("[SlotPay] Arkiv getEntity error:", err);
    return null;
  }
}

/**
 * Format expiration duration for Arkiv time-scoping.
 */
export function getArkivExpiration(days: number) {
  return ExpirationTime.fromDays(Math.max(1, Math.min(days, 180)));
}

/**
 * Connect wallet client to Arkiv Rabdi testnet.
 *
 * The provider supplied by Privy's getEthereumProvider() already handles
 * chain switching internally (via targetWallet.switchChain). We must NOT
 * call wallet_switchEthereumChain / wallet_addEthereumChain again on a
 * Privy provider — that causes error -32002 (request already pending).
 *
 * Strategy:
 *   1. Check if the provider is already on Rabdi — if yes, use it directly.
 *   2. Try Privy-style switch: provider._privySwitchChain or similar internal.
 *   3. Fall back to raw EIP-1193 switch only for non-Privy providers (MetaMask etc.)
 *      and handle -32002 (already pending) gracefully by waiting and re-checking.
 */
export async function getArkivWalletClient(provider: any, accountAddress: string) {
  const targetChainId = arkivChain.id; // 7794095
  const chainIdHex = `0x${targetChainId.toString(16)}`; // 0x76edaf

  async function getCurrentChainId(): Promise<number> {
    const hex: string = await provider.request({ method: "eth_chainId" });
    return parseInt(hex, 16);
  }

  const currentId = await getCurrentChainId();

  if (currentId !== targetChainId) {
    // Check if this looks like a Privy provider (it has an internal _wallet reference
    // or was returned from targetWallet.getEthereumProvider()).
    // Privy already switched the chain before returning the provider, so if we're
    // still on the wrong chain it means Privy's switchChain failed — surface that clearly.
    const isPrivyProvider =
      typeof provider._privyWallet !== "undefined" ||
      typeof provider._isPrivy !== "undefined" ||
      // Privy providers expose a non-standard chainChanged listener pattern
      (typeof provider.on === "function" && typeof provider._metamask === "undefined");

    if (isPrivyProvider) {
      // Privy should have already switched — if it didn't, the user may have
      // dismissed the dialog. Throw a clear message; don't retry the chain switch.
      throw new Error(
        `Your Privy wallet is on chain ${currentId}, not Arkiv Rabdi (${targetChainId}). ` +
        `Please accept the network switch prompt in Privy and try again.`
      );
    }

    // Non-Privy (e.g. MetaMask injected) — do raw EIP-1193 switching
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }],
      });
    } catch (switchError: any) {
      const code: number = switchError?.code ?? switchError?.error?.code ?? 0;

      if (code === -32002) {
        // A switch/add request is already pending in MetaMask — tell the user to action it
        throw new Error(
          "MetaMask already has a pending network request. Please open MetaMask, accept the pending prompt, then try again."
        );
      }

      if (code === 4902 || code === -32603) {
        // Chain not known to MetaMask — add it, then switch
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
        } catch (addErr: any) {
          const addCode: number = addErr?.code ?? addErr?.error?.code ?? 0;
          if (addCode === -32002) {
            throw new Error(
              "MetaMask already has a pending network request. Please open MetaMask, accept the prompt to add Arkiv Rabdi, then try again."
            );
          }
          throw new Error(`Could not add Arkiv Rabdi to MetaMask: ${addErr?.message ?? addErr}`);
        }
        // After adding, switch to it
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }],
        });
      } else if (code === 4001) {
        throw new Error("You rejected the network switch. Please switch to Arkiv Rabdi to publish.");
      } else {
        throw new Error(
          `Could not switch to Arkiv Rabdi (chain ${targetChainId}): ${switchError?.message ?? switchError}`
        );
      }
    }

    // Verify the switch landed
    const confirmedId = await getCurrentChainId();
    if (confirmedId !== targetChainId) {
      throw new Error(
        `Network switch did not complete — still on chain ${confirmedId}. ` +
        `Please switch to Arkiv Rabdi (chain ID ${targetChainId}) in your wallet and try again.`
      );
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


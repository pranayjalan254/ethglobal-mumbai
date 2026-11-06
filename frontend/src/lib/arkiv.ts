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
  swarmRef: str(),
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

// Canonical SlotPay Reservation Schema on Arkiv (SlotPay-owned)
export const ReservationSchema = defineSchema("slotpay.reservation.v1", {
  reservationId: str().indexed(),
  slotId: str().indexed(),
  availabilityEntityKey: str().indexed(),
  providerId: str().indexed(),
  customerWallet: addr().indexed(),
  status: str().indexed(), // "pending" | "confirmed"
  paymentTransactionId: str().optional(),
  createdAt: str(),
  confirmedAt: str().optional(),
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
  swarmRef?: string | undefined;
  expiresAt?: string | undefined;
  isArkivEntity?: boolean | undefined;
}

export interface ArkivReservationRecord {
  type: "slot_reservation";
  reservationId: string;
  slotId: string;
  availabilityEntityKey: string;
  providerId: string;
  customerWallet: string;
  status: "pending" | "confirmed";
  paymentTransactionId?: string;
  createdAt: string;
  confirmedAt?: string;
  expiresAt?: string;
}

export async function queryArkivReservations(
  client?: ReturnType<typeof getArkivPublicClient>
): Promise<ArkivReservationRecord[]> {
  try {
    const pubClient = client || getArkivPublicClient();
    const query = pubClient.select().from(ReservationSchema);
    const page = await query.withCount().limit(100).fetch();
    const now = Date.now();

    return (page.entities || [])
      .map((row: any) => ({
        type: "slot_reservation" as const,
        reservationId: row.reservationId?.value ?? (row.$key as string),
        slotId: row.slotId?.value ?? "",
        availabilityEntityKey: row.availabilityEntityKey?.value ?? "",
        providerId: row.providerId?.value ?? "",
        customerWallet: row.customerWallet?.value ?? "",
        status: (row.status?.value ?? "pending") as "pending" | "confirmed",
        paymentTransactionId: row.paymentTransactionId?.value,
        createdAt: row.createdAt?.value ?? new Date().toISOString(),
        confirmedAt: row.confirmedAt?.value,
        expiresAt: row.$expiresAt ? row.$expiresAt.toString() : undefined,
      }))
      .filter((r) => {
        // Exclude expired pending claims (Arkiv TTL already drops them on-chain, safety check in client)
        if (r.status === "pending" && r.expiresAt) {
          const exp = new Date(r.expiresAt).getTime();
          if (!isNaN(exp) && exp <= now) return false;
        }
        return true;
      });
  } catch (err) {
    console.warn("[SlotPay] Arkiv reservations query notice:", err);
    return [];
  }
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
  let category = row.category?.value ?? "Engineering";
  const title = row.title?.value ?? "Consultation";
  const skills = (row.skills?.value ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);

  // Normalize category if service has explicit design keywords but was saved with default Engineering
  const combinedText = `${title} ${skills.join(" ")}`.toLowerCase();
  if (category === "Engineering" && (combinedText.includes("designer") || combinedText.includes("design") || combinedText.includes("figma") || combinedText.includes("ui/ux"))) {
    category = "Design";
  }

  return {
    id: row.$key as string,
    entityKey: row.$key as string,
    title,
    category,
    skills,
    providerType: (row.providerType?.value ?? "human") as "human" | "ai",
    providerName: row.providerName?.value ?? "Provider",
    providerWallet: row.providerWallet?.value ?? "",
    price: Number(row.price?.value ?? 0),
    currency: (row.currency?.value ?? "HBAR") as "USDC" | "HBAR",
    durationMin: Number(row.durationMin?.value ?? 60),
    description: row.description?.value ?? "",
    nextSlot: row.nextSlot?.value ?? new Date().toISOString(),
    rating: Number(row.rating?.value ?? 4.8),
    swarmRef: row.swarmRef?.value ? String(row.swarmRef.value) : undefined,
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

  // Filter 1: Category (broaden to include legacy-default Engineering entities when filtering Design)
  if (filter.category && filter.category.trim()) {
    const cat = filter.category.trim();
    if (cat.toLowerCase() === "design") {
      conditions.push(or(eq("category", str("Design")), eq("category", str("Engineering"))));
    } else {
      conditions.push(eq("category", str(cat)));
    }
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

    // Query active Arkiv reservations to exclude slots with unexpired pending claims or confirmed reservations
    const reservations = await queryArkivReservations(client);
    const reservedKeys = new Set(
      reservations.flatMap((r) => [r.slotId.toLowerCase(), r.availabilityEntityKey.toLowerCase()]).filter(Boolean)
    );

    let records = page.entities
      .map(mapRowToRecord)
      .filter((rec) => !reservedKeys.has(rec.id.toLowerCase()) && !reservedKeys.has(rec.entityKey.toLowerCase()));

    // Filter direct services by normalized category if category filter is set
    if (filter.category && filter.category.trim()) {
      records = records.filter((r) => r.category.toLowerCase() === filter.category!.trim().toLowerCase());
    }

    // Also discover open providers from published Arkiv availability entities on Rabdi.
    // Provider schedules represent 1-on-1 Engineering & Advisory consultations.
    const availCategory = "Engineering";
    const matchesCategory = !filter.category || filter.category.toLowerCase() === availCategory.toLowerCase();
    const matchesProviderType = !filter.providerType || filter.providerType === "any" || filter.providerType === "human";
    const defaultAvailPrice = 0.5;
    const matchesPrice =
      (filter.minPrice == null || defaultAvailPrice >= filter.minPrice) &&
      (filter.maxPrice == null || defaultAvailPrice <= filter.maxPrice);
    const matchesDuration = !filter.duration || filter.duration === 0 || Math.abs(60 - filter.duration) <= 30;

    if (matchesCategory && matchesProviderType && matchesPrice && matchesDuration) {
      try {
        const availQuery = client.select().from(AvailabilitySchema).where(eq("status", str("open")));
        const availPage = await availQuery.withCount().limit(50).fetch();
        if (availPage.entities && availPage.entities.length > 0) {
          // Sort newest first by target expiry / created timestamp so we always pick the latest active schedule
          const sortedEntities = [...availPage.entities].sort((a, b) => {
            const expA = a.$expiresAt ? BigInt(a.$expiresAt) : 0n;
            const expB = b.$expiresAt ? BigInt(b.$expiresAt) : 0n;
            if (expA !== expB) return expA > expB ? -1 : 1;
            const timeA = a.$createdAt ? BigInt(a.$createdAt) : 0n;
            const timeB = b.$createdAt ? BigInt(b.$createdAt) : 0n;
            return timeA > timeB ? -1 : 1;
          });

          // Deduplicate among open schedules for the same provider wallet (take newest)
          const seenAvailWallets = new Set<string>();
          for (const av of sortedEntities) {
            const keyStr = (av.$key as string).toLowerCase();
            if (reservedKeys.has(keyStr)) continue;

            const pWallet = (av.providerWallet?.value || av.$owner || "") as string;
            if (!pWallet || seenAvailWallets.has(pWallet.toLowerCase())) continue;
            seenAvailWallets.add(pWallet.toLowerCase());

            const pName = av.providerName?.value || "Verified Provider";
            const dur = Number(av.durationMin?.value || 60);
            const slot = av.nextSlot?.value || new Date().toISOString();
            const skills = ["Python", "Consultation", "Advisory", "Code Review", "Fullstack"];

            // Check skill filter if specified
            if (filter.skill && filter.skill.trim()) {
              const skLower = filter.skill.trim().toLowerCase();
              if (!skills.some((s) => s.toLowerCase().includes(skLower))) {
                continue;
              }
            }

            // Check search text filter if specified
            if (filter.q && filter.q.trim()) {
              const qLower = filter.q.trim().toLowerCase();
              const text = `${pName} 1-on-1 Consultation ${skills.join(" ")}`.toLowerCase();
              if (!text.includes(qLower)) {
                continue;
              }
            }

            records.push({
              id: av.$key as string,
              entityKey: av.$key as string,
              title: `1-on-1 Consultation with ${pName}`,
              category: availCategory,
              skills,
              providerType: "human",
              providerName: pName,
              providerWallet: pWallet,
              price: defaultAvailPrice,
              currency: "HBAR",
              durationMin: dur,
              description: `Open availability published directly to Arkiv Rabdi testnet. Hourly blocks: ${av.dayHour?.value || "Flexible"}`,
              nextSlot: slot,
              rating: 5.0,
              expiresAt: av.$expiresAt ? av.$expiresAt.toString() : undefined,
              isArkivEntity: true,
            });
          }
        }
      } catch (availErr) {
        console.warn("[OASIS Protocol] Arkiv availability query notice:", availErr);
      }
    }

    // Apply sorting to combined services
    if (filter.sort === "price") {
      records.sort((a, b) => a.price - b.price);
    } else if (filter.sort === "earliest") {
      records.sort((a, b) => a.nextSlot.localeCompare(b.nextSlot));
    } else {
      records.sort((a, b) => b.rating - a.rating);
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
    try {
      const entity = await client.getEntity(entityKey as `0x${string}`, ServicesSchema);
      if (entity) return mapRowToRecord(entity);
    } catch {
      // Not under ServicesSchema, attempt AvailabilitySchema next
    }

    try {
      const availEntity = await client.getEntity(entityKey as `0x${string}`, AvailabilitySchema);
      if (availEntity) {
        const pWallet = (availEntity.providerWallet?.value || availEntity.$owner || "") as string;
        const pName = (availEntity.providerName?.value as string) || "Verified Provider";
        const dur = Number(availEntity.durationMin?.value || 60);
        const slot = (availEntity.nextSlot?.value as string) || new Date().toISOString();

        let swarmRef: string | undefined = undefined;
        try {
          if (pWallet) {
            const svcQuery = client.select().from(ServicesSchema).where(eq("providerWallet", addr(pWallet as `0x${string}`)));
            const svcRes = await svcQuery.limit(1).fetch();
            if (svcRes.entities?.[0]?.swarmRef?.value) {
              swarmRef = svcRes.entities[0].swarmRef.value as string;
            }
          }
        } catch {}

        return {
          id: availEntity.$key as string,
          entityKey: availEntity.$key as string,
          title: `1-on-1 Consultation with ${pName}`,
          category: "Consultation",
          skills: ["Consultation", "Advisory", "Code Review"],
          providerType: "human",
          providerName: pName,
          providerWallet: pWallet,
          price: 25.0,
          currency: "HBAR",
          durationMin: dur,
          description: `Open availability published directly to Arkiv Rabdi testnet. Hourly blocks: ${availEntity.dayHour?.value || "Flexible"}`,
          nextSlot: slot,
          rating: 5.0,
          swarmRef,
          expiresAt: availEntity.$expiresAt ? availEntity.$expiresAt.toString() : undefined,
          isArkivEntity: true,
        };
      }
    } catch {
      // ignore
    }

    return null;
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
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }],
      });
    } catch (switchError: any) {
      const code: number = switchError?.code ?? switchError?.error?.code ?? 0;

      if (code === -32002) {
        throw new Error(
          "Your wallet already has a pending network request. Please open your wallet, accept the pending prompt, then try again."
        );
      }

      if (code === 4902 || code === -32603 || String(switchError?.message || "").toLowerCase().includes("unrecognized")) {
        // Chain not known to wallet — prompt wallet to add Arkiv Rabdi, then switch
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
              "Your wallet already has a pending network request. Please open your wallet, accept the prompt to add Arkiv Rabdi, then try again."
            );
          }
          throw new Error(`Could not add Arkiv Rabdi network to wallet: ${addErr?.message ?? addErr}`);
        }

        // After adding, ensure the switch to Rabdi is applied
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: chainIdHex }],
          });
        } catch {
          // Some wallets auto-switch upon adding
        }
      } else if (code === 4001) {
        throw new Error("You rejected the network switch prompt in your wallet. Please switch to Arkiv Rabdi to publish.");
      } else {
        throw new Error(
          `Could not switch wallet to Arkiv Rabdi (chain ${targetChainId}): ${switchError?.message ?? switchError}`
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
    swarmRef?: string;
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
      currency: (service.currency || "HBAR").slice(0, 10),
      durationMin: i32(Number(service.durationMin || 60)),
      description: (service.description || "").slice(0, 120),
      nextSlot: (service.nextSlot || new Date().toISOString()).slice(0, 30),
      rating: dec(Number(pRating).toFixed(1)),
      swarmRef: (service.swarmRef || "").slice(0, 100),
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

  // 1. Query existing live availability entities owned by this provider to delete & prevent duplicates
  let oldEntityKeys: `0x${string}`[] = [];
  try {
    const publicClient = getArkivPublicClient();
    const existingPage = await publicClient
      .select()
      .from(AvailabilitySchema)
      .where(eq("providerWallet", addr(accountAddress as `0x${string}`)))
      .fetch();
    if (existingPage.entities && existingPage.entities.length > 0) {
      oldEntityKeys = existingPage.entities
        .map((e) => e.$key as `0x${string}`)
        .filter(Boolean);
    }
  } catch (err) {
    console.warn("[SlotPay] Notice querying superseded availability entities:", err);
  }

  const values = {
    providerWallet: addr(accountAddress as `0x${string}`),
    providerName: (providerName || "Provider").slice(0, 100),
    dayHour: cells.join(",").slice(0, 120),
    status: "open",
    nextSlot: new Date().toISOString().slice(0, 30),
    durationMin: i32(60),
  };

  // If previous entities exist, atomically delete old ones and create the new one in 1 transaction
  if (oldEntityKeys.length > 0) {
    try {
      console.log(`[SlotPay] Replacing ${oldEntityKeys.length} superseded availability entities in 1 batch transaction...`);
      const batchResult = await walletClient.executeBatch({
        deletes: oldEntityKeys.map((k) => ({ entityKey: k })),
        creates: [
          {
            schema: AvailabilitySchema,
            values,
            expiration,
          },
        ],
      });
      const newKey = batchResult.createdEntities[0] || "";
      return {
        entity_key: newKey,
        tx_ref: batchResult.txHash,
        expires_at: new Date(Date.now() + days * 86400 * 1000).toISOString(),
        count: cells.length,
        deleted_count: oldEntityKeys.length,
      };
    } catch (batchErr) {
      console.warn("[SlotPay] Atomic executeBatch failed, falling back to standard createEntity:", batchErr);
    }
  }

  const result = await walletClient.createEntity(
    AvailabilitySchema,
    values,
    { expiration },
  );

  return {
    entity_key: result.entityKey,
    tx_ref: result.txHash,
    expires_at: result.expiresAt ? result.expiresAt.toString() : new Date().toISOString(),
    count: cells.length,
  };
}

/**
 * Publish a SlotPay-owned PendingSlotClaim on Arkiv Rabdi testnet (5-minute expiration).
 */
export async function createPendingSlotClaimOnChain(
  providerOrClient: any,
  accountAddress: string,
  params: {
    slotId: string;
    availabilityEntityKey: string;
    providerId: string;
    customerWallet: string;
    reservationId?: string;
  }
) {
  const walletClient = await getArkivWalletClient(providerOrClient, accountAddress);
  const resId = params.reservationId || `res_${Math.random().toString(16).slice(2, 10)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

  const result = await walletClient.createEntity(
    ReservationSchema,
    {
      reservationId: resId,
      slotId: params.slotId,
      availabilityEntityKey: params.availabilityEntityKey,
      providerId: params.providerId,
      customerWallet: addr(params.customerWallet as `0x${string}`),
      status: "pending",
      createdAt: now.toISOString(),
    },
    { expiration: ExpirationTime.fromMinutes(5) }
  );

  return {
    reservationId: resId,
    entityKey: result.entityKey,
    txHash: result.txHash,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Publish a SlotPay-owned ConfirmedReservation on Arkiv Rabdi testnet.
 */
export async function createConfirmedReservationOnChain(
  providerOrClient: any,
  accountAddress: string,
  params: {
    slotId: string;
    availabilityEntityKey: string;
    providerId: string;
    customerWallet: string;
    paymentTransactionId: string;
    reservationId?: string;
    retentionDays?: number;
  }
) {
  const walletClient = await getArkivWalletClient(providerOrClient, accountAddress);
  const resId = params.reservationId || `res_${Math.random().toString(16).slice(2, 10)}`;
  const now = new Date();
  const retention = params.retentionDays ?? 30;

  const result = await walletClient.createEntity(
    ReservationSchema,
    {
      reservationId: resId,
      slotId: params.slotId,
      availabilityEntityKey: params.availabilityEntityKey,
      providerId: params.providerId,
      customerWallet: addr(params.customerWallet as `0x${string}`),
      status: "confirmed",
      paymentTransactionId: params.paymentTransactionId,
      createdAt: now.toISOString(),
      confirmedAt: now.toISOString(),
    },
    { expiration: ExpirationTime.fromDays(retention) }
  );

  return {
    reservationId: resId,
    entityKey: result.entityKey,
    txHash: result.txHash,
    status: "confirmed",
  };
}


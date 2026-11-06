import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAvailability, getAvailabilityMeta, publishAvailability, type Slot } from "@/lib/api";
import { publishAvailabilityOnChain } from "@/lib/arkiv";
import { useAuth } from "@/lib/auth";
import { dt } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Countdown,
  CopyButton,
  Empty,
  ErrorBlock,
  Mono,
  PageHeader,
  ProgressLine,
  RuledTable,
  SkeletonRows,
  Status,
  TxLink,
} from "@/components/sp/primitives";

export const Route = createFileRoute("/provider/availability")({ component: Availability });

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i); // 8:00 to 18:00
const DEFAULT_OPEN = new Set([
  "0-9", "0-10", "0-11", "0-14", "0-15", "0-16",
  "1-9", "1-10", "1-11", "1-14", "1-15", "1-16",
  "2-9", "2-10", "2-11", "2-14", "2-15", "2-16",
  "3-9", "3-10", "3-11", "3-14", "3-15", "3-16",
  "4-9", "4-10", "4-11", "4-14", "4-15", "4-16",
]);

type SlotFilter = "all" | "open" | "claimed" | "booked" | "expired";

function Availability() {
  const { walletAddress, getEthereumProvider, profile } = useAuth();

  // Real-time slot query with 3-second polling for live holds and bookings
  const q = useQuery({
    queryKey: ["availability", walletAddress],
    queryFn: () => getAvailability(walletAddress || undefined),
    refetchInterval: 3000,
  });

  // Arkiv on-chain metadata query
  const metaQuery = useQuery({
    queryKey: ["availability-meta", walletAddress],
    queryFn: () => getAvailabilityMeta(walletAddress || undefined),
  });

  // Grid state: set of OPEN hour keys (`${dayIndex}-${hour}`).
  // Dark coloured = Blocked/Closed (!openCells.has(k)).
  // Light coloured = Open/Free (openCells.has(k)).
  const [openCells, setOpenCells] = useState<Set<string>>(new Set(DEFAULT_OPEN));
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<SlotFilter>("all");

  const dragAction = useRef<null | boolean>(null); // true = painting open, false = painting blocked

  // Hydrate from published Arkiv state on first load if available
  useEffect(() => {
    if (!hasUserEdited && metaQuery.data?.cells && metaQuery.data.cells.length > 0) {
      const serverSet = new Set(metaQuery.data.cells);
      setOpenCells(serverSet);
      setLastSavedSnapshot([...serverSet].sort().join(","));
    }
  }, [metaQuery.data, hasUserEdited]);

  useEffect(() => {
    const up = () => (dragAction.current = null);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  // Map slots to cell keys for real-time grid overlay
  const slotByCell = useMemo(() => {
    const map = new Map<string, Slot>();
    if (!q.data) return map;

    for (const slot of q.data) {
      if (slot.cellKey) {
        map.set(slot.cellKey, slot);
        continue;
      }
      // Fallback matching from slot ID: e.g. "slot_0_10" -> "0-10"
      const match = slot.id.match(/slot_(\d+)_(\d+)/);
      if (match) {
        map.set(`${match[1]}-${match[2]}`, slot);
        continue;
      }
      // Fallback matching from date timestamp
      try {
        const d = new Date(slot.start);
        const day = (d.getDay() + 6) % 7; // Monday = 0
        const hour = d.getHours();
        map.set(`${day}-${hour}`, slot);
      } catch {
        // ignore unparseable
      }
    }
    return map;
  }, [q.data]);

  const toggleCell = (k: string, makeOpen: boolean) => {
    setHasUserEdited(true);
    setOpenCells((prev) => {
      const next = new Set(prev);
      if (makeOpen) {
        next.add(k);
      } else {
        next.delete(k);
      }
      return next;
    });
  };

  const isDirty = useMemo(() => {
    if (!metaQuery.data?.is_published) return true;
    const currentSnapshot = [...openCells].sort().join(",");
    return currentSnapshot !== lastSavedSnapshot;
  }, [openCells, lastSavedSnapshot, metaQuery.data?.is_published]);

  // Presets
  const applyPreset = (type: "weekday9to5" | "openAll" | "blockAll" | "blockWeekends") => {
    setHasUserEdited(true);
    setOpenCells((prev) => {
      const next = new Set(prev);
      if (type === "openAll") {
        for (let d = 0; d < 7; d++) {
          for (const h of HOURS) next.add(`${d}-${h}`);
        }
      } else if (type === "blockAll") {
        next.clear();
      } else if (type === "blockWeekends") {
        for (let d = 5; d < 7; d++) {
          for (const h of HOURS) next.delete(`${d}-${h}`);
        }
      } else if (type === "weekday9to5") {
        next.clear();
        for (let d = 0; d < 5; d++) {
          for (let h = 9; h <= 17; h++) {
            if (HOURS.includes(h)) next.add(`${d}-${h}`);
          }
        }
      }
      return next;
    });
  };

  const toggleDayColumn = (dayIndex: number) => {
    setHasUserEdited(true);
    setOpenCells((prev) => {
      const next = new Set(prev);
      const allOpen = HOURS.every((h) => next.has(`${dayIndex}-${h}`));
      for (const h of HOURS) {
        if (allOpen) {
          next.delete(`${dayIndex}-${h}`);
        } else {
          next.add(`${dayIndex}-${h}`);
        }
      }
      return next;
    });
  };

  const toggleHourRow = (hour: number) => {
    setHasUserEdited(true);
    setOpenCells((prev) => {
      const next = new Set(prev);
      const allOpen = DAYS.every((_, d) => next.has(`${d}-${hour}`));
      for (let d = 0; d < DAYS.length; d++) {
        if (allOpen) {
          next.delete(`${d}-${hour}`);
        } else {
          next.add(`${d}-${hour}`);
        }
      }
      return next;
    });
  };

  // Filter slots
  const filteredSlots = useMemo(() => {
    if (!q.data) return [];
    if (filter === "all") return q.data;
    return q.data.filter((s) => s.status === filter);
  }, [q.data, filter]);

  const counts = useMemo(() => {
    const slots = q.data || [];
    return {
      all: slots.length,
      open: slots.filter((s) => s.status === "open").length,
      claimed: slots.filter((s) => s.status === "claimed").length,
      booked: slots.filter((s) => s.status === "booked").length,
      expired: slots.filter((s) => s.status === "expired").length,
    };
  }, [q.data]);

  const meta = metaQuery.data;
  const isPublished = Boolean(meta?.is_published);
  const entityKey = meta?.entity_key;
  const txHash = meta?.tx_hash;

  return (
    <>
      <PageHeader
        eyebrow="Availability & Schedule"
        title="Weekly availability"
        sub="Click or drag to configure open hours (light) versus blocked hours (dark). Slots are published directly to Arkiv as provider-owned entities."
        action={
          <div className="flex items-center gap-3">
            <Button
              disabled={busy || openCells.size === 0}
              onClick={async () => {
                setBusy(true);
                try {
                  let onChainTx = "";
                  let onChainEntityKey = "";

                  if (walletAddress) {
                    try {
                      toast.loading("Requesting wallet signature on Rabdi testnet...", { id: "arkiv-avail-tx" });
                      const provider = await getEthereumProvider();
                      const onChain = await publishAvailabilityOnChain(
                        provider,
                        walletAddress,
                        [...openCells],
                        profile?.displayName || "Provider"
                      );
                      onChainTx = onChain.tx_ref;
                      onChainEntityKey = onChain.entity_key;
                      toast.success(`Published ${onChain.count} blocks to Arkiv Rabdi!`, {
                        id: "arkiv-avail-tx",
                        description: `Entity key: ${onChain.entity_key.slice(0, 18)}...`,
                        action: {
                          label: "View Explorer",
                          onClick: () => window.open(`https://rabdi.explorer.arkiv.network/tx/${onChainTx}`, "_blank"),
                        },
                      });
                    } catch (onChainErr: any) {
                      console.warn("[SlotPay] On-chain publish notice:", onChainErr);
                      const msg: string = onChainErr?.message || String(onChainErr);
                      const isChainError =
                        msg.toLowerCase().includes("chain") ||
                        msg.toLowerCase().includes("network") ||
                        msg.toLowerCase().includes("switch");
                      toast.error(
                        isChainError
                          ? "Wrong network — please switch to Arkiv Rabdi (chain 7794095) in your wallet and try again."
                          : `Publish failed: ${msg.slice(0, 120)}`,
                        { id: "arkiv-avail-tx", duration: 8000 }
                      );
                      // Stop here: do not fall through to fake success toast or mock entity generation
                      return;
                    }
                  }

                  const r = await publishAvailability(
                    [...openCells],
                    walletAddress || undefined,
                    onChainEntityKey || undefined,
                    onChainTx || undefined
                  );
                  if (!walletAddress) {
                    toast.success(`Published ${r.count} open hourly blocks to Arkiv`);
                  }

                  setLastSavedSnapshot([...openCells].sort().join(","));
                  setHasUserEdited(false);
                  await Promise.all([q.refetch(), metaQuery.refetch()]);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Publishing..." : isDirty ? "Publish updates to Arkiv" : "Availability up-to-date"}
            </Button>
          </div>
        }
      />

      {busy && <ProgressLine className="mb-6" />}

      {/* Arkiv On-Chain Status Card */}
      <div className="mb-6 border border-hairline bg-surface-raised p-4 transition-colors">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-block h-2 w-2 rounded-full",
                  isPublished ? (isDirty ? "bg-warning" : "bg-success animate-pulse") : "bg-ink-muted"
                )}
                aria-hidden
              />
              <span className="mono text-xs font-semibold uppercase tracking-wider text-ink">
                {isPublished
                  ? isDirty
                    ? "Arkiv Rabdi: Unsaved Changes (Publish Pending)"
                    : "Arkiv Rabdi: Live On-Chain"
                  : "Arkiv Rabdi: Unpublished Draft"}
              </span>
              <span className="mono border border-hairline px-1.5 py-0.5 text-[10.5px] text-ink-muted">
                Chain ID 7794095
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-muted">
              {entityKey ? (
                <span className="flex items-center gap-1">
                  Entity:{" "}
                  <Mono className="text-ink">
                    {entityKey.slice(0, 10)}...{entityKey.slice(-6)}
                  </Mono>
                  <CopyButton value={entityKey} label="Copy Arkiv entity key" />
                </span>
              ) : (
                <span>Entity: Not yet minted on-chain</span>
              )}
              <span>
                TTL: <span className="text-ink font-medium">30 Days (Provider Owned)</span>
              </span>
              {meta?.published_at && (
                <span>
                  Last synced: <span className="text-ink">{dt(meta.published_at)}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {txHash && (
              <a
                href={`https://rabdi.explorer.arkiv.network/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 border border-hairline bg-surface px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-raised"
              >
                <ExternalLink className="h-3.5 w-3.5 text-accent" />
                <span>Arkiv Explorer</span>
              </a>
            )}
            <div className="flex items-center gap-1.5 border border-hairline px-2.5 py-1.5 text-xs text-ink-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              <span>Non-Destructive Reservation Architecture</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Legend & Presets Toolbar */}
      <div className="mb-4 flex flex-col gap-4 border-b border-hairline pb-4 md:flex-row md:items-center md:justify-between">
        {/* Color Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-4 w-4 border border-hairline bg-ink" />
            <span className="font-medium text-ink">Dark = Blocked / Off-hours</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-4 w-4 border border-hairline bg-surface-raised" />
            <span className="text-ink-muted">Light = Open / Free</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-4 w-4 border border-amber-500/50 bg-amber-500/20" />
            <span className="text-amber-500 font-medium">Amber = Claimed Hold (5m)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-4 w-4 border border-purple-500/50 bg-purple-500/20" />
            <span className="text-purple-500 font-medium">Violet = Booked</span>
          </div>
        </div>

        {/* Preset Controls */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="eyebrow mr-1 text-[11px] text-ink-muted">Presets:</span>
          <button
            type="button"
            onClick={() => applyPreset("weekday9to5")}
            className="border border-hairline bg-surface-raised px-2.5 py-1 text-ink transition-colors hover:bg-surface"
          >
            Mon–Fri 9–5
          </button>
          <button
            type="button"
            onClick={() => applyPreset("openAll")}
            className="border border-hairline bg-surface-raised px-2.5 py-1 text-ink transition-colors hover:bg-surface"
          >
            Open All
          </button>
          <button
            type="button"
            onClick={() => applyPreset("blockWeekends")}
            className="border border-hairline bg-surface-raised px-2.5 py-1 text-ink transition-colors hover:bg-surface"
          >
            Block Weekends
          </button>
          <button
            type="button"
            onClick={() => applyPreset("blockAll")}
            className="border border-hairline bg-surface-raised px-2.5 py-1 text-ink transition-colors hover:bg-surface"
          >
            Block All
          </button>
        </div>
      </div>

      {/* Weekly Interactive Grid */}
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[720px] select-none grid-cols-[64px_repeat(7,1fr)] border-l border-t border-hairline"
          style={{ touchAction: "none" }}
        >
          {/* Top-left empty corner */}
          <div className="border-b border-r border-hairline bg-surface p-2 text-center">
            <span className="mono text-[10px] text-ink-muted">TIME</span>
          </div>

          {/* Day Headers (clickable to toggle entire day) */}
          {DAYS.map((d, dayIndex) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDayColumn(dayIndex)}
              title={`Click to toggle all ${d} hours`}
              className="group border-b border-r border-hairline bg-surface px-2 py-2 text-center transition-colors hover:bg-surface-raised"
            >
              <div className="eyebrow text-ink group-hover:underline">{d}</div>
              <div className="mono text-[10px] text-ink-muted">toggle day</div>
            </button>
          ))}

          {/* Hour Rows */}
          {HOURS.map((h) => (
            <div key={h} className="contents">
              {/* Hour Label (clickable to toggle entire row) */}
              <button
                type="button"
                onClick={() => toggleHourRow(h)}
                title={`Click to toggle ${String(h).padStart(2, "0")}:00 across all days`}
                className="group border-b border-r border-hairline bg-surface px-2 py-2 text-right transition-colors hover:bg-surface-raised"
              >
                <div className="mono text-xs text-ink group-hover:underline">{String(h).padStart(2, "0")}:00</div>
              </button>

              {/* Day cells */}
              {DAYS.map((_, d) => {
                const k = `${d}-${h}`;
                const isOpen = openCells.has(k);
                const activeSlot = slotByCell.get(k);

                // Slot states:
                const isClaimed = activeSlot?.status === "claimed";
                const isBooked = activeSlot?.status === "booked";

                // Cell styling:
                // Dark = Blocked (!isOpen)
                // Light = Open (isOpen)
                // Amber = Claimed Hold
                // Violet = Booked
                let cellClass = "bg-surface-raised hover:bg-surface text-ink";
                if (!isOpen) {
                  // Blocked: dark coloured as requested
                  cellClass = "bg-ink text-background/60 hover:bg-ink/90";
                } else if (isClaimed) {
                  cellClass = "bg-amber-500/20 text-amber-500 border-amber-500/50 hover:bg-amber-500/25";
                } else if (isBooked) {
                  cellClass = "bg-purple-500/20 text-purple-400 border-purple-500/50 hover:bg-purple-500/25";
                }

                return (
                  <button
                    key={k}
                    type="button"
                    aria-label={`${DAYS[d]} ${h}:00 ${!isOpen ? "blocked" : isClaimed ? "claimed hold" : isBooked ? "booked" : "open"}`}
                    onPointerDown={() => {
                      // Clicking flips between open and blocked
                      const nextOpen = !isOpen;
                      dragAction.current = nextOpen;
                      toggleCell(k, nextOpen);
                    }}
                    onPointerEnter={() => {
                      if (dragAction.current !== null) {
                        toggleCell(k, dragAction.current);
                      }
                    }}
                    className={cn(
                      "relative flex h-11 flex-col items-center justify-center border-b border-r border-hairline px-1 py-1 transition-colors duration-150",
                      cellClass
                    )}
                  >
                    {!isOpen ? (
                      <span className="mono text-[10px] uppercase tracking-wider text-background/40 select-none">
                        Blocked
                      </span>
                    ) : isClaimed ? (
                      <div className="flex flex-col items-center">
                        <span className="mono flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                          Held
                        </span>
                        {activeSlot.claimExpiresAt && (
                          <Countdown until={activeSlot.claimExpiresAt} className="text-[9.5px] text-amber-300" />
                        )}
                      </div>
                    ) : isBooked ? (
                      <div className="flex flex-col items-center">
                        <span className="mono text-[10px] font-semibold uppercase tracking-wider text-purple-300">
                          Booked
                        </span>
                        {activeSlot.bookingRef && (
                          <span className="mono text-[9px] text-purple-400/80 truncate max-w-[50px]">
                            {activeSlot.bookingRef}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="mono text-[10px] text-ink-muted/50 select-none">
                        Open
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-muted">
        <p className="mono">
          <span className="text-ink font-semibold">{openCells.size}</span> hours open per week &bull;{" "}
          <span className="text-ink font-semibold">{77 - openCells.size}</span> hours blocked
        </p>
        {isDirty && (
          <p className="mono text-warning">
            * You have unsaved availability changes. Click "Publish updates to Arkiv" above to commit to the Rabdi testnet.
          </p>
        )}
      </div>

      {/* Generated Slots Management Section */}
      <section className="mt-14">
        <div className="mb-6 flex flex-col gap-4 border-b border-hairline pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl">Generated Slots Management</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Live Arkiv availability slots combined with real-time customer and AI agent reservations.
            </p>
          </div>

          {/* Status Filter Tabs */}
          <div className="inline-flex border border-hairline bg-surface-raised p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "px-3 py-1.5 transition-colors",
                filter === "all" ? "bg-ink text-background" : "text-ink hover:bg-surface"
              )}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setFilter("open")}
              className={cn(
                "px-3 py-1.5 transition-colors",
                filter === "open" ? "bg-ink text-background" : "text-ink hover:bg-surface"
              )}
            >
              Open ({counts.open})
            </button>
            <button
              type="button"
              onClick={() => setFilter("claimed")}
              className={cn(
                "px-3 py-1.5 transition-colors",
                filter === "claimed" ? "bg-ink text-background" : "text-ink hover:bg-surface"
              )}
            >
              Claimed Holds ({counts.claimed})
            </button>
            <button
              type="button"
              onClick={() => setFilter("booked")}
              className={cn(
                "px-3 py-1.5 transition-colors",
                filter === "booked" ? "bg-ink text-background" : "text-ink hover:bg-surface"
              )}
            >
              Booked ({counts.booked})
            </button>
            {counts.expired > 0 && (
              <button
                type="button"
                onClick={() => setFilter("expired")}
                className={cn(
                  "px-3 py-1.5 transition-colors",
                  filter === "expired" ? "bg-ink text-background" : "text-ink hover:bg-surface"
                )}
              >
                Expired ({counts.expired})
              </button>
            )}
          </div>
        </div>

        {q.isLoading ? (
          <SkeletonRows />
        ) : q.isError ? (
          <ErrorBlock message="Could not load slots from Arkiv." onRetry={() => q.refetch()} />
        ) : filteredSlots.length === 0 ? (
          <Empty
            title={filter === "all" ? "No slots generated" : `No ${filter} slots`}
            body={
              filter === "all"
                ? "Mark open hours on the grid and publish to Arkiv to generate active booking slots."
                : `There are currently no slots matching status "${filter}".`
            }
          />
        ) : (
          <RuledTable
            rows={filteredSlots}
            rowKey={(s) => s.id}
            columns={[
              {
                key: "t",
                header: "Start Time",
                render: (s) => <Mono className="font-medium text-ink">{dt(s.start)}</Mono>,
              },
              {
                key: "d",
                header: "Duration",
                render: (s) => <Mono className="text-ink-muted">{s.durationMin} min</Mono>,
              },
              {
                key: "s",
                header: "Status",
                render: (s) =>
                  s.status === "open" ? (
                    <Status tone="success">Open</Status>
                  ) : s.status === "claimed" ? (
                    <Status tone="warning">Claimed Hold</Status>
                  ) : s.status === "expired" ? (
                    <Status tone="neutral">Expired</Status>
                  ) : (
                    <Status tone="ink">Booked</Status>
                  ),
              },
              {
                key: "c",
                header: "Hold Expiration",
                render: (s) =>
                  s.status === "claimed" && s.claimExpiresAt ? (
                    <span className="text-[12.5px] text-ink-muted">
                      Expires in <Countdown until={s.claimExpiresAt} className="text-warning font-semibold" />
                    </span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  ),
              },
              {
                key: "ref",
                header: "Booking / Tx Ref",
                render: (s) => {
                  if (s.txId) {
                    return <TxLink txId={s.txId} />;
                  }
                  if (s.bookingRef) {
                    return <span className="mono text-xs text-ink">{s.bookingRef}</span>;
                  }
                  if (s.reservationId) {
                    return <span className="mono text-xs text-ink-muted">Arkiv #{s.reservationId.slice(0, 10)}</span>;
                  }
                  return <span className="text-ink-muted">—</span>;
                },
              },
            ]}
          />
        )}
      </section>
    </>
  );
}

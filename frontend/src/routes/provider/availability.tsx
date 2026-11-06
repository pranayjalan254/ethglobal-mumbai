import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAvailability, publishAvailability } from "@/lib/api";
import { publishAvailabilityOnChain } from "@/lib/arkiv";
import { useAuth } from "@/lib/auth";
import { dt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Countdown, Empty, ErrorBlock, Mono, PageHeader, ProgressLine, RuledTable, SkeletonRows, Status } from "@/components/sp/primitives";

export const Route = createFileRoute("/provider/availability")({ component: Availability });

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 11 }, (_, i) => 8 + i);
const DEFAULT = new Set(["0-10", "0-11", "1-10", "1-11", "1-14", "2-9", "2-10", "3-15", "3-16", "4-10"]);

function Availability() {
  const { walletAddress, getEthereumProvider, profile } = useAuth();
  const q = useQuery({ queryKey: ["availability"], queryFn: getAvailability });
  const [cells, setCells] = useState<Set<string>>(new Set(DEFAULT));
  const [busy, setBusy] = useState(false);
  const drag = useRef<null | boolean>(null);

  useEffect(() => {
    const up = () => (drag.current = null);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const apply = (k: string, on: boolean) => setCells((prev) => {
    const n = new Set(prev);
    on ? n.add(k) : n.delete(k);
    return n;
  });

  return (
    <>
      <PageHeader
        eyebrow="Availability"
        title="Weekly availability"
        sub="Click or drag across the grid to mark open hours. Slots are generated from these blocks and published as Arkiv entities."
        action={
          <Button disabled={busy || cells.size === 0} onClick={async () => {
            setBusy(true);
            try {
              let txHash = "";
              if (walletAddress) {
                try {
                  toast.loading("Requesting wallet signature on Rabdi testnet...", { id: "arkiv-avail-tx" });
                  const provider = await getEthereumProvider();
                  const onChain = await publishAvailabilityOnChain(
                    provider,
                    walletAddress,
                    [...cells],
                    profile?.displayName || "Provider"
                  );
                  txHash = onChain.tx_ref;
                  toast.success(`Published ${onChain.count} blocks to Arkiv Rabdi! Tx: ${txHash.slice(0, 14)}...`, {
                    id: "arkiv-avail-tx",
                    description: `Entity key: ${onChain.entity_key.slice(0, 18)}...`,
                    action: {
                      label: "View Explorer",
                      onClick: () => window.open(`https://rabdi.explorer.arkiv.network/tx/${txHash}`, "_blank"),
                    },
                  });
                } catch (onChainErr: any) {
                  console.warn("[SlotPay] On-chain publish notice:", onChainErr);
                  toast.error(`On-chain notice: ${onChainErr?.message || onChainErr}`, { id: "arkiv-avail-tx" });
                }
              }
              const r = await publishAvailability([...cells]);
              if (!txHash) {
                toast(`Published ${r.count} hourly blocks to Arkiv`);
              }
              q.refetch();
            } finally {
              setBusy(false);
            }
          }}>Publish availability to Arkiv</Button>
        }
      />
      {busy && <ProgressLine className="mb-6" />}
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] select-none grid-cols-[56px_repeat(7,1fr)] border-l border-t border-hairline" style={{ touchAction: "none" }}>
          <div className="border-b border-r border-hairline" />
          {DAYS.map((d) => <div key={d} className="eyebrow border-b border-r border-hairline px-2 py-2 text-center">{d}</div>)}
          {HOURS.map((h) => (
            <div key={h} className="contents">
              <div className="mono border-b border-r border-hairline px-2 py-2 text-right text-ink-muted">{String(h).padStart(2, "0")}:00</div>
              {DAYS.map((_, d) => {
                const k = `${d}-${h}`;
                const on = cells.has(k);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-label={`${DAYS[d]} ${h}:00 ${on ? "open" : "closed"}`}
                    aria-pressed={on}
                    onPointerDown={() => { drag.current = !on; apply(k, !on); }}
                    onPointerEnter={() => { if (drag.current !== null) apply(k, drag.current); }}
                    className={cn("h-9 border-b border-r border-hairline transition-colors duration-150", on ? "bg-ink" : "bg-surface-raised hover:bg-surface")}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mono mt-3 text-ink-muted">{cells.size} hours open per week</p>

      <section className="mt-16">
        <h2 className="mb-6 text-2xl">Generated slots</h2>
        {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorBlock message="Could not load slots." onRetry={() => q.refetch()} /> : q.data!.length === 0 ? <Empty title="No slots generated" /> : (
          <RuledTable
            rows={q.data!}
            rowKey={(s) => s.id}
            columns={[
              { key: "t", header: "Start", render: (s) => <Mono>{dt(s.start)}</Mono> },
              { key: "d", header: "Duration", render: (s) => <Mono>{s.durationMin} min</Mono> },
              { key: "s", header: "Status", render: (s) => s.status === "open" ? <Status tone="success">Open</Status> : s.status === "claimed" ? <Status tone="warning">Claimed</Status> : <Status tone="ink">Booked</Status> },
              { key: "c", header: "Claim", render: (s) => s.status === "claimed" && s.claimExpiresAt ? <span className="text-[12.5px] text-ink-muted">Held for <Countdown until={s.claimExpiresAt} className="text-warning" /></span> : <span className="text-ink-muted">—</span> },
            ]}
          />
        )}
      </section>
    </>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { getService, getServiceSlots, type Slot } from "@/lib/api";
import { dateOnly, money, parseDateSafely, shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CopyButton, Empty, ErrorBlock, Eyebrow, Mono, ProgressLine, Tag, TypeTag } from "@/components/sp/primitives";
import { Checkout } from "@/components/sp/checkout";

export const Route = createFileRoute("/buyer/marketplace/$id")({ component: Detail });

function Detail() {
  const { id } = Route.useParams();
  const svc = useQuery({ queryKey: ["service", id], queryFn: () => getService(id) });
  const slots = useQuery({ queryKey: ["slots", id], queryFn: () => getServiceSlots(id) });
  const [sel, setSel] = useState<Slot | null>(null);
  const [checkout, setCheckout] = useState<Slot | null>(null);

  if (svc.isLoading) return <div className="mx-auto w-full max-w-[1200px] px-4 py-10"><ProgressLine /></div>;
  if (svc.isError || !svc.data) return <div className="mx-auto w-full max-w-[1200px] px-4 py-10"><ErrorBlock message="Service not found." /></div>;
  const s = svc.data;
  const fee = +(s.price * 0.01).toFixed(2);
  const byDay = (slots.data ?? []).reduce<Record<string, Slot[]>>((acc, x) => { (acc[x.start.slice(0, 10)] ??= []).push(x); return acc; }, {});

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6">
      <Link to="/buyer/marketplace" className="link-u text-[13px] text-ink-muted">Back to marketplace</Link>
      <div className="mt-8 grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-7">
          <div className="flex items-center gap-2 text-[13px]">{s.category}<span className="text-ink-muted">/</span><TypeTag type={s.provider.type} /></div>
          <h1 className="mt-4 text-5xl">{s.title}</h1>
          <p className="mt-4 max-w-xl text-[15px] text-ink-muted">{s.description}</p>
          <div className="mt-5 flex flex-wrap gap-1.5">{s.skills.map((k) => <Tag key={k}>{k}</Tag>)}</div>

          <section className="mt-12 border-t border-ink pt-6">
            <Eyebrow>Provider</Eyebrow>
            <h2 className="mt-3 text-3xl">{s.provider.name}</h2>
            <p className="mt-1">{s.provider.headline}</p>
            <p className="mt-3 max-w-xl text-ink-muted">{s.provider.bio}</p>
            <Mono className="mt-3 block text-ink-muted">{s.provider.rating.toFixed(1)} rating, {s.provider.reviews} reviews</Mono>
          </section>

          {s.provider.credentials.length > 0 && (
            <section className="mt-10">
              <Eyebrow className="mb-3">Credentials</Eyebrow>
              <ul className="border-t border-hairline">{s.provider.credentials.map((c) => <li key={c} className="border-b border-hairline py-2.5">{c}</li>)}</ul>
            </section>
          )}
          <section className="mt-10">
            <Eyebrow className="mb-3">Portfolio documents</Eyebrow>
            {s.provider.documents.length === 0 ? <p className="text-ink-muted">No documents published.</p> : (
              <ul className="border-t border-hairline">
                {s.provider.documents.map((d) => (
                  <li key={d.name} className="flex items-center justify-between border-b border-hairline py-2.5">
                    <span>{d.name}</span>
                    <span className="inline-flex items-center gap-1"><Mono className="text-ink-muted">bzz://{shortHash(d.swarmRef.slice(2), 6)}</Mono><CopyButton value={d.swarmRef} /></span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10 border border-hairline bg-surface-raised p-5">
            <Eyebrow className="mb-3">Entity on Arkiv</Eyebrow>
            <dl className="mono space-y-2">
              {([["entity_key", s.entityKey ?? "—"], ["owner", s.provider.wallet], ["expires_at", s.expiresAt ? dateOnly(s.expiresAt) : "—"]] as [string, string][]).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[100px_1fr] gap-2"><dt className="text-ink-muted">{k}</dt><dd className="flex items-center gap-1 break-all">{v.length > 40 ? shortHash(v, 14) : v}{v.startsWith("0x") && <CopyButton value={v} />}</dd></div>
              ))}
            </dl>
          </section>
        </div>

        <aside className="col-span-12 lg:col-span-5">
          <div className="border border-ink bg-surface-raised lg:sticky lg:top-24">
            <div className="border-b border-hairline p-5">
              <Eyebrow>Choose a slot</Eyebrow>
            </div>
            <div className="p-5">
              {slots.isLoading ? <ProgressLine /> : Object.keys(byDay).length === 0 ? <Empty title="No open slots" /> : Object.entries(byDay).map(([day, list]) => {
                const dayObj = parseDateSafely(day);
                return (
                  <div key={day} className="mb-4">
                    <div className="mb-2 text-[13px]">{dayObj ? format(dayObj, "EEEE d MMMM") : day}</div>
                    <div className="grid grid-cols-4 gap-px border border-hairline bg-hairline">
                      {list.map((x) => {
                        const slotObj = parseDateSafely(x.start);
                        return (
                          <button
                            key={x.id}
                            disabled={x.status !== "open"}
                            onClick={() => setSel(x)}
                            aria-pressed={sel?.id === x.id}
                            className={cn("mono py-2.5 transition-colors duration-150", x.status !== "open" ? "bg-surface text-ink-muted line-through" : sel?.id === x.id ? "bg-ink text-background" : "bg-surface-raised hover:bg-surface")}
                          >
                            {slotObj ? format(slotObj, "HH:mm") : x.start}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <dl className="border-t border-hairline px-5 py-3 text-[13.5px]">
              <div className="flex justify-between py-1"><dt className="text-ink-muted">Service, {s.durationMin} min</dt><dd className="mono">{money(s.price, s.currency)}</dd></div>
              <div className="flex justify-between py-1"><dt className="text-ink-muted">Facilitator fee</dt><dd className="mono">Sponsored</dd></div>
              <div className="flex justify-between py-1 text-ink-muted"><dt>Network fee (est.)</dt><dd className="mono line-through">{fee.toFixed(2)}</dd></div>
              <div className="mt-2 flex justify-between border-t border-hairline pt-3"><dt>Total</dt><dd className="mono text-accent">{money(s.price, s.currency)}</dd></div>
            </dl>
            <div className="p-5 pt-0">
              <Button className="w-full" size="lg" disabled={!sel} onClick={() => setCheckout(sel)}>Book and pay</Button>
            </div>
          </div>
        </aside>
      </div>
      <Checkout service={s} slot={checkout} onClose={() => setCheckout(null)} />
    </div>
  );
}

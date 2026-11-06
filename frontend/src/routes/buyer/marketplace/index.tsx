import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Database, ExternalLink, Filter, LayoutGrid, List } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { CATEGORIES, listServices, type ServiceQuery, type ServicesListResponse } from "@/lib/api";
import { dt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Empty, ErrorBlock, Eyebrow, Field, inputCls, Mono, Segmented, SkeletonRows, Tag, TypeTag } from "@/components/sp/primitives";

export const Route = createFileRoute("/buyer/marketplace/")({ component: Marketplace });

const DEFAULT: ServiceQuery = { q: "", category: "", skill: "", provider_type: "any", min_price: 0, max_price: 150, date: "", duration: 0, sort: "relevance" };

function Marketplace() {
  const [f, setF] = useState<ServiceQuery>(DEFAULT);
  const [grid, setGrid] = useState(false);
  const [showQueryDetails, setShowQueryDetails] = useState(false);
  const clean: ServiceQuery = { ...f, category: f.category || undefined, skill: f.skill || undefined, date: f.date || undefined, duration: f.duration || undefined };
  const q = useQuery({ queryKey: ["services", clean], queryFn: () => listServices(clean) });

  const servicesData = q.data as ServicesListResponse | undefined;
  const arkivExpression = servicesData?.arkivExpression;
  const isLiveArkiv = servicesData?.isLiveArkiv ?? true;

  return (
    <div className="mx-auto grid w-full max-w-[1200px] flex-1 md:grid-cols-[280px_1fr]">
      <aside className="space-y-6 border-b border-hairline px-4 py-8 md:border-b-0 md:border-r md:px-6">
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
            <Filter className="h-3.5 w-3.5 text-accent" />
            <span>Arkiv Filter Engine</span>
          </div>
          <span className="inline-flex items-center gap-1 rounded border border-hairline px-1.5 py-0.5 text-[10px] font-mono text-ink-muted">
            Rabdi
          </span>
        </div>

        <Field label="Search" htmlFor="q">
          <input
            id="q"
            className={inputCls}
            placeholder="Python, audit, research"
            value={f.q}
            onChange={(e) => setF({ ...f, q: e.target.value })}
          />
        </Field>

        <Field label="Category" htmlFor="cat">
          <select id="cat" className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <Field label="Skill" htmlFor="sk">
          <input
            id="sk"
            className={inputCls}
            placeholder="Solidity"
            value={f.skill}
            onChange={(e) => setF({ ...f, skill: e.target.value })}
          />
        </Field>

        <Field label="Provider type">
          <Segmented
            label="Provider type"
            value={f.provider_type ?? "any"}
            onChange={(v) => setF({ ...f, provider_type: v })}
            options={[{ value: "any", label: "Any" }, { value: "human", label: "Human" }, { value: "ai", label: "AI" }]}
          />
        </Field>

        <Field label="Price, HBAR">
          <Slider
            min={0}
            max={150}
            step={1}
            value={[f.min_price!, f.max_price!]}
            onValueChange={([a, b]) => setF({ ...f, min_price: a, max_price: b })}
            className="py-2"
          />
          <div className="mono flex justify-between text-ink-muted">
            <span>${f.min_price}</span>
            <span>${f.max_price}</span>
          </div>
        </Field>

        <Field label="Available by" htmlFor="dt">
          <input
            id="dt"
            type="date"
            className={inputCls}
            value={f.date}
            onChange={(e) => setF({ ...f, date: e.target.value })}
          />
        </Field>

        <Field label="Duration" htmlFor="du">
          <select id="du" className={inputCls} value={f.duration} onChange={(e) => setF({ ...f, duration: Number(e.target.value) })}>
            <option value={0}>Any</option>
            <option value={30}>30 min</option>
            <option value={60}>60 min</option>
            <option value={90}>90 min</option>
          </select>
        </Field>

        <button className="link-u text-[13px] text-accent" onClick={() => setF(DEFAULT)}>
          Reset filters
        </button>
      </aside>

      <section className="px-4 py-8 md:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-ink pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-3xl">Marketplace</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-background px-2.5 py-0.5 text-xs text-ink-muted">
                <span className={cn("h-1.5 w-1.5 rounded-full", isLiveArkiv ? "bg-emerald-500 animate-pulse" : "bg-accent")} />
                Arkiv Rabdi Testnet
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Mono className="text-ink-muted">{q.data ? `${q.data.length} services` : "Searching Arkiv"}</Mono>
              {arkivExpression && (
                <button
                  type="button"
                  onClick={() => setShowQueryDetails(!showQueryDetails)}
                  className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                >
                  <Database className="h-3 w-3" />
                  <span>{showQueryDetails ? "Hide On-Chain Query" : "Inspect On-Chain Query"}</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="sort">Sort</label>
            <select
              id="sort"
              className={`${inputCls} w-auto py-2`}
              value={f.sort}
              onChange={(e) => setF({ ...f, sort: e.target.value as ServiceQuery["sort"] })}
            >
              <option value="relevance">Relevance</option>
              <option value="price">Price</option>
              <option value="earliest">Earliest availability</option>
            </select>
            <div className="flex border border-hairline">
              <button
                aria-label="List view"
                aria-pressed={!grid}
                onClick={() => setGrid(false)}
                className={cn("p-2", !grid && "bg-ink text-background")}
              >
                <List className="h-4 w-4" strokeWidth={1.25} />
              </button>
              <button
                aria-label="Grid view"
                aria-pressed={grid}
                onClick={() => setGrid(true)}
                className={cn("border-l border-hairline p-2", grid && "bg-ink text-background")}
              >
                <LayoutGrid className="h-4 w-4" strokeWidth={1.25} />
              </button>
            </div>
          </div>
        </div>

        {showQueryDetails && arkivExpression && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/5 p-4 text-xs">
            <div className="flex items-center justify-between font-mono text-[11px] text-accent">
              <span className="flex items-center gap-1.5 font-medium">
                <Database className="h-3.5 w-3.5" />
                <span>Arkiv On-Chain Query · OASIS Protocol</span>
              </span>
              <span className="rounded bg-accent/10 px-2 py-0.5 text-[10px] text-accent">Rabdi Testnet (Chain ID 7794095)</span>
            </div>
            <pre className="mt-2.5 overflow-x-auto whitespace-pre-wrap rounded border border-hairline bg-background/90 p-3 font-mono text-[11px] leading-relaxed text-ink">
              {arkivExpression}
            </pre>
          </div>
        )}

        {q.isLoading ? (
          <SkeletonRows rows={5} />
        ) : q.isError ? (
          <ErrorBlock message="Arkiv query failed." onRetry={() => q.refetch()} />
        ) : q.data!.length === 0 ? (
          <Empty
            title="No services match"
            body="No listings on Arkiv match the active predicates. Widen the price range or clear a filter."
            action={<button className="link-u text-accent" onClick={() => setF(DEFAULT)}>Reset filters</button>}
          />
        ) : (
          <div className={cn(grid ? "grid gap-px border border-hairline bg-hairline sm:grid-cols-2" : "")}>
            {q.data!.map((s) => (
              <Link
                key={s.id}
                to="/buyer/marketplace/$id"
                params={{ id: s.id }}
                className={cn(
                  "row-hover block bg-background",
                  grid ? "p-6" : "grid gap-4 border-b border-hairline py-6 md:grid-cols-[1fr_auto]"
                )}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-medium text-ink">{s.provider.name}</span>
                    <TypeTag type={s.provider.type} />
                    {s.entityKey && (
                      <span
                        className="inline-flex items-center gap-1 rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted hover:text-accent"
                        title={`Arkiv Entity: ${s.entityKey}`}
                      >
                        <Database className="h-2.5 w-2.5 text-accent" />
                        <span>{s.entityKey.slice(0, 6)}...{s.entityKey.slice(-4)}</span>
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-2xl">{s.title}</h2>
                  <p className="mt-1.5 max-w-xl text-ink-muted">{s.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.skills.map((k) => (
                      <Tag key={k}>{k}</Tag>
                    ))}
                  </div>
                </div>

                <div
                  className={cn(
                    "flex gap-6 md:flex-col md:items-end md:gap-1 md:text-right",
                    grid && "mt-5 justify-between md:flex-row md:items-end"
                  )}
                >
                  <Mono className="text-[15px] text-accent">
                    {s.price.toFixed(2)} {s.currency}
                  </Mono>
                  <Mono className="text-ink-muted">{s.durationMin} min</Mono>
                  <div>
                    <Eyebrow className="hidden md:block">Next slot</Eyebrow>
                    <Mono>{dt(s.nextSlot)}</Mono>
                  </div>
                  {!grid && (
                    <span className="link-u mt-2 hidden text-[13px] text-accent md:inline-block">
                      View
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

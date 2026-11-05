import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { CATEGORIES, listServices, type ServiceQuery } from "@/lib/api";
import { dt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Empty, ErrorBlock, Eyebrow, Field, inputCls, Mono, Segmented, SkeletonRows, Tag, TypeTag } from "@/components/sp/primitives";

export const Route = createFileRoute("/buyer/marketplace/")({ component: Marketplace });

const DEFAULT: ServiceQuery = { q: "", category: "", skill: "", provider_type: "any", min_price: 0, max_price: 150, date: "", duration: 0, sort: "relevance" };

function Marketplace() {
  const [f, setF] = useState<ServiceQuery>(DEFAULT);
  const [grid, setGrid] = useState(false);
  const clean: ServiceQuery = { ...f, category: f.category || undefined, skill: f.skill || undefined, date: f.date || undefined, duration: f.duration || undefined };
  const q = useQuery({ queryKey: ["services", clean], queryFn: () => listServices(clean) });

  return (
    <div className="mx-auto grid w-full max-w-[1200px] flex-1 md:grid-cols-[280px_1fr]">
      <aside className="space-y-6 border-b border-hairline px-4 py-8 md:border-b-0 md:border-r md:px-6">
        <Field label="Search" htmlFor="q"><input id="q" className={inputCls} placeholder="Python, audit, research" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></Field>
        <Field label="Category" htmlFor="cat">
          <select id="cat" className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Skill" htmlFor="sk"><input id="sk" className={inputCls} placeholder="Solidity" value={f.skill} onChange={(e) => setF({ ...f, skill: e.target.value })} /></Field>
        <Field label="Provider type">
          <Segmented label="Provider type" value={f.provider_type ?? "any"} onChange={(v) => setF({ ...f, provider_type: v })} options={[{ value: "any", label: "Any" }, { value: "human", label: "Human" }, { value: "ai", label: "AI" }]} />
        </Field>
        <Field label="Price, USDC">
          <Slider min={0} max={150} step={1} value={[f.min_price!, f.max_price!]} onValueChange={([a, b]) => setF({ ...f, min_price: a, max_price: b })} className="py-2" />
          <div className="mono flex justify-between text-ink-muted"><span>{f.min_price}</span><span>{f.max_price}</span></div>
        </Field>
        <Field label="Available by" htmlFor="dt"><input id="dt" type="date" className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Duration" htmlFor="du">
          <select id="du" className={inputCls} value={f.duration} onChange={(e) => setF({ ...f, duration: Number(e.target.value) })}>
            <option value={0}>Any</option><option value={30}>30 min</option><option value={60}>60 min</option><option value={90}>90 min</option>
          </select>
        </Field>
        <button className="link-u text-[13px] text-accent" onClick={() => setF(DEFAULT)}>Reset filters</button>
      </aside>

      <section className="px-4 py-8 md:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-ink pb-4">
          <div><h1 className="text-3xl">Marketplace</h1><Mono className="text-ink-muted">{q.data ? `${q.data.length} services` : "Searching"}</Mono></div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="sort">Sort</label>
            <select id="sort" className={`${inputCls} w-auto py-2`} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value as ServiceQuery["sort"] })}>
              <option value="relevance">Relevance</option><option value="price">Price</option><option value="earliest">Earliest availability</option>
            </select>
            <div className="flex border border-hairline">
              <button aria-label="List view" aria-pressed={!grid} onClick={() => setGrid(false)} className={cn("p-2", !grid && "bg-ink text-background")}><List className="h-4 w-4" strokeWidth={1.25} /></button>
              <button aria-label="Grid view" aria-pressed={grid} onClick={() => setGrid(true)} className={cn("border-l border-hairline p-2", grid && "bg-ink text-background")}><LayoutGrid className="h-4 w-4" strokeWidth={1.25} /></button>
            </div>
          </div>
        </div>

        {q.isLoading ? <SkeletonRows rows={5} /> : q.isError ? <ErrorBlock message="Search failed." onRetry={() => q.refetch()} /> : q.data!.length === 0 ? (
          <Empty title="No services match" body="Widen the price range or clear a filter." action={<button className="link-u text-accent" onClick={() => setF(DEFAULT)}>Reset filters</button>} />
        ) : (
          <div className={cn(grid ? "grid gap-px border border-hairline bg-hairline sm:grid-cols-2" : "")}>
            {q.data!.map((s) => (
              <Link key={s.id} to="/buyer/marketplace/$id" params={{ id: s.id }} className={cn("row-hover block bg-background", grid ? "p-6" : "grid gap-4 border-b border-hairline py-6 md:grid-cols-[1fr_auto]")}>
                <div>
                  <div className="flex items-center gap-2 text-[13px]">{s.provider.name}<TypeTag type={s.provider.type} /></div>
                  <h2 className="mt-2 text-2xl">{s.title}</h2>
                  <p className="mt-1.5 max-w-xl text-ink-muted">{s.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">{s.skills.map((k) => <Tag key={k}>{k}</Tag>)}</div>
                </div>
                <div className={cn("flex gap-6 md:flex-col md:items-end md:gap-1 md:text-right", grid && "mt-5 justify-between md:flex-row md:items-end")}>
                  <Mono className="text-[15px] text-accent">{s.price.toFixed(2)} {s.currency}</Mono>
                  <Mono className="text-ink-muted">{s.durationMin} min</Mono>
                  <div><Eyebrow className="hidden md:block">Next slot</Eyebrow><Mono>{dt(s.nextSlot)}</Mono></div>
                  {!grid && <span className="link-u mt-2 hidden text-[13px] text-accent md:inline-block">View</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

import { useState } from "react";
import { CheckCircle2, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORIES, type Service, type ServiceInput } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { kb, shortAddr, shortHash } from "@/lib/format";
import { CopyButton, Eyebrow, Field, inputCls, Mono, Segmented, Tag, TypeTag } from "./primitives";

export interface AutoSwarmDoc {
  name: string;
  swarmRef: string;
  size?: number | undefined;
}

function getAutoSwarmDocs(): AutoSwarmDoc[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("slotpay_portfolio_files");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Purge dummy/mock file credentials-aws.pdf or 96bfa8a3
        const cleaned = parsed.filter(
          (x: { name?: string; swarmRef?: string }) =>
            x &&
            x.swarmRef &&
            x.swarmRef !== "upload_failed" &&
            !x.swarmRef.startsWith("96bfa8a3") &&
            x.name !== "credentials-aws.pdf",
        );
        if (cleaned.length !== parsed.length) {
          try {
            localStorage.setItem("slotpay_portfolio_files", JSON.stringify(cleaned));
          } catch {}
        }
        const seen = new Set<string>();
        return cleaned
          .filter((x: { name?: string; swarmRef?: string }) => {
            if (!x.swarmRef) return false;
            const key = `${x.name}_${x.swarmRef}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((x: { name?: string; swarmRef: string; size?: number }) => ({
            name: x.name || "Portfolio Document",
            swarmRef: x.swarmRef,
            size: x.size,
          }));
      }
    }
  } catch {}
  return [];
}

export function ServiceForm({ initial, onSubmit, submitting }: { initial?: Service; onSubmit: (v: ServiceInput) => void; submitting?: boolean }) {
  const { walletAddress, profile } = useAuth();
  const localDocs = getAutoSwarmDocs();

  // Merge locally stored portfolio docs with any existing service docs so nothing is lost
  const docMap = new Map<string, AutoSwarmDoc>();
  for (const d of initial?.provider?.documents || []) {
    if (d.swarmRef && !d.swarmRef.startsWith("96bfa8a3") && d.name !== "credentials-aws.pdf") {
      docMap.set(`${d.name}_${d.swarmRef}`, { name: d.name, swarmRef: d.swarmRef, size: 90_000 });
    }
  }
  for (const d of localDocs) {
    docMap.set(`${d.name}_${d.swarmRef}`, d);
  }
  const autoDocs = Array.from(docMap.values());
  const primarySwarmRef =
    initial?.swarmRef ||
    initial?.provider?.documents?.[0]?.swarmRef ||
    autoDocs[0]?.swarmRef ||
    "";

  const [v, setV] = useState<ServiceInput>({
    title: initial?.title ?? "",
    category: initial?.category ?? profile?.category ?? CATEGORIES[0]!,
    skills: initial?.skills ?? [],
    description: initial?.description ?? "",
    price: initial?.price ?? 0.05,
    currency: initial?.currency ?? "HBAR",
    durationMin: initial?.durationMin ?? 60,
    providerType: initial?.provider?.type ?? profile?.providerType ?? "human",
    swarmRef: primarySwarmRef,
  });
  const [skill, setSkill] = useState("");
  const preset = [30, 60, 90].includes(v.durationMin);
  const [customDur, setCustomDur] = useState(!preset);

  const [categoryManual, setCategoryManual] = useState(Boolean(initial?.category));

  const handleTitleChange = (newTitle: string) => {
    let newCategory = v.category;
    if (!categoryManual) {
      const lower = newTitle.toLowerCase();
      if (lower.includes("design") || lower.includes("ui") || lower.includes("ux") || lower.includes("figma")) {
        newCategory = "Design";
      } else if (lower.includes("security") || lower.includes("audit") || lower.includes("pentest")) {
        newCategory = "Security";
      } else if (lower.includes("legal") || lower.includes("compliance")) {
        newCategory = "Legal";
      } else if (lower.includes("research") || lower.includes("analysis")) {
        newCategory = "Research";
      } else if (lower.includes("finance") || lower.includes("tax") || lower.includes("accounting") || lower.includes("tokenomics")) {
        newCategory = "Finance";
      }
    }
    setV({ ...v, title: newTitle, category: newCategory });
  };

  const addSkill = () => {
    const s = skill.trim();
    if (s && !v.skills.includes(s)) setV({ ...v, skills: [...v.skills, s] });
    setSkill("");
  };

  return (
    <form
      className="grid grid-cols-12 gap-10"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          ...v,
          documents: autoDocs.map((d) => ({ name: d.name, swarmRef: d.swarmRef })),
        });
      }}
    >
      <div className="col-span-12 space-y-6 lg:col-span-7">
        <Field label="Title" htmlFor="t"><input id="t" required className={inputCls} value={v.title} onChange={(e) => handleTitleChange(e.target.value)} placeholder="One-hour Python consultation" /></Field>
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Category" htmlFor="c">
            <select
              id="c"
              className={inputCls}
              value={v.category}
              onChange={(e) => {
                setCategoryManual(true);
                setV({ ...v, category: e.target.value });
              }}
            >
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Provider type">
            <Segmented label="Provider type" value={v.providerType} onChange={(p) => setV({ ...v, providerType: p })} options={[{ value: "human", label: "Human" }, { value: "ai", label: "AI agent" }]} />
          </Field>
        </div>
        <Field label="Skills" htmlFor="sk" hint="Press Enter to add a skill.">
          <div className="flex flex-wrap items-center gap-2 border border-hairline bg-surface-raised p-2 focus-within:border-ink">
            {v.skills.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 border border-ink px-2 py-0.5 text-[12px]">
                {s}
                <button type="button" aria-label={`Remove ${s}`} onClick={() => setV({ ...v, skills: v.skills.filter((x) => x !== s) })}><X className="h-3 w-3" strokeWidth={1.25} /></button>
              </span>
            ))}
            <input id="sk" className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-[14px] outline-none" value={skill} onChange={(e) => setSkill(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSkill(); } }} placeholder="Python" />
          </div>
        </Field>
        <Field label="Description" htmlFor="d"><textarea id="d" rows={4} required className={inputCls} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        <Field
          label="Portfolio & Credentials (Swarm)"
          hint="All documents uploaded to Swarm are automatically linked to this Arkiv service."
        >
          {autoDocs.length > 0 ? (
            <div className="border border-hairline bg-surface-raised">
              <div className="flex items-center justify-between border-b border-hairline bg-surface px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  </span>
                  <span className="text-[12.5px] font-medium text-ink">
                    {autoDocs.length} {autoDocs.length === 1 ? "document" : "documents"} automatically linked
                  </span>
                </div>
                <span className="border border-emerald-600/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-emerald-700">
                  Automated
                </span>
              </div>

              <ul className="divide-y divide-hairline">
                {autoDocs.map((doc) => (
                  <li key={doc.swarmRef} className="flex items-center justify-between px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-hairline bg-surface text-ink-muted">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-medium text-ink">{doc.name}</div>
                        <div className="flex items-center gap-2 font-mono text-[11px] text-ink-muted">
                          <span>bzz://{shortHash(doc.swarmRef.replace(/^bzz:\/\//, "").replace(/^0x/, ""), 8)}</span>
                          {doc.size ? <span>· {kb(doc.size)}</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <a
                        href={`https://gateway.ethswarm.org/bzz/${doc.swarmRef.replace(/^bzz:\/\//, "").replace(/^0x/, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-accent underline hover:opacity-80"
                        title="View on Swarm Gateway"
                      >
                        [view]
                      </a>
                      <CopyButton value={doc.swarmRef} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="border border-hairline bg-surface-raised p-4">
              <p className="text-[13px] text-ink-muted">
                No files uploaded yet in{" "}
                <a href="/provider/portfolio" className="font-medium text-accent underline">
                  Portfolio
                </a>
                . Any files you upload there will be linked to this service automatically.
              </p>
            </div>
          )}
        </Field>
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Price" htmlFor="p">
            <div className="flex">
              <input id="p" type="number" min={0} step="0.01" className={`${inputCls} mono`} value={v.price} onChange={(e) => setV({ ...v, price: Number(e.target.value) })} />
              <select aria-label="Currency" className={`${inputCls} -ml-px w-28`} value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value as "USDC" | "HBAR" })}>
                <option>HBAR</option><option>USDC</option>
              </select>
            </div>
          </Field>
          <Field label="Location"><div className={`${inputCls} text-ink-muted`}>Remote</div></Field>
        </div>
        <Field label="Duration">
          <Segmented
            label="Duration"
            value={customDur ? "custom" : String(v.durationMin)}
            onChange={(d) => { if (d === "custom") setCustomDur(true); else { setCustomDur(false); setV({ ...v, durationMin: Number(d) }); } }}
            options={[{ value: "30", label: "30 min" }, { value: "60", label: "60 min" }, { value: "90", label: "90 min" }, { value: "custom", label: "Custom" }]}
          />
          {customDur && <input aria-label="Custom minutes" type="number" min={5} className={`${inputCls} mono mt-2`} value={v.durationMin} onChange={(e) => setV({ ...v, durationMin: Number(e.target.value) })} />}
        </Field>
        <div className="flex gap-3 border-t border-hairline pt-6">
          <Button type="submit" disabled={submitting}>{initial ? "Save changes" : "Save as draft"}</Button>
        </div>
      </div>

      <aside className="col-span-12 lg:col-span-5">
        <div className="lg:sticky lg:top-24">
          <Eyebrow className="mb-3">Marketplace preview</Eyebrow>
          <div className="border border-hairline bg-surface-raised p-6">
            <div className="flex items-center gap-2 text-[13px]">
              <span>{profile?.displayName || "Your name"}</span>
              <TypeTag type={v.providerType} />
            </div>
            <h3 className="mt-3 text-2xl">{v.title || "Untitled service"}</h3>
            <p className="mt-2 text-ink-muted">{v.description || "A short description of what the buyer receives."}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">{v.skills.map((s) => <Tag key={s}>{s}</Tag>)}</div>
            {autoDocs.length > 0 && (
              <div className="mt-4 flex items-center gap-1.5 border-t border-hairline pt-3 text-[12px] text-ink-muted">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span>
                  {autoDocs.length} Swarm portfolio {autoDocs.length === 1 ? "document" : "documents"} verified
                </span>
              </div>
            )}
            <div className="mt-6 flex items-end justify-between border-t border-hairline pt-4">
              <div><Eyebrow>{v.durationMin} min, remote</Eyebrow></div>
              <Mono className="text-[15px] text-accent">{v.price.toFixed(2)} {v.currency}</Mono>
            </div>
          </div>
          <p className="mt-3 text-[12.5px] text-ink-muted">Owned by <Mono>{shortAddr(walletAddress)}</Mono></p>
        </div>
      </aside>
    </form>
  );
}

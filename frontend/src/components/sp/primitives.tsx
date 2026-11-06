import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { pad } from "@/lib/format";
import { EXPLORER_BASE } from "@/lib/api";

export function Wordmark({ className, inverse, showSubtitle = true }: { className?: string; inverse?: boolean; showSubtitle?: boolean }) {
  return (
    <Link to="/" className={cn("inline-flex flex-col group leading-none", inverse ? "text-background" : "text-ink", className)}>
      <div className="flex items-baseline gap-1.5">
        <span className="font-serif text-[22px] font-normal tracking-[-0.02em]">OASIS</span>
        <span className="mono text-[9px] uppercase tracking-widest opacity-80 border border-current px-1 py-0.5">Protocol</span>
      </div>
      {showSubtitle && (
        <span className={cn("mono text-[7.5px] uppercase tracking-wider mt-1 hidden sm:inline-block max-w-[220px] truncate opacity-70", inverse ? "text-background/70" : "text-ink-muted")}>
          Open Autonomous Services &amp; Interoperability Standard
        </span>
      )}
    </Link>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("eyebrow", className)}>{children}</div>;
}

export function ProgressLine({ className }: { className?: string }) {
  return <div role="progressbar" aria-label="Loading" className={cn("progress-line w-full", className)} />;
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setDone(true);
        toast("Copied to clipboard");
        setTimeout(() => setDone(false), 1200);
      }}
      className="inline-flex h-6 w-6 items-center justify-center text-ink-muted transition-colors hover:text-ink"
    >
      {done ? <Check className="h-3.5 w-3.5" strokeWidth={1.25} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.25} />}
    </button>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("mono", className)}>{children}</span>;
}

export function TxLink({ txId, short = true }: { txId: string; short?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <a href={EXPLORER_BASE + encodeURIComponent(txId)} target="_blank" rel="noreferrer" className="mono link-u text-accent">
        {short ? `${txId.slice(0, 18)}...` : txId}
      </a>
      <CopyButton value={txId} label="Copy transaction ID" />
    </span>
  );
}

const toneMap = {
  neutral: "bg-ink-muted",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  ink: "bg-ink",
} as const;

export function Status({ tone = "neutral", children }: { tone?: keyof typeof toneMap; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] text-ink">
      <span className={cn("inline-block h-1.5 w-1.5", toneMap[tone])} aria-hidden />
      {children}
    </span>
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center border border-hairline px-2 py-0.5 text-[11.5px] text-ink", className)}>{children}</span>;
}

export function TypeTag({ type }: { type: "human" | "ai" }) {
  return <span className="eyebrow border border-hairline px-1.5 py-px text-[10px]">{type === "ai" ? "AI agent" : "Human"}</span>;
}

export function Countdown({ until, className }: { until: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now == null) return <span className={cn("mono", className)}>--:--</span>;
  const s = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  return <span className={cn("mono", className)}>{pad(Math.floor(s / 60))}:{pad(s % 60)}</span>;
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-full border border-hairline bg-surface-raised">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 px-3 py-2 text-[12.5px] transition-colors duration-150",
            i > 0 && "border-l border-hairline",
            value === o.value ? "bg-ink text-background" : "text-ink hover:bg-surface",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SquareSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ink">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-4 w-7 border transition-colors duration-150", checked ? "border-ink bg-ink" : "border-ink-muted bg-surface-raised")}
      >
        <span className={cn("absolute top-[2px] h-2.5 w-2.5 transition-all duration-150", checked ? "left-[14px] bg-background" : "left-[2px] bg-ink-muted")} />
      </button>
      {label}
    </label>
  );
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="eyebrow block">{label}</label>
      {children}
      {hint && <p className="text-[12.5px] text-ink-muted">{hint}</p>}
    </div>
  );
}

export const inputCls =
  "w-full border border-hairline bg-surface-raised px-3 py-2.5 text-[14px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-muted focus:border-ink focus-visible:outline-none";

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-hairline px-6 py-14 text-center">
      <p className="font-serif text-2xl font-light">{title}</p>
      {body && <p className="mx-auto mt-2 max-w-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="border-l-2 border-danger bg-surface-raised px-4 py-3 text-[13.5px]">
      <span className="text-danger">Could not load.</span> <span className="text-ink-muted">{message}</span>
      {onRetry && <button onClick={onRetry} className="link-u ml-3 text-accent">Retry</button>}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-px">
      <ProgressLine />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-6 border-b border-hairline py-4">
          <div className="h-3 w-1/3 bg-surface" />
          <div className="h-3 w-1/6 bg-surface" />
          <div className="h-3 w-1/12 bg-surface" />
        </div>
      ))}
    </div>
  );
}

export function PageHeader({ eyebrow, title, action, sub }: { eyebrow?: string; title: string; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-10 flex flex-col gap-4 border-b border-hairline pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <Eyebrow className="mb-3">{eyebrow}</Eyebrow>}
        <h1 className="text-4xl md:text-5xl">{title}</h1>
        {sub && <div className="mt-3 max-w-xl text-ink-muted">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

/** Responsive ruled table: table on md+, stacked rows on mobile. */
export function RuledTable<T>({ columns, rows, rowKey, onRowClick }: {
  columns: { key: string; header: string; render: (r: T) => ReactNode; className?: string }[];
  rows: T[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
}) {
  return (
    <>
      <table className="hidden w-full border-collapse text-left md:table">
        <thead>
          <tr className="border-b border-ink">
            {columns.map((c) => (
              <th key={c.key} className={cn("eyebrow py-3 pr-4 font-medium", c.className)}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn("row-hover border-b border-hairline align-middle", onRowClick && "cursor-pointer")}>
              {columns.map((c) => (
                <td key={c.key} className={cn("py-4 pr-4", c.className)}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-ink md:hidden">
        {rows.map((r) => (
          <div key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className="space-y-2 border-b border-hairline py-4">
            {columns.map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-4">
                <span className="eyebrow pt-0.5">{c.header}</span>
                <div className="text-right">{c.render(r)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

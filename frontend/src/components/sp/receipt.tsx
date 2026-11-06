import { Link } from "@tanstack/react-router";
import type { Receipt } from "@/lib/api";
import { dt, money } from "@/lib/format";
import { CopyButton, Eyebrow, TxLink } from "./primitives";

export function ReceiptView({ receipt, showLink = true }: { receipt: Receipt; showLink?: boolean }) {
  const rows: [string, React.ReactNode][] = [
    ["Provider", <>{receipt.provider} <span className="text-ink-muted">({receipt.providerType === "ai" ? "AI agent" : "Human"})</span></>],
    ["Service", receipt.service],
    ["Date and time", dt(receipt.start)],
    ["Booking reference", <span className="inline-flex items-center gap-1"><span className="mono">{receipt.bookingRef}</span><CopyButton value={receipt.bookingRef} /></span>],
    ["Amount paid", <span className="mono text-accent">{money(receipt.amount, receipt.currency)}</span>],
    ["Hedera transaction", <TxLink txId={receipt.txId} />],
    ...(receipt.hcsUrl ? [["HCS Audit Log", (
      <a href={receipt.hcsUrl} target="_blank" rel="noreferrer" className="mono link-u text-accent text-[12.5px]">
        Topic {receipt.hcsUrl.split("/topic/")[1]?.split("?")[0] || "HashScan"} ↗
      </a>
    )] as [string, React.ReactNode]] : []),
  ];
  return (
    <div className="border border-ink bg-surface-raised">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
        <Eyebrow>Receipt</Eyebrow>
        <span className="eyebrow text-success">Settled</span>
      </div>
      <dl className="px-5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-6 border-b border-hairline py-2.5 last:border-0">
            <dt className="text-[12.5px] text-ink-muted">{k}</dt>
            <dd className="text-right text-[13.5px]">{v}</dd>
          </div>
        ))}
      </dl>
      {showLink && (
        <div className="border-t border-hairline px-5 py-3">
          <Link to="/buyer/bookings" className="link-u text-[13px] text-accent">View booking</Link>
        </div>
      )}
    </div>
  );
}

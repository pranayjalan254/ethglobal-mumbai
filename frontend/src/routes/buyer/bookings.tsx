import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { listBookings, type Booking } from "@/lib/api";
import { bookingTone, dt, money } from "@/lib/format";
import { Empty, ErrorBlock, Mono, PageHeader, RuledTable, Segmented, SkeletonRows, Status, TxLink } from "@/components/sp/primitives";
import { ReceiptView } from "@/components/sp/receipt";

export const Route = createFileRoute("/buyer/bookings")({ component: BuyerBookings });

function BuyerBookings() {
  const q = useQuery({ queryKey: ["bookings", "buyer"], queryFn: () => listBookings("buyer") });
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("all");
  const [open, setOpen] = useState<Booking | null>(null);
  const now = new Date();
  const rows = (q.data ?? []).filter((b) => filter === "all" || (filter === "upcoming" ? new Date(b.start) > now : new Date(b.start) <= now));

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6 md:py-14">
      <PageHeader eyebrow="Bookings" title="Your bookings" action={<div className="w-72"><Segmented label="Filter" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }]} /></div>} />
      {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorBlock message="Could not load bookings." onRetry={() => q.refetch()} /> : rows.length === 0 ? <Empty title="No bookings" body="Bookings made by you or your agent appear here." /> : (
        <RuledTable
          rows={rows}
          rowKey={(b) => b.id}
          onRowClick={setOpen}
          columns={[
            { key: "s", header: "Service", render: (b) => <span className="font-serif text-[17px]">{b.service}</span> },
            { key: "p", header: "Provider", render: (b) => b.provider },
            { key: "t", header: "Date and time", render: (b) => <Mono>{dt(b.start)}</Mono> },
            { key: "a", header: "Amount", render: (b) => <Mono>{money(b.amount, b.currency)}</Mono> },
            { key: "x", header: "Hedera tx", render: (b) => <span onClick={(e) => e.stopPropagation()}><TxLink txId={b.txId} /></span> },
            { key: "st", header: "Status", render: (b) => <Status tone={bookingTone(b.status)}>{b.status}</Status> },
          ]}
        />
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-md border border-ink bg-background p-6">
          <DialogTitle className="font-serif text-2xl font-light">{open?.service}</DialogTitle>
          {open && <ReceiptView receipt={open} showLink={false} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

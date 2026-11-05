import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listBookings } from "@/lib/api";
import { bookingTone, dt, money } from "@/lib/format";
import { Empty, ErrorBlock, Mono, PageHeader, RuledTable, SkeletonRows, Status, TxLink } from "@/components/sp/primitives";

export const Route = createFileRoute("/provider/bookings")({ component: ProviderBookings });

function ProviderBookings() {
  const q = useQuery({ queryKey: ["bookings", "provider"], queryFn: () => listBookings("provider") });
  return (
    <>
      <PageHeader eyebrow="Bookings" title="Bookings" sub="Every booking is paid through Hedera x402 before it is confirmed." />
      {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorBlock message="Could not load bookings." onRetry={() => q.refetch()} /> : q.data!.length === 0 ? <Empty title="No bookings yet" /> : (
        <RuledTable
          rows={q.data!}
          rowKey={(b) => b.id}
          columns={[
            { key: "b", header: "Buyer", render: (b) => <span className={b.buyer.startsWith("0x") || b.buyer.startsWith("agent") ? "mono" : ""}>{b.buyer}</span> },
            { key: "s", header: "Service", render: (b) => b.service },
            { key: "t", header: "Date and time", render: (b) => <Mono>{dt(b.start)}</Mono> },
            { key: "a", header: "Amount", render: (b) => <Mono>{money(b.amount, b.currency)}</Mono> },
            { key: "x", header: "Hedera tx", render: (b) => <TxLink txId={b.txId} /> },
            { key: "st", header: "Status", render: (b) => <Status tone={bookingTone(b.status)}>{b.status}</Status> },
          ]}
        />
      )}
    </>
  );
}

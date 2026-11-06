import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getProviderStats, listBookings, listMyServices } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dt, money } from "@/lib/format";
import { Empty, ErrorBlock, Eyebrow, Mono, PageHeader, ProgressLine, RuledTable, SkeletonRows, Status } from "@/components/sp/primitives";

export const Route = createFileRoute("/provider/")({ component: Overview });

function Overview() {
  const { walletAddress, profile } = useAuth();
  const myServices = useQuery({
    queryKey: ["my-services", walletAddress],
    queryFn: () => listMyServices(walletAddress!),
    enabled: Boolean(walletAddress),
  });
  const stats = useQuery({
    queryKey: ["provider-stats", walletAddress],
    queryFn: () => getProviderStats(walletAddress),
    enabled: Boolean(walletAddress),
  });
  const bookings = useQuery({
    queryKey: ["bookings", "provider", walletAddress],
    queryFn: () => listBookings("provider"),
  });
  const upcoming = (bookings.data ?? []).filter((b) => new Date(b.start) > new Date() && b.status !== "cancelled");

  const publishedServicesCount = myServices.data
    ? myServices.data.filter((s) => s.status === "published").length
    : (stats.data?.publishedServices ?? 0);
  const upcomingCount = upcoming.length;
  const totalEarnings = (bookings.data ?? [])
    .filter((b) => b.status === "confirmed")
    .reduce((acc, b) => acc + (b.amount || 0), 0) || (stats.data?.earningsUsdc ?? 0);
  const profileViews = stats.data?.profileViews ?? (publishedServicesCount * 48);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={profile?.displayName ? `Good to see you, ${profile.displayName.split(" ")[0]}.` : "Overview"}
        sub={<>Everything you publish is owned by <Mono className="text-ink">{walletAddress}</Mono></>}
      />
      {stats.isLoading && myServices.isLoading ? <ProgressLine /> : stats.isError && myServices.isError ? <ErrorBlock message="Stats unavailable." onRetry={() => stats.refetch()} /> : (
        <div className="grid grid-cols-2 border-y border-hairline md:grid-cols-4">
          {[
            ["Published services", String(publishedServicesCount)],
            ["Upcoming bookings", String(upcomingCount)],
            ["Earnings, HBAR", totalEarnings.toLocaleString("en-US", { minimumFractionDigits: 2 })],
            ["Profile views", profileViews.toLocaleString()],
          ].map(([k, v], i) => (
            <div key={k} className={`px-0 py-8 md:px-6 ${i % 2 ? "border-l border-hairline pl-6" : ""} ${i === 2 ? "md:border-l md:border-hairline border-t md:border-t-0" : ""} ${i === 3 ? "border-t md:border-t-0" : ""} ${i === 0 ? "md:pl-0" : ""}`}>
              <Eyebrow>{k}</Eyebrow>
              <div className="mt-3 font-serif text-5xl font-light">{v}</div>
            </div>
          ))}
        </div>
      )}

      <section className="mt-16">
        <h2 className="mb-6 text-2xl">Next appointments</h2>
        {bookings.isLoading ? <SkeletonRows /> : bookings.isError ? <ErrorBlock message="Bookings unavailable." /> : upcoming.length === 0 ? (
          <Empty title="No upcoming appointments" body="Bookings appear here once a buyer or agent pays for one of your slots." />
        ) : (
          <RuledTable
            rows={upcoming}
            rowKey={(b) => b.id}
            columns={[
              { key: "when", header: "Date and time", render: (b) => <Mono>{dt(b.start)}</Mono> },
              { key: "svc", header: "Service", render: (b) => b.service },
              { key: "buyer", header: "Buyer", render: (b) => <span className="text-ink-muted">{b.buyer}</span> },
              { key: "amt", header: "Amount", render: (b) => <Mono>{money(b.amount, b.currency)}</Mono>, className: "text-right" },
              { key: "st", header: "Status", render: (b) => <Status tone={b.status === "confirmed" ? "success" : "warning"}>{b.status}</Status> },
            ]}
          />
        )}
      </section>
    </>
  );
}

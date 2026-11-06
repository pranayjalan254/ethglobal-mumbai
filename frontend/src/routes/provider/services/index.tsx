import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listMyServices, renewService, unpublishService, type Service } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateOnly, money } from "@/lib/format";
import { Empty, ErrorBlock, Mono, PageHeader, RuledTable, SkeletonRows, Status } from "@/components/sp/primitives";
import { PublishDrawer } from "@/components/sp/publish-drawer";

export const Route = createFileRoute("/provider/services/")({ component: MyServices });

function MyServices() {
  const { walletAddress } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["my-services", walletAddress],
    queryFn: () => listMyServices(walletAddress!),
    enabled: Boolean(walletAddress),
  });
  const [publishing, setPublishing] = useState<Service | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-services", walletAddress] });

  const act = (label: string, s: Service) => (
    <button
      key={label}
      className="link-u text-[12.5px] text-accent"
      onClick={async (e) => {
        e.stopPropagation();
        if (label === "Edit") return navigate({ to: "/provider/services/$id", params: { id: s.id } });
        if (label === "Publish to Arkiv") return setPublishing(s);
        if (label === "Renew") { await renewService(s.id); toast("Listing renewed for 30 days"); }
        if (label === "Unpublish") { await unpublishService(s.id); toast("Listing unpublished"); }
        refresh();
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <PageHeader eyebrow="My services" title="Services" action={<Button asChild><Link to="/provider/services/new">New service</Link></Button>} />
      {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorBlock message={String(q.error)} onRetry={() => q.refetch()} /> : q.data!.length === 0 ? (
        <Empty title="No services yet" body="Create a service, then publish it to Arkiv to make it discoverable." action={<Button asChild><Link to="/provider/services/new">New service</Link></Button>} />
      ) : (
        <RuledTable
          rows={q.data!}
          rowKey={(s) => s.id}
          columns={[
            { key: "t", header: "Service", render: (s) => <span className="font-serif text-[17px]">{s.title}</span> },
            { key: "c", header: "Category", render: (s) => <span className="text-ink-muted">{s.category}</span> },
            { key: "p", header: "Price", render: (s) => <Mono>{money(s.price, s.currency)}</Mono> },
            { key: "d", header: "Duration", render: (s) => <Mono>{s.durationMin} min</Mono> },
            { key: "s", header: "Status", render: (s) => s.status === "published" ? <Status tone="success">Published on Arkiv</Status> : s.status === "expired" ? <Status tone="danger">Expired</Status> : <Status>Draft</Status> },
            { key: "e", header: "Expires", render: (s) => <Mono className="text-ink-muted">{s.expiresAt ? dateOnly(s.expiresAt) : "—"}</Mono> },
            {
              key: "a", header: "Actions", render: (s) => (
                <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 md:justify-start">
                  {act("Edit", s)}
                  {s.status === "draft" && act("Publish to Arkiv", s)}
                  {s.status !== "draft" && act("Renew", s)}
                  {s.status === "published" && act("Unpublish", s)}
                </div>
              ),
            },
          ]}
        />
      )}
      <PublishDrawer service={publishing} onClose={() => setPublishing(null)} />
    </>
  );
}

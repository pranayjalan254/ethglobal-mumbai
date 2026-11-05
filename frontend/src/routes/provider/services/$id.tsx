import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listMyServices, updateService } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, PageHeader, ProgressLine } from "@/components/sp/primitives";
import { ServiceForm } from "@/components/sp/service-form";

export const Route = createFileRoute("/provider/services/$id")({ component: EditService });

function EditService() {
  const { id } = Route.useParams();
  const { walletAddress } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["my-services"], queryFn: () => listMyServices(walletAddress!) });
  const svc = q.data?.find((s) => s.id === id);
  return (
    <>
      <Link to="/provider/services" className="link-u mb-6 text-[13px] text-ink-muted">Back to services</Link>
      <PageHeader eyebrow="Edit service" title={svc?.title ?? "Service"} />
      {q.isLoading ? <ProgressLine /> : !svc ? <Empty title="Service not found" /> : (
        <ServiceForm
          initial={svc}
          submitting={busy}
          onSubmit={async (v) => {
            setBusy(true);
            await updateService(walletAddress!, id, v);
            toast("Changes saved");
            navigate({ to: "/provider/services" });
          }}
        />
      )}
    </>
  );
}

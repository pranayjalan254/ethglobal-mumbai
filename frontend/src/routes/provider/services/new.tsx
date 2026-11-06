import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { createService } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/sp/primitives";
import { ServiceForm } from "@/components/sp/service-form";

export const Route = createFileRoute("/provider/services/new")({ component: NewService });

function NewService() {
  const { walletAddress } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const swarmRefParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("swarmRef") || "" : "";

  return (
    <>
      <Link to="/provider/services" className="link-u mb-6 text-[13px] text-ink-muted">Back to services</Link>
      <PageHeader eyebrow="New service" title="Describe the service" />
      <ServiceForm
        initial={swarmRefParam ? ({ swarmRef: swarmRefParam } as any) : undefined}
        submitting={busy}
        onSubmit={async (v) => {
          setBusy(true);
          await createService(walletAddress!, v);
          toast("Saved as draft. Publish it to Arkiv when ready.");
          navigate({ to: "/provider/services" });
        }}
      />
    </>
  );
}

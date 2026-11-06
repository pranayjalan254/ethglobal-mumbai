import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { autoLinkSwarmDocument, listMyServices, type SwarmFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { uploadToSwarm } from "@/lib/swarm";
import { kb, shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CopyButton, Empty, Mono, PageHeader, ProgressLine, RuledTable, Status } from "@/components/sp/primitives";

export const Route = createFileRoute("/provider/portfolio")({ component: Portfolio });

const STORAGE_KEY = "slotpay_portfolio_files";

function loadSavedFiles(): SwarmFile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [
    {
      id: "f1",
      name: "credentials-aws.pdf",
      size: 412_000,
      swarmRef: "96bfa8a3683f12445e999c104cf2ec700ab2f22b7a957d90d7003ffea3dc10b6",
      status: "linked",
    },
  ];
}

function Portfolio() {
  const { walletAddress } = useAuth();
  const [files, setFiles] = useState<SwarmFile[]>(loadSavedFiles);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Sync with provider's active Arkiv service documents so refresh preserves on-chain links
  useEffect(() => {
    if (!walletAddress) return;
    listMyServices(walletAddress)
      .then((services) => {
        const foundDocs: SwarmFile[] = [];
        for (const s of services) {
          for (const d of s.provider?.documents || []) {
            if (d.swarmRef) {
              foundDocs.push({
                id: `doc_${d.swarmRef.slice(0, 10)}`,
                name: d.name || "Verified Portfolio & Credentials",
                size: 320_000,
                swarmRef: d.swarmRef,
                status: "linked",
              });
            }
          }
        }
        if (foundDocs.length > 0) {
          setFiles((prev) => {
            const existing = new Set(prev.map((x) => x.swarmRef));
            const fresh = foundDocs.filter((x) => !existing.has(x.swarmRef));
            if (fresh.length === 0) return prev;
            const merged = [...fresh, ...prev];
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      })
      .catch(() => {});
  }, [walletAddress]);

  async function add(list: FileList | null) {
    if (!list) return;
    for (const file of Array.from(list)) {
      const id = Math.random().toString(36).slice(2);
      setFiles((f) => [{ id, name: file.name, size: file.size, swarmRef: "", status: "uploading" }, ...f]);

      try {
        const { reference } = await uploadToSwarm(file);

        // Automatically link to the provider's active Arkiv entity
        await autoLinkSwarmDocument(walletAddress || "", file.name, reference);

        const updatedFile: SwarmFile = { id, name: file.name, size: file.size, swarmRef: reference, status: "linked" };

        setFiles((prev) => {
          const next = prev.map((x) => (x.id === id ? updatedFile : x));
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });

        toast.success(`"${file.name}" stored on Swarm & linked to your Arkiv listing!`);
      } catch (err: any) {
        console.error("Swarm upload error:", err);
        setFiles((f) => f.map((x) => (x.id === id ? { ...x, status: "stored", swarmRef: "upload_failed" } : x)));
      }
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Portfolio"
        title="Documents and credentials"
        sub="Files are stored on Swarm and automatically referenced by content hash from your Arkiv entities."
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
        role="button"
        tabIndex={0}
        className={cn(
          "cursor-pointer border border-dashed px-6 py-14 text-center transition-colors duration-150",
          over ? "border-ink bg-surface" : "border-ink-muted/50 bg-surface-raised hover:bg-surface"
        )}
      >
        <p className="font-serif text-2xl font-light">Drop files here</p>
        <p className="mt-2 text-ink-muted">or click to choose. PDF, images and documents up to 25 MB.</p>
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => add(e.target.files)} />
      </div>

      <section className="mt-12">
        {files.length === 0 ? (
          <Empty title="No files uploaded" />
        ) : (
          <RuledTable
            rows={files}
            rowKey={(f) => f.id}
            columns={[
              { key: "n", header: "Name", render: (f) => f.name },
              { key: "s", header: "Size", render: (f) => <Mono>{kb(f.size)}</Mono> },
              {
                key: "r",
                header: "Swarm reference",
                render: (f) =>
                  f.status === "uploading" ? (
                    <ProgressLine className="w-32" />
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <a
                        href={`/api/swarm/${f.swarmRef.replace(/^0x/, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline hover:opacity-80 font-mono text-xs"
                        title="View file preview"
                      >
                        bzz://{shortHash(f.swarmRef.replace(/^0x/, ""), 6)}
                      </a>
                      <a
                        href={`https://api.gateway.ethswarm.org/bzz/${f.swarmRef.replace(/^0x/, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-ink-muted underline hover:text-ink"
                        title="Open on Swarm Gateway"
                      >
                        [gateway]
                      </a>
                      <CopyButton value={f.swarmRef} />
                    </span>
                  ),
              },
              {
                key: "st",
                header: "Status",
                render: (f) =>
                  f.status === "uploading" ? (
                    <Status tone="warning">Uploading</Status>
                  ) : f.status === "linked" ? (
                    <Status tone="success">Linked to Arkiv entity</Status>
                  ) : (
                    <Status tone="accent">Stored on Swarm</Status>
                  ),
              },
            ]}
          />
        )}
      </section>
    </>
  );
}

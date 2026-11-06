import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { API_BASE_URL, autoLinkSwarmDocument, listMyServices, type SwarmFile } from "@/lib/api";
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
      if (Array.isArray(parsed) && parsed.length > 0) {
        const seen = new Set<string>();
        const cleaned = parsed.filter((x: SwarmFile) => {
          if (!x || !x.name) return false;
          // Strip any legacy dummy/mock file
          if (x.name === "credentials-aws.pdf" || x.swarmRef?.startsWith("96bfa8a3")) return false;
          const key = `${x.name}_${x.swarmRef}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (cleaned.length !== parsed.length) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
          } catch {}
        }
        return cleaned;
      }
    }
  } catch {}
  return [];
}

function Portfolio() {
  const { walletAddress } = useAuth();
  const [files, setFiles] = useState<SwarmFile[]>(loadSavedFiles);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Sync with provider's active Arkiv service documents so refresh preserves on-chain links
  useEffect(() => {
    const owner = walletAddress || "0x5d8d26cbea05632abf3a3cf87e1f3806ad34de77";
    listMyServices(owner)
      .then((services) => {
        const foundDocs: SwarmFile[] = [];
        for (const s of services) {
          for (const d of s.provider?.documents || []) {
            if (d.swarmRef && !d.swarmRef.startsWith("96bfa8a3") && d.name !== "credentials-aws.pdf") {
              foundDocs.push({
                id: `doc_${d.swarmRef.slice(0, 10)}_${encodeURIComponent(d.name)}`,
                name: d.name || "Portfolio Document",
                size: 90_000,
                swarmRef: d.swarmRef,
                status: "linked",
              });
            }
          }
        }
        if (foundDocs.length > 0) {
          setFiles((prev) => {
            const byKey = new Map<string, SwarmFile>();
            // Keep all current files first (preserving real names and sizes), purge dummy
            for (const f of prev) {
              if (
                f.swarmRef &&
                f.swarmRef !== "upload_failed" &&
                !f.swarmRef.startsWith("96bfa8a3") &&
                f.name !== "credentials-aws.pdf"
              ) {
                byKey.set(`${f.name}_${f.swarmRef}`, f);
              }
            }
            // Add any newly discovered docs from backend ONLY if not already present
            for (const f of foundDocs) {
              const k = `${f.name}_${f.swarmRef}`;
              if (!byKey.has(k)) {
                byKey.set(k, f);
              }
            }
            const merged = Array.from(byKey.values());
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

        // Automatically link to all active services and Arkiv entity
        await autoLinkSwarmDocument(walletAddress || "0x5d8d26cbea05632abf3a3cf87e1f3806ad34de77", file.name, reference);

        const updatedFile: SwarmFile = {
          id: `file_${reference.slice(0, 10)}_${Date.now()}`,
          name: file.name,
          size: file.size,
          swarmRef: reference,
          status: "linked",
        };

        setFiles((prev) => {
          // Replace uploading temp placeholder by id, keeping ALL previous files intact
          const withoutTemp = prev.filter((x) => x.id !== id);
          const withoutDup = withoutTemp.filter(
            (x) => !(x.name === file.name && x.swarmRef === reference)
          );
          const next = [updatedFile, ...withoutDup];
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });

        toast.success(`"${file.name}" stored on Swarm & attached to all your services!`);
      } catch (err: any) {
        console.error("Swarm upload error:", err);
        setFiles((f) => f.map((x) => (x.id === id ? { ...x, status: "stored", swarmRef: "upload_failed" } : x)));
      }
    }
  }

  function removeFile(fileId: string) {
    setFiles((prev) => {
      const next = prev.filter((x) => x.id !== fileId);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    toast("File removed from portfolio");
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
                        href={`https://gateway.ethswarm.org/bzz/${f.swarmRef.replace(/^bzz:\/\//, "").replace(/^0x/, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline hover:opacity-80 font-mono text-xs"
                        title="Open on Swarm Gateway"
                      >
                        bzz://{shortHash(f.swarmRef.replace(/^bzz:\/\//, "").replace(/^0x/, ""), 6)}
                      </a>
                      <a
                        href={`${API_BASE_URL}/api/swarm/${f.swarmRef.replace(/^bzz:\/\//, "").replace(/^0x/, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-ink-muted underline hover:text-ink"
                        title="Direct local retrieval"
                      >
                        [direct]
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
              {
                key: "act",
                header: "",
                render: (f) => (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(f.id);
                    }}
                    className="text-xs text-ink-muted hover:text-danger underline"
                    title="Remove document"
                  >
                    remove
                  </button>
                ),
              },
            ]}
          />
        )}
      </section>
    </>
  );
}

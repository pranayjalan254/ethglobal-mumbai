import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { uploadToSwarm, randomHash, type SwarmFile } from "@/lib/api";
import { kb, shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CopyButton, Empty, Mono, PageHeader, ProgressLine, RuledTable, Status } from "@/components/sp/primitives";

export const Route = createFileRoute("/provider/portfolio")({ component: Portfolio });

function Portfolio() {
  const [files, setFiles] = useState<SwarmFile[]>(() => [
    { id: "f1", name: "credentials-aws.pdf", size: 412_000, swarmRef: randomHash(), status: "linked" },
    { id: "f2", name: "portfolio-2026.pdf", size: 2_340_000, swarmRef: randomHash(), status: "stored" },
  ]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function add(list: FileList | null) {
    if (!list) return;
    for (const file of Array.from(list)) {
      const id = Math.random().toString(36).slice(2);
      setFiles((f) => [{ id, name: file.name, size: file.size, swarmRef: "", status: "uploading" }, ...f]);
      // POST /api/swarm/upload
      const { reference } = await uploadToSwarm(file);
      setFiles((f) => f.map((x) => (x.id === id ? { ...x, swarmRef: reference, status: "stored" } : x)));
    }
  }

  return (
    <>
      <PageHeader eyebrow="Portfolio" title="Documents and credentials" sub="Files are stored on Swarm and referenced by content hash from your Arkiv entities." />
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
        role="button"
        tabIndex={0}
        className={cn("cursor-pointer border border-dashed px-6 py-14 text-center transition-colors duration-150", over ? "border-ink bg-surface" : "border-ink-muted/50 bg-surface-raised hover:bg-surface")}
      >
        <p className="font-serif text-2xl font-light">Drop files here</p>
        <p className="mt-2 text-ink-muted">or click to choose. PDF, images and documents up to 25 MB.</p>
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => add(e.target.files)} />
      </div>

      <section className="mt-12">
        {files.length === 0 ? <Empty title="No files uploaded" /> : (
          <RuledTable
            rows={files}
            rowKey={(f) => f.id}
            columns={[
              { key: "n", header: "Name", render: (f) => f.name },
              { key: "s", header: "Size", render: (f) => <Mono>{kb(f.size)}</Mono> },
              { key: "r", header: "Swarm reference", render: (f) => f.status === "uploading" ? <ProgressLine className="w-32" /> : <span className="inline-flex items-center gap-1"><Mono>{shortHash(f.swarmRef)}</Mono><CopyButton value={f.swarmRef} /></span> },
              { key: "st", header: "Status", render: (f) => f.status === "uploading" ? <Status tone="warning">Uploading</Status> : f.status === "linked" ? <Status tone="success">Linked to Arkiv entity</Status> : <Status tone="accent">Stored on Swarm</Status> },
            ]}
          />
        )}
      </section>
    </>
  );
}

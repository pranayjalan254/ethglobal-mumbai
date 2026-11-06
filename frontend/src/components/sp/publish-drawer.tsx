import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { publishService, type Service } from "@/lib/api";
import { getArkivExpiration, publishServiceOnChain } from "@/lib/arkiv";
import { useAuth } from "@/lib/auth";
import { dateOnly, formatExpiration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CopyButton, Eyebrow, Field, inputCls, Mono, ProgressLine, Segmented } from "./primitives";

const STEPS = ["Preparing entity", "Signing with wallet", "Writing to Arkiv", "Confirmed"];

export function PublishDrawer({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const { walletAddress, getEthereumProvider } = useAuth();
  const qc = useQueryClient();
  const [exp, setExp] = useState<"7" | "30" | "90" | "custom">("30");
  const [custom, setCustom] = useState(14);
  const [step, setStep] = useState(-1);
  const [result, setResult] = useState<{ entity_key: string; tx_ref: string; expires_at: string } | null>(null);

  const days = exp === "custom" ? custom : Number(exp);

  async function run() {
    if (!service) return;
    try {
      setStep(0); // Preparing entity
      await new Promise((r) => setTimeout(r, 400));

      setStep(1); // Signing with wallet
      let entityKey = "";
      let txHash = "";
      let expiresAt = "";

      if (walletAddress) {
        try {
          const provider = await getEthereumProvider();
          setStep(2); // Writing to Arkiv
          const onChain = await publishServiceOnChain(provider, walletAddress, service, days);
          entityKey = onChain.entity_key;
          txHash = onChain.tx_ref;
          expiresAt = onChain.expires_at;
        } catch (onChainErr: any) {
          console.warn("[OASIS] Real on-chain publish notice:", onChainErr);
          const msg: string = onChainErr?.message || String(onChainErr);
          const isChainError =
            msg.toLowerCase().includes("chain") ||
            msg.toLowerCase().includes("network") ||
            msg.toLowerCase().includes("switch");
          toast.error(
            isChainError
              ? "Wrong network — please switch to Arkiv Rabdi (chain 7794095) in your wallet and try again."
              : `On-chain transaction failed: ${msg.slice(0, 120)}`
          );
          setStep(-1);
          return;
        }
      }

      const res = await publishService(service.id, days, entityKey, txHash);
      setResult({
        entity_key: entityKey || res.entity_key,
        tx_ref: txHash || res.tx_ref,
        expires_at: expiresAt || res.expires_at,
      });
      setStep(3); // Confirmed
      qc.invalidateQueries({ queryKey: ["my-services"] });
    } catch (err: any) {
      console.error("[OASIS] Publish error:", err);
      toast.error(`Publishing failed: ${err?.message || err}`);
      setStep(-1);
    }
  }

  function close() {
    onClose();
    setTimeout(() => { setStep(-1); setResult(null); }, 200);
  }

  return (
    <Sheet open={!!service} onOpenChange={(o) => !o && close()}>
      <SheetContent className="w-full border-l border-ink bg-background p-0 sm:max-w-md">
        <SheetHeader className="border-b border-hairline p-6 text-left">
          <Eyebrow>Publish to Arkiv</Eyebrow>
          <SheetTitle className="font-serif text-3xl font-light">{service?.title}</SheetTitle>
          <SheetDescription className="text-ink-muted">
            Owned by <Mono className="text-ink">{walletAddress}</Mono>
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-8 p-6">
          {step < 0 && (
            <>
              <Field label="Listing expires after" hint="Arkiv entities expire. Choose how long this listing stays discoverable; you can renew it at any time before or after it lapses.">
                <Segmented label="Expiration" value={exp} onChange={setExp} options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "custom", label: "Custom" }]} />
              </Field>
              {exp === "custom" && (
                <Field label="Days" htmlFor="cd"><input id="cd" type="number" min={1} max={365} className={inputCls} value={custom} onChange={(e) => setCustom(Number(e.target.value))} /></Field>
              )}
              <Button className="w-full" onClick={run}>Sign and publish</Button>
            </>
          )}
          {step >= 0 && (
            <ol className="border-t border-hairline">
              {STEPS.map((s, i) => {
                const state = i < step || (i === 3 && step === 3) ? "done" : i === step ? "running" : "pending";
                return (
                  <li key={s} className="border-b border-hairline py-4">
                    <div className="flex items-center gap-4">
                      <Mono className={cn(state === "pending" ? "text-ink-muted" : "text-ink")}>0{i + 1}</Mono>
                      <span className={cn("flex-1", state === "pending" && "text-ink-muted")}>{s}</span>
                      <span className={cn("eyebrow", state === "done" && "text-success")}>{state === "done" ? "Done" : state === "running" ? "Running" : "Pending"}</span>
                    </div>
                    {state === "running" && <ProgressLine className="mt-3" />}
                  </li>
                );
              })}
            </ol>
          )}
          {result && (
            <dl className="mono space-y-3 border border-hairline bg-surface-raised p-4">
              <div><dt className="eyebrow">Entity key</dt><dd className="flex items-center gap-1 break-all">{result.entity_key.slice(0, 34)}...<CopyButton value={result.entity_key} /></dd></div>
              <div>
                <dt className="eyebrow">Transaction</dt>
                <dd className="flex items-center gap-1 break-all">
                  {result.tx_ref.startsWith("0x") ? (
                    <a
                      href={`https://rabdi.explorer.arkiv.network/tx/${result.tx_ref}`}
                      target="_blank"
                      rel="noreferrer"
                      className="link-u text-accent"
                    >
                      {result.tx_ref.slice(0, 24)}...
                    </a>
                  ) : (
                    <span>{result.tx_ref.slice(0, 24)}...</span>
                  )}
                  <CopyButton value={result.tx_ref} />
                </dd>
              </div>
              <div><dt className="eyebrow">Expires</dt><dd>{formatExpiration(result.expires_at)}</dd></div>
            </dl>
          )}
          {step === 3 && <Button variant="outline" className="w-full" onClick={close}>Done</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

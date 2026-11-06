import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { claimSlot, confirmBooking, createBooking, type PaymentRequirements, type Receipt, type Service, type Slot } from "@/lib/api";
import { executeAutonomousHederaPayment } from "@/lib/x402-hedera";
import { dt, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Countdown, Eyebrow, Mono, ProgressLine } from "./primitives";
import { ReceiptView } from "./receipt";

const PHASES = ["Claiming", "Awaiting payment challenge", "Signing", "Settling", "Confirmed"];

export function Checkout({ service, slot, onClose }: { service: Service; slot: Slot | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState(-1);
  const [claimUntil, setClaimUntil] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentRequirements | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    if (!slot) return;
    setPhase(0); setReceipt(null); setPayment(null);
    let live = true;
    claimSlot(slot.id).then((c) => { if (live) { setClaimUntil(c.expires_at); setPhase(-2); } });
    return () => { live = false; };
  }, [slot]);

  async function pay() {
    if (!slot) return;
    setPhase(1);
    const b = await createBooking(service, slot.id);
    setPayment(b.payment);
    await new Promise((r) => setTimeout(r, 600));
    setPhase(2);
    const settlement = await executeAutonomousHederaPayment({
      challenge: {
        status: 402,
        scheme: "exact",
        network: "hedera-testnet",
        amount: b.payment.amount,
        currency: service.currency,
        token: b.payment.token,
        payTo: b.payment.payTo,
        feePayer: "0.0.987654",
        facilitator: b.payment.facilitator,
        resource: b.payment.resource,
        maxTimeoutSeconds: b.payment.maxTimeoutSeconds,
      },
      approvedBudget: service.price * 1.5,
      clientWallet: "0x71c2a0b3c4e5f61a2b3f4e5d6c7b8a9f0e1d2c3b",
    });
    setPhase(3);
    const r = await confirmBooking(service, slot.start, settlement.txId);
    setReceipt(r);
    setPhase(4);
    qc.invalidateQueries({ queryKey: ["bookings"] });
  }

  return (
    <Dialog open={!!slot} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg border border-ink bg-background p-0">
        <div className="border-b border-hairline p-6">
          <Eyebrow>Checkout</Eyebrow>
          <DialogTitle className="mt-2 font-serif text-3xl font-light">{service.title}</DialogTitle>
          <DialogDescription className="mt-1 text-ink-muted">{service.provider.name}</DialogDescription>
        </div>
        <div className="space-y-6 p-6">
          {!receipt && slot && (
            <dl className="border-t border-hairline text-[13.5px]">
              {[
                ["Slot", <Mono key="s">{dt(slot.start)}</Mono>],
                ["Duration", <Mono key="d">{service.durationMin} min</Mono>],
                ["Total", <Mono key="t" className="text-accent">{money(service.price, service.currency)}</Mono>],
                ["Payment method", "Pay with Hedera x402"],
                ["Slot held", claimUntil ? <span key="h"><Countdown until={claimUntil} className="text-warning" /> remaining</span> : <span key="h" className="text-ink-muted">Claiming</span>],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between border-b border-hairline py-2.5"><dt className="text-ink-muted">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          )}
          {phase !== -2 && phase >= 0 && !receipt && (
            <ol>
              {PHASES.map((p, i) => (
                <li key={p} className="flex items-center gap-4 border-b border-hairline py-2.5 text-[13.5px]">
                  <Mono className={cn(i > phase && "text-ink-muted")}>0{i + 1}</Mono>
                  <span className={cn("flex-1", i > phase && "text-ink-muted")}>{p}</span>
                  {i < phase && <span className="eyebrow text-success">Done</span>}
                  {i === phase && <ProgressLine className="w-16" />}
                </li>
              ))}
            </ol>
          )}
          {payment && !receipt && (
            <pre className="mono overflow-x-auto border border-hairline bg-surface-raised p-3 text-[11.5px]">{`402 Payment Required
amount ${payment.amount}  token ${payment.token}
network ${payment.network}
payTo ${payment.payTo}`}</pre>
          )}
          {receipt && <ReceiptView receipt={receipt} />}
          {phase === -2 && <Button className="w-full" size="lg" onClick={pay}>Pay {money(service.price, service.currency)}</Button>}
          {receipt && <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { streamAgentChat, STEP_TITLES, type AgentStep, type AgentStepId, type PaymentRequirements, type Receipt } from "@/lib/api";
import { executeAutonomousHederaPayment } from "@/lib/x402-hedera";
import { dt, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Countdown, Eyebrow, Mono, ProgressLine, SquareSwitch, TxLink, TypeTag } from "@/components/sp/primitives";
import { ReceiptView } from "@/components/sp/receipt";

export const Route = createFileRoute("/buyer/")({ component: Agent });

const EXAMPLES = [
  "Find me a Python developer available tomorrow for a one-hour consultation under $20. Choose the best option and book it.",
  "Book a UX review of our onboarding flow this week, budget $50.",
  "Get a cited market research brief on agent payments today for under $15 and pay for it.",
];

interface AgentMsg {
  id: string;
  role: "user" | "agent";
  text: string;
  steps: Partial<Record<AgentStepId, AgentStep>>;
  approval?: { amount: number; resolve: (ok: boolean) => void; answered?: boolean } | undefined;
  done?: boolean | undefined;
  receipt?: Receipt | undefined;
}

function Agent() {
  const { walletAddress, getEthereumProvider } = useAuth();
  const [msgs, setMsgs] = useState<AgentMsg[]>([]);
  const [input, setInput] = useState("");
  const [limit, setLimit] = useState(5.0);
  const [autoApprove, setAutoApprove] = useState(true);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  const patch = (id: string, fn: (m: AgentMsg) => AgentMsg) => setMsgs((all) => all.map((m) => (m.id === id ? fn(m) : m)));

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const aid = "a" + Date.now();
    setMsgs((m) => [...m, { id: "u" + Date.now(), role: "user", text, steps: {} }, { id: aid, role: "agent", text: "", steps: {} }]);
    setInput("");
    setBusy(true);

    let realTxHash: string | null = null;

    await streamAgentChat(
      text,
      { limit, autoApprove },
      (e) => {
        if (realTxHash && e.step?.id === "pay" && e.step.detail) {
          (e.step.detail as any).txId = realTxHash;
          (e.step.detail as any).explorerUrl = `https://hashscan.io/testnet/transaction/${realTxHash}`;
        }
        if (realTxHash && e.receipt) {
          e.receipt.txId = realTxHash;
        }
        if (e.type === "step" && e.step) patch(aid, (m) => ({ ...m, steps: { ...m.steps, [e.step!.id]: e.step } }));
        if (e.type === "text") patch(aid, (m) => ({ ...m, text: e.text ?? "" }));
        if (e.type === "done") patch(aid, (m) => ({ ...m, done: true, receipt: e.receipt }));
      },
      (amount) => new Promise<boolean>((resolve) => patch(aid, (m) => ({ ...m, approval: { amount, resolve } }))),
      undefined,
      walletAddress || undefined,
      async (payment) => {
        try {
          const provider = await getEthereumProvider(296);
          const res = await executeAutonomousHederaPayment({
            challenge: {
              status: 402,
              scheme: "exact",
              network: "hedera-testnet",
              amount: payment.amount,
              currency: "HBAR",
              token: "HBAR",
              payTo: payment.payTo,
              feePayer: payment.feePayer || "0.0.9185802",
              facilitator: payment.facilitator,
              resource: payment.resource,
              maxTimeoutSeconds: payment.maxTimeoutSeconds,
            },
            approvedBudget: Math.max(limit, parseFloat(payment.amount) || 0),
            clientWallet: walletAddress || "0x5d8d26cbea05632abf3a3cf87e1f3806ad34de77",
            provider,
          });
          realTxHash = res.txId;
          return res.txId;
        } catch (payError) {
          console.error("[SlotPay] Real on-chain Hedera payment error:", payError);
          return "";
        }
      },
    );
    setBusy(false);
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-[760px] flex-1 px-4 pb-8 pt-12">
        {msgs.length === 0 ? (
          <div className="pt-10 md:pt-20">
            <Eyebrow className="mb-4">Agent</Eyebrow>
            <h1 className="text-5xl md:text-6xl">Describe what you need.</h1>
            <p className="mt-4 max-w-lg text-ink-muted">The agent searches the open network, compares providers, claims a slot and pays within your spending limit.</p>
            <ul className="mt-10 border-t border-hairline">
              {EXAMPLES.map((e) => (
                <li key={e}>
                  <button onClick={() => send(e)} className="row-hover group flex w-full items-start gap-4 border-b border-hairline px-1 py-4 text-left">
                    <span className="mono pt-0.5 text-accent">&rarr;</span>
                    <span className="text-[14.5px]">{e}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-10">
            {msgs.map((m) => m.role === "user" ? (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="ml-auto max-w-[85%] border border-hairline bg-surface px-4 py-3 text-[14.5px]">
                {m.text}
              </motion.div>
            ) : (
              <AgentMessage key={m.id} m={m} onApprove={(ok) => { m.approval?.resolve(ok); patch(m.id, (x) => ({ ...x, approval: x.approval && { ...x.approval, answered: true } })); }} />
            ))}
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="sticky bottom-0 border-t border-hairline bg-background">
        <form className="mx-auto w-full max-w-[760px] px-4 py-4" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <div className="flex border border-hairline bg-surface-raised focus-within:border-ink">
            <label htmlFor="composer" className="sr-only">Message the agent</label>
            <textarea
              id="composer"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Describe the service, budget and timing"
              className="flex-1 resize-none bg-transparent px-4 py-3 text-[14.5px] outline-none placeholder:text-ink-muted"
            />
            <Button type="submit" size="icon" className="m-2 h-10 w-10 self-end" disabled={busy || !input.trim()} aria-label="Send">
              <ArrowUp />
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="inline-flex items-center gap-2 text-[12.5px]">
              <span className="eyebrow">Spending limit</span>
              <input type="number" min={0.01} step="0.1" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="mono w-16 border-b border-hairline bg-transparent px-1 py-0.5 text-right outline-none focus:border-ink" />
              <span className="mono text-ink-muted">HBAR per booking</span>
            </label>
            <SquareSwitch checked={autoApprove} onChange={setAutoApprove} label="Auto-approve payments within limit" />
          </div>
        </form>
      </div>
    </div>
  );
}

const ORDER: AgentStepId[] = ["understand", "discover", "compare", "claim", "pay", "confirm"];

function AgentMessage({ m, onApprove }: { m: AgentMsg; onApprove: (ok: boolean) => void }) {
  const any = Object.keys(m.steps).length > 0;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Eyebrow className="mb-4">Agent</Eyebrow>
      {!any && <span className="caret" aria-label="Agent is thinking" />}
      {any && (
        <ol className="border-l border-hairline">
          {ORDER.filter((id) => m.steps[id]).map((id) => (
            <StepRow key={id} step={m.steps[id]!}>
              {id === "pay" && m.approval && !m.approval.answered && (
                <div className="mt-3 border border-warning bg-surface-raised p-4">
                  <p className="text-[13.5px]">This payment of <Mono className="text-ink">{money(m.approval.amount)}</Mono> exceeds your spending limit. Approve it?</p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => onApprove(true)}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => onApprove(false)}>Decline</Button>
                  </div>
                </div>
              )}
            </StepRow>
          ))}
        </ol>
      )}
      {m.text && <p className="mt-6 text-[14.5px] leading-relaxed">{m.text}{!m.done && <span className="caret ml-1" />}</p>}
      {m.receipt && <div className="mt-6"><ReceiptView receipt={m.receipt} /></div>}
    </motion.div>
  );
}

function StepRow({ step, children }: { step: AgentStep; children?: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const stateLabel = { pending: "Pending", running: "Running", complete: "Complete", failed: "Failed", awaiting: "Awaiting approval" }[step.state];
  return (
    <motion.li initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="relative pb-6 pl-6 last:pb-0">
      <span className={cn("absolute -left-[4px] top-1.5 h-[7px] w-[7px] border", step.state === "complete" ? "border-ink bg-ink" : step.state === "failed" ? "border-danger bg-danger" : step.state === "awaiting" ? "border-warning bg-warning" : "border-ink bg-background")} />
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 text-left" aria-expanded={open}>
        <Mono className="text-ink-muted">{String(step.index).padStart(2, "0")}</Mono>
        <span className="flex-1 text-[14px]">{STEP_TITLES[step.id]}</span>
        <span className={cn("eyebrow", step.state === "complete" && "text-success", step.state === "failed" && "text-danger", step.state === "awaiting" && "text-warning")}>{stateLabel}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-ink-muted transition-transform", open && "rotate-180")} strokeWidth={1.25} />
      </button>
      {step.state === "running" && <ProgressLine className="mt-2" />}
      {open && step.detail && <div className="mt-3"><StepDetail step={step} /></div>}
      {children}
    </motion.li>
  );
}

function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="border border-hairline bg-surface-raised">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[140px_1fr] border-b border-hairline px-3 py-2 last:border-0">
          <dt className="eyebrow pt-0.5">{k}</dt>
          <dd className="text-[13px]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function StepDetail({ step }: { step: AgentStep }) {
  const d = step.detail as any;
  switch (step.id) {
    case "understand":
      return <KV rows={Object.entries(d).map(([k, v]) => [k, String(v)])} />;
    case "discover":
      return <p className="text-[13px] text-ink-muted">Queried {d.source} with <Mono className="text-ink">{d.query}</Mono>. <Mono className="text-ink">{d.results}</Mono> matching entities.</p>;
    case "compare":
      return (
        <div>
          <div className="overflow-x-auto border border-hairline bg-surface-raised">
            <table className="w-full min-w-[480px] text-left text-[13px]">
              <thead><tr className="border-b border-hairline">{["Provider", "Type", "Price", "Rating", "Next slot"].map((h) => <th key={h} className="eyebrow px-3 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {d.candidates.map((c: any) => (
                  <tr key={c.id} className={cn("relative border-b border-hairline last:border-0", c.id === d.recommended && "bg-surface")}>
                    <td className="relative px-3 py-2">{c.id === d.recommended && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}{c.name}</td>
                    <td className="px-3 py-2"><TypeTag type={c.type} /></td>
                    <td className="mono px-3 py-2">{c.price.toFixed(2)}</td>
                    <td className="mono px-3 py-2">{c.rating.toFixed(1)}</td>
                    <td className="mono px-3 py-2">{dt(c.nextSlot)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12.5px] text-ink-muted">{d.reason}</p>
        </div>
      );
    case "claim":
      return <KV rows={[["Provider", d.provider], ["Slot", <Mono key="s">{dt(d.slot)}</Mono>], ["Claim ID", <Mono key="c">{d.claimId}</Mono>], ["Held for", <Countdown key="h" until={d.expiresAt} className="text-warning" />]]} />;
    case "pay": {
      const p = d.payment as PaymentRequirements;
      return (
        <div className="space-y-2">
          <pre className="mono overflow-x-auto border border-hairline bg-surface-raised p-3 text-[12px] leading-relaxed">
{`HTTP/1.1 402 Payment Required
amount       ${p.amount}
token        ${p.token}
network      ${p.network}
payTo        ${p.payTo}
facilitator  ${p.facilitator}
scheme       ${p.scheme}`}
          </pre>
          {d.phase && (
            <div className="flex flex-wrap gap-x-5 text-[12.5px]">
              {["challenge", "signing", "settled"].map((ph, i) => {
                const idx = ["challenge", "signing", "settled"].indexOf(d.phase);
                return <span key={ph} className={i <= idx ? "text-ink" : "text-ink-muted"}>{["Challenge received", "Signing", "Settled"][i]}</span>;
              })}
            </div>
          )}
          {d.txId && <div className="text-[12.5px]">Transaction <TxLink txId={d.txId} /></div>}
          {d.reason && <p className="text-[12.5px] text-danger">{d.reason}</p>}
        </div>
      );
    }
    case "confirm":
      return <p className="text-[13px] text-ink-muted">Booking <Mono className="text-ink">{d.receipt.bookingRef}</Mono> confirmed with the provider.</p>;
  }
}

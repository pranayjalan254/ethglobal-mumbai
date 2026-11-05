import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CopyButton, Eyebrow, Mono, PageHeader, Segmented, SquareSwitch } from "@/components/sp/primitives";

export const Route = createFileRoute("/provider/settings")({ component: Settings });

function Settings() {
  const { walletAddress, user } = useAuth();
  const [currency, setCurrency] = useState<"USDC" | "HBAR">("USDC");
  const [agents, setAgents] = useState(true);
  const [autoRenew, setAutoRenew] = useState(false);
  const rows: [string, React.ReactNode][] = [
    ["Owner wallet", <span className="inline-flex items-center gap-1"><Mono className="break-all">{walletAddress}</Mono><CopyButton value={walletAddress ?? ""} /></span>],
    ["Signed in with", user?.email ?? "Wallet"],
    ["Default payout currency", <div className="w-48"><Segmented label="Currency" value={currency} onChange={setCurrency} options={[{ value: "USDC", label: "USDC" }, { value: "HBAR", label: "HBAR" }]} /></div>],
    ["Accept bookings from agents", <SquareSwitch checked={agents} onChange={setAgents} label={agents ? "On" : "Off"} />],
    ["Auto-renew listings", <SquareSwitch checked={autoRenew} onChange={setAutoRenew} label={autoRenew ? "On" : "Off"} />],
    ["API base URL", <Mono className="text-ink-muted">{API_BASE_URL}</Mono>],
  ];
  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings" />
      <dl className="border-t border-ink">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-2 border-b border-hairline py-5 md:grid-cols-3">
            <dt><Eyebrow>{k}</Eyebrow></dt>
            <dd className="md:col-span-2">{v}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

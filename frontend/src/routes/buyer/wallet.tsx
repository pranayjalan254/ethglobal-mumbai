import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getWalletBalance, getWalletTransactions } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dt } from "@/lib/format";
import { CopyButton, Empty, ErrorBlock, Eyebrow, Mono, PageHeader, RuledTable, SkeletonRows, TxLink } from "@/components/sp/primitives";

export const Route = createFileRoute("/buyer/wallet")({ component: Wallet });

function Wallet() {
  const { walletAddress } = useAuth();
  const tx = useQuery({ queryKey: ["wallet-tx", walletAddress], queryFn: () => getWalletTransactions(walletAddress ?? undefined) });
  const bal = useQuery({ queryKey: ["wallet-bal", walletAddress], queryFn: () => getWalletBalance(walletAddress ?? undefined), refetchInterval: 10000 });

  const usdcBal = bal.data ? bal.data.usdc.toFixed(2) : "0.00";
  const hbarBal = bal.data ? bal.data.hbar.toLocaleString() : "0.0";

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6 md:py-14">
      <PageHeader eyebrow="Wallet" title="Embedded wallet" />
      <div className="grid gap-px border border-hairline bg-hairline md:grid-cols-3">
        <div className="bg-surface-raised p-6 md:col-span-1">
          <Eyebrow>Address</Eyebrow>
          <div className="mt-3 flex items-start gap-1"><Mono className="break-all text-[13.5px]">{walletAddress}</Mono><CopyButton value={walletAddress ?? ""} /></div>
        </div>
        <div className="bg-surface-raised p-6"><Eyebrow>USDC</Eyebrow><div className="mt-3 font-serif text-5xl font-light">{usdcBal}</div></div>
        <div className="bg-surface-raised p-6"><Eyebrow>HBAR</Eyebrow><div className="mt-3 font-serif text-5xl font-light">{hbarBal}</div></div>
      </div>
      <p className="mt-3 text-[12.5px] text-ink-muted">Live balances queried from Hedera Testnet for this wallet address.</p>

      <div className="mt-12 grid gap-10 md:grid-cols-2">
        <section>
          <h2 className="mb-4 text-2xl">Deposit</h2>
          <ol className="border-t border-hairline">
            {["Send USDC or HBAR on Hedera testnet to the address above.", "Use the Hedera token ID 0.0.429274 for USDC.", "Funds appear here after one confirmation, usually within five seconds."].map((t, i) => (
              <li key={i} className="flex gap-4 border-b border-hairline py-3"><Mono className="text-accent">0{i + 1}</Mono><span className="text-ink-muted">{t}</span></li>
            ))}
          </ol>
        </section>
        <section className="border-l-2 border-accent bg-surface-raised p-5 self-start">
          <Eyebrow className="mb-2">Agent payments</Eyebrow>
          <p className="text-ink-muted">When supported, network fees for x402 payments made by your agent are sponsored by the facilitator. You only pay the listed service price, within the spending limit you set on the Agent tab.</p>
        </section>
      </div>

      <section className="mt-14">
        <h2 className="mb-6 text-2xl">Transaction history</h2>
        {tx.isLoading ? <SkeletonRows /> : tx.isError ? <ErrorBlock message="Could not load transactions." /> : tx.data!.length === 0 ? <Empty title="No transactions" /> : (
          <RuledTable
            rows={tx.data!}
            rowKey={(t) => t.id}
            columns={[
              { key: "d", header: "Date", render: (t) => <Mono>{dt(t.at)}</Mono> },
              { key: "l", header: "Description", render: (t) => t.label },
              { key: "a", header: "Amount", render: (t) => <Mono>{t.amount.toFixed(2)} {t.currency}</Mono> },
              { key: "x", header: "Transaction", render: (t) => <TxLink txId={t.id} /> },
            ]}
          />
        )}
      </section>
    </div>
  );
}

import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { readStoredAuth } from "@/lib/auth-storage";
import { AccountMenu, WalletChip } from "@/components/sp/account-menu";
import { Wordmark } from "@/components/sp/primitives";

export const Route = createFileRoute("/buyer")({
  ssr: false,
  beforeLoad: () => {
    const a = readStoredAuth();
    if (!a.walletAddress) throw redirect({ to: "/onboarding", search: { role: "buyer" } });
    if (a.role !== "buyer") throw redirect({ to: "/provider" });
  },
  head: () => ({
    meta: [
      { title: "Buyer — SlotPay" },
      { name: "description", content: "Discover, book and pay for services yourself or through an agent." },
      { property: "og:title", content: "Buyer — SlotPay" },
      { property: "og:description", content: "Discover, book and pay for services." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BuyerLayout,
});

const TABS = [
  { to: "/buyer", label: "Agent", exact: true },
  { to: "/buyer/marketplace", label: "Marketplace" },
  { to: "/buyer/bookings", label: "Bookings" },
  { to: "/buyer/wallet", label: "Wallet" },
] as const;

function BuyerLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-hairline bg-background">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex items-center gap-10">
            <Wordmark />
            <nav className="hidden h-16 items-stretch gap-7 md:flex">
              {TABS.map((t) => (
                <Link key={t.to} to={t.to} activeOptions={{ exact: "exact" in t }} className="relative flex items-center text-[13.5px] text-ink-muted transition-colors hover:text-ink data-[status=active]:text-ink">
                  {({ isActive }) => (<>{t.label}{isActive && <span className="absolute inset-x-0 -bottom-px h-px bg-ink" />}</>)}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline"><WalletChip /></span>
            <AccountMenu />
          </div>
        </div>
        <nav className="flex overflow-x-auto border-t border-hairline md:hidden">
          {TABS.map((t) => (
            <Link key={t.to} to={t.to} activeOptions={{ exact: "exact" in t }} className="flex-1 border-r border-hairline px-3 py-2.5 text-center text-[13px] text-ink-muted last:border-r-0 data-[status=active]:bg-surface data-[status=active]:text-ink">
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="enter flex flex-1 flex-col"><Outlet /></div>
    </div>
  );
}

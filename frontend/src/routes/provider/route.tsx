import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { readStoredAuth } from "@/lib/auth-storage";
import { AccountMenu, WalletChip } from "@/components/sp/account-menu";
import { Wordmark } from "@/components/sp/primitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/provider")({
  ssr: false,
  beforeLoad: () => {
    const a = readStoredAuth();
    if (!a.walletAddress) throw redirect({ to: "/onboarding", search: { role: "provider" } });
    if (a.role !== "provider") throw redirect({ to: "/buyer" });
  },
  head: () => ({
    meta: [
      { title: "Provider - OASIS Protocol" },
      { name: "description", content: "Manage services, availability and bookings on OASIS Protocol." },
      { property: "og:title", content: "Provider - OASIS Protocol" },
      { property: "og:description", content: "Manage services, availability and bookings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProviderLayout,
});

const NAV = [
  { to: "/provider", label: "Overview", exact: true },
  { to: "/provider/services", label: "My Services" },
  { to: "/provider/availability", label: "Availability" },
  { to: "/provider/bookings", label: "Bookings" },
  { to: "/provider/portfolio", label: "Portfolio" },
  { to: "/provider/profile", label: "Profile" },
  { to: "/provider/settings", label: "Settings" },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col">
      {NAV.map((n) => (
        <Link
          key={n.to}
          to={n.to}
          activeOptions={{ exact: "exact" in n }}
          onClick={onNavigate}
          className="relative border-b border-hairline px-6 py-3 text-[13.5px] text-ink-muted transition-colors duration-150 hover:bg-background hover:text-ink data-[status=active]:bg-background data-[status=active]:text-ink"
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
              {n.label}
            </>
          )}
        </Link>
      ))}
    </nav>
  );
}

function ProviderLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-hairline bg-surface lg:flex">
        <div className="flex h-16 items-center border-b border-hairline px-6"><Wordmark /></div>
        <div className="eyebrow px-6 pb-2 pt-6">Provider</div>
        <div className="border-t border-hairline"><NavLinks /></div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-hairline bg-background px-4 md:px-8">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" aria-label="Open navigation" onClick={() => setOpen((o) => !o)}>
              {open ? <X className="h-4 w-4" strokeWidth={1.25} /> : <Menu className="h-4 w-4" strokeWidth={1.25} />}
            </button>
            <span className="lg:hidden"><Wordmark /></span>
          </div>
          <div className="flex items-center gap-3">
            <span className="eyebrow hidden md:inline">Owner</span>
            <WalletChip />
            <AccountMenu />
          </div>
        </header>
        <div className={cn("border-b border-hairline bg-surface lg:hidden", open ? "block" : "hidden")}>
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
        <main className="enter mx-auto max-w-[1200px] px-4 py-10 md:px-8 md:py-14">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

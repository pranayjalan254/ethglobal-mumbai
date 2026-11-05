import { useNavigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { shortAddr } from "@/lib/format";
import { CopyButton } from "./primitives";

export function WalletChip() {
  const { walletAddress } = useAuth();
  if (!walletAddress) return null;
  return (
    <span className="inline-flex items-center gap-1 border border-hairline bg-surface-raised py-1 pl-2.5 pr-1">
      <span className="mono">{shortAddr(walletAddress)}</span>
      <CopyButton value={walletAddress} label="Copy wallet address" />
    </span>
  );
}

export function AccountMenu() {
  const { walletAddress, role, setRole, logout, user } = useAuth();
  const navigate = useNavigate();
  const other = role === "provider" ? "buyer" : "provider";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 border border-hairline px-3 py-1.5 text-[12.5px] transition-colors hover:border-ink">
        Account <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.25} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 border-hairline bg-surface-raised p-0">
        <DropdownMenuLabel className="border-b border-hairline px-3 py-3 font-normal">
          <div className="eyebrow">Signed in as {role}</div>
          <div className="mono mt-1 break-all text-ink">{walletAddress}</div>
          {user?.email && <div className="mt-1 text-[12px] text-ink-muted">{user.email}</div>}
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="px-3 py-2.5"
          onClick={() => {
            setRole(other);
            navigate({ to: other === "provider" ? "/provider" : "/buyer" });
          }}
        >
          Switch role to {other}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="m-0 bg-hairline" />
        <DropdownMenuItem
          className="px-3 py-2.5"
          onClick={async () => {
            await logout();
            navigate({ to: "/onboarding", replace: true });
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

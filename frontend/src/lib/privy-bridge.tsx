import { useEffect } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { useAuth } from "./auth";

function Bridge() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const auth = useAuth();

  useEffect(() => {
    auth._registerBridge({
      login: (method) => login({ loginMethods: [method] }),
      logout: () => logout(),
    });
    return () => auth._registerBridge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [login, logout]);

  useEffect(() => {
    auth._setReady(ready);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    const address = user?.wallet?.address ?? wallets[0]?.address;
    if (address && address !== auth.walletAddress) {
      auth._onAuthenticated(address, user?.google?.email ?? user?.email?.address ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated, user, wallets]);

  return null;
}

export default function PrivyBridge({ appId }: { appId: string }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["google", "wallet"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        appearance: { theme: "light", accentColor: "#1F1B16", showWalletLoginFirst: false },
      }}
    >
      <Bridge />
    </PrivyProvider>
  );
}

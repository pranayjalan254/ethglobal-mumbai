import { useEffect } from "react";
import {
  PrivyProvider,
  usePrivy,
  useWallets,
  useLogin,
  useLogout,
  useConnectOrCreateWallet,
} from "@privy-io/react-auth";
import { useAuth } from "./auth";

function Bridge() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const auth = useAuth();

  const { login } = useLogin({
    onComplete: ({ user: u, isNewUser }) => {
      const address = u.wallet?.address ?? wallets[0]?.address;
      if (address) {
        auth._onAuthenticated(
          address,
          u.google?.email ?? u.email?.address ?? null,
        );
      }
      if (isNewUser) {
        // New users will continue through the onboarding flow naturally
        console.log("[SlotPay] New user registered via Privy");
      }
    },
    onError: (err) => {
      console.error("[SlotPay] Privy login error", err);
    },
  });

  const { logout } = useLogout({
    onSuccess: () => {
      console.log("[SlotPay] Logged out");
    },
  });

  const { connectOrCreateWallet } = useConnectOrCreateWallet({
    onSuccess: ({ wallet }) => {
      auth._onAuthenticated(wallet.address, null);
    },
    onError: (err) => {
      console.error("[SlotPay] Wallet connect error", err);
    },
  });

  // Wire the bridge API into the AuthContext
  useEffect(() => {
    auth._registerBridge({
      login: (method) => {
        if (method === "wallet") {
          connectOrCreateWallet();
        } else {
          // Open Privy modal scoped to the requested login method
          login({ loginMethods: [method] });
        }
      },
      logout: async () => {
        logout();
      },
    });
    return () => auth._registerBridge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [login, logout, connectOrCreateWallet]);

  // Propagate Privy's ready state so the UI can enable/disable auth buttons
  useEffect(() => {
    auth._setReady(ready);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Sync already-authenticated session (e.g. page refresh with active session)
  useEffect(() => {
    if (!ready || !authenticated) return;
    const address = user?.wallet?.address ?? wallets[0]?.address;
    if (address && address !== auth.walletAddress) {
      auth._onAuthenticated(
        address,
        user?.google?.email ?? user?.email?.address ?? null,
      );
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
        // Supported login methods shown in the Privy modal
        loginMethods: ["google", "wallet"],
        embeddedWallets: {
          ethereum: {
            // Automatically create an embedded wallet for users who sign in
            // without an existing wallet (e.g. Google OAuth users)
            createOnLogin: "users-without-wallets",
          },
        },
        appearance: {
          theme: "light",
          accentColor: "#1F1B16",
          showWalletLoginFirst: false,
        },
      }}
    >
      <Bridge />
    </PrivyProvider>
  );
}

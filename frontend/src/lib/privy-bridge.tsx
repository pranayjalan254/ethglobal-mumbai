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
import { arkivChain } from "./arkiv";
import { hederaTestnet } from "viem/chains";

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
          // "email" — open Privy modal scoped to email OTP (no OAuth needed)
          login({ loginMethods: ["email"] });
        }
      },
      logout: async () => {
        logout();
      },
      getEthereumProvider: async (targetChainId?: number) => {
        const targetWallet =
          wallets.find(
            (w) => w.address.toLowerCase() === auth.walletAddress?.toLowerCase(),
          ) ?? wallets[0];

        const reqChainId = targetChainId ?? arkivChain.id;

        if (targetWallet) {
          try {
            const currentChain = targetWallet.chainId;
            if (
              currentChain !== `eip155:${reqChainId}` &&
              (currentChain as any) !== reqChainId
            ) {
              await targetWallet.switchChain(reqChainId);
            }
          } catch (switchErr) {
            console.warn("[SlotPay] Privy switchChain notice:", switchErr);
            // Throw so the UI can tell the user clearly
            throw new Error(
              `Could not switch your Privy wallet to Arkiv Rabdi (chain ${arkivChain.id}). ` +
              `Please accept the network switch in Privy and try again. ` +
              `(${switchErr?.message ?? switchErr})`
            );
          }
        }

        return await targetWallet.getEthereumProvider();
      },
    });
    return () => auth._registerBridge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [login, logout, connectOrCreateWallet, wallets, auth.walletAddress]);

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
        defaultChain: hederaTestnet,
        supportedChains: [arkivChain, hederaTestnet],
        // Supported login methods shown in the Privy modal
        loginMethods: ["email", "wallet"],
        embeddedWallets: {
          showWalletUIs: false,
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

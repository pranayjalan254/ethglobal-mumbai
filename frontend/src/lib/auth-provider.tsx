import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ClientOnly } from "@tanstack/react-router";
import {
  EMPTY_STORED_AUTH,
  readStoredAuth,
  writeStoredAuth,
  type StoredAuth,
} from "./auth-storage";
import {
  AuthContext,
  type AuthContextValue,
  type PrivyBridgeApi,
} from "./auth";

const PRIVY_APP_ID = import.meta.env["VITE_PRIVY_APP_ID"] as string | undefined;
const PrivyBridge = lazy(() => import("./privy-bridge"));

function mockWallet() {
  let s = "0x";
  const c = "0123456789abcdef";
  for (let i = 0; i < 40; i++) s += c[Math.floor(Math.random() * 16)];
  return s;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredAuth>(EMPTY_STORED_AUTH);
  const [hydrated, setHydrated] = useState(false);
  const [privyReady, setPrivyReady] = useState(!PRIVY_APP_ID);
  const bridge = useRef<PrivyBridgeApi | null>(null);

  useEffect(() => {
    setState(readStoredAuth());
    setHydrated(true);
  }, []);

  const update = useCallback((patch: Partial<StoredAuth>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      writeStoredAuth(next);
      return next;
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.walletAddress ? { email: state.email } : null,
      walletAddress: state.walletAddress,
      role: state.role,
      profile: state.profile,
      isReady: hydrated && privyReady,
      usingPrivy: !!PRIVY_APP_ID,
      login: (method = "email") => {
        if (bridge.current) return bridge.current.login(method);
        // Demo fallback when VITE_PRIVY_APP_ID is not configured.
        setTimeout(
          () =>
            update({
              walletAddress: mockWallet(),
              email: method === "email" ? "demo@slotpay.network" : null,
            }),
          900,
        );
      },
      logout: async () => {
        await bridge.current?.logout();
        update({ walletAddress: null, email: null });
      },
      getEthereumProvider: async (chainId?: number) => {
        if (bridge.current?.getEthereumProvider) {
          return await bridge.current.getEthereumProvider(chainId);
        }
        // No Privy bridge — should not happen in production
        throw new Error("No Privy wallet connected. Please log in with Privy to publish to Arkiv.");
      },
      setRole: (role) => update({ role }),
      setProfile: (profile) => update({ profile }),
      _onAuthenticated: (walletAddress, email) => update({ walletAddress, email }),
      _registerBridge: (api) => {
        bridge.current = api;
      },
      _setReady: setPrivyReady,
    }),
    [state, hydrated, privyReady, update],
  );

  return (
    <AuthContext.Provider value={value}>
      {PRIVY_APP_ID ? (
        <ClientOnly fallback={null}>
          <Suspense fallback={null}>
            <PrivyBridge appId={PRIVY_APP_ID} />
          </Suspense>
        </ClientOnly>
      ) : null}
      {children}
    </AuthContext.Provider>
  );
}


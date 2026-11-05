import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ClientOnly } from "@tanstack/react-router";

export type Role = "provider" | "buyer";

export interface ProviderProfile {
  displayName: string;
  providerType: "human" | "ai";
  headline: string;
  bio: string;
  category: string;
}

export interface StoredAuth {
  walletAddress: string | null;
  email: string | null;
  role: Role | null;
  profile: ProviderProfile | null;
}

const KEY = "slotpay.auth.v1";
const empty: StoredAuth = { walletAddress: null, email: null, role: null, profile: null };

export function readStoredAuth(): StoredAuth {
  if (typeof window === "undefined") return empty;
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return empty;
  }
}

function writeStoredAuth(a: StoredAuth) {
  localStorage.setItem(KEY, JSON.stringify(a));
}

export interface PrivyBridgeApi {
  login: (method: "google" | "wallet") => void;
  logout: () => void | Promise<void>;
}

interface AuthContextValue {
  user: { email: string | null } | null;
  walletAddress: string | null;
  role: Role | null;
  profile: ProviderProfile | null;
  isReady: boolean;
  usingPrivy: boolean;
  login: (method?: "google" | "wallet") => void;
  logout: () => Promise<void>;
  setRole: (r: Role) => void;
  setProfile: (p: ProviderProfile) => void;
  /** internal: called by the Privy bridge */
  _onAuthenticated: (wallet: string, email: string | null) => void;
  _registerBridge: (api: PrivyBridgeApi | null) => void;
  _setReady: (r: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PRIVY_APP_ID = import.meta.env["VITE_PRIVY_APP_ID"] as string | undefined;
const PrivyBridge = lazy(() => import("./privy-bridge"));

function mockWallet() {
  let s = "0x";
  const c = "0123456789abcdef";
  for (let i = 0; i < 40; i++) s += c[Math.floor(Math.random() * 16)];
  return s;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredAuth>(empty);
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
      login: (method = "google") => {
        if (bridge.current) return bridge.current.login(method);
        // Demo fallback when VITE_PRIVY_APP_ID is not configured.
        setTimeout(() => update({ walletAddress: mockWallet(), email: method === "google" ? "demo@slotpay.network" : null }), 900);
      },
      logout: async () => {
        await bridge.current?.logout();
        update({ walletAddress: null, email: null });
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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

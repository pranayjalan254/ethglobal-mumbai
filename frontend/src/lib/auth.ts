import { createContext, useContext } from "react";
import type { ProviderProfile, Role, StoredAuth } from "./auth-storage";

export type { ProviderProfile, Role, StoredAuth };

export interface PrivyBridgeApi {
  login: (method: "email" | "wallet") => void;
  logout: () => void | Promise<void>;
  getEthereumProvider?: (chainId?: number) => Promise<any>;
}

export interface AuthContextValue {
  user: { email: string | null } | null;
  walletAddress: string | null;
  role: Role | null;
  profile: ProviderProfile | null;
  isReady: boolean;
  usingPrivy: boolean;
  login: (method?: "email" | "wallet") => void;
  logout: () => Promise<void>;
  getEthereumProvider: (chainId?: number) => Promise<any>;
  setRole: (r: Role) => void;
  setProfile: (p: ProviderProfile) => void;
  /** internal: called by the Privy bridge */
  _onAuthenticated: (wallet: string, email: string | null) => void;
  _registerBridge: (api: PrivyBridgeApi | null) => void;
  _setReady: (r: boolean) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}


/**
 * Authentication storage utilities and types for OASIS.
 * Separated from auth.tsx for React Fast Refresh compatibility.
 */

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

export const AUTH_STORAGE_KEY = "slotpay.auth.v1";
export const EMPTY_STORED_AUTH: StoredAuth = {
  walletAddress: null,
  email: null,
  role: null,
  profile: null,
};

export function readStoredAuth(): StoredAuth {
  if (typeof window === "undefined") return EMPTY_STORED_AUTH;
  try {
    return { ...EMPTY_STORED_AUTH, ...JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? "{}") };
  } catch {
    return EMPTY_STORED_AUTH;
  }
}

export function writeStoredAuth(auth: StoredAuth): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  } catch (err) {
    console.warn("[OASIS] Could not write to localStorage:", err);
  }
}


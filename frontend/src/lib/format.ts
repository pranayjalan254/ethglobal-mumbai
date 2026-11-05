import { format } from "date-fns";

export const shortAddr = (a?: string | null) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");
export const shortHash = (h: string, n = 10) => (h.length > n * 2 ? `${h.slice(0, n)}...${h.slice(-6)}` : h);
export const money = (n: number, c = "USDC") => `${n.toFixed(2)} ${c}`;
export const dt = (iso: string) => format(new Date(iso), "EEE d MMM, HH:mm");
export const dateOnly = (iso: string) => format(new Date(iso), "d MMM yyyy");
export const kb = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
export const pad = (n: number) => String(n).padStart(2, "0");

export const bookingTone = (s: string) =>
  (s === "confirmed" ? "success" : s === "completed" ? "ink" : s === "pending" ? "warning" : "danger") as "success" | "ink" | "warning" | "danger";

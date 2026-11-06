import { format } from "date-fns";

export function parseDateSafely(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "number") {
    // If small number (< year 2000 in seconds), it's a block height, not a timestamp
    if (val < 946_684_800) return null;
    const ms = val < 1e11 ? val * 1000 : val;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed || trimmed === "—") return null;
    // Check if numeric string (epoch timestamp vs block number)
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (num < 946_684_800) return null; // Block height
      const ms = num < 1e11 ? num * 1000 : num;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export const shortAddr = (a?: string | null) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");
export const shortHash = (h: string, n = 10) => (h.length > n * 2 ? `${h.slice(0, n)}...${h.slice(-6)}` : h);
export const money = (n: number, c = "HBAR") => `${n.toFixed(2)} ${c}`;
export const dt = (iso?: unknown) => {
  const d = parseDateSafely(iso);
  return d ? format(d, "EEE d MMM, HH:mm") : "—";
};
export const dateOnly = (iso?: unknown) => {
  const d = parseDateSafely(iso);
  return d ? format(d, "d MMM yyyy") : "—";
};
export const formatExpiration = (val?: unknown) => {
  if (!val) return "—";
  if (typeof val === "number" || (typeof val === "string" && /^\d+$/.test(String(val).trim()))) {
    const n = Number(val);
    if (n < 946_684_800) {
      return `Block #${n.toLocaleString()}`;
    }
  }
  const d = parseDateSafely(val);
  return d && d.getFullYear() > 2000 ? format(d, "d MMM yyyy") : "—";
};
export const kb = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
export const pad = (n: number) => String(n).padStart(2, "0");

export const bookingTone = (s: string) =>
  (s === "confirmed" ? "success" : s === "completed" ? "ink" : s === "pending" ? "warning" : "danger") as "success" | "ink" | "warning" | "danger";

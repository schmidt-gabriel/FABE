import PocketBase from "pocketbase";

// "/" → root-relative to the current origin. Using "" would make the SDK
// resolve API paths relative to the current route (e.g. "/lucros/api/..."),
// which breaks on nested routes. In dev, Vite proxies /api and /_ to the
// backend; in production PocketBase serves the SPA, so same origin works too.
export const pb = new PocketBase("/");

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const usd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD" });

// PocketBase stores datetimes; we work with calendar dates in the UI.
// "2026-06-26 12:00:00.000Z" -> "2026-06-26" for <input type="date">.
export const toDateInput = (pbDate?: string) => (pbDate ? pbDate.slice(0, 10) : "");

// "2026-06-26" -> ISO string PocketBase accepts (noon UTC avoids TZ drift).
export const fromDateInput = (value: string) =>
  value ? `${value} 12:00:00.000Z` : "";

// "2026-06-26 ..." -> "26/06/2026" for display.
export const fmtDate = (pbDate?: string) => {
  if (!pbDate) return "";
  const [y, m, d] = pbDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

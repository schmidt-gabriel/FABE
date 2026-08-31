import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// During dev, proxy PocketBase routes to the backend so the browser talks to
// the SPA origin only. In production the SPA is served by PocketBase itself.
const backend = process.env.FABE_BACKEND_URL || "http://localhost:8090";

// Hostnames the dev server may be served under (e.g. a Kubernetes Ingress
// host). Vite 6 rejects unknown Host headers, so list them via
// FABE_ALLOWED_HOSTS
// (comma-separated). Empty keeps Vite's default (localhost + IPs).
const allowedHosts = (process.env.FABE_ALLOWED_HOSTS || "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: allowedHosts.length ? allowedHosts : undefined,
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      "/_": { target: backend, changeOrigin: true },
    },
  },
});

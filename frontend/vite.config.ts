import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// During dev, proxy PocketBase routes to the backend so the browser talks to
// the SPA origin only. In production the SPA is served by PocketBase itself.
const backend = process.env.BACKEND_URL || "http://localhost:8090";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      "/_": { target: backend, changeOrigin: true },
    },
  },
});

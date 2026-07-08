import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tailwind v4 is wired via its first-party Vite plugin (no PostCSS, no tailwind.config.js).
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    // Live mode calls the FastAPI backend; proxy /api to it in dev.
    // Override with LAB4_API_PROXY (e.g. a scratch backend on another port).
    proxy: {
      "/api": loadEnv(mode, ".", "LAB4_").LAB4_API_PROXY || "http://localhost:8787",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
}));

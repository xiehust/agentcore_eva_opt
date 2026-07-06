import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tailwind v4 is wired via its first-party Vite plugin (no PostCSS, no tailwind.config.js).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Live mode calls the FastAPI backend; proxy /api to it in dev.
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// GitHub Pages project sites live at /<repo>/ — set VITE_BASE in CI.
export default defineConfig({
  plugins: [react()],
  root: "client",
  base: process.env.VITE_BASE || "/",
  resolve: {
    alias: {
      "@voice": path.join(rootDir, "voice"),
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
});

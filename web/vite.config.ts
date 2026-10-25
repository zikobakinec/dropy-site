import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Builds straight into the repo root, which GitHub Pages serves. Never
// empties it: the SEO pages, /yukle and assets/seo.css live there too.
export default defineConfig({
  root: __dirname,
  base: "/",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, ".."),
    emptyOutDir: false,
    assetsDir: "assets/web",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        destek: resolve(__dirname, "destek/index.html"),
      },
    },
  },
});

import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  build: {
    // Large language/syntax assets are intentionally emitted as lazy chunks.
    // Keep warning signal meaningful for real regressions in eagerly loaded code.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@pierre/diffs")) {
            return "vendor-pierre";
          }
          if (id.includes("node_modules/marked") || id.includes("node_modules/dompurify")) {
            return "vendor-markdown";
          }
          if (id.includes("node_modules/sv-router")) {
            return "vendor-router";
          }
          return undefined;
        },
      },
    },
  },
  define: {
    "import.meta.env.VAPID_PUBLIC_KEY": JSON.stringify(process.env.VAPID_PUBLIC_KEY ?? ""),
    "import.meta.env.VITE_ZANE_LOCAL": JSON.stringify(process.env.VITE_ZANE_LOCAL ?? ""),
  },
});

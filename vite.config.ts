import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  define: {
    "import.meta.env.VAPID_PUBLIC_KEY": JSON.stringify(process.env.VAPID_PUBLIC_KEY ?? ""),
    "import.meta.env.VITE_ZANE_LOCAL": JSON.stringify(process.env.VITE_ZANE_LOCAL ?? ""),
  },
});

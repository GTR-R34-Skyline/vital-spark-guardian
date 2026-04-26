import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    appType: "spa",
    build: {
      outDir: "dist/client",
      rollupOptions: {
        input: "/index.html"
      }
    }
  }
});

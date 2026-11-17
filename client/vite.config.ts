import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envDir: fileURLToPath(new URL("../", import.meta.url)),
  server: { port: 5173, strictPort: true },
  build: { rollupOptions: { input: {
    game: fileURLToPath(new URL("./index.html", import.meta.url)),
    map: fileURLToPath(new URL("./map-preview.html", import.meta.url)),
  } } },
});
